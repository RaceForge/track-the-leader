import { Injectable, signal } from '@angular/core';
import { type Point2D, type Homography } from '../types/geometry';

export type { Point2D, Homography };

/**
 * OpenCV match object representing correspondence between features
 */
interface CVMatch {
	queryIdx: number; // Index in current frame keypoints
	trainIdx: number; // Index in reference frame keypoints
	distance: number; // Feature distance (lower = better match)
}

/**
 * OpenCV keypoint with 2D coordinate
 */
interface CVKeypoint {
	pt: { x: number; y: number };
}

/**
 * Base interface for OpenCV objects that need memory management
 */
interface CVObject {
	delete: () => void;
	empty?: () => boolean;
	size?: () => number;
	get?: (index: number) => CVKeypoint;
	doubleAt?: (row: number, col: number) => number;
}

// biome-ignore lint: OpenCV global is loaded dynamically
declare const cv: any;

/**
 * Camera motion stabilization service using homography transformations.
 *
 * This service computes per-frame homography matrices to compensate for camera movement,
 * allowing a track line defined in one frame to be accurately rendered in other frames
 * even as the camera pans, tilts, or zooms.
 *
 * Algorithm:
 * 1. User defines track line in a reference frame
 * 2. Extract ORB features (keypoints + descriptors) from reference frame
 * 3. For each subsequent frame:
 *    - Extract ORB features from current frame
 *    - Match features between current and reference using BFMatcher
 *    - Compute homography transformation using RANSAC
 *    - Apply inverse homography to map reference track line to current frame
 *
 * The homography H maps points from current frame to reference frame:
 *   p_ref = H * p_current
 *
 * To render the track line, we use H^-1 to map reference points to current frame:
 *   p_current = H^-1 * p_ref
 */
@Injectable({
	providedIn: 'root',
})
export class HomographyService {
	/** Cache of computed homographies indexed by frame number */
	readonly homographies = new Map<number, Homography>();

	/** Frame index where user defined the track line */
	readonly referenceFrameIndex = signal<number | null>(null);
	/** Pixel data of reference frame for feature extraction */
	readonly referenceFrameImage = signal<ImageData | null>(null);

	/** ORB keypoints extracted from reference frame */
	private referenceKeypoints: CVObject | null = null;
	/** ORB descriptors for reference keypoints (used for matching) */
	private referenceDescriptors: CVObject | null = null;

	/** Current video frame being processed */
	currentFrameIndex = signal<number>(0);

	/** Enable visualization of stabilized track line */
	debugMode = signal<boolean>(false);

	/** Whether OpenCV.js has finished loading */
	cvReady = signal<boolean>(false);

	constructor() {
		this.waitForOpenCV();
	}

	/**
	 * Poll for OpenCV.js global object availability.
	 *
	 * OpenCV.js is loaded asynchronously via script tag in index.html.
	 * This method checks every 100ms until cv.Mat is available, indicating
	 * the library is fully initialized and ready for feature detection.
	 *
	 * Timeout: 30 seconds
	 */
	private waitForOpenCV(): void {
		if (typeof cv !== 'undefined' && cv.Mat != null) {
			this.cvReady.set(true);
			console.log('OpenCV.js is ready');
			return;
		}

		const checkInterval = setInterval(() => {
			if (typeof cv !== 'undefined' && cv.Mat != null) {
				clearInterval(checkInterval);
				this.cvReady.set(true);
				console.log('OpenCV.js is ready');
			}
		}, 100);

		// Timeout after 30 seconds
		setTimeout(() => {
			clearInterval(checkInterval);
			if (!this.cvReady()) {
				console.error('OpenCV.js failed to load within 30 seconds');
			}
		}, 30000);
	}

	/**
	 * Set reference frame and extract ORB features for future matching.
	 *
	 * This is called when the user confirms the track line mapping.
	 * We extract up to 500 ORB (Oriented FAST and Rotated BRIEF) keypoints
	 * and their descriptors, which will be used to find correspondences
	 * in subsequent frames.
	 *
	 * ORB features are rotation-invariant and robust to lighting changes,
	 * making them suitable for video with camera motion.
	 *
	 * @param frameIndex - Video frame number where track was defined
	 * @param imageData - Pixel data from video frame (RGBA format)
	 */
	setReferenceFrame(frameIndex: number, imageData: ImageData): void {
		this.referenceFrameIndex.set(frameIndex);
		this.referenceFrameImage.set(imageData);

		if (!this.cvReady()) {
			console.warn('OpenCV not ready, cannot extract reference features');
			return;
		}

		try {
			// Extract features from reference frame
			const mat = cv.matFromImageData(imageData);
			const gray = new cv.Mat();
			cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

			// Use ORB detector
			const orb = new cv.ORB(500);
			this.referenceKeypoints = new cv.KeyPointVector();
			this.referenceDescriptors = new cv.Mat();

			orb.detectAndCompute(
				gray,
				new cv.Mat(),
				this.referenceKeypoints,
				this.referenceDescriptors,
			);

			console.log(
				`Reference frame set to index ${frameIndex}, features: ${this.referenceKeypoints?.size?.() || 0}`,
			);

			// Cleanup
			mat.delete();
			gray.delete();
			orb.delete();
		} catch (error) {
			console.error('Error extracting reference features:', error);
		}
	}

	/**
	 * Compute identity homography (no transformation) for reference frame
	 */
	private getIdentityHomography(): Homography {
		return [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		];
	}

	/**
	 * Compute homography transformation from current frame to reference frame.
	 *
	 * Process:
	 * 1. Extract ORB features from current frame
	 * 2. Match features with reference frame using BFMatcher (Brute Force Matcher)
	 * 3. Filter matches by distance threshold (< 50 pixels)
	 * 4. Compute homography using RANSAC (Random Sample Consensus)
	 * 5. Cache result for this frame
	 *
	 * RANSAC ensures robust homography estimation by:
	 * - Randomly sampling 4 point correspondences
	 * - Computing candidate homography
	 * - Counting inliers (points that fit model within 5px)
	 * - Repeating until best model found
	 *
	 * Fallback behavior:
	 * - Not enough keypoints (< 4): Use previous frame's homography
	 * - Not enough good matches (< 4): Use previous frame's homography
	 * - Homography computation fails: Use previous frame's homography
	 * - No previous homography: Return identity matrix (no transformation)
	 *
	 * @param frameIndex - Current video frame number
	 * @param currentImage - Pixel data from current frame (RGBA format)
	 * @returns 3x3 homography matrix mapping current -> reference coordinates
	 */
	computeHomography(frameIndex: number, currentImage: ImageData): Homography {
		// For reference frame, return identity
		if (frameIndex === this.referenceFrameIndex()) {
			const identity = this.getIdentityHomography();
			this.homographies.set(frameIndex, identity);
			return identity;
		}

		// If OpenCV not ready or no reference features, return identity
		if (
			!this.cvReady() ||
			!this.referenceDescriptors ||
			this.referenceDescriptors.empty?.()
		) {
			const identity = this.getIdentityHomography();
			this.homographies.set(frameIndex, identity);
			return identity;
		}

		try {
			// Convert current frame to Mat
			const currentMat = cv.matFromImageData(currentImage);
			const currentGray = new cv.Mat();
			cv.cvtColor(currentMat, currentGray, cv.COLOR_RGBA2GRAY);

			// Detect features in current frame
			const orb = new cv.ORB(500);
			const currentKeypoints = new cv.KeyPointVector();
			const currentDescriptors = new cv.Mat();

			orb.detectAndCompute(
				currentGray,
				new cv.Mat(),
				currentKeypoints,
				currentDescriptors,
			);

			if (currentDescriptors.empty() || currentKeypoints.size() < 4) {
				console.warn('Not enough keypoints in current frame');
				this.cleanup([currentMat, currentGray, currentDescriptors, orb]);
				currentKeypoints.delete();
				return this.getLastValidHomography(frameIndex);
			}

			// Match features using BFMatcher
			const bf = new cv.BFMatcher(cv.NORM_HAMMING, true);
			const matches = new cv.DMatchVector();

			bf.match(currentDescriptors, this.referenceDescriptors, matches);

			// Filter good matches
			const goodMatches: CVMatch[] = [];
			const matchThreshold = 50;

			for (let i = 0; i < matches.size(); i++) {
				const match = matches.get(i);
				if (match.distance < matchThreshold) {
					goodMatches.push(match);
				}
			}

			if (goodMatches.length < 4) {
				console.warn(
					`Only ${goodMatches.length} good matches, need at least 4`,
				);
				this.cleanup([
					currentMat,
					currentGray,
					currentDescriptors,
					matches,
					orb,
					bf,
				]);
				currentKeypoints.delete();
				return this.getLastValidHomography(frameIndex);
			}

			// Extract point correspondences
			const srcPoints: number[] = [];
			const dstPoints: number[] = [];

			for (const match of goodMatches) {
				const currentKp = currentKeypoints.get(match.queryIdx);
				const refKp = this.referenceKeypoints?.get?.(match.trainIdx);
				if (currentKp?.pt && refKp?.pt) {
					srcPoints.push(currentKp.pt.x, currentKp.pt.y);
					dstPoints.push(refKp.pt.x, refKp.pt.y);
				}
			} // Create OpenCV point matrices
			const srcMat = cv.matFromArray(
				goodMatches.length,
				1,
				cv.CV_32FC2,
				srcPoints,
			);
			const dstMat = cv.matFromArray(
				goodMatches.length,
				1,
				cv.CV_32FC2,
				dstPoints,
			);

			// Compute homography with RANSAC
			const H = cv.findHomography(srcMat, dstMat, cv.RANSAC, 5.0);

			if (H.empty()) {
				console.warn('Homography computation failed');
				this.cleanup([
					currentMat,
					currentGray,
					currentDescriptors,
					matches,
					srcMat,
					dstMat,
					H,
					orb,
					bf,
				]);
				currentKeypoints.delete();
				return this.getLastValidHomography(frameIndex);
			}

			// Convert to 3x3 array
			const homography: Homography = [
				[H.doubleAt(0, 0), H.doubleAt(0, 1), H.doubleAt(0, 2)],
				[H.doubleAt(1, 0), H.doubleAt(1, 1), H.doubleAt(1, 2)],
				[H.doubleAt(2, 0), H.doubleAt(2, 1), H.doubleAt(2, 2)],
			];

			// Store homography
			this.homographies.set(frameIndex, homography);

			// Cleanup
			this.cleanup([
				currentMat,
				currentGray,
				currentDescriptors,
				matches,
				srcMat,
				dstMat,
				H,
				orb,
				bf,
			]);
			currentKeypoints.delete();

			return homography;
		} catch (error) {
			console.error('Error computing homography:', error);
			return this.getLastValidHomography(frameIndex);
		}
	}

	/**
	 * Cleanup OpenCV objects
	 */
	private cleanup(objects: CVObject[]): void {
		for (const obj of objects) {
			if (obj?.delete) {
				try {
					obj.delete();
				} catch {
					// Ignore cleanup errors
				}
			}
		}
	}

	/**
	 * Get the last valid homography or return identity
	 */
	private getLastValidHomography(frameIndex: number): Homography {
		// Look back for a valid homography
		for (let i = frameIndex - 1; i >= 0; i--) {
			const H = this.homographies.get(i);
			if (H) {
				this.homographies.set(frameIndex, H);
				return H;
			}
		}
		// Return identity if no previous homography found
		const identity = this.getIdentityHomography();
		this.homographies.set(frameIndex, identity);
		return identity;
	}

	/**
	 * Get stored homography for a frame
	 */
	getHomography(frameIndex: number): Homography | null {
		return this.homographies.get(frameIndex) || null;
	}

	/**
	 * Map a point from current frame to reference frame
	 */
	mapToReference(point: Point2D, frameIndex: number): Point2D | null {
		const H = this.getHomography(frameIndex);
		if (!H) return null;
		return this.applyHomography(point, H);
	}

	/**
	 * Map a point from reference frame to current frame
	 */
	mapToCurrent(point: Point2D, frameIndex: number): Point2D | null {
		const H = this.getHomography(frameIndex);
		if (!H) return null;

		const Hinv = this.invertHomography(H);
		if (!Hinv) return null;

		return this.applyHomography(point, Hinv);
	}

	/**
	 * Transform entire track line from reference frame to current frame.
	 *
	 * This is the main method used by race-viewer to render the stabilized track line.
	 * It applies the inverse homography to each point in the track line, mapping
	 * from reference coordinates (where line was defined) to current frame coordinates
	 * (where line should be drawn).
	 *
	 * @param trackLine - Array of points defining track line in reference frame
	 * @param frameIndex - Target frame to transform line into
	 * @returns Transformed track line in current frame coordinates
	 */
	transformTrackLine(trackLine: Point2D[], frameIndex: number): Point2D[] {
		const H = this.getHomography(frameIndex);
		if (!H) return trackLine;

		const Hinv = this.invertHomography(H);
		if (!Hinv) return trackLine;

		return trackLine.map((point) => this.applyHomography(point, Hinv));
	}

	/**
	 * Apply homography transformation to a 2D point.
	 *
	 * Homography maps points using projective transformation:
	 *   [x']   [h11 h12 h13]   [x]
	 *   [y'] = [h21 h22 h23] * [y]
	 *   [w']   [h31 h32 h33]   [1]
	 *
	 * Final coordinates after perspective division:
	 *   x_final = x' / w'
	 *   y_final = y' / w'
	 *
	 * @param point - Input 2D coordinate
	 * @param H - 3x3 homography matrix
	 * @returns Transformed 2D coordinate
	 */
	private applyHomography(point: Point2D, H: Homography): Point2D {
		const x = point.x;
		const y = point.y;

		const w = H[2][0] * x + H[2][1] * y + H[2][2];
		if (Math.abs(w) < 1e-10) return point; // Avoid division by zero

		const xPrime = (H[0][0] * x + H[0][1] * y + H[0][2]) / w;
		const yPrime = (H[1][0] * x + H[1][1] * y + H[1][2]) / w;

		return { x: xPrime, y: yPrime };
	}

	/**
	 * Invert a 3x3 homography matrix using the adjugate method.
	 *
	 * To map reference points to current frame, we need the inverse:
	 *   H maps current -> reference
	 *   H^-1 maps reference -> current
	 *
	 * Inverse is computed as: H^-1 = adj(H) / det(H)
	 *
	 * @param H - Input homography matrix
	 * @returns Inverted matrix, or null if singular (determinant near zero)
	 */
	private invertHomography(H: Homography): Homography | null {
		// Calculate determinant
		const det =
			H[0][0] * (H[1][1] * H[2][2] - H[1][2] * H[2][1]) -
			H[0][1] * (H[1][0] * H[2][2] - H[1][2] * H[2][0]) +
			H[0][2] * (H[1][0] * H[2][1] - H[1][1] * H[2][0]);

		if (Math.abs(det) < 1e-10) return null; // Matrix is singular

		const invDet = 1.0 / det;

		// Calculate inverse using adjugate method
		return [
			[
				invDet * (H[1][1] * H[2][2] - H[1][2] * H[2][1]),
				invDet * (H[0][2] * H[2][1] - H[0][1] * H[2][2]),
				invDet * (H[0][1] * H[1][2] - H[0][2] * H[1][1]),
			],
			[
				invDet * (H[1][2] * H[2][0] - H[1][0] * H[2][2]),
				invDet * (H[0][0] * H[2][2] - H[0][2] * H[2][0]),
				invDet * (H[0][2] * H[1][0] - H[0][0] * H[1][2]),
			],
			[
				invDet * (H[1][0] * H[2][1] - H[1][1] * H[2][0]),
				invDet * (H[0][1] * H[2][0] - H[0][0] * H[2][1]),
				invDet * (H[0][0] * H[1][1] - H[0][1] * H[1][0]),
			],
		];
	}

	/**
	 * Clear all stored data
	 */
	clear(): void {
		this.homographies.clear();
		this.referenceFrameIndex.set(null);
		this.referenceFrameImage.set(null);
		this.currentFrameIndex.set(0);
	}
}
