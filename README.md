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
Upload a file with `fail` in its name to see the Failed state. It also serves twelve earlier jobs
so the Previous jobs list and its paging have something to show.

The page is a routed, lazy-loaded component at `/documents/generate` (`src/app/app.routes.ts`).
You can also place `<app-docgen-page />` in any template after importing `DocgenPage`.

## What the page does

| Requirement | Where |
| --- | --- |
| Instructions popup from the **How it works** button (not on page load); the button pulses until first opened | `docgen/instructions-dialog.*`, `docgen/docgen-page.html`, `DocgenStore.instructionsSeen` |
| Key features strip with inline SVG icons (no icon package) | `docgen/key-features.*`, wording in `core/docgen.content.ts` |
| Disclaimer popup when the user selects **Generate document** | `docgen/disclaimer-dialog.*` |
| The file is only sent after the user ticks the box and accepts | `DocgenStore.acceptDisclaimer()` is the only caller of the API |
| Status from the backend over SSE, read with `fetchEventSource` | `core/docgen-api.ts` |
| Queued, Processing, Retrying, Draft ready, Failed | `docgen/status-panel.*` |
| **Download .docx** button once the status is Draft ready | `docgen/status-panel.html`, `DocgenStore.download()` |
| Previous jobs, one page at a time, with **Download** or a failed mark per job | `docgen/previous-jobs.*`, `core/docgen-jobs.ts` |
| Note that files are deleted from the server daily | `RETENTION_NOTE` in `core/docgen.content.ts`, shown in the job list and next to Download |
| Short disclaimer always visible on the page | `docgen/upload-panel.html` |
| Light / dark toggle in the header, remembered on the device | `core/docgen-theme.ts`, `docgen/docgen-page.*`, colours in `src/styles.css` |

## Connect your backend

All endpoints are set in `src/app/app.config.ts` through `provideDocgen({...})`.
Every option is documented in `src/app/core/docgen.config.ts`.

```ts
provideDocgen({
  mode: 'upload-then-stream',
  uploadUrl: '/api/documents',
  streamUrl: (jobId) => `/api/documents/${jobId}/events`,
  downloadUrl: (jobId) => `/api/documents/${jobId}/download`,
  jobsUrl: '/api/documents',
  jobsPageSize: 5,
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

### Previous jobs (paged)

The list asks for one page at a time, newest first:

```
GET {jobsUrl}?page=0&size=5        page is zero-based, as in Spring's Pageable
```

`parseJobsPage` in `core/docgen-api.ts` accepts Spring Data's `Page` and `PagedModel` JSON:

```json
{
  "content": [
    { "jobId": "42", "fileName": "contract.pdf", "status": "DRAFT_READY", "createdAt": "2026-10-07T08:15:00Z" },
    { "jobId": "41", "fileName": "scan.pdf", "status": "FAILED", "message": "The PDF could not be converted." }
  ],
  "number": 0,
  "size": 5,
  "totalElements": 12,
  "totalPages": 3
}
```

Each job needs `jobId` (or `id`) and `status`; `fileName`, `createdAt`, `message` and `downloadUrl` are optional.
If the response has no totals (a bare array, or `{ "items": [...] }`), **Next** stays enabled while a page comes back full.
If your parameters are not called `page` and `size`, change them in `DocgenApi.listJobs`.
A job's file is fetched from its `downloadUrl` if present, otherwise from `downloadUrl(jobId)`.
A 404 or 410 on download shows "This file is no longer on the server."
The list reloads when a run on the page finishes, and from the **Refresh** button.

Upload, download and the job list go through Angular's `HttpClient`, so your interceptors apply.
The event stream uses `fetchEventSource`, which does not: pass auth headers with `streamHeaders`.

## Change the wording and the look

- Instructions, key features, retention note, disclaimer text and status wording: `src/app/core/docgen.content.ts`.
  **The disclaimer text is a placeholder. Replace it with the wording your legal team approves.**
- Colours, fonts and animations: `src/styles.css` (the variables in `.docgen` change the accent and status colours;
  the two background layers are `.docgen::before` and `.docgen::after`).
- Light theme: `.docgen[data-theme='light']` in `src/styles.css`. It re-points Tailwind's slate scale inside the
  component, so the templates need no `dark:` variants. The ground is a soft grey-blue rather than white to keep
  glare down; raise `--ground` and `--color-slate-900` if you want it brighter. Dark is the default; change
  `savedMode()` in `core/docgen-theme.ts` to start in light.
- Layout and markup: the templates in `src/app/docgen/`, written with Tailwind utility classes.

## Structure

```
src/app/
  app.config.ts            backend endpoints
  app.routes.ts            route to the page
  core/                    logic, no styling
    docgen.config.ts       endpoint and limit options
    docgen.content.ts      all user-facing wording
    docgen.models.ts       status and phase types
    docgen-api.ts          upload, fetchEventSource stream, download
    docgen-store.ts        signal state: file, popups, phase, event log, timer
    docgen-jobs.ts         signal state for the paged Previous jobs list
    docgen-theme.ts        dark / light choice, saved in localStorage
    modal.ts               directive that drives a native <dialog> from a signal
    save-blob.ts           saves the downloaded file
  docgen/                  the UI for this design
    docgen-page.*          page shell and header
    key-features.*         key features strip with inline icons
    upload-panel.*         drop area, file, Generate button, page disclaimer
    status-panel.*         status display, event log, Download button
    previous-jobs.*        earlier jobs with paging, Download or failed mark
    instructions-dialog.*  "How it works" popup
    disclaimer-dialog.*    disclaimer popup with the accept tick box
mock-server.mjs            local stand-in for the backend
```
