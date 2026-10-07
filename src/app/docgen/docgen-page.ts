import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { DocgenJobs } from '../core/docgen-jobs';
import { DocgenStore } from '../core/docgen-store';
import { DocgenTheme } from '../core/docgen-theme';
import { DocgenPhase } from '../core/docgen.models';
import { DisclaimerDialog } from './disclaimer-dialog';
import { InstructionsDialog } from './instructions-dialog';
import { KeyFeatures } from './key-features';
import { PreviousJobs } from './previous-jobs';
import { StatusPanel } from './status-panel';
import { UploadPanel } from './upload-panel';

/** Sets --tone, the colour of the current status, for everything on the page. */
const TONE: Record<DocgenPhase, string> = {
  idle: '[--tone:var(--idle)]',
  uploading: '[--tone:var(--accent)]',
  queued: '[--tone:var(--accent)]',
  processing: '[--tone:var(--accent)]',
  retrying: '[--tone:var(--warn)]',
  ready: '[--tone:var(--ok)]',
  failed: '[--tone:var(--err)]',
};

@Component({
  selector: 'app-docgen-page',
  imports: [
    KeyFeatures,
    UploadPanel,
    StatusPanel,
    PreviousJobs,
    InstructionsDialog,
    DisclaimerDialog,
  ],
  providers: [DocgenStore, DocgenJobs],
  templateUrl: './docgen-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // .docgen (styles.css) carries the theme and animated background; tone() sets the status colour.
  host: { class: 'docgen', '[class]': 'tone()', '[attr.data-theme]': 'theme.mode()' },
})
export class DocgenPage {
  protected readonly store = inject(DocgenStore);
  protected readonly theme = inject(DocgenTheme);
  protected readonly tone = computed(() => TONE[this.store.phase()]);
}
