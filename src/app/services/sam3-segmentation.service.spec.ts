import { TestBed } from '@angular/core/testing';
import { Sam3SegmentationService } from './sam3-segmentation.service';

describe('Sam3SegmentationService', () => {
	let service: Sam3SegmentationService;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(Sam3SegmentationService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should initialize with model not ready', () => {
		expect(service.modelReady()).toBe(false);
		expect(service.modelLoading()).toBe(false);
		expect(service.modelError()).toBe(null);
	});

	it('should have default model path', () => {
		expect(service.modelPath()).toBe('/assets/sam3.onnx');
	});

	it('should allow updating model path', () => {
		service.modelPath.set('/custom/path/sam3.onnx');
		expect(service.modelPath()).toBe('/custom/path/sam3.onnx');
	});

	it('should check if model is loaded', () => {
		expect(service.isLoaded()).toBe(false);
	});

	it('should clear state', () => {
		service.clear();
		expect(service.modelReady()).toBe(false);
	});
});
