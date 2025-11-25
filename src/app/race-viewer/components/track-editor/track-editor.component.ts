import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
	model,
	output,
	signal,
} from '@angular/core';
import { type Point2D } from '../../../types/geometry';

@Component({
	selector: 'app-track-editor',
	templateUrl: './track-editor.component.html',
	styleUrl: './track-editor.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrackEditorComponent {
	// Inputs
	isActive = input<boolean>(false);
	trackLine = model<Point2D[]>([]);
	startIndex = model<number | null>(null);

	// Outputs
	start = output<void>();
	completed = output<void>();
	cancelled = output<void>();
	modeChange = output<'mapping' | 'start-finish'>();

	// Internal state
	mode = signal<'mapping' | 'start-finish'>('mapping');

	// Computed
	canFinishMapping = computed(() => this.trackLine().length > 4);
	isMapping = computed(() => this.mode() === 'mapping');
	isSelectingStartFinish = computed(() => this.mode() === 'start-finish');

	onStart() {
		this.start.emit();
		this.mode.set('mapping');
		this.modeChange.emit('mapping');
		this.trackLine.set([]);
		this.startIndex.set(null);
	}

	handleCanvasClick(point: Point2D) {
		if (!this.isActive()) return;

		if (this.mode() === 'mapping') {
			// Add point to trackLine
			this.trackLine.update((line) => [...line, point]);
		} else if (this.mode() === 'start-finish') {
			// Find nearest point on polyline
			const nearestIndex = this.findNearestPointIndex(point);
			if (nearestIndex !== null) {
				this.startIndex.set(nearestIndex);
			}
		}
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
		this.mode.set('mapping');
		this.modeChange.emit('mapping');
	}

	onFinishMapping() {
		if (this.canFinishMapping()) {
			this.mode.set('start-finish');
			this.modeChange.emit('start-finish');
		}
	}

	onConfirmStartFinish() {
		if (this.startIndex() !== null) {
			this.completed.emit();
		}
	}

	onCancel() {
		this.cancelled.emit();
	}

	// Find nearest point on the polyline to given position
	private findNearestPointIndex(pos: Point2D): number | null {
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
}
