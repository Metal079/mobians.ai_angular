/**
 * Undo/redo history for the regional editor. Callers record the state *before* a change.
 * Changes that share a key within a short window (typing, keyboard nudges) become one step.
 */
export class UndoStack<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastKey: string | null = null;
  private lastAt = 0;

  constructor(private readonly limit = 60, private readonly now: () => number = () => Date.now()) {}

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  /** Returns false when the change was merged into the previous step. */
  record(snapshot: T, key?: string, windowMs = 1200): boolean {
    const time = this.now();
    if (key && key === this.lastKey && time - this.lastAt < windowMs) {
      this.lastAt = time;
      return false;
    }
    this.past.push(snapshot);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.lastKey = key ?? null;
    this.lastAt = time;
    return true;
  }

  /** Gives the previous state and remembers `current` for redo. */
  undo(current: T): T | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(current);
    this.lastKey = null;
    return previous;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    this.lastKey = null;
    return next;
  }

  /** Ends the current merge window, so the next change gets its own step. */
  seal(): void { this.lastKey = null; }

  clear(): void {
    this.past = [];
    this.future = [];
    this.lastKey = null;
  }
}
