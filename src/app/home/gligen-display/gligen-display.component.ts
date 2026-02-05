import { Component, ViewChild, ElementRef, Output, EventEmitter } from '@angular/core';
import { GligenService } from 'src/app/gligen.service';
import { SharedService } from 'src/app/shared.service';

@Component({
    selector: 'app-gligen-display',
    templateUrl: './gligen-display.component.html',
    styleUrls: ['./gligen-display.component.css'],
    standalone: true
})
export class GligenDisplayComponent {
  @ViewChild('imageCanvas') imageCanvas!: ElementRef<HTMLCanvasElement>;
  @Output() boxDrawn = new EventEmitter<{ x1: number, y1: number, x2: number, y2: number }>();

  private ctx!: CanvasRenderingContext2D;
  private drawing = false;
  private startX = 0;
  private startY = 0;

  drawingEnabled: boolean = false;
  boundaryBoxes: { x1: number, y1: number, x2: number, y2: number, color: string }[] = [];

  constructor(private gligenService: GligenService
    , private sharedService: SharedService) { }

  ngOnInit() {
    this.gligenService.drawingEnabled$.subscribe(
      (enabled) => {
        this.drawingEnabled = enabled;
        if (enabled) {
          // Start drawing
          console.log("gligen enabled")
          this.startDrawing();
        } else {
          // Stop drawing
          console.log("gligen disabled")
          this.stopDrawing();
        }
      }
    );
  }

  ngAfterViewInit() {
    const referenceImage = this.sharedService.getReferenceImageValue();
    if (referenceImage && this.imageCanvas && this.imageCanvas.nativeElement) {
      const canvas = this.imageCanvas.nativeElement;
      canvas.width = referenceImage.width;
      canvas.height = referenceImage.height;
    }

    const context = this.imageCanvas.nativeElement.getContext('2d');
    if (context !== null) {
      this.ctx = context;
    } else {
      throw new Error('Could not get 2D rendering context');
    }
  }

  startDrawing() {
    // Check if the context is defined
    if (!this.ctx) return;

    // Clear the canvas
    // this.ctx.clearRect(0, 0, this.imageCanvas.nativeElement.width, this.imageCanvas.nativeElement.height);

    // Set the initial drawing position
    this.startX = 0;
    this.startY = 0;
  }

  stopDrawing() {
    // Check if the context is defined
    if (!this.ctx) return;

    // Reset the drawing flag
    this.drawing = false;

    // Clear the canvas
    // this.ctx.clearRect(0, 0, this.imageCanvas.nativeElement.width, this.imageCanvas.nativeElement.height);
  }

  onMouseDown(e: MouseEvent) {
    if (!this.drawingEnabled) return;
    this.drawing = true;
    const rect = this.imageCanvas.nativeElement.getBoundingClientRect();
    this.startX = e.clientX - rect.left;
    this.startY = e.clientY - rect.top;
    this.ctx.beginPath();
  }

  onMouseUp(e: MouseEvent) {
    if (!this.drawing) return;
    this.drawing = false;
    const rect = this.imageCanvas.nativeElement.getBoundingClientRect();
    const x2 = e.clientX - rect.left;
    const y2 = e.clientY - rect.top;
    this.ctx.closePath();
    const relativeX1 = this.startX / this.imageCanvas.nativeElement.width;
    const relativeY1 = this.startY / this.imageCanvas.nativeElement.height;
    const relativeX2 = x2 / this.imageCanvas.nativeElement.width;
    const relativeY2 = y2 / this.imageCanvas.nativeElement.height;
    const boxColor = this.randomColor();
    this.boundaryBoxes.push({ x1: relativeX1, y1: relativeY1, x2: relativeX2, y2: relativeY2, color: boxColor });
  }

  onMouseMove(e: MouseEvent) {
    if (!this.drawing) return;
    const rect = this.imageCanvas.nativeElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Clear the entire canvas
    this.ctx.clearRect(0, 0, this.imageCanvas.nativeElement.width, this.imageCanvas.nativeElement.height);

    // Redraw all previously drawn boxes
    this.redrawAllBoxes();

    // Draw the new rectangle
    this.ctx.beginPath();
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(this.startX, this.startY, x - this.startX, y - this.startY);
    this.ctx.closePath();
  }

  redrawAllBoxes() {
    const canvasWidth = this.imageCanvas.nativeElement.width;
    const canvasHeight = this.imageCanvas.nativeElement.height;

    this.boundaryBoxes.forEach(box => {
      const pixelX1 = box.x1 * canvasWidth;
      const pixelY1 = box.y1 * canvasHeight;
      const pixelX2 = box.x2 * canvasWidth;
      const pixelY2 = box.y2 * canvasHeight;

      this.ctx.beginPath();
      this.ctx.strokeStyle = box.color;
      this.ctx.lineWidth = 4;
      this.ctx.strokeRect(pixelX1, pixelY1, pixelX2 - pixelX1, pixelY2 - pixelY1);
      this.ctx.closePath();
    });
  }


  randomColor(): string {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }
}
