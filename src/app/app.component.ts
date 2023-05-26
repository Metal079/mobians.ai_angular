import { Component } from '@angular/core';
import { ImageGridComponent } from './home/image-grid/image-grid.component';
import { Input } from '@angular/core';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  title = 'The best Sonic OC generator';

  images: string[] = [];
  showInstructions: boolean = true;
  showLoading: boolean = false;
  aspectRatio!: AspectRatio;

  onImagesChange(images: string[]) {
    this.images = images;
    this.showInstructions = false;
  }

  onShowLoadingChange(showLoading: boolean) {
    this.showLoading = showLoading;
    this.showInstructions = false;
  }

  onAspectRatioChange(aspectRatio: AspectRatio) {
    this.aspectRatio = aspectRatio;
  }
}
