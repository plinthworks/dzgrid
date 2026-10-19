/**
 * What a spreadsheet would run (OWASP, CSV injection): a field starting with
 * a tab, CR or LF, or whose first character after any white space (tabs and
 * no-break spaces included), zero-width characters and the invisible
 * direction controls (marks, embeddings, overrides, isolates) is `=`, `+`, `-`
 * or `@`.
 */
export const FORMULA = /^(?:[\t\r\n]|[\s\u200B\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]*[=+\-@])/;

/** The text of a number as written (any digits, grouping, decimal marks, an exponent): what may skip the guard. */
export const NUMERIC = /^[-\u2212+]?[\p{Nd}.,\s'\u066B\u066C\u2019]+(?:[eE][-+]?\d+)?$/u;

/** A field for one separator (RFC 4180): quoted when it holds the separator, a quote, CR or LF, its quotes doubled. */
export const quoter = (sep: string): ((s: string) => string) => {
  const special = new RegExp(`[${sep}"\\r\\n]`);
  return (s) => (special.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
};
