import { TestBed } from '@angular/core/testing';
import { OverlayRendererService } from './overlay-renderer.service';

describe('OverlayRendererService', () => {
	let service: OverlayRendererService;
	let ctx: jasmine.SpyObj<CanvasRenderingContext2D>;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(OverlayRendererService);
		ctx = jasmine.createSpyObj('CanvasRenderingContext2D', [
			'clearRect',
			'beginPath',
			'moveTo',
			'lineTo',
			'stroke',
			'arc',
			'fill',
			'save',
			'restore',
			'drawImage',
			'strokeRect',
			'fillText',
		]);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should clear canvas', () => {
		service.clearCanvas(ctx, 100, 100);
		expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 100, 100);
	});

	it('should render track line', () => {
		const line = [
			{ x: 0, y: 0 },
			{ x: 10, y: 10 },
		];
		service.renderTrackLine(ctx, line, null);
		expect(ctx.beginPath).toHaveBeenCalled();
		expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
		expect(ctx.lineTo).toHaveBeenCalledWith(10, 10);
		expect(ctx.stroke).toHaveBeenCalled();
	});

	it('should render start point', () => {
		const line = [
			{ x: 0, y: 0 },
			{ x: 10, y: 10 },
		];
		service.renderTrackLine(ctx, line, 0);
		expect(ctx.arc).toHaveBeenCalled();
		expect(ctx.fill).toHaveBeenCalled();
	});

	it('should render selections', () => {
		const selections = [
			{
				id: 1,
				bbox: [10, 10, 20, 20] as [number, number, number, number],
				center: { x: 20, y: 20 },
			},
		];
		const overlays = new Map<number, HTMLCanvasElement>();
		service.renderSelections(ctx, selections, overlays, 100, 100);
		expect(ctx.strokeRect).toHaveBeenCalled();
		expect(ctx.fillText).toHaveBeenCalled();
	});
});
