import { Component } from '@angular/core';

import { DocgenPage } from './docgen/docgen-page';

@Component({
  selector: 'app-root',
  imports: [DocgenPage],
  template: `<app-docgen-page />`,
})
export class App {}
