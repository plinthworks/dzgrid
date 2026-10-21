# Motion decisions (owner, 2026-10-19)

Study: `motion-study.md` (same folder).

- First set (owner, all four chosen): popups and overlays (popup open 140 ms, overlay fade-in); rows that glide after a sort or a filter (FLIP on the visible window, entering rows fade in; ≤ 300 ms, ≤ 60 rows); value-change flash (live data; rate-capped, never while scrolling; moved forward from Phase 8); page change slide (direction follows the reading direction). Plus the CSS-only touches (sort mark, tooltip, floating summary).
- When (owner): a new step 26 at the end of Phase 3, after steps 16–25 and before the close-out.
- Budgets (owner, "Oui"), applied at step 26 (not before, so other steps cannot use the headroom): dom base 18 750 → 18 850 (the `beforeRows` seam); theme +350 B for the CSS tier; new entry `@dzgrid/dom/motion-gsap` 4 500 B gz (gsap external); GSAP itself recorded apart (no budget), an optional peer installed only by applications that want motion.
- Reduced motion (owner): a changed value gets a still coloured mark for 0.6 s (the change stays visible); every other animation is off.
- Lead: preset "sober" first (expressive later); `motion: false` grid setting and per-effect switches; transform/opacity only; pooled-row guard; FLIP by hand (gsap core only, no Flip plugin); GSAP licence (Webflow "Standard License", not MIT) noted plainly; DzGrid stays MIT; ask GSAP's contact and record the answer in ARCHITECTURE before publishing.

## Clean-room note, 2026-10-21

During the test analysis of Phase 4 step 6 an agent ran one grep over GSAP's dist file for a variable name and saw a few lines. Nothing from it was used: the test fix (the reduced-motion setting flipped a few milliseconds apart in time) was found by observation of GSAP's public API. Agents are reminded: never open, grep or read anything under `node_modules/gsap`; GSAP is learnt from its public documentation and observed through its public API and our tests only.
