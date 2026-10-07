/** Status values the backend sends over the event stream. */
export type DocgenStatus = 'QUEUED' | 'PROCESSING' | 'RETRYING' | 'DRAFT_READY' | 'FAILED';

/**
 * What the page is showing.
 * `idle` and `uploading` are client-side; the rest mirror the backend statuses.
 */
export type DocgenPhase =
  'idle' | 'uploading' | 'queued' | 'processing' | 'retrying' | 'ready' | 'failed';

/** One status event, after parsing whatever shape the backend sent. */
export interface DocgenStatusEvent {
  status: DocgenStatus;
  /** Optional human-readable note from the backend. */
  message?: string;
  /** Job id, if the event carries one. */
  jobId?: string;
  /** Where to fetch the .docx, if the event carries it. */
  downloadUrl?: string;
  /** File name for the .docx, if the event carries it. */
  fileName?: string;
}

/** A row in the on-page event log. */
export interface DocgenLogEntry {
  at: Date;
  status: DocgenStatus;
  message: string;
}

export const PHASE_OF_STATUS: Record<DocgenStatus, DocgenPhase> = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  RETRYING: 'retrying',
  DRAFT_READY: 'ready',
  FAILED: 'failed',
};

export const RUNNING_PHASES: readonly DocgenPhase[] = [
  'uploading',
  'queued',
  'processing',
  'retrying',
];
