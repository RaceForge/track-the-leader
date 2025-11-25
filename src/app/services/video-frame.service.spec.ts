import { TestBed } from '@angular/core/testing';
import { VideoFrameService } from './video-frame.service';

describe('VideoFrameService', () => {
	let service: VideoFrameService;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(VideoFrameService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should capture frame from video', () => {
		const video = document.createElement('video');
		Object.defineProperty(video, 'videoWidth', { value: 100 });
		Object.defineProperty(video, 'videoHeight', { value: 100 });

		const imageData = service.captureFrame(video);
		expect(imageData).toBeTruthy();
		expect(imageData?.width).toBe(100);
		expect(imageData?.height).toBe(100);
	});

	it('should return null for invalid video dimensions', () => {
		const video = document.createElement('video');
		Object.defineProperty(video, 'videoWidth', { value: 0 });
		Object.defineProperty(video, 'videoHeight', { value: 0 });

		const imageData = service.captureFrame(video);
		expect(imageData).toBeNull();
	});

	it('should convert client coordinates to video coordinates', () => {
		const rect = {
			left: 10,
			top: 10,
			width: 200,
			height: 200,
		} as DOMRect;
		const videoWidth = 100;
		const videoHeight = 100;

		// Click at 110, 110 (center of rect)
		// Should map to 50, 50 in video coords
		const coords = service.getClientToVideoCoordinates(
			110,
			110,
			rect,
			videoWidth,
			videoHeight,
		);

		expect(coords.x).toBe(50);
		expect(coords.y).toBe(50);
	});
});
