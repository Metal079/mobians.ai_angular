import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, finalize, fromEvent, interval, merge, timeout } from 'rxjs';
import { AccountCtaService } from '../auth/account-cta.service';
import { AuthService } from '../auth/auth.service';
import { GenerationModeSwitchComponent } from '../generation-mode-switch/generation-mode-switch.component';
import { ImageHistoryPanelComponent } from '../home/options/image-history-panel/image-history-panel.component';
import { VideoGenerationService } from '../video-generation.service';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { VideoAspect, VideoConfig, VideoJob } from 'src/_shared/video-generation.interface';

interface SelectedFrame {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  source: 'upload' | 'history';
}

type VideoCameraMotion =
  | 'auto'
  | 'static'
  | 'push-in'
  | 'pull-out'
  | 'tracking'
  | 'pan-left'
  | 'pan-right'
  | 'truck-left'
  | 'truck-right'
  | 'tilt-up'
  | 'tilt-down'
  | 'pedestal-up'
  | 'pedestal-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'shake';

interface CameraMotionOption {
  id: VideoCameraMotion;
  label: string;
  command: string | null;
  icon: string;
}

@Component({
  selector: 'app-video',
  standalone: true,
  imports: [CommonModule, FormsModule, GenerationModeSwitchComponent, ImageHistoryPanelComponent],
  templateUrl: './video.component.html',
  styleUrls: ['./video.component.css'],
})
export class VideoComponent implements OnInit, OnDestroy {
  config: VideoConfig | null = null;
  jobs: VideoJob[] = [];
  firstFrame: SelectedFrame | null = null;
  lastFrame: SelectedFrame | null = null;
  prompt = '';
  audioPrompt = '';
  cameraMotion: VideoCameraMotion = 'auto';
  showAdvancedCameraOptions = false;
  durationSeconds = 5;
  aspectRatio: VideoAspect = 'square';
  seed: number | null = null;
  aspectWasManuallyChanged = false;
  pickerOpen = false;
  pickerTarget: 'first' | 'last' = 'first';
  submitting = false;
  loadingJobs = false;
  configLoading = true;
  errorMessage = '';
  currentCredits = 0;
  readonly durationFallback = [5, 6, 7, 8, 9, 10];
  readonly aspectOrder: VideoAspect[] = ['square', 'landscape', 'portrait'];
  readonly promptMaxLength = 4000;
  readonly primaryCameraOptions: CameraMotionOption[] = [
    { id: 'auto', label: 'Auto', command: null, icon: 'bi-stars' },
    { id: 'static', label: 'Keep still', command: '[Static shot]', icon: 'bi-pause-circle' },
    { id: 'push-in', label: 'Move closer', command: '[Push in]', icon: 'bi-arrows-angle-contract' },
    { id: 'pull-out', label: 'Pull back', command: '[Pull out]', icon: 'bi-arrows-angle-expand' },
    { id: 'tracking', label: 'Follow subject', command: '[Tracking shot]', icon: 'bi-person-walking' },
  ];
  readonly advancedCameraOptions: CameraMotionOption[] = [
    { id: 'pan-left', label: 'Pan left', command: '[Pan left]', icon: 'bi-arrow-left' },
    { id: 'pan-right', label: 'Pan right', command: '[Pan right]', icon: 'bi-arrow-right' },
    { id: 'truck-left', label: 'Move left', command: '[Truck left]', icon: 'bi-arrow-bar-left' },
    { id: 'truck-right', label: 'Move right', command: '[Truck right]', icon: 'bi-arrow-bar-right' },
    { id: 'tilt-up', label: 'Tilt up', command: '[Tilt up]', icon: 'bi-arrow-up' },
    { id: 'tilt-down', label: 'Tilt down', command: '[Tilt down]', icon: 'bi-arrow-down' },
    { id: 'pedestal-up', label: 'Raise camera', command: '[Pedestal up]', icon: 'bi-chevron-double-up' },
    { id: 'pedestal-down', label: 'Lower camera', command: '[Pedestal down]', icon: 'bi-chevron-double-down' },
    { id: 'zoom-in', label: 'Zoom in', command: '[Zoom in]', icon: 'bi-zoom-in' },
    { id: 'zoom-out', label: 'Zoom out', command: '[Zoom out]', icon: 'bi-zoom-out' },
    { id: 'shake', label: 'Handheld', command: '[Shake]', icon: 'bi-phone-vibrate' },
  ];
  readonly thumbnailUrls = new Map<string, string>();
  readonly videoUrls = new Map<string, string>();
  readonly expandedPromptIds = new Set<string>();
  copiedPromptJobId: string | null = null;
  private readonly videoUrlExpiry = new Map<string, number>();
  private readonly knownRefunds = new Set<string>();
  private copiedPromptResetTimer: ReturnType<typeof setTimeout> | null = null;
  private pollSubscription: Subscription | null = null;
  private foregroundSubscription: Subscription | null = null;
  private creditsSubscription: Subscription | null = null;
  private readonly jobsRequestTimeoutMs = 15_000;

  constructor(
    private readonly videoService: VideoGenerationService,
    public readonly authService: AuthService,
    private readonly accountCta: AccountCtaService,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.creditsSubscription = this.authService.credits$.subscribe((credits) => {
      this.runInView(() => this.currentCredits = credits?.credits ?? 0);
    });
    this.loadConfig();
    if (this.authService.isLoggedIn()) {
      void this.authService.refreshCredits();
      this.loadJobs();
    }
    this.pollSubscription = interval(5000).subscribe(() => {
      if (this.authService.isLoggedIn()) this.loadJobs(true);
    });
    this.foregroundSubscription = merge(
      fromEvent(window, 'focus'),
      fromEvent(document, 'visibilitychange'),
    ).subscribe(() => {
      if (this.authService.isLoggedIn() && document.visibilityState === 'visible') {
        this.loadJobs(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.pollSubscription?.unsubscribe();
    this.foregroundSubscription?.unsubscribe();
    this.creditsSubscription?.unsubscribe();
    if (this.copiedPromptResetTimer) clearTimeout(this.copiedPromptResetTimer);
    this.revokeFrame(this.firstFrame);
    this.revokeFrame(this.lastFrame);
    document.body.classList.remove('video-picker-open');
    for (const url of this.thumbnailUrls.values()) URL.revokeObjectURL(url);
    this.thumbnailUrls.clear();
  }

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  get durations(): number[] {
    return this.config?.durations ?? this.durationFallback;
  }

  get activeJobs(): number {
    return this.jobs.filter((job) => job.status === 'pending' || job.status === 'processing').length;
  }

  get activeLimit(): number {
    return this.config?.active_job_limit ?? 3;
  }

  get selectedCost(): number {
    return this.config?.prices?.[String(this.durationSeconds)] ?? (100 + (this.durationSeconds - 5) * 40);
  }

  get serviceAcceptingJobs(): boolean {
    return !!this.config?.service?.accepting_jobs;
  }

  get adaptationWarning(): string | null {
    if (!this.firstFrame) return null;
    const sourceRatio = this.firstFrame.width / this.firstFrame.height;
    const target = this.aspectDimensions(this.aspectRatio);
    const targetRatio = target.width / target.height;
    const difference = Math.abs(Math.log(sourceRatio / targetRatio));
    if (difference < 0.12) return null;
    return `Your ${this.firstFrame.width}×${this.firstFrame.height} frame will be adapted to ${target.width}×${target.height}. Some cropping or padding may occur.`;
  }

  get promptPlaceholder(): string {
    return this.lastFrame
      ? 'She turns naturally and settles into the ending pose while the camera slowly moves closer.'
      : 'Her hair moves in the breeze as she looks toward the camera and smiles.';
  }

  get selectedCameraOption(): CameraMotionOption {
    return [...this.primaryCameraOptions, ...this.advancedCameraOptions]
      .find((option) => option.id === this.cameraMotion) ?? this.primaryCameraOptions[0];
  }

  get maxUserPromptLength(): number {
    const commandLength = this.selectedCameraOption.command?.length ?? 0;
    return this.promptMaxLength - (commandLength ? commandLength + 1 : 0);
  }

  get composedPrompt(): string {
    const prompt = this.prompt.trim();
    const command = this.selectedCameraOption.command;
    return command ? `${prompt} ${command}` : prompt;
  }

  get canSubmit(): boolean {
    return !!this.firstFrame
      && !!this.composedPrompt
      && this.composedPrompt.length <= this.promptMaxLength
      && this.activeJobs < this.activeLimit
      && this.serviceAcceptingJobs
      && !this.submitting;
  }

  loadConfig(): void {
    this.configLoading = true;
    this.videoService.getConfig().subscribe({
      next: (config) => {
        this.runInView(() => {
          this.config = config;
          this.configLoading = false;
        });
      },
      error: () => {
        this.runInView(() => {
          this.configLoading = false;
          this.errorMessage = 'Video service configuration could not be loaded.';
        });
      },
    });
  }

  loadJobs(silent = false): void {
    if (this.loadingJobs) return;
    this.loadingJobs = true;
    this.videoService.listJobs().pipe(
      timeout({ first: this.jobsRequestTimeoutMs }),
      finalize(() => {
        if (this.loadingJobs) this.runInView(() => this.loadingJobs = false);
      }),
    ).subscribe({
      next: ({ jobs }) => {
        const sawNewRefund = jobs.some((job) => {
          if (!job.refunded || this.knownRefunds.has(job.id)) return false;
          this.knownRefunds.add(job.id);
          return true;
        });
        this.runInView(() => {
          this.jobs = jobs;
          this.hydrateJobAssets();
        });
        if (sawNewRefund) void this.authService.refreshCredits();
      },
      error: (error) => {
        this.runInView(() => {
          if (!silent) this.errorMessage = this.apiError(error, 'Your videos could not be loaded.');
        });
      },
    });
  }

  openLogin(): void {
    this.accountCta.requestLogin({
      reason: 'generic',
      title: 'Sign in to create videos',
      message: 'Video jobs use your account credits and stay synchronized across your devices.',
    });
  }

  openCreditPurchase(): void {
    this.accountCta.requestCreditPurchase({
      reason: 'insufficient-credits',
      requiredCredits: this.selectedCost,
      currentCredits: this.currentCredits,
      requestedMode: 'video',
      message: `A ${this.durationSeconds}-second video costs ${this.selectedCost} credits.`,
    });
  }

  triggerUpload(input: HTMLInputElement, target: 'first' | 'last'): void {
    this.pickerTarget = target;
    input.value = '';
    input.click();
  }

  async onFileSelected(event: Event, target: 'first' | 'last'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.setFrame(file, target, 'upload');
  }

  async onFrameDrop(event: DragEvent, target: 'first' | 'last'): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) await this.setFrame(file, target, 'upload');
  }

  openHistory(target: 'first' | 'last'): void {
    this.pickerTarget = target;
    this.pickerOpen = true;
    document.body.classList.add('video-picker-open');
  }

  closeHistory(): void {
    this.pickerOpen = false;
    document.body.classList.remove('video-picker-open');
  }

  async onHistoryImageSelected(image: MobiansImage): Promise<void> {
    if (!image.blob) return;
    const extension = image.blob.type === 'image/png' ? 'png' : image.blob.type === 'image/jpeg' ? 'jpg' : 'webp';
    const file = new File([image.blob], `history-${image.UUID || Date.now()}.${extension}`, {
      type: image.blob.type || 'image/webp',
    });
    await this.setFrame(file, this.pickerTarget, 'history');
    this.runInView(() => this.closeHistory());
  }

  removeFrame(target: 'first' | 'last'): void {
    if (target === 'first') {
      this.revokeFrame(this.firstFrame);
      this.firstFrame = null;
      this.aspectWasManuallyChanged = false;
    } else {
      this.revokeFrame(this.lastFrame);
      this.lastFrame = null;
    }
  }

  selectAspect(aspect: VideoAspect): void {
    this.aspectRatio = aspect;
    this.aspectWasManuallyChanged = true;
  }

  aspectDimensions(aspect: VideoAspect): { width: number; height: number } {
    return this.config?.aspects?.[aspect] ?? {
      width: aspect === 'landscape' ? 768 : aspect === 'portrait' ? 512 : 640,
      height: aspect === 'landscape' ? 512 : aspect === 'portrait' ? 768 : 640,
    };
  }

  aspectLabel(aspect: VideoAspect): string {
    return aspect.charAt(0).toUpperCase() + aspect.slice(1);
  }

  submit(): void {
    this.errorMessage = '';
    if (!this.isLoggedIn) {
      this.openLogin();
      return;
    }
    if (this.currentCredits < this.selectedCost) {
      this.openCreditPurchase();
      return;
    }
    if (!this.canSubmit || !this.firstFrame) return;
    this.submitting = true;
    this.videoService.submitJob({
      firstFrame: this.firstFrame.file,
      firstFrameSource: this.firstFrame.source,
      lastFrame: this.lastFrame?.file,
      lastFrameSource: this.lastFrame?.source,
      prompt: this.composedPrompt,
      audioPrompt: this.audioPrompt.trim() || null,
      durationSeconds: this.durationSeconds,
      aspectRatio: this.aspectRatio,
      seed: this.seed,
    }).subscribe({
      next: (response) => {
        this.runInView(() => {
          this.submitting = false;
          this.authService.updateCredits(response.credits_remaining);
          this.jobs = [response.job, ...this.jobs.filter((job) => job.id !== response.job.id)];
          this.hydrateJobAssets();
          this.cameraMotion = 'auto';
          this.showAdvancedCameraOptions = false;
          this.seed = null;
        });
      },
      error: (error) => {
        this.runInView(() => {
          this.submitting = false;
          if (error?.status === 402) {
            this.openCreditPurchase();
          } else {
            this.errorMessage = this.apiError(error, 'The video job could not be queued.');
          }
        });
      },
    });
  }

  isPromptExpanded(job: VideoJob): boolean {
    return this.expandedPromptIds.has(job.id);
  }

  togglePrompt(job: VideoJob): void {
    if (this.expandedPromptIds.has(job.id)) {
      this.expandedPromptIds.delete(job.id);
    } else {
      this.expandedPromptIds.add(job.id);
    }
  }

  async copyPrompt(job: VideoJob): Promise<void> {
    try {
      await navigator.clipboard.writeText(job.prompt);
      this.runInView(() => this.copiedPromptJobId = job.id);
      if (this.copiedPromptResetTimer) clearTimeout(this.copiedPromptResetTimer);
      this.copiedPromptResetTimer = setTimeout(() => {
        this.runInView(() => this.copiedPromptJobId = null);
        this.copiedPromptResetTimer = null;
      }, 2000);
    } catch {
      this.runInView(() => {
        this.errorMessage = 'The prompt could not be copied. Select the expanded prompt and copy it manually.';
      });
    }
  }

  cancel(job: VideoJob): void {
    if (job.status !== 'pending') return;
    this.videoService.cancelJob(job.id).subscribe({
      next: (response) => {
        this.runInView(() => {
          this.authService.updateCredits(response.credits_remaining);
          if (response.credits_refunded > 0) this.knownRefunds.add(job.id);
          this.jobs = this.jobs.map((existingJob) => existingJob.id === job.id
            ? {
                ...existingJob,
                status: 'cancelled',
                refunded: response.credits_refunded > 0 || existingJob.refunded,
                error_message: 'Cancelled by user',
                updated_at: new Date().toISOString(),
              }
            : existingJob
          );
        });
        this.loadJobs(true);
      },
      error: (error) => this.runInView(() => this.errorMessage = this.apiError(error, 'The pending job could not be cancelled.')),
    });
  }

  download(job: VideoJob): void {
    this.videoService.createMediaToken(job.id).subscribe({
      next: ({ access_token }) => {
        const link = document.createElement('a');
        link.href = this.videoService.mediaUrl(job.id, access_token, true);
        link.download = `mobians-video-${job.id}.mp4`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      },
      error: (error) => this.runInView(() => this.errorMessage = this.apiError(error, 'A download link could not be created.')),
    });
  }

  statusLabel(job: VideoJob): string {
    if (job.status === 'pending') return job.queue_position ? `Queued #${job.queue_position}` : 'Queued';
    if (job.status === 'processing') return `Generating ${job.progress}%`;
    if (job.status === 'completed') return 'Ready';
    if (job.status === 'cancelled') return 'Cancelled';
    if (job.status === 'failed') return job.refunded ? 'Failed · refunded' : 'Failed';
    return 'Expired';
  }

  expiresLabel(job: VideoJob): string {
    if (!job.expires_at) return '';
    const milliseconds = new Date(job.expires_at).getTime() - Date.now();
    if (milliseconds <= 0) return 'Expired';
    const hours = Math.floor(milliseconds / 3_600_000);
    const minutes = Math.max(1, Math.floor((milliseconds % 3_600_000) / 60_000));
    return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
  }

  trackJob(_: number, job: VideoJob): string {
    return job.id;
  }

  private async setFrame(
    file: File,
    target: 'first' | 'last',
    source: 'upload' | 'history',
  ): Promise<void> {
    const allowed = this.config?.accepted_frame_types ?? ['image/jpeg', 'image/png', 'image/webp'];
    const maxBytes = this.config?.max_frame_bytes ?? 15 * 1024 * 1024;
    if (!allowed.includes(file.type)) {
      this.errorMessage = 'Frames must be JPEG, PNG, or WebP images.';
      return;
    }
    if (file.size > maxBytes) {
      this.errorMessage = 'Each frame must be 15 MB or smaller.';
      return;
    }
    try {
      const dimensions = await this.readImageDimensions(file);
      const previewUrl = URL.createObjectURL(file);
      const selected: SelectedFrame = { file, previewUrl, ...dimensions, source };
      this.runInView(() => {
        if (target === 'first') {
          this.revokeFrame(this.firstFrame);
          this.firstFrame = selected;
          if (!this.aspectWasManuallyChanged) this.aspectRatio = this.nearestAspect(dimensions.width / dimensions.height);
        } else {
          this.revokeFrame(this.lastFrame);
          this.lastFrame = selected;
        }
        this.errorMessage = '';
      });
    } catch {
      this.runInView(() => {
        this.errorMessage = 'That image could not be read. Try a different JPEG, PNG, or WebP file.';
      });
    }
  }

  private nearestAspect(ratio: number): VideoAspect {
    const targets: Array<[VideoAspect, number]> = [['square', 1], ['landscape', 1.5], ['portrait', 2 / 3]];
    return targets.reduce((best, candidate) =>
      Math.abs(Math.log(ratio / candidate[1])) < Math.abs(Math.log(ratio / best[1])) ? candidate : best
    )[0];
  }

  private readImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Invalid image'));
      };
      image.src = url;
    });
  }

  private revokeFrame(frame: SelectedFrame | null): void {
    if (frame?.previewUrl) URL.revokeObjectURL(frame.previewUrl);
  }

  private hydrateJobAssets(): void {
    for (const job of this.jobs) {
      if (!this.thumbnailUrls.has(job.id)) {
        this.videoService.getThumbnail(job.id, 'first').subscribe({
          next: (blob) => this.runInView(() => this.thumbnailUrls.set(job.id, URL.createObjectURL(blob))),
        });
      }
      if (job.media_ready && (!this.videoUrls.has(job.id) || (this.videoUrlExpiry.get(job.id) ?? 0) < Date.now() + 60_000)) {
        this.videoService.createMediaToken(job.id).subscribe({
          next: ({ access_token, expires_in }) => {
            this.runInView(() => {
              this.videoUrls.set(job.id, this.videoService.mediaUrl(job.id, access_token));
              this.videoUrlExpiry.set(job.id, Date.now() + expires_in * 1000);
            });
          },
        });
      }
    }
  }

  private apiError(error: any, fallback: string): string {
    const detailMessage = this.formatApiErrorDetail(error?.error?.detail);
    if (detailMessage) return detailMessage;

    const responseMessage = this.formatApiErrorDetail(error?.error?.message);
    return responseMessage || fallback;
  }

  private formatApiErrorDetail(detail: unknown): string | null {
    if (typeof detail === 'string') return detail.trim() || null;

    if (Array.isArray(detail)) {
      const messages = detail
        .map((entry) => this.formatValidationEntry(entry))
        .filter((message): message is string => !!message);
      const uniqueMessages = [...new Set(messages)];
      if (!uniqueMessages.length) return null;

      const visibleMessages = uniqueMessages.slice(0, 3);
      const hiddenCount = uniqueMessages.length - visibleMessages.length;
      const suffix = hiddenCount > 0
        ? ` ${hiddenCount} more input ${hiddenCount === 1 ? 'error' : 'errors'}.`
        : '';
      return `${visibleMessages.join(' ')}${suffix}`;
    }

    if (detail && typeof detail === 'object') {
      const record = detail as Record<string, unknown>;
      return this.formatApiErrorDetail(record['message'])
        ?? this.formatApiErrorDetail(record['msg'])
        ?? this.formatApiErrorDetail(record['detail']);
    }

    return null;
  }

  private formatValidationEntry(entry: unknown): string | null {
    if (typeof entry === 'string') return this.withTerminalPunctuation(entry);
    if (!entry || typeof entry !== 'object') return null;

    const validation = entry as Record<string, unknown>;
    const message = this.formatApiErrorDetail(validation['msg'])
      ?? this.formatApiErrorDetail(validation['message'])
      ?? this.formatApiErrorDetail(validation['detail']);
    if (!message) return null;

    const location = Array.isArray(validation['loc'])
      ? validation['loc'].filter((part) => part !== 'body').at(-1)
      : null;
    const field = typeof location === 'string' ? this.validationFieldLabel(location) : null;
    return this.withTerminalPunctuation(field ? `${field}: ${message}` : message);
  }

  private validationFieldLabel(field: string): string {
    const labels: Record<string, string> = {
      first_frame: 'First frame',
      last_frame: 'Last frame',
      first_frame_source: 'First frame source',
      last_frame_source: 'Last frame source',
      prompt: 'Video description',
      audio_prompt: 'Audio direction',
      duration_seconds: 'Video length',
      aspect_ratio: 'Aspect ratio',
      seed: 'Seed',
    };
    return labels[field] ?? field.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
  }

  private withTerminalPunctuation(message: string): string {
    const normalized = message.trim();
    return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
  }

  private runInView(update: () => void): void {
    this.zone.run(() => {
      update();
      this.cdr.detectChanges();
    });
  }
}
