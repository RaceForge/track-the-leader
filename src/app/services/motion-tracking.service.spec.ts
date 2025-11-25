import { TestBed } from '@angular/core/testing';
import { MotionTrackingService } from './motion-tracking.service';

// Mock OpenCV
const mockMat = {
	cols: 100,
	rows: 100,
	delete: jasmine.createSpy('delete'),
	roi: jasmine.createSpy('roi').and.returnValue({
		clone: jasmine.createSpy('clone').and.returnValue({
			cols: 10,
			rows: 10,
			delete: jasmine.createSpy('delete'),
		}),
		cols: 10,
		rows: 10,
		delete: jasmine.createSpy('delete'),
	}),
};

const mockCv = {
	Mat: jasmine.createSpy('Mat').and.returnValue(mockMat),
	matFromImageData: jasmine.createSpy('matFromImageData').and.returnValue(mockMat),
	cvtColor: jasmine.createSpy('cvtColor'),
	COLOR_RGBA2GRAY: 1,
	Rect: jasmine.createSpy('Rect').and.returnValue({ width: 10, height: 10 }),
	matchTemplate: jasmine.createSpy('matchTemplate'),
	minMaxLoc: jasmine.createSpy('minMaxLoc').and.returnValue({
		maxVal: 0.9,
		maxLoc: { x: 5, y: 5 },
	}),
	TM_CCOEFF_NORMED: 1,
};

(window as any).cv = mockCv;

describe('MotionTrackingService', () => {
	let service: MotionTrackingService;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(MotionTrackingService);
		// Reset spies
		mockMat.delete.calls.reset();
		mockCv.matFromImageData.calls.reset();
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should initialize templates', () => {
		const frameData = new ImageData(100, 100);
		const selections = [
			{
				id: 1,
				bbox: [10, 10, 20, 20] as [number, number, number, number],
				center: { x: 20, y: 20 },
			},
		];

		service.initializeTemplates(frameData, selections);

		expect(mockCv.matFromImageData).toHaveBeenCalled();
		expect(mockCv.Rect).toHaveBeenCalled();
	});

	it('should update tracked positions', () => {
		const frameData = new ImageData(100, 100);
		const selections = [
			{
				id: 1,
				bbox: [10, 10, 20, 20] as [number, number, number, number],
				center: { x: 20, y: 20 },
			},
		];

		// Initialize first to have templates
		service.initializeTemplates(frameData, selections);

		const updated = service.updateTrackedPositions(frameData, selections);

		expect(updated.length).toBe(1);
		expect(mockCv.matchTemplate).toHaveBeenCalled();
	});
});
