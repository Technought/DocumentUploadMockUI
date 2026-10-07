import { ChangeDetectionStrategy, Component } from '@angular/core';

import { KEY_FEATURES } from '../core/docgen.content';

/** The strip of key features under the page header. Wording lives in core/docgen.content.ts. */
@Component({
  selector: 'app-key-features',
  templateUrl: './key-features.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class KeyFeatures {
  protected readonly features = KEY_FEATURES;
}
