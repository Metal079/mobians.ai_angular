import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InpaintingDisplayComponent } from './inpainting-display.component';

describe('InpaintingDisplayComponent', () => {
  let component: InpaintingDisplayComponent;
  let fixture: ComponentFixture<InpaintingDisplayComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [InpaintingDisplayComponent]
});
    fixture = TestBed.createComponent(InpaintingDisplayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
