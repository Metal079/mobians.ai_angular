import { Component, Input, Output, EventEmitter, OnInit, ViewChild } from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { GenerationModelSettings, StableDiffusionService } from 'src/app/stable-diffusion.service';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { interval, of, firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { takeWhile, finalize, concatMap, tap, retryWhen, scan, delayWhen, timeout } from 'rxjs/operators';
import { SharedService } from 'src/app/shared.service';
import { Subscription } from 'rxjs';
import { timer } from 'rxjs';
import { MessageService } from 'primeng/api';
import { v4 as uuidv4 } from 'uuid';
import { NotificationService } from 'src/app/notification.service';
import { SwPush } from '@angular/service-worker';
import { environment } from 'src/environments/environment';
import { BlobMigrationService } from 'src/app/blob-migration.service';
import { DestroyRef, inject } from '@angular/core';
import { GenerationLockService } from 'src/app/generation-lock.service';
import { AuthService } from 'src/app/auth/auth.service';
import { DynamicPromptingConfig } from 'src/_shared/generation-request.interface';
import { RegionalPromptRegion, RegionalPromptingConfig } from 'src/_shared/regional-prompting.interface';
import { ImageHistoryPanelComponent } from './image-history-panel/image-history-panel.component';
import { GenerationOptionsPanelComponent } from './generation-options-panel/generation-options-panel.component';
import { LorasPanelComponent } from './loras-panel/loras-panel.component';
import { DynamicPromptApplyEvent, DynamicPromptHelperComponent } from './dynamic-prompt-helper/dynamic-prompt-helper.component';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { TextareaModule } from 'primeng/textarea';
import { HintComponent } from 'src/app/hint/hint.component';
import { AprilFoolsService } from 'src/app/april-fools.service';
import { AccountCtaService } from 'src/app/auth/account-cta.service';
import { DynamicPromptLibraryStateService } from 'src/app/dynamic-prompt-library-state.service';


@Component({
    selector: 'app-options',
    templateUrl: './options.component.html',
    styleUrls: ['./options.component.css'],
    standalone: true,
    imports: [
      CommonModule,
      FormsModule,
      RouterOutlet,
      ToastModule,
      ButtonModule,
      TooltipModule,
      TextareaModule,
      HintComponent,
      GenerationOptionsPanelComponent,
      ImageHistoryPanelComponent,
      LorasPanelComponent,
      DynamicPromptHelperComponent
    ]
})
export class OptionsComponent implements OnInit {
  private subscription!: Subscription;
  private referenceImageSubscription!: Subscription;
  @ViewChild(ImageHistoryPanelComponent) historyPanel?: ImageHistoryPanelComponent;
  private settingsHydrated = false;
  modelSettings: GenerationModelSettings[] = [];
  models_types: { [model: string]: string; } = this.createModelTypeMap(this.modelSettings);
  private defaultModelId: string = 'novaMobianXL_v20';

  private getAvailableModelIds(): string[] {
    return this.modelSettings
      .filter(model => model.is_active !== false)
      .map(model => model.model_id);
  }

  private getDefaultModelId(): string {
    const available = this.getAvailableModelIds();
    if (available.includes(this.defaultModelId)) return this.defaultModelId;
    return available[0] || this.defaultModelId;
  }

  private resolveDefaultModelId(modelSettings: GenerationModelSettings[]): string {
    const activeModels = modelSettings.filter(model => model.is_active !== false);
    const defaultModel = activeModels.find(model => model.is_default);
    if (defaultModel) return defaultModel.model_id;
    if (activeModels.some(model => model.model_id === 'novaMobianXL_v20')) return 'novaMobianXL_v20';
    return activeModels[0]?.model_id || 'novaMobianXL_v20';
  }

  private createModelTypeMap(modelSettings: GenerationModelSettings[]): { [model: string]: string } {
    return modelSettings.reduce((acc, model) => {
      if (model.model_id) acc[model.model_id] = model.base_model || 'SD 1.5';
      return acc;
    }, {} as { [model: string]: string });
  }

  private getModelSetting(modelId: unknown): GenerationModelSettings | undefined {
    const normalized = typeof modelId === 'string' ? modelId.trim() : '';
    return this.modelSettings.find(model => model.model_id === normalized);
  }

  private setModelSettings(modelSettings: GenerationModelSettings[], defaultModelId?: string): void {
    const activeModels = (modelSettings || [])
      .filter(model => model?.model_id && model.is_active !== false)
      .map(model => ({
        ...model,
        default_cfg: this.validateModelDefaultCfg(model.default_cfg, model.model_id),
        credit_cost: Number(model.credit_cost ?? 0),
        lora_credit_cost: Number(model.lora_credit_cost ?? 0),
        display_order: Number(model.display_order ?? 0),
      }))
      .sort((left, right) => (left.display_order - right.display_order) || left.model_id.localeCompare(right.model_id));

    if (!activeModels.length) {
      throw new Error('No active generation models were returned by the backend.');
    }

    this.modelSettings = activeModels;
    this.models_types = this.createModelTypeMap(activeModels);
    this.defaultModelId = defaultModelId && activeModels.some(model => model.model_id === defaultModelId)
      ? defaultModelId
      : this.resolveDefaultModelId(activeModels);
  }

  private normalizeModelId(model: unknown): string {
    const raw = (typeof model === 'string' ? model : '').trim();
    if (!raw) return this.getDefaultModelId();

    const available = this.getAvailableModelIds();
    if (available.includes(raw)) return raw;

    // Case-insensitive fallback (helps if casing changed).
    const lowerMap = new Map(available.map(m => [m.toLowerCase(), m] as const));
    const mapped = lowerMap.get(raw.toLowerCase());
    return mapped || this.getDefaultModelId();
  }

  private applyModelDefaultsIfChanged(prevModel: string | undefined, nextModel: string): void {
    if (prevModel === nextModel) return;

    this.generationRequest.guidance_scale = this.getDefaultCfgForModel(nextModel);
  }

  private getDefaultCfgForModel(modelId: string): number {
    const setting = this.getModelSetting(modelId);
    if (setting) return setting.default_cfg;

    return this.normalizeCfgValue(undefined, this.usesSdxlResolutionDefaults(modelId) ? 4 : 7);
  }

  private validateModelDefaultCfg(value: unknown, modelId: string): number {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 15) {
      throw new Error(`Invalid default CFG for generation model ${modelId}: ${value}`);
    }
    return numeric;
  }

  private normalizeCfgValue(value: unknown, fallback: number): number {
    const numeric = Number(value);
    const resolved = Number.isFinite(numeric) ? numeric : fallback;
    return Math.min(15, Math.max(1, Math.round(resolved)));
  }

  private usesSdxlResolutionDefaults(modelId: unknown): boolean {
    return this.getModelSetting(modelId)?.supports_sdxl_resolution === true;
  }

  private supportsRegionalPrompting(modelId: unknown): boolean {
    return this.getModelSetting(modelId)?.supports_regional_prompting === true;
  }

  supportsUpscale(modelId: unknown): boolean {
    return this.getModelSetting(modelId)?.supports_upscale !== false;
  }

  private getModelType(modelId: unknown): string {
    return this.getModelSetting(modelId)?.base_model || 'SD 1.5';
  }

  private disableRegionalPromptingForUnsupportedModel(modelId: unknown): void {
    if (this.supportsRegionalPrompting(modelId)) return;
    if (!this.generationRequest?.regional_prompting) {
      this.generationRequest.regional_prompting = { enabled: false, regions: [] };
      return;
    }
    this.generationRequest.regional_prompting.enabled = false;
  }

  private ensureValidModelSelected(persist: boolean = true): void {
    if (!this.modelSettings.length) {
      if (this.aspectRatio) this.aspectRatio.model = this.generationRequest?.model || this.defaultModelId;
      return;
    }

    const previous = this.generationRequest?.model;
    const normalized = this.normalizeModelId(previous);
    this.generationRequest.model = normalized;
    this.applyModelDefaultsIfChanged(previous, normalized);
    this.disableRegionalPromptingForUnsupportedModel(normalized);

    // Keep aspect ratio config in sync with the selected model.
    if (this.aspectRatio) this.aspectRatio.model = normalized;

    if (persist) localStorage.setItem('model', normalized);
  }

  private normalizePanelTheme(theme: string | null | undefined): 'sonic' | 'navy' | 'eggman' {
    if (theme === 'navy') return 'navy';
    if (theme === 'eggman') return 'eggman';
    return 'sonic';
  }

  private applyThemeToBody(theme: 'sonic' | 'navy' | 'eggman'): void {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('theme-navy', theme === 'navy');
    document.body.classList.toggle('theme-eggman', theme === 'eggman');
  }

  private applyInputStyleToBody(enabled: boolean): void {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('dark-input-fields', !!enabled);
  }
  enableGenerationButton: boolean = true;
  showLoading: boolean = false;
  showStrength: boolean = false;
  showInpainting: boolean = false;
  showInpaintingCanvas: boolean = false;
  enableNotifications: boolean = false;
  queuePosition?: number;
  images: MobiansImage[] = [];
  aspectRatio: AspectRatio = { width: 512, height: 512, model: "novaMobianXL_v20", aspectRatio: "square" };
  defaultNegativePrompt: string = "nsfw, 3d, EasyNegativeV2, worst quality, low quality, watermark, signature, simple background, bad anatomy, bad hands, deformed limbs, blurry, cropped, cross-eyed, extra arms, speech bubble, extra legs, extra limbs, bad proportions, poorly drawn hands, text, flat background";
  generationRequest: any = {
    prompt: "",
    image: undefined,
    image_UUID: undefined,
    mask_image: undefined,
    negative_prompt: this.defaultNegativePrompt,
    scheduler: 7,
    steps: 20,
    width: 512,
    height: 512,
    guidance_scale: 4,
    seed: undefined,
    batch_size: 4,
    strength: 0.7,
    job_type: "txt2img",
    model: "novaMobianXL_v20",
    fast_pass_code: undefined,
    is_dev_job: environment.isDevJob,
    loras: [],
    lossy_images: true,
    regional_prompting: {
      enabled: false,
      regions: [],
    },
    dynamic_prompting: {
      enabled: false,
    },
  };
  jobID: string = "";
  // Add a simple flag to indicate a pending job
  hasPendingJob: boolean = false;
  // Track active polling subscription and cancel state
  private jobPollSub?: Subscription;
  // Make cancelInProgress public so it can be referenced in the template
  cancelInProgress: boolean = false;
  API_URL: string = "";
  referenceImage?: MobiansImage;
  currentSeed?: number;

  showMigration: boolean = false;
  blobUrls: string[] = [];

  // New properties for menus
  showOptions: boolean = false;
  showHistory: boolean = false;
  showLoras: boolean = false;
  availableLoras: string[] = ['Loras1', 'Loras2', 'Loras3']; // Example Loras names
  panelTheme: 'sonic' | 'navy' | 'eggman' = 'sonic';
  darkInputFields = false;
  loraResetToken = 0;

  downloadAllInProgress = false;


  // Persistence keys
  private readonly pendingJobKey = 'mobians:pending-job';
  private readonly queueEtaKey = 'mobians:queue-eta';
  private readonly dynamicPromptCategorySyntaxMigrationKey = 'mobians:dynamic-prompt-category-syntax-v2';
  private readonly pendingMaxAgeMs = 24 * 60 * 60 * 1000; // 24h max age for pending jobs

  // Queue type and credits
  queueType: 'free' | 'priority' = 'free';
  creditCost: number = 0;
  upscaleCreditCost: number = 0;
  hiresCreditCost: number = 0;
  hiresEnabled: boolean = false;
  userCredits: number = 0;
  isLoggedIn: boolean = false;
  private queueTypeBeforeHires: 'free' | 'priority' = 'free';
  private lastSubmittedCreditCost = 0;
  private lastSubmittedMode: 'generate' | 'upscale' | 'hires' | 'priority' = 'generate';
  
  @Input() inpaintMask?: string;

  @Output() imagesChange = new EventEmitter<any>();
  @Output() loadingChange = new EventEmitter<any>();
  @Output() aspectRatioChange = new EventEmitter<AspectRatio>();
  @Output() inpaintingChange = new EventEmitter<boolean>();
  @Output() queuePositionChange = new EventEmitter<number>();
  @Output() queueStatusMessageChange = new EventEmitter<string | undefined>();
  @Output() imageModalOpen = new EventEmitter<boolean>();
  @Output() etaChange = new EventEmitter<number | undefined>();
  private readonly destroyRef = inject(DestroyRef);
  private dynamicPromptLibraryRefreshTimer?: ReturnType<typeof setTimeout>;
  private readonly dynamicPromptLibraryRefreshDelayMs = 750;

  constructor(
    private stableDiffusionService: StableDiffusionService
    , private sharedService: SharedService
    , private messageService: MessageService
    , private notificationService: NotificationService
    , private swPush: SwPush
    , private blobMigrationService: BlobMigrationService
    , private lockService: GenerationLockService
    , private authService: AuthService
    , public aprilFools: AprilFoolsService
    , private accountCtaService: AccountCtaService
    , private dynamicPromptLibraryState: DynamicPromptLibraryStateService
  ) {
    this.blobMigrationService.progress$.subscribe(
      () => {
        this.showMigration = true;
      },
      () => {
        this.showMigration = false;
      },
      () => {
        this.showMigration = false;
      }
    );

    // Cross-tab updates to queue position / ETA
    window.addEventListener('storage', (e) => {
      if (e.key === this.queueEtaKey && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data.queue_position != null) this.queuePositionChange.emit(data.queue_position);
          if (data.eta != null) this.etaChange.emit(data.eta);
        } catch {}
      }
      if (e.key === this.pendingJobKey) {
        // If another tab started or finished a job, update button state
        const pending = this.getPendingJob();
        this.enableGenerationButton = !pending;
        this.loadingChange.emit(!!pending);
      }
    });
  }

  private async loadGenerationModels(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.stableDiffusionService.getGenerationModels().pipe(timeout(5000))
      );
      this.setModelSettings(response.models, response.default_model);
      this.ensureValidModelSelected(false);
      this.updateCreditCost();
    } catch (error) {
      console.error('Failed to load generation models.', error);
      this.enableGenerationButton = false;
      this.messageService.add({
        severity: 'error',
        summary: 'Model settings unavailable',
        detail: 'Generation models could not be loaded from the server. Please try again later.',
      });
    }
  }

  async ngOnInit() {
    this.subscription = this.sharedService.getPrompt().subscribe(value => {
      this.generationRequest.prompt = value;
    });

    // Subscribe to credits changes
    this.authService.credits$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async creditsData => {
      if (creditsData) {
        this.userCredits = creditsData.credits;
        this.isLoggedIn = true;
      } else {
        this.userCredits = 0;
        this.isLoggedIn = this.authService.isLoggedIn();
      }
      if (!this.isLoggedIn && this.hiresEnabled) {
        this.hiresEnabled = false;
        localStorage.removeItem("hires-enabled");
      }
      // Update credit cost display
      this.updateCreditCost();
    });

    await this.loadSettings();
    await this.loadGenerationModels();

    this.dynamicPromptLibraryState.ensureLoaded().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.applyDynamicPromptState(this.generationRequest.prompt),
      error: () => {},
    });

    // If model names change between deployments, users may have an invalid saved model.
    // Coerce to a valid model so generation requests never send an empty/unknown model.
    this.ensureValidModelSelected(true);

    this.sharedService.setGenerationRequest(this.generationRequest);
    this.updateSharedPrompt();

    this.referenceImageSubscription = this.sharedService.getReferenceImage().subscribe(image => {
      if (image) {
        this.generationRequest.job_type = "img2img";
        // Only set image data if base64 is present; submitJob() will convert from blob if needed
        if (image.base64) {
          this.generationRequest.image = image.base64;
        } else {
          // Clear any stale image data - submitJob() will convert from blob
          this.generationRequest.image = undefined;
        }
        this.referenceImage = image;

        // Set the aspect ratio
        this.changeAspectRatio(image.aspectRatio);
      } else {
        this.generationRequest.job_type = "txt2img";
        this.generationRequest.image = undefined;
        this.generationRequest.mask_image = undefined;
        this.generationRequest.color_inpaint = undefined;
        this.referenceImage = undefined;
        // If the user re-enters txt2img, validate auth/credit constraints.
        this.enforceHiresConstraints();
      }
    });

    // Removed localStorage restore; session should be provided by backend if needed

    // Resume any pending job (respect max age)
    const pending = this.getPendingJob();
    if (pending) {
      this.jobID = pending.job_id;
      this.hasPendingJob = true;
      if (pending.createdAt && (Date.now() - pending.createdAt > this.pendingMaxAgeMs)) {
        // Too old to resume; restore settings and clear pending
        this.handleExpiredPendingJob(pending);
      } else {
        this.enableGenerationButton = false;
        this.loadingChange.emit(true);
        // Rehydrate minimal request context if available
        if (pending.request) {
          this.generationRequest = { ...this.generationRequest, ...pending.request };
          this.sharedService.setGenerationRequest(this.generationRequest);
          // Restore queue type if it was saved
          if (pending.request.queue_type) {
            this.queueType = pending.request.queue_type;
          }
          if (Array.isArray(pending.request.loras)) {
            this.generationRequest.loras = this.snapshotLoras(pending.request.loras);
            this.updateCreditCost();
          }
          if (pending.request.regional_prompting) {
            this.generationRequest.regional_prompting = this.sanitizeRegionalPrompting(
              pending.request.regional_prompting,
              pending.request.model
            );
          }
        }

        // Pending job restore can also carry stale/invalid model values.
        this.ensureValidModelSelected(true);
        this.sharedService.setGenerationRequest(this.generationRequest);

        this.getJob(pending.job_id);
      }
    }
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.referenceImageSubscription) {
      this.referenceImageSubscription.unsubscribe();
    }
    if (this.dynamicPromptLibraryRefreshTimer) {
      clearTimeout(this.dynamicPromptLibraryRefreshTimer);
    }

    // Revoke all object URLs to prevent memory leaks
    this.blobUrls.forEach((url) => URL.revokeObjectURL(url));
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['inpaintMask']) {
      this.inpaintMask = changes['inpaintMask'].currentValue;
      if (this.inpaintMask == undefined) {
        this.generationRequest.mask_image = undefined;
        this.generationRequest.color_inpaint = undefined;
        this.generationRequest.job_type = this.referenceImage ? "img2img" : "txt2img";
      }
      else {
        this.generationRequest.mask_image = this.inpaintMask;
        this.generationRequest.job_type = "inpainting";
      }
    }
  }

  changeModel(event: any) {
    let selectElement = event.target as HTMLSelectElement;
    const selectedModelId = this.normalizeModelId(selectElement.value);
    this.generationRequest.model = selectedModelId;
    this.disableRegionalPromptingForUnsupportedModel(selectedModelId);

    this.generationRequest.guidance_scale = this.getDefaultCfgForModel(selectedModelId);

    // Update credit cost for new model
    this.updateCreditCost();

    this.sharedService.setGenerationRequest(this.generationRequest);

    // Persist immediately
    this.saveSettings();
  }

  // Queue type and credit cost methods
  updateCreditCost() {
    const modelSetting = this.getModelSetting(this.generationRequest.model);
    const baseCost = Number(modelSetting?.credit_cost ?? 0);
    const loraCount = Array.isArray(this.generationRequest?.loras) ? this.generationRequest.loras.length : 0;
    const perLoraCost = Number(modelSetting?.lora_credit_cost ?? 0);
    const loraTotalCost = loraCount * perLoraCost;
    this.creditCost = baseCost + loraTotalCost;
    // LoRAs have 3x cost for upscale and 4x cost for enhanced generation
    this.upscaleCreditCost = (baseCost * 3) + (loraTotalCost * 3);
    this.hiresCreditCost = (baseCost * 4) + (loraTotalCost * 4);
    this.enforceHiresConstraints();
  }

  getUpscaleTooltip(): string {
    const modelType = this.getModelType(this.generationRequest.model);
    const cost = this.upscaleCreditCost;
    if (!this.authService.isLoggedIn()) {
      return `Upscale the image by 1.5×. Costs ${cost} credits (3× ${modelType}). Login required.`;
    }
    if (this.userCredits < cost) {
      return `Upscale the image by 1.5×. Costs ${cost} credits (3× ${modelType}). You have ${this.userCredits} credits.`;
    }
    return `Upscale the image by 1.5×. Costs ${cost} credits (3× ${modelType}).`;
  }

  getHiresTooltip(): string {
    const modelType = this.getModelType(this.generationRequest.model);
    const cost = this.hiresCreditCost;
    if (!this.authService.isLoggedIn()) {
      return `Generate + Upscale in one step. Costs ${cost} credits (4× ${modelType}). Login required.`;
    }
    if (this.userCredits < cost) {
      return `Generate + Upscale in one step. Costs ${cost} credits (4× ${modelType}). You have ${this.userCredits} credits.`;
    }
    return `Generate + Upscale in one step for the highest quality generations. Costs ${cost} credits (Select priority queue to use).`;
  }

  get hiresEligible(): boolean {
    return this.hiresEnabled && this.isHiresAvailable();
  }

  private isHiresAvailable(): boolean {
    return (
      !this.referenceImage &&
      this.generationRequest?.job_type === 'txt2img'
    );
  }

  private restoreQueueTypeAfterHires() {
    // If the user isn't logged in, they can't be in priority anyway.
    if (!this.authService.isLoggedIn()) {
      this.queueType = 'free';
      return;
    }

    // Restore what they had before enabling Hi-Res, but fall back safely.
    const restored = this.queueTypeBeforeHires || 'free';
    if (restored === 'priority' && this.userCredits < this.creditCost) {
      this.queueType = 'free';
      return;
    }
    this.queueType = restored;
  }

  private enforceHiresConstraints() {
    if (!this.hiresEnabled) return;
    const wasEnabled = this.hiresEnabled;

    if (!this.authService.isLoggedIn()) {
      this.hiresEnabled = false;
      this.restoreQueueTypeAfterHires();
      if (wasEnabled) localStorage.removeItem("hires-enabled");
    }
  }

  onHiresToggleChange(enabled: boolean) {
    if (enabled) {
      if (!this.isHiresAvailable()) {
        this.hiresEnabled = false;
        this.saveSettings();
        return;
      }

      if (!this.authService.isLoggedIn()) {
        this.requestLoginCta('hires', this.hiresCreditCost);
        this.hiresEnabled = false;
        this.saveSettings();
        return;
      }

      if (this.userCredits < this.hiresCreditCost) {
        this.requestCreditPurchaseCta('hires', this.hiresCreditCost);
        this.hiresEnabled = false;
        this.saveSettings();
        return;
      }

      this.queueTypeBeforeHires = this.queueType;
      this.queueType = 'priority';
      this.saveSettings();
      return;
    }

    // Disabled
    this.restoreQueueTypeAfterHires();
    this.saveSettings();
  }

  onQueueTypeChange(type: 'free' | 'priority') {
    this.queueType = type;
    if (this.hiresEnabled) {
      this.queueTypeBeforeHires = type;
    }
    
    // If switching to priority without enough credits, show warning
    if (type === 'priority' && !this.authService.isLoggedIn()) {
      this.requestLoginCta('priority', this.hiresEligible ? this.hiresCreditCost : this.creditCost);
      this.queueType = 'free';
      return;
    }
    
    const requiredCredits = this.hiresEligible ? this.hiresCreditCost : this.creditCost;
    if (type === 'priority' && this.userCredits < requiredCredits) {
      this.requestCreditPurchaseCta(this.hiresEligible ? 'hires' : 'priority', requiredCredits);
      this.queueType = 'free';
    }
  }

  canUsePriorityQueue(): boolean {
    const requiredCredits = this.hiresEligible ? this.hiresCreditCost : this.creditCost;
    return this.authService.isLoggedIn() && this.userCredits >= requiredCredits;
  }

  getQueueTypeLabel(): string {
    if (this.queueType === 'priority') {
      const cost = this.hiresEligible ? this.hiresCreditCost : this.creditCost;
      return `Priority (${cost} credits)`;
    }
    return 'Free Queue';
  }

  changeAspectRatioSelector(event: any) {
    let selectElement = event.target as HTMLSelectElement;
    this.changeAspectRatio(selectElement.value);
  }

  changeAspectRatio(aspectRatio: string) {
    if (aspectRatio == 'square') {
      this.aspectRatio = { width: 512, height: 512, model: this.generationRequest.model, aspectRatio: "square" };
      this.generationRequest.width = 512;
      this.generationRequest.height = 512;
    }
    else if (aspectRatio == 'portrait') {
      this.aspectRatio = { width: 512, height: 768, model: this.generationRequest.model, aspectRatio: "portrait" };
      this.generationRequest.width = 512;
      this.generationRequest.height = 768;
    }
    else if (aspectRatio == 'landscape') {
      this.aspectRatio = { width: 768, height: 512, model: this.generationRequest.model, aspectRatio: "landscape" };
      this.generationRequest.width = 768;
      this.generationRequest.height = 512;
    }

    // Emit the aspectRatio object itself.
    this.aspectRatioChange.emit(this.aspectRatio);

    // Remove inpainting and strength elements
    this.showInpainting = false;
    this.showStrength = false;
    this.inpaintingChange.emit(this.showInpainting);

    // Clear the images array
    this.images = [];
    this.imagesChange.emit(this.images);

    this.sharedService.setGenerationRequest(this.generationRequest);

    // Persist immediately
    // this.saveSettings();
  }

  // Update the prompt to the shared service
  updateSharedPrompt() {
    this.sharedService.setPrompt(this.generationRequest.prompt);
  }

  onPromptInputChange(promptValue?: string) {
    const prompt = String(promptValue ?? this.generationRequest.prompt ?? '');
    this.generationRequest.prompt = prompt;
    this.applyDynamicPromptState(prompt);
    this.queueDynamicPromptLibraryRefreshIfNeeded(prompt);
    this.updateSharedPrompt();
    this.saveSettings();
  }

  private applyDynamicPromptState(prompt: string) {
    if (this.hasDynamicPromptSyntax(prompt)) {
      this.generationRequest.dynamic_prompting = {
        ...this.normalizeDynamicPromptingConfig(this.generationRequest.dynamic_prompting),
        enabled: true,
        template: prompt,
      };
    } else if (this.generationRequest.dynamic_prompting?.enabled || this.generationRequest.dynamic_prompting?.template) {
      this.generationRequest.dynamic_prompting = this.createDisabledDynamicPromptingConfig(prompt);
    }
  }

  isDynamicPromptActive(): boolean {
    return this.hasDynamicPromptSyntax(this.generationRequest.prompt);
  }

  getDynamicPromptHighlightHtml(): string {
    return this.highlightDynamicPromptSyntax(String(this.generationRequest.prompt || ''));
  }

  onDynamicPromptApplied(event: DynamicPromptApplyEvent) {
    this.generationRequest.prompt = event.prompt;
    this.generationRequest.dynamic_prompting = this.normalizeDynamicPromptingConfig(event.dynamicPrompting);
    this.updateSharedPrompt();
    this.saveSettings();

    this.messageService.add({
      severity: event.source === 'template' ? 'info' : 'success',
      summary: event.source === 'template' ? 'Dynamic prompt ready' : 'Prompt inserted',
      detail: event.source === 'template'
        ? 'This template will expand when you generate.'
        : 'The selected preview is now in the prompt box.',
      life: 3000,
    });
  }

  onDarkInputFieldsChange(enabled: boolean) {
    this.darkInputFields = !!enabled;
    this.applyInputStyleToBody(this.darkInputFields);
    this.saveSettings();
  }

  // Save session storage info of changed settings
  saveSettings() {
    if (!this.settingsHydrated) return;

    // Save prompt
    localStorage.setItem("prompt-input", this.generationRequest.prompt);

    // Save negative prompt
    localStorage.setItem("negative-prompt-input", this.generationRequest.negative_prompt);

    // Save denoise strength
    if (this.generationRequest.strength != undefined) {
      localStorage.setItem("custom-denoise", this.generationRequest.strength.toString());
    }

    // Save seed
    if (this.generationRequest.seed == undefined) {
      localStorage.removeItem("seed-input");
    }
    else if (this.generationRequest.seed != undefined) {
      localStorage.setItem("seed-input", this.generationRequest.seed.toString());
    }

    // Save cfg
    if (this.generationRequest.steps != undefined) {
      localStorage.setItem("cfg", this.generationRequest.guidance_scale.toString());
    }

    // Save aspect ratio
    localStorage.setItem("aspect-ratio", this.aspectRatio.aspectRatio);

    // Save fast pass code
    if (this.generationRequest.fast_pass_code == undefined || this.generationRequest.fast_pass_code.trim() == "") {
      this.generationRequest.fast_pass_code = undefined;
      localStorage.removeItem("fast-pass-code");
    }
    else if (this.generationRequest.fast_pass_code != undefined && this.generationRequest.fast_pass_code.trim() != "") {
      // Convert fast_pass_code to lowercase and remove whitespace
      this.generationRequest.fast_pass_code = this.generationRequest.fast_pass_code.toLowerCase().replace(/\s/g, '');
      localStorage.setItem("fast-pass-code", this.generationRequest.fast_pass_code);
    }

    // Save if lossy images are enabled
    localStorage.setItem("lossy-images", this.generationRequest.lossy_images.toString());

    // Save model
    localStorage.setItem("model", this.generationRequest.model);

    // Save site theme
    this.panelTheme = this.normalizePanelTheme(this.panelTheme);
    localStorage.setItem("panel-theme", this.panelTheme);
    this.applyThemeToBody(this.panelTheme);
    localStorage.setItem("dark-input-fields", this.darkInputFields.toString());
    this.applyInputStyleToBody(this.darkInputFields);

    // Save notifications toggle
    localStorage.setItem("notifications-enabled", this.enableNotifications.toString());

    if (this.generationRequest.dynamic_prompting?.enabled) {
      localStorage.setItem("dynamic-prompting", JSON.stringify(this.generationRequest.dynamic_prompting));
    } else {
      localStorage.removeItem("dynamic-prompting");
    }

    // Save hi-res toggle (only when logged in)
    if (this.hiresEnabled && this.authService.isLoggedIn()) {
      localStorage.setItem("hires-enabled", "true");
    } else {
      localStorage.removeItem("hires-enabled");
    }
  }

  // Load session storage info of changed settings
  async loadSettings() {
    this.migrateStoredDynamicPromptCategorySyntax();

    // Load other settings as before
    if (localStorage.getItem("prompt-input") != null) {
      this.generationRequest.prompt = localStorage.getItem("prompt-input")!;
    }
    if (localStorage.getItem("negative-prompt-input") != null) {
      this.generationRequest.negative_prompt = localStorage.getItem("negative-prompt-input")!;
    }
    if (localStorage.getItem("custom-denoise") != null) {
      this.generationRequest.strength = parseFloat(localStorage.getItem("custom-denoise")!);
    }
    if (localStorage.getItem("seed-input") != null) {
      this.generationRequest.seed = parseInt(localStorage.getItem("seed-input")!);
    }
    if (localStorage.getItem("cfg") != null) {
      this.generationRequest.guidance_scale = this.normalizeCfgValue(localStorage.getItem("cfg"), this.getDefaultCfgForModel(this.generationRequest.model));
    }
    if (localStorage.getItem("aspect-ratio") != null) {
      this.changeAspectRatio(localStorage.getItem("aspect-ratio")!);
    }
    if (localStorage.getItem("fast-pass-code") != null) {
      this.generationRequest.fast_pass_code = localStorage.getItem("fast-pass-code")!;
    }
    if (localStorage.getItem("model") != null) {
      this.generationRequest.model = localStorage.getItem("model")!;
    }
    if (localStorage.getItem("panel-theme") != null) {
      this.panelTheme = this.normalizePanelTheme(localStorage.getItem("panel-theme"));
    } else {
      this.panelTheme = 'sonic';
    }
    this.darkInputFields = localStorage.getItem("dark-input-fields") == 'true';
    this.applyThemeToBody(this.panelTheme);
    this.applyInputStyleToBody(this.darkInputFields);

    // Ensure model is valid before downstream logic uses it.
    this.ensureValidModelSelected(false);
    if (localStorage.getItem("lossy-images") != null) {
      console.log("Loading lossy images setting");
      console.log("Value from localStorage:", localStorage.getItem("lossy-images"));
      this.generationRequest.lossy_images = localStorage.getItem("lossy-images") == 'true';
      console.log("Loaded lossy images setting:", this.generationRequest.lossy_images);
    } else {
      // Default for new users: WebP images enabled
      this.generationRequest.lossy_images = true;
    }
    if (localStorage.getItem("notifications-enabled") != null) {
      this.enableNotifications = localStorage.getItem("notifications-enabled") == 'true';
      if (this.enableNotifications) {
        // Restore userId and resubscribe
        const storedId = localStorage.getItem('notifications-user-id');
        if (storedId) this.notificationService.userId = storedId;
        this.enableNotification();
      }
    }
    if (localStorage.getItem("dynamic-prompting") != null) {
      try {
        this.generationRequest.dynamic_prompting = this.normalizeDynamicPromptingConfig(
          JSON.parse(localStorage.getItem("dynamic-prompting")!)
        );
      } catch {
        this.generationRequest.dynamic_prompting = this.createDisabledDynamicPromptingConfig();
        localStorage.removeItem("dynamic-prompting");
      }
    } else {
      this.generationRequest.dynamic_prompting = this.createDisabledDynamicPromptingConfig();
    }
    if (localStorage.getItem("hires-enabled") != null) {
      this.hiresEnabled = localStorage.getItem("hires-enabled") == 'true';
    }

    this.updateCreditCost();
    this.settingsHydrated = true;
  }

  // Reset session storage info of changed settings and reset view
  resetSessionStorage() {
    // Confirm before clearing saved options
    if (!confirm('Are you sure you want to reset all saved options? This will clear your saved preferences.')) {
      return;
    }
    localStorage.removeItem("prompt-input");
    localStorage.removeItem("negative-prompt-input");
    localStorage.removeItem("custom-denoise");
    localStorage.removeItem("seed-input");
    localStorage.removeItem("cfg");
    localStorage.removeItem("aspect-ratio");
    localStorage.removeItem("fast-pass-code");
    localStorage.removeItem("panel-theme");
    localStorage.removeItem("dark-input-fields");
    localStorage.removeItem('showNSFWLoras');
    localStorage.removeItem('mobians:lora-sort');
    localStorage.removeItem('mobians:lora-favorites-only');
    localStorage.removeItem('lossy-images');
    localStorage.removeItem('notifications-enabled');
    localStorage.removeItem('notifications-user-id');
    localStorage.removeItem('hires-enabled');
    localStorage.removeItem('dynamic-prompting');
    this.generationRequest.prompt = "";
    this.generationRequest.negative_prompt = this.defaultNegativePrompt;
    this.generationRequest.strength = 0.8;
    this.generationRequest.seed = undefined;
    this.generationRequest.model = this.getDefaultModelId();
    this.generationRequest.guidance_scale = this.getDefaultCfgForModel(this.generationRequest.model);
    this.panelTheme = 'sonic';
    this.darkInputFields = false;
    this.applyThemeToBody(this.panelTheme);
    this.applyInputStyleToBody(this.darkInputFields);
    // Default after reset: WebP images enabled
    this.generationRequest.lossy_images = true;
    this.generationRequest.regional_prompting = { enabled: false, regions: [] };
    this.generationRequest.dynamic_prompting = this.createDisabledDynamicPromptingConfig();
    this.enableNotifications = false;
    this.hiresEnabled = false;
    this.changeAspectRatio("portrait");
    this.loraResetToken += 1;

    this.loadSettings();

    // reset images
    this.imagesChange.emit([]);
  }

  private snapshotLoras(loras?: any[]): any[] {
    if (!Array.isArray(loras) || loras.length === 0) {
      return [];
    }
    return loras.map((lora) => ({
      ...lora,
      strength: typeof lora?.strength === 'number' ? lora.strength : 1.0,
    }));
  }

  private sanitizeRegionalPrompting(
    input: any,
    modelId: unknown = this.generationRequest?.model
  ): { enabled: boolean; regions: RegionalPromptRegion[] } {
    const empty = { enabled: false, regions: [] as RegionalPromptRegion[] };
    if (!input || typeof input !== "object") return empty;
    if (!this.supportsRegionalPrompting(modelId)) return empty;

    const regions: RegionalPromptRegion[] = (Array.isArray(input.regions) ? input.regions : [])
      .map((region: any) => ({
        id: String(region?.id ?? `${Date.now()}-${Math.floor(Math.random() * 1000)}`),
        prompt: String(region?.prompt ?? "").trim(),
        negative_prompt: String(region?.negative_prompt ?? "").trim(),
        x: Math.min(1, Math.max(0, Number(region?.x ?? 0))),
        y: Math.min(1, Math.max(0, Number(region?.y ?? 0))),
        width: Math.min(1, Math.max(0.05, Number(region?.width ?? 0.25))),
        height: Math.min(1, Math.max(0.05, Number(region?.height ?? 0.25))),
        denoise_strength: Math.min(1, Math.max(0, Number(region?.denoise_strength ?? 1))),
        feather: Math.min(96, Math.max(0, Math.round(Number(region?.feather ?? 32)))),
        opacity: Math.min(1, Math.max(0, Number(region?.opacity ?? 1))),
        inherit_base_prompt: region?.inherit_base_prompt === true,
      }))
      .filter((region: RegionalPromptRegion) => region.prompt.length > 0)
      .map((region: RegionalPromptRegion) => {
        if (region.x + region.width > 1) {
          region.x = Math.max(0, 1 - region.width);
        }
        if (region.y + region.height > 1) {
          region.y = Math.max(0, 1 - region.height);
        }
        return region;
      });

    return {
      enabled: !!input.enabled && regions.length > 0,
      regions,
    };
  }

  private createDisabledDynamicPromptingConfig(template?: string): DynamicPromptingConfig {
    return {
      enabled: false,
      template,
    };
  }

  private normalizeDynamicPromptingConfig(input: unknown): DynamicPromptingConfig {
    if (!input || typeof input !== 'object') {
      return this.createDisabledDynamicPromptingConfig();
    }

    const config = input as Partial<DynamicPromptingConfig>;
    const normalized: DynamicPromptingConfig = {
      enabled: config.enabled === true,
      template: typeof config.template === 'string' ? config.template : undefined,
      expansion_seed: this.optionalInteger(config.expansion_seed),
      selected_preview_index: this.clampInteger(config.selected_preview_index, 0, 11, 0),
    };

    if (config.mode === 'random' || config.mode === 'combinatorial') {
      normalized.mode = config.mode;
    }
    if (typeof config.wildcard_set === 'string') {
      normalized.wildcard_set = config.wildcard_set;
    }
    if (config.preview_count !== undefined) {
      normalized.preview_count = this.clampInteger(config.preview_count, 1, 12, 4);
    }
    if (config.max_generations !== undefined) {
      normalized.max_generations = this.clampInteger(config.max_generations, 1, 100, 32);
    }

    if (!normalized.enabled) {
      normalized.template = config.template;
    }
    return normalized;
  }

  private getDynamicPromptingForRequest(): DynamicPromptingConfig {
    const config = this.normalizeDynamicPromptingConfig(this.generationRequest.dynamic_prompting);
    const prompt = String(this.generationRequest.prompt || '').trim();
    if (!prompt || !this.hasDynamicPromptSyntax(prompt)) {
      return { ...config, enabled: false, template: prompt || config.template };
    }

    return {
      ...config,
      enabled: true,
      template: prompt,
      expansion_seed: config.expansion_seed ?? this.generationRequest.seed,
    };
  }

  private hasDynamicPromptSyntax(value: string | undefined): boolean {
    const prompt = String(value || '');
    return this.hasDynamicPromptVariantSyntax(prompt)
      || this.dynamicPromptLibraryState.hasKnownWildcardToken(prompt)
      || this.hasDynamicPromptTemplateToken(prompt);
  }

  private highlightDynamicPromptSyntax(value: string): string {
    const dynamicSyntaxPattern = /(__([-\w/]+)__|(?<!_)_([A-Za-z0-9](?:[-\w/]*[A-Za-z0-9])?)_(?!_)|\{[^{}]*\|[^{}]*\})/g;
    let highlighted = '';
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = dynamicSyntaxPattern.exec(value)) !== null) {
      highlighted += this.escapeHtml(value.slice(cursor, match.index));
      if (this.shouldHighlightDynamicPromptMatch(match)) {
        highlighted += `<span class="dynamic-prompt-token">${this.escapeHtml(match[0])}</span>`;
      } else {
        highlighted += this.escapeHtml(match[0]);
      }
      cursor = match.index + match[0].length;
    }

    highlighted += this.escapeHtml(value.slice(cursor));
    return highlighted || '&nbsp;';
  }

  private hasDynamicPromptVariantSyntax(value: string): boolean {
    return /\{[^{}]*\|[^{}]*\}/.test(value);
  }

  private hasDynamicPromptTemplateToken(value: string): boolean {
    return /__([-\w/]+)__/.test(value);
  }

  private shouldHighlightDynamicPromptMatch(match: RegExpExecArray): boolean {
    const templateId = match[2];
    if (templateId) return true;
    const wildcardId = match[3];
    return wildcardId ? this.dynamicPromptLibraryState.isKnownWildcardId(wildcardId) : true;
  }

  private queueDynamicPromptLibraryRefreshIfNeeded(prompt: string): void {
    if (!this.dynamicPromptLibraryState.loaded()) return;
    if (!this.dynamicPromptLibraryState.hasUnknownWildcardToken(prompt)) return;
    if (this.dynamicPromptLibraryRefreshTimer) return;

    this.dynamicPromptLibraryRefreshTimer = setTimeout(() => {
      this.dynamicPromptLibraryRefreshTimer = undefined;
      this.dynamicPromptLibraryState.refresh().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => this.applyDynamicPromptState(this.generationRequest.prompt),
        error: () => {},
      });
    }, this.dynamicPromptLibraryRefreshDelayMs);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private migrateStoredDynamicPromptCategorySyntax(): void {
    if (localStorage.getItem(this.dynamicPromptCategorySyntaxMigrationKey) === 'done') return;

    const migrateText = (value: string | null): string | null => {
      if (value == null) return value;
      return value.replace(/__([-\w/]+)__/g, '_$1_');
    };

    const storedPrompt = localStorage.getItem('prompt-input');
    if (storedPrompt != null) {
      localStorage.setItem('prompt-input', migrateText(storedPrompt) || '');
    }

    const storedDynamicPrompting = localStorage.getItem('dynamic-prompting');
    if (storedDynamicPrompting != null) {
      try {
        const parsed = JSON.parse(storedDynamicPrompting);
        if (parsed && typeof parsed.template === 'string') {
          parsed.template = migrateText(parsed.template);
          localStorage.setItem('dynamic-prompting', JSON.stringify(parsed));
        }
      } catch {
        localStorage.removeItem('dynamic-prompting');
      }
    }

    localStorage.setItem(this.dynamicPromptCategorySyntaxMigrationKey, 'done');
  }

  private clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
  }

  private optionalInteger(value: unknown): number | undefined {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    return Math.round(numeric);
  }

  private shortenText(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
  }

  private getHistoryPromptSnapshot(): string {
    const pending = this.getPendingJob();
    if (typeof pending?.request?.prompt === 'string' && pending.request.prompt.trim()) {
      return pending.request.prompt;
    }
    return String(this.generationRequest.prompt || '');
  }

  private getHistoryPromptTemplateSnapshot(): string | undefined {
    const pending = this.getPendingJob();
    const template = pending?.request?.promptTemplate;
    return typeof template === 'string' && template.trim() ? template : undefined;
  }

  private getPromptSummary(prompt: string): string {
    return prompt.length > 50 ? `${prompt.slice(0, 50)}...` : prompt;
  }

  private getHistoryLorasSnapshot(): any[] {
    const pending = this.getPendingJob();
    if (Array.isArray(pending?.request?.loras)) {
      return this.snapshotLoras(pending.request.loras);
    }
    if (Array.isArray(this.generationRequest?.loras)) {
      return this.snapshotLoras(this.generationRequest.loras);
    }
    return [];
  }

  private getHistoryRegionalPromptingSnapshot(): RegionalPromptingConfig {
    const pending = this.getPendingJob();
    if (pending?.request?.regional_prompting) {
      return this.sanitizeRegionalPrompting(pending.request.regional_prompting, pending.request.model);
    }
    return this.sanitizeRegionalPrompting(this.generationRequest?.regional_prompting, this.generationRequest?.model);
  }

  // Send job to django api and retrieve job id.
  async submitJob(mode: 'generate' | 'upscale' | 'hires' = 'generate') {
    const effectiveMode: 'generate' | 'upscale' | 'hires' = (
      mode === 'generate'
      && this.hiresEligible
      && this.queueType === 'priority'
      && this.authService.isLoggedIn()
        ? 'hires'
        : mode
    );

    const isUpscaleJob = effectiveMode === 'upscale';
    const isHiresJob = effectiveMode === 'hires';
    const queueTypeForRequest: 'free' | 'priority' = (isUpscaleJob || isHiresJob) ? 'priority' : this.queueType;
    const creditCostForRequest = isUpscaleJob ? this.upscaleCreditCost : (isHiresJob ? this.hiresCreditCost : this.creditCost);
    const jobTypeForRequest = isUpscaleJob ? 'upscale' : (isHiresJob ? 'txt2img_upscale' : this.generationRequest.job_type);
    this.lastSubmittedCreditCost = creditCostForRequest;
    this.lastSubmittedMode = isUpscaleJob ? 'upscale' : (isHiresJob ? 'hires' : (queueTypeForRequest === 'priority' ? 'priority' : 'generate'));

    // Validate priority queue requirements
    if (queueTypeForRequest === 'priority') {
      if (!this.authService.isLoggedIn()) {
        this.requestLoginCta(isUpscaleJob ? 'upscale' : (isHiresJob ? 'hires' : 'priority'), creditCostForRequest);
        return;
      }
      if (this.userCredits < creditCostForRequest) {
        this.requestCreditPurchaseCta(isUpscaleJob ? 'upscale' : (isHiresJob ? 'hires' : 'priority'), creditCostForRequest);
        return;
      }
    }

    // Prevent multi-tab concurrency
    if (this.lockService.isLockedByOther()) {
      this.messageService.add({ severity: 'warn', summary: 'Generation running', detail: 'Another tab is generating. Please wait or close other tabs.' });
      return;
    }
    if (!this.lockService.tryAcquire()) {
      this.messageService.add({ severity: 'warn', summary: 'Please wait', detail: 'A generation is already in progress.' });
      return;
    }

    // Disable generation button
    this.enableGenerationButton = false;

    // Hide canvas if it exists
    this.showInpaintingCanvas = false;

    // Ensure client id is attached for server-side dedupe if supported
    this.generationRequest.client_id = this.notificationService.userId;
    
    // Save settings to session storage
    this.saveSettings();
    this.inpaintingChange.emit(this.showInpaintingCanvas);

    // Change seed to random number if default seed is selected
    let defaultSeed: boolean;
    if (this.generationRequest.seed == undefined || this.generationRequest.seed == -1) {
      defaultSeed = true;
      this.generationRequest.seed = Math.floor(Math.random() * 100000000);
    }
    else {
      defaultSeed = false;
    }
    this.currentSeed = this.generationRequest.seed;

    const dynamicPromptingForRequest = this.getDynamicPromptingForRequest();

    // set reference image if there is one
    if (this.referenceImage && (this.generationRequest.image == undefined || this.generationRequest.image == "")) {
      // Convert blob to base64 if blob exists
      if (this.referenceImage.blob) {
        this.generationRequest.image = await this.blobMigrationService.blobToBase64(this.referenceImage.blob);
      } else {
        // No blob available - clear the reference image state to prevent sending img2img without image
        console.warn('Reference image has no blob data, falling back to txt2img');
        this.referenceImage = undefined;
        this.generationRequest.job_type = "txt2img";
        this.generationRequest.image = undefined;
      }
    }

    // Clear color_inpaint if there's no mask - prevents backend crash when
    // filter_image tries to process a null mask with color_inpaint=true
    if (this.generationRequest.color_inpaint && !this.generationRequest.mask_image) {
      this.generationRequest.color_inpaint = undefined;
    }

    // CRITICAL: Validate that img2img/inpainting jobs have image data before sending
    // This prevents the bug where job_type is img2img but no image is attached
    if ((this.generationRequest.job_type === 'img2img' || this.generationRequest.job_type === 'inpainting') 
        && !this.generationRequest.image) {
      console.error('BUG PREVENTED: Attempted to send img2img/inpainting without image data. Resetting to txt2img.');
      this.generationRequest.job_type = "txt2img";
      this.referenceImage = undefined;
      this.sharedService.setReferenceImage(null);
      this.messageService.add({
        severity: 'warn',
        summary: 'Reference image lost',
        detail: 'The reference image data was lost. Generating as text-to-image instead. Please re-add your reference image if needed.',
        life: 6000
      });
    }

    const requestToSend = {
      ...this.generationRequest,
      job_type: jobTypeForRequest,
      queue_type: queueTypeForRequest,
      regional_prompting: this.sanitizeRegionalPrompting(this.generationRequest.regional_prompting, this.generationRequest.model),
      dynamic_prompting: dynamicPromptingForRequest,
    };

    this.sharedService.setGenerationRequest(this.generationRequest);

    // set loading to true and submit job
    this.loadingChange.emit(true);
    this.hasPendingJob = true;
    this.stableDiffusionService.submitJob(requestToSend)
      .subscribe(
        response => {
          // Update credits if priority queue was used
          if (response.credits_remaining !== undefined) {
            this.authService.updateCredits(response.credits_remaining);
            const creditsUsed = response.credits_used ?? 0;
            const creditsToast = this.aprilFools.isAprilFools()
              ? this.aprilFools.getCreditsUsedToast(creditsUsed, response.credits_remaining)
              : { summary: 'Credits Used', detail: `${creditsUsed} credits used. Remaining: ${response.credits_remaining}` };
            this.messageService.add({
              severity: 'info',
              summary: creditsToast.summary,
              detail: creditsToast.detail,
              life: 3000
            });
          }

          // Persist pending job so we can resume after refresh
          this.savePendingJob(response.job_id, {
            prompt: response.expanded_prompt || requestToSend.prompt,
            promptTemplate: response.prompt_template,
            width: requestToSend.width,
            height: requestToSend.height,
            job_type: requestToSend.job_type,
            model: requestToSend.model,
            client_id: requestToSend.client_id,
            queue_type: requestToSend.queue_type,
            loras: this.snapshotLoras(requestToSend.loras),
            regional_prompting: this.sanitizeRegionalPrompting(requestToSend.regional_prompting, requestToSend.model),
            dynamic_prompting: requestToSend.dynamic_prompting,
          });

          this.getJob(response.job_id);
        },
        error => {
          console.error(error);  // handle error
          this.showError(error);  // show the error modal
          this.imagesChange.emit(this.images);
          this.loadingChange.emit(false);
          this.enableGenerationButton = true;
          this.hasPendingJob = false;
          this.jobID = "";
          this.cancelInProgress = false;
          this.queuePositionChange.emit(0);
          this.queueStatusMessageChange.emit(undefined);
          this.etaChange.emit(undefined);
          this.removePendingJob();
          this.generationRequest.mask_image = undefined;
          this.lockService.release();
        }
      );

    // reset seed to default if it was changed
    if (defaultSeed) {
      this.generationRequest.seed = undefined;
    }
  }

  // Action to cancel a pending/running job
  cancelPendingJob() {
    const id = this.jobID || this.getPendingJob()?.job_id;
    if (!id) {
      // Self-heal any stale pending UI state when no cancellable job exists.
      this.aprilFools.discardRingGameProgress();
      this.hasPendingJob = false;
      this.cancelInProgress = false;
      this.enableGenerationButton = true;
      this.loadingChange.emit(false);
      this.queuePositionChange.emit(0);
      this.queueStatusMessageChange.emit(undefined);
      this.etaChange.emit(undefined);
      this.removePendingJob();
      this.lockService.release();
      return;
    }
    this.cancelInProgress = true;
    this.enableGenerationButton = false;
    this.stableDiffusionService.cancelJob(id).subscribe({
      next: (response: any) => {
        this.aprilFools.discardRingGameProgress();
        // Stop polling if active
        this.jobPollSub?.unsubscribe();
        this.jobPollSub = undefined;

        this.hasPendingJob = false;
        this.jobID = "";
        this.removePendingJob?.();
        this.enableGenerationButton = true;
        this.loadingChange.emit(false);
        this.queuePositionChange.emit(0);
        this.queueStatusMessageChange.emit(undefined);
        this.etaChange.emit(undefined);
        // Release generation lock on cancel
        this.lockService.release();
        
        // If credits were refunded, update the user's credit balance
        if (response?.credits_refunded && response.credits_refunded > 0) {
          this.userCredits += response.credits_refunded;
          this.authService.updateCredits(this.userCredits);
          const cancelToast = this.aprilFools.isAprilFools()
            ? this.aprilFools.getCancelledToast(response.credits_refunded)
            : { summary: 'Cancelled', detail: `Generation cancelled. ${response.credits_refunded} credits refunded.` };
          this.messageService.add?.({ severity: 'success', summary: cancelToast.summary, detail: cancelToast.detail });
        } else {
          const cancelToast = this.aprilFools.isAprilFools()
            ? this.aprilFools.getCancelledToast()
            : { summary: 'Cancelled', detail: 'Generation cancelled.' };
          this.messageService.add?.({ severity: 'success', summary: cancelToast.summary, detail: cancelToast.detail });
        }
        // Reset cancel flag after handling
        this.cancelInProgress = false;
      },
      error: (err) => {
        this.enableGenerationButton = true;
        this.cancelInProgress = false;
        this.queueStatusMessageChange.emit(undefined);
        this.messageService.add?.({ severity: 'error', summary: 'Cancel failed', detail: 'Unable to cancel job.' });
        console.error(err);
      }
    });
  }

  // check for status of job
  getJob(job_id: string) {
    // Set current job id for cancel button
    this.jobID = job_id;

    let jobComplete = false;
    let lastResponse: any;

    // Clear any previous reconnect banner for a new poll session
    this.queueStatusMessageChange.emit(undefined);

    const reconnectAttempts = 3;
    const reconnectTriesPerAttempt = 4;
    const reconnectDelayMs = 5000;
    const maxReconnectTries = reconnectAttempts * reconnectTriesPerAttempt;
    let lastReconnectAttemptShown: number | null = null;

    // Adaptive polling: slower interval on poor connections
    const pollingIntervalMs = this.getAdaptivePollingInterval();

    // Create an interval which fires at the adaptive rate
    let subscription: Subscription; // Declare a variable to hold the subscription
    subscription = interval(pollingIntervalMs)
      .pipe(
        // For each tick of the interval, call the lightweight status endpoint
        concatMap((): any => {
          if (!navigator.onLine) {
            // Emit a dummy "pending" shape to keep types consistent
            return of({ status: 'pending' } as any);
          }
          return this.stableDiffusionService.getJobStatus(job_id).pipe(
            timeout(30000), // 30s timeout for status polls
            retryWhen((errors: any) =>
              errors.pipe(
                // use the scan operator to track the number of attempts
                scan((failuresSoFar: number, err: any) => {
                  const nextFailureCount = failuresSoFar + 1;
                  const status = err?.status ?? err?.name;
                  const retryableStatusCodes = [0, 500, 502, 503, 504];
                  const isRetryable = status == null
                    || retryableStatusCodes.includes(status)
                    || err?.name === 'TimeoutError';

                  if (!isRetryable || nextFailureCount >= maxReconnectTries) {
                    this.queueStatusMessageChange.emit(undefined);
                    throw err;
                  }

                  const attempt = Math.min(
                    reconnectAttempts,
                    Math.floor((nextFailureCount - 1) / reconnectTriesPerAttempt) + 1
                  );

                  if (lastReconnectAttemptShown !== attempt) {
                    lastReconnectAttemptShown = attempt;
                    this.queueStatusMessageChange.emit(
                      `Lost connection to server, attempting to reconnect, attempt ${attempt} of ${reconnectAttempts}`
                    );
                  }

                  return nextFailureCount;
                }, 0),
                delayWhen(() => timer(reconnectDelayMs))
              )
            ),
            tap(() => {
              if (lastReconnectAttemptShown !== null) {
                lastReconnectAttemptShown = null;
                this.queueStatusMessageChange.emit(undefined);
              }
            })
          );
        }),
        // Store the response for use in finalize
        tap((response: any) => lastResponse = response),
        // Only continue the stream while the job is incomplete
        takeWhile((response: any) => !(jobComplete = (response && response.status === 'completed')), true),
        takeUntilDestroyed(this.destroyRef),
        // Once the stream completes, do any cleanup if necessary
        finalize(async () => {
          // If this finalize was triggered by a cancel, skip notifications and any error popups
          if (this.cancelInProgress) {
            return;
          }
          if (this.enableNotifications) {
            this.notificationService.playDing();
            this.notificationService.sendPushNotification();
          }
          if (jobComplete) {
            // Status polling detected completion — now download images individually
            await this.downloadJobImages(job_id);
          } else {
            // failed or not found
            this.hasPendingJob = false; // ensure UI switches back to Generate
            this.jobID = "";
            this.queuePositionChange.emit(0);
            this.etaChange.emit(undefined);
            this.removePendingJob();
            this.lockService.release();
          }
        })
      )
      .subscribe(
        (response: any) => {
          if (!response || response.status === undefined) {
            const error = { error: { detail: "Job not found. The server may have restarted. Please try again." } };
            console.error(error)
            this.showError(error);  // show the error modal
            this.enableGenerationButton = true;
            this.loadingChange.emit(false);
            this.hasPendingJob = false; // ensure UI switches back to Generate
            this.jobID = "";
            this.queuePositionChange.emit(0);
            this.queueStatusMessageChange.emit(undefined);
            this.etaChange.emit(undefined);
            this.queueType = 'free'; // Reset to free queue to prevent auth errors on retry
            this.removePendingJob();
            this.lockService.release();
            subscription.unsubscribe();
          } else if (response.status === 'failed' || response.status === 'error') {
            this.handleFailedJob(response);
            this.hasPendingJob = false; // ensure UI switches back to Generate
            this.jobID = "";
            this.queuePositionChange.emit(0);
            this.queueStatusMessageChange.emit(undefined);
            this.etaChange.emit(undefined);
            this.queueType = 'free'; // Reset to free queue to prevent auth errors on retry
            this.removePendingJob();
            this.lockService.release();
            subscription.unsubscribe();
          } else {
            // Persist queue position and ETA so other tabs / reloads can reflect state
            this.queuePositionChange.emit(response.queue_position ?? 0);
            this.etaChange.emit(response.eta ?? undefined);
            this.saveQueueEta(response.queue_position, response.eta);
          }
        },
        (error: any) => {
          // Suppress 404/409 if it resulted from a user-initiated cancel
          if (this.cancelInProgress && (error?.status === 404 || error?.status === 409)) {
            return;
          }
          console.error(error)
          this.showError(error);  // show the error modal
          this.enableGenerationButton = true;
          this.loadingChange.emit(false);
          this.hasPendingJob = false; // ensure UI switches back to Generate
          this.jobID = "";
          this.queuePositionChange.emit(0);
          this.queueStatusMessageChange.emit(undefined);
          this.etaChange.emit(undefined);
          this.queueType = 'free'; // Reset to free queue to prevent auth errors on retry
          this.removePendingJob();
          this.lockService.release();
        }
      );

    // Track active polling subscription so we can stop it on cancel
    this.jobPollSub = subscription;
  }

  /**
   * Download completed job images individually with extended retries for slow connections.
   * Falls back to the full /get_job/ endpoint if individual downloads fail.
   */
  private async downloadJobImages(job_id: string) {
    const imageCount = 4;
    const maxRetries = 10;
    const blobs: (Blob | null)[] = new Array(imageCount).fill(null);

    this.queueStatusMessageChange.emit('Downloading images...');

    // Download images sequentially (better for slow connections — no bandwidth competition)
    for (let i = 0; i < imageCount; i++) {
      this.queueStatusMessageChange.emit(`Downloading image ${i + 1} of ${imageCount}...`);

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (this.cancelInProgress) return;
        try {
          blobs[i] = await firstValueFrom(
            this.stableDiffusionService.getJobImage(job_id, i).pipe(
              timeout(120000) // 2 minute timeout per image
            )
          );
          break; // success — move to next image
        } catch (err: any) {
          const status = err?.status;
          const retryable = status == null || [0, 408, 500, 502, 503, 504].includes(status) || err?.name === 'TimeoutError';
          if (!retryable || attempt >= maxRetries - 1) {
            console.error(`Failed to download image ${i} after ${attempt + 1} attempts`, err);
            break; // give up on this image
          }
          // Exponential backoff: 3s, 6s, 12s, 24s, 30s (capped)
          const delay = Math.min(3000 * Math.pow(2, attempt), 30000);
          this.queueStatusMessageChange.emit(
            `Downloading image ${i + 1} of ${imageCount}... (retry ${attempt + 1} of ${maxRetries})`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.queueStatusMessageChange.emit(undefined);

    const successfulBlobs = blobs.filter((b): b is Blob => b !== null);

    if (successfulBlobs.length === 0) {
      // All individual downloads failed — fall back to full /get_job/ endpoint
      console.warn('All individual image downloads failed, falling back to /get_job/');
      await this.downloadJobImagesFallback(job_id);
      return;
    }

    // Build MobiansImage array from downloaded blobs
    const historyLoras = this.getHistoryLorasSnapshot();
    const historyRegionalPrompting = this.getHistoryRegionalPromptingSnapshot();
    const historyPrompt = this.getHistoryPromptSnapshot();
    const historyPromptTemplate = this.getHistoryPromptTemplateSnapshot();
    const historyPromptSummary = this.getPromptSummary(historyPrompt);

    const generatedImages: MobiansImage[] = [];
    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      if (!blob) continue;
      const blobUrl = URL.createObjectURL(blob);
      generatedImages.push({
        blob: blob,
        width: this.generationRequest.width,
        height: this.generationRequest.height,
        aspectRatio: this.aspectRatio.aspectRatio,
        UUID: uuidv4(),
        rated: false,
        timestamp: new Date(),
        prompt: historyPrompt,
        promptTemplate: historyPromptTemplate,
        loras: historyLoras,
        regional_prompting: historyRegionalPrompting,
        promptSummary: historyPromptSummary,
        url: blobUrl,
        model: this.generationRequest.model,
        seed: this.currentSeed,
        negativePrompt: this.generationRequest.negative_prompt,
        cfg: this.generationRequest.guidance_scale,
        tags: [],
        syncPriority: 0,
        lastModified: new Date()
      } as MobiansImage);
    }

    // Track created URLs for later revocation
    generatedImages.forEach((img: MobiansImage) => {
      if (img.url) this.blobUrls.push(img.url);
    });
    this.images = generatedImages;
    this.sharedService.disableInstructions();
    this.sharedService.setImages(this.images);

    // Dismiss loading UI immediately so users see their images
    this.loadingChange.emit(false);
    this.enableGenerationButton = true;
    this.hasPendingJob = false;
    this.jobID = "";
    this.queuePositionChange.emit(0);
    this.etaChange.emit(undefined);
    this.removePendingJob();
    this.lockService.release();

    // Convert to webp if image is png (non-blocking for UI)
    if (generatedImages[0]?.blob?.type === 'image/png') {
      for (let i = 0; i < generatedImages.length; i++) {
        if (!generatedImages[i].blob) continue;
        generatedImages[i].blob = await this.blobMigrationService.convertToWebP(generatedImages[i].blob!);
      }
    }
    await this.historyPanel?.ingestGeneratedImages(generatedImages);
  }

  /**
   * Fallback: download all images via the original /get_job/ endpoint (single large response).
   */
  private async downloadJobImagesFallback(job_id: string) {
    const maxRetries = 5;
    const getJobInfo = { job_id };

    this.queueStatusMessageChange.emit('Downloading images (fallback)...');

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (this.cancelInProgress) return;
      try {
        const response = await firstValueFrom(
          this.stableDiffusionService.getJob(getJobInfo).pipe(
            timeout(180000) // 3 minute timeout for full payload
          )
        );

        this.queueStatusMessageChange.emit(undefined);

        if (response?.status !== 'completed' || !response.result) {
          this.handleFailedJob(response);
          this.hasPendingJob = false;
          this.jobID = "";
          this.queuePositionChange.emit(0);
          this.etaChange.emit(undefined);
          this.removePendingJob();
          this.lockService.release();
          return;
        }

        const historyLoras = this.getHistoryLorasSnapshot();
        const historyRegionalPrompting = this.getHistoryRegionalPromptingSnapshot();
        const historyPrompt = response.prompt || this.getHistoryPromptSnapshot();
        const historyPromptTemplate = response.prompt_template || this.getHistoryPromptTemplateSnapshot();
        const historyPromptSummary = this.getPromptSummary(historyPrompt);
        const generatedImages = response.result.map((base64String: string) => {
          const blob = this.blobMigrationService.base64ToBlob(base64String);
          const blobUrl = URL.createObjectURL(blob);
          return {
            blob, width: this.generationRequest.width, height: this.generationRequest.height,
            aspectRatio: this.aspectRatio.aspectRatio, UUID: uuidv4(), rated: false, timestamp: new Date(),
            prompt: historyPrompt, promptTemplate: historyPromptTemplate, loras: historyLoras, regional_prompting: historyRegionalPrompting,
            promptSummary: historyPromptSummary, url: blobUrl,
            model: this.generationRequest.model, seed: this.currentSeed,
            negativePrompt: this.generationRequest.negative_prompt, cfg: this.generationRequest.guidance_scale,
            tags: [], syncPriority: 0, lastModified: new Date()
          } as MobiansImage;
        });
        generatedImages.forEach((img: MobiansImage) => {
          if (img.url) this.blobUrls.push(img.url);
        });
        this.images = generatedImages;
        this.sharedService.disableInstructions();
        this.sharedService.setImages(this.images);
        this.loadingChange.emit(false);
        this.enableGenerationButton = true;
        this.hasPendingJob = false;
        this.jobID = "";
        this.queuePositionChange.emit(0);
        this.etaChange.emit(undefined);
        this.removePendingJob();
        this.lockService.release();

        if (generatedImages[0]?.blob?.type === 'image/png') {
          for (let i = 0; i < generatedImages.length; i++) {
            if (!generatedImages[i].blob) continue;
            generatedImages[i].blob = await this.blobMigrationService.convertToWebP(generatedImages[i].blob!);
          }
        }
        await this.historyPanel?.ingestGeneratedImages(generatedImages);
        return; // success
      } catch (err: any) {
        const status = err?.status;
        const retryable = status == null || [0, 408, 500, 502, 503, 504].includes(status) || err?.name === 'TimeoutError';
        if (!retryable || attempt >= maxRetries - 1) {
          this.queueStatusMessageChange.emit(undefined);
          console.error('Fallback image download failed', err);
          this.showError(err);
          this.enableGenerationButton = true;
          this.loadingChange.emit(false);
          this.hasPendingJob = false;
          this.jobID = "";
          this.queuePositionChange.emit(0);
          this.etaChange.emit(undefined);
          this.removePendingJob();
          this.lockService.release();
          return;
        }
        const delay = Math.min(5000 * Math.pow(2, attempt), 30000);
        this.queueStatusMessageChange.emit(`Downloading images... (retry ${attempt + 1} of ${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Returns an adaptive polling interval in ms based on connection quality.
   * Uses the Network Information API where available; falls back to 1s.
   */
  private getAdaptivePollingInterval(): number {
    const conn = (navigator as any).connection;
    if (conn?.effectiveType) {
      switch (conn.effectiveType) {
        case 'slow-2g':
        case '2g':
          return 5000;
        case '3g':
          return 3000;
        default: // '4g' or better
          return 1000;
      }
    }
    return 1000; // default 1s
  }

  // Add this method to your class
  private handleFailedJob(response: any) {
    console.error('Job failed or encountered an error:', response);
    
    // Check if a refund was issued and show appropriate message
    if (response.refund) {
      this.messageService.add({
        severity: 'info',
        summary: 'Credits Refunded',
        detail: `${response.refund.credits_refunded} credits have been refunded to your account. New balance: ${response.refund.new_balance}`,
        life: 8000
      });
      // Update the user's credit balance
      this.authService.updateCredits(response.refund.new_balance);
    }
    
    this.showError({ error: { detail: `Job ${response.status}: ${response.message || 'Unknown error occurred'}` } });
    this.enableGenerationButton = true;
    this.loadingChange.emit(false);
    this.hasPendingJob = false; // ensure UI switches back to Generate
  }

  enableInpaintCanvas() {
    this.showInpaintingCanvas = !this.showInpaintingCanvas;
    this.inpaintingChange.emit(this.showInpaintingCanvas);
  }

  showError(error: any) {
    // Default error message
    let errorMessage = 'There was an error attempting to generate your image. Website is possibly down. Try out generating on CivitAi as an alternative. https://civitai.com/models/1493';

    // If the error comes from the backend and has a 'detail' field, use it as the error message
    if (error && error.error && error.error.detail) {
      errorMessage = this.normalizeErrorDetail(error.error.detail);
    }

    if (error?.status === 401) {
      this.requestLoginCta(
        this.lastSubmittedMode === 'upscale' || this.lastSubmittedMode === 'hires' ? this.lastSubmittedMode : 'priority',
        this.lastSubmittedCreditCost,
        errorMessage
      );
      return;
    }

    if (error?.status === 402) {
      this.requestCreditPurchaseCta(
        this.lastSubmittedMode,
        this.lastSubmittedCreditCost || (this.hiresEligible ? this.hiresCreditCost : this.creditCost),
        errorMessage,
        'backend-402'
      );
      return;
    }

    // Display the error toast
    const errToast = this.aprilFools.isAprilFools()
      ? this.aprilFools.getErrorToast(errorMessage)
      : { summary: 'Error Message', detail: errorMessage };
    this.messageService.add({
      severity: 'error',
      summary: errToast.summary,
      detail: errToast.detail,
      life: 10000
    });
  }

  private requestLoginCta(mode: 'priority' | 'upscale' | 'hires', requiredCredits: number, message?: string): void {
    this.accountCtaService.requestLogin({
      reason: mode,
      requiredCredits,
      message: message || this.getLoginCtaMessage(mode, requiredCredits)
    });
  }

  private requestCreditPurchaseCta(
    mode: 'priority' | 'upscale' | 'hires' | 'generate',
    requiredCredits: number,
    message?: string,
    reason: 'insufficient-credits' | 'backend-402' = 'insufficient-credits'
  ): void {
    this.accountCtaService.requestCreditPurchase({
      reason,
      requestedMode: mode,
      requiredCredits,
      currentCredits: this.userCredits,
      message: message || `You need ${requiredCredits} credits for this request, but you only have ${this.userCredits}.`
    });
  }

  private getLoginCtaMessage(mode: 'priority' | 'upscale' | 'hires', requiredCredits: number): string {
    if (mode === 'upscale') {
      return `Sign in to upscale images. Upscaling costs ${requiredCredits} credits because it uses longer generation time.`;
    }
    if (mode === 'hires') {
      return `Sign in to use Hi-Res generation. This request costs ${requiredCredits} credits.`;
    }
    return `Sign in to use the priority queue. This request costs ${requiredCredits} credits, and new accounts can claim free daily credits.`;
  }

  private normalizeErrorDetail(detail: unknown): string {
    if (typeof detail === 'string') {
      return detail;
    }
    if (detail && typeof detail === 'object' && 'detail' in detail) {
      const nestedDetail = (detail as { detail?: unknown }).detail;
      if (typeof nestedDetail === 'string') {
        return nestedDetail;
      }
    }
    return 'There was an error attempting to generate your image.';
  }

  removeReferenceImage() {
    this.referenceImage = undefined;
    this.generationRequest.image = undefined;
    this.generationRequest.mask_image = undefined;
    this.generationRequest.job_type = "txt2img";
    this.sharedService.setReferenceImage(null);
    this.sharedService.setGenerationRequest(this.generationRequest);

    // If there are no images to unexpand enable the instructions
    if (this.images.length == 0) {
      this.sharedService.enableInstructions();
    }
    else {

    }
  }

  enableNotification() {
    if (this.enableNotifications) {
      // Reuse existing userId or load from storage; generate if missing
      let userId = this.notificationService.userId || localStorage.getItem('notifications-user-id');
      if (!userId) {
        userId = uuidv4();
        localStorage.setItem('notifications-user-id', userId);
      }
      this.notificationService.userId = userId;
      this.notificationService.subscribeToNotifications();
    } else {
      // Fully unsubscribe: drop the browser's push subscription AND delete the
      // server-side row so the backend stops targeting this device.
      this.notificationService.unsubscribeFromNotifications();
    }
  }

  openImageModal() {
    this.imageModalOpen.emit(true);
  }

  toggleOptions() {
    const historyCollapse = document.getElementById('historyCollapse');
    if (historyCollapse) {
      historyCollapse.classList.remove('show');
    }

    const lorasCollapse = document.getElementById('lorasCollapse');
    if (lorasCollapse) {
      lorasCollapse.classList.remove('show');
    }
  }

  toggleHistory() {
    const optionsCollapse = document.getElementById('collapseExample');
    if (optionsCollapse) {
      optionsCollapse.classList.remove('show');
    }

    const lorasCollapse = document.getElementById('lorasCollapse');
    if (lorasCollapse) {
      lorasCollapse.classList.remove('show');
    }
  }

  toggleLoras() {
    const optionsCollapse = document.getElementById('collapseExample');
    if (optionsCollapse) {
      optionsCollapse.classList.remove('show');
    }

    const historyCollapse = document.getElementById('historyCollapse');
    if (historyCollapse) {
      historyCollapse.classList.remove('show');
    }
  }

  async deleteAllImages() {
    await this.historyPanel?.deleteAllImages();
  }

  async downloadAllImages() {
    if (this.downloadAllInProgress) return;
    this.downloadAllInProgress = true;
    try {
      await this.historyPanel?.downloadAllImages();
    } finally {
      this.downloadAllInProgress = false;
    }
  }

  // Example function after successful Discord login (no localStorage persistence)
  onDiscordLoginSuccess(userData: any) {
    // no-op or update any UI flags
  }

  onFastPassCodeChange(event: any) {
    this.generationRequest.fast_pass_code = event.target.value.toLowerCase().replace(/\s/g, '');
    // Persist immediately
    this.saveSettings();
  }

  // Persistence helpers
  private getPendingJob(): { job_id: string; request?: any; createdAt?: number } | null {
    const raw = localStorage.getItem(this.pendingJobKey);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  private savePendingJob(job_id: string, request?: any) {
    try {
      localStorage.setItem(this.pendingJobKey, JSON.stringify({ job_id, request, createdAt: Date.now() }));
    } catch {}
  }

  private removePendingJob() {
    localStorage.removeItem(this.pendingJobKey);
    localStorage.removeItem(this.queueEtaKey);
  }

  private saveQueueEta(queue_position?: number, eta?: number) {
    try {
      localStorage.setItem(this.queueEtaKey, JSON.stringify({ queue_position, eta, ts: Date.now() }));
    } catch {}
  }

  private handleExpiredPendingJob(pending: { job_id: string; request?: any; createdAt?: number }) {
    // Restore previous settings if we have them
    if (pending.request) {
      this.generationRequest = { ...this.generationRequest, ...pending.request };
      this.sharedService.setGenerationRequest(this.generationRequest);
      if (Array.isArray(pending.request.loras)) {
        this.generationRequest.loras = this.snapshotLoras(pending.request.loras);
        this.updateCreditCost();
      }
      if (pending.request.regional_prompting) {
        this.generationRequest.regional_prompting = this.sanitizeRegionalPrompting(
          pending.request.regional_prompting,
          pending.request.model
        );
      }
    }
    // Clear pending and release any lock just in case
    this.removePendingJob();
    this.lockService.release();
    // Reset queue type to free to prevent auth errors
    this.queueType = 'free';
    // Re-enable UI
    this.enableGenerationButton = true;
    this.loadingChange.emit(false);
    // Inform the user
    this.messageService.add({
      severity: 'info',
      summary: 'Job expired',
      detail: 'Your previous job is older than 24 hours and can’t be resumed. Your settings were restored — click Generate to try again.',
      life: 6000
    });
  }
}
