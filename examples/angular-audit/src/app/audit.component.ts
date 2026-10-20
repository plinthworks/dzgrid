/**
 * The audit screen (perf/audit-screen.ts, step 18) as an Angular application writes it (step 23,
 * docs/behaviors/angular-example.md): `<dz-grid>` over a server model (`sourceRows` and
 * `fromObservable`, an HTTP-like API over the copied fake server), filters, the quick search
 * (`dzgSearch`), pagination, the CSV export (`dzgExport`), and an Angular cell that `emit`s.
 * French by default, Arabic right to left with `?lang=ar`. Motion (step 26) is loaded after the
 * grid is made, outside Angular's zone, so its first load holds none of it (K.8).
 */
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, NgZone, inject, input, viewChild, type AfterViewInit, type DoCheck } from '@angular/core';
import { Observable } from 'rxjs';
import { booleanCodecWith, type ColumnDef, type Problem } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataResponse, type ValuesRequest, type ValuesResponse } from '@dzgrid/core/server';
import type { FeatureHandle, GridFeature, GridMessages } from '@dzgrid/dom';
import { filters } from '@dzgrid/dom/filters';
import { quickSearch } from '@dzgrid/dom/search';
import { pagination } from '@dzgrid/dom/pagination';
import { csvExport } from '@dzgrid/dom/export';
import { FR } from '@dzgrid/dom/locales/fr';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
import { FR_EXPORT } from '@dzgrid/dom/locales/fr-export';
import { AR } from '@dzgrid/dom/locales/ar';
import { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
import { AR_PAGINATION } from '@dzgrid/dom/locales/ar-pagination';
import { AR_EXPORT } from '@dzgrid/dom/locales/ar-export';
import { DzGrid, DzgController, DzgExport, DzgSearch, componentPart, fromObservable, type DzgPartContext } from '@dzgrid/angular';
import { ACTIONS, createFakeServer, type AuditRow, type ExportAsk } from './fake-server';
import { AUDIT_LANG } from './lang';
import { AUDIT_PROBE } from './probe';

const ZONE = 'Africa/Algiers';

const WORDS = {
  fr: {
    title: "Journal d'audit", grid: "Journal d'audit", search: 'Rechercher dans le journal', export: 'Exporter en CSV', opened: 'Fiches ouvertes',
    occurredAt: 'Date et heure', day: 'Jour', actor: 'Acteur', action: 'Action', resource: 'Ressource', outcome: 'Réussi', durationMs: 'Durée (ms)', yes: 'Oui', no: 'Non',
    actions: ['Connexion', 'Déconnexion', 'Lecture', 'Création', 'Modification', 'Suppression', 'Export', 'Impression', 'Partage', 'Signature', 'Validation', 'Refus'],
  },
  ar: {
    title: 'سجل التدقيق', grid: 'سجل التدقيق', search: 'البحث في السجل', export: 'تصدير CSV', opened: 'الملفات المفتوحة',
    occurredAt: 'التاريخ والوقت', day: 'اليوم', actor: 'الفاعل', action: 'الإجراء', resource: 'المورد', outcome: 'نجح', durationMs: 'المدة (ملي ثانية)', yes: 'نعم', no: 'لا',
    actions: ['تسجيل الدخول', 'تسجيل الخروج', 'قراءة', 'إنشاء', 'تعديل', 'حذف', 'تصدير', 'طباعة', 'مشاركة', 'توقيع', 'موافقة', 'رفض'],
  },
} as const;

const MESSAGES: Record<'fr' | 'ar', GridMessages> = {
  fr: { locale: FR.locale, text: { ...FR.text, ...FR_FILTERS.text, ...FR_PAGINATION.text, ...FR_EXPORT.text } as GridMessages['text'] },
  ar: { locale: AR.locale, text: { ...AR.text, ...AR_FILTERS.text, ...AR_PAGINATION.text, ...AR_EXPORT.text } as GridMessages['text'] },
};

/** The actor, as a button: pressing it asks the application to open that actor's record. */
@Component({
  selector: 'audit-actor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="audit-actor" (click)="cell().emit('open', cell().text)">{{ cell().text }}</button>`,
})
export class ActorCell {
  readonly cell = input.required<DzgPartContext<'cell'>>();
}

/** An HTTP-like call: cold, cancelled on unsubscribe (as `HttpClient` is), answered by the fake server. */
function call<R>(run: (signal: AbortSignal) => Promise<R>): Observable<R> {
  return new Observable<R>((sub) => {
    const ac = new AbortController();
    run(ac.signal).then((v) => (sub.next(v), sub.complete()), (e) => sub.error(e));
    return () => ac.abort();
  });
}

/**
 * Motion (`@dzgrid/dom/motion-gsap`, docs/behaviors/motion.md) without a byte in the first load: its
 * entry imported once the grid is made, outside Angular's zone (its GSAP ticker then never runs
 * change detection); the feature it makes takes over from this one. Its own chunk and GSAP come at
 * idle after the first rows.
 */
function motionLater(zone: NgZone): GridFeature {
  return {
    id: 'motion-later',
    setup(g) {
      let h: FeatureHandle | null = null;
      let gone = false;
      zone.runOutsideAngular(() => import('@dzgrid/dom/motion-gsap').then(({ motion }) => void (gone || (h = motion().setup(g)))));
      return {
        beforeRows: () => h?.beforeRows?.(),
        afterRows: (f) => h?.afterRows?.(f),
        destroy: () => void ((gone = true), h?.destroy()),
      };
    },
  };
}

@Component({
  selector: 'audit-root',
  imports: [DzGrid, DzgSearch, DzgExport],
  template: `
    <main class="audit">
      <h1>{{ w.title }}</h1>
      <div class="bar">
        <input type="search" [attr.aria-label]="w.search" [placeholder]="w.search" [dzgSearch]="search" />
        <button type="button" class="audit-export" [dzgExport]="exporter" dzgExportScope="all">{{ w.export }}</button>
        <p class="audit-opened">{{ w.opened }}&nbsp;: <output class="audit-count">{{ opened }}</output> <span class="audit-last">{{ last }}</span></p>
      </div>
      <div class="audit-grid">
        <dz-grid [source]="source" [columns]="columns" [getRowId]="id" operations="server" [pagination]="paging" [selection]="selection"
          [features]="features" [parts]="parts" [messages]="messages" [locale]="locale" [timeZone]="zone" [direction]="dir" [label]="w.grid"
          (cellAction)="open($event.detail)" (problems)="noteProblems($event)" (gridReady)="ready()" />
      </div>
    </main>`,
})
export class AuditScreen implements DoCheck, AfterViewInit {
  private readonly probe = inject(AUDIT_PROBE, { optional: true });
  readonly lang = inject(AUDIT_LANG);
  readonly w = WORDS[this.lang];
  readonly dir = this.lang === 'ar' ? ('rtl' as const) : ('ltr' as const);
  readonly locale = this.lang === 'ar' ? 'ar-DZ' : 'fr-FR';
  readonly zone = ZONE;
  readonly messages = MESSAGES[this.lang];
  private readonly controller = viewChild(DzGrid, { read: DzgController });

  private readonly server = createFakeServer({ universe: 10_000_000, total: true, mode: 'timers', latency: 120, jitter: 60, seed: 7 });
  readonly source = sourceRows(
    fromObservable<AuditRow>(
      (req: DataRequest) => call<DataResponse<AuditRow>>((signal) => Promise.resolve(this.server.source.fetch({ ...req, signal }))),
      (req: ValuesRequest) => call<ValuesResponse>((signal) => Promise.resolve(this.server.source.values!({ ...req, signal }))),
    ),
    { paging: 'offset', maxRows: 100_000 },
  );
  readonly columns: ColumnDef<AuditRow, any>[] = [
    { id: 'occurredAt', header: this.w.occurredAt, type: 'instant', width: 190 },
    { id: 'day', header: this.w.day, type: 'day', width: 120, sortable: false },
    { id: 'actor', header: this.w.actor, width: 180, sortable: false, ui: { cell: 'actor' } },
    { id: 'action', header: this.w.action, type: 'enum', width: 150, sortable: false, enumOptions: ACTIONS.map((value, i) => ({ value, label: this.w.actions[i]! })) },
    { id: 'resource', header: this.w.resource, width: 170, sortable: false, filter: { kind: 'set' } },
    { id: 'outcome', header: this.w.outcome, type: 'boolean', width: 100, sortable: false, codec: booleanCodecWith({ true: this.w.yes, false: this.w.no }) },
    { id: 'durationMs', header: this.w.durationMs, type: 'number', width: 140, sortable: false },
  ];
  readonly id = (r: AuditRow): string => r.id;
  readonly paging = { pageSize: 50, pageSizes: [25, 50, 100] };
  readonly selection = { mode: 'multi' as const, checkbox: true };
  readonly parts = { actor: componentPart('cell', ActorCell) };
  readonly search = quickSearch();
  readonly exporter = csvExport({ canExport: true, exportAll: (req, ctx) => this.server.exportAll(req as unknown as ExportAsk, ctx as { signal: AbortSignal }) });
  readonly features = [filters({ floating: true, popup: true }), this.search, pagination(), this.exporter, motionLater(inject(NgZone))];

  /** A plain field, not a signal: under zone.js only the zone's check shows it (the zone demo). */
  opened = 0;
  last = '';

  constructor() {
    const doc = inject(DOCUMENT);
    doc.documentElement.lang = this.lang;
    doc.documentElement.dir = this.dir;
  }

  ngDoCheck(): void {
    if (this.probe) this.probe.checks++;
  }

  ngAfterViewInit(): void {
    const c = this.controller();
    if (this.probe) {
      this.probe.kernel = c ? c.kernel() : undefined;
      this.probe.ready = c ? c.ready() : undefined;
    }
  }

  open(detail: unknown): void {
    this.opened++;
    this.last = String(detail);
    if (this.probe) {
      this.probe.actions++;
      this.probe.inZone = NgZone.isInAngularZone();
    }
  }

  noteProblems(p: readonly Problem[]): void {
    if (this.probe) this.probe.problems += p.length;
  }

  ready(): void {
    if (this.probe) this.probe.gridReady = true;
  }
}
