import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { GligenService } from 'src/app/gligen.service';
import { SharedService } from 'src/app/shared.service';

import { GligenDisplayComponent } from './gligen-display.component';

describe('GligenDisplayComponent', () => {
  let component: GligenDisplayComponent;
  let fixture: ComponentFixture<GligenDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GligenDisplayComponent],
      providers: [
        { provide: GligenService, useValue: { drawingEnabled$: of(false) } },
        { provide: SharedService, useValue: { getReferenceImageValue: () => null } }
      ]
    })
      .overrideComponent(GligenDisplayComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(GligenDisplayComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
