import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MotionTrackingService } from '../services/motion-tracking.service';
import { OverlayRendererService } from '../services/overlay-renderer.service';

import { RaceViewer } from './race-viewer';

describe('RaceViewer', () => {
	let component: RaceViewer;
	let fixture: ComponentFixture<RaceViewer>;
	let mockMotionTrackingService: jasmine.SpyObj<MotionTrackingService>;
	let mockOverlayRendererService: jasmine.SpyObj<OverlayRendererService>;

	beforeEach(async () => {
		mockMotionTrackingService = jasmine.createSpyObj('MotionTrackingService', [
			'initializeTemplates',
			'clearTemplates',
			'updateTrackedPositions',
		]);

		mockOverlayRendererService = jasmine.createSpyObj('OverlayRendererService', [
			'clearCanvas',
			'renderTrackLine',
			'renderSelections',
		]);

		await TestBed.configureTestingModule({
			imports: [RaceViewer],
		})
			.overrideComponent(RaceViewer, {
				add: {
					providers: [
						{
							provide: MotionTrackingService,
							useValue: mockMotionTrackingService,
						},
						{
							provide: OverlayRendererService,
							useValue: mockOverlayRendererService,
						},
					],
				},
			})
			.compileComponents();

		fixture = TestBed.createComponent(RaceViewer);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('should contain video player component', () => {
		const compiled = fixture.nativeElement as HTMLElement;
		expect(compiled.querySelector('app-video-player')).toBeTruthy();
	});

	it('should render sidebar controls as disabled', () => {
		component.videoSrc.set('blob:test');
		fixture.detectChanges();
		const compiled = fixture.nativeElement as HTMLElement;
		const checkboxes = compiled.querySelectorAll(
			'.sidebar-section input[type="checkbox"]',
		);
		for (let i = 0; i < checkboxes.length; i++) {
			expect((checkboxes[i] as HTMLInputElement).disabled).toBeTrue();
		}
	});

	// Milestone 2: Track mapping tests
	describe('Track Mapping', () => {
		beforeEach(() => {
			component.videoSrc.set('blob:test');
			fixture.detectChanges();
		});

		it('should transition to mapping mode when "Select Track Line" is clicked', () => {
			const button = fixture.nativeElement.querySelector('button');
			button?.click();
			fixture.detectChanges();
			expect(component.mode()).toBe('mapping');
		});

		it('should add points to trackLine when canvas is clicked in mapping mode', () => {
			component.mode.set('mapping');
			fixture.detectChanges();
			const canvas = fixture.nativeElement.querySelector('canvas');
			const clickEvent = new MouseEvent('click', {
				clientX: 100,
				clientY: 100,
			});
			canvas?.dispatchEvent(clickEvent);
			fixture.detectChanges();
			expect(component.trackLine().length).toBe(1);
		});

		it('should undo the last point when "Undo" is clicked', () => {
			component.mode.set('mapping');
			component.trackLine.set([
				{ x: 10, y: 10 },
				{ x: 20, y: 20 },
			]);
			fixture.detectChanges();
			const undoButton = Array.from<HTMLButtonElement>(
				fixture.nativeElement.querySelectorAll('button'),
			).find((btn) => btn.textContent?.includes('Undo'));
			undoButton?.click();
			fixture.detectChanges();
			expect(component.trackLine().length).toBe(1);
		});

		it('should reset the trackLine when "Reset" is clicked', () => {
			component.mode.set('mapping');
			component.trackLine.set([
				{ x: 10, y: 10 },
				{ x: 20, y: 20 },
			]);
			fixture.detectChanges();
			const resetButton = Array.from<HTMLButtonElement>(
				fixture.nativeElement.querySelectorAll('button'),
			).find((btn) => btn.textContent?.includes('Reset'));
			resetButton?.click();
			fixture.detectChanges();
			expect(component.trackLine().length).toBe(0);
		});

		it('should enable "Finish" button when trackLine has more than 4 points', () => {
			component.mode.set('mapping');
			component.trackLine.set([
				{ x: 10, y: 10 },
				{ x: 20, y: 20 },
				{ x: 30, y: 30 },
				{ x: 40, y: 40 },
				{ x: 50, y: 50 },
			]);
			fixture.detectChanges();
			const finishButton = Array.from<HTMLButtonElement>(
				fixture.nativeElement.querySelectorAll('button'),
			).find((btn) => btn.textContent?.includes('Finish'));
			expect(finishButton?.disabled).toBeFalse();
		});

		it('should transition to start/finish mode when "Finish" is clicked with enough points', () => {
			component.mode.set('mapping');
			component.trackLine.set([
				{ x: 10, y: 10 },
				{ x: 20, y: 20 },
				{ x: 30, y: 30 },
				{ x: 40, y: 40 },
				{ x: 50, y: 50 },
			]);
			fixture.detectChanges();
			const finishButton = Array.from<HTMLButtonElement>(
				fixture.nativeElement.querySelectorAll('button'),
			).find((btn) => btn.textContent?.includes('Finish'));
			finishButton?.click();
			fixture.detectChanges();
			expect(component.mode()).toBe('start-finish');
		});

		it('should select start/finish point when canvas is clicked in start/finish mode', () => {
			component.mode.set('start-finish');
			component.trackEditor.mode.set('start-finish');
			component.trackLine.set([
				{ x: 100, y: 100 },
				{ x: 200, y: 200 },
				{ x: 300, y: 300 },
			]);
			fixture.detectChanges();
			const canvas = fixture.nativeElement.querySelector('canvas');
			const clickEvent = new MouseEvent('click', {
				clientX: 110,
				clientY: 110,
			});
			canvas?.dispatchEvent(clickEvent);
			fixture.detectChanges();
			expect(component.startIndex()).not.toBeNull();
		});

		it('should confirm start/finish point and exit mode when "Confirm Start/Finish" is clicked', () => {
			component.mode.set('start-finish');
			component.trackEditor.mode.set('start-finish');
			component.trackLine.set([
				{ x: 10, y: 10 },
				{ x: 20, y: 20 },
			]);
			component.startIndex.set(0);
			fixture.detectChanges();
			const confirmButton = Array.from<HTMLButtonElement>(
				fixture.nativeElement.querySelectorAll('button'),
			).find((btn) => btn.textContent?.includes('Confirm Start/Finish'));
			confirmButton?.click();
			fixture.detectChanges();
			expect(component.mode()).toBe('locked');
		});
	});
});
