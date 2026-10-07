import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';

import { DocgenApi } from './docgen-api';
import { DocgenStore } from './docgen-store';
import { DOCGEN_CONFIG } from './docgen.config';
import { DocgenJob, DocgenJobsPage } from './docgen.models';
import { responseFileName, saveBlob } from './save-blob';

/**
 * The "Previous jobs" list: one page at a time from the backend.
 * Provide it on the page component next to DocgenStore.
 */
@Injectable()
export class DocgenJobs {
  private readonly api = inject(DocgenApi);
  private readonly config = inject(DOCGEN_CONFIG);
  private readonly store = inject(DocgenStore);

  private request: Subscription | null = null;
  /** The page last asked for (zero-based). */
  private requested = 0;

  // --- state ---------------------------------------------------------------
  /** The page on screen. Stays visible while the next one loads. */
  readonly data = signal<DocgenJobsPage | null>(null);
  readonly loading = signal(false);
  /** True when the last request failed. */
  readonly failed = signal(false);
  /** Id of the job whose file is being downloaded. */
  readonly downloadingId = signal<string | null>(null);
  /** The last download that went wrong, and why. */
  readonly downloadError = signal<{ id: string; message: string } | null>(null);

  // --- derived -------------------------------------------------------------
  readonly jobs = computed(() => this.data()?.jobs ?? []);
  readonly isEmpty = computed(() => this.data() !== null && this.jobs().length === 0);
  readonly hasPrevious = computed(() => this.data()?.hasPrevious ?? false);
  readonly hasNext = computed(() => this.data()?.hasNext ?? false);

  /** "Page 2 of 5", or "Page 2" when the backend reports no totals. */
  readonly pageLabel = computed(() => {
    const data = this.data();
    if (!data) return '';
    const current = data.page + 1;
    return data.totalPages ? `Page ${current} of ${data.totalPages}` : `Page ${current}`;
  });

  /** "12 jobs", or an empty string when the backend reports no total. */
  readonly totalLabel = computed(() => {
    const total = this.data()?.totalJobs;
    return total === null || total === undefined ? '' : `${total} ${total === 1 ? 'job' : 'jobs'}`;
  });

  constructor() {
    this.load(0);

    // When a run on this page finishes, show it at the top of the list.
    effect(() => {
      if (this.store.isDone()) untracked(() => this.load(0));
    });

    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  // --- paging --------------------------------------------------------------
  next(): void {
    const data = this.data();
    if (data?.hasNext && !this.loading()) this.load(data.page + 1);
  }

  previous(): void {
    const data = this.data();
    if (data?.hasPrevious && !this.loading()) this.load(data.page - 1);
  }

  /** Fetches the current page again (the refresh and retry buttons). */
  reload(): void {
    this.load(this.requested);
  }

  // --- download ------------------------------------------------------------
  async download(job: DocgenJob): Promise<void> {
    if (job.status !== 'DRAFT_READY' || this.downloadingId()) return;

    this.downloadingId.set(job.id);
    this.downloadError.set(null);
    try {
      const url = job.downloadUrl ?? this.config.downloadUrl(job.id);
      const response = await firstValueFrom(this.api.download(url));
      if (!response.body) throw new Error('Empty response');
      saveBlob(
        response.body,
        responseFileName(response) ?? job.fileName.replace(/\.pdf$/i, '') + '.docx',
      );
    } catch (error) {
      const gone =
        error instanceof HttpErrorResponse && (error.status === 404 || error.status === 410);
      this.downloadError.set({
        id: job.id,
        message: gone
          ? 'This file is no longer on the server.'
          : 'The download did not go through. Try again.',
      });
    } finally {
      this.downloadingId.set(null);
    }
  }

  // --- internals -----------------------------------------------------------
  private load(page: number): void {
    // A newer request replaces one still in flight, so a slow response cannot overwrite it.
    this.request?.unsubscribe();
    this.requested = page;
    this.loading.set(true);
    this.failed.set(false);

    this.request = this.api.listJobs(page).subscribe({
      next: (data) => {
        // The list can shrink between requests (files are deleted daily): never strand on an empty page.
        if (data.jobs.length === 0 && page > 0) {
          this.load(0);
          return;
        }
        this.data.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }
}
