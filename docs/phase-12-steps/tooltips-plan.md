# Tooltips and popovers — plan (1.12.0)

Owner's decisions 2026-11-13 (items 1–7 of the brief). Sheet: `docs/behaviors/tooltips-popovers.md`. Every choice the
brief left open (« decide ») is taken below and marked **D-n**; none is a structural choice outside the brief, so the
work goes on without a question.

## API

### DOM layer
```ts
// The grid (base, @dzgrid/dom): the setting grows, today's keys unchanged.
tooltips?: {
  delayMs?: number;        // 500 (today)
  hideDelayMs?: number;    // 150 (today's grace)
  cells?: boolean;         // true: columns' `tooltip` (false silences them all)
  header?: boolean;        // false: header buttons show their name (D-1)
  tone?: TipTone;          // 'info'
  animation?: TipAnimation;// 'fade'
  animate?: TipAnimate;    // the app's own animation (D-4)
  html?: (html: string) => DocumentFragment; // `safeHtml` from @dzgrid/dom/tooltip: the opt-in (D-6)
}
// A column: `tooltip(value, row, context)` may return string | { text, tone? } | { html, text?, tone? } | null.
type TipTone = 'info' | 'neutral' | 'success' | 'warning' | 'danger';
type TipAnimation = 'fade' | 'scale' | 'slide' | 'none';
type TipSide = 'block-end' | 'block-start' | 'inline-end' | 'inline-start';
type TipAnimate = (el: HTMLElement, phase: 'open' | 'close', info: { side: TipSide; tone: TipTone }) => void | PromiseLike<unknown>;

// @dzgrid/dom/tooltip (new entry)
tooltip(el: HTMLElement, o: TooltipOptions): TooltipHandle;
// TooltipOptions: content (string | Node | () => Node | string | { html }), side, tone, animation, animate,
// delayMs, hideDelayMs, disabled.  Handle: show(), hide(), update(o), destroy(), readonly el (the bubble, null hidden).
safeHtml(html: string, doc?: Document): DocumentFragment;

// @dzgrid/dom/popover (new entry)
popover(trigger: HTMLElement, o: PopoverOptions): PopoverHandle;
// PopoverOptions: content (as above; a function is called at each opening), side ('block-end'), tone, animation,
// animate, label, group ('default'), openOn ('click' | 'manual'), onOpen(), onClose(reason).
// Handle: open(), close(), toggle(), isOpen, el (the bubble, null closed), reposition(), destroy().
```
The element package (`<dz-grid>`): no new code (D-9) — its pages use the two DOM functions directly (it depends on
`@dzgrid/dom`); the guide shows it in the third tab.

### Angular
```ts
// @dzgrid/angular/tooltip (new secondary entry)
<button [dzTooltip]="'Delete'" dzTooltipTone="danger">…</button>
<span [dzTooltip]="tpl" [dzTooltipContext]="{ row }">…</span>          // an <ng-template>
<span [dzTooltip]="StatusTip" [dzTooltipInputs]="{ status }">…</span> // a component class and its inputs
<span [dzTooltip]="{ html: text }">…</span>                           // DomSanitizer, then safeHtml
// inputs: dzTooltipSide, dzTooltipTone, dzTooltipAnimation, dzTooltipDelay, dzTooltipDisabled
// @dzgrid/angular/popover (new secondary entry)
<button [dzPopover]="panel" #p="dzPopover" (opened)="…" (closed)="…">…</button>  p.open() p.close() p.toggle() p.isOpen()
// inputs: dzPopoverContext / dzPopoverInputs, dzPopoverSide, dzPopoverTone, dzPopoverAnimation, dzPopoverLabel,
// dzPopoverGroup, dzPopoverOpenOn
```
In the grid: a column's `ui.tooltip` keeps taking a component class (today) or a part name; a cell's action icon
gets a tooltip from its column's `tooltip`, or `dzTooltip` / `dzPopover` on the icon inside its component.

## Entries and sizes
Base `@dzgrid/dom`: the shared engine — four sides, flip, shift, arrow place, tone and animation attributes, the hook,
the header buttons, `{ text, tone }` and `{ html }` dispatch (the cleaner is not in it). Lines: existing ones +2 % at
most (`@dzgrid/dom` 25 200, Angular 8 650); K.8 ≤ 92 000 (measured 91 036 before). New entries at their measure + 10 %,
rounded up to 50: `@dzgrid/dom/tooltip`, `@dzgrid/dom/popover`, `@dzgrid/angular/tooltip`, `@dzgrid/angular/popover`,
`@dzgrid/theme/tooltips.css` (+ unlayered). A line beyond these rules → stop and ask.

## Accessibility
Tooltip pattern: `role="tooltip"`, `aria-describedby` on the anchor while shown, no focusable content (documented), Escape,
hover and keyboard focus, never touch alone. Header buttons: their tooltip repeats their name — no `aria-describedby`.
Popover: disclosure + non-modal dialog (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`; `role="dialog"`,
`aria-label` / `aria-labelledby`), focus in on open when there is something to focus, back on Escape / code close.
axe 0 in the browser checks.

## Positioning (D-2)
One function, `place(bubble, anchorRect, side, dir, win)`: preferred side; flip when the window lacks room there and
the opposite side has it; shift along the other axis to stay inside the window (the grid's tooltip at its cell's start, the page's centred); gap = arrow size (the CSS margin
variables.css already sets) + 4 px; arrow at the anchor's middle clamped 12 px inside; logical sides converted in the
one direction module (`dir.ts`). Scroll containers: the bubble is in the top layer (`popover="manual"`) or fixed;
tooltips hide on scroll (today's grid rule, and the page's tooltips on a scroll of any ancestor); popovers are placed
again at the next frame on scroll / resize, closed when the anchor leaves the window or the page, or its grid row is
recycled (`aria-rowindex` changed).

## Animation (D-3, D-4)
CSS only for the presets (`tooltips.css`): `opacity` / `translate` / `scale` transitions from `@starting-style`, `display`
and `overlay` with `allow-discrete` so the closing bubble stays drawn — the JS sets `hidden` and nothing else, no frame
reads layout. Variables: `--dzg-tooltip-open-duration` (140ms), `-close-duration` (100ms), `-open-easing`,
`-close-easing`, `-open-delay`, `-close-delay` (0), `--dzg-tooltip-slide` (6px), `--dzg-tooltip-scale` (.96); the
popover reads `--dzg-popover-*` falling back on them. Reduced motion and `data-motion=off`: no transition (D-3).
Engines without `@starting-style` / discrete transitions: the bubble appears and disappears at once. The app's own:
`animate(el, phase, info)` (D-4) — chosen over `data-state` classes: one seam that works with CSS classes, the Web
Animations API and GSAP (its tweens are thenables), and keeps the close waiting on the app, not on a guessed duration.

## Content and cleaning (D-5, D-6)
Text: `textContent`. Node or function: appended (a function called at each show; its nodes removed at hide). HTML:
`safeHtml` (allowlist in the sheet, item 17), parsed by `DOMParser` in a document with no browsing context (inert). Angular: `DomSanitizer.sanitize(HTML)`
then `safeHtml`. Components / templates (Angular): created at show, destroyed at hide (a tooltip keeps no row),
attached to the application for change detection.

## Replacing today's cell tooltip without breaking 1.11 apps
The grid's `Tooltip` class stays the one element per grid; it gains the engine above. Strings, `null`, `headerTooltip`,
parts and `delayMs` behave as before; the sheets' existing tests stay as they are.

## Popover group (D-7)
`group` names a set; one open per set; opening a popover inside an open one keeps the outer one. Default `'default'`.

## Header buttons (D-1)
`tooltips.header` (default false) — any button with an `aria-label` in a header cell or a header's extra row (filter,
column menu, floating filter toggle). Sorting has no button (the header is the control): its tooltip is `headerTooltip`.

## Element (D-9)
No code: the guide's third tab imports `@dzgrid/dom/tooltip` / `popover`.

## Also: the Retry focus ring (brief item 7)
`packages/theme/dzgrid.scss`: the selector list `.dzg-overlay button:focus-visible, .dzg-retry:focus-visible` lost its
block and ran into `.dzg-footer`. Restored as the focus ring it was (1b23ee0), test first.

## État et question au propriétaire (2026-11-13, nuit) — travail arrêté ici

Fait, non commité, testé en jsdom (rouge d'abord) : le moteur partagé (`render/tooltip.ts` : `place` 4 côtés / bascule /
glissement / flèche, tons, `data-animation`, crochet `animate`, une infobulle à la fois), la grille (`tooltips: { delayMs,
hideDelayMs, cells, header, tone, animation, animate, html }`, `tooltip` d'une colonne → `string | { text, tone } |
{ html }`), `@dzgrid/dom/tooltip` (`tooltip(el, …)`, `safeHtml`), `@dzgrid/dom/popover` (`popover(trigger, …)`),
`@dzgrid/theme/tooltips.css` (+ copie sans couche), `@dzgrid/angular/tooltip` (`dzTooltip`) et `/popover` (`dzPopover`),
le Retry (item 7). Pas encore : matrice navigateurs, site, CHANGELOG / release / ROADMAP, gate.

**Bloquant — la taille de la base.** `@dzgrid/dom` mesure 25 944 o gz (ligne 25 200, règle +2 % → 25 704 au plus ;
25 169 avant). K.8 : 91 852 / 92 000 (148 o de marge). `/find` 2 668 / 2 660 et `/print` 1 711 / 1 710 (code inchangé,
gzip sur la base grossie). Même en retirant « une à la fois », le problème `missing-feature` du HTML, l'attente de la
fermeture CSS et le crochet, la base reste vers 25 730 : tout ne tient pas sous +2 %.

**Q-T1 — où va le poids ?**
- A — tout dans la base : `@dzgrid/dom` 25 200 → 26 000 (+3,2 %), `/find` 2 660 → 2 680, `/print` 1 710 → 1 720 ; K.8
  reste sous 92 000 avec 148 o de marge.
- B ★ — la base garde l'infobulle 1.11 + tons + effets CSS + `{ text, tone }` + `cells` + HTML par `tooltips.html`
  (≈ +1,9 %) ; le crochet `animate`, l'attente de la fin du fondu (une partie / un HTML reste dessiné pendant qu'il
  s'efface) et les infobulles des boutons d'en-tête passent dans une fonction de grille `tooltips()` de
  `@dzgrid/dom/tooltip` (`features: [tooltips()]`, comme les autres) ; sans elle, `tooltips.header` / `.animate` sont
  signalés (`missing-feature`). K.8 ≈ 91 600.

Décidé seul en attendant (à confirmer) : HTML dans Angular par la désinfection d'Angular (`[innerHTML]` d'un petit
composant interne : le `DomSanitizer` de l'app) puis `safeHtml` — pas de nouvelle dépendance `@angular/platform-browser`.

## Réponses du propriétaire (2026-11-14) et ce qui change

**Q-T1 = B.** La base garde l'infobulle 1.11, les tons, les effets CSS (et la marque `data-reduced`), `{ text, tone }`,
`cells`, le HTML par `tooltips.html`, et un seul `place()` (4 côtés, 3 alignements, bascule) ; ses coutures `at`,
`close`, `onShow` reçoivent du moteur partagé des entrées sur demande (`tooltip/engine.ts`) les placements, le crochet
`animate`, l'attente de la fin du fondu et « une à la fois ». La grille l'a par `features: [tooltips()]`
(`@dzgrid/dom/tooltip`) ; sans elle, `tooltips.header` / `.animate` / `.placement` sont signalés une fois
(`missing-feature`, `settings.tooltips`, détail `tooltips`). Le problème « HTML sans nettoyeur » est retiré (taille).
Base mesurée 25 686 / 25 704 (+2 % de 25 200). Choix 2, 3, 4 confirmés.

**Ajout 1 — animations plus riches, sur demande** : `pop` (de 80 % avec un léger dépassement, 260 ms) et `rise` (12 px
depuis le côté de l'ancre, longue décélération douce, 320 ms), fermeture commune courte ; variables
`--dzg-tooltip-pop-*`, `--dzg-tooltip-rise*`. `reducedMotion: 'none' | 'fade'` (défaut `none`) : `fade` garde un fondu
de 120 ms en opacité seule sous le mouvement réduit (`--dzg-tooltip-reduced-duration`).

**Ajout 2 — placement** : `placement` (réglage de grille, colonne `{ placement }`, directives `dzTooltipPlacement` /
`dzPopoverPlacement`, options DOM) = `top`, `bottom`, `start`, `end`, `left`, `right` × (rien, `-start`, `-end`), et
`auto` (défaut : sous l'ancre ; celle de la grille au début de sa cellule, celles de la page centrées). `start` / `end`
sont ceux de la ligne (miroir en arabe) ; `left` / `right` ceux de l'écran, traduits par le module de direction
(`placementOf` dans `dir.ts`, seul endroit qui nomme les côtés physiques). `flip: false` garde le côté demandé. L'ancienne
option `side` (jamais publiée) disparaît.

**Ajouts 2026-11-14 (suite)** — Floating UI (doc publique, MIT) lue comme référence des concepts : cas ajoutés —
l'ancre rognée par une boîte qui défile ferme la bulle, la bulle se replace quand son contenu change de taille
(`ResizeObserver`), un contenu haut défile dans le corps de la bulle (`--dzg-popover-max-height`), flèche hors du corps
jamais rognée ; bords de fenêtre sans marge (comme l'infobulle 1.12). « CSS normal, ou GSAP pour du morphing » : le
crochet `animate` reçoit `{ side, tone, dir, reduced, shape }`, appelé aussi sous mouvement réduit (`reduced: true`),
jamais avec `motion: false` ; option `shape` (données de chemin SVG seules) dessinée en `<svg class="dzg-tip-shape">`,
la boîte et la flèche cachées (`data-shape`). Fermeture par `data-closing` (Firefox et Safari ne gardent pas une bulle
dessinée à travers `display: none` dans la couche du dessus).
Le crochet accepte aussi un tween ou une timeline GSAP tels quels (`TipThenable` : un `then` à un seul rappel). Matrice :
Chrome 5 148/5 148, Firefox 5 020/5 020, WebKit 4 976/4 976 ; real-app 58/58 ; `release:check` vert (appli Angular
réelle 102 700, +0,5 %).
