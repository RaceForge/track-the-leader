import { Injectable, inject, signal } from '@angular/core';
import { HomographyService } from './homography.service';
import { MotionTrackingService } from './motion-tracking.service';
import { OverlayRendererService } from './overlay-renderer.service';
import { RaceStateService } from './race-state.service';
import { VideoFrameService } from './video-frame.service';

@Injectable({
	providedIn: 'root',
})
export class RaceLoopService {
	private homographyService = inject(HomographyService);
	private motionTrackingService = inject(MotionTrackingService);
	private overlayRenderer = inject(OverlayRendererService);
	private videoFrameService = inject(VideoFrameService);
	private state = inject(RaceStateService);

	private animationFrameId: number | null = null;

	start(
		video: HTMLVideoElement,
		canvas: HTMLCanvasElement,
	) {
		if (this.animationFrameId !== null) return;

		const render = () => {
			this.updateAndRender(video, canvas);
			this.animationFrameId = requestAnimationFrame(render);
		};

		this.animationFrameId = requestAnimationFrame(render);
	}

	stop() {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	private updateAndRender(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
		if (video.paused || video.ended) return;

		// Estimate current frame index using configurable FPS
		const fps = this.state.videoFps();
		const frameIndex = Math.floor(video.currentTime * fps);
		this.homographyService.currentFrameIndex.set(frameIndex);

		// Run tracking update
		const imageData = this.videoFrameService.captureFrame(video);
		if (imageData) {
			const currentSelections = this.state.manualSelections();
			const updatedSelections = this.motionTrackingService.updateTrackedPositions(
				imageData,
				currentSelections,
			);
			if (updatedSelections !== currentSelections) {
				this.state.manualSelections.set(updatedSelections);
			}
		}

		// Redraw overlays
		this.renderPolyline(canvas);
	}

	renderPolyline(canvas: HTMLCanvasElement) {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		let lineToDraw = this.state.trackLine();

		// If locked and debug mode is on, show stabilized track line
		if (this.state.mode() === 'locked' && this.homographyService.debugMode()) {
			const frameIndex = this.homographyService.currentFrameIndex();
			lineToDraw = this.homographyService.transformTrackLine(
				lineToDraw,
				frameIndex,
			);
		}

		this.overlayRenderer.renderScene(
			ctx,
			canvas.width,
			canvas.height,
			lineToDraw,
			this.state.startIndex(),
			this.state.manualSelections(),
			this.state.segmentationOverlays(),
		);
	}
}
