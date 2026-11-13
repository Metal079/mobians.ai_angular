import { Component, Input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WhatsNewService } from '../whats-new/whats-new.service';

@Component({
  selector: 'app-generation-mode-switch',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './generation-mode-switch.component.html',
  styleUrls: ['./generation-mode-switch.component.css'],
})
export class GenerationModeSwitchComponent {
  @Input() active: 'image' | 'video' | 'characters' = 'image';
  /** This switch is on every main page, which makes it the one place the "What's new" bell is always reachable. */
  readonly whatsNew = inject(WhatsNewService);

  constructor() {
    this.whatsNew.load();
  }
}
