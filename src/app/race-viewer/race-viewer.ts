import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	effect,
	inject,
	OnDestroy,
	ViewChild,
} from '@angular/core';
import { HomographyService } from '../services/homography.service';
import { MotionTrackingService } from '../services/motion-tracking.service';
import { NotificationService } from '../services/notification.service';
import { OverlayRendererService } from '../services/overlay-renderer.service';
import { RaceStateService } from '../services/race-state.service';
import { VideoFrameService } from '../services/video-frame.service';
import {
	CarSelectionComponent,
	type CarSelection,
} from './components/car-selection/car-selection.component';
import { TrackEditorComponent } from './components/track-editor/track-editor.component';
import { VideoPlayerComponent } from './components/video-player/video-player.component';

@Component({
	selector: 'app-race-viewer',
	imports: [CarSelectionComponent, TrackEditorComponent, VideoPlayerComponent],
	templateUrl: './race-viewer.html',
	styleUrl: './race-viewer.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RaceViewer implements OnDestroy {
	@ViewChild('videoPlayer') videoPlayer!: VideoPlayerComponent;
	@ViewChild('overlayCanvas') overlayCanvas!: ElementRef<HTMLCanvasElement>;
	@ViewChild(CarSelectionComponent) carSelectionComponent!: CarSelectionComponent;
	@ViewChild('trackEditor') trackEditor!: TrackEditorComponent;

	// Configuration constants
	// private readonly DEFAULT_VIDEO_FPS = 30;

	// Tracking configuration
	homographyService = inject(HomographyService);
	motionTrackingService = inject(MotionTrackingService);
	overlayRenderer = inject(OverlayRendererService);
	videoFrameService = inject(VideoFrameService);
	state = inject(RaceStateService);
	notificationService = inject(NotificationService);
	private animationFrameId: number | null = null;

	constructor() {
		effect(() => {
			const src = this.state.videoSrc();
			if (src) {
				// Auto-play is handled in template via autoplay attribute or we can do it here
			}
		});

		// Re-render polyline when trackLine or startIndex changes
		effect(() => {
			this.state.trackLine();
			this.state.startIndex();
			this.state.manualSelections();
			this.state.segmentationOverlays();
			if (this.overlayCanvas) {
				this.renderPolyline();
			}
		});

		// Ensure render loop runs (independent of debug mode) once canvas available
		effect(() => {
			if (this.overlayCanvas) {
				this.startRenderLoop();
			}
		});
	}


	onVideoLoadedMetadata() {
		this.updateCanvasSize();
	}

	onResize() {
		this.updateCanvasSize();
	}

	updateCanvasSize() {
		if (this.videoPlayer && this.overlayCanvas) {
			const video = this.videoPlayer.nativeElement;
			if (!video) return;
			const canvas = this.overlayCanvas.nativeElement;
			// Match internal resolution to video resolution
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			this.renderPolyline();
		}
	}

	// Milestone 2: Track mapping controls - Delegated to TrackEditorComponent


	onSelectionsChange(selections: CarSelection[]) {
		this.state.manualSelections.set(selections);
	}

	onOverlaysChange(overlays: Map<number, HTMLCanvasElement>) {
		this.state.segmentationOverlays.set(overlays);
		this.renderPolyline();
	}

	onCarSelectionModeChange(mode: 'locked' | 'marking-cars') {
		if (mode === 'marking-cars') {
			this.videoPlayer.pause();
			this.state.mode.set('marking-cars');
			const video = this.videoPlayer.nativeElement;
			if (video) {
				const data = this.videoFrameService.captureFrame(video);
				this.state.currentFrameData.set(data);
			}
		} else {
			this.state.mode.set(mode);
		}
	}

	onConfirmCarSelection() {
		this.state.mode.set('locked');
		this.initializeTemplates();
	}

	onCancelCarMarking() {
		this.state.mode.set('locked');
		this.state.manualSelections.set([]);
		this.state.segmentationOverlays.set(new Map());
	}

	onStartTracking() {
		if (this.state.manualSelections().length === 0) {
			console.warn('No selections to track');
			return;
		}
		this.initializeTemplates();
		// this.playVideo();
		console.log('Tracking started');
	}

	// Canvas interaction
	onCanvasClick(event: MouseEvent) {
		if (!this.overlayCanvas || !this.videoPlayer) return;

		const canvas = this.overlayCanvas.nativeElement;
		const video = this.videoPlayer.nativeElement;
		if (!video) return;
		const rect = canvas.getBoundingClientRect();

		const { x, y } = this.videoFrameService.getClientToVideoCoordinates(
			event.clientX,
			event.clientY,
			rect,
			video.videoWidth,
			video.videoHeight,
		);

		if (this.state.mode() === 'mapping' || this.state.mode() === 'start-finish') {
			this.trackEditor.handleCanvasClick({ x, y });
		} else if (this.state.mode() === 'marking-cars') {
			this.carSelectionComponent.handleCanvasClick({ x, y });
		}
	}

	// Render polyline on overlay canvas
	renderPolyline() {
		if (!this.overlayCanvas) return;

		const canvas = this.overlayCanvas.nativeElement;
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

	// Milestone 2.5: Homography and debug visualization
	onToggleDebugMode(event: Event): void {
		const checked = (event.target as HTMLInputElement).checked;
		this.homographyService.debugMode.set(checked);
	}

	private startRenderLoop(): void {
		if (this.animationFrameId !== null) return;

		const render = () => {
			this.updateFrameAndRender();
			this.animationFrameId = requestAnimationFrame(render);
		};

		this.animationFrameId = requestAnimationFrame(render);
	}

	private stopRenderLoop(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	private updateFrameAndRender(): void {
		if (!this.videoPlayer || !this.overlayCanvas) return;

		const video = this.videoPlayer.nativeElement;
		if (!video || video.paused || video.ended) return;

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
		this.renderPolyline();
	}

	private initializeTemplates(): void {
		const video = this.videoPlayer.nativeElement;
		if (!video) return;

		const baseImageData = this.videoFrameService.captureFrame(video);
		if (!baseImageData) return;

		this.motionTrackingService.initializeTemplates(
			baseImageData,
			this.state.manualSelections(),
		);
	}

	ngOnDestroy() {
		this.stopRenderLoop();
		this.motionTrackingService.clearTemplates();
		const url = this.state.videoSrc();
		if (url) {
			URL.revokeObjectURL(url);
		}
	}

	onTrackEditorStart() {
		this.state.mode.set('mapping');
	}

	onTrackEditorModeChange(mode: 'mapping' | 'start-finish') {
		this.state.mode.set(mode);
	}

	onTrackEditorCompleted() {
		this.state.mode.set('locked');
		// Initialize homography when track is locked
		// Capture reference frame for homography
		const video = this.videoPlayer.nativeElement;
		if (video) {
			const imageData = this.videoFrameService.captureFrame(video);
			if (imageData) {
				const frameIndex = 0; // Use frame 0 as reference
				this.homographyService.setReferenceFrame(frameIndex, imageData);
				this.homographyService.computeHomography(frameIndex, imageData);
			}
		}
	}

	onTrackEditorCancelled() {
		this.state.mode.set('normal');
	}
}
