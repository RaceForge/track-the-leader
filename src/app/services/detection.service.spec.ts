import { TestBed } from '@angular/core/testing';
import { DetectionService } from './detection.service';

describe('DetectionService', () => {
	let service: DetectionService;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(DetectionService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should initialize with model not ready', () => {
		expect(service.modelReady()).toBe(false);
		expect(service.modelLoading()).toBe(false);
		expect(service.modelError()).toBe(null);
	});

	it('should have default configuration values', () => {
		expect(service.confidenceThreshold()).toBe(0.5);
		expect(service.nmsThreshold()).toBe(0.45);
		expect(service.targetClasses().length).toBeGreaterThan(0);
		expect(service.showDetections()).toBe(false);
	});

	it('should allow updating configuration signals', () => {
		service.confidenceThreshold.set(0.7);
		expect(service.confidenceThreshold()).toBe(0.7);

		service.nmsThreshold.set(0.5);
		expect(service.nmsThreshold()).toBe(0.5);

		service.showDetections.set(true);
		expect(service.showDetections()).toBe(true);
	});

	it('should return null for detections of uncached frame', () => {
		const result = service.getDetections(0);
		expect(result).toBe(null);
	});

	it('should clear detection cache', () => {
		service.clear();
		expect(service.getDetections(0)).toBe(null);
	});
});
