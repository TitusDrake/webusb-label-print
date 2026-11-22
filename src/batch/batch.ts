/**
 * Per-label print state machine. Pure — rendering and printing are injected so this can be
 * tested without a printer or PDF.
 *
 * Rules:
 * - Labels print strictly in order, one at a time.
 * - Any error pauses the batch. Nothing is ever retried automatically.
 * - A label whose fate is uncertain becomes `unknown`; the batch cannot resume until the user
 *   says whether it printed. This is what prevents accidental duplicates.
 * - Cancel takes effect between labels.
 */

export type LabelState = 'pending' | 'printing' | 'printed' | 'failed' | 'unknown';
export type BatchStatus = 'ready' | 'running' | 'paused' | 'cancelled' | 'done';

export interface LabelRecord {
  state: LabelState;
  error?: string;
}

export interface BatchSnapshot {
  id: string;
  status: BatchStatus;
  labels: LabelRecord[];
  message?: string;
}

/** Thrown by the print function when the printer refused the label before receiving it. */
export class NotSentError extends Error {
  override name = 'NotSentError';
}

export interface BatchDeps<Image> {
  render(index: number): Promise<Image>;
  /** Throw `NotSentError` if nothing reached the printer; any other error is treated as uncertain. */
  print(image: Image, index: number): Promise<void>;
  onChange?(snapshot: BatchSnapshot): void;
}

export interface BatchCounts {
  total: number;
  printed: number;
  /** The label currently being sent (0 or 1). */
  printing: number;
  pending: number;
  failed: number;
  unknown: number;
}

export function countLabels(labels: readonly LabelRecord[]): BatchCounts {
  const counts: BatchCounts = { total: labels.length, printed: 0, printing: 0, pending: 0, failed: 0, unknown: 0 };
  for (const l of labels) counts[l.state]++;
  return counts;
}

/**
 * Restore a saved batch. A label saved mid-print (`printing`) is `unknown` — the window may have
 * closed after the printer received it.
 */
export function restoreLabels(saved: readonly LabelRecord[]): LabelRecord[] {
  return saved.map(l => (l.state === 'printing' ? { state: 'unknown', error: 'Window closed while printing' } : { ...l }));
}

export class Batch<Image> {
  readonly id: string;
  private labels: LabelRecord[];
  private status: BatchStatus;
  private message: string | undefined;
  private cancelRequested = false;
  private readonly deps: BatchDeps<Image>;

  constructor(id: string, labelsOrCount: number | readonly LabelRecord[], deps: BatchDeps<Image>) {
    this.id = id;
    this.deps = deps;
    this.labels =
      typeof labelsOrCount === 'number'
        ? Array.from({ length: labelsOrCount }, () => ({ state: 'pending' as const }))
        : restoreLabels(labelsOrCount);
    this.status = this.hasWorkLeft() ? 'ready' : 'done';
  }

  snapshot(): BatchSnapshot {
    return {
      id: this.id,
      status: this.status,
      labels: this.labels.map(l => ({ ...l })),
      ...(this.message ? { message: this.message } : {}),
    };
  }

  get counts(): BatchCounts {
    return countLabels(this.labels);
  }

  /** Index of the first label needing a decision from the user, if any. */
  get firstUnknown(): number | undefined {
    const i = this.labels.findIndex(l => l.state === 'unknown');
    return i === -1 ? undefined : i;
  }

  canRun(): boolean {
    return this.status !== 'running' && this.firstUnknown === undefined && this.hasWorkLeft();
  }

  /** Print every pending/failed label in order until done, cancelled, or an error pauses the batch. */
  async run(): Promise<BatchSnapshot> {
    if (this.status === 'running') throw new Error('Batch is already running');
    if (this.firstUnknown !== undefined) {
      throw new Error('Resolve labels with unknown status before continuing');
    }
    this.cancelRequested = false;
    this.message = undefined;
    // Failed labels never reached the printer, so they are safe to try again on an explicit resume.
    for (const l of this.labels) {
      if (l.state === 'failed') {
        l.state = 'pending';
        delete l.error;
      }
    }
    this.setStatus('running');

    for (let i = 0; i < this.labels.length; i++) {
      const label = this.labels[i]!;
      if (label.state !== 'pending') continue;
      if (this.cancelRequested) {
        this.message = 'Printing stopped.';
        this.setStatus('cancelled');
        return this.snapshot();
      }

      let image: Image;
      try {
        image = await this.deps.render(i);
      } catch (err) {
        return this.pause(i, 'failed', `Could not prepare label ${i + 1}: ${errorText(err)}`);
      }

      label.state = 'printing';
      this.emit();
      try {
        await this.deps.print(image, i);
      } catch (err) {
        if (err instanceof NotSentError) {
          return this.pause(i, 'failed', `Label ${i + 1} was not printed: ${err.message}`);
        }
        return this.pause(
          i,
          'unknown',
          `Label ${i + 1} may or may not have printed: ${errorText(err)}`,
        );
      }
      label.state = 'printed';
      this.emit();
    }

    this.setStatus('done');
    return this.snapshot();
  }

  /** Stop after the label currently printing. */
  cancel(): void {
    if (this.status === 'running') this.cancelRequested = true;
  }

  /** User's answer for an `unknown` label after checking the printer. */
  resolveUnknown(index: number, printed: boolean): void {
    const label = this.labels[index];
    if (!label || label.state !== 'unknown') throw new Error(`Label ${index + 1} is not awaiting a decision`);
    label.state = printed ? 'printed' : 'pending';
    delete label.error;
    if (this.status !== 'running') this.status = this.hasWorkLeft() ? 'paused' : 'done';
    this.emit();
  }

  private pause(index: number, state: 'failed' | 'unknown', message: string): BatchSnapshot {
    const label = this.labels[index]!;
    label.state = state;
    label.error = message;
    this.message = message;
    this.setStatus('paused');
    return this.snapshot();
  }

  private hasWorkLeft(): boolean {
    return this.labels.some(l => l.state !== 'printed');
  }

  private setStatus(status: BatchStatus): void {
    this.status = status;
    this.emit();
  }

  private emit(): void {
    this.deps.onChange?.(this.snapshot());
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
