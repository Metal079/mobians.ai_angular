import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrainComponent } from './train.component';

describe('TrainComponent', () => {
  let component: TrainComponent;
  let fixture: ComponentFixture<TrainComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TrainComponent]
    });
    fixture = TestBed.createComponent(TrainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
