# GSAP licence check (2026-10-25)

Owner asked to re-read GSAP's licence (it is now free after Webflow's acquisition).

What could be confirmed today, from public pages only (clean room: no GSAP source, nothing under node_modules/gsap):
- gsap.com banner and /pricing: « GSAP is now 100% free for all users, thanks to Webflow's support ».
- npm metadata of `gsap` 3.15.0, `license` field: « Standard 'no charge' license: https://gsap.com/standard-license ».
- GSAP's public README: « GreenSock's standard "no charge" license can be viewed at https://gsap.com/standard-license », « Copyright (c) 2008-2026, GreenSock. All rights reserved. » So it is not an open-source licence such as MIT.

What could NOT be read: the licence text itself. https://gsap.com/standard-license (and /licensing, /community/*) currently show « Forums Temporarily Offline » (a PHP security fix), and the Webflow legal page renders no text without a browser.

How DzGrid uses GSAP: optional peer dependency (`gsap ^3.13.0`), never bundled or redistributed in our packages, loaded only when the app opts into `motion()`; without it the grid works with no animation. DzGrid is a data grid, not a visual animation or site builder.

To do: re-read https://gsap.com/standard-license when it is back online, check the clauses on competing products and on redistribution, and close this item before any npm publication.
