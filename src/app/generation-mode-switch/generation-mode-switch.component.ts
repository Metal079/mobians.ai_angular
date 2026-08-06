import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-generation-mode-switch',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './generation-mode-switch.component.html',
  styleUrls: ['./generation-mode-switch.component.css'],
})
export class GenerationModeSwitchComponent {
  @Input() active: 'image' | 'video' = 'image';
}
