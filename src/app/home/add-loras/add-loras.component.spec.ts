import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { MessageService } from 'primeng/api';

import { AddLorasComponent } from './add-loras.component';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { SharedService } from 'src/app/shared.service';

class StableDiffusionServiceStub {
  getLoras() {
    return of([] as any[]);
  }

  getMyLoraSuggestions() {
    return of([] as any[]);
  }

  searchByQuery() {
    return of([] as any[]);
  }
}

class SharedServiceStub {
  getUserDataValue() {
    return { discord_user_id: 'user-1' };
  }
}

class DynamicDialogRefStub {
  close() {}
}

class MessageServiceStub {
  add() {}
}

describe('AddLorasComponent', () => {
  let component: AddLorasComponent;
  let fixture: ComponentFixture<AddLorasComponent>;
  let stableDiffusionService: StableDiffusionServiceStub;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddLorasComponent],
      providers: [
        { provide: StableDiffusionService, useClass: StableDiffusionServiceStub },
        { provide: SharedService, useClass: SharedServiceStub },
        { provide: DynamicDialogRef, useClass: DynamicDialogRefStub },
        {
          provide: DynamicDialogConfig,
          useValue: {
            data: {
              showNSFWLoras: false,
              targetBaseModel: 'Anima',
            },
          },
        },
        { provide: MessageService, useClass: MessageServiceStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(AddLorasComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(AddLorasComponent);
    component = fixture.componentInstance;
    stableDiffusionService = TestBed.inject(StableDiffusionService) as unknown as StableDiffusionServiceStub;
  });

  it('loads the target base model from dialog config', () => {
    component.ngOnInit();

    expect(component.targetBaseModel).toBe('Anima');
  });

  it('filters search results to the active base model', () => {
    const searchResults$ = of([
      { name: 'Anima LoRA', model_name: 'v1', base_model: 'Anima' },
      { name: 'Illustrious LoRA', model_name: 'v1', base_model: 'Illustrious' },
    ]) as any;
    spyOn(stableDiffusionService as any, 'searchByQuery').and.returnValue(searchResults$);
    component.ngOnInit();

    component.searchByLoRAName('test');

    expect(component.searchResults.length).toBe(1);
    expect(component.searchResults[0].base_model).toBe('Anima');
    expect(component.searchResults[0].name).toContain('Anima LoRA');
  });
});