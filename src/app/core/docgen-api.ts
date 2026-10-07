import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EventSourceMessage, fetchEventSource } from '@microsoft/fetch-event-source';
import { Observable, map } from 'rxjs';

import { DOCGEN_CONFIG } from './docgen.config';
import { DocgenJob, DocgenJobsPage, DocgenStatus, DocgenStatusEvent } from './docgen.models';

export interface GenerateHandlers {
  /** Called once the backend has assigned a job id. */
  onJob?: (jobId: string) => void;
  /** Called for every status event on the stream. */
  onStatus: (event: DocgenStatusEvent) => void;
}

/** An error that must not trigger a reconnect (bad response, wrong content type). */
class FatalStreamError extends Error {}

const STATUS_ALIASES: Record<string, DocgenStatus> = {
  QUEUED: 'QUEUED',
  PENDING: 'QUEUED',
  PROCESSING: 'PROCESSING',
  IN_PROGRESS: 'PROCESSING',
  RUNNING: 'PROCESSING',
  RETRYING: 'RETRYING',
  RETRY: 'RETRYING',
  DRAFT_READY: 'DRAFT_READY',
  READY: 'DRAFT_READY',
  COMPLETED: 'DRAFT_READY',
  DONE: 'DRAFT_READY',
  FAILED: 'FAILED',
  ERROR: 'FAILED',
};

function toStatus(value: unknown): DocgenStatus | null {
  if (typeof value !== 'string') return null;
  const key = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return STATUS_ALIASES[key] ?? null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value
    ? value
    : typeof value === 'number'
      ? String(value)
      : undefined;
}

/**
 * Turns one SSE message into a status event. Accepts the common SseEmitter shapes:
 *
 *   data: {"status":"PROCESSING","message":"..."}     JSON with a `status` (or `state`) field
 *   data: PROCESSING                                  plain text
 *   event: PROCESSING                                 status in the event name
 *
 * Messages that carry no known status (heartbeats, comments) return null and are ignored.
 */
export function parseStatusEvent(message: EventSourceMessage): DocgenStatusEvent | null {
  let payload: Record<string, unknown> = {};
  let plain: unknown = message.data;

  if (message.data) {
    try {
      const parsed: unknown = JSON.parse(message.data);
      if (parsed && typeof parsed === 'object') {
        payload = parsed as Record<string, unknown>;
        plain = undefined;
      } else {
        plain = parsed;
      }
    } catch {
      // Not JSON: keep the raw text.
    }
  }

  const status =
    toStatus(payload['status']) ??
    toStatus(payload['state']) ??
    toStatus(plain) ??
    toStatus(message.event);
  if (!status) return null;

  return {
    status,
    message: text(payload['message']),
    jobId: text(payload['jobId'] ?? payload['id']),
    downloadUrl: text(payload['downloadUrl'] ?? payload['url']),
    fileName: text(payload['fileName']),
  };
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function date(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseJob(raw: unknown): DocgenJob | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = text(item['jobId'] ?? item['id']);
  if (!id) return null;
  return {
    id,
    fileName: text(item['fileName'] ?? item['filename'] ?? item['name']) ?? `Job ${id}`,
    status: toStatus(item['status'] ?? item['state']) ?? 'UNKNOWN',
    createdAt: date(item['createdAt'] ?? item['submittedAt'] ?? item['created']),
    message: text(item['message'] ?? item['error']),
    downloadUrl: text(item['downloadUrl'] ?? item['url']),
  };
}

/**
 * Turns the job list response into one page. Accepts:
 *
 *   Spring Data `Page`        {"content":[...],"number":0,"size":5,"totalElements":12,"totalPages":3}
 *   Spring Data `PagedModel`  {"content":[...],"page":{"number":0,"size":5,"totalElements":12,"totalPages":3}}
 *   a bare list               [...] or {"items":[...]}  (Next stays enabled while a page comes back full)
 *
 * Each job needs `jobId` (or `id`) and `status`; `fileName`, `createdAt`, `message` and
 * `downloadUrl` are optional.
 */
export function parseJobsPage(raw: unknown, requestedPage: number, size: number): DocgenJobsPage {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(raw) ? raw : (body['content'] ?? body['items'] ?? body['jobs']);
  const jobs = (Array.isArray(list) ? list : [])
    .map(parseJob)
    .filter((job): job is DocgenJob => job !== null);

  const nested = body['page'];
  const meta = (nested && typeof nested === 'object' ? nested : body) as Record<string, unknown>;
  const page = count(meta['number']) ?? requestedPage;
  const totalJobs = count(meta['totalElements'] ?? meta['total']);
  const totalPages =
    count(meta['totalPages']) ?? (totalJobs === null ? null : Math.ceil(totalJobs / size));

  return {
    jobs,
    page,
    totalPages,
    totalJobs,
    hasPrevious: page > 0,
    hasNext: totalPages === null ? jobs.length >= size : page + 1 < totalPages,
  };
}

@Injectable({ providedIn: 'root' })
export class DocgenApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(DOCGEN_CONFIG);

  /**
   * Sends the PDF and reports status events until the server closes the stream
   * or `signal` is aborted. Rejects if the upload or the stream fails.
   */
  async generate(file: File, handlers: GenerateHandlers, signal: AbortSignal): Promise<void> {
    const body = new FormData();
    body.append(this.config.fileField, file, file.name);

    if (this.config.mode === 'stream-on-upload') {
      // One request: the POST that carries the file is also the event stream.
      await this.openStream(this.config.uploadUrl, { method: 'POST', body }, handlers, signal, 0);
      return;
    }

    // Two requests: upload first, then follow the job's event stream.
    const response = await this.untilAborted(
      this.http.post<Record<string, unknown>>(this.config.uploadUrl, body),
      signal,
    );
    const jobId = text(response?.['jobId'] ?? response?.['id']);
    if (!jobId) {
      throw new Error('The upload response did not include a job id.');
    }
    handlers.onJob?.(jobId);

    await this.openStream(
      this.config.streamUrl(jobId),
      { method: 'GET' },
      handlers,
      signal,
      this.config.streamReconnects,
    );
  }

  /** Fetches one page of earlier jobs. `page` is zero-based. */
  listJobs(page: number): Observable<DocgenJobsPage> {
    const size = this.config.jobsPageSize;
    return this.http
      .get<unknown>(this.config.jobsUrl, { params: { page, size } })
      .pipe(map((raw) => parseJobsPage(raw, page, size)));
  }

  /** Fetches the finished document as a blob, with the response headers. */
  download(url: string): Observable<HttpResponse<Blob>> {
    return this.http.get(url, { responseType: 'blob', observe: 'response' });
  }

  private async openStream(
    url: string,
    request: { method: 'GET' | 'POST'; body?: FormData },
    handlers: GenerateHandlers,
    signal: AbortSignal,
    maxReconnects: number,
  ): Promise<void> {
    let reconnects = 0;

    await fetchEventSource(url, {
      ...request,
      signal,
      // The library adds `accept: text/event-stream` itself.
      headers: { ...this.config.streamHeaders?.() },
      // Keep the stream open when the tab is in the background. The library's default closes it
      // and opens a new request when the tab is shown again, which would upload the file twice.
      openWhenHidden: true,
      async onopen(response) {
        const type = response.headers.get('content-type') ?? '';
        if (response.ok && type.includes('text/event-stream')) {
          reconnects = 0;
          return;
        }
        throw new FatalStreamError(`The server answered with status ${response.status}.`);
      },
      onmessage(message) {
        const event = parseStatusEvent(message);
        if (!event) return;
        if (event.jobId) handlers.onJob?.(event.jobId);
        handlers.onStatus(event);
      },
      onerror(error) {
        // Throwing stops the library's automatic retry; returning a number retries after that delay.
        if (error instanceof FatalStreamError || reconnects >= maxReconnects) throw error;
        reconnects += 1;
        return 1000 * reconnects;
      },
    });
  }

  /** Subscribes to an HttpClient call and cancels it when `signal` aborts. */
  private untilAborted<T>(source: Observable<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const subscription = source.subscribe({ next: resolve, error: reject });
      signal.addEventListener(
        'abort',
        () => {
          subscription.unsubscribe();
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }
}
