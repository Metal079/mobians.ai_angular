import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SharedService } from 'src/app/shared.service';

import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        {
          provide: SharedService,
          useValue: {
            getUserData: () => of(null),
            getReferenceImageValue: () => null
          }
        }
      ]
    })
      .overrideComponent(HomeComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
