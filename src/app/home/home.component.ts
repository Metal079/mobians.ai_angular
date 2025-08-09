import { Component, ViewChild } from '@angular/core';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { ImageModalComponent } from '../home/image-modal/image-modal.component';

import { SharedService } from 'src/app/shared.service';
import {Message} from "primeng/api";

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
  etaSeconds?: number;
  showRatingButtons: boolean = false;
  ratingButtonsEligibility: boolean = false;
  headerMessage: Message[] = [{
    severity: 'info',
    summary: 'Welcome to Mobians!',
    detail: 'Join the community on Discord and gain fastpasses by participating in our weekly events! <a href="https://discord.gg/mobians" target="_blank">Click here to join.</a>',
  }];
  loginInfo: any = null;

  constructor(private sharedService: SharedService) {}

  ngOnInit() {
    // Discord userdata check
    this.sharedService.getUserData().subscribe(userData => {
      if (userData) {
        // If we dont have discordUserID, we need them to login again
        if (userData.discord_user_id) {
          this.loginInfo = userData;
          console.log('premium member!');
          this.onDiscordLoginSuccess(userData);
        }
      }
    });
  }

  // Example function called after successful Discord login
  onDiscordLoginSuccess(userData: any) {
    localStorage.setItem('discordUserData', JSON.stringify(userData));
  }

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

  onEtaChange(eta: number | undefined) {
    this.etaSeconds = eta;
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
