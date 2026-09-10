import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { environment } from 'src/environments/environment';
import { AuthInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { CreditsPurchaseComponent } from './credits-purchase.component';

const packages = [
  { id: 'starter', name: 'Starter', price_usd: 5, credits: 1500, description: 'Starter credits' },
  { id: 'popular', name: 'Popular', price_usd: 15, credits: 5000, description: 'Popular credits' },
  { id: 'best_value', name: 'Best value', price_usd: 40, credits: 15000, description: 'Large pack' },
];

describe('Credit checkout with public package loading', () => {
  let fixture: ComponentFixture<CreditsPurchaseComponent>;
  let http: HttpTestingController;
  let auth: any;
  let messages: any;
  let callbacks: any;
  let originalPayPal: any;
  let buttons: jasmine.Spy;

  beforeEach(async () => {
    localStorage.setItem('authToken', 'checkout-test-session');
    originalPayPal = (window as any).paypal;
    callbacks = undefined;
    buttons = jasmine.createSpy('Buttons').and.callFake(options => {
      callbacks = options;
      return { render: jasmine.createSpy('render').and.resolveTo(undefined) };
    });
    (window as any).paypal = { Buttons: buttons };
    auth = { updateCredits: jasmine.createSpy(), refreshCredits: jasmine.createSpy().and.resolveTo({ credits: 5100 }) };
    messages = { add: jasmine.createSpy() };
    spyOn(console, 'error');
    await TestBed.configureTestingModule({
      imports: [CreditsPurchaseComponent],
      providers: [
        provideNoopAnimations(), provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
        { provide: AuthService, useValue: auth }, { provide: MessageService, useValue: messages },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CreditsPurchaseComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.autoDetectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    if (originalPayPal === undefined) delete (window as any).paypal;
    else (window as any).paypal = originalPayPal;
  });

  async function openCheckout() {
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    const request = http.expectOne(environment.apiBaseUrl + '/credit-packages');
    expect(request.request.headers.has('Authorization')).toBeFalse();
    await new Promise(resolve => setTimeout(resolve, 0));
    request.flush({ packages });
    await new Promise(resolve => setTimeout(resolve, 150));
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('renders delayed package data and PayPal buttons without an extra click', async () => {
    const component = await openCheckout();
    expect(fixture.nativeElement.querySelectorAll('.package-card').length).toBe(3);
    expect(fixture.nativeElement.querySelector('.loading-state')).toBeNull();
    expect(component.selectedPackage?.id).toBe('popular');
    expect(component.paypalButtonsRendered).toBeTrue();
    expect(buttons).toHaveBeenCalled();
    expect(localStorage.getItem('authToken')).toBe('checkout-test-session');
  });

  it('purchases the selected package using authenticated create and capture requests', async () => {
    const component = await openCheckout();
    const completed = spyOn(component.purchaseComplete, 'emit');
    fixture.nativeElement.querySelectorAll('.package-card')[0].click();
    await new Promise(resolve => setTimeout(resolve, 150));
    const orderPromise = callbacks.createOrder();
    const create = http.expectOne(environment.apiBaseUrl + '/paypal/create-order');
    expect(create.request.headers.get('Authorization')).toBe('Bearer checkout-test-session');
    expect(create.request.body).toEqual({ package_id: 'starter' });
    create.flush({ order_id: 'TEST-ORDER' });
    expect(await orderPromise).toBe('TEST-ORDER');

    const approved = callbacks.onApprove({ orderID: 'TEST-ORDER' });
    expect(component.processing).toBeTrue();
    const capture = http.expectOne(environment.apiBaseUrl + '/paypal/capture-order');
    expect(capture.request.headers.get('Authorization')).toBe('Bearer checkout-test-session');
    expect(capture.request.body).toEqual({ order_id: 'TEST-ORDER' });
    capture.flush({ credits_added: 1500, new_balance: 1600 });
    await approved;
    expect(auth.updateCredits).toHaveBeenCalledOnceWith(1600);
    expect(completed).toHaveBeenCalledOnceWith(1500);
    expect(component.processing).toBeFalse();
    expect(component.visible).toBeFalse();
  });

  it('refreshes the balance when the capture response does not include one', async () => {
    await openCheckout();
    const approved = callbacks.onApprove({ orderID: 'TEST-ORDER' });
    http.expectOne(environment.apiBaseUrl + '/paypal/capture-order').flush({ credits_added: 5000 });
    await approved;
    expect(auth.refreshCredits).toHaveBeenCalledTimes(1);
    expect(auth.updateCredits).not.toHaveBeenCalled();
  });

  it('shows create-order failures without capturing or granting credits', async () => {
    const component = await openCheckout();
    const order = callbacks.createOrder();
    http.expectOne(environment.apiBaseUrl + '/paypal/create-order').flush(
      { detail: 'Provider unavailable' }, { status: 503, statusText: 'Unavailable' });
    await expectAsync(order).toBeRejected();
    expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Order Error', detail: 'Provider unavailable' }));
    expect(auth.updateCredits).not.toHaveBeenCalled();
    expect(component.visible).toBeTrue();
  });

  it('keeps checkout usable after capture failure and does not report a purchase', async () => {
    const component = await openCheckout();
    const completed = spyOn(component.purchaseComplete, 'emit');
    const approved = callbacks.onApprove({ orderID: 'TEST-ORDER' });
    http.expectOne(environment.apiBaseUrl + '/paypal/capture-order').flush(
      { detail: 'Capture unavailable' }, { status: 500, statusText: 'Error' });
    await approved;
    expect(component.processing).toBeFalse();
    expect(component.visible).toBeTrue();
    expect(completed).not.toHaveBeenCalled();
    expect(auth.updateCredits).not.toHaveBeenCalled();
    expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Payment Error' }));
  });

  it('handles cancellation and SDK errors without making payment requests', async () => {
    const component = await openCheckout();
    component.processing = true;
    callbacks.onCancel();
    expect(component.processing).toBeFalse();
    callbacks.onError(new Error('SDK error'));
    expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Cancelled' }));
    expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'PayPal Error' }));
    expect(auth.updateCredits).not.toHaveBeenCalled();
    http.expectNone(() => true);
  });

  it('ends the loading state and retains the login when public packages fail', async () => {
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    http.expectOne(environment.apiBaseUrl + '/credit-packages').flush(
      { detail: 'Unavailable' }, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.loading-state')).toBeNull();
    expect(messages.add).toHaveBeenCalledWith(jasmine.objectContaining({ detail: 'Failed to load credit packages' }));
    expect(localStorage.getItem('authToken')).toBe('checkout-test-session');
    expect(buttons).not.toHaveBeenCalled();
  });
});
