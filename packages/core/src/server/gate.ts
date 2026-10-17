import type { AbortHandle, AbortSignalLike } from '../abort.js';

/** Why an answer is not applied. */
export type DropReason = 'superseded' | 'stale-epoch' | 'aborted' | 'destroyed';

/** One request: its number (growing across the gate), the query epoch it was asked in, its channel and key. */
export interface Ticket {
  readonly seq: number;
  readonly epoch: number;
  readonly channel: string;
  readonly key: string;
}

/** Counted when answers are settled, not when requests are aborted: an answer that never comes counts nothing. */
export interface GateDiagnostics {
  readonly begun: number;
  readonly accepted: number;
  readonly dropped: Readonly<Record<DropReason, number>>;
}

/**
 * The one place that decides which server answer counts (invariant 3): on
 * each channel (`rows`, `values:<col>`) only the last request of the current
 * query epoch is applied, whatever order the answers arrive in. A newer
 * request aborts the one it replaces; a new epoch (the query changed) and
 * destroy abort them all. A failure settles like a success: a stale one is
 * dropped, never shown as an error.
 */
export interface RequestGate {
  /** A new request on a channel; the previous one there, if still waiting, is aborted ('superseded'). */
  begin(channel: string, key: string): { readonly ticket: Ticket; readonly signal: AbortSignalLike };
  /** Would this answer be applied now? A question only: nothing is counted. */
  accepts(t: Ticket): DropReason | null;
  /** The verdict for an answer (or a failure) that arrived, counted once; asked again, the same verdict. */
  settle(t: Ticket): DropReason | null;
  /** Aborts the channel's waiting request ('aborted'): a values popup closed. */
  cancel(channel: string): void;
  /** The query changed: every waiting request is stale ('stale-epoch'). */
  newEpoch(): void;
  /** Everything waiting is aborted ('destroyed'), and the gate does nothing more. */
  destroy(): void;
  readonly epoch: number;
  readonly diagnostics: GateDiagnostics;
}

interface Channel {
  seq: number;
  /** The requests cancelled while they were the channel's last: an older one keeps 'superseded'. */
  readonly cancelled: Set<number>;
  handle: AbortHandle | null;
}

const DEAD: AbortSignalLike = Object.freeze({ aborted: true, reason: 'destroyed' });

export function createGate(abort: () => AbortHandle): RequestGate {
  let seq = 0;
  let epoch = 0;
  let destroyed = false;
  let begun = 0;
  let accepted = 0;
  const dropped: Record<DropReason, number> = { superseded: 0, 'stale-epoch': 0, aborted: 0, destroyed: 0 };
  const channels = new Map<string, Channel>();
  const settled = new WeakMap<Ticket, DropReason | null>();

  // The handles taken out first, then aborted: an abort listener that begins again finds a
  // consistent gate, and its new request is never aborted by the loop that woke it.
  const abortAll = (reason: DropReason): void => {
    const live: AbortHandle[] = [];
    for (const ch of channels.values()) {
      if (ch.handle) live.push(ch.handle);
      ch.handle = null;
    }
    let first: { error: unknown } | null = null;
    for (const h of live) {
      try {
        h.abort(reason);
      } catch (error) {
        first ??= { error };
      }
    }
    if (first) throw first.error;
  };

  const accepts = (t: Ticket): DropReason | null => {
    if (destroyed) return 'destroyed';
    if (t.epoch !== epoch) return 'stale-epoch';
    const ch = channels.get(t.channel);
    if (!ch) return 'superseded';
    if (ch.cancelled.has(t.seq)) return 'aborted';
    return t.seq === ch.seq ? null : 'superseded';
  };

  return {
    begin(channel, key) {
      begun++;
      const ticket: Ticket = Object.freeze({ seq: ++seq, epoch, channel, key });
      if (destroyed) return { ticket, signal: DEAD };
      let ch = channels.get(channel);
      if (!ch) channels.set(channel, (ch = { seq: 0, cancelled: new Set(), handle: null }));
      const previous = ch.handle;
      const handle = abort();
      ch.seq = ticket.seq;
      ch.handle = handle;
      previous?.abort('superseded');
      return { ticket, signal: handle.signal };
    },
    accepts,
    settle(t) {
      if (settled.has(t)) return settled.get(t)!;
      const verdict = accepts(t);
      settled.set(t, verdict);
      if (verdict === null) {
        accepted++;
        // Answered: never aborted afterwards.
        channels.get(t.channel)!.handle = null;
      } else dropped[verdict]++;
      return verdict;
    },
    cancel(channel) {
      const ch = channels.get(channel);
      if (destroyed || !ch?.handle) return;
      const h = ch.handle;
      ch.handle = null;
      ch.cancelled.add(ch.seq);
      h.abort('aborted');
    },
    newEpoch() {
      if (destroyed) return;
      epoch++;
      abortAll('stale-epoch');
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        abortAll('destroyed');
      } finally {
        channels.clear();
      }
    },
    get epoch() {
      return epoch;
    },
    get diagnostics() {
      return { begun, accepted, dropped: { ...dropped } };
    },
  };
}
