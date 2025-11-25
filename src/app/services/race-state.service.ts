import { computed, Injectable, signal } from '@angular/core';
import { type CarSelection } from '../race-viewer/components/car-selection/car-selection.component';
import { type Point2D } from '../types/geometry';

export type ViewMode =
	| 'normal'
	| 'mapping'
	| 'start-finish'
	| 'locked'
	| 'marking-cars';

@Injectable({
	providedIn: 'root',
})
export class RaceStateService {
	// Video state
	videoSrc = signal<string | null>(null);
	videoFps = signal(30);

	// App mode
	mode = signal<ViewMode>('normal');

	// Track mapping state
	trackLine = signal<Point2D[]>([]);
	startIndex = signal<number | null>(null);

	// Car selection state
	manualSelections = signal<CarSelection[]>([]);
	segmentationOverlays = signal<Map<number, HTMLCanvasElement>>(new Map());
	currentFrameData = signal<ImageData | null>(null);

	// Computed state
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

	reset() {
		this.mode.set('normal');
		this.trackLine.set([]);
		this.startIndex.set(null);
		this.manualSelections.set([]);
		this.segmentationOverlays.set(new Map());
		this.currentFrameData.set(null);
		// Don't reset videoSrc as it might be persistent
	}
}
