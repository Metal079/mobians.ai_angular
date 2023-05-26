import { Component, Output, EventEmitter } from '@angular/core';
import { StableDiffusionService } from 'src/app/stable-diffusion.service';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';

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
  prompt: string = "";
  aspectRatio: AspectRatio = {width: 512, height: 512, model: "sonicDiffusionV3_epsilon_cleaned-ep102__512x512x4"};
  negative_prompt: string = "nsfw, worst quality, low quality, watermark, signature, simple background, bad anatomy, bad hands, deformed limbs, blurry, cropped, cross-eyed, extra arms, speech bubble, extra legs, extra limbs, bad proportions, poorly drawn hands, text, flat background";
  seed?: number;
  cfg: number = 7;

  @Output() imagesChange  = new EventEmitter<any>();
  @Output() loadingChange  = new EventEmitter<any>();
  @Output() aspectRatioChange  = new EventEmitter<AspectRatio>();

  constructor(private stableDiffusionService: StableDiffusionService) {
  }

  ngOnInit() {
    this.aspectRatioChange.emit(this.aspectRatio);
  }


  changeAspectRatio(event: any) {
    let selectElement = event.target as HTMLSelectElement;
    if (selectElement.value == 'square') {
      this.aspectRatio = { width: 512, height: 512, model: "sonicDiffusionV3_epsilon_cleaned-ep102__512x512x4" };
    }
    else if (selectElement.value == 'portrait') {
      this.aspectRatio = { width: 512, height: 768, model: "sonicDiffusionV3_epsilon_cleaned-ep102__512x768x4" };
    }
    else if (selectElement.value == 'landscape') {
      this.aspectRatio = { width: 768, height: 512, model: "sonicDiffusionV3_epsilon_cleaned-ep102"};
    }

    // Emit the aspectRatio object itself.
    this.aspectRatioChange.emit(this.aspectRatio);
  }

  txt2img() {
    const data = {
      "data": {
          "prompt": this.prompt,
          "scheduler": 7,
          "steps": 20,
          "negative_prompt": this.negative_prompt,
          "width":  this.aspectRatio.width,
          "height":  this.aspectRatio.height,
          "guidance_scale": this.cfg,
          "seed": this.seed ?? -1,
          "batch_size": 4
        },
        "model": this.aspectRatio.model,
        "save_image": false  // replace with the data you want to send
      }
    this.loadingChange.emit(true);
    this.stableDiffusionService.txt2Img(data)
      .subscribe(
        response => {
          console.log(response);  // handle the response
          this.images = response.images;
          this.imagesChange.emit(this.images);
          this.loadingChange.emit(false);
        },
        error => {
          console.error(error);  // handle error
        }
      );
  }
}
