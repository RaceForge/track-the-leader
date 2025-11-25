import { Injectable } from '@angular/core';

@Injectable({
	providedIn: 'root',
})
export class VideoFrameService {
	private offscreenCanvas: HTMLCanvasElement | null = null;
	private offscreenCtx: CanvasRenderingContext2D | null = null;

	/**
	 * Captures the current frame from the video element as ImageData.
	 * Uses an internal offscreen canvas to avoid interfering with the UI.
	 */
	captureFrame(video: HTMLVideoElement): ImageData | null {
		if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
			return null;
		}

		this.ensureCanvasSize(video.videoWidth, video.videoHeight);

		if (!this.offscreenCtx) return null;

		this.offscreenCtx.drawImage(video, 0, 0);
		return this.offscreenCtx.getImageData(
			0,
			0,
			video.videoWidth,
			video.videoHeight,
		);
	}

	/**
	 * Converts client coordinates (e.g. mouse click) to video coordinates.
	 */
	getClientToVideoCoordinates(
		clientX: number,
		clientY: number,
		elementRect: DOMRect,
		videoWidth: number,
		videoHeight: number,
	): { x: number; y: number } {
		const scaleX = videoWidth / elementRect.width;
		const scaleY = videoHeight / elementRect.height;
		const x = (clientX - elementRect.left) * scaleX;
		const y = (clientY - elementRect.top) * scaleY;
		return { x, y };
	}

	private ensureCanvasSize(width: number, height: number) {
		if (!this.offscreenCanvas) {
			this.offscreenCanvas = document.createElement('canvas');
			this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
				willReadFrequently: true,
			});
		}

		if (
			this.offscreenCanvas.width !== width ||
			this.offscreenCanvas.height !== height
		) {
			this.offscreenCanvas.width = width;
			this.offscreenCanvas.height = height;
		}
	}
}
