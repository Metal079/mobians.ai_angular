import { Component, ElementRef, HostListener, Input, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-hint',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hint.component.html',
  styleUrls: ['./hint.component.css']
})
export class HintComponent implements OnDestroy {
  @Input({ required: true }) text = '';
  @Input() position: 'top' | 'bottom' = 'top';
  @Input() variant: 'default' | 'regional' = 'default';

  @ViewChild('popup') popupEl?: ElementRef<HTMLElement>;

  showPopup = false;
  popupStyle: Record<string, string> = {};
  private pinned = false;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private el: ElementRef, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.clearHideTimeout();
  }

  onIconClick(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    if (this.pinned) {
      this.dismiss();
    } else {
      this.clearHideTimeout();
      this.pinned = true;
      this.showPopup = true;
      this.popupStyle = {};
      this.scheduleReposition();
    }
  }

  onMouseEnter(): void {
    if (this.pinned) return;
    this.clearHideTimeout();
    this.showPopup = true;
    this.popupStyle = {};
    this.scheduleReposition();
  }

  onMouseLeave(): void {
    if (this.pinned) return;
    this.hideTimeout = setTimeout(() => {
      this.showPopup = false;
      this.popupStyle = {};
    }, 150);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.pinned) return;
    if (!this.el.nativeElement.contains(event.target)) {
      this.dismiss();
    }
  }

  @HostListener('document:touchstart', ['$event'])
  onDocumentTouch(event: Event): void {
    if (!this.pinned) return;
    if (!this.el.nativeElement.contains(event.target)) {
      this.dismiss();
    }
  }

  private scheduleReposition(): void {
    // Ensure Angular renders the popup before measuring
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      const popup = this.popupEl?.nativeElement;
      const icon = this.el.nativeElement.querySelector('.hint-icon');
      if (!popup || !icon) return;

      const iconRect = icon.getBoundingClientRect();
      const vw = window.innerWidth;

      // Position popup centered above/below the icon using fixed positioning
      const popupWidth = popup.offsetWidth;
      let left = iconRect.left + iconRect.width / 2 - popupWidth / 2;

      // Clamp to viewport edges
      if (left < 8) left = 8;
      if (left + popupWidth > vw - 8) left = vw - 8 - popupWidth;

      const style: Record<string, string> = { left: `${left}px` };

      if (this.position === 'top') {
        style['bottom'] = `${window.innerHeight - iconRect.top + 8}px`;
        style['top'] = 'auto';
      } else {
        style['top'] = `${iconRect.bottom + 8}px`;
        style['bottom'] = 'auto';
      }

      this.popupStyle = style;
      this.cdr.detectChanges();
    });
  }

  private dismiss(): void {
    this.pinned = false;
    this.showPopup = false;
    this.popupStyle = {};
  }

  private clearHideTimeout(): void {
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }
}
