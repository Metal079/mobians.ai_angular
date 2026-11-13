import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { AccountCtaService } from '../auth/account-cta.service';
import { AuthService } from '../auth/auth.service';
import { trackEvent } from '../analytics';

/**
 * "Make a video from this image": carries an image from wherever that was
 * chosen to the video page, which uses it as the first frame.
 *
 * The image itself only lives in memory. Video needs an account, and signing in
 * reloads the site, so a visitor who has to sign in first arrives without the
 * image: for them we remember just the wish, and the video page opens its
 * image-history picker instead (their image is the newest one there).
 */
const PICKER_REQUEST_KEY = 'video:open-first-frame-picker';
const PICKER_REQUEST_MAX_AGE_MS = 15 * 60 * 1000;

export type AnimateResult = 'opened' | 'sign-in' | 'failed';

@Injectable({ providedIn: 'root' })
export class VideoHandoffService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly accountCta = inject(AccountCtaService);
  private image: MobiansImage | null = null;

  /**
   * Take `image` to the video page. `loadBlob` supplies the picture's data when
   * the image object does not already hold it. `placement` says where the action
   * was offered, for analytics.
   */
  async animate(image: MobiansImage, loadBlob: () => Promise<Blob | null>, placement: string): Promise<AnimateResult> {
    const signedIn = !!this.auth.isLoggedIn();
    trackEvent('animate_click', { placement, signed_in: signedIn });
    if (!signedIn) {
      this.requestPickerAfterSignIn();
      this.accountCta.requestLogin({ reason: 'animate', returnPath: '/video' });
      return 'sign-in';
    }
    const blob = image.blob ?? await loadBlob();
    if (!blob) return 'failed';
    this.set({ ...image, blob });
    const opened = await this.router.navigateByUrl('/video');
    if (!opened) this.image = null;
    return opened ? 'opened' : 'failed';
  }

  set(image: MobiansImage): void {
    this.image = image;
  }

  take(): MobiansImage | null {
    const image = this.image;
    this.image = null;
    return image;
  }

  requestPickerAfterSignIn(): void {
    try {
      localStorage.setItem(PICKER_REQUEST_KEY, String(Date.now()));
    } catch {
      // Storage unavailable: the visitor simply lands on the video page.
    }
  }

  takePickerRequest(): boolean {
    try {
      const requestedAt = Number(localStorage.getItem(PICKER_REQUEST_KEY));
      localStorage.removeItem(PICKER_REQUEST_KEY);
      return requestedAt > 0 && Date.now() - requestedAt <= PICKER_REQUEST_MAX_AGE_MS;
    } catch {
      return false;
    }
  }
}
