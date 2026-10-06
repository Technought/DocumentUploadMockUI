import {
  DestroyRef,
  Directive,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * Drives a native <dialog> from a boolean:
 *
 *   <dialog [appModal]="open()" (dismissed)="open.set(false)">…</dialog>
 *
 * The browser provides the focus trap, the top layer and the ::backdrop.
 * `dismissed` fires when the user presses Escape or clicks the backdrop.
 */
@Directive({
  selector: 'dialog[appModal]',
  host: {
    '(cancel)': 'onCancel($event)',
    '(click)': 'onClick($event)',
  },
})
export class Modal {
  readonly appModal = input.required<boolean>();
  readonly dismissed = output<void>();

  private readonly dialog = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;

  constructor() {
    afterRenderEffect(() => {
      const open = this.appModal();
      if (open && !this.dialog.open) this.dialog.showModal();
      if (!open && this.dialog.open) this.dialog.close();
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.dialog.open) this.dialog.close();
    });
  }

  protected onCancel(event: Event): void {
    // Let the owner flip its signal instead of the browser closing the dialog on its own.
    event.preventDefault();
    this.dismissed.emit();
  }

  protected onClick(event: MouseEvent): void {
    if (event.target === this.dialog) this.dismissed.emit();
  }
}
