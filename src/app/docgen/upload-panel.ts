import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { DocgenStore } from '../core/docgen-store';
import { DISCLAIMER_NOTE } from '../core/docgen.content';

@Component({
  selector: 'app-upload-panel',
  templateUrl: './upload-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class UploadPanel {
  protected readonly store = inject(DocgenStore);
  protected readonly note = DISCLAIMER_NOTE;
  /** True while a file is being dragged over the drop area. */
  protected readonly dragging = signal(false);

  /** Fires for both the file picker and a file dropped on the input. */
  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.store.selectFile(input.files?.[0]);
    // Clear the input so choosing the same file again still fires `change`.
    input.value = '';
    this.dragging.set(false);
  }
}
