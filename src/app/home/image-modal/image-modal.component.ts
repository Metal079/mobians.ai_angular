import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GligenService } from 'src/app/gligen.service';
import { SharedService } from 'src/app/shared.service';
import { InpaintingMaskService } from 'src/app/inpainting-mask.service';
import { MobiansImage } from 'src/_shared/mobians-image.interface';
import { GenerationRequest } from 'src/_shared/generation-request.interface';
import { HostListener } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ColorPickerModule } from 'primeng/colorpicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

@Component({
    selector: 'app-image-modal',
    templateUrl: './image-modal.component.html',
    styleUrls: ['./image-modal.component.css'],
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, ColorPickerModule, ToggleSwitchModule]
})
export class ImageModalComponent {
  @ViewChild('imageCanvas') imageCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas') overlayCanvas!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private overlayCtx!: CanvasRenderingContext2D; // add this line near `private ctx!: CanvasRenderingContext2D;`
  private drawing = false;
  private erasing = false;
  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  private subscription: any;
  private inpaintingSubscription: any;
  color = "black";

  showModal = false;
  expandedImageSrc = '';
  superColor: any;
  imageInfo!: MobiansImage;
  colorInpaintMode: boolean = false;
  brushSize: number = 50;
  currentGenerationRequest: GenerationRequest | null = null;
  drawingEnabled: boolean = false;
  tempErase: boolean = false;

  constructor(private gligenService: GligenService
    , private sharedService: SharedService
    , private inpaintingMaskService: InpaintingMaskService) { }

  ngOnInit() {
    this.subscription = this.sharedService.getGenerationRequest().subscribe(value => {
      this.currentGenerationRequest = value;
    });
  }

  ngAfterViewInit() {
    this.initializeCanvas();
  }

  initializeCanvas() {
    // Prevents an initial error on load
    if (!this.imageCanvas || !this.imageCanvas.nativeElement) {
      console.warn('Canvas or its native element is not yet available.');
      return;
    }

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

    // Set the canvas to an existing one if it exists
    const canvasData = this.inpaintingMaskService.getCurrentCanvasData();
    if (canvasData) {
      const image = new Image();
      image.onload = () => {
        this.ctx.drawImage(image, 0, 0);
      };
      image.src = canvasData;
    } else {
      const initialImageData = this.ctx.getImageData(0, 0, this.imageCanvas.nativeElement.width, this.imageCanvas.nativeElement.height);
      this.undoStack.push(initialImageData);
    }
  }

  enableDrawingMode() {
    this.drawingEnabled = true;
    this.imageCanvas.nativeElement.style.pointerEvents = this.drawingEnabled ? 'auto' : 'none';
    this.erasing = false;
  }

  handleStartDrawing(x: number, y: number): void {
    this.drawing = true;
    const rect = this.imageCanvas.nativeElement.getBoundingClientRect();

    if (this.erasing) {
      this.ctx.globalCompositeOperation = 'destination-out';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = this.color;  // Color for drawing
      this.ctx.fillStyle = this.color;  // Color for drawing
    }

    // Draw a circle at the starting point
    const radius = this.ctx.lineWidth / 2;  // you can adjust this
    this.ctx.beginPath();
    this.ctx.arc(x - rect.left, y - rect.top, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.closePath();

    this.ctx.beginPath();
    this.ctx.moveTo(x - rect.left, y - rect.top);
    this.ctx.lineWidth = this.brushSize;
  }

  handleDrawing(x: number, y: number): void {
    this.updateOverlay(x, y);
    if (!this.drawing) return;
    const rect = this.imageCanvas.nativeElement.getBoundingClientRect();
    this.ctx.lineTo(x - rect.left, y - rect.top);
    this.ctx.stroke();
  }

  handleStopDrawing(): void {
    this.drawing = false;
    this.ctx.lineWidth = this.brushSize;  // Resetting the lineWidth, if needed

    if (this.tempErase) {
      this.tempErase = false;
      this.enableDrawingMode();
    }

    // Save the current canvas state before starting the new stroke
    const imageData = this.ctx.getImageData(0, 0, this.imageCanvas.nativeElement.width, this.imageCanvas.nativeElement.height);
    this.undoStack.push(imageData);
    console.log("pushed to undo stack. Size: " + this.undoStack.length.toString())
  }

  onMouseDown(event: MouseEvent): void {
    // Check which button was clicked
    if (event.button === 2 && !this.erasing) {
      // Right click
      this.enableErasingMode();
      this.tempErase = true;
    }

    this.handleStartDrawing(event.clientX, event.clientY);
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
    this.handleStartDrawing(touch.clientX, touch.clientY);
  }

  onTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    this.handleDrawing(touch.clientX, touch.clientY);
  }

  onTouchEnd(): void {
    this.handleStopDrawing();
  }

  openModal(imageSrc: string) {
    const kofiWidget = document.querySelector('[id^="kofi-widget-overlay-"]');
    if (kofiWidget instanceof HTMLElement) { // Check if it's an HTMLElement
      kofiWidget.style.display = 'none';
    }
    
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
    // Add back Ko-fi widget
    const kofiWidget = document.querySelector('[id^="kofi-widget-overlay-"]');
    if (kofiWidget instanceof HTMLElement) { // Check if it's an HTMLElement
      kofiWidget.style.display = 'block';
    }

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

  toggleColorInpaintMode() {
    // Toggle the color_inpaint property of the current generation request
    // If null or undefined, set it to true
    if (this.currentGenerationRequest?.color_inpaint === undefined || this.currentGenerationRequest?.color_inpaint === null) {
      this.currentGenerationRequest!.color_inpaint = true;
    }
    else {
      this.currentGenerationRequest!.color_inpaint = !this.currentGenerationRequest?.color_inpaint;
    }

    // Save the updated generation request to the shared service
    this.sharedService.setGenerationRequest(this.currentGenerationRequest!);
  }

  enableErasingMode() {
    this.erasing = true;
    this.drawingEnabled = false;
  }

  undo(): void {
    if (this.undoStack.length > 1) { // Keep the initial state
      const lastImageData = this.undoStack.pop();
      const previousImageData = this.undoStack[this.undoStack.length - 1]; // Corrected index
      this.ctx.putImageData(previousImageData, 0, 0);

      if (lastImageData) {
        this.redoStack.push(lastImageData);
      }
    }
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    // Determine the direction of the scroll
    const delta = event.deltaY;

    // Update the brush size based on the scroll direction
    if (delta > 0) {
      this.brushSize += 1;  // Increase brush size
    } else {
      this.brushSize -= 1;  // Decrease brush size
    }

    // You can also add constraints to the brush size if needed
    this.brushSize = Math.max(1, Math.min(100, this.brushSize));

    // Finally, update the canvas context's line width
    this.ctx.lineWidth = this.brushSize;
  }
}
