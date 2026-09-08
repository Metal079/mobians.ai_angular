import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { AccountCtaService } from '../auth/account-cta.service';
import { SharedService } from '../shared.service';
import { CharacterPickerComponent } from './character-picker.component';
import { CharactersService, CharacterSummary } from './characters.service';

const ash: CharacterSummary = { id: 'ash', name: 'Ash', thumbnail: null, image_count: 2, updated_at: '' };
const amy: CharacterSummary = { id: 'amy', name: 'Amy Rose', thumbnail: null, image_count: 1, updated_at: '' };

describe('CharacterPickerComponent', () => {
  let fixture: ComponentFixture<CharacterPickerComponent>;
  let component: CharacterPickerComponent;
  let service: any;
  let account: any;
  let user: BehaviorSubject<any>;

  beforeEach(async () => {
    user = new BehaviorSubject({ token: 'alice' });
    service = {
      owner: 'alice', saved: new Subject<string>(),
      list: jasmine.createSpy('list').and.resolveTo({ characters: [ash, amy] }),
      get: jasmine.createSpy('get').and.resolveTo({ id: ash.id, name: ash.name, images: [{ id: 'default' }, { id: 'other' }] }),
      useImage: jasmine.createSpy('useImage').and.resolveTo(),
    };
    account = { requestLogin: jasmine.createSpy('requestLogin') };
    await TestBed.configureTestingModule({
      imports: [CharacterPickerComponent],
      providers: [
        provideNoopAnimations(), provideRouter([]),
        { provide: CharactersService, useValue: service },
        { provide: SharedService, useValue: { getUserData: () => user.asObservable() } },
        { provide: AccountCtaService, useValue: account },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CharacterPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('offers sign-in without requesting private data when signed out', async () => {
    service.owner = '';
    user.next(null);
    await component.open();
    expect(account.requestLogin).toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
    expect(component.opened()).toBeFalse();
  });

  it('keeps the launcher disabled while generation is unavailable', async () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.character-launch').disabled).toBeTrue();
    await component.open();
    expect(service.list).not.toHaveBeenCalled();
  });

  it('shows the loaded name in one launcher and keeps actions inside the picker', async () => {
    fixture.componentRef.setInput('loadedName', 'Amy Rose');
    fixture.componentRef.setInput('canUndo', true);
    fixture.detectChanges();
    const launch = fixture.nativeElement.querySelector('.character-launch');
    expect(launch.textContent).toContain('Amy Rose');
    expect(launch.getAttribute('aria-label')).toBe('Using Amy Rose. Change character');
    expect(fixture.nativeElement.querySelector('.picker-current-actions')).toBeNull();
    const undo = spyOn(component.undo, 'emit');
    await component.open();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.picker-current-actions button').click();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(component.opened()).toBeFalse();
  });

  it('unlinks through the picker and blocks current-character actions while busy', async () => {
    fixture.componentRef.setInput('loadedName', 'Amy Rose');
    const detach = spyOn(component.detach, 'emit');
    await component.open();
    component.busyId.set('ash');
    component.finishWithCurrent('detach');
    expect(detach).not.toHaveBeenCalled();
    component.busyId.set('');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.picker-current-actions button').click();
    expect(detach).toHaveBeenCalledTimes(1);
    expect(component.opened()).toBeFalse();
  });

  it('loads the exact searched look rather than the character default', async () => {
    await component.open();
    service.get.and.resolveTo({ id:'amy', name:'Amy Rose', default_image_id:'default', images:[{id:'default'}, {id:'beach'}] });
    await component.useChoice({ characterId:'amy', imageId:'beach', name:'Amy Rose' });
    expect(service.get).toHaveBeenCalledOnceWith('amy', 'beach');
    expect(service.useImage).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id:'amy' }), jasmine.objectContaining({ id:'beach' }), 'create');
    expect(component.opened()).toBeFalse();
  });

  it('ignores a late list response after the picker was closed', async () => {
    let resolve!: (result: any) => void;
    service.list.and.returnValue(new Promise(done => resolve = done));
    const opening = component.open();
    component.close();
    resolve({ characters: [ash] });
    await opening;
    expect(component.characters()).toEqual([]);
    expect(component.opened()).toBeFalse();
    expect(component.loading()).toBeFalse();
  });

  it('does not use an old account’s character if accounts change while fetching its look', async () => {
    await component.open();
    let resolve!: (result: any) => void;
    service.get.and.returnValue(new Promise(done => resolve = done));
    const using = component.use(ash);
    service.owner = 'bob';
    user.next({ token: 'bob' });
    resolve({ id: ash.id, name: ash.name, images: [{ id: 'default' }] });
    await using;
    expect(service.useImage).not.toHaveBeenCalled();
    expect(component.characters()).toEqual([]);
    expect(component.opened()).toBeFalse();
  });

  it('keeps the picker open with an actionable error when a saved model cannot be used', async () => {
    await component.open();
    service.useImage.and.rejectWith(new Error('Choose another model for this look.'));
    await component.use(ash);
    fixture.detectChanges();
    expect(component.opened()).toBeTrue();
    expect(component.busyId()).toBe('');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Choose another model');
  });

  it('blocks double selection while a look is loading', async () => {
    await component.open();
    let resolve!: (result: any) => void;
    service.get.and.returnValue(new Promise(done => resolve = done));
    const using = component.use(ash);
    await component.use(amy);
    expect(service.get).toHaveBeenCalledTimes(1);
    resolve({ id: ash.id, name: ash.name, images: [{ id: 'default' }] });
    await using;
  });

  it('recovers from a temporary list failure without showing a false empty collection', async () => {
    service.list.and.rejectWith(new Error('Connection interrupted'));
    await component.open();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.picker-empty')).toBeNull();
    service.list.and.resolveTo({ characters: [ash] });
    await component.load();
    expect(component.error()).toBe('');
    expect(component.results()).toEqual([ash]);
  });
});
