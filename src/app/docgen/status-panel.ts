import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { DocgenStore } from '../core/docgen-store';
import { DocgenPhase, DocgenStatus } from '../core/docgen.models';

type StepKind = 'todo' | 'done' | 'active' | 'warn' | 'ok' | 'error';
type Ring = 'idle' | 'waiting' | 'processing' | 'retrying' | 'ready' | 'failed';

/** Which of the three steps a phase belongs to. */
const STEP_OF_PHASE: Record<DocgenPhase, number> = {
  idle: -1,
  uploading: 0,
  queued: 0,
  processing: 1,
  retrying: 1,
  ready: 2,
  failed: 2,
};

const RING_OF_PHASE: Record<DocgenPhase, Ring> = {
  idle: 'idle',
  uploading: 'waiting',
  queued: 'waiting',
  processing: 'processing',
  retrying: 'retrying',
  ready: 'ready',
  failed: 'failed',
};

const STEP_BAR: Record<StepKind, string> = {
  todo: '',
  done: 'bg-accent',
  active:
    'animate-slide bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] bg-size-[200%_100%]',
  warn: 'animate-slide bg-[linear-gradient(90deg,transparent,var(--warn),transparent)] bg-size-[200%_100%]',
  ok: 'bg-ok',
  error: 'bg-err',
};

const STEP_TEXT: Record<StepKind, string> = {
  todo: 'text-slate-400',
  done: 'text-slate-200',
  active: 'text-accent',
  warn: 'text-warn',
  ok: 'text-ok',
  error: 'text-err',
};

const LOG_COLOR: Record<DocgenStatus, string> = {
  QUEUED: 'text-accent',
  PROCESSING: 'text-accent',
  RETRYING: 'text-warn',
  DRAFT_READY: 'text-ok',
  FAILED: 'text-err',
};

@Component({
  selector: 'app-status-panel',
  imports: [DatePipe],
  templateUrl: './status-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class StatusPanel {
  protected readonly store = inject(DocgenStore);
  protected readonly logColor = LOG_COLOR;

  /** Which ring animation to show. */
  protected readonly ring = computed(() => RING_OF_PHASE[this.store.phase()]);

  /** Label in the middle of the ring. */
  protected readonly code = computed(() =>
    this.store.isIdle() ? 'STANDBY' : this.store.title().toUpperCase(),
  );

  /** Queued -> Processing -> Draft ready. Retrying and Failed relabel the step they replace. */
  protected readonly steps = computed(() => {
    const phase = this.store.phase();
    const current = STEP_OF_PHASE[phase];
    const labels = [
      phase === 'uploading' ? 'Uploading' : 'Queued',
      phase === 'retrying' ? 'Retrying' : 'Processing',
      phase === 'failed' ? 'Failed' : 'Draft ready',
    ];
    return labels.map((label, index) => {
      const kind: StepKind =
        index < current
          ? 'done'
          : index > current
            ? 'todo'
            : phase === 'retrying'
              ? 'warn'
              : phase === 'failed'
                ? 'error'
                : phase === 'ready'
                  ? 'ok'
                  : 'active';
      return { label, bar: STEP_BAR[kind], text: STEP_TEXT[kind] };
    });
  });
}
