# Document generation page: Mission Control design

Angular 22 + Tailwind CSS 4. The user uploads a PDF, accepts a disclaimer, watches the status
arrive over server-sent events, and downloads the `.docx` draft.

Dark HUD look: cyan on navy, a radial status ring with a radar sweep, corner brackets and a live event stream list.

## Run it

Needs Node.js 22.22.3+, 24.15+ or 26+ (the Angular 22 CLI refuses older versions).

```bash
npm install
npm run mock     # terminal 1: mock backend on http://localhost:8080
npm start        # terminal 2: the app on http://localhost:4200
```

`npm start` proxies `/api` to the mock backend (`proxy.conf.json`). The mock walks through
Queued → Processing → Retrying → Processing → Draft ready in about 12 seconds.
Upload a file with `fail` in its name to see the Failed state.

## What the page does

| Requirement | Where |
| --- | --- |
| Instructions popup on page load, and from the **How it works** button | `docgen/instructions-dialog.*`, `DocgenStore.instructionsOpen` |
| Disclaimer popup when the user selects **Generate document** | `docgen/disclaimer-dialog.*` |
| The file is only sent after the user ticks the box and accepts | `DocgenStore.acceptDisclaimer()` is the only caller of the API |
| Status from the backend over SSE, read with `fetchEventSource` | `core/docgen-api.ts` |
| Queued, Processing, Retrying, Draft ready, Failed | `docgen/status-panel.*` |
| **Download .docx** button once the status is Draft ready | `docgen/status-panel.html`, `DocgenStore.download()` |
| Short disclaimer always visible on the page | `docgen/upload-panel.html` |

## Connect your backend

All endpoints are set in `src/app/app.config.ts` through `provideDocgen({...})`.
Every option is documented in `src/app/core/docgen.config.ts`.

```ts
provideDocgen({
  mode: 'upload-then-stream',
  uploadUrl: '/api/documents',
  streamUrl: (jobId) => `/api/documents/${jobId}/events`,
  downloadUrl: (jobId) => `/api/documents/${jobId}/download`,
  fileField: 'file',
  maxFileSizeMb: 25,
  streamHeaders: () => ({ Authorization: `Bearer ${token}` }),
});
```

Two backend shapes are supported:

- **`upload-then-stream`** (default). `POST uploadUrl` with the PDF as multipart field `file`
  returns JSON with `jobId` (or `id`). The page then opens `GET streamUrl(jobId)` as the event stream.
- **`stream-on-upload`**. `POST uploadUrl` with the PDF answers with `text/event-stream` directly
  (a Spring controller that takes the `MultipartFile` and returns the `SseEmitter`).
  The mock backend serves this at `/api/documents/stream`.

Each SSE message can carry the status in any of these forms (`parseStatusEvent` in `core/docgen-api.ts`):

```
data: {"status":"PROCESSING","message":"optional text"}
data: PROCESSING
event: PROCESSING
```

Recognised values: `QUEUED`, `PROCESSING`, `RETRYING`, `DRAFT_READY`, `FAILED`
(plus common aliases such as `READY`, `COMPLETED`, `ERROR`). Anything else is ignored, so heartbeats are safe.

The `.docx` is fetched from `downloadUrl` in the `DRAFT_READY` event if there is one, otherwise from
`downloadUrl(jobId)`. In `stream-on-upload` mode there is no upload response, so an event must carry
`jobId` or `downloadUrl`. The saved file name comes from the `Content-Disposition` header when the
browser can read it (for cross-origin calls, expose it with `Access-Control-Expose-Headers`), otherwise it is
the PDF name with `.docx`.

Upload and download go through Angular's `HttpClient`, so your interceptors apply.
The event stream uses `fetchEventSource`, which does not: pass auth headers with `streamHeaders`.

## Change the wording and the look

- Instructions, disclaimer text and status wording: `src/app/core/docgen.content.ts`.
  **The disclaimer text is a placeholder. Replace it with the wording your legal team approves.**
- Colours, fonts and animations: `src/styles.css` (the variables at the top change the accent and status colours).
- Layout and markup: the templates in `src/app/docgen/`, written with Tailwind utility classes.

## Structure

```
src/app/
  app.config.ts            backend endpoints
  core/                    logic, no styling
    docgen.config.ts       endpoint and limit options
    docgen.content.ts      all user-facing wording
    docgen.models.ts       status and phase types
    docgen-api.ts          upload, fetchEventSource stream, download
    docgen-store.ts        signal state: file, popups, phase, event log, timer
    modal.ts               directive that drives a native <dialog> from a signal
    save-blob.ts           saves the downloaded file
  docgen/                  the UI for this design
    docgen-page.*          page shell and header
    upload-panel.*         drop area, file, Generate button, page disclaimer
    status-panel.*         status display, event log, Download button
    instructions-dialog.*  "How it works" popup
    disclaimer-dialog.*    disclaimer popup with the accept tick box
mock-server.mjs            local stand-in for the backend
```
