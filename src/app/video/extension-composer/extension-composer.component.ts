import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VideoJob, VideoExtensionConfig, VideoExtensionQuote, VideoSubmitResponse, VideoReference } from 'src/_shared/video-generation.interface';
import { ReferenceInputsComponent } from '../reference-inputs/reference-inputs.component';
import { VideoGenerationService } from '../../video-generation.service';
import { Subscription, timeout } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

export function canExtendVideo(job: VideoJob): boolean {
  const seconds = job.output_duration_seconds ?? job.duration_seconds;
  return job.status === 'completed' && job.media_ready
    && seconds >= 39 / 24 && seconds <= 60
    && (!job.expires_at || new Date(job.expires_at).getTime() > Date.now());
}

interface ExtensionSource {
  key: number;
  title: string;
  job?: VideoJob;
  file?: File;
  objectUrl?: string;
  isGif?: boolean;
  duration: number | null;
  width: number | null;
  height: number | null;
}

@Component({
  selector: 'app-video-extension-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, ReferenceInputsComponent],
  templateUrl: './extension-composer.component.html',
  styleUrls: ['./extension-composer.component.css'],
})
export class ExtensionComposerComponent implements OnChanges, OnDestroy {
  private readonly videoService = inject(VideoGenerationService);
  @Input() active = false;
  @Input() jobs: VideoJob[] = [];
  @Input() loadingJobs = false;
  @Input() videoUrls: ReadonlyMap<string, string> = new Map();
  @Input() thumbnailUrls: ReadonlyMap<string, string> = new Map();
  @Input() durations: number[] = [];
  @Input() policy: VideoExtensionConfig | null = null;
  @Input() currentCredits = 0;
  @Input() activeJobs = 0;
  @Input() activeLimit = 3;
  @Output() submitted = new EventEmitter<VideoSubmitResponse>();
  @Output() creditsRequested = new EventEmitter<void>();
  @ViewChild('sourceVideo') sourceVideo?: ElementRef<HTMLVideoElement>;

  sourceTab: 'upload' | 'library' = 'upload';
  source: ExtensionSource | null = null;
  prompt = '';
  audioPrompt = '';
  continueAudio = true;
  outputAsGif = false;
  references: VideoReference[] = [];
  referencesBusy = false;
  addedSeconds = 5;
  errorMessage = '';
  readingFile = false;
  previewLoading = false;
  previewFailed = false;
  dragging = false;
  quote: VideoExtensionQuote | null = null;
  quoteLoading = false;
  quoteError = '';
  submitting = false;
  submissionError = '';
  private quoteSubscription: Subscription | null = null;
  private submitSubscription: Subscription | null = null;
  private gifPreviewSubscription: Subscription | null = null;
  private requestId = '';
  private requestSelection = '';
  readonly promptMaxLength = 8000;
  readonly audioPromptMaxLength = 4000;
  get maxUploadBytes(): number { return this.policy?.max_source_bytes ?? 50 * 1024 * 1024; }
  private selectionVersion = 0;
  private destroyed = false;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly zone: NgZone, private readonly cdr: ChangeDetectorRef) {}

  get availableJobs(): VideoJob[] { return this.jobs.filter(canExtendVideo); }
  get lengthOptions(): number[] { return this.policy?.durations?.length ? this.policy.durations : this.durations.length ? this.durations : [5, 10, 15]; }
  get contextSeconds(): number { return this.policy?.context_seconds ?? 39 / 24; }
  get selectedCost(): number { return this.quote?.duration_seconds === this.addedSeconds && this.quote.reference_image_count === this.references.length ? this.quote.credit_cost : 0; }
  get referencePromptNeedsReview(): boolean { return this.prompt.includes('[removed image]') || this.audioPrompt.includes('[removed image]'); }
  get actualAddedSeconds(): number { return this.quote?.duration_seconds === this.addedSeconds ? this.quote.added_duration_seconds : this.policy?.added_seconds?.[String(this.addedSeconds)] ?? this.addedSeconds; }
  get available(): boolean { return !!this.policy?.enabled; }
  get canSubmit(): boolean {
    return this.active && this.available && this.sourceReady && !this.errorMessage && !this.readingFile
      && !this.referencesBusy && !this.referencePromptNeedsReview
      && !!this.prompt.trim() && this.prompt.length <= this.promptMaxLength
      && (!this.continueAudio || this.audioPrompt.length <= this.audioPromptMaxLength)
      && this.selectedCost > 0 && !this.quoteLoading && !this.quoteError
      && this.activeJobs < this.activeLimit && !this.submitting;
  }
  get sourceUrl(): string {
    if (this.source?.objectUrl) return this.source.objectUrl;
    return this.source?.job && !this.source.isGif ? this.videoUrls.get(this.source.job.id) ?? '' : '';
  }
  get sourcePoster(): string {
    return this.source?.job ? this.thumbnailUrls.get(this.source.job.id) ?? '' : '';
  }
  get sourceReady(): boolean {
    return !!this.source?.duration && !this.previewLoading && !this.previewFailed;
  }
  get combinedSeconds(): number | null {
    return this.sourceReady ? this.source!.duration! + this.actualAddedSeconds : null;
  }
  get originalShare(): number {
    return this.combinedSeconds ? this.source!.duration! / this.combinedSeconds * 100 : 50;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['active'] && !this.active) {
      this.sourceVideo?.nativeElement.pause();
      this.quoteSubscription?.unsubscribe();
      this.quoteLoading = false;
    }
    if (changes['durations'] && !this.lengthOptions.includes(this.addedSeconds)) {
      this.addedSeconds = this.lengthOptions[0];
    }
    if ((changes['active'] || changes['policy'] || changes['durations']) && this.active && !this.submitting
        && ((!this.quote && !this.quoteLoading) || (!!this.quote && (this.quote.pricing_version !== this.policy?.pricing_version || this.quote.duration_seconds !== this.addedSeconds))
            || (changes['policy'] && changes['policy'].previousValue?.pricing_version !== changes['policy'].currentValue?.pricing_version))) {
      this.refreshQuote();
    }
    if (changes['jobs'] && this.source?.job && !this.submitting) {
      const current = this.jobs.find(job => job.id === this.source!.job!.id);
      if (!current || !canExtendVideo(current)) {
        this.clearSource();
        this.errorMessage = 'This video is no longer available. Choose another video or upload a saved copy.';
      }
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearSource();
    this.quoteSubscription?.unsubscribe();
    this.submitSubscription?.unsubscribe();
  }

  setSourceTab(tab: 'upload' | 'library'): void {
    if (tab === this.sourceTab || this.submitting) return;
    this.clearSource();
    this.sourceTab = tab;
  }

  selectJob(job: VideoJob): void {
    if (!canExtendVideo(job) || this.submitting) return;
    this.clearSource();
    this.sourceTab = 'library';
    this.source = {
      key: this.selectionVersion, title: job.prompt, job,
      isGif: job.output_format === 'gif',
      duration: null, width: job.width, height: job.height,
    };
    this.previewLoading = true;
    if (this.source.isGif) this.prepareGifPreview({ jobId: job.id }, this.source.key);
  }

  clearSource(): void {
    this.selectionVersion++;
    this.gifPreviewSubscription?.unsubscribe();
    this.gifPreviewSubscription = null;
    this.sourceVideo?.nativeElement.pause();
    this.clearPreviewTimer();
    if (this.source?.objectUrl) URL.revokeObjectURL(this.source.objectUrl);
    this.source = null;
    this.errorMessage = '';
    this.submissionError = '';
    this.readingFile = false;
    this.previewLoading = false;
    this.previewFailed = false;
    this.dragging = false;
  }

  upload(input: HTMLInputElement): void { input.value = ''; input.click(); }

  async onFileSelected(event: Event): Promise<void> {
    await this.addFiles(Array.from((event.target as HTMLInputElement).files ?? []));
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging = false;
    await this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  async addFiles(files: File[]): Promise<void> {
    if (!files.length || this.destroyed || this.submitting) return;
    const version = ++this.selectionVersion;
    this.errorMessage = '';
    this.readingFile = false;
    if (files.length !== 1) {
      this.errorMessage = 'Choose one video to extend.';
      return;
    }
    const file = files[0];
    if (!file.size || file.size > this.maxUploadBytes) {
      this.errorMessage = 'Choose a nonempty video up to 50 MB.';
      return;
    }
    this.readingFile = true;
    try {
      const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (this.destroyed || version !== this.selectionVersion) return;
      const mp4 = String.fromCharCode(...header.slice(4, 8)) === 'ftyp';
      const webm = [0x1a, 0x45, 0xdf, 0xa3].every((byte, index) => header[index] === byte);
      const gif = ['GIF87a', 'GIF89a'].includes(String.fromCharCode(...header.slice(0, 6)));
      if (!mp4 && !webm && !gif) throw new Error('Choose an MP4, MOV, WebM, or animated GIF.');
      const objectUrl = gif ? undefined : URL.createObjectURL(file);
      this.updateView(() => {
        this.clearSource();
        this.sourceTab = 'upload';
        this.source = {
          key: this.selectionVersion, title: file.name, file, objectUrl, isGif: gif,
          duration: null, width: null, height: null,
        };
        this.previewLoading = true;
        if (gif) this.prepareGifPreview({ file }, this.source.key);
      });
    } catch (error) {
      if (this.destroyed || version !== this.selectionVersion) return;
      this.updateView(() => {
        this.readingFile = false;
        this.errorMessage = error instanceof Error && error.message.startsWith('Choose ')
          ? error.message : 'That video could not be opened. Choose the file again or try a local copy.';
      });
    }
  }

  private prepareGifPreview(source: { file?: File; jobId?: string }, key: number): void {
    this.readingFile = true;
    this.gifPreviewSubscription = this.videoService.previewExtensionGif(source).pipe(timeout({ first: 240000 })).subscribe({
      next: preview => this.updateView(() => {
        if (this.source?.key !== key) return;
        this.readingFile = false;
        this.source.objectUrl = URL.createObjectURL(preview);
      }),
      error: error => {
        const showError = (message: string) => this.updateView(() => {
          if (this.source?.key !== key) return;
          this.readingFile = false;
          this.previewLoading = false;
          this.previewFailed = true;
          this.errorMessage = message;
        });
        const fallback = 'The GIF could not be prepared. Choose another animated GIF or try again.';
        if (error?.error instanceof Blob) {
          void error.error.text().then((text: string) => {
            try { const detail = JSON.parse(text).detail; showError(typeof detail === 'string' ? detail : fallback); }
            catch { showError(fallback); }
          }).catch(() => showError(fallback));
        } else {
          showError(typeof error?.error?.detail === 'string' ? error.error.detail : fallback);
        }
      },
    });
  }

  onPreviewStart(key: number): void {
    if (this.source?.key !== key) return;
    this.clearPreviewTimer();
    this.previewTimer = setTimeout(() => this.updateView(() => this.onPreviewError(key)), 20_000);
  }

  onPreviewLoaded(event: Event, key: number): void {
    if (this.source?.key !== key) return;
    const video = event.target as HTMLVideoElement;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      this.onPreviewError(key);
      return;
    }
    this.clearPreviewTimer();
    this.source.duration = video.duration;
    this.source.width = video.videoWidth;
    this.source.height = video.videoHeight;
    this.previewLoading = false;
    if (this.previewFailed) this.errorMessage = '';
    this.previewFailed = false;
    if (video.duration < (this.policy?.min_source_seconds ?? 39 / 24)
        || video.duration > (this.policy?.max_source_seconds ?? 60) + .15) {
      this.previewFailed = true;
      this.errorMessage = 'Choose a video at least 1.625 seconds long and no longer than 60 seconds.';
    }
  }

  onPreviewError(key: number): void {
    if (this.source?.key !== key) return;
    this.clearPreviewTimer();
    this.previewLoading = false;
    this.previewFailed = true;
    this.errorMessage = this.source.job
      ? 'The video preview is unavailable. Choose the video again, or upload a downloaded copy.'
      : 'This browser could not play that video. Try an MP4 with H.264 video.';
  }

  watchEnding(video: HTMLVideoElement): void {
    if (!this.sourceReady) return;
    video.currentTime = Math.max(0, video.duration - this.contextSeconds);
    void video.play().catch(() => { /* Native playback controls remain available. */ });
  }

  formatDuration(seconds: number | null): string {
    return seconds === null ? '—' : `${Number(seconds.toFixed(1))}s`;
  }

  selectLength(seconds: number): void {
    if (this.submitting || !this.lengthOptions.includes(seconds)) return;
    this.addedSeconds = seconds;
    this.submissionError = '';
    this.refreshQuote();
  }

  onGifOptionChanged(): void {
    if (this.outputAsGif) this.continueAudio = false;
  }

  onReferencesChanged(references: VideoReference[]): void {
    this.references = references;
    this.submissionError = '';
    this.refreshQuote();
  }

  insertReference(reference: { kind: 'image' | 'video'; index: number }): void {
    if (this.submitting) return;
    const tag = `<Picture ${reference.index}>`;
    if (this.prompt.length + tag.length + 1 <= this.promptMaxLength) {
      this.prompt = this.prompt.trimEnd() + (this.prompt ? ' ' : '') + tag;
    }
  }

  removedReference(reference: { kind: 'image' | 'video'; index: number }): void {
    const renumber = (text: string) => text.replace(/<Picture (\d+)>/g, (match, number) => {
      const index = Number(number);
      return index === reference.index ? '[removed image]' : index > reference.index ? `<Picture ${index - 1}>` : match;
    });
    this.prompt = renumber(this.prompt);
    this.audioPrompt = renumber(this.audioPrompt);
  }

  refreshQuote(): void {
    this.quoteSubscription?.unsubscribe();
    this.quote = null;
    this.quoteError = '';
    this.quoteLoading = false;
    if (!this.active || !this.policy || this.destroyed) return;
    const duration = this.addedSeconds;
    const referenceCount = this.references.length;
    this.quoteLoading = true;
    this.quoteSubscription = this.videoService.getExtensionQuote(duration, referenceCount).pipe(timeout({ first: 15000 })).subscribe({
      next: quote => this.updateView(() => {
        if (duration !== this.addedSeconds || referenceCount !== this.references.length) return;
        this.quote = quote;
        this.quoteLoading = false;
      }),
      error: () => this.updateView(() => {
        this.quoteLoading = false;
        this.quoteError = 'The extension price could not be checked. Please try again.';
      }),
    });
  }

  submit(): void {
    if (!this.canSubmit || !this.source || !this.quote) return;
    if (this.currentCredits < this.selectedCost) {
      this.creditsRequested.emit();
      return;
    }
    const soundEnabled = this.continueAudio && !this.outputAsGif;
    const selection = JSON.stringify([this.source.key, this.prompt.trim(), soundEnabled ? this.audioPrompt.trim() : '', soundEnabled, this.addedSeconds, this.references.map(item => item.id), this.outputAsGif]);
    if (selection !== this.requestSelection || !this.requestId) {
      this.requestSelection = selection;
      this.requestId = uuidv4();
    }
    this.submitting = true;
    this.submissionError = '';
    this.submitSubscription = this.videoService.submitExtension({
      requestId: this.requestId, sourceJobId: this.source.job?.id, sourceVideo: this.source.file,
      referenceImages: this.references.map(item => item.file),
      prompt: this.prompt.trim(), audioPrompt: soundEnabled ? this.audioPrompt.trim() : undefined,
      continueAudio: soundEnabled, outputFormat: this.outputAsGif ? 'gif' : 'video', durationSeconds: this.addedSeconds,
      expectedCreditCost: this.selectedCost, pricingVersion: this.quote.pricing_version,
    }).pipe(timeout({ first: 210000 })).subscribe({
      next: response => this.updateView(() => {
        this.submitting = false;
        this.requestId = '';
        this.submitted.emit(response);
      }),
      error: error => this.updateView(() => {
        this.submitting = false;
        const detail = error?.error?.detail;
        if (error?.status === 409 && detail?.code === 'video_price_changed') {
          this.quoteSubscription?.unsubscribe();
          this.quoteLoading = false;
          this.quote = detail.quote;
          this.quoteError = '';
          this.requestId = '';
          this.submissionError = detail.message;
        } else if (error?.status === 402) {
          this.creditsRequested.emit();
          this.submissionError = typeof detail === 'string' ? detail : 'There are not enough credits for this extension.';
        } else {
          this.submissionError = typeof detail === 'string' ? detail : detail?.message
            || 'The extension could not be confirmed. Retry with the same settings to check it without being charged twice.';
        }
      }),
    });
  }

  private clearPreviewTimer(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = null;
  }

  private updateView(update: () => void): void {
    if (this.destroyed) return;
    this.zone.run(() => { update(); this.cdr.detectChanges(); });
  }
}
