import { Component, ViewChild, ElementRef, Output, EventEmitter } from '@angular/core';
import { GligenService } from 'src/app/gligen.service';


@Component({
  selector: 'app-gligen-display',
  templateUrl: './gligen-display.component.html',
  styleUrls: ['./gligen-display.component.css']
})
export class GligenDisplayComponent {
  @ViewChild('imageCanvas') imageCanvas!: ElementRef<HTMLCanvasElement>;
  @Output() boxDrawn = new EventEmitter<{ x1: number, y1: number, x2: number, y2: number }>();

  private ctx!: CanvasRenderingContext2D;
  private drawing = false;
  private startX = 0;
  private startY = 0;

  drawingEnabled: boolean = false;

  constructor(private gligenService: GligenService) { }

  ngOnInit() {
    this.gligenService.drawingEnabled$.subscribe(
      (enabled) => {
        this.drawingEnabled = enabled;
        if (enabled) {
          // Start drawing
        } else {
          // Stop drawing
        }
      }
    );
  }

  ngAfterViewInit() {
    const context = this.imageCanvas.nativeElement.getContext('2d');
    if (context !== null) {
      this.ctx = context;
    } else {
      throw new Error('Could not get 2D rendering context');
    }
  }

  onMouseDown(e: MouseEvent) {
    this.drawing = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
  }

  onMouseUp() {
    this.gligenService.disableDrawing();
  }

  onMouseMove(e: MouseEvent) {
    if (!this.drawing) return;
    const rect = this.imageCanvas.nativeElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.ctx.beginPath();
    this.ctx.rect(this.startX - rect.left, this.startY - rect.top, x - this.startX, y - this.startY);
    this.ctx.strokeStyle = 'red';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }
}
