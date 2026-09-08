import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { DialogService } from 'primeng/dynamicdialog';
import { MessageService } from 'primeng/api';

import { LorasPanelComponent } from './loras-panel.component';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { SharedService } from 'src/app/shared.service';
import { AuthService } from 'src/app/auth/auth.service';
import { LoraHistoryPromptService } from '../lora-history-prompt.service';

class StableDiffusionServiceStub {
  getLoras() {
    return of([] as any[]);
  }

  getLoraPreferences() {
    return of([] as any[]);
  }

  syncLoraPreferences() {
    return of({});
  }
}

class SharedServiceStub {
  private readonly userData$ = new BehaviorSubject<any>(null);

  getUserData() {
    return this.userData$.asObservable();
  }

  setUserData(value: any) {
    this.userData$.next(value);
  }
}

class DialogServiceStub {
  open = jasmine.createSpy('open').and.returnValue({
    onClose: of(null)
  });
}

class MessageServiceStub {
  add = jasmine.createSpy('add');
}

class AuthServiceStub {
  isLoggedIn() {
    return true;
  }
}

class LoraHistoryPromptServiceStub {
  requests$ = new Subject<any>();
}

describe('LorasPanelComponent', () => {
  let component: LorasPanelComponent;
  let fixture: ComponentFixture<LorasPanelComponent>;
  let dialogService: DialogServiceStub;
  let sharedService: SharedServiceStub;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LorasPanelComponent],
      providers: [
        { provide: StableDiffusionService, useClass: StableDiffusionServiceStub },
        { provide: SharedService, useClass: SharedServiceStub },
        { provide: MessageService, useClass: MessageServiceStub },
        { provide: DialogService, useClass: DialogServiceStub },
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: LoraHistoryPromptService, useClass: LoraHistoryPromptServiceStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
      .overrideComponent(LorasPanelComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(LorasPanelComponent);
    component = fixture.componentInstance;
    component.generationRequest = { model: 'anima-model', loras: [], prompt: '' };
    component.modelsTypes = { 'anima-model': 'Anima' };

    dialogService = TestBed.inject(DialogService) as unknown as DialogServiceStub;
    sharedService = TestBed.inject(SharedService) as unknown as SharedServiceStub;
  });

  it('opens the request dialog for Google-authenticated users', () => {
    sharedService.setUserData({ google_user_id: 'google-user-1', user_id: 'internal-user-99' });
    fixture.detectChanges();

    component.openAddLorasDialog();

    expect(dialogService.open).toHaveBeenCalled();
  });

  it('sorts LoRAs by most recently added', () => {
    component.loras = [
      { name: 'Older Lora', version: 'v1', base_model: 'Anima', is_nsfw: false, tags: [], uses: 30, date_added: '2025-01-01T00:00:00Z' },
      { name: 'Newest Lora', version: 'v1', base_model: 'Anima', is_nsfw: false, tags: [], uses: 1, date_added: '2026-02-01T00:00:00Z' },
      { name: 'Middle Lora', version: 'v1', base_model: 'Anima', is_nsfw: false, tags: [], uses: 20, date_added: '2025-08-01T00:00:00Z' },
    ];

    component.onLoraSortChange('recently-added');

    expect(component.filteredLoras.map((lora) => lora.name)).toEqual([
      'Newest Lora',
      'Middle Lora',
      'Older Lora',
    ]);
  });

  it('keeps an incoming character LoRA selection when the character also changes model family', () => {
    const previous = { version_id: 1, name: 'Old style', base_model: 'Illustrious', strength: .4, tags: [] };
    const saved = { version_id: 2, name: 'Character look', base_model: 'Anima', strength: .8, tags: [] };
    component.loras = [previous, { ...saved, strength: 1 }];
    component.selectedLoras = [previous];
    (component as any).lastModelId = 'old-model';
    component.generationRequest = { model: 'anima-model', loras: [saved], prompt: 'blue fox' };

    component.ngDoCheck();

    expect(component.generationRequest.loras.map((lora: any) => lora.version_id)).toEqual([2]);
    expect(component.selectedLoras[0].strength).toBe(.8);
    expect(component.generationRequest.prompt).toBe('blue fox');
  });

  it('still removes incompatible current LoRAs on an ordinary model change', () => {
    const previous = { version_id: 1, name: 'Old style', base_model: 'Illustrious', strength: .4, tags: [] };
    component.loras = [previous];
    component.selectedLoras = [previous];
    (component as any).lastModelId = 'old-model';
    component.generationRequest = { model: 'anima-model', loras: component.selectedLoras, prompt: '' };

    component.ngDoCheck();

    expect(component.generationRequest.loras).toEqual([]);
    expect(component.selectedLoras).toEqual([]);
  });

  it('refilters LoRAs when model type mapping arrives after LoRAs load', () => {
    component.modelsTypes = {};
    component.loras = [
      { name: 'Anima Lora', version: 'v1', base_model: 'Anima', is_nsfw: false, tags: [], uses: 1 },
    ];

    component.filterLoras();

    expect(component.displayedLoras).toEqual([]);

    component.modelsTypes = { 'anima-model': 'Anima' };
    component.ngOnChanges({
      modelsTypes: new SimpleChange({}, component.modelsTypes, false),
    });

    expect(component.displayedLoras.map((lora) => lora.name)).toEqual(['Anima Lora']);
  });
});
