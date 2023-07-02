import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { ReferenceImage } from 'src/_shared/reference-image.interface';
import { GenerationRequest } from 'src/_shared/generation-request.interface';
import { interval } from 'rxjs';
import { switchMap, takeWhile, finalize, concatMap, tap } from 'rxjs/operators';
import { AfterViewInit } from '@angular/core';


@Component({
  selector: 'app-options',
  templateUrl: './options.component.html',
  styleUrls: ['./options.component.css']
})
export class OptionsComponent {
  showLoading: boolean = false;
  showStrength: boolean = false;
  showInpainting: boolean = false;
  images: string[] = [];
  aspectRatio: AspectRatio = {width: 512, height: 512, model: "testSonicBeta4__dynamic"};
  generationRequest: GenerationRequest = {
    prompt: "",
    image: undefined,
    negative_prompt: "nsfw, worst quality, low quality, watermark, signature, simple background, bad anatomy, bad hands, deformed limbs, blurry, cropped, cross-eyed, extra arms, speech bubble, extra legs, extra limbs, bad proportions, poorly drawn hands, text, flat background",
    scheduler: 7,
    steps: 20,
    width: 512,
    height: 512,
    guidance_scale: 7,
    seed: -1,
    batch_size: 4,
    strength: 0.5,
    job_type: "txt2img",
    model: "testSonicBeta4__dynamic"
  };
  mode: string = "txt2img";
  jobID: string = "";
  API_URL: string = "";

  @Input() referenceImage?: ReferenceImage;

  @Output() imagesChange  = new EventEmitter<any>();
  @Output() loadingChange  = new EventEmitter<any>();
  @Output() aspectRatioChange  = new EventEmitter<AspectRatio>();

  constructor(private stableDiffusionService: StableDiffusionService) {
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['referenceImage'] && changes['referenceImage'].currentValue != null) {
      this.referenceImage = changes['referenceImage'].currentValue;
      this.onReferenceImageChange(this.referenceImage!.aspectRatio);
      this.mode = "img2img";
      this.generationRequest.job_type = "img2img";
    }
  }

  onReferenceImageChange(referenceImageAspectRatio: string) {
    this.changeAspectRatio(referenceImageAspectRatio);
  }

  changeAspectRatioSelector(event: any) {
    let selectElement = event.target as HTMLSelectElement;
    this.changeAspectRatio(selectElement.value);
  }

  changeAspectRatio(aspectRatio: string) {
    if (aspectRatio == 'square') {
      this.aspectRatio = { width: 512, height: 512, model: "testSonicBeta4__dynamic" };
    }
    else if (aspectRatio == 'portrait') {
      this.aspectRatio = { width: 512, height: 768, model: "testSonicBeta4__dynamic" };
    }
    else if (aspectRatio == 'landscape') {
      this.aspectRatio = { width: 768, height: 512, model: "testSonicBeta4__dynamic"};
    }

    // Emit the aspectRatio object itself.
    this.aspectRatioChange.emit(this.aspectRatio);
  }

  generateImages() {
    this.submitJob();
  }

  // Send job to django api and retrieve job id.
  submitJob() {
    this.loadingChange.emit(true);
    this.stableDiffusionService.submitJob(this.generationRequest)
      .subscribe(
        response => {
          console.log(response);  // handle the response

          this.getJob(response.job_id, response.API_IP);

          // this.images = response.images;
          // this.imagesChange.emit(this.images);
          // this.loadingChange.emit(false);
        },
        error => {
          console.error(error);  // handle error
        }
      );
  }

// check for status of job
getJob(job_id: string, API_URL: string) {
  let jobComplete = false;
  let lastResponse: any;

  const getJobInfo = {
    "job_id": job_id,
    "API_IP": API_URL
  }
  
  // Create an interval which fires every 3 seconds
  interval(3000)
    .pipe(
      // For each tick of the interval, call the service
      concatMap(() => this.stableDiffusionService.getJob(getJobInfo)),
      // Store the response for use in finalize
      tap(response => lastResponse = response),
      // Only continue the stream while the job is incomplete
      takeWhile(response => !(jobComplete = (response.status === 'completed')), true),
      // Once the stream completes, do any cleanup if necessary
      finalize(() => {
        if (jobComplete && lastResponse) {
          console.log(lastResponse);
          this.images = lastResponse.result;
          this.imagesChange.emit(this.images);
          this.loadingChange.emit(false);
        }
      })
    )
    .subscribe(
      response => {
        // This will be called every 3 seconds, so we do nothing here
      },
      error => console.error(error)
    );
}


  // img2img() {
  //   const data = {
  //     "data": {
  //         "prompt": this.prompt,
  //         "image": this.referenceImage!.base64,
  //         "scheduler": 7,
  //         "steps": 20,
  //         "negative_prompt": this.negative_prompt,
  //         "width":  this.aspectRatio.width,
  //         "height":  this.aspectRatio.height,
  //         "guidance_scale": this.cfg,
  //         "seed": this.seed ?? -1,
  //         "batch_size": 4,
  //         "strength": 0.5,
  //       },
  //       "model": 'testSonicBeta4',
  //       "save_image": false  // replace with the data you want to send
  //     }
  //   this.loadingChange.emit(true);
  //   this.stableDiffusionService.submitJob(data)
  //     .subscribe(
  //       response => {
  //         console.log(response);  // handle the response
  //         this.images = response.images;
  //         this.imagesChange.emit(this.images);
  //         this.loadingChange.emit(false);
  //       },
  //       error => {
  //         console.error(error);  // handle error
  //       }
  //     );
  // }
}
