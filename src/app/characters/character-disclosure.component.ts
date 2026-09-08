import { Component, ContentChild, EventEmitter, Input, OnChanges, Output, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/** Lazy on first opening; retain form and picker state while gently collapsing. */
@Component({
  selector: 'app-character-disclosure', standalone: true, imports: [NgTemplateOutlet],
  template: `
    <button type="button" class="disclosure-toggle" [disabled]="disabled" (click)="toggle()"
      [attr.aria-expanded]="expanded" [attr.aria-controls]="panelId">
      <span class="disclosure-title"><ng-content select="[disclosure-title]"></ng-content></span>
      <i class="bi bi-chevron-down" [class.expanded]="expanded" aria-hidden="true"></i>
    </button>
    <div class="disclosure-panel" [class.expanded]="expanded" [id]="panelId"
      [attr.inert]="expanded ? null : ''" [attr.aria-hidden]="!expanded">
      <div class="disclosure-inner">
        @if (hasOpened) { <ng-container [ngTemplateOutlet]="content || null"></ng-container> }
      </div>
    </div>`,
  styleUrl: './character-disclosure.component.css',
})
export class CharacterDisclosureComponent implements OnChanges {
  @Input({ required: true }) panelId = '';
  @Input() expanded = false;
  @Input() disabled = false;
  @Output() expandedChange = new EventEmitter<boolean>();
  @ContentChild(TemplateRef) content?: TemplateRef<unknown>;
  hasOpened = false;

  ngOnChanges(): void { this.hasOpened ||= this.expanded; }
  toggle(): void {
    if (this.disabled) return;
    this.expanded = !this.expanded;
    this.hasOpened ||= this.expanded;
    this.expandedChange.emit(this.expanded);
  }
}
