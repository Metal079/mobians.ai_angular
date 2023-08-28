import { Component, ViewChild, ElementRef } from '@angular/core';
import { GligenService } from 'src/app/gligen.service';
import { SharedService } from 'src/app/shared.service';
import { InpaintingMaskService } from 'src/app/inpainting-mask.service';
import { MobiansImage } from 'src/_shared/mobians-image.interface';

@Component({
  selector: 'app-image-modal',
  templateUrl: './image-modal.component.html',
  styleUrls: ['./image-modal.component.css']
})
export class ImageModalComponent {
  @ViewChild('imageCanvas') imageCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas') overlayCanvas!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private overlayCtx!: CanvasRenderingContext2D; // add this line near `private ctx!: CanvasRenderingContext2D;`
  private drawing = false;
  private erasing = false;
  color = "black";

  showModal = false;
  expandedImageSrc = '';
  mobileDevice?: boolean;
  drawingEnabled: boolean = false;
  superColor: any;
  imageInfo!: MobiansImage;
  colorInpaintMode: boolean = false;
  brushSize: number = 50;

  constructor(private gligenService: GligenService
    , private sharedService: SharedService
    , private inpaintingMaskService: InpaintingMaskService) { }

  ngOnInit() {
    if (window.innerWidth < 768) {
      this.mobileDevice = true;
    }
  }

  ngAfterViewChecked() {

  }

  ngAfterViewInit() {
    this.initializeCanvas();
  }

  initializeCanvas() {
    console.log('Initializing canvas');
    const context = this.imageCanvas.nativeElement.getContext('2d');
    if (context !== null) {
      this.ctx = context;
      this.ctx.lineWidth = this.brushSize;
      this.ctx.lineJoin = "round";
      this.ctx.lineCap = "round";

      // Make sure painting is disabled by default
      this.imageCanvas.nativeElement.style.pointerEvents = 'none';

    } else {
      throw new Error('Could not get 2D rendering context');
    }

    const overlayContext = this.overlayCanvas.nativeElement.getContext('2d');
    if (overlayContext !== null) {
      this.overlayCtx = overlayContext;
    } else {
      throw new Error('Could not get 2D rendering context for overlay canvas');
    }
  }

  toggleDrawingMode() {
    this.drawingEnabled = !this.drawingEnabled;
    this.imageCanvas.nativeElement.style.pointerEvents = this.drawingEnabled ? 'auto' : 'none';
  }

  handleStartDrawing(x: number, y: number, isErasing: boolean): void {
    this.drawing = true;
    const rect = this.imageCanvas.nativeElement.getBoundingClientRect();
    this.ctx.beginPath();
    this.ctx.moveTo(x - rect.left, y - rect.top);
    this.erasing = isErasing;
    this.ctx.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over';
    this.ctx.lineWidth = isErasing ? this.brushSize : this.brushSize;
    if (isErasing) {
      this.ctx.strokeStyle = "rgba(0, 0, 0, 0)";  // Transparent for erasing
      this.ctx.fillStyle = "rgba(0, 0, 0, 0)";  // Transparent for erasing
    } else {
      this.ctx.strokeStyle = this.color;  // Color for drawing
      this.ctx.fillStyle = this.color;  // Color for drawing
    }
  }

  handleDrawing(x: number, y: number): void {
    this.updateOverlay(x, y);
    if (!this.drawing) return;
    const rect = this.imageCanvas.nativeElement.getBoundingClientRect();
    this.ctx.lineTo(x - rect.left, y - rect.top);
    this.ctx.stroke();
    if (this.erasing) {
      this.ctx.globalCompositeOperation = 'destination-out';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
    }
  }

  handleStopDrawing(): void {
    this.drawing = false;
    this.erasing = false;
    this.ctx.globalCompositeOperation = 'source-over';  // Resetting the operation
    this.ctx.lineWidth = this.brushSize;  // Resetting the lineWidth, if needed
  }


  onMouseDown(event: MouseEvent): void {
    this.handleStartDrawing(event.clientX, event.clientY, event.button === 2);
  }

  onMouseUp(): void {
    this.handleStopDrawing();
  }

  onMouseMove(event: MouseEvent): void {
    this.handleDrawing(event.clientX, event.clientY);
  }

  updateOverlay(x: number, y: number) {
    console.log("Updating overlay");

    // Clear the entire overlay canvas
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.nativeElement.width, this.overlayCanvas.nativeElement.height);

    const rect = this.overlayCanvas.nativeElement.getBoundingClientRect();

    // Draw the overlay circle
    this.overlayCtx.beginPath();
    this.overlayCtx.arc(x - rect.left, y - rect.top, this.brushSize / 2, 0, 2 * Math.PI, false);
    this.overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Change the color and opacity as needed
    this.overlayCtx.fill();
    this.overlayCtx.closePath();
  }

  onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    this.handleStartDrawing(touch.clientX, touch.clientY, false);
  }

  onTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    this.handleDrawing(touch.clientX, touch.clientY);
  }

  onTouchEnd(): void {
    this.handleStopDrawing();
  }

  openModal(imageSrc: string) {
    // Disable scrolling while the modal is open
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    this.showModal = true;
    this.expandedImageSrc = imageSrc;

    this.imageInfo = this.sharedService.getReferenceImageValue()!;

    // Wait for Angular to update the DOM and actually display the image
    setTimeout(() => {
      const imageElement = document.querySelector('img[src="' + imageSrc + '"]');
      if (imageElement) {
        const imgWidth = imageElement.clientWidth;
        const imgHeight = imageElement.clientHeight;

        // Set canvas dimensions to match the displayed dimensions of the image
        this.imageCanvas.nativeElement.width = imgWidth;
        this.imageCanvas.nativeElement.height = imgHeight;
        this.overlayCanvas.nativeElement.width = imgWidth;
        this.overlayCanvas.nativeElement.height = imgHeight;

        // Initialize canvas for further drawing
        this.initializeCanvas();
      }
    });
  }

  preventContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  closeModal() {
    this.saveCanvas();
    this.showModal = false;
  }

  saveCanvas() {
    const dataUrl = this.imageCanvas.nativeElement.toDataURL();
    this.inpaintingMaskService.setCanvasData(dataUrl);

    // Enable scrolling again by resetting body styles
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';


    // Add the canvas data to the imageInfo object
    // this.imageInfo.

    // Save the canvas data to the shared service
    this.sharedService.setReferenceImage(this.imageInfo);

  }
}
