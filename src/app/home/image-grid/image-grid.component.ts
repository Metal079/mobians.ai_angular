import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, ViewChild } from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { v4 as uuidv4 } from 'uuid';
import { SharedService } from 'src/app/shared.service';
import { Subscription } from 'rxjs';
import { InpaintingMaskService } from 'src/app/inpainting-mask.service';


@Component({
  selector: 'app-image-grid',
  templateUrl: './image-grid.component.html',
  styleUrls: ['./image-grid.component.css']
})
export class ImageGridComponent {
  @ViewChild('imageCanvas') imageCanvas!: ElementRef<HTMLCanvasElement>;
  showImages: boolean[] = [];
  imagesIDs: string[] = [];
  imageExpanded: boolean = false;
  screenWidth: number;
  screenHeight: number = window.innerHeight;
  showInstructions: boolean = true;
  images: MobiansImage[] = [];
  prevRefImageBase64?: string;
  showReferenceImage: boolean = false;

  private erasing = false;
  private imageSubscription!: Subscription;
  private referenceImageSubscription!: Subscription;
  private previousImages: MobiansImage[] = [];

  @Input() inpaintingEnabled: boolean = true;
  @Input() showLoading: boolean = false;
  @Input() aspectRatio!: AspectRatio;
  @Input() queuePosition?: number;

  @Output() showGenerateWithReferenceImage = new EventEmitter<boolean>();
  @Output() inpaint_mask = new EventEmitter<string>();
  @Output() imageExpandedChange = new EventEmitter<boolean>();

  constructor(public sharedService: SharedService
    , private inpaintingMaskService: InpaintingMaskService
  ) {
    this.screenWidth = window.innerWidth;
    this.getScreenSize();
  }

  private ctx!: CanvasRenderingContext2D;
  private drawing = false;

  ngOnInit() {
    this.imageSubscription = this.sharedService.getImages().subscribe(images => {
      // Check if all 4 images have changed or modified
      if (images.length === 4 && this.allImagesChanged(images)) {
        // Hide old ref image
        this.showReferenceImage = false;

        // Set the images
        this.images = images;

        // Clear the canvas
        this.inpaintingMaskService.clearCanvasData();

        console.log('All 4 images changed or modified:', images);
      }

      // Update previous images for future comparison
      this.previousImages = images;
    });

    //  Check when the inpainting mask changes
    this.inpaintingMaskService.canvasData$.subscribe(dataUrl => {
      if (dataUrl) {
        // Load the image from the Data URL
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
          // Draw the image onto the canvas
          this.ctx.drawImage(img, 0, 0, this.imageCanvas.nativeElement.width, this.imageCanvas.nativeElement.height);
          const base64Image = this.saveCanvasAsBase64();
          this.inpaint_mask.emit(base64Image);
        };
      }
    });

    // Check when the reference image changes
    this.referenceImageSubscription = this.sharedService.getReferenceImage().subscribe(image => {
      if (image) {
        console.log('Reference Image changed:', image);
        this.showReferenceImage = true;
      }
      else{
        console.log('Reference Image removed');
      }
    });
  }

  private allImagesChanged(newImages: MobiansImage[]): boolean {
    // If the previousImages array is empty, return true
    if (this.previousImages.length === 0) {
      return true;
    }

    // Compare each image in the newImages array with the corresponding image in the previousImages array
    for (let i = 0; i < newImages.length; i++) {
      const newImage = newImages[i];
      const prevImage = this.previousImages[i];

      // Here, you'll need to define how you determine if an image is considered "changed."
      // This could be based on one or more properties, depending on your needs.
      // For example, you might compare the base64 strings:
      if (newImage.base64 == prevImage.base64) {
        return false; // If any image hasn't changed, return false
      }
    }

    return true; // If all images have changed, return true
  }

  ngAfterViewInit() {
    const context = this.imageCanvas.nativeElement.getContext('2d');
    if (context !== null) {
      this.ctx = context;
      this.ctx.lineWidth = 50;
      this.ctx.lineJoin = "round";
      this.ctx.lineCap = "round";

      // Check if parentElement is not null before accessing its properties
      if (this.imageCanvas.nativeElement.parentElement !== null) {
        this.imageCanvas.nativeElement.width = this.aspectRatio.width;
        this.imageCanvas.nativeElement.height = this.aspectRatio.height;
      }

      // Make sure painting is disabled by default
      this.imageCanvas.nativeElement.style.pointerEvents = 'none';

    } else {
      throw new Error('Could not get 2D rendering context');
    }
  }

  toggleDrawingMode() {
    if (this.imageCanvas && this.imageCanvas.nativeElement) {
      // this.inpaintingEnabled = !this.inpaintingEnabled; // Flip the value of this.inpaintingEnabled
      console.log('Inpainting enabled: ' + this.inpaintingEnabled);
      this.imageCanvas.nativeElement.style.pointerEvents = this.inpaintingEnabled ? 'auto' : 'none';
      this.imageCanvas.nativeElement.style.visibility = this.inpaintingEnabled ? 'visible' : 'hidden';
    }
  }

  onMouseDown(e: MouseEvent) {
    if (!this.inpaintingEnabled) return;
    this.drawing = true;
    const rect = this.imageCanvas.nativeElement.getBoundingClientRect();
    this.ctx.beginPath();
    this.ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    this.erasing = e.button === 2; // set erasing to true if right button is pressed
    if (this.erasing) {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.lineWidth = 50; // you might want to adjust this
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.lineWidth = 50; // back to your original line width
    }
  }

  onMouseUp() {
    this.drawing = false;
    this.erasing = false; // reset erasing mode
    this.ctx.globalCompositeOperation = 'source-over'; // reset to normal drawing
    // Save the canvas as base64 image
    const base64Image = this.saveCanvasAsBase64();
    this.inpaint_mask.emit(base64Image);
  }

  onMouseMove(e: MouseEvent) {
    if (!this.inpaintingEnabled || !this.drawing) return;
    const rect = this.imageCanvas.nativeElement.getBoundingClientRect();
    this.ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    this.ctx.stroke();
    if (this.erasing) {
      this.ctx.globalCompositeOperation = 'destination-out';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
    }
  }

  resizeCanvas() {
    if (this.imageCanvas && this.imageCanvas.nativeElement) {
      this.imageCanvas.nativeElement.width = this.aspectRatio.width;
      this.imageCanvas.nativeElement.height = this.aspectRatio.height;

      // Set the styles again after resizing
      this.ctx.lineWidth = 80;
      this.ctx.lineJoin = "round";
      this.ctx.lineCap = "round";
    }
  }

  saveCanvasAsBase64(): string {
    if (this.imageCanvas && this.imageCanvas.nativeElement) {
      return this.imageCanvas.nativeElement.toDataURL();
    }
    throw new Error('Canvas not available');
  }

  @HostListener('window:resize', ['$event'])
  getScreenSize(event?: Event) {
    this.screenWidth = window.innerWidth;
  }

  isMobileView(): boolean {
    return this.screenWidth <= 600;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['aspectRatio']) {
      if (this.aspectRatio.aspectRatio == 'square') {
        this.screenHeight = this.screenWidth;
        this.resizeCanvas();
      }
      else if (this.aspectRatio.aspectRatio == 'portrait') {
        this.screenHeight = this.screenWidth * 1.5;
        this.resizeCanvas();
      }
      else if (this.aspectRatio.aspectRatio == 'landscape') {
        this.screenHeight = this.screenWidth * 0.66;
        this.resizeCanvas();
      }
      else {
        console.log("Error: aspect ratio not recognized");
        this.screenHeight = this.screenWidth;
      }
    }
    // If inpainting status is sent from parent, toggle drawing mode
    if (changes['inpaintingEnabled']) {
      this.toggleDrawingMode();
    }
    // Queue position changed so update the queue position to the emited value
    if (changes['queuePosition']) {
      if (this.queuePosition != undefined) {
        this.queuePosition = changes['queuePosition'].currentValue;
      }
    }
    if (changes['showLoading']) {
      // Clear the canvas
      this.ctx.clearRect(0, 0, this.imageCanvas.nativeElement.width, this.imageCanvas.nativeElement.height);
      this.inpaintingMaskService.clearCanvasData();
    }
    if (changes['referenceImage']) {
      if (this.images.length == 0 && this.sharedService.getReferenceImageValue() == null) {
        this.showInstructions = true;
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
    if (this.showInstructions && !this.showLoading && this.images.length < 1) {
      document.getElementById('fileInput')?.click();
    }
  }

  onFileSelected(event: Event) {
    // The target of this event is an HTMLInputElement, so we need to assert the type
    const target = event.target as HTMLInputElement;
    // The files property is a FileList, which is like an array of files
    let file: File | null = target.files ? target.files[0] : null;

    if (file) {
      this.processFile(file);
    }

    // Reset the value of the file input
    target.value = '';
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
      const referenceImage = {
        url: url,
        width: img.naturalWidth,
        height: img.naturalHeight,
        aspectRatio: tempAspectRatio > 1.2 ? 'landscape' : tempAspectRatio < 0.80 ? 'portrait' : 'square',
        base64: '',
        UUID: uuidv4(),
      };

      // Convert the image to base64 and check if it is the same as the previous reference image if so don't set it
      let reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        let base64Image = reader.result as string;
        if (this.prevRefImageBase64 != base64Image) {
          this.prevRefImageBase64 = base64Image;
          referenceImage.base64 = base64Image;
          // Set the base64 property of the reference image
          this.sharedService.setReferenceImage(referenceImage);
        }
        else {
          console.log("Reference image already exists");
          this.showInstructions = false;
          return;
        }

        // Turn off the instructions
        this.showInstructions = false;

        // Set the aspect ratio
        if (this.aspectRatio.aspectRatio == 'square') {
          this.screenHeight = this.screenWidth;
          this.resizeCanvas();
        }
        else if (this.aspectRatio.aspectRatio == 'portrait') {
          this.screenHeight = this.screenWidth * 1.5;
          this.resizeCanvas();
        }
        else if (this.aspectRatio.aspectRatio == 'landscape') {
          this.screenHeight = this.screenWidth * 0.66;
          this.resizeCanvas();
        }
        else {
          console.log("Error: aspect ratio not recognized");
          this.screenHeight = this.screenWidth;
        }
      }
    }
  }

  expandImage(imageIndex: number, event: Event) {
    // If a reference image is set, don't expand the image and delete it
    if (this.sharedService.getReferenceImageValue()) {
      // if there are no regular images, show the instructions
      if (this.images.length == 0) {
        this.showInstructions = true;
      }
      else{
        this.sharedService.setReferenceImage(null);
        this.showReferenceImage = false;
        this.imageExpandedChange.emit(false);
      }
    }
    else {
      // Create new image element to get dimensions
      let img = new Image();
      const imageInfo = this.sharedService.getImage(imageIndex);
      img.src = 'data:image/png;base64,' + imageInfo!.base64;

      img.onload = () => {
        // Calculate the aspect ratio (Square, Portrait, Landscape)
        let tempAspectRatio = img.naturalWidth / img.naturalHeight;

        // Set the reference image
        const referenceImage = {
          url: img.src,
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio: tempAspectRatio > 1.2 ? 'landscape' : tempAspectRatio < 0.80 ? 'portrait' : 'square',
          base64: imageInfo!.base64,
          UUID: imageInfo!.UUID,
          rating: imageInfo?.rating
        };
        this.sharedService.setReferenceImage(referenceImage);
        this.showReferenceImage = true;
        this.imageExpandedChange.emit(true);
      }
    }
  }
}
