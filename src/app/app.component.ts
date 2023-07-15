import { Component  } from '@angular/core';
import { ImageGridComponent } from './home/image-grid/image-grid.component';
import { Input } from '@angular/core';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { ReferenceImage } from 'src/_shared/reference-image.interface';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  title = 'The best Sonic OC generator';

  images: string[] = [];
  showLoading: boolean = false;
  aspectRatio: AspectRatio = {width: 512, height: 512, model: "test", aspectRatio: "square"};
  referenceImage?: ReferenceImage;
  inpaintingEnabled: boolean = false;
  queuePosition?: number;
  inpaintMask?: string;

  constructor() {}  

  onImagesChange(images: string[]) {
    this.images = images;
  }

  onShowLoadingChange(showLoading: boolean) {
    this.showLoading = showLoading;
  }

  onAspectRatioChange(aspectRatio: AspectRatio) {
    this.aspectRatio = aspectRatio;
  }

  onReferenceImageChange(referenceImage: ReferenceImage) {
    this.referenceImage = referenceImage;
  }

  onInpaintingChange(inpaintingEnabled: boolean) {
    this.inpaintingEnabled = inpaintingEnabled;
  }

  onQueuePositionChange(queuePosition: number) {
    this.queuePosition = queuePosition;
  }

  onInpaintMaskChange(inpaint_mask: string) {
    this.inpaintMask = inpaint_mask;
    console.log(inpaint_mask);
  }
}
