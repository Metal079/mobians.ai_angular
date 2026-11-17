import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { regionColor, RegionBox } from './regional-state';

/** Small read-only picture of a layout, for layout buttons, presets and the image info dialog. */
@Component({
  selector: 'app-regional-minimap',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="mm-frame" [style.aspect-ratio]="aspect" aria-hidden="true">
      @for (box of boxes; track $index) {
        <span class="mm-box" [style.left.%]="box.x * 100" [style.top.%]="box.y * 100"
          [style.width.%]="box.width * 100" [style.height.%]="box.height * 100"
          [style.--mm-color]="color($index)"></span>
      }
    </span>
  `,
  styles: [`
    :host { display: inline-block; width: 100%; line-height: 0; }
    .mm-frame {
      position: relative; display: block; width: 100%; overflow: hidden; border-radius: 4px;
      background: repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 3px, transparent 3px 7px), #151b2a;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.18);
    }
    .mm-box {
      position: absolute; box-sizing: border-box; border: 1.5px solid var(--mm-color);
      background: color-mix(in srgb, var(--mm-color) 34%, #151b2a); border-radius: 2px;
    }
  `],
})
export class RegionalMinimapComponent {
  @Input() boxes: RegionBox[] = [];
  /** Width / height. */
  @Input() aspect = 1;

  color(index: number): string { return regionColor(index); }
}
