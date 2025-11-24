import { Injectable, signal } from '@angular/core';

export type Point2D = { x: number; y: number };

export type Proposal = {
	id: number;
	bbox: [number, number, number, number]; // [x, y, width, height]
	centroid: Point2D;
	area: number;
};

// biome-ignore lint: OpenCV global is loaded dynamically
declare const cv: any;

/**
 * Motion-based proposal generator for RC car detection.
 *
 * This service generates candidate bounding boxes for RC cars using
 * frame differencing and morphological operations. The proposals are
 * presented to the user for confirmation before running SAM3 segmentation.
 *
 * Algorithm:
 * 1. Capture background frame (early frame or pause frame)
 * 2. Compute frame difference with current frame
 * 3. Apply threshold to create binary mask
 * 4. Morphological operations (open/close) to clean noise
 * 5. Find connected components
 * 6. Extract bounding boxes and filter by area
 * 7. Return proposals for user selection
 */
@Injectable({
	providedIn: 'root',
})
export class ProposalGeneratorService {
	/** Background reference frame for motion detection */
	private backgroundFrame: any = null; // cv.Mat

	/** Whether OpenCV.js is ready */
	cvReady = signal<boolean>(false);

	/** Minimum area threshold (pixels) */
	readonly minArea = signal<number>(500);

	/** Maximum area threshold (pixels) */
	readonly maxArea = signal<number>(50000);

	/** Difference threshold (0-255) */
	readonly diffThreshold = signal<number>(30);

	/** Next proposal ID */
	private nextProposalId = 0;

	constructor() {
		this.waitForOpenCV();
	}

	/**
	 * Poll for OpenCV.js availability.
	 */
	private waitForOpenCV(): void {
		if (typeof cv !== 'undefined' && cv.Mat != null) {
			this.cvReady.set(true);
			console.log('ProposalGenerator: OpenCV.js is ready');
			return;
		}

		const checkInterval = setInterval(() => {
			if (typeof cv !== 'undefined' && cv.Mat != null) {
				clearInterval(checkInterval);
				this.cvReady.set(true);
				console.log('ProposalGenerator: OpenCV.js is ready');
			}
		}, 100);

		// Timeout after 30 seconds
		setTimeout(() => {
			clearInterval(checkInterval);
			if (!this.cvReady()) {
				console.error(
					'ProposalGenerator: OpenCV.js failed to load within 30 seconds',
				);
			}
		}, 30000);
	}

	/**
	 * Set background reference frame for motion detection.
	 *
	 * This should be called with an early frame or a frame where no cars are moving.
	 * The background is used to compute frame differences.
	 *
	 * @param imageData - Background frame pixel data
	 */
	setBackgroundFrame(imageData: ImageData): void {
		if (!this.cvReady()) {
			console.warn('OpenCV not ready, cannot set background frame');
			return;
		}

		try {
			// Clean up old background
			if (this.backgroundFrame) {
				this.backgroundFrame.delete();
			}

			// Convert to grayscale
			const mat = cv.matFromImageData(imageData);
			this.backgroundFrame = new cv.Mat();
			cv.cvtColor(mat, this.backgroundFrame, cv.COLOR_RGBA2GRAY);
			mat.delete();

			console.log('Background frame set for motion detection');
		} catch (error) {
			console.error('Error setting background frame:', error);
		}
	}

	/**
	 * Generate motion-based proposals from current frame.
	 *
	 * Uses frame differencing against the background to find moving objects.
	 * Returns bounding boxes that likely contain RC cars.
	 *
	 * @param imageData - Current frame pixel data
	 * @param trackLine - Optional track polyline to filter proposals near track
	 * @returns Array of proposals (bounding boxes with centroids)
	 */
	generateProposals(imageData: ImageData, trackLine?: Point2D[]): Proposal[] {
		if (!this.cvReady()) {
			console.warn('OpenCV not ready, cannot generate proposals');
			return [];
		}

		if (!this.backgroundFrame) {
			console.warn('Background frame not set, cannot generate proposals');
			return [];
		}

		try {
			// Convert current frame to grayscale
			const currentMat = cv.matFromImageData(imageData);
			const currentGray = new cv.Mat();
			cv.cvtColor(currentMat, currentGray, cv.COLOR_RGBA2GRAY);

			// Compute absolute difference
			const diff = new cv.Mat();
			cv.absdiff(this.backgroundFrame, currentGray, diff);

			// Apply threshold to create binary mask
			const binary = new cv.Mat();
			cv.threshold(diff, binary, this.diffThreshold(), 255, cv.THRESH_BINARY);

			// Morphological operations to clean noise
			const kernel = cv.getStructuringElement(
				cv.MORPH_ELLIPSE,
				new cv.Size(5, 5),
			);
			const opened = new cv.Mat();
			const closed = new cv.Mat();

			// Opening: remove small noise
			cv.morphologyEx(binary, opened, cv.MORPH_OPEN, kernel);

			// Closing: fill small holes
			cv.morphologyEx(opened, closed, cv.MORPH_CLOSE, kernel);

			// Find contours
			const contours = new cv.MatVector();
			const hierarchy = new cv.Mat();
			cv.findContours(
				closed,
				contours,
				hierarchy,
				cv.RETR_EXTERNAL,
				cv.CHAIN_APPROX_SIMPLE,
			);

			// Extract proposals from contours
			const proposals: Proposal[] = [];
			const minArea = this.minArea();
			const maxArea = this.maxArea();

			for (let i = 0; i < contours.size(); i++) {
				const contour = contours.get(i);
				const area = cv.contourArea(contour);

				// Filter by area
				if (area < minArea || area > maxArea) {
					continue;
				}

				// Get bounding rectangle
				const rect = cv.boundingRect(contour);

				// Compute centroid
				const moments = cv.moments(contour);
				const cx = moments.m10 / moments.m00;
				const cy = moments.m01 / moments.m00;

				// Optional: filter by proximity to track line
				if (trackLine && trackLine.length > 0) {
					const nearTrack = this.isNearTrackLine({ x: cx, y: cy }, trackLine);
					if (!nearTrack) {
						continue;
					}
				}

				proposals.push({
					id: this.nextProposalId++,
					bbox: [rect.x, rect.y, rect.width, rect.height],
					centroid: { x: cx, y: cy },
					area: area,
				});
			}

			// Cleanup
			currentMat.delete();
			currentGray.delete();
			diff.delete();
			binary.delete();
			kernel.delete();
			opened.delete();
			closed.delete();
			contours.delete();
			hierarchy.delete();

			console.log(`Generated ${proposals.length} proposals`);
			return proposals;
		} catch (error) {
			console.error('Error generating proposals:', error);
			return [];
		}
	}

	/**
	 * Check if a point is near the track line.
	 *
	 * @param point - Point to check
	 * @param trackLine - Track polyline
	 * @param maxDistance - Maximum distance in pixels (default: 200)
	 * @returns True if point is within maxDistance of track line
	 */
	private isNearTrackLine(
		point: Point2D,
		trackLine: Point2D[],
		maxDistance = 200,
	): boolean {
		if (trackLine.length < 2) return true;

		// Check distance to each line segment
		for (let i = 0; i < trackLine.length - 1; i++) {
			const p1 = trackLine[i];
			const p2 = trackLine[i + 1];

			const dist = this.pointToSegmentDistance(point, p1, p2);
			if (dist <= maxDistance) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Compute distance from point to line segment.
	 */
	private pointToSegmentDistance(
		point: Point2D,
		segStart: Point2D,
		segEnd: Point2D,
	): number {
		const dx = segEnd.x - segStart.x;
		const dy = segEnd.y - segStart.y;
		const lengthSquared = dx * dx + dy * dy;

		if (lengthSquared === 0) {
			// Segment is a point
			const px = point.x - segStart.x;
			const py = point.y - segStart.y;
			return Math.sqrt(px * px + py * py);
		}

		// Project point onto line segment
		const t = Math.max(
			0,
			Math.min(
				1,
				((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) /
					lengthSquared,
			),
		);

		const projX = segStart.x + t * dx;
		const projY = segStart.y + t * dy;

		const distX = point.x - projX;
		const distY = point.y - projY;

		return Math.sqrt(distX * distX + distY * distY);
	}

	/**
	 * Clear background frame and reset state.
	 */
	clear(): void {
		if (this.backgroundFrame) {
			this.backgroundFrame.delete();
			this.backgroundFrame = null;
		}
		this.nextProposalId = 0;
	}
}
