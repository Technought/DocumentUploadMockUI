import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { DocgenStore } from '../core/docgen-store';
import { instructionSteps } from '../core/docgen.content';
import { Modal } from '../core/modal';

/** Opens on page load and from the "How it works" button. */
@Component({
  selector: 'app-instructions-dialog',
  imports: [Modal],
  templateUrl: './instructions-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstructionsDialog {
  protected readonly store = inject(DocgenStore);
  protected readonly steps = instructionSteps(this.store.maxFileSizeMb);
}
