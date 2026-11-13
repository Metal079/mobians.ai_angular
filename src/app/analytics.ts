/**
 * Product analytics events (Google Analytics 4 and Google Ads).
 *
 * The Google tag only exists on the production hostname (see index.html), so
 * every call here is a safe no-op on localhost, staging and preview builds.
 * Never pass account ids, tokens, names, emails, prompts or image data.
 */

const GA_MEASUREMENT_ID = 'G-NQ1MYQTHLM';

export interface AnalyticsWindow {
  gtag?: (...args: unknown[]) => void;
}

export type AnalyticsEventName =
  | 'signup_prompt_view'
  | 'signup_prompt_click'
  | 'animate_click'
  | 'discord_link_click'
  | 'push_opt_in'
  | 'welcome_dialog_action';

export type AnalyticsParams = Record<string, string | number | boolean>;

export interface CreditPurchase {
  /** PayPal order id. Both Google products drop repeats of the same id. */
  orderId: string;
  packageId: string;
  packageName: string;
  priceUsd: number;
  credits: number;
}

function defaultBrowser(): AnalyticsWindow | undefined {
  return typeof window === 'undefined' ? undefined : window as AnalyticsWindow;
}

function send(browser: AnalyticsWindow | undefined, event: string, params: Record<string, unknown>): void {
  try {
    browser?.gtag?.('event', event, params);
  } catch {
    // A blocked or broken analytics tag must never interrupt the app.
  }
}

/** Records a product event in Analytics only (never forwarded to Ads). */
export function trackEvent(
  name: AnalyticsEventName,
  params: AnalyticsParams = {},
  browser: AnalyticsWindow | undefined = defaultBrowser()
): void {
  send(browser, name, { ...params, send_to: GA_MEASUREMENT_ID });
}

/**
 * Records a completed credit purchase: an Analytics `purchase` event, plus a
 * Google Ads conversion carrying the order value when `adsSendTo` is set
 * (`environment.googleAdsPurchaseSendTo`; empty disables it).
 */
export function trackPurchase(
  purchase: CreditPurchase,
  adsSendTo: string | undefined,
  browser: AnalyticsWindow | undefined = defaultBrowser()
): void {
  if (!purchase.orderId || !(purchase.priceUsd > 0)) return;

  send(browser, 'purchase', {
    send_to: GA_MEASUREMENT_ID,
    transaction_id: purchase.orderId,
    value: purchase.priceUsd,
    currency: 'USD',
    items: [{
      item_id: purchase.packageId,
      item_name: purchase.packageName,
      price: purchase.priceUsd,
      quantity: 1
    }]
  });

  if (adsSendTo) {
    send(browser, 'conversion', {
      send_to: adsSendTo,
      transaction_id: purchase.orderId,
      value: purchase.priceUsd,
      currency: 'USD'
    });
  }
}
