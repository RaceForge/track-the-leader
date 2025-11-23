import {
	Component,
	ElementRef,
	ViewChild,
	signal,
	effect,
	computed,
	OnDestroy,
	ChangeDetectionStrategy,
	inject,
} from '@angular/core';
import { HomographyService } from '../services/homography.service';

type Point2D = { x: number; y: number };

type ViewMode = 'normal' | 'mapping' | 'start-finish' | 'locked';

@Component({
	selector: 'app-race-viewer',
	imports: [],
	templateUrl: './race-viewer.html',
	styleUrl: './race-viewer.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RaceViewer implements OnDestroy {
	@ViewChild('videoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;
	@ViewChild('overlayCanvas') overlayCanvas!: ElementRef<HTMLCanvasElement>;

	homographyService = inject(HomographyService);
	private animationFrameId: number | null = null;

	videoSrc = signal<string | null>(null);
	isDragging = signal(false);

	// Milestone 2: Track mapping state
	mode = signal<ViewMode>('normal');
	trackLine = signal<Point2D[]>([]);
	startIndex = signal<number | null>(null);

	// Computed state for UI controls
	canFinishMapping = computed(() => this.trackLine().length > 4);
	canStartTracking = computed(() => this.mode() === 'locked' && this.startIndex() !== null);
	isMapping = computed(() => this.mode() === 'mapping');
	isSelectingStartFinish = computed(() => this.mode() === 'start-finish');

	constructor() {
		effect(() => {
			const src = this.videoSrc();
			if (src) {
				// Auto-play is handled in template via autoplay attribute or we can do it here
			}
		});

		// Re-render polyline when trackLine or startIndex changes
		effect(() => {
			this.trackLine();
			this.startIndex();
			if (this.overlayCanvas) {
				this.renderPolyline();
			}
		});

		// Re-render when debug mode changes
		effect(() => {
			const debugMode = this.homographyService.debugMode();
			if (debugMode && this.overlayCanvas) {
				this.startRenderLoop();
			} else {
				this.stopRenderLoop();
				if (this.overlayCanvas) {
					this.renderPolyline();
				}
			}
		});
	}

	onDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		this.isDragging.set(true);
	}

	onDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		this.isDragging.set(false);
	}

	onDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		this.isDragging.set(false);

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			const file = files[0];
			// Accept .mp4 and .mov (video/quicktime)
			if (
				file.type === 'video/mp4' ||
				file.type === 'video/quicktime' ||
				file.name.endsWith('.mov') ||
				file.name.endsWith('.mp4')
			) {
				const oldUrl = this.videoSrc();
				if (oldUrl) {
					URL.revokeObjectURL(oldUrl);
				}
				const url = URL.createObjectURL(file);
				this.videoSrc.set(url);
			} else {
				alert('Please drop an .mp4 or .mov file.');
			}
		}
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
			const canvas = this.overlayCanvas.nativeElement;
			// Match internal resolution to video resolution
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			this.renderPolyline();
		}
	}

	// Milestone 2: Track mapping controls
	onSelectTrackLine() {
		this.mode.set('mapping');
		this.trackLine.set([]);
		this.startIndex.set(null);
		this.pauseVideo();
	}

	onUndo() {
		const current = this.trackLine();
		if (current.length > 0) {
			this.trackLine.set(current.slice(0, -1));
		}
	}

	onReset() {
		this.trackLine.set([]);
		this.startIndex.set(null);
	}

	onFinish() {
		if (this.canFinishMapping()) {
			this.mode.set('start-finish');
		}
	}

	onConfirmStartFinish() {
		if (this.startIndex() !== null) {
			// Capture reference frame for homography
			const imageData = this.captureFrameData();
			if (imageData) {
				const frameIndex = 0; // Use frame 0 as reference
				this.homographyService.setReferenceFrame(frameIndex, imageData);
				this.homographyService.computeHomography(frameIndex, imageData);
			}

			this.mode.set('locked');
			this.playVideo();
		}
	}

	onStartTracking() {
		// Placeholder for future tracking logic
		console.log('Start tracking...');
	}

	// Canvas interaction
	onCanvasClick(event: MouseEvent) {
		if (!this.overlayCanvas || !this.videoPlayer) return;

		const canvas = this.overlayCanvas.nativeElement;
		const video = this.videoPlayer.nativeElement;
		const rect = canvas.getBoundingClientRect();

		// Convert click position to video coordinate system
		const scaleX = video.videoWidth / rect.width;
		const scaleY = video.videoHeight / rect.height;
		const x = (event.clientX - rect.left) * scaleX;
		const y = (event.clientY - rect.top) * scaleY;

		if (this.mode() === 'mapping') {
			// Add point to trackLine
			this.trackLine.update(line => [...line, { x, y }]);
		} else if (this.mode() === 'start-finish') {
			// Find nearest point on polyline
			const nearestIndex = this.findNearestPointIndex({ x, y });
			if (nearestIndex !== null) {
				this.startIndex.set(nearestIndex);
			}
		}
	}

	// Find nearest point on the polyline to given position
	findNearestPointIndex(pos: Point2D): number | null {
		const line = this.trackLine();
		if (line.length === 0) return null;

		let minDist = Number.POSITIVE_INFINITY;
		let nearestIdx = 0;

		for (let i = 0; i < line.length; i++) {
			const dx = line[i].x - pos.x;
			const dy = line[i].y - pos.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < minDist) {
				minDist = dist;
				nearestIdx = i;
			}
		}

		return nearestIdx;
	}

	// Render polyline on overlay canvas
	renderPolyline() {
		if (!this.overlayCanvas) return;

		const canvas = this.overlayCanvas.nativeElement;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Clear canvas
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		const line = this.trackLine();
		if (line.length < 2) return;

		// Draw polyline
		ctx.strokeStyle = '#00ffff'; // Cyan
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
		const startIdx = this.startIndex();
		if (startIdx !== null && startIdx < line.length) {
			const startPoint = line[startIdx];
			ctx.fillStyle = '#ff0000'; // Red
			ctx.beginPath();
			ctx.arc(startPoint.x, startPoint.y, 8, 0, 2 * Math.PI);
			ctx.fill();
		}
	}

	// Video control helpers
	pauseVideo() {
		if (this.videoPlayer) {
			this.videoPlayer.nativeElement.pause();
		}
	}

	playVideo() {
		if (this.videoPlayer) {
			this.videoPlayer.nativeElement.play().catch(() => {
				// Ignore play errors (e.g., in tests or when user interaction required)
			});
		}
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
		if (video.paused || video.ended) return;

		// Estimate current frame index
		const fps = 30; // Assume 30 fps for now
		const frameIndex = Math.floor(video.currentTime * fps);
		this.homographyService.currentFrameIndex.set(frameIndex);

		// Capture current frame for homography computation
		const imageData = this.captureFrameData();
		if (imageData) {
			this.homographyService.computeHomography(frameIndex, imageData);
		}

		// Render transformed track line
		this.renderStabilizedTrackLine();
	}

	private captureFrameData(): ImageData | null {
		if (!this.videoPlayer || !this.overlayCanvas) return null;

		const video = this.videoPlayer.nativeElement;
		const canvas = this.overlayCanvas.nativeElement;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;

		// Draw video frame to canvas temporarily
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

		return imageData;
	}

	private renderStabilizedTrackLine(): void {
		if (!this.overlayCanvas) return;

		const canvas = this.overlayCanvas.nativeElement;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Clear canvas
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		const line = this.trackLine();
		if (line.length < 2) return;

		// Transform track line to current frame
		const frameIndex = this.homographyService.currentFrameIndex();
		const transformedLine = this.homographyService.transformTrackLine(line, frameIndex);

		// Draw transformed polyline
		ctx.strokeStyle = '#00ffff'; // Cyan
		ctx.lineWidth = 3;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		ctx.beginPath();
		ctx.moveTo(transformedLine[0].x, transformedLine[0].y);
		for (let i = 1; i < transformedLine.length; i++) {
			ctx.lineTo(transformedLine[i].x, transformedLine[i].y);
		}
		ctx.stroke();

		// Highlight start/finish point if set
		const startIdx = this.startIndex();
		if (startIdx !== null && startIdx < transformedLine.length) {
			const startPoint = transformedLine[startIdx];
			ctx.fillStyle = '#ff0000'; // Red
			ctx.beginPath();
			ctx.arc(startPoint.x, startPoint.y, 8, 0, 2 * Math.PI);
			ctx.fill();
		}
	}

	ngOnDestroy() {
		this.stopRenderLoop();
		const url = this.videoSrc();
		if (url) {
			URL.revokeObjectURL(url);
		}
	}
}
