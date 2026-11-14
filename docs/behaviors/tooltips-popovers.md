# Tooltips and popovers (1.12.0)

Owner 2026-11-13: « là où on souhaite activer l'infobulle, on pourra le faire », « travaille bien l'animation et la
possibilité d'afficher tout ce qu'on veut ». Sources: WAI-ARIA Authoring Practices (tooltip pattern, disclosure and
non-modal dialog), WCAG 2.2 (1.4.13 content on hover or focus, 2.3.3 animation from interactions, 2.4.3 focus order),
the HTML `popover` attribute, CSS `@starting-style` and `transition-behavior`. Behaviour of other libraries from their
public pages only (CLEANROOM.md). For positioning, Floating UI's public documentation (MIT; owner 2026-11-14, « s'inspirer
sans copier ») was read as a reference for the concepts and their edge cases — placements, offset, flip, shift, arrow,
size, following on scroll and resize, hiding a clipped anchor; no line of its code was read, copied or translated, and
nothing of it is a dependency. Plan and API: `docs/phase-12-steps/tooltips-plan.md`. The grid's own tooltip
(`tooltips.md`) keeps every rule written there; this sheet adds to it.

## What the user does
Rests the pointer on something (a cell, a header, a header's button, a button anywhere in the page) or reaches it with
the keyboard; clicks a control that opens a bubble that stays (a popover); presses Escape, clicks elsewhere, tabs away.

## What they observe

### Tooltips
1. Only where the application asked for one. In the grid: a column's `tooltip` (cells) and `headerTooltip` (its
   header) as before; the header's buttons (filter, column menu, floating filter toggle) show their name when the grid
   says `tooltips: { header: true }` with the `tooltips()` feature — off by default. A column's sort is its header itself: the header's tooltip is the
   column's `headerTooltip`. `tooltips: { cells: false }` silences every column's `tooltip` at once (a failed save's
   reason is the grid's own message and still shows). Anywhere in the page: an element given a tooltip by the
   application (`tooltip(el, …)` in the DOM layer, `dzTooltip` in Angular).
2. Hover: it appears after a delay (`delayMs`, 500 by default); keyboard focus (a focus that follows a key): at once.
   A click's focus shows nothing. It is never shown on touch alone (no hover there): a tap does not open it.
3. The pointer can move onto it (WCAG 1.4.13 « hoverable »); it goes when the pointer leaves both, after a short grace
   (`hideDelayMs`, 150 by default). Escape dismisses it without moving the focus (« dismissable »); it stays until then
   (« persistent »). One tooltip on screen at a time in a page: showing another hides the first (the page's tooltips,
   and a grid's with `tooltips()`).
4. It never covers its anchor. It opens where the application places it (owner 2026-11-14, « à droite, à gauche, en
   haut, en bas… »): `placement` is a side — `top`, `bottom`, `start`, `end` (the line's start and end: mirrored in
   Arabic) or `left`, `right` (the screen's, whatever the direction: resolved by the direction module into the line's
   start or end) — optionally followed by `-start` or `-end` to line its start or end up with the anchor's along the
   other axis (for `top` / `bottom` the line's start and end; for the inline sides, the top and the bottom); without it
   the bubble is centred on its anchor: 12 placements, and `auto` — below, the grid's at its cell's start (1.11's place),
   a page's centred. When the window has no room on that side and has on the opposite one it flips there (`flip: false`
   keeps the side asked); along the other axis it slides to stay inside the window. An arrow points at the anchor's
   middle, kept 12 px inside the bubble's corners; it follows the flip. `data-side` tells the side it opened on, in
   logical terms. In the grid the placement (grid-wide, or a column's `{ placement }`) needs `tooltips()`.
5. It is not interactive: the pointer may rest on it, but nothing in it is meant to be focused or clicked (the
   application's content is not checked: a control there is the application's mistake); a bubble meant to be clicked
   is a popover.
6. Tones say what kind of message it is: `info` (today's dark bubble, the default), `neutral` (a raised surface with an
   edge), `success`, `warning`, `danger` — each a background, a text colour, an edge and an arrow colour as variables,
   readable in light and dark (text 4.5:1, checked by `check:contrast`). The tone is never the only sign: the words
   say it; a forced-colours display draws every tone in the system's colours with a visible edge.
7. Animation (opening and closing, set per grid, per tooltip, or for the page by variables): `fade` (the default),
   `scale` (from 96 % with a fade, from the arrow's side), `slide` (a few pixels from the anchor's side: below → moves
   down into place, above → up, after → toward the end; it follows the flip and the reading direction), `none`; and two
   richer presets, opt-in (owner 2026-11-14, « à activer si le client la veut »): `pop` (grows from 80 % with a slight
   overshoot, 260 ms) and `rise` (12 px from the anchor's side with a long, soft deceleration, 320 ms). Every preset
   closes the same short way (100 ms).
   Only `opacity` and `transform` move (no layout during the animation; no read of the layout per frame). Duration,
   easing and delay of the opening and of the closing are variables. A tooltip moving straight from one anchor to the
   next does not close and reopen: it jumps.
8. Reduced motion (`prefers-reduced-motion: reduce`) or a grid with `motion: false`: no animation at all, opening and
   closing are instant — the grid's rule since Phase 5 (`motion.md`: « nothing moves, nothing fades »). An application
   may ask instead for a short fade under reduced motion (`reducedMotion: 'fade'`, opacity only, 120 ms: nothing moves
   or grows); `none` is the default. A grid with `motion: false` stays instant. The app's own animation is told it is
   asked to reduce motion and decides (below).
9. Content: words (a column's text, `{ text, tone }`), or anything the application draws — a part / an Angular
   component or `<ng-template>` (a small table, an icon and a title), or HTML given as text **only** when the application
   opted in, cleaned first (below). A screen reader hears the content's text through `aria-describedby` on the anchor
   while it is shown (the header buttons' name tooltips excepted: they are the name already, not read twice).

### Popovers (the bubble that stays)
10. Opened by a click on its trigger (or a key that clicks it: Enter, Space), or by the application's code; a second
    click on the trigger closes it. Closed by Escape (the focus goes back to the trigger), by a pointer press outside it
    and its trigger (the focus stays where that press puts it), by the focus leaving it for something outside (Tab past
    its last control), and by code.
11. The focus moves into it when it has something focusable (its first control, or the element marked `autofocus`);
    otherwise it stays on the trigger. On close by Escape or by code while the focus was inside, the focus returns to
    the trigger. Tab inside it goes through its controls in order; it is not modal (no trap): Tab past the last control
    closes it and moves on to what follows its trigger in the page, Shift+Tab before the first goes back to the trigger
    (the bubble sits at the page's end, in the top layer: the page's order is kept as if it followed its trigger).
12. The trigger says it: `aria-haspopup="dialog"`, `aria-expanded` true / false, `aria-controls` the popover's id. The
    popover is `role="dialog"` with an accessible name (`label`, or the trigger's own name), not modal.
13. Placed by the same rules as the tooltip (4), arrow included, in the browser's top layer (nothing of the page clips
    it); it stays by its trigger when the page or a scroll container scrolls, the window resizes or its own content
    changes size (placed again at the next frame); it closes when the trigger leaves the page, scrolls out of the
    window or out of a scrolling box around it (clipped there), or — inside a grid — when the trigger's row is
    recycled to show another row (its `aria-rowindex` changed). A tall content scrolls inside it (its body is capped
    at the window's height less 32 px, `--dzg-popover-max-height`), its arrow outside that body, never clipped. The
    arrow stays 12 px inside the bubble's corners (the default radius, 6 px, plus half the arrow): a radius over 6 px
    wants a smaller arrow. The window's edges are not padded: a bubble may touch them (1.12.0's tooltip did).
14. One open at a time in a group (`group`, `'default'` unless given): opening one closes the others of its group,
    except one it is nested in (a popover opened from inside another keeps its parent open). A tooltip shown while a
    popover is open stays possible (on another element); the popover's trigger shows no tooltip while it is open.
15. It can hold anything: a component, a template, a form, even a DzGrid grid. Same tones and animations as the tooltip;
    its default look is the raised surface with an edge and a shadow (`--dzg-popover-*`).

### HTML content (opt-in)
16. HTML is shown only when the application says so: in the grid `tooltips: { html: safeHtml }` (the cleaner imported
    from `@dzgrid/dom/tooltip`, so the grid's base never carries it), a column's `tooltip` returning `{ html }`; in the
    page `content: { html }`; in Angular `[dzTooltip]="{ html }"`, first through Angular's `DomSanitizer`, then ours.
    Without the opt-in a column's `{ html }` shows its `text` if it has one, otherwise nothing — never the raw markup
    (no problem is told: it would cost the base what it cannot spare, plan Q-T1).
17. Cleaning keeps text and a fixed list of harmless elements (`b strong i em u s small mark sub sup code kbd br p span
    div ul ol li dl dt dd table thead tbody tr th td hr h1…h6 abbr time`) with a fixed list of attributes (`class`,
    `lang`, `dir`, `title`, `colspan`, `rowspan`, `datetime`); everything else is dropped with its content when it can
    run or load (`script style iframe object embed link meta img svg math template form input button a video audio
    source`), unwrapped otherwise. No event attribute, no `style`, no URL of any kind survives (so no `javascript:` and
    no external load). Parsed in an inert document (nothing loads or runs while parsing). Its risk, documented: the
    application decides what text reaches it; cleaning stops scripts and loads, not misleading words.

## What DzGrid does
- **One implementation, the weight opt-in** (owner Q-T1 B, 2026-11-14): the base (`render/tooltip.ts`) places (one
  `place()`: 4 sides, 3 alignments, flip, the arrow), shows with its tone, CSS preset and reduced-motion mark, and
  hides at once; its seams (`at`, `close`, `onShow`) take the rest from the opt-in entries' shared engine
  (`tooltip/engine.ts`): placements, the app's `animate`, a closing that waits for the end of the fade (a part, a
  template or HTML stays drawn while it fades), one tooltip at a time. The grid gets it through the feature
  `tooltips()` (`@dzgrid/dom/tooltip`); without it `tooltips.header`, `.animate` or `.placement` are told once
  (`missing-feature`, path `settings.tooltips`, detail `tooltips`) and the base's behaviour stays. The page's
  `tooltip()` and `popover()` (`@dzgrid/dom/tooltip`, `@dzgrid/dom/popover`) always have it, Angular's directives too
  (`@dzgrid/angular/tooltip`, `@dzgrid/angular/popover`). The tones, the four-sided arrow, the animations and the
  popover's look are the opt-in sheet `@dzgrid/theme/tooltips.css` (with its unlayered copy). Without that sheet a
  tooltip looks as in 1.12.0 and appears without animation.
- **Today's apps unchanged**: `tooltips: { delayMs }`, a column's `tooltip` returning a string or null, `headerTooltip`
  and a `tooltip` part behave as in 1.11; `data-side` keeps its two values for the grid's tooltip (it opens below or
  above its cell).
- **Animation design**: CSS transitions on `opacity` and `transform` from `@starting-style`, with `display` and
  `overlay` transitioned discretely so a closing bubble stays drawn (and in the top layer) until its fade ends — the
  JavaScript only sets and clears `hidden`; nothing is measured during the animation (the closing's end is the bubble's
  own `getAnimations()` settling). `data-animation` on the bubble
  picks the preset. An application's own animation (owner 2026-11-14, « CSS normal, ou GSAP pour du morphing »):
  `animate(el, phase, info)` (`phase` `'open'` | `'close'`; `info` `{ side, tone, dir, reduced, shape }`) is called after
  the bubble is placed and before it is hidden; while it is given the CSS presets are off (`data-animation="custom"`),
  and a closing bubble is hidden when the promise (or thenable — WAAPI's `finished`, a GSAP tween or timeline) it
  returns settles, at once if it returns nothing or throws (the throw is reported). Under reduced motion it is still
  called, told `reduced: true` (the app gives an instant or a fade-only version); on a grid with `motion: false`, never.
  Shown again while its closing runs, it is told `open` again (the app stops its closing there); the late settling is
  ignored. DzGrid never depends on GSAP: the presets are CSS; GSAP is the app's choice.
- **An app's shape** (for morphing): `shape`, SVG path data in a 100 × 100 box stretched over the bubble, is drawn as an
  `<svg class="dzg-tip-shape">` first in the bubble, filled and edged in the tone's colours (`data-shape`: tooltips.css
  draws no box and no arrow — the arrow, if wanted, is part of the path); `info.shape` is that `<path>`, which a GSAP
  MorphSVG tween can morph. Only path commands and numbers are taken (no `url()`, nothing that loads or runs); anything
  else and the box is kept. The path is drawn as given in both directions: an asymmetric shape is mirrored by the app
  (`info.dir`).
- **Grid recycling**: a grid tooltip hides at the paint where its cell shows another row (tooltips.md); a popover whose
  trigger sits in a grid row closes when that row's `aria-rowindex` changes or the trigger leaves the page.

## Where DzGrid differs on purpose
- Tooltips never show on touch alone and never hold controls (WAI-ARIA tooltip pattern); popovers are non-modal
  dialogs, not menus (no arrow-key roving: their content is the application's).
- Right to left is designed in: sides are logical, the slide and the arrow follow them.
- Reduced motion means no animation at all, not a shorter one.

## Tests
`packages/dom/test/float-place.test.ts` (sides, flip at each edge, shift, arrow clamp, RTL), `tooltip-anywhere.test.ts`
(hover delay, keyboard focus, grace, Escape, one at a time, `aria-describedby`, tone, animation attribute, hook,
destroy), `tooltip-grid-1-12.test.ts` (header buttons on / off, `cells: false`, `{ text, tone }`, `{ html }` with and
without the cleaner, compatibility), `popover.test.ts` (click, Escape, outside, focus out, code, focus in and back,
ARIA, group and nesting, scroll and recycling), `safe-html.test.ts` (hand-written hostile inputs);
`packages/theme/test/tooltips-sheet.test.ts`; `packages/angular/test/tooltip-directives.test.ts`; browser:
`scripts/browser-1-12.mjs` (tones, presets, reduced motion, flips, popover gestures, focus, outside the grid, cleaned
HTML, a component and a template, axe).
