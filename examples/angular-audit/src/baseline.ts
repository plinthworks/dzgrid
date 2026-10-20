/**
 * The baseline (configuration `baseline`, K.8): the same shell — zoneless Angular, a title, a
 * search field, a button, a table of the same rows from the same fake server — without DzGrid.
 * The default build less this one is what DzGrid adds to the first load.
 */
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { Observable } from 'rxjs';
import { zoneless } from './app/compat';
import { createFakeServer, type AuditRow } from './app/fake-server';

/** The same HTTP-like call and fake server as the audit screen, so that only DzGrid differs. */
const server = createFakeServer({ universe: 10_000_000, total: true, mode: 'timers', latency: 120, jitter: 60, seed: 7 });
const page$ = (offset: number, quick: string) => new Observable<readonly AuditRow[]>((sub) => {
  const ac = new AbortController();
  Promise.resolve(server.source.fetch({ key: `p${offset}`, page: { offset, size: 50 }, ...(quick && { quick }), signal: ac.signal } as never))
    .then((r) => (sub.next(r.rows), sub.complete()), (e) => sub.error(e));
  return () => ac.abort();
});

@Component({
  selector: 'audit-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="audit">
      <h1>Journal d'audit</h1>
      <div class="bar">
        <input type="search" aria-label="Rechercher dans le journal" (input)="load(0, $any($event.target).value)" />
        <button type="button" (click)="load(offset + 50, quick)">Suivant</button>
      </div>
      <table>
        <thead><tr><th>Date et heure</th><th>Acteur</th><th>Action</th><th>Ressource</th><th>Durée (ms)</th></tr></thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr><td>{{ r.occurredAt }}</td><td>{{ r.actor }}</td><td>{{ r.action }}</td><td>{{ r.resource }}</td><td>{{ r.durationMs }}</td></tr>
          }
        </tbody>
      </table>
    </main>`,
})
class Baseline {
  readonly rows = signal<readonly AuditRow[]>([]);
  offset = 0;
  quick = '';
  private sub = page$(0, '').subscribe((r) => this.rows.set(r));
  load(offset: number, quick: string): void {
    this.offset = offset;
    this.quick = quick;
    this.sub.unsubscribe();
    this.sub = page$(offset, quick).subscribe((r) => this.rows.set(r));
  }
}

bootstrapApplication(Baseline, { providers: [zoneless()] }).catch((e) => console.error(e));
