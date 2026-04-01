import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AprilFoolsService } from 'src/app/april-fools.service';

type RingType = 'normal' | 'super' | 'emerald';

interface Ring {
  id: number;
  x: number;
  y: number;
  type: RingType;
  collected: boolean;
  spawnTime: number;
  lifetime: number;
  expired: boolean;
}

interface ScorePopup {
  id: number;
  x: number;
  y: number;
  text: string;
  cssClass: string;
}

@Component({
  selector: 'app-ring-game',
  templateUrl: './ring-game.component.html',
  styleUrls: ['./ring-game.component.css'],
  standalone: true,
  imports: [CommonModule],
})
export class RingGameComponent implements OnInit, OnDestroy {
  @Output() ringsCollected = new EventEmitter<number>();

  rings: Ring[] = [];
  scorePopups: ScorePopup[] = [];
  totalScore = 0;
  combo = 0;
  bestCombo = 0;
  private comboTimer?: ReturnType<typeof setTimeout>;
  private nextId = 0;
  private spawnTimeout?: ReturnType<typeof setTimeout>;
  private tickInterval?: ReturnType<typeof setInterval>;
  private elapsedSeconds = 0;
  private secondsInterval?: ReturnType<typeof setInterval>;

  // Audio pool to allow overlapping ring sounds
  private audioPool: HTMLAudioElement[] = [];
  private audioIndex = 0;

  constructor(private aprilFools: AprilFoolsService) {}

  ngOnInit(): void {
    const savedProgress = this.aprilFools.getRingGameProgress();
    if (savedProgress) {
      this.totalScore = savedProgress.totalScore;
    }

    for (let i = 0; i < 5; i++) {
      const a = new Audio('assets/ding.mp3');
      a.volume = 0.25;
      this.audioPool.push(a);
    }
    this.scheduleNextSpawn();
    this.tickInterval = setInterval(() => this.tick(), 200);
    this.secondsInterval = setInterval(() => this.elapsedSeconds++, 1000);
  }

  ngOnDestroy(): void {
    if (this.aprilFools.shouldPersistRingGameProgress()) {
      this.persistProgress();
    }
    if (this.spawnTimeout) clearTimeout(this.spawnTimeout);
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.secondsInterval) clearInterval(this.secondsInterval);
    if (this.comboTimer) clearTimeout(this.comboTimer);
  }

  private persistProgress(): void {
    this.aprilFools.setRingGameProgress({ totalScore: this.totalScore });
  }

  /** Spawn delay decreases from ~1.2s down to ~0.4s over 2 minutes */
  private get spawnDelay(): number {
    const base = 1200;
    const min = 400;
    const factor = Math.min(this.elapsedSeconds / 120, 1);
    return base - (base - min) * factor + Math.random() * 400;
  }

  /** Rings stay for 5s initially, shrinking to 3s as pace increases */
  private get ringLifetime(): number {
    const base = 5000;
    const min = 3000;
    const factor = Math.min(this.elapsedSeconds / 120, 1);
    return base - (base - min) * factor;
  }

  private scheduleNextSpawn(): void {
    this.spawnTimeout = setTimeout(() => {
      this.spawnRing();
      this.scheduleNextSpawn();
    }, this.spawnDelay);
  }

  private spawnRing(): void {
    const visible = this.rings.filter(r => !r.collected && !r.expired);
    if (visible.length >= 10) return;

    const roll = Math.random();
    let type: RingType = 'normal';
    if (roll < 0.05) type = 'emerald';
    else if (roll < 0.20) type = 'super';

    this.rings.push({
      id: this.nextId++,
      x: 8 + Math.random() * 84,
      y: 8 + Math.random() * 78,
      type,
      collected: false,
      spawnTime: Date.now(),
      lifetime: this.ringLifetime,
      expired: false,
    });
  }

  private tick(): void {
    const now = Date.now();
    for (const ring of this.rings) {
      if (!ring.collected && !ring.expired && now - ring.spawnTime > ring.lifetime) {
        ring.expired = true;
        setTimeout(() => {
          this.rings = this.rings.filter(r => r.id !== ring.id);
        }, 600);
      }
    }
  }

  /** How close to expiry (0-1) for CSS urgency pulse */
  getRingUrgency(ring: Ring): number {
    const elapsed = Date.now() - ring.spawnTime;
    return Math.min(elapsed / ring.lifetime, 1);
  }

  private getRingValue(type: RingType): number {
    switch (type) {
      case 'emerald': return 20;
      case 'super': return 5;
      default: return 1;
    }
  }

  collectRing(ring: Ring, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (ring.collected || ring.expired) return;
    ring.collected = true;

    // Combo tracking
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    if (this.comboTimer) clearTimeout(this.comboTimer);
    this.comboTimer = setTimeout(() => { this.combo = 0; }, 2000);

    // Score with combo multiplier
    const baseValue = this.getRingValue(ring.type);
    const comboMult = this.combo >= 10 ? 3 : this.combo >= 5 ? 2 : 1;
    const points = baseValue * comboMult;
    this.totalScore += points;
    this.persistProgress();
    this.ringsCollected.emit(points);

    // Floating score popup
    let popupText = `+${points}`;
    if (comboMult > 1) popupText += ` x${comboMult}`;
    const popupClass = ring.type === 'emerald' ? 'popup-emerald'
      : ring.type === 'super' ? 'popup-super' : 'popup-normal';
    const popup: ScorePopup = {
      id: this.nextId++, x: ring.x, y: ring.y,
      text: popupText, cssClass: popupClass,
    };
    this.scorePopups.push(popup);
    setTimeout(() => {
      this.scorePopups = this.scorePopups.filter(p => p.id !== popup.id);
    }, 800);

    // Pool sound playback with pitch variation
    try {
      const audio = this.audioPool[this.audioIndex % this.audioPool.length];
      audio.currentTime = 0;
      audio.playbackRate = ring.type === 'emerald' ? 0.7 : ring.type === 'super' ? 0.85 : 1;
      audio.play().catch(() => {});
      this.audioIndex++;
    } catch { /* not critical */ }

    setTimeout(() => {
      this.rings = this.rings.filter(r => r.id !== ring.id);
    }, 400);
  }
}
