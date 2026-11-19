import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { AccountCtaService } from 'src/app/auth/account-cta.service';
import { CharactersService } from 'src/app/characters/characters.service';
import { SharedService } from 'src/app/shared.service';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { RegionalEditorComponent } from './regional-editor.component';
import { RegionalEditorService } from './regional-editor.service';
import { normaliseRegionalConfig } from './regional-state';
import { REGIONAL_TEMPLATES } from './regional-templates';

const sdxl = { model_id: 'novaMobianXL_v20', display_name: 'novaMobianXL_v20', base_model: 'Illustrious', supports_regional_prompting: true } as any;
const krea = { model_id: 'Kroma-Krea2', display_name: 'Kroma Krea 2', base_model: 'Krea 2', supports_regional_prompting: true, supports_negative_prompt: false } as any;
const sd15 = { model_id: 'sonicDiffusionV4', display_name: 'SonicDiffusionV4', base_model: 'SD 1.5', supports_regional_prompting: false } as any;
// LoRAs per region are on only when /models says so.
const sdxlLoras = {
  ...sdxl, regional: {
    supported: true, max_regions: 8, negative_prompts: true, layout_hints: false,
    job_types: ['txt2img', 'img2img', 'inpainting', 'upscale', 'txt2img_upscale'], region_loras: true, max_region_loras: 2, max_total_loras: 3,
  },
} as any;
const loraCatalog = [
  { id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', base_model: 'Illustrious', trigger_words: ['amy rose', 'red dress'], image_url: null },
  { id: 12, version_id: 1201, name: 'Shadow', version: 'v1', base_model: 'Illustrious', trigger_words: [], image_url: null },
  { id: 13, version_id: 1301, name: 'Rouge', version: 'v1', base_model: 'Illustrious', is_nsfw: true },
  { id: 14, version_id: 1401, name: 'Cream', version: 'v1', base_model: 'Anima' },
];

describe('RegionalEditorComponent', () => {
  let fixture: ComponentFixture<RegionalEditorComponent>;
  let component: RegionalEditorComponent;
  let store: RegionalEditorService;
  let api: { getRegionalPromptPresets: jasmine.Spy; syncRegionalPromptPresets: jasmine.Spy; getLoras: jasmine.Spy };
  // "Use a character" in a region: one saved character with two LoRAs (catalog ids 11 and 12).
  const characters = {
    owner: 'token',
    saved: new Subject<string>(),
    list: jasmine.createSpy('list').and.resolveTo({ characters: [] }),
    search: jasmine.createSpy('search').and.resolveTo({ items: [], next_cursor: null }),
    get: async () => ({ id: 'amy', name: 'Amy Rose', default_image_id: 'amy-1', images: [{ id: 'amy-1', recipe: {
      label: 'Original look', model: 'novaMobianXL_v20', appearance: 'amy rose, pink fur', scene: '', negative_prompt: '', guidance_scale: 4,
      width: 512, height: 768, loras: [{ id: 11, version_id: 1101, name: 'Amy Rose', strength: 0.9 }, { id: 12, version_id: 1201, name: 'Shadow', strength: 0.5 }],
    } }] }),
    defaultLook: (detail: any) => detail.images[0],
    recordLoaded: () => {},
    recordEvent: () => {},
  };

  beforeEach(async () => {
    localStorage.removeItem('mobians:regional-presets');
    api = {
      getRegionalPromptPresets: jasmine.createSpy('get').and.returnValue(of([])),
      syncRegionalPromptPresets: jasmine.createSpy('sync').and.returnValue(of({ success: true, synced_count: 1 })),
      getLoras: jasmine.createSpy('getLoras').and.returnValue(of(loraCatalog)),
    };
    await TestBed.configureTestingModule({
      imports: [RegionalEditorComponent],
      providers: [
        provideNoopAnimations(),
        { provide: StableDiffusionService, useValue: api },
        { provide: SharedService, useValue: { getImages: () => new BehaviorSubject([]).asObservable() } },
        { provide: MessageService, useValue: { add: jasmine.createSpy('add') } },
        { provide: CharactersService, useValue: characters },
        { provide: AccountCtaService, useValue: { requestLogin: jasmine.createSpy('requestLogin') } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RegionalEditorComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(RegionalEditorService);
    store.selectedId.set(null);
    fixture.componentRef.setInput('config', normaliseRegionalConfig({ enabled: false, version: 2, regions: [] }));
    fixture.componentRef.setInput('model', sdxl);
    fixture.componentRef.setInput('models', [sdxl, krea, sd15]);
    fixture.componentRef.setInput('mainPrompt', 'two hedgehogs, city, night');
    fixture.componentRef.setInput('aspectRatio', { width: 512, height: 768, aspectRatio: 'portrait', model: 'x' });
    fixture.componentRef.setInput('isLoggedIn', false);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.removeItem('mobians:regional-presets'));

  const el = (): HTMLElement => fixture.nativeElement;
  const render = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };

  it('switching on shows the layouts; a layout creates regions and saves', async () => {
    const saves = spyOn(component.save, 'emit');
    (el().querySelector('.rp-switch input') as HTMLInputElement).click();
    await render();
    expect(component.config.enabled).toBeTrue();
    expect(el().querySelectorAll('.rp-template').length).toBe(7);
    (el().querySelector('.rp-template') as HTMLButtonElement).click();
    await render();
    expect(component.config.regions.length).toBe(2);
    expect(el().querySelectorAll('.rc-box').length).toBe(2);
    expect(el().querySelectorAll('.rp-item').length).toBe(2);
    expect(saves).toHaveBeenCalled();
  });

  it('a quick mouse click on a box selects it and keeps it selected (the captured click lands on the frame)', async () => {
    (el().querySelector('.rp-switch input') as HTMLInputElement).click();
    await render();
    (el().querySelector('.rp-template') as HTMLButtonElement).click();   // Left / Right: two boxes
    await render();
    store.selectedId.set(null);
    await render();
    const second = component.config.regions[1];
    const box = el().querySelector(`[data-region-id="${second.id}"]`) as HTMLElement;
    const frame = el().querySelector('.rc-frame') as HTMLElement;
    const rect = box.getBoundingClientRect();
    const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, pointerId: 7,
                 pointerType: 'mouse', button: 0, bubbles: true };
    box.dispatchEvent(new PointerEvent('pointerdown', at));
    // With pointer capture the browser targets the release and its click at the frame, not the box.
    frame.dispatchEvent(new PointerEvent('pointerup', at));
    frame.dispatchEvent(new MouseEvent('click', { clientX: at.clientX, clientY: at.clientY, bubbles: true }));
    await render();
    expect(store.selectedId()).toBe(second.id);
    expect(el().querySelectorAll('.rp-item textarea').length).toBe(1);   // its editor stays open

    // A second quick click on the now-selected box also keeps it selected.
    box.dispatchEvent(new PointerEvent('pointerdown', at));
    frame.dispatchEvent(new PointerEvent('pointerup', at));
    frame.dispatchEvent(new MouseEvent('click', { clientX: at.clientX, clientY: at.clientY, bubbles: true }));
    await render();
    expect(store.selectedId()).toBe(second.id);

    // A click on empty canvas still clears the selection (touch-style tap: no drag started).
    frame.dispatchEvent(new MouseEvent('click', { clientX: rect.left - 1, clientY: rect.top + 2, bubbles: true }));
    await render();
    expect(store.selectedId()).toBeNull();
  });

  it('adds, duplicates, deletes and undoes regions within the model limit', async () => {
    component.addRegion();
    component.duplicateRegion(component.config.regions[0].id);
    expect(component.config.regions.length).toBe(2);
    expect(store.selectedId()).toBe(component.config.regions[1].id);
    component.deleteRegion(component.config.regions[1].id);
    expect(component.config.regions.length).toBe(1);
    component.undo();
    expect(component.config.regions.length).toBe(2);
    component.redo();
    expect(component.config.regions.length).toBe(1);
    for (let i = 0; i < 10; i++) component.addRegion();
    expect(component.config.regions.length).toBe(8);
  });

  it('shows region negatives, the composed prompt and the main-prompt toggle on SDXL but not on Krea 2', async () => {
    component.addRegion();
    const region = component.config.regions[0];
    region.prompt = 'sonic the hedgehog';
    await render();
    expect(el().querySelector('[id*="-neg-"]')).not.toBeNull();
    expect(el().querySelector('.rp-preview')?.textContent).toContain('two hedgehogs, city, night, (sonic the hedgehog:1.2)');   // SDXL weights region text
    expect(el().querySelector('[id$="-inherit"]')).not.toBeNull();
    expect(el().querySelector('[id$="-hints"]')).toBeNull();

    fixture.componentRef.setInput('model', krea);
    await render();
    expect(el().querySelector('[id*="-neg-"]')).toBeNull();
    expect(el().querySelector('[id$="-inherit"]')).toBeNull();
    expect(el().querySelector('[id$="-hints"]')).not.toBeNull();
    // Layout hints are opt-in: no preview until the toggle is on.
    expect((el().querySelector('[id$="-hints"]') as HTMLInputElement).checked).toBeFalse();
    expect(el().querySelector('.rp-settings .rp-preview')).toBeNull();
    (el().querySelector('[id$="-hints"]') as HTMLInputElement).click();
    await render();
    expect(component.config.layout_hints).toBeTrue();
    expect(el().querySelector('.rp-settings .rp-preview')?.textContent).toContain('sonic the hedgehog');
  });

  it('keeps regions on an unsupported model and offers supported models', async () => {
    component.addRegion();
    fixture.componentRef.setInput('model', sd15);
    const switches = spyOn(component.switchModel, 'emit');
    await render();
    expect(component.config.enabled).toBeTrue();
    expect(el().querySelector('.rp-banner-paused')?.textContent).toContain('does not support regional prompting');
    const options = el().querySelectorAll('.rp-model-switch .rp-chip-btn');
    expect(options.length).toBe(2);
    (options[0] as HTMLButtonElement).click();
    expect(switches).toHaveBeenCalledWith('novaMobianXL_v20');
  });

  it('records typing as one undo step per field and debounces saving', async () => {
    jasmine.clock().install();
    try {
      component.addRegion();
      const region = component.config.regions[0];
      const saves = spyOn(component.save, 'emit');
      const input = document.createElement('textarea');
      for (const text of ['s', 'so', 'son']) {
        input.value = text;
        component.onTextInput(region, 'prompt', { target: input } as any);
      }
      expect(saves).not.toHaveBeenCalled();
      jasmine.clock().tick(450);
      expect(saves).toHaveBeenCalledTimes(1);
      component.undo();
      expect(component.config.regions[0].prompt).toBe('');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('saves guest presets in the browser and asks before replacing one with the same name', async () => {
    component.addRegion();
    component.config.regions[0].prompt = 'amy rose';
    component.presetName = 'Duo';
    component.savePreset();
    expect(JSON.parse(localStorage.getItem('mobians:regional-presets') || '[]').length).toBe(1);
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    component.presetName = 'duo';
    component.addRegion();
    component.savePreset();
    expect(confirm).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('mobians:regional-presets') || '[]')[0].regions.length).toBe(1);
    confirm.and.returnValue(true);
    component.savePreset();
    const stored = JSON.parse(localStorage.getItem('mobians:regional-presets') || '[]');
    expect(stored.length).toBe(1);
    expect(stored[0].regions.length).toBe(2);
    expect(api.syncRegionalPromptPresets).not.toHaveBeenCalled();
  });

  it('keeps presets within the 8-region account limit and says what was left out', () => {
    fixture.componentRef.setInput('model', { ...sdxl, regional: { supported: true, max_regions: 12, negative_prompts: true, layout_hints: false, job_types: ['txt2img'] } });
    fixture.detectChanges();
    for (let i = 0; i < 10; i++) component.addRegion();
    expect(component.config.regions.length).toBe(10);
    component.presetName = 'Crowd';
    component.savePreset();
    const stored = JSON.parse(localStorage.getItem('mobians:regional-presets') || '[]');
    expect(stored[0].regions.length).toBe(8);
    const messages = TestBed.inject(MessageService) as any;
    expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Preset saved', detail: jasmine.stringMatching(/last 2 were left out/) }));
  });

  it('keeps edge handles inside the canvas for boxes that touch the image edges', async () => {
    component.applyTemplate(component.templates[0]);   // left/right halves; the top of the list (right half) is selected
    await render();
    const selection = el().querySelector('.rc-selection') as HTMLElement;
    expect(selection.classList).toContain('rc-at-right');
    expect(selection.classList).toContain('rc-at-top');
    expect(selection.classList).toContain('rc-at-bottom');
    expect(selection.classList).not.toContain('rc-at-left');
  });

  describe('region list order and fields', () => {
    const items = () => Array.from(el().querySelectorAll('.rp-list > .rp-item')) as HTMLElement[];
    const swatches = () => items().map(item => item.querySelector('.rp-swatch')!.textContent!.trim());

    it('lists regions front to back: the front-most (highest number) first, new ones on top', async () => {
      component.addRegion();
      component.addRegion();
      component.addRegion();
      await render();
      expect(swatches()).toEqual(['3', '2', '1']);
      expect(el().querySelector('.rp-order-note')?.textContent).toContain('front to back');
      component.addRegion();
      await render();
      expect(swatches()).toEqual(['4', '3', '2', '1']);
      expect(component.selectedId).toBe(component.config.regions[3].id);
    });

    it('bring forward moves a region up the list and toward the front', async () => {
      component.addRegion();
      component.addRegion();
      const back = component.config.regions[0].id;
      await render();
      (items()[1].querySelector('[aria-label="Bring forward"]') as HTMLButtonElement).click();
      await render();
      expect(component.config.regions[1].id).toBe(back);              // last = drawn on top
      expect(items()[0].querySelector('.rp-item-snippet')).toBeTruthy();
      expect(component.listOrder[0].region.id).toBe(back);
      expect((items()[0].querySelector('[aria-label="Bring forward"]') as HTMLButtonElement).disabled).toBeTrue();
      expect((items()[1].querySelector('[aria-label="Send backward"]') as HTMLButtonElement).disabled).toBeTrue();
    });

    it('has no name field, and the list and boxes ignore an old saved name', async () => {
      component.addRegion();
      component.config.regions[0].name = 'Old name';
      await render();
      expect(el().querySelector('[id*="-name-"]')).toBeNull();
      expect(el().textContent).not.toContain('shown on the box only');
      expect(items()[0].querySelector('.rp-item-name')!.textContent!.trim()).toBe('Region 1');
      expect(el().textContent).not.toContain('Old name');
    });

    it('deleting selects the region below it in the list; a duplicate has no name and sits just above', async () => {
      component.addRegion();
      component.addRegion();
      component.addRegion();
      const [first, second, third] = component.config.regions.map(region => region.id);
      component.deleteRegion(second);
      expect(component.selectedId).toBe(first);
      component.config.regions[0].name = 'Old name';
      component.duplicateRegion(first);
      expect(component.config.regions.map(region => region.id).slice(0, 1)).toEqual([first]);
      expect(component.config.regions[1].name).toBe('');
      expect(component.config.regions[2].id).toBe(third);
    });
  });

  describe('LoRAs for this box', () => {
    const openRegion = async (model: any, loras?: any[]) => {
      fixture.componentRef.setInput('model', model);
      fixture.componentRef.setInput('config', normaliseRegionalConfig({
        enabled: true, version: 2, regions: [{ id: 'r-a', prompt: 'smiling', x: 0, y: 0, width: 0.5, height: 1, loras }],
      }));
      store.selectedId.set('r-a');
      await render();
    };
    const typeInto = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };

    it('picks a compatible LoRA, sets its strength, adds its trigger words and removes it (each step undoable)', async () => {
      const saves = spyOn(component.save, 'emit');
      await openRegion(sdxlLoras);
      expect(el().querySelector('.rl-title')?.textContent).toContain('LoRAs for this box');
      (el().querySelector('.rl-add') as HTMLButtonElement).click();
      await render();
      // Same catalog as the LoRA panel, filtered to the model's base model; NSFW hidden by default.
      const names = () => Array.from(el().querySelectorAll('.rl-result .rl-chip-name')).map(node => node.textContent?.trim());
      expect(names()).toEqual(['Amy Rose', 'Shadow']);
      typeInto(el().querySelector('.rl-search-input') as HTMLInputElement, 'amy');
      await render();
      expect(names()).toEqual(['Amy Rose']);
      (el().querySelector('.rl-result') as HTMLButtonElement).click();
      await render();
      const region = component.config.regions[0];
      expect(region.loras).toEqual([{ id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 0.8, base_model: 'Illustrious' }]);
      expect(saves).toHaveBeenCalled();
      expect(el().querySelector('.rp-tag-lora')?.textContent).toContain('1');
      expect(el().querySelector('.rl-chip .rl-chip-name')?.textContent).toContain('Amy Rose');

      const range = el().querySelector('.rl-range') as HTMLInputElement;
      range.value = '1.2';
      range.dispatchEvent(new Event('input'));
      expect(component.config.regions[0].loras![0].strength).toBe(1.2);

      (el().querySelector('.rl-trigger') as HTMLButtonElement).click();
      await render();
      expect(component.config.regions[0].prompt).toBe('smiling, amy rose, red dress');
      expect(el().querySelector('.rl-trigger')).toBeNull();
      expect(store.undo(component.config)).toBeTrue();
      expect(component.config.regions[0].prompt).toBe('smiling');
      expect(component.config.regions[0].loras![0].strength).toBe(1.2);
      await render();

      (el().querySelector('.rl-chip .rl-icon-btn') as HTMLButtonElement).click();
      await render();
      expect(component.config.regions[0].loras).toBeUndefined();
      expect(el().querySelector('.rp-tag-lora')).toBeNull();
      expect(store.undo(component.config)).toBeTrue();
      expect(component.config.regions[0].loras?.length).toBe(1);
    });

    it('stops offering LoRAs when the image is at its LoRA limit (LoRA panel included)', async () => {
      fixture.componentRef.setInput('jobLoras', [{ id: 1 }, { id: 2 }, { id: 3 }]);
      await openRegion(sdxlLoras);
      expect(el().querySelector('.rl-add')).toBeNull();
      expect(el().querySelector('.rl .rl-hint')?.textContent).toContain('already uses its 3 LoRAs');
      fixture.componentRef.setInput('jobLoras', [{ id: 1 }]);
      await render();
      expect(el().querySelector('.rl-add')).not.toBeNull();
    });

    it('marks a LoRA made for another base model as paused', async () => {
      await openRegion({ ...sdxlLoras, base_model: 'Anima' }, [{ id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 1, base_model: 'Illustrious' }]);
      expect(el().querySelector('.rl-chip')?.classList).toContain('rl-chip-paused');
      expect(el().querySelector('.rl-note')?.textContent).toContain('Made for Illustrious');
      expect(component.status.warnings.join(' ')).toContain('paused');
    });

    it('is hidden on Krea and SD 1.5; the box keeps its LoRAs, paused', async () => {
      const loras = [{ id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 1 }];
      await openRegion(krea, loras);
      expect(el().querySelector('app-regional-lora-picker')).toBeNull();
      expect(el().querySelector('.rp-item-body .rp-note')?.textContent).toContain('paused');
      expect(el().querySelector('.rp-tag-lora')?.classList).toContain('rp-tag-lora-paused');
      expect(component.config.regions[0].loras?.length).toBe(1);
      expect(api.getLoras).not.toHaveBeenCalled();
    });

    it('presets keep region LoRAs as catalog references and applying one restores them', async () => {
      await openRegion(sdxlLoras, [{ id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 0.7, base_model: 'Illustrious' }]);
      component.presetName = 'With Amy';
      component.savePreset();
      const stored = JSON.parse(localStorage.getItem('mobians:regional-presets') || '[]');
      expect(stored[0].regions[0].loras).toEqual([{ id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', strength: 0.7 }]);
      component.config.regions = [];
      component.applyPreset(component.presets()[0]);
      expect(component.config.regions[0].loras).toEqual([jasmine.objectContaining({ id: 11, version_id: 1101, strength: 0.7 })]);
    });
  });

  it('commits exact geometry on change and restores invalid entries', () => {
    component.addRegion();
    const region = component.config.regions[0];
    const input = document.createElement('input');
    input.type = 'number';
    input.value = '150';
    component.onGeometry(region, 'width', { target: input } as any);
    expect(region.width).toBe(1);
    expect(region.x).toBe(0);
    expect(input.value).toBe('100');
    input.value = '';
    component.onGeometry(region, 'x', { target: input } as any);
    expect(input.value).toBe('0');
  });

  describe('decimal sizes (user report 2026-11-17: 33.3 was flagged invalid; three columns read 33.3 x 3)', () => {
    const typeInto = (region: any, key: 'x' | 'y' | 'width' | 'height', text: string): HTMLInputElement => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.min = '0';
      input.max = '100';
      input.value = text;
      component.onGeometry(region, key, { target: input } as any);
      return input;
    };

    it('the size fields accept decimals without a browser validation error', async () => {
      component.addRegion();
      await render();
      const fields = Array.from(el().querySelectorAll<HTMLInputElement>('.rp-geo-input input'));
      expect(fields.length).toBe(4);
      for (const field of fields) {
        field.value = '33.3';
        expect(field.validity.valid).withContext(field.getAttribute('aria-label') ?? '').toBeTrue();
      }
    });

    it('three columns read 33.3, 33.4, 33.3 wide, so the numbers add up to 100', async () => {
      component.applyTemplate(REGIONAL_TEMPLATES.find(item => item.id === 'three-columns')!);
      await render();
      const regions = component.config.regions;
      expect(regions.map(region => component.geometryValue(region, 'x'))).toEqual([0, 33.3, 66.7]);
      expect(regions.map(region => component.geometryValue(region, 'width'))).toEqual([33.3, 33.4, 33.3]);
      expect(regions.map(region => component.geometryValue(region, 'height'))).toEqual([100, 100, 100]);
    });

    it('a typed decimal size is kept to 0.1% and reads back exactly as typed', () => {
      component.addRegion();
      const region = component.config.regions[0];
      expect(typeInto(region, 'x', '0').value).toBe('0');
      expect(typeInto(region, 'width', '33.3').value).toBe('33.3');
      expect(region.width).toBeCloseTo(0.333, 10);
      expect(typeInto(region, 'x', '33.3').value).toBe('33.3');
      expect(typeInto(region, 'width', '33.45').value).toBe('33.5');   // more than one decimal rounds to 0.1%
      expect(typeInto(region, 'height', '12.5').value).toBe('12.5');
    });

    it('typing 33.3 / 33.4 / 33.3 by hand tiles the image with no gap', () => {
      component.addRegion();
      component.addRegion();
      component.addRegion();
      const [left, middle, right] = component.config.regions;
      const place = (region: any, x: string, width: string) => {
        typeInto(region, 'y', '0');
        typeInto(region, 'height', '100');
        typeInto(region, 'width', width);
        typeInto(region, 'x', x);
        typeInto(region, 'width', width);   // again, now that the box starts on the typed position
      };
      place(left, '0', '33.3');
      place(middle, '33.3', '33.4');
      place(right, '66.7', '33.3');
      expect(left.x + left.width).toBeCloseTo(middle.x, 10);
      expect(middle.x + middle.width).toBeCloseTo(right.x, 10);
      expect(right.x + right.width).toBeCloseTo(1, 10);
    });

    it('a typed width on a box that starts between tenths puts the far edge on the shown numbers', () => {
      component.applyTemplate(REGIONAL_TEMPLATES.find(item => item.id === 'three-columns')!);
      const middle = component.config.regions[1];             // starts at exactly 1/3 (shown 33.3)
      expect(typeInto(middle, 'width', '33.4').value).toBe('33.4');
      expect(middle.x + middle.width).toBeCloseTo(0.667, 10);
    });
  });

  describe('switch and characters (user report 2026-11-18)', () => {
    const savedButOff = () => normaliseRegionalConfig({
      enabled: false, version: 2, regions: [
        { id: 'r-a', prompt: 'amy rose', x: 0, y: 0, width: 0.5, height: 1 },
        { id: 'r-b', prompt: 'shadow', x: 0.5, y: 0, width: 0.5, height: 1 },
      ],
    });
    const messages = () => TestBed.inject(MessageService) as unknown as { add: jasmine.Spy };

    it('the editor starts with the switch, warns when saved regions are off, and has no switch in the toolbar', async () => {
      fixture.componentRef.setInput('config', savedButOff());
      await render();
      const first = el().querySelector('.rp')!.querySelector(':scope > :not(.visually-hidden)') as HTMLElement;
      expect(first.classList).toContain('rp-power');
      expect(first.classList).toContain('rp-power-alert');
      expect(first.textContent).toContain('Regions off');
      expect(first.textContent).toContain('The next image ignores these regions');
      expect(el().querySelector('.rp-toolbar .rp-switch')).toBeNull();
      (first.querySelector('input[role="switch"]') as HTMLInputElement).click();
      await render();
      expect(component.config.enabled).toBeTrue();
      const bar = el().querySelector('.rp-power') as HTMLElement;
      expect(bar.classList).not.toContain('rp-power-off');
      expect(bar.textContent).toContain('Regions on');
      expect(bar.textContent).toContain('The next image uses 2 regions.');
      expect(bar.textContent).toContain('2/8');
      component.config.regions.forEach(region => (region.prompt = ''));
      await render();
      expect(bar.textContent).toContain('No region is used yet');
    });

    it('editing a region while regions are off switches them on, once, and undo switches them off again', async () => {
      fixture.componentRef.setInput('config', savedButOff());
      await render();
      const region = component.config.regions[0];
      const input = document.createElement('textarea');
      input.value = 'amy rose, waving';
      component.onTextInput(region, 'prompt', { target: input } as any);
      expect(component.config.enabled).toBeTrue();
      expect(messages().add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Regions switched on' }));
      input.value = 'amy rose, waving hello';
      component.onTextInput(region, 'prompt', { target: input } as any);
      expect(messages().add.calls.all().filter(call => call.args[0].summary === 'Regions switched on').length).toBe(1);
      component.undo();
      expect(component.config.enabled).toBeFalse();
      expect(component.config.regions[0].prompt).toBe('amy rose');
    });

    it('moving a box or changing its strength also switches regions on; selecting one does not', async () => {
      fixture.componentRef.setInput('config', savedButOff());
      await render();
      component.select('r-a');
      expect(component.config.enabled).toBeFalse();
      component.onCanvasEditStart(undefined);
      expect(component.config.enabled).toBeTrue();
      component.setEnabled(false);
      const range = document.createElement('input');
      range.value = '60';
      component.onStrength(component.config.regions[1], { target: range } as any);
      expect(component.config.enabled).toBeTrue();
    });

    it('the chip keeps the plain "Regions" label for saved regions that are off (owner choice: the editor shows it)', () => {
      expect(component.status.label).toBe('Regions');
      fixture.componentRef.setInput('config', savedButOff());
      fixture.detectChanges();
      expect(component.status).toEqual(jasmine.objectContaining({ kind: 'off', label: 'Regions', detail: '2 regions are saved but switched off.' }));
    });

    it('each open region has "Use a character"; a saved look fills the box and switches regions on', async () => {
      fixture.componentRef.setInput('model', sdxlLoras);
      fixture.componentRef.setInput('config', savedButOff());
      store.selectedId.set('r-b');
      await render();
      const pickers = el().querySelectorAll('app-regional-character-picker');
      expect(pickers.length).toBe(1);
      expect(pickers[0].textContent).toContain('Use a character');
      expect(component.loraRoomFor(component.config.regions[1])).toBe(2);
      const saves = spyOn(component.save, 'emit');
      (pickers[0].querySelector('.rc-launch') as HTMLButtonElement).click();
      await render();
      const picker = fixture.debugElement.query(debug => debug.name === 'app-regional-character-picker').componentInstance;
      await picker.choose({ characterId: 'amy', name: 'Amy Rose' });
      await render();
      const box = component.config.regions[1];
      expect(box.prompt).toBe('amy rose, pink fur');
      expect(box.loras!.map(lora => lora.id)).toEqual([11, 12]);
      expect(component.config.enabled).toBeTrue();
      expect(saves).toHaveBeenCalled();
      expect(messages().add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Amy Rose is in Region 2' }));
      // The other box can now take only 1 more: 3 per image.
      expect(component.loraRoomFor(component.config.regions[0])).toBe(1);
      expect(component.loraRoomFor(component.config.regions[1])).toBe(2);
    });
  });
});
