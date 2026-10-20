// Selection rules on the browser page (step 21, docs/behaviors/selection-rules.md), for `rules=1`: rows 4
// and 8 exclude each other, at most `t.context.max` rows (5), the rule's sentence in the page's language;
// "Nom"'s header holds the page's own search box driving the column's filter (a header part, as an
// application writes it). The features: rules(), slots(), filters({ popup: true }).
import { rules } from '/packages/dom/src/rules.ts';
import { slots } from '/packages/dom/src/slots.ts';
import { filters } from '/packages/dom/src/filters.ts';
import { definePart } from '/packages/dom/src/part.ts';

type Lang = 'en' | 'fr' | 'ar';
const WORDS: Record<Lang, { pair: (a: number) => string; max: (n: number) => string; search: string }> = {
  fr: { pair: (a) => `Non sélectionnable : la ligne ${a} est cochée`, max: (n) => `Non sélectionnable : ${n} lignes au plus`, search: 'Chercher dans' },
  en: { pair: (a) => `Not selectable: row ${a} is ticked`, max: (n) => `Not selectable: ${n} rows at most`, search: 'Search' },
  ar: { pair: (a) => `غير قابل للتحديد: الصف ${a} محدد`, max: (n) => `غير قابل للتحديد: ${n} صفوف على الأكثر`, search: 'البحث في' },
};

export async function rulesSetup(lang: Lang) {
  const [r, f] = await Promise.all([import(`/packages/dom/src/locales/${lang}-rules.ts`), import(`/packages/dom/src/locales/${lang}-filters.ts`)]);
  const w = WORDS[lang];
  const pairs: Record<number, number> = { 4: 8, 8: 4 };
  const canSelect = (row: { data: { id: number } }, s: { keys: ReadonlySet<unknown> }, c: unknown) => {
    const other = pairs[row.data.id];
    if (other !== undefined && [...s.keys].some((k) => String(k).endsWith(`:${other}`))) return w.pair(other);
    const max = (c as { max: number }).max;
    return s.keys.size < max || w.max(max);
  };
  const search = definePart('header', {
    mount(host, first) {
      let c = first;
      const title = document.createElement('span');
      const input = document.createElement('input');
      input.type = 'search';
      input.className = 'hsearch';
      input.style.cssText = 'flex:1;min-inline-size:0;margin-inline-start:.25rem';
      host.style.cssText = 'display:flex;flex:1;align-items:center';
      const draw = () => {
        title.textContent = c.label;
        input.setAttribute('aria-label', `${w.search} ${c.label}`);
        if (document.activeElement !== input) input.value = (c.filter?.state as { value?: string } | null)?.value ?? '';
      };
      input.addEventListener('input', () => c.filter?.set(input.value ? { type: 'text', op: 'contains', value: input.value } : null));
      host.append(title, input);
      draw();
      return { update: (n: typeof first) => void ((c = n), draw()), focus: () => (input.focus(), true) };
    },
  });
  return {
    texts: [(Object.values(r)[0] as { text: object }).text, (Object.values(f)[0] as { text: object }).text],
    features: [rules(), slots(), filters({ popup: true })],
    parts: { nameSearch: search },
    canSelect,
  };
}
