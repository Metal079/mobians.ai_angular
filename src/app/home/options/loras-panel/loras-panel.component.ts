import { Component, DestroyRef, DoCheck, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogService } from 'primeng/dynamicdialog';
import { MessageService } from 'primeng/api';
import { AuthService } from 'src/app/auth/auth.service';
import { SharedService } from 'src/app/shared.service';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { AddLorasComponent } from '../../add-loras/add-loras.component';
import { LoraHistoryPromptService } from '../lora-history-prompt.service';

type LoraSortOption = 'most-used' | 'last-used' | 'alphabetical';

@Component({
  selector: 'app-loras-panel',
  templateUrl: './loras-panel.component.html',
  styleUrls: ['./loras-panel.component.css'],
})
export class LorasPanelComponent implements OnInit, OnChanges, DoCheck {
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) generationRequest!: any;
  @Input({ required: true }) modelsTypes: { [model: string]: string } = {};
  @Input() maxLoras = 3;
  @Input() isLoggedIn = false;
  @Input() resetToken = 0;
  @Output() lorasChanged = new EventEmitter<void>();

  showNSFWLoras = false;
  loraTagOptions: { optionLabel: string; optionValue: string; count: number }[] = [];
  selectedTags: string[] = [];
  loras: any[] = [];
  loraSearchQuery = '';
  filteredLoras: any[] = [];
  selectedLoras: any[] = [];
  loraSortOption: LoraSortOption = 'most-used';
  loraSortOptions: { label: string; value: LoraSortOption }[] = [
    { label: 'Most used', value: 'most-used' },
    { label: 'Last used', value: 'last-used' },
    { label: 'Alphabetical', value: 'alphabetical' }
  ];
  showFavoriteLorasOnly = false;
  loraFavorites: Record<string, boolean> = {};
  private loraLastUsed: Record<string, number> = {};
  private readonly loraSortKey = 'mobians:lora-sort';
  private readonly loraFavoritesOnlyKey = 'mobians:lora-favorites-only';
  private loraPrefsLoadedFromCloud = false;
  private loraPrefsLoading = false;

  displayModal = false;
  selectedImageUrl: string | null = null;

  showLoraLoadPrompt = false;
  pendingLoraLoadImage: MobiansImage | null = null;

  private loginInfo: any;
  private lastModelId?: string;
  private lastResetToken = 0;

  constructor(
    private readonly stableDiffusionService: StableDiffusionService,
    private readonly sharedService: SharedService,
    private readonly messageService: MessageService,
    private readonly dialogService: DialogService,
    private readonly authService: AuthService,
    private readonly loraHistoryPromptService: LoraHistoryPromptService
  ) {}

  ngOnInit() {
    this.loadLoraUiState();
    this.loadShowNsfwState();
    this.loadLoras();

    this.sharedService.getUserData().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(userData => {
      if (userData?.discord_user_id) {
        this.loginInfo = userData;
      }
      this.tryLoadLoraPreferencesFromCloud();
    });

    this.loraHistoryPromptService.requests$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((image) => this.handleHistoryLoraRequest(image));
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['resetToken']) {
      const next = changes['resetToken'].currentValue ?? 0;
      if (next !== this.lastResetToken) {
        this.lastResetToken = next;
        this.resetLoraUiState();
      }
    }
  }

  ngDoCheck() {
    if (!this.generationRequest) return;

    const currentModel = this.generationRequest.model;
    if (currentModel && currentModel !== this.lastModelId) {
      this.lastModelId = currentModel;
      this.handleModelChange();
    }

    const requestLoras = Array.isArray(this.generationRequest.loras) ? this.generationRequest.loras : [];
    if (requestLoras !== this.selectedLoras && requestLoras.length > 0) {
      this.syncSelectedFromRequest(requestLoras);
    } else if (requestLoras.length === 0 && this.selectedLoras.length > 0 && this.generationRequest.loras !== this.selectedLoras) {
      this.selectedLoras = [];
      this.generationRequest.loras = this.selectedLoras;
      this.emitLorasChanged();
    }
  }

  private emitLorasChanged() {
    this.lorasChanged.emit();
  }

  private loadShowNsfwState() {
    try {
      const raw = localStorage.getItem('showNSFWLoras');
      if (raw != null) {
        this.showNSFWLoras = raw === 'true';
      }
    } catch {}
  }

  private resetLoraUiState() {
    this.showNSFWLoras = false;
    this.loraSearchQuery = '';
    this.selectedTags = [];
    this.showFavoriteLorasOnly = false;
    this.loraSortOption = 'most-used';
    this.loadLoraUiState();
    this.loadShowNsfwState();
    this.filterLoras();
    this.refreshLoraFiltersList();
  }

  private handleModelChange() {
    this.filterLoras();
    this.refreshLoraFiltersList();

    const filteredSelection = this.selectedLoras.filter(lora => this.filteredLoras.includes(lora));
    if (filteredSelection.length !== this.selectedLoras.length) {
      this.selectedLoras = filteredSelection;
      this.generationRequest.loras = this.selectedLoras;
      this.emitLorasChanged();
    }
  }

  private syncSelectedFromRequest(requestLoras: any[]) {
    const resolved = this.resolveHistoryLoras(requestLoras);
    this.selectedLoras = resolved;
    this.generationRequest.loras = resolved;
    this.markLorasUsed(resolved);
    this.emitLorasChanged();
  }

  openAddLorasDialog() {
    if (!this.loginInfo) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error Message',
        detail: 'You must be logged in to suggest LoRAs. (Discord button in the FAQ section)',
        life: 3000
      });
      return;
    }

    const screenWidth = window.innerWidth;
    let dialogWidth = '50%';
    if (screenWidth <= 600) {
      dialogWidth = '90%';
    }

    const dialogRef = this.dialogService.open(AddLorasComponent, {
      header: 'Request Loras To Be Added!',
      width: dialogWidth,
      data: {
        showNSFWLoras: this.showNSFWLoras,
      },
    });

    dialogRef.onClose.subscribe((result: any) => {
      const next = result?.showNSFWLoras;
      if (typeof next === 'boolean' && next !== this.showNSFWLoras) {
        this.showNSFWLoras = next;
        localStorage.setItem('showNSFWLoras', this.showNSFWLoras.toString());
        this.filterLoras();
        this.refreshLoraFiltersList();
      }
    });
  }

  loadLoras() {
    this.stableDiffusionService.getLoras().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (response: any[]) => {
        this.loras = response;
        this.filterLoras();
        this.refreshLoraFiltersList();
        const requestLoras = Array.isArray(this.generationRequest?.loras) ? this.generationRequest.loras : [];
        if (requestLoras.length > 0) {
          this.syncSelectedFromRequest(requestLoras);
        }
      },
      error: (error) => {
        console.error('Error loading Loras:', error);
      }
    });
  }

  filterLoras() {
    let filtered = this.loras.filter(lora => lora.base_model === this.modelsTypes[this.generationRequest.model]);

    if (!this.showNSFWLoras) {
      filtered = filtered.filter(lora => !lora.is_nsfw);
    }

    filtered = filtered.filter(lora =>
      (lora.name.toLowerCase().includes(this.loraSearchQuery.toLowerCase()) || lora.version.toLowerCase().includes(this.loraSearchQuery.toLowerCase()))
    );

    if (this.selectedTags.length > 0) {
      filtered = filtered.filter(lora => lora.tags.some((tag: string) => this.selectedTags.includes(tag)));
    }

    if (this.showFavoriteLorasOnly) {
      filtered = filtered.filter(lora => this.isLoraFavorite(lora));
    }

    const sortOption = this.loraSortOption || 'most-used';
    if (sortOption === 'alphabetical') {
      filtered = filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortOption === 'last-used') {
      filtered = filtered.sort((a, b) => this.getLoraLastUsed(b) - this.getLoraLastUsed(a));
    } else {
      filtered = filtered.sort((a, b) => (b.uses || 0) - (a.uses || 0));
    }

    this.filteredLoras = filtered;
  }

  refreshLoraFiltersList() {
    this.loraTagOptions = [];

    this.filteredLoras.forEach((lora: any) => {
      lora.tags.forEach((tag: string) => {
        let existing = this.loraTagOptions.find(option => option.optionValue === tag);
        if (!existing) {
          this.loraTagOptions.push({
            optionLabel: tag,
            optionValue: tag,
            count: 1
          });
        } else {
          existing.count++;
        }
      });
    });

    this.loraTagOptions = this.loraTagOptions.filter(option => option.count >= 3);
    this.loraTagOptions.sort((a, b) => b.count - a.count);

    this.loraTagOptions.forEach(option => {
      option.optionLabel = `${option.optionValue} (${option.count})`;
    });
  }

  onShowNSFWLorasChange(nextValue: boolean) {
    this.showNSFWLoras = nextValue;
    localStorage.setItem('showNSFWLoras', this.showNSFWLoras.toString());
    this.filterLoras();
    this.refreshLoraFiltersList();
  }

  onSelectedTagsChange(nextValue: string[]) {
    this.selectedTags = nextValue;
    this.filterLoras();
  }

  onSearchQueryChange(nextValue: string) {
    this.loraSearchQuery = nextValue;
    this.filterLoras();
  }

  onLoraSortChange(nextValue: LoraSortOption) {
    this.loraSortOption = nextValue;
    this.saveLoraUiState();
    this.filterLoras();
  }

  toggleFavoriteLorasOnly() {
    this.showFavoriteLorasOnly = !this.showFavoriteLorasOnly;
    this.saveLoraUiState();
    this.filterLoras();
  }

  clearLoraFilters() {
    this.loraSearchQuery = '';
    this.selectedTags = [];
    this.showFavoriteLorasOnly = false;
    this.loraSortOption = 'most-used';
    this.saveLoraUiState();
    this.filterLoras();
    this.refreshLoraFiltersList();
  }

  selectLora(lora: any) {
    if (this.selectedLoras.length >= this.maxLoras) {
      alert('You can only select up to 3 LoRAs at a time.');
      return;
    }
    if (this.selectedLoras.find(item => item === lora)) {
      this.removeLora(lora);
      return;
    }

    lora.strength = 1.0;
    this.selectedLoras.push(lora);
    this.generationRequest.loras = this.selectedLoras;
    this.markLoraUsed(lora);

    if (lora.trigger_words) {
      const missing_trigger_words: string[] = [];
      let prompt_words = this.generationRequest.prompt.split(',');
      prompt_words = prompt_words.map((word: string) => word.trim().toLowerCase());

      let trigger_words = lora.trigger_words;
      trigger_words = trigger_words.map((word: string) => word.trim().toLowerCase());

      trigger_words.forEach((element: string) => {
        if (!prompt_words.includes(element)) {
          missing_trigger_words.push(element);
        }
      });

      missing_trigger_words.forEach((element: String) => {
        this.generationRequest.prompt += ', ' + element;
      });
      this.sharedService.setPrompt(this.generationRequest.prompt);
    }

    this.emitLorasChanged();
  }

  updateStrength(lora: any, newStrength: number) {
    const loraItem = this.selectedLoras.find(item => item === lora);
    if (loraItem) {
      loraItem.strength = newStrength;
    }
  }

  removeLora(lora: any) {
    this.selectedLoras = this.selectedLoras.filter(item => item !== lora);
    this.generationRequest.loras = this.selectedLoras;

    if (lora.trigger_words) {
      let trigger_words = lora.trigger_words;
      trigger_words = trigger_words.map((word: string) => word.trim().toLowerCase());

      trigger_words.forEach((element: String) => {
        this.generationRequest.prompt = this.generationRequest.prompt.replace(', ' + element, '');
      });
      this.sharedService.setPrompt(this.generationRequest.prompt);
    }

    this.emitLorasChanged();
  }

  openImageModalLoraPreview(imageUrl: string) {
    this.selectedImageUrl = imageUrl;
    this.displayModal = true;
  }

  onLoraPreviewVisibleChange(visible: boolean) {
    this.displayModal = visible;
    if (!visible) this.selectedImageUrl = null;
  }

  isLoraSelected(lora: any): boolean {
    const targetKey = this.getLoraKey(lora);
    if (!targetKey) return false;
    return this.selectedLoras.some(item => this.getLoraKey(item) === targetKey);
  }

  isLoraFavorite(lora: any): boolean {
    const key = this.getLoraKey(lora);
    if (!key) return false;
    return !!this.loraFavorites[key];
  }

  toggleLoraFavorite(lora: any, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!this.authService.isLoggedIn()) {
      this.messageService.add({
        severity: 'info',
        summary: 'Login Required',
        detail: 'Sign in to favorite LoRAs across devices.'
      });
      return;
    }
    const key = this.getLoraKey(lora);
    if (!key) return;
    const nextValue = !this.loraFavorites[key];
    if (nextValue) {
      this.loraFavorites[key] = true;
    } else {
      delete this.loraFavorites[key];
    }
    this.filterLoras();
    this.syncLoraPreferencesToCloud();
  }

  private handleHistoryLoraRequest(image: MobiansImage) {
    const historyLoras = Array.isArray(image.loras) ? image.loras : [];
    if (historyLoras.length === 0) return;

    const targetBaseModel = this.modelsTypes?.[this.generationRequest.model];
    const hasCompatibleLoras = !targetBaseModel
      ? true
      : historyLoras.some((lora) => lora?.base_model === targetBaseModel);
    if (!hasCompatibleLoras) {
      return;
    }

    this.pendingLoraLoadImage = image;
    this.showLoraLoadPrompt = true;
  }

  confirmLoadHistoryLoras() {
    const image = this.pendingLoraLoadImage;
    this.clearLoraLoadPrompt();
    if (!image) {
      return;
    }
    const resolved = this.resolveHistoryLoras(image.loras);
    this.selectedLoras = resolved;
    this.generationRequest.loras = this.selectedLoras;
    this.markLorasUsed(this.selectedLoras);
    this.emitLorasChanged();
  }

  declineLoadHistoryLoras() {
    this.clearLoraLoadPrompt();
  }

  private clearLoraLoadPrompt() {
    this.showLoraLoadPrompt = false;
    this.pendingLoraLoadImage = null;
  }

  private resolveHistoryLoras(historyLoras?: any[]): any[] {
    if (!Array.isArray(historyLoras) || historyLoras.length === 0) {
      return [];
    }
    const availableLoras = Array.isArray(this.loras) ? this.loras : [];
    const byVersionId = new Map(
      availableLoras
        .filter((lora) => lora?.version_id != null)
        .map((lora) => [String(lora.version_id), lora])
    );
    const byNameVersion = new Map(
      availableLoras.map((lora) => [`${lora?.name ?? ''}::${lora?.version ?? ''}`, lora])
    );

    const resolved = historyLoras.map((historyLora) => {
      const versionKey = historyLora?.version_id != null ? String(historyLora.version_id) : null;
      const nameVersionKey = `${historyLora?.name ?? ''}::${historyLora?.version ?? ''}`;
      const match = (versionKey && byVersionId.get(versionKey)) || byNameVersion.get(nameVersionKey);
      const strength = typeof historyLora?.strength === 'number' ? historyLora.strength : 1.0;

      if (match) {
        match.strength = strength;
        return match;
      }
      return { ...historyLora, strength };
    });

    const targetBaseModel = this.modelsTypes?.[this.generationRequest.model];
    const filtered = targetBaseModel
      ? resolved.filter((lora) => lora?.base_model === targetBaseModel)
      : resolved;

    return filtered.slice(0, this.maxLoras);
  }

  private getLoraKey(lora: any): string | null {
    if (!lora) return null;
    if (lora.version_id != null) return String(lora.version_id);
    const name = lora?.name ?? '';
    const version = lora?.version ?? '';
    const combined = `${name}::${version}`.trim();
    return combined.length > 0 ? combined : null;
  }

  private getLoraLastUsed(lora: any): number {
    const key = this.getLoraKey(lora);
    if (!key) return 0;
    return this.loraLastUsed[key] || 0;
  }

  private markLoraUsed(lora: any) {
    const key = this.getLoraKey(lora);
    if (!key) return;
    this.loraLastUsed[key] = Date.now();
    if (this.authService.isLoggedIn()) {
      this.syncLoraPreferencesToCloud();
    }
  }

  private markLorasUsed(loras: any[]) {
    if (!Array.isArray(loras)) return;
    const now = Date.now();
    let changed = false;
    loras.forEach((lora) => {
      const key = this.getLoraKey(lora);
      if (!key) return;
      this.loraLastUsed[key] = now;
      changed = true;
    });
    if (changed) {
      if (this.authService.isLoggedIn()) {
        this.syncLoraPreferencesToCloud();
      }
    }
  }

  private loadLoraUiState() {
    try {
      const sortRaw = localStorage.getItem(this.loraSortKey);
      if (sortRaw === 'most-used' || sortRaw === 'last-used' || sortRaw === 'alphabetical') {
        this.loraSortOption = sortRaw;
      }
      const favoritesOnlyRaw = localStorage.getItem(this.loraFavoritesOnlyKey);
      if (favoritesOnlyRaw != null) {
        this.showFavoriteLorasOnly = favoritesOnlyRaw === 'true';
      }
    } catch {}
  }

  private saveLoraUiState() {
    try {
      localStorage.setItem(this.loraSortKey, this.loraSortOption);
      localStorage.setItem(this.loraFavoritesOnlyKey, this.showFavoriteLorasOnly.toString());
    } catch {}
  }

  private tryLoadLoraPreferencesFromCloud() {
    if (!this.authService.isLoggedIn() || this.loraPrefsLoading || this.loraPrefsLoadedFromCloud) {
      return;
    }
    this.loraPrefsLoading = true;
    this.stableDiffusionService.getLoraPreferences().subscribe({
      next: (prefs: any[]) => {
        this.mergeLoraPreferencesFromCloud(Array.isArray(prefs) ? prefs : []);
        this.loraPrefsLoadedFromCloud = true;
        this.loraPrefsLoading = false;
      },
      error: () => {
        this.loraPrefsLoading = false;
      }
    });
  }

  private mergeLoraPreferencesFromCloud(prefs: any[]) {
    const cloudFavorites: Record<string, boolean> = {};
    const cloudLastUsed: Record<string, number> = {};
    prefs.forEach((pref) => {
      if (pref?.version_id == null) return;
      const key = String(pref.version_id);
      if (pref?.is_favorite) {
        cloudFavorites[key] = true;
      }
      if (pref?.last_used_at) {
        const parsed = Date.parse(pref.last_used_at);
        if (!Number.isNaN(parsed)) {
          cloudLastUsed[key] = parsed;
        }
      }
    });

    const mergedFavorites: Record<string, boolean> = {};
    const mergedLastUsed: Record<string, number> = {};
    const keys = new Set<string>([
      ...Object.keys(this.loraFavorites || {}),
      ...Object.keys(this.loraLastUsed || {}),
      ...Object.keys(cloudFavorites || {}),
      ...Object.keys(cloudLastUsed || {})
    ]);

    keys.forEach((key) => {
      const isFavorite = !!this.loraFavorites[key] || !!cloudFavorites[key];
      if (isFavorite) mergedFavorites[key] = true;
      const localLast = this.loraLastUsed[key] || 0;
      const cloudLast = cloudLastUsed[key] || 0;
      const lastUsed = Math.max(localLast, cloudLast);
      if (lastUsed > 0) mergedLastUsed[key] = lastUsed;
    });

    this.loraFavorites = mergedFavorites;
    this.loraLastUsed = mergedLastUsed;
    this.filterLoras();
    this.refreshLoraFiltersList();
  }

  private syncLoraPreferencesToCloud() {
    if (!this.authService.isLoggedIn()) return;
    const payload = this.buildLoraPreferencesPayload();
    if (payload.length === 0) return;
    this.stableDiffusionService.syncLoraPreferences({ preferences: payload }).subscribe({
      next: () => {},
      error: () => {}
    });
  }

  private buildLoraPreferencesPayload(): any[] {
    const keys = new Set<string>([
      ...Object.keys(this.loraFavorites || {}),
      ...Object.keys(this.loraLastUsed || {})
    ]);
    const payload: any[] = [];
    keys.forEach((key) => {
      const versionId = this.parseLoraKeyToVersionId(key);
      if (versionId == null) return;
      const lastUsedMs = this.loraLastUsed[key];
      payload.push({
        version_id: versionId,
        is_favorite: this.loraFavorites[key] ? true : undefined,
        last_used_at: lastUsedMs ? new Date(lastUsedMs).toISOString() : undefined
      });
    });
    return payload;
  }

  private parseLoraKeyToVersionId(key: string): number | null {
    const parsed = Number(key);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }
}
