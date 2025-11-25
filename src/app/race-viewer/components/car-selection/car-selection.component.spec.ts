import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CarSelectionComponent } from './car-selection.component';
import { Sam3SegmentationService } from '../../../services/sam3-segmentation.service';

describe('CarSelectionComponent', () => {
	let component: CarSelectionComponent;
	let fixture: ComponentFixture<CarSelectionComponent>;
	let sam3ServiceSpy: jasmine.SpyObj<Sam3SegmentationService>;

	beforeEach(async () => {
		sam3ServiceSpy = jasmine.createSpyObj('Sam3SegmentationService', [
			'loadModel',
			'runSegmentation',
			'isLoaded',
		]);

		await TestBed.configureTestingModule({
			imports: [CarSelectionComponent],
			providers: [
				{ provide: Sam3SegmentationService, useValue: sam3ServiceSpy },
			],
		}).compileComponents();

		fixture = TestBed.createComponent(CarSelectionComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('should emit modeChange when "Mark Cars" is clicked', () => {
		fixture.componentRef.setInput('canMark', true);
		fixture.componentRef.setInput('isActive', false);
		fixture.detectChanges();

		spyOn(component.modeChange, 'emit');
		const button = fixture.nativeElement.querySelector('button');
		button.click();

		expect(component.modeChange.emit).toHaveBeenCalledWith('marking-cars');
	});

	it('should add selection when handleCanvasClick is called', () => {
		fixture.componentRef.setInput('isActive', true);
		component.handleCanvasClick({ x: 100, y: 100 });
		expect(component.manualSelections().length).toBe(1);
	});

	it('should remove selection when handleCanvasClick is called on existing selection', () => {
		fixture.componentRef.setInput('isActive', true);
		component.handleCanvasClick({ x: 100, y: 100 });
		expect(component.manualSelections().length).toBe(1);

		component.handleCanvasClick({ x: 100, y: 100 });
		expect(component.manualSelections().length).toBe(0);
	});
});
