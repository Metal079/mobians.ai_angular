import { ChangeDetectorRef, Component, DestroyRef, ElementRef, ViewChild, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ImageEditorContext, ImageEditorService } from './image-editor.service';
import { StableDiffusionService } from '../stable-diffusion.service';
import { GenerationLockService } from '../generation-lock.service';
import { SharedService } from '../shared.service';
import { AuthService } from '../auth/auth.service';
import { CharactersService, CharacterChoice } from '../characters/characters.service';
import { CharacterBrowserComponent } from '../characters/character-browser.component';
import { ImageHistoryPanelComponent } from '../home/options/image-history-panel/image-history-panel.component';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { ImageEditTutorialComponent } from './image-edit-tutorial.component';

interface EditorImage { image: MobiansImage; data: string; url: string; }

export function imageEditError(error: any): string {
  const detail = error?.error?.detail;
  if (typeof detail === 'string') return detail;
  if (error?.status === 401) return 'Sign in again to continue editing.';
  if (error?.status === 403) return 'Image editing is unavailable for this account.';
  if (error?.status === 404) return 'This editing job or image is no longer available.';
  return error instanceof Error ? error.message : 'The edit could not be completed. Please try again.';
}

@Component({
  selector: 'app-image-editor', standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, CharacterBrowserComponent, ImageHistoryPanelComponent, ImageEditTutorialComponent],
  templateUrl: './image-editor.component.html', styleUrls: ['./image-editor.component.css'],
})
export class ImageEditorComponent {
  readonly editor = inject(ImageEditorService);
  private readonly api = inject(StableDiffusionService);
  private readonly lock = inject(GenerationLockService);
  private readonly shared = inject(SharedService);
  private readonly auth = inject(AuthService);
  readonly credits = signal(0);
  queueType: 'free' | 'priority' = 'free';
  get insufficientCredits(): boolean { return this.queueType === 'priority' && this.credits() < (this.editor.priorityCreditCost() ?? Infinity); }
  get canGenerate(): boolean { return !this.busy && !!this.prompt.trim() && !!this.base() && this.editor.available() && !this.insufficientCredits; }
  get actionLabel(): string { return this.result() ? 'Try again' : 'Apply edit'; }
  readonly characters = inject(CharactersService);
  private readonly destroy = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  mask?: ElementRef<HTMLCanvasElement>;
  private restoredMask = '';
  @ViewChild('mask') set maskCanvas(value: ElementRef<HTMLCanvasElement> | undefined) {
    if (!value && this.mask && this.hasMask) this.restoredMask = this.exportedMask() || '';
    this.mask = value;
    if (value && this.restoredMask) void this.restoreSelection(this.restoredMask);
  }
  @ViewChild('history') history?: ImageHistoryPanelComponent;
  base = signal<EditorImage | null>(null); refs = signal<EditorImage[]>([]);
  result = signal<MobiansImage | null>(null); error = signal(''); status = signal('');
  prompt = ''; seed: number | null = null; comparison = 'after';
  painting = false; hasMask = false; brush = 40; picking: 'history' | 'characters' | null = null;
  pickTarget: 'base' | 'reference' = 'reference'; preparing = false;
  private context: ImageEditorContext = {}; private owner = ''; private generation = 0;
  private jobId = ''; private timer?: ReturnType<typeof setTimeout>; private drawing = false;
  private urls: string[] = []; private cancelRequested = false;
  private readonly draftDb = 'MobiansImageEditor';
  private draftWrite: Promise<void> = Promise.resolve();
  constructor() {
    this.auth.credits$.pipe(takeUntilDestroyed()).subscribe(value => this.credits.set(value?.credits ?? this.auth.getCredits()));
    effect(() => {
      const context = this.editor.context();
      if (context && context !== this.context && !this.editor.pending()) void this.open(context);
    });
    this.shared.getUserData().pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.owner && this.owner !== this.editor.owner) this.reset();
      if (this.editor.owner && !this.owner) void this.restore().catch(() => {});
    });
    this.destroy.onDestroy(() => { clearTimeout(this.timer); this.revoke(); });
  }
  get busy(): boolean { return this.preparing || this.editor.pending(); }
  focusEditor() {
    const dialog = document.querySelector<HTMLElement>('.image-editor-dialog');
    dialog?.querySelector<HTMLElement>('.p-dialog-close-button')?.focus({ preventScroll: true });
    const content = dialog?.querySelector<HTMLElement>('.p-dialog-content');
    if (content) content.scrollTop = 0;
  }
  contextCharacter(): boolean { return !!this.context.characterId; }
  removeReference(reference: EditorImage) { this.refs.update(items => items.filter(item => item !== reference)); }
  get title(): string { return this.context.characterName ? `Edit ${this.context.characterName}` : 'Edit an image'; }
  get visibleUrl(): string { return this.result() && this.comparison === 'after' ? this.result()!.url! : this.base()?.url || ''; }
  private revoke() { this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls = []; }
  private reset() {
    const hadJob = this.editor.pending();
    ++this.generation; clearTimeout(this.timer); this.revoke(); this.base.set(null); this.refs.set([]);
    this.result.set(null); this.editor.pending.set(false); this.editor.context.set(null); if (hadJob) this.lock.release();
    if (this.editor.presentation() === 'inline') this.editor.presentation.set('hidden');
    this.owner = ''; this.jobId = ''; this.preparing = false; this.queueType = 'free';
  }
  async open(context: ImageEditorContext) {
    const version = ++this.generation; this.context = context; this.owner = this.editor.owner;
    this.revoke(); this.result.set(null); this.base.set(null); this.refs.set([]); this.error.set('');
    this.prompt = context.prompt || ''; this.status.set(''); this.hasMask = false; this.painting = false; this.restoredMask = '';
    this.preparing = true;
    try { if (context.image) { const image = await this.prepare(context.image); if (version === this.generation) this.base.set(image); } }
    catch (error) { if (version === this.generation) this.error.set(imageEditError(error)); }
    finally { if (version === this.generation) { this.preparing = false; this.cdr.markForCheck(); } }
  }
  private async prepare(image: MobiansImage): Promise<EditorImage> {
    const blob = image.blob || (image.base64 ? await (await fetch(image.base64.startsWith('data:') ? image.base64 : `data:image/png;base64,${image.base64}`)).blob()
      : image.url ? await (await fetch(image.url)).blob() : null);
    if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('Choose an available PNG, JPEG, or WebP smaller than 8 MB.');
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width * bitmap.height > 16_000_000) { bitmap.close(); throw new Error('Choose an image with at most 16 million pixels.'); }
    const normalized = { ...image, blob, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    const url = URL.createObjectURL(blob); this.urls.push(url);
    return { image: normalized, data, url };
  }
  async upload(event: Event, target: 'base' | 'reference') {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    await this.choose({ UUID: crypto.randomUUID(), blob: file, width: 0, height: 0, aspectRatio: 'square' }, target);
  }
  async choose(image: MobiansImage, target = this.pickTarget) {
    if (this.busy || (target === 'reference' && this.refs().length >= 2)) return;
    const version = this.generation; this.error.set(''); this.preparing = true;
    try {
      const prepared = await this.prepare(image);
      if (version !== this.generation) return;
      if (target === 'base') { this.base.set(prepared); this.result.set(null); this.clearMask(); }
      else this.refs.update(refs => [...refs, prepared]);
      this.picking = null;
    } catch (error) { this.error.set(imageEditError(error)); }
    finally { if (version === this.generation) { this.preparing = false; this.cdr.markForCheck(); } }
  }
  async chooseCharacter(choice: CharacterChoice) {
    const version = this.generation;
    try {
      const character = await this.characters.get(choice.characterId, choice.imageId);
      const look = choice.imageId ? character.images.find(i => i.id === choice.imageId) : character.images.find(i => i.id === character.default_image_id) || character.images[0];
      if (!look) throw new Error('This saved look is unavailable.');
      const blob = await this.characters.media(character.id, look.id);
      if (version !== this.generation) return;
      await this.choose({ UUID: `character-${look.id}`, blob, width: 0, height: 0, aspectRatio: 'square' });
    } catch (error) { if (version === this.generation) this.error.set(imageEditError(error)); }
  }
  picker(kind: 'history' | 'characters', target: 'base' | 'reference') {
    this.pickTarget = target; this.picking = kind;
    setTimeout(() => {
      if (this.destroy.destroyed || this.picking !== kind) return;
      const panel = document.querySelector<HTMLElement>('.image-editor-dialog .picker-panel:not([hidden]), .image-editor-workspace:not([hidden]) .picker-panel:not([hidden])');
      panel?.scrollIntoView({ block: 'nearest' });
      panel?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    });
  }
  clearMask() { this.mask?.nativeElement.getContext('2d')?.clearRect(0, 0, this.mask.nativeElement.width, this.mask.nativeElement.height); this.hasMask = false; }
  paint(event: PointerEvent) {
    if (!this.painting || this.busy || !this.base() || (this.result() && this.comparison === 'after')) return;
    const canvas = this.mask?.nativeElement; if (!canvas) return;
    if (event.type === 'pointerdown') { this.drawing = true; canvas.setPointerCapture(event.pointerId); }
    if (!this.drawing) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect(), ctx = canvas.getContext('2d')!;
    const x = (event.clientX - rect.left) * canvas.width / rect.width, y = (event.clientY - rect.top) * canvas.height / rect.height;
    ctx.fillStyle = 'white'; ctx.strokeStyle = 'white'; ctx.lineWidth = this.brush * canvas.width / rect.width;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (event.type === 'pointerdown') { ctx.beginPath(); ctx.moveTo(x, y); }
    ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, y);
    this.hasMask = true;
  }
  endPaint() { this.drawing = false; }
  private exportedMask(): string | undefined {
    if (!this.hasMask || !this.mask) return undefined;
    const original = this.mask.nativeElement, canvas = document.createElement('canvas');
    canvas.width = original.width; canvas.height = original.height;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'black'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(original, 0, 0);
    return canvas.toDataURL('image/png');
  }
  async generate() {
    if (!this.canGenerate) return;
    if (this.seed != null && (!Number.isInteger(this.seed) || this.seed < 0 || this.seed > 2147483647)) {
      this.error.set('Choose a whole-number seed between 0 and 2147483647.'); return;
    }
    if (localStorage.getItem('mobians:pending-job') || !this.lock.tryAcquire()) { this.error.set('Finish or cancel the active image generation first.'); return; }
    const version = this.generation; this.cancelRequested = false; this.preparing = true; this.editor.pending.set(true); this.error.set('');
    const base = this.base()!; const seed = this.seed == null ? Math.floor(Math.random() * 2147483647) : this.seed;
    const width = base.image.width, height = base.image.height;
    const request = { prompt: this.prompt, model: this.editor.activeModel(), job_type: 'instruction_edit',
      image: base?.data, reference_images: this.refs().map(ref => ref.data), mask_image: this.exportedMask(),
      reference_image_uuids: this.refs().map(ref => ref.image.UUID),
      steps: this.editor.defaultSteps(), guidance_scale: 1, negative_prompt: '', loras: [], scheduler: 0, batch_size: 1, strength: null,
      width, height, seed, lossy_images: false, queue_type: this.queueType, is_dev_job: false,
      expected_credit_cost: this.queueType === 'priority' ? this.editor.priorityCreditCost() : undefined,
      character_id: this.context.characterId, character_look_id: this.context.lookId,
      parent_image_uuid: base?.image.UUID, root_image_uuid: base?.image.editProvenance?.root_image_uuid || base?.image.UUID };
    try {
      await this.saveDraft({ context: this.context, base, refs: this.refs(), request, seedChoice: this.seed, owner: this.owner });
      const response = await firstValueFrom(this.api.submitJob(request));
      if (version !== this.generation) return;
      if (typeof response.credits_remaining === 'number') this.auth.updateCredits(response.credits_remaining);
      this.jobId = response.job_id;
      await this.saveDraft({ context: this.context, base, refs: this.refs(), request, seedChoice: this.seed, owner: this.owner, jobId: this.jobId }).catch(() => {});
      if (this.cancelRequested) await this.cancel();
      if (this.jobId) void this.poll(request, version);
    } catch (error) { if (version === this.generation) {
      this.error.set(imageEditError(error)); this.finish();
      if ((error as any)?.status === 409) void this.editor.refresh();
      if ((error as any)?.status === 402) void this.auth.refreshCredits();
    } }
    finally { if (version === this.generation) { this.preparing = false; this.cdr.markForCheck(); } }
  }
  private async poll(request: any, version: number) {
    if (version !== this.generation || !this.jobId) return;
    try {
      const response: any = await firstValueFrom(this.api.getJobStatus(this.jobId));
      if (version !== this.generation) return;
      if (typeof response.refund?.new_balance === 'number') this.auth.updateCredits(response.refund.new_balance);
      if (response.status === 'completed') {
        this.error.set('');
        this.status.set('Loading your result…');
        const completed: any = await firstValueFrom(this.api.getJob({ job_id: this.jobId }));
        if (version !== this.generation) return;
        const blob = await (await fetch(`data:image/png;base64,${completed.result[0]}`)).blob();
        const bitmap = await createImageBitmap(blob);
        if (version !== this.generation) { bitmap.close(); return; }
        const url = URL.createObjectURL(blob); this.urls.push(url);
        const image: MobiansImage = { UUID: crypto.randomUUID(), blob, url, width: bitmap.width, height: bitmap.height,
          aspectRatio: bitmap.width > bitmap.height ? 'landscape' : bitmap.height > bitmap.width ? 'portrait' : 'square',
          timestamp: new Date(), lastModified: new Date(), model: request.model, seed: request.seed, cfg: 1,
          prompt: request.prompt, negativePrompt: '', loras: [], characterId: this.context.characterId,
          characterLookId: this.context.lookId, editProvenance: completed.edit_provenance || undefined };
        bitmap.close(); this.result.set(image); this.comparison = 'after'; this.painting = false;
        try {
          const stored = await this.history?.ingestGeneratedImages([image]);
          if (!stored) throw new Error('History storage failed.');
          this.status.set('Saved to image history.');
        }
        catch { this.error.set('Your edit is ready, but history could not be saved. Download the PNG to keep it.'); }
        this.finish();
      } else if (['failed', 'error', 'cancelled'].includes(response.status)) {
        if (request.queue_type === 'priority') void this.auth.refreshCredits();
        this.error.set(response.message || response.error_message || 'This edit failed. Your source image is still available.'); this.finish();
      } else {
        this.status.set(response.status === 'pending' ? `Queued${response.queue_position ? ` · position ${response.queue_position}` : ''}` : 'Editing your image…');
        this.timer = setTimeout(() => void this.poll(request, version), 2500);
      }
    } catch (error) {
      if (version !== this.generation) return;
      if ((error as any)?.status === 404 || (error as any)?.status === 403) { this.error.set(imageEditError(error)); this.finish(); }
      else { this.status.set('Connection interrupted. Reconnecting…'); this.timer = setTimeout(() => void this.poll(request, version), 5000); }
    }
  }
  async cancel() {
    this.cancelRequested = true;
    if (!this.jobId) return;
    const version = this.generation;
    try {
      const response = await firstValueFrom(this.api.cancelJob(this.jobId));
      if (version !== this.generation) return;
      this.status.set(response.credits_refunded ? `Cancelled. ${response.credits_refunded} credits refunded.` : 'Cancelled.');
      this.finish(); void this.auth.refreshCredits();
    }
    catch (error) { if (version !== this.generation) return; this.error.set((error as any)?.status === 409 ? 'This job has started and cannot be cancelled. It will finish here.' : imageEditError(error)); this.cancelRequested = false; }
  }
  private finish() { clearTimeout(this.timer); this.editor.pending.set(false); this.lock.release(); this.jobId = ''; void this.saveDraft(null).catch(() => {}); }
  async editAgain() { if (this.result()) { await this.choose(this.result()!, 'base'); this.prompt = ''; this.comparison = 'before'; } }
  saveLook() {
    const image = this.result(); if (!image) return;
    this.characters.requestSave({ ...image, prompt: this.context.recipe?.appearance || this.base()?.image.prompt || image.prompt }, this.context.characterId, this.context.recipe);
  }
  download() { const image = this.result(); if (!image) return; const link = document.createElement('a'); link.href = image.url!; link.download = `${image.UUID}.png`; link.click(); }
  close() { if (!this.busy) { this.editor.close(); this.reset(); } }
  private database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => { const open = indexedDB.open(this.draftDb, 1); open.onupgradeneeded = () => open.result.createObjectStore('drafts'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
  }
  private saveDraft(value: any): Promise<void> {
    const owner = this.owner; if (!owner) return Promise.resolve();
    // Serialize writes so completion of an earlier edit cannot erase a new job.
    this.draftWrite = this.draftWrite.catch(() => {}).then(async () => {
      const db = await this.database();
      try {
        await new Promise<void>((resolve, reject) => { const tx = db.transaction('drafts', 'readwrite'); if (value) tx.objectStore('drafts').put(value, owner); else tx.objectStore('drafts').delete(owner); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
      } finally { db.close(); }
    });
    return this.draftWrite;
  }
  private async restore() {
    const owner = this.editor.owner; if (!owner) return;
    const db = await this.database(); const value: any = await new Promise((resolve, reject) => { const request = db.transaction('drafts').objectStore('drafts').get(owner); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); db.close();
    if (!value?.jobId || owner !== this.editor.owner || this.owner) return;
    await this.open({ ...value.context, image: value.base?.image });
    if (owner !== this.editor.owner) return;
    const version = this.generation;
    this.editor.context.set(this.context);
    const references = await Promise.all((value.refs || []).map((ref: EditorImage) => this.prepare(ref.image)));
    if (version !== this.generation || owner !== this.editor.owner) return;
    this.refs.set(references);
    this.restoredMask = value.request.mask_image || '';
    if (this.mask && this.restoredMask) await this.restoreSelection(this.restoredMask);
    if (version !== this.generation || owner !== this.editor.owner) return;
    this.prompt = value.request.prompt; this.seed = value.seedChoice ?? null;
    this.queueType = value.request.queue_type === 'priority' ? 'priority' : 'free';
    this.jobId = value.jobId; this.editor.pending.set(true); this.lock.tryAcquire();
    void this.poll(value.request, this.generation);
  }

  private async restoreSelection(data: string) {
    const version = this.generation;
    const bitmap = await createImageBitmap(await (await fetch(data)).blob());
    if (version !== this.generation || !this.mask) { bitmap.close(); return; }
    const canvas = this.mask.nativeElement, context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i + 3] = pixels.data[i];
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
    }
    context.putImageData(pixels, 0, 0); this.hasMask = true; this.restoredMask = ''; this.cdr.markForCheck();
  }
}
