import { AnalyticsWindow, CreditPurchase, trackEvent, trackPurchase } from './analytics';

describe('analytics', () => {
  let tag: jasmine.Spy;
  let browser: AnalyticsWindow;
  const purchase: CreditPurchase = {
    orderId: 'ORDER-1', packageId: 'popular', packageName: 'Popular Pack', priceUsd: 10, credits: 3500
  };

  beforeEach(() => {
    tag = jasmine.createSpy('gtag');
    browser = { gtag: tag };
  });

  it('sends product events to Analytics only', () => {
    trackEvent('discord_link_click', { placement: 'home_banner' }, browser);
    expect(tag.calls.allArgs()).toEqual([
      ['event', 'discord_link_click', { placement: 'home_banner', send_to: 'G-NQ1MYQTHLM' }]
    ]);
  });

  it('records a purchase in Analytics and, when configured, as an Ads conversion with its value', () => {
    trackPurchase(purchase, 'AW-995326044/label', browser);
    expect(tag.calls.allArgs()).toEqual([
      ['event', 'purchase', {
        send_to: 'G-NQ1MYQTHLM', transaction_id: 'ORDER-1', value: 10, currency: 'USD',
        items: [{ item_id: 'popular', item_name: 'Popular Pack', price: 10, quantity: 1 }]
      }],
      ['event', 'conversion', { send_to: 'AW-995326044/label', transaction_id: 'ORDER-1', value: 10, currency: 'USD' }]
    ]);
  });

  it('skips the Ads conversion when no conversion label is configured', () => {
    trackPurchase(purchase, '', browser);
    trackPurchase(purchase, undefined, browser);
    expect(tag.calls.allArgs().map(args => args[1])).toEqual(['purchase', 'purchase']);
  });

  it('ignores purchases without an order id or a price', () => {
    trackPurchase({ ...purchase, orderId: '' }, 'AW-1/label', browser);
    trackPurchase({ ...purchase, priceUsd: 0 }, 'AW-1/label', browser);
    expect(tag).not.toHaveBeenCalled();
  });

  it('never throws when analytics is missing or blocked', () => {
    expect(() => trackEvent('animate_click', {}, {})).not.toThrow();
    expect(() => trackPurchase(purchase, 'AW-1/label', undefined)).not.toThrow();
    tag.and.throwError('blocked');
    expect(() => trackEvent('animate_click', {}, browser)).not.toThrow();
    expect(() => trackPurchase(purchase, 'AW-1/label', browser)).not.toThrow();
  });
});
