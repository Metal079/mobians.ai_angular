import type { AuthExchangeResponse } from '../stable-diffusion.service';

export interface SignupTrackingWindow {
  gtag?: (...args: unknown[]) => void;
  location: Pick<Location, 'origin' | 'pathname'>;
}

/** Restore the page context once Angular has removed the OAuth callback query. */
export function updateAnalyticsPageLocation(): void {
  const browser = typeof window === 'undefined' ? undefined : window as SignupTrackingWindow;
  try {
    browser?.gtag?.('set', 'page_location', browser.location.origin + browser.location.pathname);
  } catch {
    // A blocked analytics tag must not interrupt navigation.
  }
}

/** Records backend-confirmed account creation, never login attempts or repeat logins. */
export class CompletedSignupTracker {
  private readonly recordedUsers = new Set<string>();

  constructor(private readonly browser: SignupTrackingWindow | undefined =
    typeof window === 'undefined' ? undefined : window as SignupTrackingWindow) {}

  record(response: AuthExchangeResponse, provider: 'google' | 'discord', link: boolean): void {
    if (link || response.status !== 'success' || response.is_new_user !== true ||
        !response.user_id || !response.token || !this.browser?.gtag) return;

    const userId = String(response.user_id);
    if (this.recordedUsers.has(userId)) return;
    this.recordedUsers.add(userId);

    // OAuth query strings can contain authorization codes. Never include them,
    // account IDs, tokens, names, or email addresses in analytics events.
    const pageLocation = this.browser.location.origin + this.browser.location.pathname;
    const events: [string, Record<string, unknown>][] = [
      ['sign_up', { send_to: 'G-NQ1MYQTHLM', method: provider, page_location: pageLocation }],
      ['conversion', { send_to: 'AW-995326044/LOJfCOm3mbAdENzwzdoD', page_location: pageLocation }]
    ];
    for (const [event, parameters] of events) {
      try {
        this.browser.gtag('event', event, parameters);
      } catch {
        // Analytics failures must never interrupt a successful login.
      }
    }
  }
}
