import { Injectable } from '@angular/core';
import { type CarSelection } from '../race-viewer/components/car-selection/car-selection.component';
import { type Point2D } from '../types/geometry';

@Injectable({
	providedIn: 'root',
})
export class OverlayRendererService {
	clearCanvas(
		ctx: CanvasRenderingContext2D,
		width: number,
		height: number,
	): void {
		ctx.clearRect(0, 0, width, height);
	}

	renderTrackLine(
		ctx: CanvasRenderingContext2D,
		line: Point2D[],
		startIndex: number | null,
		color = '#00ffff', // Cyan
		startPointColor = '#ff0000', // Red
	): void {
		if (line.length < 2) return;

		ctx.strokeStyle = color;
		ctx.lineWidth = 3;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		ctx.beginPath();
		ctx.moveTo(line[0].x, line[0].y);
		for (let i = 1; i < line.length; i++) {
			ctx.lineTo(line[i].x, line[i].y);
		}
		ctx.stroke();

		// Highlight start/finish point if set
		if (startIndex !== null && startIndex < line.length) {
			const startPoint = line[startIndex];
			ctx.fillStyle = startPointColor;
			ctx.beginPath();
			ctx.arc(startPoint.x, startPoint.y, 8, 0, 2 * Math.PI);
			ctx.fill();
		}
	}

	renderSelections(
		ctx: CanvasRenderingContext2D,
		selections: CarSelection[],
		overlays: Map<number, HTMLCanvasElement>,
		canvasWidth: number,
		canvasHeight: number,
	): void {
		// Draw segmentation overlays
		if (overlays.size > 0) {
			ctx.save();
			ctx.globalAlpha = 0.35;
			for (const overlay of overlays.values()) {
				ctx.drawImage(
					overlay,
					0,
					0,
					overlay.width,
					overlay.height,
					0,
					0,
					canvasWidth,
					canvasHeight,
				);
			}
			ctx.restore();
		}

		// Draw bounding boxes and labels
		for (const selection of selections) {
			const [x, y, width, height] = selection.bbox;

			// Draw bounding box
			ctx.strokeStyle = '#00ff00'; // Green
			ctx.lineWidth = 3;
			ctx.strokeRect(x, y, width, height);

			// Draw centroid
			ctx.fillStyle = '#00ff00';
			ctx.beginPath();
			ctx.arc(selection.center.x, selection.center.y, 5, 0, 2 * Math.PI);
			ctx.fill();

			// Draw label
			ctx.fillStyle = '#00ff00';
			ctx.font = '14px monospace';
			ctx.fillText(`Car ${selection.id}`, x, y - 8);
		}
	}

	renderScene(
		ctx: CanvasRenderingContext2D,
		width: number,
		height: number,
		trackLine: Point2D[],
		startIndex: number | null,
		selections: CarSelection[],
		overlays: Map<number, HTMLCanvasElement>,
	): void {
		this.clearCanvas(ctx, width, height);
		this.renderTrackLine(ctx, trackLine, startIndex);
		this.renderSelections(ctx, selections, overlays, width, height);
	}
}
