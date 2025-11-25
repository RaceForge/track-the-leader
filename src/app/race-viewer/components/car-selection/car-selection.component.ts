import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core';
import {
	Sam3SegmentationService,
	type SamMaskResult,
	type SamPrompt,
} from '../../../services/sam3-segmentation.service';
import { type BBox, type Point2D } from '../../../types/geometry';

export interface CarSelection {
	id: number;
	center: Point2D;
	bbox: BBox;
}

@Component({
	selector: 'app-car-selection',
	templateUrl: './car-selection.component.html',
	styleUrl: './car-selection.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CarSelectionComponent {
	// Inputs
	isActive = input<boolean>(false);
	canMark = input<boolean>(false);
	frameData = input<ImageData | null>(null);

	// Outputs
	selectionsChange = output<CarSelection[]>();
	overlaysChange = output<Map<number, HTMLCanvasElement>>();
	confirm = output<void>();
	cancel = output<void>();
	modeChange = output<'locked' | 'marking-cars'>(); // Request mode change

	// Services
	private sam3Service = inject(Sam3SegmentationService);

	// State
	manualSelections = signal<CarSelection[]>([]);
	segmentationInProgress = signal(false);
	segmentationError = signal<string | null>(null);
	segmentationOverlays = signal<Map<number, HTMLCanvasElement>>(new Map());

	private nextCarId = 1;
	private readonly DEFAULT_CAR_BOX_SIZE = 60;

	// Computed
	hasSelections = computed(() => this.manualSelections().length > 0);

	// Public API for parent to call on canvas interaction
	handleCanvasClick(point: Point2D) {
		if (!this.isActive()) return;

		// Check if clicking on existing selection to remove it
		const clickedSelection = this.findSelectionAtPoint(point);
		if (clickedSelection) {
			// Remove this selection
			this.manualSelections.update((selections) =>
				selections.filter((s) => s.id !== clickedSelection.id),
			);
		} else {
			// Add new car selection at this point
			const boxSize = this.DEFAULT_CAR_BOX_SIZE;
			const x = point.x;
			const y = point.y;

			const newSelection: CarSelection = {
				id: this.nextCarId++,
				center: { x, y },
				bbox: [x - boxSize / 2, y - boxSize / 2, boxSize, boxSize],
			};
			this.manualSelections.update((selections) => [
				...selections,
				newSelection,
			]);
		}

		this.emitChanges();
	}

	onMarkCars() {
		this.modeChange.emit('marking-cars');
		this.manualSelections.set([]);
		this.clearSegmentationResults();
		this.emitChanges();
	}

	onConfirmCarSelection() {
		if (this.manualSelections().length === 0) {
			return;
		}
		this.confirm.emit();
		void this.runSegmentationForSelections();
	}

	onCancelCarMarking() {
		this.manualSelections.set([]);
		this.clearSegmentationResults();
		this.cancel.emit();
		this.emitChanges();
	}

	onRunSamSegmentation() {
		void this.runSegmentationForSelections();
	}

	private emitChanges() {
		this.selectionsChange.emit(this.manualSelections());
		this.overlaysChange.emit(this.segmentationOverlays());
	}

	private findSelectionAtPoint(point: Point2D): CarSelection | null {
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

	private clearSegmentationResults(): void {
		this.segmentationOverlays.set(new Map());
		this.segmentationError.set(null);
		this.segmentationInProgress.set(false);
		this.emitChanges();
	}

	private async runSegmentationForSelections(): Promise<void> {
		if (this.segmentationInProgress()) {
			return;
		}
		const selections = this.manualSelections();
		if (selections.length === 0) {
			return;
		}

		const frameData = this.frameData();
		if (!frameData) {
			this.segmentationError.set('Unable to capture frame for segmentation.');
			return;
		}

		this.segmentationInProgress.set(true);
		this.segmentationError.set(null);
		this.segmentationOverlays.set(new Map());
		this.emitChanges();

		try {
			if (!this.sam3Service.isLoaded()) {
				await this.sam3Service.loadModel();
				if (!this.sam3Service.isLoaded()) {
					throw new Error('SAM3 model failed to load');
				}
			}

			const overlays = new Map<number, HTMLCanvasElement>();

			for (const selection of selections) {
				const prompt: SamPrompt = {
					point: selection.center,
					box: selection.bbox,
				};
				const result = await this.sam3Service.runSegmentation(
					frameData,
					prompt,
				);

				// Create visual overlay from mask
				const overlay = this.createMaskOverlay(result);
				if (overlay) {
					overlays.set(selection.id, overlay);
				}
			}

			this.segmentationOverlays.set(overlays);
			this.emitChanges();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Segmentation failed';
			this.segmentationError.set(message);
			console.error('SAM3 segmentation failed:', error);
		} finally {
			this.segmentationInProgress.set(false);
		}
	}

	private createMaskOverlay(result: SamMaskResult): HTMLCanvasElement | null {
		if (typeof document === 'undefined') {
			return null;
		}
		const maskCanvas = document.createElement('canvas');
		maskCanvas.width = result.width;
		maskCanvas.height = result.height;
		const maskCtx = maskCanvas.getContext('2d');
		if (!maskCtx) {
			return null;
		}
		const maskImage = maskCtx.createImageData(result.width, result.height);
		for (let i = 0; i < result.mask.length; i++) {
			if (result.mask[i] > 0) {
				const idx = i * 4;
				maskImage.data[idx] = 0;
				maskImage.data[idx + 1] = 255;
				maskImage.data[idx + 2] = 0;
				maskImage.data[idx + 3] = 100;
			}
		}
		maskCtx.putImageData(maskImage, 0, 0);
		return maskCanvas;
	}
}
