import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { SharedService } from 'src/app/shared.service';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';

import { FaqComponent } from './faq.component';

describe('FaqComponent', () => {
  let component: FaqComponent;
  let fixture: ComponentFixture<FaqComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FaqComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
        { provide: HttpClient, useValue: {} },
        {
          provide: SharedService,
          useValue: {
            getPrompt: () => of(''),
            getUserData: () => of(null),
            setPrompt: () => {}
          }
        },
        { provide: StableDiffusionService, useValue: { discordLogin: () => of({}) } }
      ]
    })
      .overrideComponent(FaqComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(FaqComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
