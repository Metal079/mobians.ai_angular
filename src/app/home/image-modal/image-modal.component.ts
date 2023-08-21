import { Component, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-image-modal',
  templateUrl: './image-modal.component.html',
  styleUrls: ['./image-modal.component.css']
})
export class ImageModalComponent {
  @ViewChild('imageCanvas') imageCanvas!: ElementRef<HTMLCanvasElement>;

  showModal = false;
  expandedImageSrc = '';

  openModal(imageSrc: string) {
    this.showModal = true;
    this.expandedImageSrc = imageSrc;
    // Display the expanded image on the canvas and enable drawing
  }

  closeModal() {
    this.showModal = false;
    // Clear the canvas and disable drawing
  }

  onMouseDown(event: MouseEvent) {
    // Start drawing the boundary
  }

  onMouseMove(event: MouseEvent) {
    // Draw the boundary as the user moves the mouse
  }

  onMouseUp() {
    // Finish drawing the boundary and send the coordinates to the parent component
  }
}
