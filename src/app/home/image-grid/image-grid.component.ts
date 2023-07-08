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
  showReferenceImage: boolean = false;
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
      this.showImages = this.images.map(() => true);
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
      this.showReferenceImage = true;
  
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

  expandImage(event: Event) {
    // Get the target element
    let target = event.target as HTMLElement;

    // hide other images besides the one clicked
    if (target.id == "image0"){
      this.showImages[1] = !this.showImages[1];
      this.showImages[2] = !this.showImages[2];
      this.showImages[3] = !this.showImages[3];
    }
    else if (target.id == "image1"){
      this.showImages[0] = !this.showImages[0];
      this.showImages[2] = !this.showImages[2];
      this.showImages[3] = !this.showImages[3];
    }
    else if (target.id == "image2"){
      this.showImages[0] = !this.showImages[0];
      this.showImages[1] = !this.showImages[1];
      this.showImages[3] = !this.showImages[3];
    }
    else if (target.id == "image3"){
      this.showImages[0] = !this.showImages[0];
      this.showImages[1] = !this.showImages[1];
      this.showImages[2] = !this.showImages[2];
    }
    // Add a CSS class to the clicked image
    this.showReferenceImage = !this.showReferenceImage;
    target.classList.toggle('expanded');

    this.imageExpanded = !this.imageExpanded;
}
}
