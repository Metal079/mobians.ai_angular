import { Injectable } from '@angular/core';

interface LockRecord {
  owner: string;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class GenerationLockService {
  private readonly lockKey = 'mobians:gen-lock';
  private readonly tabIdKey = 'mobians:tab-id';
  private readonly ttlMs = 30_000; // 30s lease
  private heartbeatTimer: any = null;
  public readonly tabId: string;

  constructor() {
    // Ensure a stable tab ID across refreshes of this tab
    const existing = sessionStorage.getItem(this.tabIdKey);
    this.tabId = existing || this.generateId();
    if (!existing) sessionStorage.setItem(this.tabIdKey, this.tabId);
  }

  private generateId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  private readLock(): LockRecord | null {
    const raw = localStorage.getItem(this.lockKey);
    if (!raw) return null;
    try {
      const rec = JSON.parse(raw) as LockRecord;
      return rec;
    } catch {
      return null;
    }
  }

  private writeLock(rec: LockRecord) {
    localStorage.setItem(this.lockKey, JSON.stringify(rec));
  }

  private isExpired(rec: LockRecord): boolean {
    return Date.now() > rec.expiresAt;
  }

  isLockedByOther(): boolean {
    const rec = this.readLock();
    return !!rec && !this.isExpired(rec) && rec.owner !== this.tabId;
  }

  hasLock(): boolean {
    const rec = this.readLock();
    return !!rec && !this.isExpired(rec) && rec.owner === this.tabId;
  }

  tryAcquire(): boolean {
    const rec = this.readLock();
    if (!rec || this.isExpired(rec)) {
      this.writeLock({ owner: this.tabId, expiresAt: Date.now() + this.ttlMs });
      this.startHeartbeat();
      return true;
    }
    if (rec.owner === this.tabId) {
      this.renew();
      return true;
    }
    return false;
  }

  release(): void {
    const rec = this.readLock();
    if (rec && rec.owner === this.tabId) {
      localStorage.removeItem(this.lockKey);
    }
    this.stopHeartbeat();
  }

  renew(): void {
    const rec = this.readLock();
    if (!rec || rec.owner !== this.tabId) return;
    this.writeLock({ owner: this.tabId, expiresAt: Date.now() + this.ttlMs });
  }

  startHeartbeat(): void {
    this.stopHeartbeat();
    this.renew();
    this.heartbeatTimer = setInterval(() => this.renew(), Math.floor(this.ttlMs / 3));
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    window.addEventListener('pagehide', this.beforeUnloadHandler);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    window.removeEventListener('pagehide', this.beforeUnloadHandler);
  }

  private beforeUnloadHandler = () => {
    // Let the lock expire naturally; do not remove lock to prevent multi-submit.
    this.stopHeartbeat();
  };
}
