import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { RegionalPromptRegion } from 'src/_shared/regional-prompting.interface';
import { TooltipModule } from 'primeng/tooltip';
import { RegionalPromptPreset, StableDiffusionService } from 'src/app/stable-diffusion.service';

@Component({
    selector: 'app-generation-options-panel',
    templateUrl: './generation-options-panel.component.html',
    styleUrls: ['./generation-options-panel.component.css'],
    standalone: true,
    imports: [CommonModule, FormsModule, TooltipModule]
})
export class GenerationOptionsPanelComponent implements OnInit, OnChanges {
  private readonly sdxlModelIds = new Set<string>([
    'autismMix',
    'novaFurryXL_ilV140',
    'novaMobianXL_v10',
  ]);
  @Input({ required: true }) generationRequest!: any;
  @Input({ required: true }) aspectRatio!: AspectRatio;

  @Input() panelTheme: 'sonic' | 'navy' = 'sonic';
  @Output() panelThemeChange = new EventEmitter<'sonic' | 'navy'>();
  @Input() darkInputFields = false;
  @Output() darkInputFieldsChange = new EventEmitter<boolean>();

  @Input() currentSeed?: number;

  @Input() hiresEnabled = false;
  @Output() hiresEnabledChange = new EventEmitter<boolean>();

  @Input() enableNotifications = false;
  @Output() enableNotificationsChange = new EventEmitter<boolean>();

  @Input() isLoggedIn = false;
  @Input() referenceImage?: MobiansImage;

  @Input() hiresTooltip = '';

  @Input() downloadAllInProgress = false;

  @Output() modelChange = new EventEmitter<Event>();
  @Output() aspectRatioChange = new EventEmitter<Event>();
  @Output() saveSettings = new EventEmitter<void>();
  @Output() fastPassCodeChange = new EventEmitter<Event>();
  @Output() hiresToggleChange = new EventEmitter<boolean>();
  @Output() enableNotification = new EventEmitter<void>();
  @Output() resetSessionStorage = new EventEmitter<void>();
  @Output() deleteAllImages = new EventEmitter<void>();
  @Output() downloadAllImages = new EventEmitter<void>();
  activeRegionIndex = 0;
  workspaceExpanded = false;
  newPresetName = '';
  regionalPresets: Array<{ id: string; name: string; regions: RegionalPromptRegion[] }> = [];
  private syncingPresets = false;

  private draggingRegionIndex: number | null = null;
  private draggingPointerId: number | null = null;
  private dragStartClientX = 0;
  private dragStartClientY = 0;
  private dragStartRegionX = 0;
  private dragStartRegionY = 0;
  private dragSurfaceWidth = 1;
  private dragSurfaceHeight = 1;

  constructor(private stableDiffusionService: StableDiffusionService) {}

  ngOnInit(): void {
    if (this.isLoggedIn) {
      this.syncRegionalPresetsWithAccount();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.enforceRegionalPromptingSupport();

    if (!changes['isLoggedIn'] || changes['isLoggedIn'].firstChange) return;
    if (changes['isLoggedIn'].currentValue === true) {
      this.syncRegionalPresetsWithAccount();
    } else {
      this.regionalPresets = [];
    }
  }

  onPanelThemeChange(nextTheme: 'sonic' | 'navy') {
    this.panelThemeChange.emit(nextTheme);
    this.saveSettings.emit();
  }

  onDarkInputFieldsChange(enabled: boolean) {
    this.darkInputFieldsChange.emit(enabled);
    this.saveSettings.emit();
  }

  onHiresEnabledChange(enabled: boolean) {
    this.hiresEnabledChange.emit(enabled);
    this.hiresToggleChange.emit(enabled);
  }

  onEnableNotificationsChange(enabled: boolean) {
    this.enableNotificationsChange.emit(enabled);
    this.enableNotification.emit();
    this.saveSettings.emit();
  }

  private ensureRegionalConfig() {
    if (!this.generationRequest.regional_prompting) {
      this.generationRequest.regional_prompting = {
        enabled: false,
        regions: [],
      };
    }

    if (!Array.isArray(this.generationRequest.regional_prompting.regions)) {
      this.generationRequest.regional_prompting.regions = [];
    }

    return this.generationRequest.regional_prompting;
  }

  get regionalEnabled(): boolean {
    if (!this.isRegionalPromptingSupported()) return false;
    return !!this.ensureRegionalConfig().enabled;
  }

  set regionalEnabled(enabled: boolean) {
    this.ensureRegionalConfig().enabled = this.isRegionalPromptingSupported() && !!enabled;
    this.saveSettings.emit();
  }

  get regionalRegions(): RegionalPromptRegion[] {
    return this.ensureRegionalConfig().regions;
  }

  get hasRegions(): boolean {
    return this.regionalRegions.length > 0;
  }

  get selectedRegion(): RegionalPromptRegion | null {
    if (!this.hasRegions) return null;
    if (this.activeRegionIndex < 0 || this.activeRegionIndex >= this.regionalRegions.length) {
      this.activeRegionIndex = 0;
    }
    return this.regionalRegions[this.activeRegionIndex];
  }

  get canManagePresets(): boolean {
    return this.isLoggedIn;
  }

  get regionalPromptingSupported(): boolean {
    return this.isRegionalPromptingSupported();
  }

  get previewAspectRatio(): string {
    const ratio = this.aspectRatio?.aspectRatio;
    if (ratio === 'portrait') return '2 / 3';
    if (ratio === 'landscape') return '3 / 2';
    return '1 / 1';
  }

  addRegion(preset: 'full' | 'left-right' | 'top-bottom' = 'full') {
    if (!this.isRegionalPromptingSupported()) return;
    const cfg = this.ensureRegionalConfig();
    this.workspaceExpanded = true;

    if (preset === 'left-right') {
      cfg.regions = [
        this.createRegion({ x: 0.00, y: 0.00, width: 0.50, height: 1.00 }),
        this.createRegion({ x: 0.50, y: 0.00, width: 0.50, height: 1.00 }),
      ];
      this.activeRegionIndex = 0;
      cfg.enabled = true;
      this.saveSettings.emit();
      return;
    }

    if (preset === 'top-bottom') {
      cfg.regions = [
        this.createRegion({ x: 0.00, y: 0.00, width: 1.00, height: 0.50 }),
        this.createRegion({ x: 0.00, y: 0.50, width: 1.00, height: 0.50 }),
      ];
      this.activeRegionIndex = 0;
      cfg.enabled = true;
      this.saveSettings.emit();
      return;
    }

    cfg.regions.push(this.createRegion({ x: 0.05, y: 0.05, width: 0.45, height: 0.45 }));
    this.activeRegionIndex = cfg.regions.length - 1;
    cfg.enabled = true;
    this.saveSettings.emit();
  }

  selectRegion(index: number) {
    if (!this.regionalEnabled || !this.isRegionalPromptingSupported()) return;
    if (index < 0 || index >= this.regionalRegions.length) return;
    this.activeRegionIndex = index;
  }

  removeRegion(index: number) {
    const cfg = this.ensureRegionalConfig();
    cfg.regions.splice(index, 1);
    if (cfg.regions.length === 0) {
      cfg.enabled = false;
      this.activeRegionIndex = 0;
      this.workspaceExpanded = false;
    } else if (this.activeRegionIndex >= cfg.regions.length) {
      this.activeRegionIndex = cfg.regions.length - 1;
    }
    this.saveSettings.emit();
  }

  clearRegions() {
    const cfg = this.ensureRegionalConfig();
    cfg.regions = [];
    cfg.enabled = false;
    this.activeRegionIndex = 0;
    this.workspaceExpanded = false;
    this.saveSettings.emit();
  }

  onPreviewPointerDown(event: PointerEvent, index: number) {
    if (!this.regionalEnabled || !this.isRegionalPromptingSupported()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const region = this.regionalRegions[index];
    if (!region) return;

    this.selectRegion(index);
    this.draggingRegionIndex = index;
    this.draggingPointerId = event.pointerId;
    this.dragStartClientX = event.clientX;
    this.dragStartClientY = event.clientY;
    this.dragStartRegionX = region.x;
    this.dragStartRegionY = region.y;

    const target = event.currentTarget as HTMLElement | null;
    const surface = target?.parentElement;
    this.dragSurfaceWidth = Math.max(surface?.clientWidth ?? 1, 1);
    this.dragSurfaceHeight = Math.max(surface?.clientHeight ?? 1, 1);

    target?.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  onPreviewPointerMove(event: PointerEvent, index: number) {
    if (
      this.draggingRegionIndex !== index ||
      this.draggingPointerId !== event.pointerId ||
      index < 0 ||
      index >= this.regionalRegions.length
    ) {
      return;
    }

    const region = this.regionalRegions[index];
    const deltaX = (event.clientX - this.dragStartClientX) / this.dragSurfaceWidth;
    const deltaY = (event.clientY - this.dragStartClientY) / this.dragSurfaceHeight;

    region.x = this.clampRange(this.dragStartRegionX + deltaX, 0, 1 - region.width);
    region.y = this.clampRange(this.dragStartRegionY + deltaY, 0, 1 - region.height);
    this.saveSettings.emit();
    event.preventDefault();
  }

  onPreviewPointerUp(event: PointerEvent, index: number) {
    if (this.draggingRegionIndex !== index || this.draggingPointerId !== event.pointerId) return;
    const target = event.currentTarget as HTMLElement | null;
    target?.releasePointerCapture(event.pointerId);
    this.draggingRegionIndex = null;
    this.draggingPointerId = null;
    this.saveSettings.emit();
  }

  saveCurrentAsPreset() {
    if (!this.isRegionalPromptingSupported()) return;
    if (!this.canManagePresets) return;
    const name = this.newPresetName.trim();
    if (!name) return;

    const config = this.ensureRegionalConfig();
    const serializedRegions = this.cloneRegions(config.regions);
    if (serializedRegions.length === 0) return;

    const existingIndex = this.regionalPresets.findIndex(
      (preset) => preset.name.toLowerCase() === name.toLowerCase()
    );

    const preset = {
      id: existingIndex >= 0 ? this.regionalPresets[existingIndex].id : `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name,
      regions: serializedRegions,
    };

    if (existingIndex >= 0) {
      this.regionalPresets[existingIndex] = preset;
    } else {
      this.regionalPresets.push(preset);
    }

    this.syncRegionalPresetsToAccount();
    this.newPresetName = '';
  }

  applyPreset(presetId: string) {
    if (!this.isRegionalPromptingSupported()) return;
    const preset = this.regionalPresets.find((item) => item.id === presetId);
    if (!preset) return;

    const config = this.ensureRegionalConfig();
    config.enabled = true;
    config.regions = this.cloneRegions(preset.regions);
    this.activeRegionIndex = 0;
    this.workspaceExpanded = true;
    this.saveSettings.emit();
  }

  removePreset(presetId: string, presetName?: string) {
    if (!this.canManagePresets) return;
    const label = (presetName || 'this preset').trim();
    const confirmed = window.confirm(`Delete "${label}"?`);
    if (!confirmed) return;
    this.regionalPresets = this.regionalPresets.filter((item) => item.id !== presetId);
    this.syncRegionalPresetsToAccount();
  }

  toggleWorkspace() {
    if (!this.isRegionalPromptingSupported()) return;
    if (!this.regionalEnabled && !this.hasRegions) return;
    this.workspaceExpanded = !this.workspaceExpanded;
  }

  private isRegionalPromptingSupported(): boolean {
    const currentModel = String(this.generationRequest?.model ?? '').trim();
    return this.sdxlModelIds.has(currentModel);
  }

  private enforceRegionalPromptingSupport() {
    const cfg = this.ensureRegionalConfig();
    if (this.isRegionalPromptingSupported()) return;
    if (cfg.enabled) {
      cfg.enabled = false;
      this.saveSettings.emit();
    }
  }

  private cloneRegions(regions: RegionalPromptRegion[]): RegionalPromptRegion[] {
    return (regions || []).map((region) => ({
      ...region,
      id: region.id || `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      prompt: String(region.prompt ?? ''),
      negative_prompt: String(region.negative_prompt ?? ''),
      x: this.clampRange(Number(region.x), 0, 1),
      y: this.clampRange(Number(region.y), 0, 1),
      width: this.clampRange(Number(region.width), 0.05, 1),
      height: this.clampRange(Number(region.height), 0.05, 1),
      denoise_strength: this.clampRange(Number(region.denoise_strength ?? 1.0), 0.0, 1),
      feather: this.clampRange(Math.round(Number(region.feather ?? 32)), 0, 96),
      opacity: 1.0,
      inherit_base_prompt: region.inherit_base_prompt !== false,
    }));
  }

  private normalizePresetList(presets: RegionalPromptPreset[]): Array<{ id: string; name: string; regions: RegionalPromptRegion[] }> {
    if (!Array.isArray(presets)) return [];
    return presets
      .map((preset) => ({
        id: String(preset?.id ?? `${Date.now()}-${Math.floor(Math.random() * 1000)}`),
        name: String(preset?.name ?? '').trim(),
        regions: this.cloneRegions(Array.isArray(preset?.regions) ? preset.regions as RegionalPromptRegion[] : []),
      }))
      .filter((preset) => preset.name.length > 0 && preset.regions.length > 0);
  }

  private syncRegionalPresetsWithAccount() {
    if (!this.isLoggedIn || this.syncingPresets) return;
    this.syncingPresets = true;

    this.stableDiffusionService.getRegionalPromptPresets().subscribe({
      next: (cloudPresets) => {
        const normalizedCloudPresets = this.normalizePresetList(cloudPresets || []);

        if (normalizedCloudPresets.length > 0) {
          this.regionalPresets = normalizedCloudPresets;
        } else {
          this.regionalPresets = [];
        }

        this.syncingPresets = false;
      },
      error: () => {
        this.syncingPresets = false;
      }
    });
  }

  private syncRegionalPresetsToAccount() {
    if (!this.canManagePresets || this.syncingPresets) return;
    this.syncingPresets = true;

    this.stableDiffusionService.syncRegionalPromptPresets({
      presets: this.regionalPresets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        regions: this.cloneRegions(preset.regions).map((region) => ({
          id: region.id,
          prompt: region.prompt,
          negative_prompt: region.negative_prompt ?? '',
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
          denoise_strength: region.denoise_strength,
          feather: region.feather,
          opacity: 1.0,
          inherit_base_prompt: region.inherit_base_prompt !== false,
        })),
      }))
    }).subscribe({
      next: () => {
        this.syncingPresets = false;
      },
      error: () => {
        this.syncingPresets = false;
      }
    });
  }

  normalizeRegion(region: RegionalPromptRegion) {
    region.x = this.clamp01(region.x);
    region.y = this.clamp01(region.y);
    region.width = this.clampRange(region.width, 0.05, 1);
    region.height = this.clampRange(region.height, 0.05, 1);

    if (region.x + region.width > 1) {
      region.x = Math.max(0, 1 - region.width);
    }
    if (region.y + region.height > 1) {
      region.y = Math.max(0, 1 - region.height);
    }

    region.denoise_strength = this.clampRange(region.denoise_strength, 0.0, 1.0);
    region.feather = this.clampRange(Math.round(region.feather), 0, 96);
    region.opacity = 1.0;
    this.saveSettings.emit();
  }

  private createRegion(
    partial: Pick<RegionalPromptRegion, 'x' | 'y' | 'width' | 'height'>
  ): RegionalPromptRegion {
    return {
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      prompt: '',
      negative_prompt: '',
      x: partial.x,
      y: partial.y,
      width: partial.width,
      height: partial.height,
      denoise_strength: 1.0,
      feather: 32,
      opacity: 1.0,
      inherit_base_prompt: true,
    };
  }

  private clamp01(v: number): number {
    return this.clampRange(v, 0, 1);
  }

  private clampRange(v: number, min: number, max: number): number {
    const parsed = Number(v);
    if (Number.isNaN(parsed)) return min;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
  }
}
