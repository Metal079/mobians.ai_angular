import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GligenDisplayComponent } from './gligen-display.component';

describe('GligenDisplayComponent', () => {
  let component: GligenDisplayComponent;
  let fixture: ComponentFixture<GligenDisplayComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [GligenDisplayComponent]
    });
    fixture = TestBed.createComponent(GligenDisplayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
