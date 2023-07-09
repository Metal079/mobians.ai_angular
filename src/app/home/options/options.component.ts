import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { ReferenceImage } from 'src/_shared/reference-image.interface';
import { GenerationRequest } from 'src/_shared/generation-request.interface';
import { interval } from 'rxjs';
import { switchMap, takeWhile, finalize, concatMap, tap } from 'rxjs/operators';
import { AfterViewInit } from '@angular/core';
import { SharedService } from 'src/app/shared.service';
import { Subscription } from 'rxjs';


@Component({
  selector: 'app-options',
  templateUrl: './options.component.html',
  styleUrls: ['./options.component.css']
})
export class OptionsComponent {
  private subscription!: Subscription;

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

  @Output() imagesChange  = new EventEmitter<any>();
  @Output() loadingChange  = new EventEmitter<any>();
  @Output() aspectRatioChange  = new EventEmitter<AspectRatio>();
  @Output() inpaintingChange  = new EventEmitter<boolean>();
  @Output() queuePositionChange  = new EventEmitter<number>();

  constructor(
    private stableDiffusionService: StableDiffusionService
    , private sharedService: SharedService
    ) {}

  ngOnInit() {
    this.loadSettings();
    this.subscription = this.sharedService.getPrompt().subscribe(value => {
      this.generationRequest.prompt = value;
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['referenceImage'] && changes['referenceImage'].currentValue != null) {
      this.referenceImage = changes['referenceImage'].currentValue;
      this.generationRequest.image = this.referenceImage!.base64;
      this.onReferenceImageChange(this.referenceImage!.aspectRatio);
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

    // Clear the images array
    // this.images = [];
    // this.imagesChange.emit(this.images);
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
    this.generationRequest.seed = -1;
    this.generationRequest.guidance_scale = 7;
    this.changeAspectRatio("square");

    this.loadSettings();

    // reset images
    this.imagesChange.emit([]);
  }

  // Send job to django api and retrieve job id.
  submitJob() {
    // Save settings to session storage
    this.saveSettings();

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
        }
      ).add(() => {
        if (defaultSeed){
          this.generationRequest.seed = undefined;
        }});
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
          console.log("queue position: " + response.queue_position);
          this.queuePositionChange.emit(response.queue_position);
        },
        error => console.error(error)
      );
  }

  enableInpaintCanvas() {
    this.showInpaintingCanvas = !this.showInpaintingCanvas;
    this.inpaintingChange.emit(this.showInpaintingCanvas);
  }
}
