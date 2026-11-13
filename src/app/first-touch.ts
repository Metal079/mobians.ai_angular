/**
 * How a visitor first arrived, remembered in this browser and sent once with
 * their sign-up so the backend can record where new accounts come from
 * (backend: growth_tracking.py, table user_signup_attribution).
 *
 * Only campaign tags, the linking site's host name and the landing path are
 * kept. Query strings are never stored whole, and nothing here identifies a person.
 */

const STORAGE_KEY = 'first-touch';
// The browser's own random id, created by NotificationService and sent with every job.
const BROWSER_ID_KEY = 'notifications-user-id';
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const GOOGLE_ADS_CLICK_PARAMS = ['gclid', 'gbraid', 'wbraid'];
const MAX_VALUE_LENGTH = 200;

export interface FirstTouch {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  has_gclid?: boolean;
  referrer_host?: string;
  landing_path: string;
  first_seen_at: string;
}

export interface SignupAttribution extends Partial<FirstTouch> {
  client_id?: string;
  /** Which prompt opened the sign-in, e.g. 'wait-screen'. */
  signup_cta?: string;
  /** The page the visitor was on when they chose to sign in. */
  signup_path?: string;
}

export interface FirstTouchBrowser {
  location: Pick<Location, 'pathname' | 'search' | 'hostname'>;
  document: Pick<Document, 'referrer'>;
  localStorage: Pick<Storage, 'getItem' | 'setItem'>;
}

function defaultBrowser(): FirstTouchBrowser | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

/** Remembers the first arrival. Later calls change nothing. Never throws. */
export function recordFirstTouch(browser: FirstTouchBrowser | undefined = defaultBrowser()): void {
  try {
    if (!browser || browser.localStorage.getItem(STORAGE_KEY)) return;
    // The sign-in return page is never where a visit starts, and its address holds a one-time code.
    if (browser.location.pathname.startsWith('/auth/')) return;

    const params = new URLSearchParams(browser.location.search);
    const touch: FirstTouch = {
      landing_path: browser.location.pathname.slice(0, 255),
      first_seen_at: new Date().toISOString()
    };
    for (const field of UTM_FIELDS) {
      const value = params.get(field)?.trim().slice(0, MAX_VALUE_LENGTH);
      if (value) touch[field] = value;
    }
    if (GOOGLE_ADS_CLICK_PARAMS.some(name => params.has(name))) touch.has_gclid = true;

    const referrerHost = hostOf(browser.document.referrer);
    if (referrerHost && referrerHost !== browser.location.hostname) touch.referrer_host = referrerHost;

    browser.localStorage.setItem(STORAGE_KEY, JSON.stringify(touch));
  } catch {
    // Storage can be unavailable (private mode); sign-up then simply carries no source.
  }
}

/** What to send with a sign-up. Undefined when there is nothing to report. */
export function buildSignupAttribution(
  extra: Pick<SignupAttribution, 'signup_cta' | 'signup_path'> = {},
  browser: FirstTouchBrowser | undefined = defaultBrowser()
): SignupAttribution | undefined {
  const attribution: SignupAttribution = {};
  try {
    const stored = browser?.localStorage.getItem(STORAGE_KEY);
    if (stored) Object.assign(attribution, JSON.parse(stored));
  } catch {
    // Unreadable or corrupt first-touch record: report the rest without it.
  }
  try {
    const browserId = browser?.localStorage.getItem(BROWSER_ID_KEY);
    if (browserId) attribution.client_id = browserId;
  } catch {
    // Storage unavailable.
  }
  if (extra.signup_cta) attribution.signup_cta = extra.signup_cta;
  if (extra.signup_path) attribution.signup_path = extra.signup_path;
  return Object.keys(attribution).length ? attribution : undefined;
}

function hostOf(url: string): string | undefined {
  try {
    return url ? new URL(url).hostname.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}
