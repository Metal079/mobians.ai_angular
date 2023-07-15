import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { ReferenceImage } from 'src/_shared/reference-image.interface';
import { GenerationRequest } from 'src/_shared/generation-request.interface';
import { interval } from 'rxjs';
import { takeWhile, finalize, concatMap, tap, retryWhen, scan, delayWhen } from 'rxjs/operators';
import { SharedService } from 'src/app/shared.service';
import { Subscription } from 'rxjs';
import { timer } from 'rxjs';
import {MessageService} from 'primeng/api';


@Component({
  selector: 'app-options',
  templateUrl: './options.component.html',
  styleUrls: ['./options.component.css'],
})
export class OptionsComponent {
  private subscription!: Subscription;

  enableGenerationButton: boolean = true;
  showLoading: boolean = false;
  showStrength: boolean = false;
  showInpainting: boolean = false;
  showInpaintingCanvas: boolean = false;
  queuePosition?: number;
  images: string[] = [];
  aspectRatio: AspectRatio = {width: 512, height: 512, model: "testSonicBeta4__dynamic", aspectRatio: "square"};
  defaultNegativePrompt: string = "nsfw, worst quality, low quality, watermark, signature, simple background, bad anatomy, bad hands, deformed limbs, blurry, cropped, cross-eyed, extra arms, speech bubble, extra legs, extra limbs, bad proportions, poorly drawn hands, text, flat background";
  generationRequest: GenerationRequest = {
    prompt: "",
    image: this.referenceImage?.base64,
    mask_image: undefined,
    negative_prompt: this.defaultNegativePrompt,
    scheduler: 7,
    steps: 20,
    width: 512,
    height: 512,
    guidance_scale: 7,
    seed: undefined,
    batch_size: 4,
    strength: 0.7,
    job_type: "txt2img",
    model: "testSonicBeta4__dynamic"
  };
  jobID: string = "";
  API_URL: string = "";

  @Input() referenceImage?: ReferenceImage;
  @Input() inpaintMask?: string;

  @Output() imagesChange  = new EventEmitter<any>();
  @Output() loadingChange  = new EventEmitter<any>();
  @Output() aspectRatioChange  = new EventEmitter<AspectRatio>();
  @Output() inpaintingChange  = new EventEmitter<boolean>();
  @Output() queuePositionChange  = new EventEmitter<number>();

  constructor(
    private stableDiffusionService: StableDiffusionService
    , private sharedService: SharedService
    , private messageService: MessageService
    ) {}

  ngOnInit() {
    this.subscription = this.sharedService.getPrompt().subscribe(value => {
      this.generationRequest.prompt = value;
    });
    this.loadSettings();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['referenceImage']) {
      this.referenceImage = changes['referenceImage'].currentValue;
      if (changes['referenceImage'].currentValue == undefined){
        this.generationRequest.job_type = "txt2img";
        this.generationRequest.image = undefined;
      }
      else{
        this.generationRequest.job_type = "img2img";
        this.generationRequest.image = this.referenceImage!.base64;

        if (this.referenceImage!.aspectRatio == 'square') {
          this.aspectRatio = { width: 512, height: 512, model: "testSonicBeta4__dynamic", aspectRatio: "square" };
          this.generationRequest.width = 512;
          this.generationRequest.height = 512;
        }
        else if (this.referenceImage!.aspectRatio == 'portrait') {
          this.aspectRatio = { width: 512, height: 768, model: "testSonicBeta4__dynamic", aspectRatio: "portrait" };
          this.generationRequest.width = 512;
          this.generationRequest.height = 768;
        }
        else if (this.referenceImage!.aspectRatio == 'landscape') {
          this.aspectRatio = { width: 768, height: 512, model: "testSonicBeta4__dynamic", aspectRatio: "landscape" };
          this.generationRequest.width = 768;
          this.generationRequest.height = 512;
        }
    
        // Emit the aspectRatio object itself.
        this.aspectRatioChange.emit(this.aspectRatio);
  
        if(this.referenceImage != null) {
          this.showInpainting = true;
          this.showStrength = true;
        }
        else{
          this.showInpainting = false;
          this.showStrength = false;
        }
      }
    }
    if (changes['inpaintMask'] && changes['inpaintMask'].currentValue != undefined) {
      this.inpaintMask = changes['inpaintMask'].currentValue;
      if (changes['inpaintMask'].currentValue == undefined){
        this.generationRequest.mask_image = undefined;
        this.generationRequest.job_type = "img2img";
      }
      else{
        this.generationRequest.mask_image = this.inpaintMask!;
        this.generationRequest.job_type = "inpainting";
      }
    }
  }

  changeAspectRatioSelector(event: any) {
    let selectElement = event.target as HTMLSelectElement;
    this.changeAspectRatio(selectElement.value);
  }

  changeAspectRatio(aspectRatio: string) {
    if (aspectRatio == 'square') {
      this.aspectRatio = { width: 512, height: 512, model: "testSonicBeta4__dynamic", aspectRatio: "square" };
      this.generationRequest.width = 512;
      this.generationRequest.height = 512;
    }
    else if (aspectRatio == 'portrait') {
      this.aspectRatio = { width: 512, height: 768, model: "testSonicBeta4__dynamic", aspectRatio: "portrait" };
      this.generationRequest.width = 512;
      this.generationRequest.height = 768;
    }
    else if (aspectRatio == 'landscape') {
      this.aspectRatio = { width: 768, height: 512, model: "testSonicBeta4__dynamic", aspectRatio: "landscape" };
      this.generationRequest.width = 768;
      this.generationRequest.height = 512;
    }

    // Emit the aspectRatio object itself.
    this.aspectRatioChange.emit(this.aspectRatio);

    // Remove inpainting and strength elements
    this.showInpainting = false;
    this.showStrength = false;
    this.inpaintingChange.emit(this.showInpainting);

    // Clear the images array
    this.images = [];
    this.imagesChange.emit(this.images);
  }

  // Update the prompt to the shared service
  updateSharedPrompt() {
    this.sharedService.setPrompt(this.generationRequest.prompt);
  }

  // Save session storage info of changed settings
  saveSettings() {
    localStorage.setItem("prompt-input", this.generationRequest.prompt);
    localStorage.setItem("negative-prompt-input", this.generationRequest.negative_prompt);
    if (this.generationRequest.strength != undefined){
      localStorage.setItem("custom-denoise", this.generationRequest.strength.toString());
    }
    if (this.generationRequest.seed != undefined){
      localStorage.setItem("seed-input", this.generationRequest.seed.toString());
    }
    if (this.generationRequest.steps != undefined){
      localStorage.setItem("cfg", this.generationRequest.guidance_scale.toString());
    }
    localStorage.setItem("aspect-ratio", this.aspectRatio.aspectRatio);
  }

  // Load session storage info of changed settings
  loadSettings() {
    if (localStorage.getItem("prompt-input") != null){
      this.generationRequest.prompt = localStorage.getItem("prompt-input")!;
    }
    if (localStorage.getItem("negative-prompt-input") != null){
      this.generationRequest.negative_prompt = localStorage.getItem("negative-prompt-input")!;
    }
    if (localStorage.getItem("custom-denoise") != null){
      this.generationRequest.strength = parseFloat(localStorage.getItem("custom-denoise")!);
    }
    if (localStorage.getItem("seed-input") != null){
      this.generationRequest.seed = parseInt(localStorage.getItem("seed-input")!);
    }
    if (localStorage.getItem("cfg") != null){
      this.generationRequest.guidance_scale = parseInt(localStorage.getItem("cfg")!);
    }
    if (localStorage.getItem("aspect-ratio") != null){
      this.changeAspectRatio(localStorage.getItem("aspect-ratio")!);
      
    }
  }

  // Reset session storage info of changed settings and reset view
  resetSessionStorage(){
    localStorage.removeItem("prompt-input");
    localStorage.removeItem("negative-prompt-input");
    localStorage.removeItem("custom-denoise");
    localStorage.removeItem("seed-input");
    localStorage.removeItem("cfg");
    localStorage.removeItem("aspect-ratio");
    this.generationRequest.prompt = "";
    this.generationRequest.negative_prompt = this.defaultNegativePrompt;
    this.generationRequest.strength = 0.7;
    this.generationRequest.seed = undefined;
    this.generationRequest.guidance_scale = 7;
    this.changeAspectRatio("square");

    this.loadSettings();

    // reset images
    this.imagesChange.emit([]);
  }

  // Send job to django api and retrieve job id.
  submitJob() {
    // Disable generation button
    this.enableGenerationButton = false;

    // Hide canvas if it exists
    this.showInpaintingCanvas = false;

    // Save settings to session storage
    this.saveSettings();
    this.inpaintingChange.emit(this.showInpaintingCanvas);

    // Change seed to random number if default seed is selected
    let defaultSeed: boolean;
    if (this.generationRequest.seed == undefined || this.generationRequest.seed == -1){
      defaultSeed = true;
      this.generationRequest.seed = Math.floor(Math.random() * 100000000);
    }
    else{
      defaultSeed = false;
    }

    // set loading to true and submit job
    this.loadingChange.emit(true);
    this.stableDiffusionService.submitJob(this.generationRequest)
      .subscribe(
        response => {
          console.log(response);  // handle the response

          this.getJob(response.job_id, response.API_IP);
        },
        error => {
          console.error(error);  // handle error
          this.showError();  // show the error modal
          this.imagesChange.emit(this.images);
          this.loadingChange.emit(false);
          this.enableGenerationButton = true;
          this.generationRequest.mask_image = undefined;
        }
      );

      // reset seed to default if it was changed
      if (defaultSeed){
        this.generationRequest.seed = undefined;
      }
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
  interval(6000)
    .pipe(
      // For each tick of the interval, call the service
      concatMap(() => this.stableDiffusionService.getJob(getJobInfo).pipe(
        retryWhen(errors =>
          errors.pipe(
            // use the scan operator to track the number of attempts
            scan((retryCount, err) => {
              // if retryCount reaches 3 or error status is not 500, throw error
              if (retryCount >= 3 || err.status !== 500) {
                throw err;
              }
              console.log("retrying... Attempt #" + (retryCount + 1) + " of 3");
              return retryCount + 1;
            }, 0),
            // delay retrying the request for 3 seconds
            delayWhen(() => timer(3000))
          )
        )
      )),
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
          this.enableGenerationButton = true;
        }
      })
    )
    .subscribe(
      response => {
        // This will be called every 3 seconds, so we do nothing here
        console.log("queue position: " + response.queue_position);
        this.queuePositionChange.emit(response.queue_position);
      },
      error =>{
        console.error(error)
        this.showError();  // show the error modal
        this.enableGenerationButton = true;
      } 
    );
}


  enableInpaintCanvas() {
    this.showInpaintingCanvas = !this.showInpaintingCanvas;
    this.inpaintingChange.emit(this.showInpaintingCanvas);
  }

  showError() {
    this.messageService.add({
      severity:'error', 
      summary:'Error Message', 
      detail:'There was an error attempting to generate your image. Website is likely down. Please try again later or check the Discord server for updates. https://discord.com/invite/RXbJUaFh',
      life: 500000  // Here is the addition.
    });
  }
}
