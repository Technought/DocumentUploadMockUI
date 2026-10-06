import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

import { provideDocgen } from './core/docgen.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    // Point these at your backend. See src/app/core/docgen.config.ts for every option.
    provideDocgen({
      mode: 'upload-then-stream',
      uploadUrl: '/api/documents',
      maxFileSizeMb: 25,
    }),
  ],
};
