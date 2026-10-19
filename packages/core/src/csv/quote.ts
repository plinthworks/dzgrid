/**
 * What a spreadsheet would run (OWASP, CSV injection): a field starting with
 * a tab, CR or LF, or whose first character after spaces, no-break spaces and
 * the invisible direction marks is `=`, `+`, `-` or `@`.
 */
export const FORMULA = /^(?:[\t\r\n]|[ \u00A0\u200E\u200F\u061C]*[=+\-@])/;

/** A field for one separator (RFC 4180): quoted when it holds the separator, a quote, CR or LF, its quotes doubled. */
export const quoter = (sep: string): ((s: string) => string) => {
  const special = new RegExp(`[${sep}"\\r\\n]`);
  return (s) => (special.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
};
