import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
    selector: 'app-inpainting-display',
    templateUrl: './inpainting-display.component.html',
    styleUrls: ['./inpainting-display.component.css'],
    standalone: true,
    imports: [ButtonModule]
})
export class InpaintingDisplayComponent {
  mobileDevice?: boolean;


  ngOnInit() {
    if (window.innerWidth < 768) {
      this.mobileDevice = true;
    }
  }
}
