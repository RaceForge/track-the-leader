import { TestBed } from '@angular/core/testing';
import { HomographyService } from './homography.service';

describe('HomographyService', () => {
	let service: HomographyService;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(HomographyService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should return identity homography for reference frame', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 100;
		canvas.height = 100;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not get canvas context');
		const imageData = ctx.createImageData(100, 100);

		service.setReferenceFrame(0, imageData);
		const H = service.computeHomography(0, imageData);

		expect(H).toEqual([
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1]
		]);
	});

	it('should transform points using identity homography', () => {
		const point = { x: 100, y: 200 };
		const canvas = document.createElement('canvas');
		canvas.width = 100;
		canvas.height = 100;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not get canvas context');
		const imageData = ctx.createImageData(100, 100);

		service.setReferenceFrame(0, imageData);
		service.computeHomography(0, imageData);

		const mapped = service.mapToCurrent(point, 0);
		expect(mapped).toEqual(point);
	});

	it('should transform track line', () => {
		const trackLine = [
			{ x: 10, y: 10 },
			{ x: 20, y: 20 },
			{ x: 30, y: 30 }
		];
		const canvas = document.createElement('canvas');
		canvas.width = 100;
		canvas.height = 100;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not get canvas context');
		const imageData = ctx.createImageData(100, 100);

		service.setReferenceFrame(0, imageData);
		service.computeHomography(0, imageData);

		const transformed = service.transformTrackLine(trackLine, 0);
		expect(transformed).toEqual(trackLine);
	});

	it('should clear all data', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 100;
		canvas.height = 100;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not get canvas context');
		const imageData = ctx.createImageData(100, 100);

		service.setReferenceFrame(0, imageData);
		service.clear();

		expect(service.referenceFrameIndex()).toBeNull();
		expect(service.referenceFrameImage()).toBeNull();
		expect(service.currentFrameIndex()).toBe(0);
	});
});
