import {
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	effect,
	inject,
	OnDestroy,
	signal,
	ViewChild,
} from '@angular/core';
import { HomographyService } from '../services/homography.service';
import {
	type Proposal,
	ProposalGeneratorService,
} from '../services/proposal-generator.service';

// biome-ignore lint: OpenCV global provided via script tag
declare const cv: any;

type Point2D = { x: number; y: number };
type CvMatLike = { cols: number; rows: number; delete(): void };

type ViewMode =
	| 'normal'
	| 'mapping'
	| 'start-finish'
	| 'locked'
	| 'marking-cars';

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
	proposalService = inject(ProposalGeneratorService);
	private animationFrameId: number | null = null;

	videoSrc = signal<string | null>(null);
	isDragging = signal(false);

	// Milestone 2: Track mapping state
	mode = signal<ViewMode>('normal');
	trackLine = signal<Point2D[]>([]);
	startIndex = signal<number | null>(null);

	// Milestone 3: Car detection and selection
	proposals = signal<Proposal[]>([]);
	selectedCarIds = signal<Set<number>>(new Set());
	manualSelections = signal<
		Array<{
			id: number;
			center: Point2D;
			bbox: [number, number, number, number];
		}>
	>([]);
	private nextCarId = 1;

	// Computed state for UI controls
	canFinishMapping = computed(() => this.trackLine().length > 4);
	canStartTracking = computed(
		() =>
			this.mode() === 'locked' &&
			this.startIndex() !== null &&
			this.manualSelections().length > 0,
	);
	isMapping = computed(() => this.mode() === 'mapping');
	isSelectingStartFinish = computed(() => this.mode() === 'start-finish');
	isMarkingCars = computed(() => this.mode() === 'marking-cars');
	canMarkCars = computed(() => this.mode() === 'locked');

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
			this.manualSelections();
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

	// Tracking state (templates kept for future use, but tracking loop disabled for now)
	private trackingTemplates = new Map<number, unknown>(); // id -> cv.Mat template (grayscale)

	onStartTracking() {
		if (this.manualSelections().length === 0) {
			console.warn('No selections to track');
			return;
		}
		this.initializeTemplates();
		this.playVideo();
		console.log('Tracking started');
	}

	onMarkCars() {
		if (!this.canMarkCars()) return;
		// Pause video and enter marking mode
		this.pauseVideo();
		this.mode.set('marking-cars');
		this.manualSelections.set([]);
	}

	onConfirmCarSelection() {
		if (this.manualSelections().length === 0) {
			alert('Please select at least one RC car');
			return;
		}
		console.log('Selected cars:', this.manualSelections());
		this.mode.set('locked');
		this.initializeTemplates();
		this.playVideo();
	}

	onCancelCarMarking() {
		this.manualSelections.set([]);
		this.clearTemplates();
		this.mode.set('locked');
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
			this.trackLine.update((line) => [...line, { x, y }]);
		} else if (this.mode() === 'start-finish') {
			// Find nearest point on polyline
			const nearestIndex = this.findNearestPointIndex({ x, y });
			if (nearestIndex !== null) {
				this.startIndex.set(nearestIndex);
			}
		} else if (this.mode() === 'marking-cars') {
			// Check if clicking on existing selection to remove it
			const clickedSelection = this.findSelectionAtPoint({ x, y });
			if (clickedSelection) {
				// Remove this selection
				this.manualSelections.update((selections) =>
					selections.filter((s) => s.id !== clickedSelection.id),
				);
			} else {
				// Add new car selection at this point
				const boxSize = 60; // Default box size
				const newSelection = {
					id: this.nextCarId++,
					center: { x, y },
					bbox: [x - boxSize / 2, y - boxSize / 2, boxSize, boxSize] as [
						number,
						number,
						number,
						number,
					],
				};
				this.manualSelections.update((selections) => [
					...selections,
					newSelection,
				]);
			}
		}
	}

	// Find manual selection that contains the given point
	findSelectionAtPoint(
		point: Point2D,
	): {
		id: number;
		center: Point2D;
		bbox: [number, number, number, number];
	} | null {
		const selections = this.manualSelections();
		for (const selection of selections) {
			const [x, y, width, height] = selection.bbox;
			if (
				point.x >= x &&
				point.x <= x + width &&
				point.y >= y &&
				point.y <= y + height
			) {
				return selection;
			}
		}
		return null;
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
		if (line.length >= 2) {
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

		// Always draw proposals if they exist (not just in marking-cars mode)
		if (this.manualSelections().length > 0) {
			this.renderManualSelections(ctx);
		}
	}

	// Render manual car selections as bounding boxes
	renderManualSelections(ctx: CanvasRenderingContext2D) {
		const selections = this.manualSelections();

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

		// Render stabilized track line + selections
		this.renderStabilizedTrackLine();
		// Lightweight path: just redraw overlays so video can render smoothly
		this.renderPolyline();
	}

	private captureFrameData(): ImageData | null {
		if (!this.videoPlayer || !this.overlayCanvas) return null;

		const video = this.videoPlayer.nativeElement;
		const canvas = this.overlayCanvas.nativeElement;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;

		// Save current overlay so we don't overwrite it permanently
		const overlaySnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

		// Draw video frame to canvas temporarily to sample pixels
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

		// Restore overlay so the user keeps seeing track + boxes
		ctx.putImageData(overlaySnapshot, 0, 0);

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
		const transformedLine = this.homographyService.transformTrackLine(
			line,
			frameIndex,
		);

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

	private initializeTemplates(): void {
		this.clearTemplates();
		if (!this.overlayCanvas || typeof cv === 'undefined' || !cv?.Mat) return;
		const canvas = this.overlayCanvas.nativeElement;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Preserve current overlay so we can restore it after sampling the video frame
		const overlaySnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

		// Draw current frame to ensure fresh pixels
		if (this.videoPlayer) {
			const video = this.videoPlayer.nativeElement;
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
		}
		const baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const frameMatRGBA = cv.matFromImageData(baseImageData);
		const frameGray = new cv.Mat();
		cv.cvtColor(frameMatRGBA, frameGray, cv.COLOR_RGBA2GRAY);
		for (const sel of this.manualSelections()) {
			const [x, y, w, h] = sel.bbox.map((v) => Math.round(v));
			const roiRect = new cv.Rect(
				Math.max(0, x),
				Math.max(0, y),
				Math.min(w, frameGray.cols - x),
				Math.min(h, frameGray.rows - y),
			);
			const template = frameGray.roi(roiRect).clone();
			this.trackingTemplates.set(sel.id, template);
		}
		frameMatRGBA.delete();
		frameGray.delete();

		// Restore overlay so the canvas returns to showing only annotations
		ctx.putImageData(overlaySnapshot, 0, 0);

		console.log(
			`Initialized ${this.trackingTemplates.size} tracking templates`,
		);
	}

	private clearTemplates(): void {
		for (const tpl of this.trackingTemplates.values()) {
			try {
				(tpl as CvMatLike).delete();
			} catch {}
		}
		this.trackingTemplates.clear();
	}

	// Tracking update logic kept for future use (currently unused to keep UI responsive)
	// private updateTrackedPositions(imageData: ImageData): void {
	// 	try {
	// 		const frameMatRGBA = cv.matFromImageData(imageData);
	// 		const frameGray = new cv.Mat();
	// 		cv.cvtColor(frameMatRGBA, frameGray, cv.COLOR_RGBA2GRAY);
	// 		const selections = this.manualSelections();
	// 		const updated: typeof selections = [];
	// 		for (const sel of selections) {
	// 			const template = this.trackingTemplates.get(sel.id) as CvMatLike | undefined;
	// 			if (!template) { updated.push(sel); continue; }
	// 			const [, , bw, bh] = sel.bbox; // width & height only
	// 			const searchW = Math.min(Math.round(bw * this.trackingSearchMultiplier), frameGray.cols);
	// 			const searchH = Math.min(Math.round(bh * this.trackingSearchMultiplier), frameGray.rows);
	// 			const cx = sel.center.x;
	// 			const cy = sel.center.y;
	// 			const x0 = Math.max(0, Math.round(cx - searchW / 2));
	// 			const y0 = Math.max(0, Math.round(cy - searchH / 2));
	// 			const x1 = Math.min(frameGray.cols, x0 + searchW);
	// 			const y1 = Math.min(frameGray.rows, y0 + searchH);
	// 			const actualW = x1 - x0;
	// 			const actualH = y1 - y0;
	// 			if (actualW < template.cols || actualH < template.rows) { updated.push(sel); continue; }
	// 			const searchRect = new cv.Rect(x0, y0, actualW, actualH);
	// 			const searchMat = frameGray.roi(searchRect);
	// 			const resultCols = searchMat.cols - template.cols + 1;
	// 			const resultRows = searchMat.rows - template.rows + 1;
	// 			if (resultCols <= 0 || resultRows <= 0) { searchMat.delete(); updated.push(sel); continue; }
	// 			const result = new cv.Mat(resultRows, resultCols, cv.CV_32FC1);
	// 			cv.matchTemplate(searchMat, template, result, cv.TM_CCOEFF_NORMED);
	// 			const mm = cv.minMaxLoc(result);
	// 			const confidence = mm.maxVal;
	// 			if (confidence < this.trackingConfidenceThreshold) {
	// 				// Keep previous position if confidence too low
	// 				result.delete(); searchMat.delete(); updated.push(sel); continue;
	// 			}
	// 			const newTopLeftX = x0 + mm.maxLoc.x;
	// 			const newTopLeftY = y0 + mm.maxLoc.y;
	// 			const newCenter: Point2D = { x: newTopLeftX + template.cols / 2, y: newTopLeftY + template.rows / 2 };
	// 			const newBBox: [number, number, number, number] = [newTopLeftX, newTopLeftY, template.cols, template.rows];
	// 			updated.push({ id: sel.id, center: newCenter, bbox: newBBox });
	// 			result.delete(); searchMat.delete();
	// 		}
	// 		// Update selections signal
	// 		this.manualSelections.set(updated);
	// 		frameMatRGBA.delete();
	// 		frameGray.delete();
	// 	} catch (err) {
	// 		console.error('Tracking update failed:', err);
	// 	}
	// }

	ngOnDestroy() {
		this.stopRenderLoop();
		this.clearTemplates();
		const url = this.videoSrc();
		if (url) {
			URL.revokeObjectURL(url);
		}
	}
}
