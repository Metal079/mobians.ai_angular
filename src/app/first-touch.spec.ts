import { buildSignupAttribution, FirstTouchBrowser, recordFirstTouch } from './first-touch';

describe('first touch', () => {
  let stored: Record<string, string>;
  const browser = (address: string, referrer = '', storage?: Partial<FirstTouchBrowser['localStorage']>): FirstTouchBrowser => {
    const url = new URL(address);
    return {
      location: { pathname: url.pathname, search: url.search, hostname: url.hostname },
      document: { referrer },
      localStorage: {
        getItem: key => stored[key] ?? null,
        setItem: (key, value) => { stored[key] = value; },
        ...storage
      }
    };
  };
  const saved = () => JSON.parse(stored['first-touch']);

  beforeEach(() => { stored = {}; });

  it('remembers campaign tags, an ads click, the linking site and the landing page, without the query string', () => {
    recordFirstTouch(browser(
      'https://mobians.ai/video?utm_source=discord&utm_medium=social&utm_campaign=launch&gclid=abc123&code=secret',
      'https://www.reddit.com/r/somewhere/comments/1?x=y'));
    const touch = saved();
    expect(touch).toEqual(jasmine.objectContaining({
      utm_source: 'discord', utm_medium: 'social', utm_campaign: 'launch', has_gclid: true,
      referrer_host: 'www.reddit.com', landing_path: '/video'
    }));
    expect(Date.parse(touch.first_seen_at)).not.toBeNaN();
    expect(JSON.stringify(touch)).not.toContain('abc123');
    expect(JSON.stringify(touch)).not.toContain('secret');
    expect(JSON.stringify(touch)).not.toContain('comments');
  });

  it('keeps the first arrival and ignores later ones', () => {
    recordFirstTouch(browser('https://mobians.ai/?utm_source=first'));
    recordFirstTouch(browser('https://mobians.ai/video?utm_source=second', 'https://example.com/'));
    expect(saved().utm_source).toBe('first');
    expect(saved().landing_path).toBe('/');
  });

  it('records a direct visit with no tags, and does not count our own pages as a linking site', () => {
    recordFirstTouch(browser('https://mobians.ai/', 'https://mobians.ai/video'));
    expect(Object.keys(saved()).sort()).toEqual(['first_seen_at', 'landing_path']);
  });

  it('does not start a visit on the sign-in return page', () => {
    recordFirstTouch(browser('https://mobians.ai/auth/callback?code=one-time-code&state=x'));
    expect(stored['first-touch']).toBeUndefined();
  });

  it('never throws when storage or the referrer is unusable', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(() => recordFirstTouch(browser('https://mobians.ai/', '', broken))).not.toThrow();
    expect(() => recordFirstTouch(browser('https://mobians.ai/', 'not a url'))).not.toThrow();
    expect(() => recordFirstTouch(undefined)).not.toThrow();
    expect(buildSignupAttribution({}, browser('https://mobians.ai/', '', broken))).toBeUndefined();
  });

  it('builds the sign-up report from the first arrival, the browser id and the prompt that was used', () => {
    recordFirstTouch(browser('https://mobians.ai/?utm_source=discord'));
    stored['notifications-user-id'] = 'browser-id-1234';
    expect(buildSignupAttribution({ signup_cta: 'wait-screen', signup_path: '/video' }, browser('https://mobians.ai/'))).toEqual(
      jasmine.objectContaining({
        utm_source: 'discord', landing_path: '/', client_id: 'browser-id-1234', signup_cta: 'wait-screen', signup_path: '/video'
      }));
  });

  it('reports nothing when nothing is known, and survives corrupt storage', () => {
    expect(buildSignupAttribution({}, browser('https://mobians.ai/'))).toBeUndefined();
    stored['first-touch'] = '{not json';
    stored['notifications-user-id'] = 'browser-id-1234';
    expect(buildSignupAttribution({ signup_cta: 'results' }, browser('https://mobians.ai/')))
      .toEqual({ client_id: 'browser-id-1234', signup_cta: 'results' });
  });
});
