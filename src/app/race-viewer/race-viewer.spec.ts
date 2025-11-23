import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { RaceViewer } from './race-viewer';

describe('RaceViewer', () => {
	let component: RaceViewer;
	let fixture: ComponentFixture<RaceViewer>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [RaceViewer],
		}).compileComponents();

		fixture = TestBed.createComponent(RaceViewer);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('should show dropzone initially', () => {
		const compiled = fixture.nativeElement as HTMLElement;
		expect(compiled.querySelector('.dropzone')).toBeTruthy();
	});

	it('should accept .mp4 file and update videoSrc', () => {
		const file = new File(['dummy'], 'test.mp4', { type: 'video/mp4' });
		const event = new DragEvent('drop', {
			dataTransfer: new DataTransfer(),
		});
		event.dataTransfer?.items.add(file);
		component.onDrop(event);
		fixture.detectChanges();
		expect(component.videoSrc()).toContain('blob:');
	});

	it('should not accept non-video files', () => {
		const file = new File(['dummy'], 'test.txt', { type: 'text/plain' });
		const event = new DragEvent('drop', {
			dataTransfer: new DataTransfer(),
		});
		event.dataTransfer?.items.add(file);
		const alertSpy = spyOn(window, 'alert');
		component.onDrop(event);
		fixture.detectChanges();
		expect(alertSpy).toHaveBeenCalledWith('Please drop an .mp4 or .mov file.');
	});

	it('should render sidebar controls as disabled', () => {
		component.videoSrc.set('blob:test');
		fixture.detectChanges();
		const compiled = fixture.nativeElement as HTMLElement;
		const buttons = compiled.querySelectorAll('.sidebar-section button');
		for (let i = 0; i < buttons.length; i++) {
			expect((buttons[i] as HTMLButtonElement).disabled).toBeTrue();
		}
		const checkboxes = compiled.querySelectorAll('.sidebar-section input[type="checkbox"]');
		for (let i = 0; i < checkboxes.length; i++) {
			expect((checkboxes[i] as HTMLInputElement).disabled).toBeTrue();
		}
	});
});
