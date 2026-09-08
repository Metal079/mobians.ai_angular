import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CharacterChoice, CharactersService, characterError } from './characters.service';

@Component({
  selector: 'app-character-browser', standalone: true, imports: [FormsModule],
  templateUrl: './character-browser.component.html',
  styleUrls: ['./character-picker.component.css', './character-browser.component.css'],
})
export class CharacterBrowserComponent implements OnChanges {
  private readonly service = inject(CharactersService);
  private readonly destroyRef = inject(DestroyRef);
  @Input() characterId = '';
  @Input() destinationsOnly = false;
  @Input() disabled = false;
  @Input() showCreate = false;
  @Output() chosen = new EventEmitter<CharacterChoice>();
  @Output() create = new EventEmitter<CharacterChoice>();
  query = '';
  rows = signal<any[]>([]);
  loading = signal(false);
  error = signal('');
  cursor = signal<string | null>(null);
  private version = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    this.service.saved.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
    this.destroyRef.onDestroy(() => { ++this.version; clearTimeout(this.timer); });
  }
  ngOnChanges(changes: any): void {
    if (changes.characterId || changes.destinationsOnly || this.version === 0) void this.load();
  }
  search(value: string): void {
    this.query = value; ++this.version; clearTimeout(this.timer);
    this.rows.set([]); this.cursor.set(null); this.loading.set(true); this.error.set('');
    this.timer = setTimeout(() => void this.load(), 250);
  }
  async load(more = false): Promise<void> {
    clearTimeout(this.timer);
    const version = ++this.version, owner = this.service.owner;
    const cursor = more ? this.cursor() || undefined : undefined;
    this.loading.set(true); this.error.set('');
    if (!more) { this.rows.set([]); this.cursor.set(null); }
    try {
      const looks = !this.destinationsOnly && (!!this.characterId || !!this.query.trim());
      const result = looks ? await this.service.search(this.query, cursor, this.characterId || undefined) : await this.service.list(this.query, cursor);
      if (version !== this.version || owner !== this.service.owner || this.destroyRef.destroyed) return;
      const items = 'items' in result ? result.items : result.characters;
      const combined = more ? [...this.rows(), ...items] : items;
      this.rows.set([...new Map(combined.map(item => [item.id, item])).values()]);
      this.cursor.set(result.next_cursor || null);
    } catch (error) {
      if (version === this.version && owner === this.service.owner) this.error.set(characterError(error));
    } finally { if (version === this.version) this.loading.set(false); }
  }
  choice(row: any): CharacterChoice {
    return { characterId: row.character_id || row.id, imageId: row.character_id ? row.id : undefined, name: row.name };
  }
}
