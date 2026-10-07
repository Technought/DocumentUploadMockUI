import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { DocgenJobs } from '../core/docgen-jobs';
import { RETENTION_NOTE } from '../core/docgen.content';
import { DocgenJob } from '../core/docgen.models';

type JobStatus = DocgenJob['status'];

const STATUS_LABEL: Record<JobStatus, string> = {
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  RETRYING: 'Retrying',
  DRAFT_READY: 'Draft ready',
  FAILED: 'Failed',
  UNKNOWN: 'Unknown',
};

const STATUS_COLOR: Record<JobStatus, string> = {
  QUEUED: 'text-accent',
  PROCESSING: 'text-accent',
  RETRYING: 'text-warn',
  DRAFT_READY: 'text-ok',
  FAILED: 'text-err',
  UNKNOWN: 'text-slate-400',
};

/** Earlier jobs, one page at a time, with a Download button or a failed mark per job. */
@Component({
  selector: 'app-previous-jobs',
  imports: [DatePipe],
  templateUrl: './previous-jobs.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class PreviousJobs {
  protected readonly jobs = inject(DocgenJobs);
  protected readonly retentionNote = RETENTION_NOTE;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusColor = STATUS_COLOR;

  /** Still on the server's to-do list: show a spinner instead of an action. */
  protected isRunning(job: DocgenJob): boolean {
    return job.status === 'QUEUED' || job.status === 'PROCESSING' || job.status === 'RETRYING';
  }
}
