import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { StableDiffusionService } from '../stable-diffusion.service';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';
import { firstValueFrom } from 'rxjs';
import { DialogModule } from 'primeng/dialog';

declare var paypal: any;

export interface CreditPackage {
  id: string;
  name: string;
  price_usd: number;
  credits: number;
  description: string;
}

@Component({
    selector: 'app-credits-purchase',
    templateUrl: './credits-purchase.component.html',
    styleUrls: ['./credits-purchase.component.css'],
    standalone: true,
    imports: [CommonModule, DialogModule]
})
export class CreditsPurchaseComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() purchaseComplete = new EventEmitter<number>();
  
  @ViewChild('paypalContainer') paypalContainer!: ElementRef;
  
  packages: CreditPackage[] = [];
  selectedPackage: CreditPackage | null = null;
  loading = true;
  processing = false;
  paypalReady = false;
  paypalButtonsRendered = false;
  
  private paypalScript: HTMLScriptElement | null = null;

  constructor(
    private api: StableDiffusionService,
    private auth: AuthService,
    private messageService: MessageService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadPackages();
  }

  ngAfterViewInit(): void {
    // PayPal buttons will be rendered after package selection
  }

  ngOnDestroy(): void {
    this.cleanupPayPalScript();
  }

  private cleanupPayPalScript(): void {
    if (this.paypalScript && this.paypalScript.parentNode) {
      this.paypalScript.parentNode.removeChild(this.paypalScript);
      this.paypalScript = null;
    }
    this.paypalButtonsRendered = false;
  }

  loadPackages(): void {
    this.loading = true;
    this.api.getCreditPackages().subscribe({
      next: (response) => {
        this.packages = response.packages || [];
        this.loading = false;
        // Pre-select the "popular" package if available
        const popular = this.packages.find(p => p.id === 'popular');
        if (popular) {
          this.selectPackage(popular);
        }
      },
      error: (err) => {
        console.error('Failed to load packages:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load credit packages',
          life: 5000
        });
        this.loading = false;
      }
    });
  }

  selectPackage(pkg: CreditPackage): void {
    this.selectedPackage = pkg;
    this.paypalButtonsRendered = false;
    
    // Load PayPal SDK if not already loaded
    if (!this.paypalReady) {
      this.loadPayPalSDK();
    } else {
      // Re-render buttons for new package
      setTimeout(() => this.renderPayPalButtons(), 100);
    }
  }

  private loadPayPalSDK(): void {
    // Check if already loaded
    if (typeof paypal !== 'undefined') {
      this.paypalReady = true;
      setTimeout(() => this.renderPayPalButtons(), 100);
      return;
    }

    const clientId = (environment as any).paypalClientId;
    if (!clientId || clientId.startsWith('YOUR_PAYPAL')) {
      this.messageService.add({
        severity: 'warn',
        summary: 'PayPal Not Configured',
        detail: 'Please configure PayPal client ID in environment',
        life: 5000
      });
      return;
    }

    this.paypalScript = document.createElement('script');
    this.paypalScript.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
    this.paypalScript.onload = () => {
      this.paypalReady = true;
      this.cdr.detectChanges();
      setTimeout(() => this.renderPayPalButtons(), 100);
    };
    this.paypalScript.onerror = () => {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load PayPal SDK',
        life: 5000
      });
    };
    document.body.appendChild(this.paypalScript);
  }

  private renderPayPalButtons(): void {
    if (!this.paypalReady || !this.selectedPackage || !this.paypalContainer?.nativeElement) {
      return;
    }

    // Clear existing buttons
    this.paypalContainer.nativeElement.innerHTML = '';
    
    const packageId = this.selectedPackage.id;

    paypal.Buttons({
      style: {
        layout: 'vertical',
        color: 'gold',
        shape: 'rect',
        label: 'paypal'
      },
      createOrder: async () => {
        console.log('PayPal createOrder called for package:', packageId);
        
        try {
          const response = await firstValueFrom(this.api.createPayPalOrder(packageId));
          console.log('PayPal order created:', response);
          return response.order_id;
        } catch (err: any) {
          console.error('PayPal createOrder error:', err);
          this.cdr.detectChanges();
          const message = err?.error?.detail || 'Failed to create order';
          this.messageService.add({
            severity: 'error',
            summary: 'Order Error',
            detail: message,
            life: 5000
          });
          throw err;
        }
      },
      onApprove: async (data: any) => {
        this.processing = true;
        this.cdr.detectChanges();
        
        try {
          const response = await firstValueFrom(this.api.capturePayPalOrder(data.orderID));
          this.processing = false;
          
          // Update credits in auth service
          if (response.new_balance !== undefined) {
            this.auth.updateCredits(response.new_balance);
          } else {
            // Refresh credits from server
            await this.auth.refreshCredits();
          }
          
          this.messageService.add({
            severity: 'success',
            summary: 'Purchase Complete! 🎉',
            detail: response.message || `Added ${response.credits_added} credits!`,
            life: 5000
          });
          
          this.purchaseComplete.emit(response.credits_added);
          this.close();
        } catch (err: any) {
          this.processing = false;
          this.cdr.detectChanges();
          const message = err?.error?.detail || 'Failed to complete purchase';
          this.messageService.add({
            severity: 'error',
            summary: 'Payment Error',
            detail: message,
            life: 5000
          });
        }
      },
      onCancel: () => {
        this.processing = false;
        this.cdr.detectChanges();
        this.messageService.add({
          severity: 'info',
          summary: 'Cancelled',
          detail: 'Payment was cancelled',
          life: 3000
        });
      },
      onError: (err: any) => {
        this.processing = false;
        this.cdr.detectChanges();
        console.error('PayPal error:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'PayPal Error',
          detail: 'An error occurred with PayPal',
          life: 5000
        });
      }
    }).render(this.paypalContainer.nativeElement);
    
    this.paypalButtonsRendered = true;
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.selectedPackage = null;
    this.paypalButtonsRendered = false;
  }

  getBonus(pkg: CreditPackage): number {
    // Calculate bonus percentage based on base rate of $5/1500 credits (starter pack)
    const baseRate = 1500 / 5; // 300 credits per dollar
    const actualRate = pkg.credits / pkg.price_usd;
    return Math.round(((actualRate - baseRate) / baseRate) * 100);
  }
}
