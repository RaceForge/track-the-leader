import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	ViewChild,
	inject,
	model,
	output,
	signal,
} from '@angular/core';
import { NotificationService } from '../../../services/notification.service';

@Component({
	selector: 'app-video-player',

	templateUrl: './video-player.component.html',
	styleUrl: './video-player.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoPlayerComponent {
	private readonly notificationService = inject(NotificationService);

	videoSrc = model<string | null>(null);
	isDragging = signal(false);
	videoFps = signal(30);

	videoLoaded = output<HTMLVideoElement>();

	@ViewChild('videoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;

	onDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		this.isDragging.set(true);
	}

	onDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		this.isDragging.set(false);
	}

	onDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		this.isDragging.set(false);

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			const file = files[0];
			if (file.type === 'video/mp4' || file.type === 'video/quicktime') {
				const url = URL.createObjectURL(file);
				this.videoSrc.set(url);
			} else {
				this.notificationService.show('Please drop an .mp4 or .mov file.', 'error');
			}
		}
	}

	onVideoLoadedMetadata() {
		if (this.videoPlayer) {
			this.videoLoaded.emit(this.videoPlayer.nativeElement);
		}
	}

	play() {
		this.videoPlayer?.nativeElement.play().catch(() => {});
	}

	pause() {
		this.videoPlayer?.nativeElement.pause();
	}

	get currentTime(): number {
		return this.videoPlayer?.nativeElement.currentTime ?? 0;
	}

	get paused(): boolean {
		return this.videoPlayer?.nativeElement.paused ?? true;
	}

	get ended(): boolean {
		return this.videoPlayer?.nativeElement.ended ?? false;
	}

	get nativeElement(): HTMLVideoElement | undefined {
		return this.videoPlayer?.nativeElement;
	}
}
