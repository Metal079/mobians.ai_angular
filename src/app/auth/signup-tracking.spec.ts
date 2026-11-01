import { CompletedSignupTracker, SignupTrackingWindow } from './signup-tracking';
import { AuthExchangeResponse } from '../stable-diffusion.service';

describe('CompletedSignupTracker', () => {
  let tag: jasmine.Spy;
  let browser: SignupTrackingWindow;
  let tracker: CompletedSignupTracker;
  const signup: AuthExchangeResponse = {
    status: 'success', is_new_user: true, user_id: 'private-account', token: 'private-token',
    email: 'private@example.test'
  };

  beforeEach(() => {
    tag = jasmine.createSpy('gtag');
    browser = { gtag: tag, location: new URL('https://mobians.ai/auth/callback?code=private-code') };
    tracker = new CompletedSignupTracker(browser);
  });

  for (const provider of ['google', 'discord'] as const) {
    it(`records a confirmed ${provider} signup once without personal data`, () => {
      tracker.record(signup, provider, false);
      tracker.record(signup, provider, false);
      expect(tag.calls.allArgs()).toEqual([
        ['event', 'sign_up', { send_to: 'G-NQ1MYQTHLM', method: provider, page_location: 'https://mobians.ai/auth/callback' }],
        ['event', 'conversion', { send_to: 'AW-995326044/LOJfCOm3mbAdENzwzdoD', page_location: 'https://mobians.ai/auth/callback' }]
      ]);
      expect(JSON.stringify(tag.calls.allArgs())).not.toContain('private');
    });
  }

  it('ignores returning users, linking, incomplete responses and failed exchanges', () => {
    tracker.record({ ...signup, is_new_user: false }, 'google', false);
    tracker.record({ ...signup, is_new_user: undefined }, 'google', false);
    tracker.record(signup, 'discord', true);
    tracker.record({ ...signup, token: undefined }, 'google', false);
    tracker.record({ ...signup, user_id: undefined }, 'google', false);
    tracker.record({ ...signup, status: 'error' }, 'google', false);
    expect(tag).not.toHaveBeenCalled();
  });

  it('never throws when analytics is missing or blocked', () => {
    browser.gtag = undefined;
    expect(() => tracker.record(signup, 'google', false)).not.toThrow();
    browser.gtag = tag;
    tag.and.throwError('blocked');
    expect(() => tracker.record(signup, 'google', false)).not.toThrow();
  });

  it('can record another new account in the same browser session', () => {
    tracker.record(signup, 'google', false);
    tracker.record({ ...signup, user_id: 'another-account' }, 'discord', false);
    expect(tag).toHaveBeenCalledTimes(4);
  });
});
