import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';
import { ImageEditorService, IMAGE_EDIT_MODEL } from './image-editor.service';
import { SharedService } from '../shared.service';
import { environment } from 'src/environments/environment';

describe('Production image editor availability', () => {
  let service: ImageEditorService;
  let http: HttpTestingController;
  let user: BehaviorSubject<any>;
  const klein = { model_id: IMAGE_EDIT_MODEL, is_active: true, credit_cost: 20,
    default_steps: 4, supported_operations: ['instruction_edit'] };
  beforeEach(() => {
    user = new BehaviorSubject<any>(null);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: SharedService, useValue: { getUserData: () => user, getUserDataValue: () => user.value } }] });
    service = TestBed.inject(ImageEditorService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('uses only production Klein for an ordinary signed-in account', fakeAsync(() => {
    user.next({ user_id: 'ordinary-account' });
    http.expectOne(`${environment.apiBaseUrl}/models`).flush({ models: [
      { ...klein, model_id: 'Qwen-Image-2.1', default_steps: 40 }, klein,
      { ...klein, model_id: 'FLUX.2-klein-9B' }] });
    tick();
    expect(service.available()).toBeTrue(); expect(service.activeModel()).toBe(IMAGE_EDIT_MODEL);
    expect(service.defaultSteps()).toBe(4); expect(service.priorityCreditCost()).toBe(20);
  }));

  it('does not fall back to a retired model when Klein is unavailable', fakeAsync(() => {
    user.next({ user_id: 'ordinary-account' });
    http.expectOne(`${environment.apiBaseUrl}/models`).flush({ models: [{ ...klein, model_id: 'Qwen-Image-2.1' }] });
    tick(); expect(service.available()).toBeFalse(); expect(service.priorityCreditCost()).toBeNull();
  }));

  it('does not invalidate editor availability when the same account refreshes its credits', fakeAsync(() => {
    user.next({ user_id:'ordinary-account', credits:100 });
    const pending=http.expectOne(`${environment.apiBaseUrl}/models`);
    user.next({ user_id:'ordinary-account', credits:80 });
    http.expectNone(`${environment.apiBaseUrl}/models`);
    pending.flush({ models:[klein] }); tick();
    expect(service.available()).toBeTrue();
    user.next({ user_id:'ordinary-account', credits:80 });
    http.expectNone(`${environment.apiBaseUrl}/models`);
    expect(service.available()).toBeTrue();
  }));

  it('keeps the edit draft when switching Image modes and opens character edits in a dialog', () => {
    service.available.set(true); spyOn(service, 'refresh').and.resolveTo();
    const draft = { prompt: 'Make the jacket blue' };
    service.showInline(draft);
    expect(service.presentation()).toBe('inline');
    service.showGenerator();
    expect(service.presentation()).toBe('hidden'); expect(service.context()).toBe(draft);
    service.showInline(); expect(service.context()).toBe(draft);
    service.open({ characterId: 'character' });
    expect(service.presentation()).toBe('dialog'); expect(service.context()?.characterId).toBe('character');
  });

  it('keeps a pending job visible when leaving the Image page', () => {
    service.context.set({}); service.presentation.set('inline'); service.pending.set(true);
    service.leaveImagePage();
    expect(service.presentation()).toBe('dialog'); expect(service.pending()).toBeTrue();
    expect(service.context()).not.toBeNull();
  });

  describe('first-use tutorial', () => {
    const key = (owner: string) => `mobians:image-edit-tutorial:v1:${owner}`;
    beforeEach(() => {
      localStorage.removeItem(key('tutorial-a')); localStorage.removeItem(key('tutorial-b'));
      spyOn(service, 'refresh').and.resolveTo();
      user.next({ user_id:'tutorial-a' }); service.available.set(true);
    });
    afterEach(() => {
      localStorage.removeItem(key('tutorial-a')); localStorage.removeItem(key('tutorial-b'));
    });

    it('opens on entry, remembers dismissal, and can be reopened without changing the draft', () => {
      const draft = { characterId:'mica', lookId:'day', prompt:'Make it nighttime' };
      service.open(draft);
      expect(service.tutorialVisible()).toBeTrue();
      expect(localStorage.getItem(key('tutorial-a'))).toBeNull();
      service.dismissTutorial();
      expect(localStorage.getItem(key('tutorial-a'))).toBe('seen');
      service.showGenerator(); service.showInline();
      expect(service.tutorialVisible()).toBeFalse();
      expect(service.context()).toBe(draft);
      service.showTutorial();
      expect(service.tutorialVisible()).toBeTrue();
      expect(service.context()).toBe(draft); expect(service.pending()).toBeFalse();
    });

    it('reads a previous session dismissal and isolates account changes', () => {
      localStorage.setItem(key('tutorial-a'), 'seen');
      service.showInline(); expect(service.tutorialVisible()).toBeFalse();
      user.next({ user_id:'tutorial-b' }); service.open({ characterId:'mica' });
      expect(service.tutorialVisible()).toBeTrue();
      user.next({ user_id:'tutorial-a' });
      expect(service.tutorialVisible()).toBeFalse();
      service.dismissTutorial();
      expect(localStorage.getItem(key('tutorial-b'))).toBeNull();
    });

    it('does not count navigation or credit refresh as dismissal', () => {
      service.showInline(); expect(service.tutorialVisible()).toBeTrue();
      user.next({ user_id:'tutorial-a', credits:80 });
      expect(service.tutorialVisible()).toBeTrue();
      service.showGenerator(); expect(service.tutorialVisible()).toBeFalse();
      service.showInline(); expect(service.tutorialVisible()).toBeTrue();
      expect(localStorage.getItem(key('tutorial-a'))).toBeNull();
      service.close(); expect(service.tutorialVisible()).toBeFalse();
    });

    it('keeps a session fallback when browser storage is unavailable', () => {
      spyOn(localStorage, 'getItem').and.throwError('blocked');
      spyOn(localStorage, 'setItem').and.throwError('blocked');
      service.showInline(); service.dismissTutorial(); service.showInline();
      expect(service.tutorialVisible()).toBeFalse();
      service.showTutorial(); expect(service.tutorialVisible()).toBeTrue();
    });

    it('does not interrupt a pending edit or open for signed-out accounts', () => {
      service.context.set({}); service.pending.set(true); service.showInline();
      expect(service.tutorialVisible()).toBeFalse();
      service.pending.set(false); user.next(null); service.showTutorial();
      expect(service.tutorialVisible()).toBeFalse();
    });
  });

  it('ignores a late catalog response after sign-out and disallows banned accounts', fakeAsync(() => {
    user.next({ user_id: 'ordinary-account' });
    const pending = http.expectOne(`${environment.apiBaseUrl}/models`);
    user.next(null); pending.flush({ models: [klein] }); tick();
    expect(service.available()).toBeFalse(); expect(service.priorityCreditCost()).toBeNull();
    user.next({ user_id:'banned', is_banned:true }); tick();
    http.expectNone(`${environment.apiBaseUrl}/models`); expect(service.available()).toBeFalse();
  }));
});
