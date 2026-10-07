import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { DocgenStore } from '../core/docgen-store';
import { DISCLAIMER_ACCEPT_LABEL, DISCLAIMER_PARAGRAPHS } from '../core/docgen.content';
import { Modal } from '../core/modal';

/**
 * Opens when the user selects Generate. The file is only sent after the box is ticked
 * and "Accept and generate" is pressed (see DocgenStore.acceptDisclaimer).
 */
@Component({
  selector: 'app-disclaimer-dialog',
  imports: [Modal],
  templateUrl: './disclaimer-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisclaimerDialog {
  protected readonly store = inject(DocgenStore);
  protected readonly paragraphs = DISCLAIMER_PARAGRAPHS;
  protected readonly acceptLabel = DISCLAIMER_ACCEPT_LABEL;
  /** The tick box. Starts unticked every time the popup opens. */
  protected readonly accepted = signal(false);

  protected onToggle(event: Event): void {
    this.accepted.set((event.target as HTMLInputElement).checked);
  }

  protected cancel(): void {
    this.accepted.set(false);
    this.store.cancelDisclaimer();
  }

  protected accept(): void {
    if (!this.accepted()) return;
    this.accepted.set(false);
    this.store.acceptDisclaimer();
  }
}
