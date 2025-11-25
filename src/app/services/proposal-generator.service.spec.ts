import { TestBed } from '@angular/core/testing';
import { ProposalGeneratorService } from './proposal-generator.service';

describe('ProposalGeneratorService', () => {
	let service: ProposalGeneratorService;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(ProposalGeneratorService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('should have default configuration', () => {
		expect(service.minArea()).toBe(500);
		expect(service.maxArea()).toBe(50000);
		expect(service.diffThreshold()).toBe(30);
	});

	it('should allow updating configuration signals', () => {
		service.minArea.set(1000);
		expect(service.minArea()).toBe(1000);

		service.maxArea.set(60000);
		expect(service.maxArea()).toBe(60000);

		service.diffThreshold.set(40);
		expect(service.diffThreshold()).toBe(40);
	});

	it('should clear state', () => {
		service.clear();
		// Should not throw error
		expect(true).toBe(true);
	});
});
