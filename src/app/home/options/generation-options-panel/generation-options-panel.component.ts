import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { RegionalPromptingConfig } from 'src/_shared/regional-prompting.interface';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { HintComponent } from 'src/app/hint/hint.component';
import { DialogModule } from 'primeng/dialog';
import { GenerationModelSettings } from 'src/app/stable-diffusion.service';
import { AprilFoolsService } from 'src/app/april-fools.service';
import { RegionalEditorComponent } from '../regional-editor/regional-editor.component';
import { RegionalEditorService } from '../regional-editor/regional-editor.service';
import { normaliseRegionalConfig } from '../regional-editor/regional-state';

type PanelTheme = 'sonic' | 'navy' | '606' | 'eggman';

@Component({
    selector: 'app-generation-options-panel',
    templateUrl: './generation-options-panel.component.html',
    styleUrls: ['./generation-options-panel.component.css'],
    standalone: true,
    imports: [CommonModule, FormsModule, SelectModule, TooltipModule, DialogModule, HintComponent, RegionalEditorComponent]
})
export class GenerationOptionsPanelComponent {
  @Input({ required: true }) generationRequest!: any;
  @Input({ required: true }) aspectRatio!: AspectRatio;
  @Input() modelSettings: GenerationModelSettings[] = [];
  @Input() modelsLoading = false;
  @Input() modelsLoadError = false;
  @Output() retryModels = new EventEmitter<void>();

  get selectedModel(): GenerationModelSettings | undefined {
    return this.modelSettings.find(model => model.model_id === this.generationRequest?.model);
  }

  get textOnlyModel(): boolean {
    const operations = this.selectedModel?.supported_operations;
    return operations?.length === 1 && operations[0] === 'txt2img';
  }

  @Input() panelTheme: PanelTheme = 'sonic';
  @Output() panelThemeChange = new EventEmitter<PanelTheme>();
  @Input() darkInputFields = false;
  @Output() darkInputFieldsChange = new EventEmitter<boolean>();

  @Input() currentSeed?: number;

  @Input() hiresEnabled = false;
  @Output() hiresEnabledChange = new EventEmitter<boolean>();

  @Input() isLoggedIn = false;
  @Input() referenceImage?: MobiansImage;

  @Input() hiresTooltip = '';

  /** The job type the next Generate press uses, so the regional editor can say when regions are not applied. */
  @Input() regionalJobType = 'txt2img';

  @Input() downloadAllInProgress = false;

  @Output() modelChange = new EventEmitter<string>();
  @Output() aspectRatioChange = new EventEmitter<Event>();
  @Output() saveSettings = new EventEmitter<void>();
  @Output() fastPassCodeChange = new EventEmitter<Event>();
  @Output() hiresToggleChange = new EventEmitter<boolean>();
  @Output() resetSessionStorage = new EventEmitter<void>();
  @Output() deleteAllImages = new EventEmitter<void>();
  @Output() downloadAllImages = new EventEmitter<void>();
  readonly regionalEditor = inject(RegionalEditorService);

  constructor(public aprilFools: AprilFoolsService) {}

  /** The regional settings in the version 2 working shape (older saved shapes are upgraded once). */
  get regionalConfig(): RegionalPromptingConfig {
    const current = this.generationRequest?.regional_prompting;
    if (current && current.version === 2 && Array.isArray(current.regions)) return current;
    const upgraded = normaliseRegionalConfig(current);
    if (this.generationRequest) this.generationRequest.regional_prompting = upgraded;
    return upgraded;
  }

  closeRegionalDialog(): void {
    this.regionalEditor.closeDialog();
  }

  onPanelThemeChange(nextTheme: PanelTheme) {
    this.panelThemeChange.emit(nextTheme);
    this.saveSettings.emit();
  }

  onDarkInputFieldsChange(enabled: boolean) {
    this.darkInputFieldsChange.emit(enabled);
    this.saveSettings.emit();
  }

  onModelSelectionChange(modelId: string) {
    this.modelChange.emit(modelId);
  }

  onHiresEnabledChange(enabled: boolean) {
    this.hiresEnabledChange.emit(enabled);
    this.hiresToggleChange.emit(enabled);
  }
}
