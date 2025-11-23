import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RaceViewer } from './race-viewer';

describe('RaceViewer', () => {
  let component: RaceViewer;
  let fixture: ComponentFixture<RaceViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RaceViewer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RaceViewer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
