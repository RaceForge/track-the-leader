import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VideoPlayerComponent } from './video-player.component';

describe('VideoPlayerComponent', () => {
	let component: VideoPlayerComponent;
	let fixture: ComponentFixture<VideoPlayerComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [VideoPlayerComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(VideoPlayerComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('should have initial state', () => {
		expect(component.videoSrc()).toBeNull();
		expect(component.isDragging()).toBeFalse();
	});

	it('should toggle dragging state', () => {
		const event = new DragEvent('dragover');
		component.onDragOver(event);
		expect(component.isDragging()).toBeTrue();

		const leaveEvent = new DragEvent('dragleave');
		component.onDragLeave(leaveEvent);
		expect(component.isDragging()).toBeFalse();
	});
});
