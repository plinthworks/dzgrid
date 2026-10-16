import { parseDay, zoneDayBounds } from '@dzgrid/core';

const CASES: [string, string][] = [
  ['Europe/Paris', '2026-03-29'],
  ['Europe/Paris', '2026-10-25'],
  ['America/Sao_Paulo', '2018-11-04'],
  ['Pacific/Apia', '2011-12-30'],
  ['Australia/Lord_Howe', '2026-04-05'],
  ['Africa/Algiers', '2026-03-05'],
];

const iso = (ms: number) => new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
  timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(ms);

const body = document.getElementById('rows')!;
for (const [zone, text] of CASES) {
  const { from, to } = zoneDayBounds(parseDay(text)!, zone);
  const tr = document.createElement('tr');
  for (const [value, num] of [[zone, false], [text, true], [iso(from), true], [iso(to), true], [`${(to - from) / 3_600_000} h`, true]] as const) {
    const td = document.createElement('td');
    td.textContent = String(value);
    if (num) td.className = 'num';
    tr.append(td);
  }
  body.append(tr);
}
