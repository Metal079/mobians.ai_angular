import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from './auth.service';
import { trackEvent } from '../analytics';

/**
 * "Join our Discord: +100 credits", in the Account panel for a signed-in account
 * that has not had the reward yet.
 *
 * The reward is paid by the backend when it sees, from Discord itself, that the
 * account's connected Discord user is a member of the server (see
 * account_linking.py). So the two steps here are: open the server invite, then
 * come back and connect or re-check Discord. That second step is the ordinary
 * "connect a sign-in method" round trip, which keeps the person signed in.
 *
 * On phones the panel floats over the generator, so the card starts as a single
 * line there and opens when tapped; on wider screens it starts open.
 */
export const DISCORD_INVITE_URL = 'https://discord.gg/mobians';

@Component({
  selector: 'app-discord-reward-card',
  standalone: true,
  template: `
    @if (view(); as shown) {
      <section class="discord-reward" [class.done]="shown === 'thanks'" aria-label="Discord join reward">
        @if (shown === 'thanks') {
          <div class="heading"><i class="bi bi-discord" aria-hidden="true"></i> {{ amount() }} credits added</div>
          <p>Thanks for joining! See you in the server.</p>
        } @else {
          <button type="button" class="heading toggle" [attr.aria-expanded]="isOpen()" (click)="open.set(!isOpen())">
            <span><i class="bi bi-discord" aria-hidden="true"></i> Join our Discord: +{{ amount() }} credits</span>
            <i class="bi" [class.bi-chevron-up]="isOpen()" [class.bi-chevron-down]="!isOpen()" aria-hidden="true"></i>
          </button>
          @if (isOpen()) {
            <p>{{ hasDiscord() ? 'Join the server, then claim.' : 'Join the server and connect your Discord account.' }} One time only.</p>
            @if (shown === 'not-member') {
              <p class="warn" role="status">We couldn't see you in the server yet. Join it, then claim again.</p>
            }
            <div class="steps">
              <a [href]="invite" target="_blank" rel="noopener" (click)="opened()">1. Open Discord</a>
              <button type="button" (click)="claim()">{{ hasDiscord() ? "2. I've joined: claim" : '2. Connect & claim' }}</button>
            </div>
          }
        }
      </section>
    }
  `,
  styles: [`
    .discord-reward { display: grid; gap: .35rem; padding: .5rem .6rem; border-radius: 8px; font-size: .82rem; text-align: left;
      background: rgb(88 101 242 / 12%); border: 1px solid rgb(88 101 242 / 45%); }
    .discord-reward.done { background: rgb(16 185 129 / 12%); border-color: rgb(16 185 129 / 45%); }
    .heading { font-weight: 700; }
    .heading .bi-discord { color: #5865f2; margin-right: .25rem; }
    .toggle { display: flex; align-items: center; justify-content: space-between; gap: .5rem; width: 100%; padding: 0; border: 0; background: none;
      color: inherit; font: inherit; font-weight: 700; text-align: left; cursor: pointer; }
    p { margin: 0; font-size: .76rem; opacity: .85; }
    .warn { opacity: 1; font-weight: 600; }
    .steps { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .15rem; }
    .steps a, .steps button { flex: 1 1 auto; padding: .35rem .5rem; border-radius: 6px; border: 1px solid #5865f2; font: inherit; font-size: .78rem;
      font-weight: 600; text-align: center; text-decoration: none; white-space: nowrap; cursor: pointer; }
    .steps a { background: #fff; color: #4752c4; }
    .steps button { background: #5865f2; color: #fff; }
    .toggle:focus-visible, .steps a:focus-visible, .steps button:focus-visible { outline: 2px solid #4752c4; outline-offset: 2px; }
  `]
})
export class DiscordRewardCardComponent {
  // Signal inputs: the panel learns that someone is signed in a moment after it first renders,
  // and `view` below has to be worked out again when that happens.
  readonly signedIn = input(false);
  /** The account already has a Discord account connected (only server membership is missing). */
  readonly hasDiscord = input(false);

  private readonly auth = inject(AuthService);
  private readonly credits = toSignal(this.auth.credits$, { initialValue: null });
  readonly invite = DISCORD_INVITE_URL;
  /** The person's own choice; until they choose, open on wide screens and one line on phones. */
  readonly open = signal<boolean | null>(null);

  readonly amount = computed(() => this.auth.authOutcome()?.response?.['discord_reward']?.credits
    ?? this.credits()?.discordJoinReward?.credits ?? 100);

  /** What to show: nothing, the offer, the offer with "not in the server yet", or a thank-you. */
  readonly view = computed<'offer' | 'not-member' | 'thanks' | null>(() => {
    if (!this.signedIn()) return null;
    const lastSignIn = this.auth.authOutcome()?.response?.['discord_reward']?.status as string | undefined;
    if (lastSignIn === 'granted') return 'thanks';
    const state = this.credits()?.discordJoinReward;
    // No state means the server cannot grant it (yet): offer nothing we cannot deliver.
    if (!state || state.claimed) return null;
    return lastSignIn === 'not_member' ? 'not-member' : 'offer';
  });

  /** Someone who just came back without being in the server needs to see why, so that state is always open. */
  readonly isOpen = computed(() => this.open() ?? (this.view() === 'not-member' || this.wideScreen()));

  /** Its own method so tests can stand in for the screen. */
  wideScreen(): boolean {
    return typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(min-width: 601px)').matches;
  }

  opened(): void {
    trackEvent('discord_link_click', { placement: 'account_reward' });
  }

  claim(): void {
    // Connects Discord to this account, or re-checks one that is already connected; the session is kept.
    this.auth.startLink('discord');
  }
}
