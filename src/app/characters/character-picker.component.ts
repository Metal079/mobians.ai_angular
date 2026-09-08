import { Component, DestroyRef, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogModule } from 'primeng/dialog';
import { AccountCtaService } from '../auth/account-cta.service';
import { SharedService } from '../shared.service';
import { CharacterBrowserComponent } from './character-browser.component';
import { CharactersService, CharacterSummary, CharacterChoice, CharacterDetail, CharacterImage, characterError } from './characters.service';

@Component({
  selector: 'app-character-picker', standalone: true,
  imports: [FormsModule, RouterLink, DialogModule, CharacterBrowserComponent],
  templateUrl: './character-picker.component.html',
  styleUrls: ['./character-picker.component.css'],
})
export class CharacterPickerComponent {
  private readonly service = inject(CharactersService);
  private readonly shared = inject(SharedService);
  private readonly accountCta = inject(AccountCtaService);
  private readonly destroyRef = inject(DestroyRef);
  @Input() disabled = false;
  @Input() loadedName = '';
  @Input() canUndo = false;
  @Output() undo = new EventEmitter<void>();
  @Output() detach = new EventEmitter<void>();
  readonly opened = signal(false);
  readonly loading = signal(false);
  readonly busyId = signal('');
  readonly error = signal('');
  readonly search = signal('');
  readonly characters = signal<CharacterSummary[]>([]);
  readonly results = computed(() => {
    const search = this.search().trim().toLocaleLowerCase();
    return this.characters().filter(character => character.name.toLocaleLowerCase().includes(search));
  });
  recovery = signal<{ character: CharacterDetail; look: CharacterImage } | null>(null);
  failedChoice = signal<CharacterChoice | null>(null);
  private version = 0;
  private owner = this.service.owner;

  constructor() {
    this.shared.getUserData().pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.owner !== this.service.owner) {
        this.owner = this.service.owner;
        this.close(true);
        this.characters.set([]);
      }
    });
    this.service.saved.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.opened() && !this.busyId()) void this.load();
    });
  }

  async open(): Promise<void> {
    if (this.disabled) return;
    if (!this.service.owner) {
      this.accountCta.requestLogin({ reason: 'generic', message: 'Sign in to keep your characters ready for your next image.' });
      return;
    }
    this.opened.set(true);
    this.search.set('');
    await this.load();
  }

  async load(): Promise<void> {
    const version = ++this.version;
    const owner = this.service.owner;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.service.list();
      if (this.current(version, owner)) this.characters.set(result.characters);
    } catch (error) {
      if (this.current(version, owner)) this.error.set(characterError(error));
    } finally {
      if (this.current(version, owner)) this.loading.set(false);
    }
  }

  async use(character: CharacterSummary): Promise<void> {
    return this.useChoice({ characterId: character.id, name: character.name });
  }
  async useChoice(choice: CharacterChoice, promptsOnly = false): Promise<void> {
    if (this.disabled || this.busyId() || !this.opened()) return;
    const version = ++this.version, owner = this.service.owner;
    this.busyId.set(choice.characterId); this.error.set(''); this.recovery.set(null); this.failedChoice.set(null);
    let detail: CharacterDetail | undefined, look: CharacterImage | undefined;
    try {
      detail = await this.service.get(choice.characterId, choice.imageId);
      if (!this.current(version, owner) || this.disabled) return;
      look = choice.imageId ? detail.images.find(i => i.id === choice.imageId) : detail.images.find(i => i.id === detail!.default_image_id) || detail.images[0];
      if (!look) throw new Error('This saved look is no longer available. Open My Characters to choose another.');
      if (promptsOnly) await this.service.useImage(detail, look, 'create', { promptsOnly: true });
      else await this.service.useImage(detail, look, 'create');
      if (this.current(version, owner)) this.close(true);
    } catch (error: any) {
      if (this.current(version, owner)) {
        this.error.set(characterError(error));
        this.failedChoice.set(choice);
        if (error?.status === 409 && detail && look) this.recovery.set({ character: detail, look });
      }
    } finally { if (this.current(version, owner)) this.busyId.set(''); }
  }
  usePrompts(): void {
    const saved = this.recovery();
    if (saved) void this.useChoice({ characterId: saved.character.id, imageId: saved.look.id, name: saved.character.name }, true);
  }

  close(force = false): void {
    if (this.busyId() && !force) return;
    ++this.version;
    this.opened.set(false);
    this.loading.set(false);
    this.busyId.set('');
    this.error.set(''); this.recovery.set(null); this.failedChoice.set(null);
  }

  finishWithCurrent(action: 'undo' | 'detach'): void {
    if (!this.opened() || !this.loadedName || this.disabled || this.busyId() || (action === 'undo' && !this.canUndo)) return;
    if (action === 'undo') this.undo.emit();
    else this.detach.emit();
    this.close();
  }

  private current(version: number, owner: string): boolean {
    return !this.destroyRef.destroyed && this.opened() && version === this.version && owner === this.service.owner;
  }
}
