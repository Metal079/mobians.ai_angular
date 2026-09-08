import { TestBed } from '@angular/core/testing';
import { CharacterDraftsService, characterDraftGuard } from './character-drafts.service';

describe('Unsaved character changes', () => {
  it('guards navigation and refresh until changes are saved or explicitly discarded', () => {
    const listen = spyOn(window, 'addEventListener').and.stub();
    const service = TestBed.inject(CharacterDraftsService);
    let dirty = true;
    const unregister = service.register(() => dirty);
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    expect(TestBed.runInInjectionContext(() => characterDraftGuard(null, null!, null!, null!))).toBeFalse();
    const event = new Event('beforeunload', { cancelable: true });
    const beforeUnload = listen.calls.allArgs().find(args => args[0] === 'beforeunload')![1] as EventListener;
    beforeUnload(event);
    expect(event.defaultPrevented).toBeTrue();
    confirm.and.returnValue(true); expect(service.canLeave()).toBeTrue();
    dirty = false; confirm.calls.reset(); expect(service.canLeave()).toBeTrue(); expect(confirm).not.toHaveBeenCalled();
    unregister(); expect(service.dirty()).toBeFalse();
  });
});
