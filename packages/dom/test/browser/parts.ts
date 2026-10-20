// The ready cell parts on the browser page (step 20, docs/behaviors/badge-boolean.md), for `parts=1`:
// a "state" badge column whose values cover every tone and a blank, a yes/no column with blanks;
// the parts' texts for the page's language. Rows are made from their index (`r.id`).
import { badge, cellBoolean } from '/packages/dom/src/parts.ts';

type Lang = 'en' | 'fr' | 'ar';
const LABELS: Record<Lang, Record<string, string>> = {
  fr: { done: 'Terminé', info: 'À lire', held: 'En attente', late: 'En retard', open: 'Ouvert' },
  en: { done: 'Done', info: 'To read', held: 'On hold', late: 'Late', open: 'Open' },
  ar: { done: 'منتهٍ', info: 'للقراءة', held: 'معلّق', late: 'متأخر', open: 'مفتوح' },
};
/** Row i: done, info, held, late, open, blank — the five tones and a blank in six rows. */
export const STATES = ['done', 'info', 'held', 'late', 'open', null] as const;

export async function partsSetup(lang: Lang) {
  const texts = (await import(`/packages/dom/src/locales/${lang}-parts.ts`)) as Record<string, { text: object }>;
  const l = LABELS[lang];
  return {
    texts: Object.values(texts)[0]!.text,
    parts: { stateBadge: badge({ tones: { done: 'success', info: 'info', held: 'warning', late: 'danger' } }), 'cell.boolean': cellBoolean },
    columns: [
      {
        id: 'state', header: lang === 'ar' ? 'الحالة' : lang === 'fr' ? 'État' : 'State', type: 'enum' as const, width: 150,
        enumOptions: Object.entries(l).map(([value, label]) => ({ value, label })),
        value: (r: { id: number }) => STATES[r.id % 6], ui: { cell: 'stateBadge' },
      },
      { id: 'seen', header: lang === 'ar' ? 'مُطّلع' : lang === 'fr' ? 'Vu' : 'Seen', type: 'boolean' as const, width: 110, value: (r: { id: number }) => (r.id % 3 === 2 ? null : r.id % 3 === 0) },
    ],
  };
}
