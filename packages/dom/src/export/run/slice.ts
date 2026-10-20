/** The clock and the scheduler a build runs on (the window's, or a test's). */
export interface SliceEnv {
  now(): number;
  /** Gives the main thread back (`scheduler.yield()`, a message, a timeout). */
  yield(): Promise<void>;
  aborted(): boolean;
}

/** How long one slice runs before the main thread is given back (ms): a frame's share. */
export const SLICE_MS = 16;

/**
 * Runs `it` to its end in slices of about `SLICE_MS` (at least one chunk each), handing each chunk to
 * `part` and giving the main thread back between slices; `done(k)` after each slice with the chunks so
 * far. Null when found aborted at a yield (nothing more is built); the generator's error rejects.
 */
export async function drain<R>(it: Iterator<string, R>, env: SliceEnv, part: (s: string) => void, done?: (chunks: number) => void): Promise<R | null> {
  let k = 0;
  for (;;) {
    const start = env.now();
    let r: IteratorResult<string, R>;
    do {
      r = it.next();
      if (r.done) {
        done?.(k);
        return r.value;
      }
      part(r.value);
      k++;
    } while (env.now() - start < SLICE_MS);
    done?.(k);
    await env.yield();
    if (env.aborted()) return null;
  }
}

/**
 * The main thread given back: a message (a task, no 4 ms clamp), else a timeout. Not `scheduler.yield()`:
 * its continuations come before rendering, and Chrome showed frames of ~110 ms during a 100 000-row
 * export with it, none over 50 ms with a message (step 19 bench, same wall time).
 */
export const yieldTo = (w: Window | null): (() => Promise<void>) => {
  const win = w as (Window & typeof globalThis) | null;
  return () => new Promise<void>((r) => {
    if (!win?.MessageChannel) return void setTimeout(r, 0);
    const c = new win.MessageChannel();
    c.port1.onmessage = () => (c.port1.close(), r());
    c.port2.postMessage(0);
  });
};

/**
 * The file's text gathered in Blobs of about `max` characters (4 MB by default), so the strings can go
 * as soon as they are copied: the peak is the final Blob and one batch.
 */
export function batcher(max = 4_000_000) {
  const blobs: Blob[] = [];
  let batch: string[] = [];
  let size = 0;
  return {
    get blobs() {
      return blobs.length;
    },
    push(s: string): void {
      batch.push(s);
      if ((size += s.length) > max) {
        blobs.push(new Blob(batch));
        batch = [];
        size = 0;
      }
    },
    blob: (type: string): Blob => new Blob([...blobs, ...batch], { type }),
  };
}
