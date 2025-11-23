import {
	Component,
	ElementRef,
	ViewChild,
	signal,
	effect,
	OnDestroy,
} from '@angular/core';

@Component({
	selector: 'app-race-viewer',
	imports: [],
	templateUrl: './race-viewer.html',
	styleUrl: './race-viewer.css',
})
export class RaceViewer implements OnDestroy {
	@ViewChild('videoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;
	@ViewChild('overlayCanvas') overlayCanvas!: ElementRef<HTMLCanvasElement>;

	videoSrc = signal<string | null>(null);
	isDragging = signal(false);

	constructor() {
		effect(() => {
			const src = this.videoSrc();
			if (src) {
				// Auto-play is handled in template via autoplay attribute or we can do it here
			}
		});
	}

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
			// Accept .mp4 and .mov (video/quicktime)
			if (
				file.type === 'video/mp4' ||
				file.type === 'video/quicktime' ||
				file.name.endsWith('.mov') ||
				file.name.endsWith('.mp4')
			) {
				const oldUrl = this.videoSrc();
				if (oldUrl) {
					URL.revokeObjectURL(oldUrl);
				}
				const url = URL.createObjectURL(file);
				this.videoSrc.set(url);
			} else {
				alert('Please drop an .mp4 or .mov file.');
			}
		}
	}

	onVideoLoadedMetadata() {
		this.updateCanvasSize();
	}

	onResize() {
		this.updateCanvasSize();
	}

	updateCanvasSize() {
		if (this.videoPlayer && this.overlayCanvas) {
			const video = this.videoPlayer.nativeElement;
			const canvas = this.overlayCanvas.nativeElement;
			// Match internal resolution to video resolution
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
		}
	}

	ngOnDestroy() {
		const url = this.videoSrc();
		if (url) {
			URL.revokeObjectURL(url);
		}
	}
}
