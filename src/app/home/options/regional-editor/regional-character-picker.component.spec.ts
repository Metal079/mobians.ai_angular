import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { of, Subject } from 'rxjs';
import { AccountCtaService } from 'src/app/auth/account-cta.service';
import { CharactersService } from 'src/app/characters/characters.service';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { RegionalCharacterPickerComponent } from './regional-character-picker.component';
import { RegionalEditorService } from './regional-editor.service';
import { RegionalLoraCatalogService } from './regional-lora-catalog.service';
import { normaliseRegionalConfig } from './regional-state';

const catalog = [
  { id: 11, version_id: 1101, name: 'Amy Rose', version: 'v2', base_model: 'Illustrious', image_url: null },
  { id: 12, version_id: 1201, name: 'Shadow', version: 'v1', base_model: 'Illustrious', image_url: null },
  { id: 14, version_id: 1401, name: 'Watercolor', version: 'v1', base_model: 'Illustrious', image_url: null },
  { id: 15, version_id: 1501, name: 'Cream', version: 'v1', base_model: 'Anima', image_url: null },
];
const recipe = (appearance: string, loras: any[]) => ({
  label: 'Original look', model: 'novaMobianXL_v20', appearance, scene: '', negative_prompt: 'lowres', guidance_scale: 4, width: 512, height: 768, loras,
});
const characters: Record<string, any> = {
  amy: { id: 'amy', name: 'Amy Rose', default_image_id: 'amy-1', images: [
    { id: 'amy-1', recipe: recipe('amy rose, pink fur, red dress', [{ id: 11, version_id: 1101, name: 'Amy Rose', strength: 0.9 }, { id: 14, version_id: 1401, name: 'Watercolor', strength: 0.6 }]) },
    { id: 'amy-2', recipe: recipe('amy rose, winter coat', [{ id: 11, version_id: 1101, name: 'Amy Rose', strength: 1 }]) },
  ] },
  shadow: { id: 'shadow', name: 'Shadow', default_image_id: 'shadow-1', images: [
    { id: 'shadow-1', recipe: recipe('shadow the hedgehog, black fur', [{ id: 12, name: 'Shadow', strength: 1 }, { id: 14, name: 'Watercolor', strength: 0.5 }, { id: 11, name: 'Amy Rose', strength: 0.4 }]) },
  ] },
  cream: { id: 'cream', name: 'Cream', default_image_id: 'cream-1', images: [
    { id: 'cream-1', recipe: recipe('cream the rabbit, orange dress', [{ id: 15, name: 'Cream', strength: 0.8 }]) },
  ] },
};

describe('RegionalCharacterPickerComponent', () => {
  let fixture: ComponentFixture<RegionalCharacterPickerComponent>;
  let component: RegionalCharacterPickerComponent;
  let store: RegionalEditorService;
  let messages: { add: jasmine.Spy };
  let service: any;
  let login: jasmine.Spy;

  beforeEach(async () => {
    messages = { add: jasmine.createSpy('add') };
    login = jasmine.createSpy('requestLogin');
    service = {
      owner: 'token',
      saved: new Subject<string>(),
      list: jasmine.createSpy('list').and.resolveTo({ characters: [] }),
      search: jasmine.createSpy('search').and.resolveTo({ items: [], next_cursor: null }),
      get: jasmine.createSpy('get').and.callFake(async (id: string) => structuredClone(characters[id])),
      defaultLook: (detail: any) => detail.images.find((image: any) => image.id === detail.default_image_id) || detail.images[0],
      recordLoaded: jasmine.createSpy('recordLoaded'),
      recordEvent: jasmine.createSpy('recordEvent'),
    };
    await TestBed.configureTestingModule({
      imports: [RegionalCharacterPickerComponent],
      providers: [
        provideNoopAnimations(),
        { provide: CharactersService, useValue: service },
        { provide: AccountCtaService, useValue: { requestLogin: login } },
        { provide: StableDiffusionService, useValue: { getLoras: () => of(catalog) } },
        { provide: MessageService, useValue: messages },
      ],
    }).compileComponents();
    store = TestBed.inject(RegionalEditorService);
    fixture = TestBed.createComponent(RegionalCharacterPickerComponent);
    component = fixture.componentInstance;
    const config = normaliseRegionalConfig({ enabled: true, version: 2, regions: [
      { id: 'r-a', prompt: 'old text', x: 0, y: 0, width: 0.5, height: 1, loras: [{ id: 12, version_id: 1201, name: 'Shadow', strength: 0.7 }] },
      { id: 'r-b', prompt: '', x: 0.5, y: 0, width: 0.5, height: 1 },
    ] });
    fixture.componentRef.setInput('config', config);
    fixture.componentRef.setInput('region', config.regions[0]);
    fixture.componentRef.setInput('regionNumber', 1);
    fixture.componentRef.setInput('baseModel', 'Illustrious');
    fixture.componentRef.setInput('modelName', 'novaMobianXL_v20');
    fixture.componentRef.setInput('regionLoras', true);
    fixture.componentRef.setInput('loraRoom', 2);
    fixture.componentRef.setInput('totalLimit', 3);
    fixture.detectChanges();
  });

  const region = () => component.config.regions[0];

  it('asks a signed-out visitor to sign in instead of opening', () => {
    service.owner = '';
    component.open();
    expect(login).toHaveBeenCalled();
    expect(component.opened()).toBeFalse();
    expect(service.recordEvent).not.toHaveBeenCalled();
  });

  it('records that the region picker was opened', () => {
    component.open();
    expect(service.recordEvent).toHaveBeenCalledOnceWith('picker_opened', 'region');
  });

  it('fills the box with the default look: its prompt and its LoRAs, replacing the old ones, as one undo step', async () => {
    const changed = spyOn(component.changed, 'emit');
    component.open();
    await component.choose({ characterId: 'amy', name: 'Amy Rose' });
    expect(region().prompt).toBe('amy rose, pink fur, red dress');
    expect(region().loras!.map(lora => [lora.id, lora.strength])).toEqual([[11, 0.9], [14, 0.6]]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(service.recordLoaded).toHaveBeenCalledWith('amy', 'amy-1', 'region');
    expect(component.opened()).toBeFalse();
    const toast = messages.add.calls.mostRecent().args[0];
    expect(toast.summary).toBe('Amy Rose is in Region 1');
    expect(toast.detail).toContain('2 LoRAs');
    expect(toast.detail).toContain('Undo brings back the previous prompt.');
    expect(store.undo(component.config)).toBeTrue();
    expect(component.config.regions[0].prompt).toBe('old text');
    expect(component.config.regions[0].loras!.map(lora => lora.id)).toEqual([12]);
  });

  it('uses the chosen look from a search, not the default one', async () => {
    component.open();
    await component.choose({ characterId: 'amy', imageId: 'amy-2', name: 'Amy Rose' });
    expect(region().prompt).toBe('amy rose, winter coat');
    expect(region().loras!.map(lora => lora.id)).toEqual([11]);
    expect(service.recordLoaded).toHaveBeenCalledWith('amy', 'amy-2', 'region');
  });

  it('lets the user choose which LoRAs to keep when the look has more than the box takes', async () => {
    component.open();
    await component.choose({ characterId: 'shadow', name: 'Shadow' });
    fixture.detectChanges();
    const pick = component.pending()!;
    expect(pick.plan.usable.map(lora => lora.id)).toEqual([12, 14, 11]);
    expect(pick.selected).toEqual([true, true, false]);
    expect(region().prompt).toBe('old text');   // nothing changes before the choice
    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('.regional-character-dialog .rc-check'));
    expect(boxes.length).toBe(3);
    expect(boxes[2].disabled).toBeTrue();       // two chosen: the third waits until one is unticked
    component.toggle(2, true);
    expect(component.pending()!.selected).toEqual([true, true, false]);
    component.toggle(1, false);
    component.toggle(2, true);
    expect(component.confirmLabel()).toBe('Use 2 LoRAs');
    component.confirm();
    expect(region().prompt).toBe('shadow the hedgehog, black fur');
    expect(region().loras!.map(lora => lora.id)).toEqual([12, 11]);
  });

  it('with no LoRA room left offers the prompt only and says why', async () => {
    fixture.componentRef.setInput('loraRoom', 0);
    component.open();
    await component.choose({ characterId: 'amy', name: 'Amy Rose' });
    const pick = component.pending()!;
    expect(pick.selected).toEqual([false, false]);
    expect(component.roomText(pick.plan)).toContain('already uses its 3 LoRAs');
    expect(component.confirmLabel()).toBe('Use the prompt only');
    component.confirm();
    expect(region().prompt).toBe('amy rose, pink fur, red dress');
    expect(region().loras).toBeUndefined();
  });

  it('adds only the prompt for a look whose LoRAs are made for another model, and says so', async () => {
    component.open();
    await component.choose({ characterId: 'cream', name: 'Cream' });
    expect(region().prompt).toBe('cream the rabbit, orange dress');
    expect(region().loras).toBeUndefined();
    expect(messages.add.calls.mostRecent().args[0].detail).toContain('"Cream" is made for Anima, not Illustrious.');
  });

  it('adds no LoRAs on a model without LoRAs per region', async () => {
    fixture.componentRef.setInput('regionLoras', false);
    fixture.componentRef.setInput('modelName', 'Kroma Krea 2');
    component.open();
    await component.choose({ characterId: 'amy', name: 'Amy Rose' });
    expect(region().prompt).toBe('amy rose, pink fur, red dress');
    expect(region().loras).toBeUndefined();
    expect(messages.add.calls.mostRecent().args[0].detail).toContain('Kroma Krea 2 does not use LoRAs per region');
  });

  it('shows the error and changes nothing when the look cannot be loaded', async () => {
    service.get.and.rejectWith({ status: 503, error: { detail: 'Could not reach My Characters. Please try again.' } });
    component.open();
    await component.choose({ characterId: 'amy', name: 'Amy Rose' });
    expect(component.error()).toBe('Could not reach My Characters. Please try again.');
    expect(region().prompt).toBe('old text');
    expect(component.opened()).toBeTrue();
  });

  it('ignores a slow answer after the dialog was closed', async () => {
    let finish!: (value: any) => void;
    service.get.and.returnValue(new Promise(resolve => (finish = resolve)));
    component.open();
    const pending = component.choose({ characterId: 'amy', name: 'Amy Rose' });
    component.close(true);
    finish(structuredClone(characters['amy']));
    await pending;
    expect(region().prompt).toBe('old text');
  });

  it('the catalog service waits for the LoRA list before the LoRAs are sorted', async () => {
    const catalogService = TestBed.inject(RegionalLoraCatalogService);
    const loaded = await catalogService.whenLoaded();
    expect(loaded!.length).toBe(4);
    expect(await catalogService.whenLoaded()).toBe(loaded);
  });
});
