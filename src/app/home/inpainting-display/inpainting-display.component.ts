import { Component } from '@angular/core';

@Component({
  selector: 'app-inpainting-display',
  templateUrl: './inpainting-display.component.html',
  styleUrls: ['./inpainting-display.component.css']
})
export class InpaintingDisplayComponent {
  mobileDevice?: boolean;


  ngOnInit() {
    if (window.innerWidth < 768) {
      this.mobileDevice = true;
    }
  }
}
