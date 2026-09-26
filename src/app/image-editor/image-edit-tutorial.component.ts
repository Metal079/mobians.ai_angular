import { ChangeDetectorRef, Component, ElementRef, ViewChild, effect, inject, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ImageEditorService } from './image-editor.service';

@Component({
  selector: 'app-image-edit-tutorial',
  standalone: true,
  imports: [DialogModule],
  templateUrl: './image-edit-tutorial.component.html',
  styleUrls: ['./image-edit-tutorial.component.css'],
})
export class ImageEditTutorialComponent {
  readonly editor = inject(ImageEditorService);
  private readonly cdr = inject(ChangeDetectorRef);
  @ViewChild('pageHeading') private pageHeading?: ElementRef<HTMLElement>;
  readonly page = signal<1 | 2>(1);
  readonly instruction = 'Make it a starry night outside the window. Keep the room warmly lit and keep the character, outfit, pose, and art style the same.';
  readonly referenceInstruction = "Replace the raccoon in image 1 with the rabbit from image 2. Keep image 1's pose, expression, red jacket, yellow scarf, telescope, background, and art style.";

  constructor() {
    effect(() => { if (!this.editor.tutorialVisible()) this.page.set(1); });
  }

  goToPage(page: 1 | 2): void {
    if (!this.editor.tutorialVisible()) return;
    this.page.set(page);
    this.cdr.detectChanges();
    const heading = this.pageHeading?.nativeElement;
    const content = heading?.closest('.p-dialog-content');
    if (content) content.scrollTop = 0;
    heading?.focus({ preventScroll: true });
  }

  returnFocus(): void {
    if (this.editor.tutorialVisible()) return;
    const help = document.querySelector<HTMLButtonElement>('.image-editor-workspace:not([hidden]) .editor-help, .image-editor-dialog .editor-help');
    help?.focus({ preventScroll: true });
  }
}
