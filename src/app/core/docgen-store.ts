import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { DocgenApi } from './docgen-api';
import { DOCGEN_CONFIG } from './docgen.config';
import { PHASE_COPY, STATUS_NOTE } from './docgen.content';
import {
  DocgenLogEntry,
  DocgenPhase,
  DocgenStatusEvent,
  PHASE_OF_STATUS,
  RUNNING_PHASES,
} from './docgen.models';
import { responseFileName, saveBlob } from './save-blob';

/**
 * State for the document generation page.
 * Provide it on the page component so every visit starts clean.
 */
@Injectable()
export class DocgenStore {
  private readonly api = inject(DocgenApi);
  private readonly config = inject(DOCGEN_CONFIG);

  private abort: AbortController | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private eventDownloadUrl: string | null = null;
  private eventFileName: string | null = null;

  readonly maxFileSizeMb = this.config.maxFileSizeMb;

  // --- state ---------------------------------------------------------------
  readonly file = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);
  /** The instructions popup opens from the "How it works" button only. */
  readonly instructionsOpen = signal(false);
  /** False until the user has opened the instructions once; the button draws attention until then. */
  readonly instructionsSeen = signal(false);
  readonly disclaimerOpen = signal(false);
  readonly phase = signal<DocgenPhase>('idle');
  readonly events = signal<DocgenLogEntry[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly elapsedMs = signal(0);
  readonly jobId = signal<string | null>(null);
  readonly downloading = signal(false);
  readonly downloadError = signal<string | null>(null);

  // --- derived -------------------------------------------------------------
  readonly isIdle = computed(() => this.phase() === 'idle');
  readonly isRunning = computed(() => RUNNING_PHASES.includes(this.phase()));
  readonly isReady = computed(() => this.phase() === 'ready');
  readonly isFailed = computed(() => this.phase() === 'failed');
  readonly isDone = computed(() => this.isReady() || this.isFailed());

  readonly title = computed(() => PHASE_COPY[this.phase()].title);
  readonly description = computed(
    () => (this.isFailed() && this.errorMessage()) || PHASE_COPY[this.phase()].text,
  );

  readonly fileName = computed(() => this.file()?.name ?? '');
  readonly fileSize = computed(() => formatSize(this.file()?.size ?? 0));
  /** Name the downloaded draft is saved under when the server does not provide one. */
  readonly outputName = computed(() => this.fileName().replace(/\.pdf$/i, '') + '.docx');

  /** Elapsed time since the user accepted the disclaimer, as mm:ss. */
  readonly elapsed = computed(() => {
    const seconds = Math.floor(this.elapsedMs() / 1000);
    return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  });

  /** State of the event stream connection. */
  readonly stream = computed<'idle' | 'live' | 'closed'>(() =>
    this.isRunning() ? 'live' : this.isDone() ? 'closed' : 'idle',
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.abort?.abort();
      this.stopClock();
    });
  }

  // --- instructions --------------------------------------------------------
  openInstructions(): void {
    this.instructionsSeen.set(true);
    this.instructionsOpen.set(true);
  }

  closeInstructions(): void {
    this.instructionsOpen.set(false);
  }

  // --- file ----------------------------------------------------------------
  selectFile(file: File | null | undefined): void {
    if (!file || !this.isIdle()) return;

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      this.fileError.set('That file is not a PDF. Choose a file that ends in .pdf.');
      return;
    }
    if (file.size > this.maxFileSizeMb * 1024 * 1024) {
      this.fileError.set(
        `That PDF is larger than ${this.maxFileSizeMb} MB. Choose a smaller file.`,
      );
      return;
    }
    this.fileError.set(null);
    this.file.set(file);
  }

  clearFile(): void {
    if (!this.isIdle()) return;
    this.file.set(null);
    this.fileError.set(null);
  }

  // --- disclaimer gate -----------------------------------------------------
  /** Generate button (and Try again): opens the disclaimer. Nothing is sent yet. */
  requestGenerate(): void {
    if (!this.file() || this.isRunning()) return;
    this.disclaimerOpen.set(true);
  }

  cancelDisclaimer(): void {
    this.disclaimerOpen.set(false);
  }

  /** The only path that calls the backend: the user accepted the disclaimer. */
  acceptDisclaimer(): void {
    const file = this.file();
    this.disclaimerOpen.set(false);
    if (!file || this.isRunning()) return;
    void this.run(file);
  }

  // --- result --------------------------------------------------------------
  async download(): Promise<void> {
    if (!this.isReady() || this.downloading()) return;

    const jobId = this.jobId();
    const url = this.eventDownloadUrl ?? (jobId ? this.config.downloadUrl(jobId) : null);
    if (!url) {
      this.downloadError.set('The server did not say where the document is. Try generating again.');
      return;
    }

    this.downloading.set(true);
    this.downloadError.set(null);
    try {
      const response = await firstValueFrom(this.api.download(url));
      if (!response.body) throw new Error('Empty response');
      saveBlob(
        response.body,
        responseFileName(response) ?? this.eventFileName ?? this.outputName(),
      );
    } catch {
      this.downloadError.set('The download did not go through. Try again.');
    } finally {
      this.downloading.set(false);
    }
  }

  /** Back to an empty page, ready for another file. */
  reset(): void {
    this.abort?.abort();
    this.stopClock();
    this.phase.set('idle');
    this.file.set(null);
    this.fileError.set(null);
    this.events.set([]);
    this.errorMessage.set(null);
    this.downloadError.set(null);
    this.elapsedMs.set(0);
    this.jobId.set(null);
    this.eventDownloadUrl = null;
    this.eventFileName = null;
  }

  // --- internals -----------------------------------------------------------
  private async run(file: File): Promise<void> {
    this.abort?.abort();
    const abort = (this.abort = new AbortController());

    this.events.set([]);
    this.errorMessage.set(null);
    this.downloadError.set(null);
    this.jobId.set(null);
    this.eventDownloadUrl = null;
    this.eventFileName = null;
    this.phase.set('uploading');
    this.startClock();

    try {
      await this.api.generate(
        file,
        {
          onJob: (jobId) => this.jobId.set(jobId),
          onStatus: (event) => this.apply(event),
        },
        abort.signal,
      );
      // Aborted means reset() was called or a final status already arrived.
      if (abort.signal.aborted) return;
      if (!this.isDone()) {
        this.fail('The connection closed before the document was ready. Try again.');
      }
    } catch (error) {
      if (abort.signal.aborted) return;
      this.fail(describe(error));
    }
  }

  private apply(event: DocgenStatusEvent): void {
    if (this.isDone()) return;

    if (event.downloadUrl) this.eventDownloadUrl = event.downloadUrl;
    if (event.fileName) this.eventFileName = event.fileName;

    this.events.update((list) => [
      ...list,
      { at: new Date(), status: event.status, message: event.message ?? STATUS_NOTE[event.status] },
    ]);
    if (event.status === 'FAILED' && event.message) this.errorMessage.set(event.message);
    this.phase.set(PHASE_OF_STATUS[event.status]);

    if (this.isDone()) {
      this.tick();
      this.stopClock();
      this.abort?.abort();
    }
  }

  private fail(message: string): void {
    this.tick();
    this.stopClock();
    this.errorMessage.set(message);
    this.events.update((list) => [...list, { at: new Date(), status: 'FAILED', message }]);
    this.phase.set('failed');
  }

  private startClock(): void {
    this.stopClock();
    this.startedAt = Date.now();
    this.elapsedMs.set(0);
    this.clock = setInterval(() => this.tick(), 250);
  }

  private tick(): void {
    if (this.startedAt) this.elapsedMs.set(Date.now() - this.startedAt);
  }

  private stopClock(): void {
    if (this.clock !== null) clearInterval(this.clock);
    this.clock = null;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function describe(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0)
      return 'The server could not be reached. Check your connection and try again.';
    if (error.status === 413) return 'The server rejected the PDF because it is too large.';
    return `The upload did not go through (status ${error.status}). Try again.`;
  }
  if (error instanceof TypeError) {
    return 'The connection to the server was lost. Try again.';
  }
  return error instanceof Error && error.message
    ? `${error.message} Try again.`
    : 'Something went wrong. Try again.';
}
