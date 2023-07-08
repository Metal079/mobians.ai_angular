import { Component, Input, OnChanges, Output, EventEmitter, HostListener  } from '@angular/core';
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
  imageExpanded: boolean = false;
  screenWidth: number;
  screenHeight: number = window.innerHeight;

  @Input() images: string[] = [];
  @Input() showLoading: boolean = false;
  @Input() showInstructions: boolean = true;
  @Input() aspectRatio!: AspectRatio;

  @Output() referenceImageChange = new EventEmitter<ReferenceImage>();
  @Output() showGenerateWithReferenceImage = new EventEmitter<boolean>();

  constructor() {
    this.screenWidth = window.innerWidth;
    this.getScreenSize();
  }

  @HostListener('window:resize', ['$event'])
  getScreenSize(event?: Event) {
    this.screenWidth = window.innerWidth;
  }

  isMobileView(): boolean {
    return this.screenWidth <= 600;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['images']) {
      // If images were set to null or undefined, reset the showImages array
      if (this.images.length == 0) {
        this.showImages = [];
        this.showInstructions = true;
        this.referenceImage = undefined;
        this.referenceImageChange.emit(this.referenceImage);
        return;
      }
      else{
        // Reset the showImages array and reset reference image
        this.showImages = this.images.map(() => true);
        this.referenceImage = undefined;
      }
    }
    if (changes['aspectRatio']){
      if (this.aspectRatio.aspectRatio == 'square'){
        this.screenHeight = this.screenWidth;
      }
      else if (this.aspectRatio.aspectRatio == 'portrait'){
        this.screenHeight = this.screenWidth * 1.5;
      }
      else if (this.aspectRatio.aspectRatio == 'landscape'){
        this.screenHeight = this.screenWidth * 0.66;
      }
      else{
        console.log("Error: aspect ratio not recognized");
        this.screenHeight = this.screenWidth;
      }
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
        this.processFile(file);
      }
    }
  }

  openFileDialog() {
    document.getElementById('fileInput')?.click();
  }
  
  onFileSelected(event: Event) {
    // The target of this event is an HTMLInputElement, so we need to assert the type
    const target = event.target as HTMLInputElement;
    // The files property is a FileList, which is like an array of files
    let file: File | null = target.files ? target.files[0] : null;
  
    if (file) {
      this.processFile(file);
    }
  }

  processFile(file: File) {
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

  expandImage(base64: string, event: Event) {
    // If a reference image is set, don't expand the image and delete it
    if (this.referenceImage) {
      this.referenceImage = undefined;
      this.referenceImageChange.emit(this.referenceImage);

      // if there are no regular images, show the instructions
      if (this.images.length == 0) {
        this.showInstructions = true;
      }
    }
    else {
      // Create new image element to get dimensions
      let img = new Image();
      img.src = 'data:image/png;base64,' + base64;
    
      img.onload = () => {
        // Calculate the aspect ratio (Square, Portrait, Landscape)
        let tempAspectRatio = img.naturalWidth / img.naturalHeight;
    
        // Set the reference image
        this.referenceImage = {
          url: img.src,
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio: tempAspectRatio > 1.2 ? 'landscape' : tempAspectRatio < 0.80 ? 'portrait' : 'square',
          base64: base64
        };
    
        // Hide images and show reference image
        this.images.forEach(element => {
          
        });
        this.referenceImageChange.emit(this.referenceImage);
        console.log(this.referenceImage);

      }
  }
}



}
