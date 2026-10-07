import { InjectionToken, Provider } from '@angular/core';

export interface DocgenConfig {
  /**
   * How the backend exposes the event stream.
   *
   * - `upload-then-stream` (default): POST the PDF to `uploadUrl`, read a job id from the
   *   JSON response (`jobId` or `id`), then open the SSE stream with GET on `streamUrl(jobId)`.
   * - `stream-on-upload`: the POST to `uploadUrl` answers with the SSE stream itself
   *   (a Spring controller that takes the MultipartFile and returns the SseEmitter).
   */
  mode: 'upload-then-stream' | 'stream-on-upload';
  /** Endpoint that receives the PDF as multipart/form-data. */
  uploadUrl: string;
  /** SSE endpoint for a job. Only used in `upload-then-stream` mode. */
  streamUrl: (jobId: string) => string;
  /** Where the finished .docx is served. Used when the DRAFT_READY event has no `downloadUrl`. */
  downloadUrl: (jobId: string) => string;
  /** Name of the multipart field that carries the file. */
  fileField: string;
  /** Largest PDF the page accepts, in megabytes. Keep it in line with the backend limit. */
  maxFileSizeMb: number;
  /** How many times to reopen a dropped GET stream before giving up. */
  streamReconnects: number;
  /**
   * Extra headers for the event stream request (for example an Authorization token).
   * fetchEventSource does not go through Angular's HttpClient, so interceptors do not apply to it.
   */
  streamHeaders?: () => Record<string, string>;
}

export const DEFAULT_DOCGEN_CONFIG: DocgenConfig = {
  mode: 'upload-then-stream',
  uploadUrl: '/api/documents',
  streamUrl: (jobId) => `/api/documents/${encodeURIComponent(jobId)}/events`,
  downloadUrl: (jobId) => `/api/documents/${encodeURIComponent(jobId)}/download`,
  fileField: 'file',
  maxFileSizeMb: 25,
  streamReconnects: 3,
};

export const DOCGEN_CONFIG = new InjectionToken<DocgenConfig>('DOCGEN_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_DOCGEN_CONFIG,
});

/** Override any part of the default config in `app.config.ts`. */
export function provideDocgen(overrides: Partial<DocgenConfig> = {}): Provider {
  return { provide: DOCGEN_CONFIG, useValue: { ...DEFAULT_DOCGEN_CONFIG, ...overrides } };
}
