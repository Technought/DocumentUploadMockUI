import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideDocgen } from './core/docgen.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    provideRouter(routes),
    // Point these at your backend. See src/app/core/docgen.config.ts for every option.
    provideDocgen({
      mode: 'upload-then-stream',
      uploadUrl: '/api/documents',
      jobsUrl: '/api/documents',
      jobsPageSize: 5,
      maxFileSizeMb: 25,
    }),
  ],
};
