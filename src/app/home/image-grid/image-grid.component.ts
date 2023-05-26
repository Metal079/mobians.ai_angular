import { Component, Input, OnChanges } from '@angular/core';
import { SimpleChanges } from '@angular/core';
import { AspectRatio } from 'src/_shared/aspect-ratio.interface';


@Component({
  selector: 'app-image-grid',
  templateUrl: './image-grid.component.html',
  styleUrls: ['./image-grid.component.css']
})
export class ImageGridComponent {
  showImages: boolean[] = [];

  @Input() images: string[] = [];
  @Input() showLoading: boolean = false;
  @Input() showInstructions: boolean = true;
  @Input() aspectRatio!: AspectRatio;


  ngOnChanges(changes: SimpleChanges) {
    if (changes['images']) {
      this.showImages = this.images.map(() => true);
    }
  }
}
