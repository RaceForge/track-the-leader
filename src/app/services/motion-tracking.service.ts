import { Injectable } from '@angular/core';
import { type CarSelection } from '../race-viewer/components/car-selection/car-selection.component';
import { type Point2D } from '../types/geometry';

// biome-ignore lint/suspicious/noExplicitAny: OpenCV global provided via script tag
declare const cv: any;

type CvMatLike = {
	cols: number;
	rows: number;
	delete(): void;
};

@Injectable({
	providedIn: 'root',
})
export class MotionTrackingService {
	// Tracking configuration
	readonly trackingSearchMultiplier = 2.0;
	readonly trackingConfidenceThreshold = 0.7;

	// id -> cv.Mat template (grayscale)
	private trackingTemplates = new Map<number, CvMatLike>();

	initializeTemplates(frameData: ImageData, selections: CarSelection[]): void {
		this.clearTemplates();
		if (typeof cv === 'undefined' || !cv?.Mat) {
			console.warn('OpenCV not ready, cannot initialize templates');
			return;
		}

		try {
			const frameMatRGBA = cv.matFromImageData(frameData);
			const frameGray = new cv.Mat();
			cv.cvtColor(frameMatRGBA, frameGray, cv.COLOR_RGBA2GRAY);

			for (const sel of selections) {
				const [x, y, w, h] = sel.bbox.map((v) => Math.round(v));

				// Ensure ROI is within bounds
				const roiRect = new cv.Rect(
					Math.max(0, x),
					Math.max(0, y),
					Math.min(w, frameGray.cols - x),
					Math.min(h, frameGray.rows - y),
				);

				if (roiRect.width <= 0 || roiRect.height <= 0) {
					console.warn(`Invalid ROI for car ${sel.id}`, roiRect);
					continue;
				}

				const template = frameGray.roi(roiRect).clone();
				this.trackingTemplates.set(sel.id, template);
			}

			frameMatRGBA.delete();
			frameGray.delete();

			console.log(
				`Initialized ${this.trackingTemplates.size} tracking templates`,
			);
		} catch (err) {
			console.error('Failed to initialize tracking templates:', err);
		}
	}

	clearTemplates(): void {
		for (const tpl of this.trackingTemplates.values()) {
			try {
				tpl.delete();
			} catch {}
		}
		this.trackingTemplates.clear();
	}

	updateTrackedPositions(
		frameData: ImageData,
		selections: CarSelection[],
	): CarSelection[] {
		if (this.trackingTemplates.size === 0) {
			return selections;
		}

		try {
			const frameMatRGBA = cv.matFromImageData(frameData);
			const frameGray = new cv.Mat();
			cv.cvtColor(frameMatRGBA, frameGray, cv.COLOR_RGBA2GRAY);

			const updated: CarSelection[] = [];

			for (const sel of selections) {
				const template = this.trackingTemplates.get(sel.id);
				if (!template) {
					updated.push(sel);
					continue;
				}

				const [, , bw, bh] = sel.bbox; // width & height only
				const searchW = Math.min(
					Math.round(bw * this.trackingSearchMultiplier),
					frameGray.cols,
				);
				const searchH = Math.min(
					Math.round(bh * this.trackingSearchMultiplier),
					frameGray.rows,
				);

				const cx = sel.center.x;
				const cy = sel.center.y;
				const x0 = Math.max(0, Math.round(cx - searchW / 2));
				const y0 = Math.max(0, Math.round(cy - searchH / 2));
				const x1 = Math.min(frameGray.cols, x0 + searchW);
				const y1 = Math.min(frameGray.rows, y0 + searchH);
				const actualW = x1 - x0;
				const actualH = y1 - y0;

				if (actualW < template.cols || actualH < template.rows) {
					updated.push(sel);
					continue;
				}

				const searchRect = new cv.Rect(x0, y0, actualW, actualH);
				const searchMat = frameGray.roi(searchRect);

				const resultCols = searchMat.cols - template.cols + 1;
				const resultRows = searchMat.rows - template.rows + 1;

				if (resultCols <= 0 || resultRows <= 0) {
					searchMat.delete();
					updated.push(sel);
					continue;
				}

				const result = new cv.Mat(resultRows, resultCols, cv.CV_32FC1);
				cv.matchTemplate(searchMat, template, result, cv.TM_CCOEFF_NORMED);
				const mm = cv.minMaxLoc(result);
				const confidence = mm.maxVal;

				if (confidence < this.trackingConfidenceThreshold) {
					// Keep previous position if confidence too low
					result.delete();
					searchMat.delete();
					updated.push(sel);
					continue;
				}

				const newTopLeftX = x0 + mm.maxLoc.x;
				const newTopLeftY = y0 + mm.maxLoc.y;
				const newCenter: Point2D = {
					x: newTopLeftX + template.cols / 2,
					y: newTopLeftY + template.rows / 2,
				};
				const newBBox: [number, number, number, number] = [
					newTopLeftX,
					newTopLeftY,
					template.cols,
					template.rows,
				];

				updated.push({ id: sel.id, center: newCenter, bbox: newBBox });

				result.delete();
				searchMat.delete();
			}

			frameMatRGBA.delete();
			frameGray.delete();

			return updated;
		} catch (err) {
			console.error('Tracking update failed:', err);
			return selections;
		}
	}
}
