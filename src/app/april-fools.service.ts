import { Injectable } from '@angular/core';

interface RingGameProgress {
  totalScore: number;
}

@Injectable({ providedIn: 'root' })
export class AprilFoolsService {
  private readonly ringGameProgressKey = 'april-fools-ring-game-progress';
  private skipNextRingGamePersist = false;

  private readonly queueMessages: string[] = [
    'Dr. Eggman is hogging GPU #2...',
    'Tails is rerouting power to the generators...',
    'Chaos Emerald power at ' + Math.floor(Math.random() * 100) + '%...',
    'Shadow is brooding instead of processing your job...',
    'Knuckles was tricked into guarding the wrong server...',
    'Metal Sonic is copying your art style...',
    'Rouge is stealing GPU cycles for jewelry renders...',
    'Big the Cat is fishing in the cooling system...',
    "Amy's hammer jammed the conveyor belt...",
    'Sonic ran too fast and crashed the render pipeline...',
    "Eggman's robots are unionizing...",
    'The Master Emerald is being calibrated...',
    'Omega is running a virus scan on the GPUs...',
    'Silver came back from the future to warn us about queue times...',
    'Cream and Cheese are delivering your images by hand...',
    'Espio turned the server invisible again...',
    'Vector is demanding overtime pay for the GPUs...',
    'Zazz is breakdancing on the motherboard...',
  ];

  private messageIndex = 0;

  isAprilFools(): boolean {
    try {
      if (localStorage.getItem('force-april-fools') === 'true') return true;
    } catch { /* storage unavailable */ }
    const now = new Date();
    // April 1st, or 11 PM+ on March 31st (one hour early start)
    if (now.getMonth() === 3 && now.getDate() === 1) return true;
    if (now.getMonth() === 2 && now.getDate() === 31 && now.getHours() >= 23) return true;
    return false;
  }

  getNextQueueMessage(): string {
    const msg = this.queueMessages[this.messageIndex % this.queueMessages.length];
    this.messageIndex++;
    return msg;
  }

  getRandomQueueMessage(): string {
    return this.queueMessages[Math.floor(Math.random() * this.queueMessages.length)];
  }

  getGenerateButtonText(hasRef: boolean): string {
    return hasRef ? 'Roboticize w/Ref!' : 'GOTTA GO FAST!';
  }

  getCancelButtonText(): string {
    return 'TOO SLOW!';
  }

  getCompletionToast(): { summary: string; detail: string } {
    return { summary: 'Way past cool!', detail: 'Your images are ready, blue blur!' };
  }

  getCreditsUsedToast(used: number, remaining: number): { summary: string; detail: string } {
    return { summary: 'Rings Spent!', detail: `${used} rings used. Remaining: ${remaining}` };
  }

  getErrorToast(message: string): { summary: string; detail: string } {
    return { summary: 'Eggman sabotaged the generators!', detail: message };
  }

  getCancelledToast(creditsRefunded?: number): { summary: string; detail: string } {
    const detail = creditsRefunded
      ? `Mission aborted! ${creditsRefunded} rings returned to you.`
      : 'Mission aborted! Generation cancelled.';
    return { summary: 'Too slow!', detail };
  }

  getRingGameProgress(): RingGameProgress | null {
    try {
      const raw = sessionStorage.getItem(this.ringGameProgressKey);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<RingGameProgress>;
      if (typeof parsed.totalScore !== 'number' || !isFinite(parsed.totalScore) || parsed.totalScore < 0) {
        return null;
      }

      return { totalScore: parsed.totalScore };
    } catch {
      return null;
    }
  }

  setRingGameProgress(progress: RingGameProgress): void {
    try {
      sessionStorage.setItem(this.ringGameProgressKey, JSON.stringify(progress));
    } catch {
      /* storage unavailable */
    }
  }

  clearRingGameProgress(): void {
    try {
      sessionStorage.removeItem(this.ringGameProgressKey);
    } catch {
      /* storage unavailable */
    }
  }

  discardRingGameProgress(): void {
    this.skipNextRingGamePersist = true;
    this.clearRingGameProgress();
  }

  shouldPersistRingGameProgress(): boolean {
    const shouldPersist = !this.skipNextRingGamePersist;
    this.skipNextRingGamePersist = false;
    return shouldPersist;
  }
}
