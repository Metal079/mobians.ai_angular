import { Component } from '@angular/core';
import { ImageGridComponent } from './home/image-grid/image-grid.component';
import { Input } from '@angular/core';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { MobiansImage } from 'src/_shared/mobians-image.interface';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  title = 'The best Sonic OC generator';

  images: string[] = [];
  showLoading: boolean = false;
  aspectRatio: AspectRatio = { width: 512, height: 512, model: "test", aspectRatio: "square" };
  inpaintingEnabled: boolean = false;
  queuePosition?: number;
  inpaintMask?: string;
  showRatingButtons: boolean = false;
  ratingButtonsEligibility: boolean = false;

  darkMode: boolean = false;

  constructor() { }

  onImagesChange(images: string[]) {
    this.images = images;
  }

  onShowLoadingChange(showLoading: boolean) {
    this.showLoading = showLoading;
  }

  onAspectRatioChange(aspectRatio: AspectRatio) {
    this.aspectRatio = aspectRatio;
  }

  onInpaintingChange(inpaintingEnabled: boolean) {
    this.inpaintingEnabled = inpaintingEnabled;
  }

  onQueuePositionChange(queuePosition: number) {
    this.queuePosition = queuePosition;
  }

  onInpaintMaskChange(inpaint_mask: string) {
    this.inpaintMask = inpaint_mask;
  }

  ratingButtonsEligibilityChange() {
    this.ratingButtonsEligibility = true;
  }

  onImageExpandedChange(imageExpanded: boolean) {
    if (imageExpanded && this.ratingButtonsEligibility) {
      this.showRatingButtons = true;
    }
    else {
      this.showRatingButtons = false;
    }
  }

  onWebsiteDarkMode(darkMode: boolean) {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const switchToTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', switchToTheme);
  }
}
