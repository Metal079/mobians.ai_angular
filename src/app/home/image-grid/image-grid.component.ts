import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, ViewChild } from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';
import { ReferenceImage } from 'src/_shared/reference-image.interface';


@Component({
  selector: 'app-image-grid',
  templateUrl: './image-grid.component.html',
  styleUrls: ['./image-grid.component.css']
})
export class ImageGridComponent {
  @ViewChild('imageCanvas') imageCanvas!: ElementRef<HTMLCanvasElement>;
  showImages: boolean[] = [];
  referenceImage?: ReferenceImage;
  imageExpanded: boolean = false;
  screenWidth: number;
  screenHeight: number = window.innerHeight;
  showInstructions: boolean = true;

  private erasing = false;


  @Input() inpaintingEnabled: boolean = false;
  @Input() images: string[] = [];
  @Input() showLoading: boolean = false;
  @Input() aspectRatio!: AspectRatio;
  @Input() queuePosition?: number;

  @Output() referenceImageChange = new EventEmitter<ReferenceImage>();
  @Output() showGenerateWithReferenceImage = new EventEmitter<boolean>();
  @Output() inpaint_mask = new EventEmitter<string>();

  constructor() {
    this.screenWidth = window.innerWidth;
    this.getScreenSize();
  }

  private ctx!: CanvasRenderingContext2D;
  private drawing = false;

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

  // @HostListener('contextmenu', ['$event'])
  // onRightClick(event: MouseEvent) {
  //   event.preventDefault();
  //   this.erasing = true;
  //   // this.onMouseDown(event);
  // }

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
    if (changes['images']) {
      // If images were set to null or undefined, reset the showImages array
      if (this.images.length == 0) {
          this.showImages = [];
          this.showInstructions = true;
          this.referenceImage = undefined;
          this.referenceImageChange.emit(this.referenceImage);

          // Check if this.ctx and this.imageCanvas.nativeElement are defined before clearing the canvas
          if (this.ctx && this.imageCanvas && this.imageCanvas.nativeElement) {
              this.ctx.clearRect(0, 0, this.imageCanvas.nativeElement.width, this.imageCanvas.nativeElement.height);
              // this.inpaintingEnabled = false;
              // this.toggleDrawingMode(); // call this method instead of setting style directly
          }
      }
      else {
          // Reset the showImages array and reset reference image
          this.showImages = this.images.map(() => true);
          this.referenceImage = undefined;
          this.showInstructions = false;
      }
  }
    if (changes['aspectRatio']){
      if (this.aspectRatio.aspectRatio == 'square'){
        this.screenHeight = this.screenWidth;
        this.resizeCanvas();
      }
      else if (this.aspectRatio.aspectRatio == 'portrait'){
        this.screenHeight = this.screenWidth * 1.5;
        this.resizeCanvas();
      }
      else if (this.aspectRatio.aspectRatio == 'landscape'){
        this.screenHeight = this.screenWidth * 0.66;
        this.resizeCanvas();
      }
      else{
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
    if (changes['showLoading']){
      // this.toggleDrawingMode()
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
    if (this.showInstructions && !this.showLoading && this.images.length < 1){
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
    // Dont do anything if theres no images
    //if (this.images.length == 0) return;

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
    
        this.referenceImageChange.emit(this.referenceImage);
      }
  }
}
}
