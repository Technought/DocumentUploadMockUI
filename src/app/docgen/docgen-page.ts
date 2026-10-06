import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { DocgenStore } from '../core/docgen-store';
import { DocgenPhase } from '../core/docgen.models';
import { DisclaimerDialog } from './disclaimer-dialog';
import { InstructionsDialog } from './instructions-dialog';
import { StatusPanel } from './status-panel';
import { UploadPanel } from './upload-panel';

/** Sets --tone, the colour of the current status, for everything on the page. */
const TONE: Record<DocgenPhase, string> = {
  idle: '[--tone:#94a3b8]',
  uploading: '[--tone:var(--accent)]',
  queued: '[--tone:var(--accent)]',
  processing: '[--tone:var(--accent)]',
  retrying: '[--tone:var(--warn)]',
  ready: '[--tone:var(--ok)]',
  failed: '[--tone:var(--err)]',
};

@Component({
  selector: 'app-docgen-page',
  imports: [UploadPanel, StatusPanel, InstructionsDialog, DisclaimerDialog],
  providers: [DocgenStore],
  templateUrl: './docgen-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocgenPage {
  protected readonly store = inject(DocgenStore);
  protected readonly tone = computed(() => TONE[this.store.phase()]);
}
