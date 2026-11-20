import { RESULT_IMAGE_ACTIONS, ResultImageActionsService } from './result-image-actions.service';

describe('ResultImageActionsService', () => {
  const key = 'mobians:result-image-buttons:v1';

  beforeEach(() => localStorage.removeItem(key));
  afterEach(() => localStorage.removeItem(key));

  it('shows Download and Make a video until the visitor chooses otherwise', () => {
    const service = new ResultImageActionsService();
    expect(service.enabled()).toEqual({ favorite: false, character: false, edit: false, video: true, download: true });
    expect(RESULT_IMAGE_ACTIONS.map(action => action.id)).toEqual(['favorite', 'character', 'edit', 'video', 'download']);
  });

  it('remembers each choice in this browser', () => {
    const service = new ResultImageActionsService();
    service.set('favorite', true);
    service.set('video', false);
    expect(service.isOn('favorite')).toBeTrue();
    expect(service.isOn('video')).toBeFalse();

    const nextVisit = new ResultImageActionsService();
    expect(nextVisit.enabled()).toEqual({ favorite: true, character: false, edit: false, video: false, download: true });
  });

  it('stores only what was switched, so the other buttons keep following their defaults', () => {
    new ResultImageActionsService().set('edit', true);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ edit: true });
  });

  it('falls back to the defaults for unreadable or unknown stored values', () => {
    localStorage.setItem(key, '{not json');
    expect(new ResultImageActionsService().enabled()).toEqual({ favorite: false, character: false, edit: false, video: true, download: true });

    localStorage.setItem(key, JSON.stringify({ download: 'no', share: true, favorite: true }));
    expect(new ResultImageActionsService().enabled()).toEqual({ favorite: true, character: false, edit: false, video: true, download: true });
  });

  it('goes back to the default buttons on reset', () => {
    const service = new ResultImageActionsService();
    service.set('download', false);
    service.set('character', true);
    service.reset();
    expect(service.enabled()).toEqual({ favorite: false, character: false, edit: false, video: true, download: true });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('still works for the visit when the browser refuses storage', () => {
    spyOn(Storage.prototype, 'setItem').and.throwError('denied');
    const service = new ResultImageActionsService();
    service.set('favorite', true);
    expect(service.isOn('favorite')).toBeTrue();
  });
});
