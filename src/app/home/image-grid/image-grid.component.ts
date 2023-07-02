import { Component, Input, OnChanges, Output, EventEmitter } from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { ReferenceImage } from 'src/_shared/reference-image.interface';


@Component({
  selector: 'app-image-grid',
  templateUrl: './image-grid.component.html',
  styleUrls: ['./image-grid.component.css']
})
export class ImageGridComponent {
  showImages: boolean[] = [];
  referenceImage?: ReferenceImage;

  @Input() images: string[] = [];
  @Input() showLoading: boolean = false;
  @Input() showInstructions: boolean = true;
  @Input() aspectRatio: AspectRatio= {width: 256, height: 512, model: 'test'};

  @Output() referenceImageChange = new EventEmitter<ReferenceImage>();


  ngOnChanges(changes: SimpleChanges) {
    if (changes['images']) {
      this.showImages = this.images.map(() => true);
    }
  }

  allowDrop(event: DragEvent) {
    event.preventDefault();
  }

  // When reference image is dropped, set it as the reference image
  onDrop(event: DragEvent) {
    event.preventDefault();
  
    // Ensure dataTransfer is not null
    if (event.dataTransfer) {
      // Retrieve the file being dragged
      let file = event.dataTransfer.files[0];
  
      if (file) {
        // Create a URL that points to the file
        let url = URL.createObjectURL(file);
  
        // Create new image element to get dimensions
        let img = new Image();
        img.src = url;
  
        img.onload = () => {
          // Calculate the aspect ratio (Square, Portrait, Landscape)
          let tempAspectRatio = img.naturalWidth / img.naturalHeight;
  
          // Set the reference image
          this.referenceImage = {
            url: url,
            width: img.naturalWidth,
            height: img.naturalHeight,
            aspectRatio: tempAspectRatio > 1.2 ? 'landscape' : tempAspectRatio < 0.80 ? 'portrait' : 'square',
            base64: ''
          };
  
          // Turn off the instructions
          this.showInstructions = false;
  
          // Convert the image to base64
          let reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
            let base64Image = reader.result as string;
            // Set the base64 property of the reference image
            this.referenceImage!.base64 = base64Image;
            // Emit the new reference image
            this.referenceImageChange.emit(this.referenceImage);
          }
        }
      }
    }
  }

}
