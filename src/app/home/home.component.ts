import { Component, ViewChild } from '@angular/core';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { ImageModalComponent } from '../home/image-modal/image-modal.component';

import { SharedService } from 'src/app/shared.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  @ViewChild(ImageModalComponent) imageModal!: ImageModalComponent;

  title = 'The best Sonic OC generator';

  images: string[] = [];
  showLoading: boolean = false;
  aspectRatio: AspectRatio = {width: 512, height: 512, model: "test", aspectRatio: "square"};
  inpaintingEnabled: boolean = false;
  queuePosition?: number;
  inpaintMask?: string;
  showRatingButtons: boolean = false;
  ratingButtonsEligibility: boolean = false;

  constructor(private sharedService: SharedService) {}  

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

  onImageModalOpenChange(open: boolean) {
    if (open) {
      const referenceImageUrl = this.sharedService.getReferenceImageValue()!.url;
      this.imageModal.openModal(referenceImageUrl!);
    }
  }
}
