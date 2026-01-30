import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { MobiansImage } from 'src/_shared/mobians-image.interface';

@Component({
  selector: 'app-generation-options-panel',
  templateUrl: './generation-options-panel.component.html',
  styleUrls: ['./generation-options-panel.component.css'],
})
export class GenerationOptionsPanelComponent {
  @Input({ required: true }) generationRequest!: any;
  @Input({ required: true }) aspectRatio!: AspectRatio;

  @Input() panelTheme: 'sonic' | 'navy' = 'sonic';
  @Output() panelThemeChange = new EventEmitter<'sonic' | 'navy'>();

  @Input() currentSeed?: number;

  @Input() hiresEnabled = false;
  @Output() hiresEnabledChange = new EventEmitter<boolean>();

  @Input() enableNotifications = false;
  @Output() enableNotificationsChange = new EventEmitter<boolean>();

  @Input() isLoggedIn = false;
  @Input() referenceImage?: MobiansImage;

  @Input() hiresTooltip = '';

  @Output() modelChange = new EventEmitter<Event>();
  @Output() aspectRatioChange = new EventEmitter<Event>();
  @Output() saveSettings = new EventEmitter<void>();
  @Output() fastPassCodeChange = new EventEmitter<Event>();
  @Output() hiresToggleChange = new EventEmitter<boolean>();
  @Output() enableNotification = new EventEmitter<void>();
  @Output() resetSessionStorage = new EventEmitter<void>();
  @Output() deleteAllImages = new EventEmitter<void>();

  onPanelThemeChange(nextTheme: 'sonic' | 'navy') {
    this.panelThemeChange.emit(nextTheme);
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
}
