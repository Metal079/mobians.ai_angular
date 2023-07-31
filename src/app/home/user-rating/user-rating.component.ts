import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { GenerationRequest } from 'src/_shared/generation-request.interface';
import { SharedService } from 'src/app/shared.service';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { MessageService } from 'primeng/api';
import { MobiansImage } from 'src/_shared/mobians-image.interface';

@Component({
  selector: 'app-user-rating',
  templateUrl: './user-rating.component.html',
  styleUrls: ['./user-rating.component.css'],
})
export class UserRatingComponent implements OnInit, OnDestroy {
  generationRequest: GenerationRequest | null = null;
  imageDetails?: MobiansImage;
  imageIndex?: number;
  showButtons: boolean = false;
  referenceImage?: string;
  allImages: MobiansImage[] = [];

  private generationRequestSubscription: Subscription | null = null;
  private imagesSubscription: Subscription | null = null;
  private referenceImageSubscription: Subscription | null = null;

  constructor(
    private stableDiffusionService: StableDiffusionService,
    private sharedService: SharedService,
    private messageService: MessageService
  ) { }

  ngOnInit() {
    this.generationRequestSubscription = this.sharedService.getGenerationRequest().subscribe(request => {
      this.generationRequest = request;
    });

    this.imagesSubscription = this.sharedService.getImages().subscribe(images => {
      this.allImages = images;
    });

    this.referenceImageSubscription = this.sharedService.getReferenceImage().subscribe(image => {
      const currentRefImage = this.allImages.find(image => image.base64 === this.generationRequest?.image);
      if (currentRefImage) {
        this.imageDetails = currentRefImage;
        this.imageIndex = this.allImages.indexOf(currentRefImage!);
        this.showButtons = true;
      }
      else {
        this.showButtons = false;
      }
    });
  }

  ngOnDestroy() {
    if (this.generationRequestSubscription) {
      this.generationRequestSubscription.unsubscribe();
      this.generationRequestSubscription = null;
    }
  }

  rateGood() {
    if (this.imageDetails) {
      const ratingRequest = {
        ...this.generationRequest,
        image_UUID: this.imageDetails.UUID,
        rating: true,
        seed: -1,

      }
      this.rateImage(ratingRequest);
    }
  }

  rateBad() {
    if (this.imageDetails) {
      const ratingRequest = {
        ...this.generationRequest,
        image_UUID: this.imageDetails.UUID,
        rating: false,
        seed: -1,

      }
      this.rateImage(ratingRequest);
    }
  }

  rateImage(ratingRequest: any) {
    if (this.imageDetails?.rating !== undefined) {
      ratingRequest.rating = undefined;
    }

    this.stableDiffusionService.rateImage(ratingRequest)
      .subscribe(
        response => {
          console.log(response);  // handle the response

          if (response.message == 'deleted') {
            this.imageDetails!.rating = undefined;

            // Display the undo toast
            this.messageService.add({
              severity: 'Success',
              summary: 'Success Message',
              detail: "Rating undone!",
              life: 1000  // Here is the addition.
            });
          }
          else {
            this.imageDetails!.rating = ratingRequest.rating;
            // Display the thank you toast
            this.messageService.add({
              severity: 'Success',
              summary: 'Success Message',
              detail: "Thank you for rating!",
              life: 1000  // Here is the addition.
            });
          }
          this.sharedService.updateImage(this.imageIndex!, this.imageDetails!);
        },
        error => {
          console.error(error);  // handle error
        }
      );
  }
}
