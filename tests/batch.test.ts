import { describe, expect, it, vi } from 'vitest';
import { Batch, NotSentError, countLabels, restoreLabels, type BatchSnapshot } from '../src/batch/batch';

function setup(count: number, printImpl?: (i: number) => Promise<void>) {
  const printed: number[] = [];
  const snapshots: BatchSnapshot[] = [];
  const batch = new Batch<number>('b1', count, {
    render: i => Promise.resolve(i),
    print: async (_img, i) => {
      if (printImpl) await printImpl(i);
      printed.push(i);
    },
    onChange: s => snapshots.push(s),
  });
  return { batch, printed, snapshots };
}

describe('Batch', () => {
  it('prints every label once, in order', async () => {
    const { batch, printed } = setup(5);
    const s = await batch.run();
    expect(printed).toEqual([0, 1, 2, 3, 4]);
    expect(s.status).toBe('done');
    expect(countLabels(s.labels)).toMatchObject({ total: 5, printed: 5, pending: 0 });
  });

  it('counts the label being sent as printing, not as needing a check', async () => {
    const seen: number[] = [];
    const batch = new Batch<number>('b', 2, {
      render: async i => i,
      print: async () => {},
      onChange: s => {
        const c = countLabels(s.labels);
        if (c.printing) seen.push(c.unknown);
      },
    });
    await batch.run();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(u => u === 0)).toBe(true);
  });

  it('handles hundreds of labels', async () => {
    const { batch, printed } = setup(500);
    await batch.run();
    expect(printed).toHaveLength(500);
  });

  it('pauses on a printer refusal and resumes from the failed label without reprinting', async () => {
    let refuse = true;
    const { batch, printed } = setup(4, async i => {
      if (i === 2 && refuse) throw new NotSentError('Label roll is empty');
    });
    const s1 = await batch.run();
    expect(s1.status).toBe('paused');
    expect(s1.labels.map(l => l.state)).toEqual(['printed', 'printed', 'failed', 'pending']);
    expect(s1.message).toContain('Label roll is empty');

    refuse = false;
    const s2 = await batch.run();
    expect(s2.status).toBe('done');
    expect(printed).toEqual([0, 1, 2, 3]);
  });

  it('marks a label unknown on an uncertain error and refuses to continue until the user decides', async () => {
    let fail = true;
    const { batch, printed } = setup(3, async i => {
      if (i === 1 && fail) throw new Error('USB transfer timed out');
    });
    const s = await batch.run();
    expect(s.labels[1]?.state).toBe('unknown');
    expect(batch.firstUnknown).toBe(1);
    expect(batch.canRun()).toBe(false);
    await expect(batch.run()).rejects.toThrow(/unknown/);

    // User checks: it did print. Continue with label 3 only.
    fail = false;
    batch.resolveUnknown(1, true);
    await batch.run();
    expect(printed).toEqual([0, 2]);
    expect(batch.snapshot().status).toBe('done');
  });

  it('reprints an unknown label only when the user says it did not print', async () => {
    let fail = true;
    const { batch, printed } = setup(2, async i => {
      if (i === 0 && fail) throw new Error('Device disconnected');
    });
    await batch.run();
    fail = false;
    batch.resolveUnknown(0, false);
    await batch.run();
    expect(printed).toEqual([0, 1]);
  });

  it('treats render failures as not printed', async () => {
    const batch = new Batch<number>('b', 2, {
      render: async i => {
        if (i === 0) throw new Error('bad page');
        return i;
      },
      print: vi.fn(async () => {}),
    });
    const s = await batch.run();
    expect(s.labels[0]?.state).toBe('failed');
  });

  it('cancels between labels and finishes the label in progress', async () => {
    let batchRef: Batch<number> | undefined;
    const { batch, printed } = setup(5, async i => {
      if (i === 1) batchRef?.cancel();
    });
    batchRef = batch;
    const s = await batch.run();
    expect(s.status).toBe('cancelled');
    expect(printed).toEqual([0, 1]);
    expect(countLabels(s.labels)).toMatchObject({ printed: 2, pending: 3 });
  });

  it('refuses concurrent runs', async () => {
    let open: () => void = () => {};
    const gate = new Promise<void>(r => (open = r));
    const { batch, printed } = setup(2, () => gate);
    const first = batch.run();
    await expect(batch.run()).rejects.toThrow(/already running/);
    open();
    await first;
    expect(printed).toEqual([0, 1]);
  });

  it('restores a label saved mid-print as unknown', () => {
    expect(restoreLabels([{ state: 'printed' }, { state: 'printing' }, { state: 'pending' }]).map(l => l.state)).toEqual([
      'printed',
      'unknown',
      'pending',
    ]);
    const b = new Batch('b', [{ state: 'printed' }, { state: 'printing' }], {
      render: async () => 0,
      print: async () => {},
    });
    expect(b.canRun()).toBe(false);
  });

  it('is done immediately when restored with everything printed', () => {
    const b = new Batch('b', [{ state: 'printed' }], { render: async () => 0, print: async () => {} });
    expect(b.snapshot().status).toBe('done');
  });
});
