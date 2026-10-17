import { createGate, type AbortHandle, type Ticket } from '@dzgrid/core/server';
import type { Suite } from './index.js';

type Step =
  | { op: 'begin'; channel: string; key: string; as: string }
  | { op: 'settle' | 'reject'; ticket: string }
  | { op: 'cancel'; channel: string }
  | { op: 'newEpoch' | 'destroy' };

export const server: Record<string, Suite> = {
  /** A script of requests and answers; what each step returns, which requests were aborted and why. */
  'server-gate': ({ steps }: { steps: Step[] }) => {
    const aborted: [string, unknown][] = [];
    let naming = '';
    const gate = createGate((): AbortHandle => {
      const name = naming;
      const signal = { aborted: false, reason: undefined as unknown };
      return { signal, abort: (reason) => { signal.aborted = true; signal.reason = reason; aborted.push([name, reason]); } };
    });
    const tickets = new Map<string, Ticket>();
    const outcomes = steps.map((s) => {
      switch (s.op) {
        case 'begin': {
          naming = s.as;
          const { ticket } = gate.begin(s.channel, s.key);
          tickets.set(s.as, ticket);
          return { seq: ticket.seq, epoch: ticket.epoch };
        }
        case 'settle':
        case 'reject':
          // A failure settles like a success: the gate has no idea of errors, only of which answer counts.
          return gate.settle(tickets.get(s.ticket)!);
        case 'cancel':
          gate.cancel(s.channel);
          return null;
        case 'newEpoch':
          gate.newEpoch();
          return null;
        case 'destroy':
          gate.destroy();
          return null;
      }
    });
    return { outcomes, aborted, diagnostics: gate.diagnostics };
  },
};
