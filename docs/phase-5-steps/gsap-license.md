# GSAP licence check (2026-10-25)

Owner asked to re-read GSAP's licence (it is now free after Webflow's acquisition).

What could be confirmed today, from public pages only (clean room: no GSAP source, nothing under node_modules/gsap):
- gsap.com banner and /pricing: « GSAP is now 100% free for all users, thanks to Webflow's support ».
- npm metadata of `gsap` 3.15.0, `license` field: « Standard 'no charge' license: https://gsap.com/standard-license ».
- GSAP's public README: « GreenSock's standard "no charge" license can be viewed at https://gsap.com/standard-license », « Copyright (c) 2008-2026, GreenSock. All rights reserved. » So it is not an open-source licence such as MIT.

What could NOT be read: the licence text itself. https://gsap.com/standard-license (and /licensing, /community/*) currently show « Forums Temporarily Offline » (a PHP security fix), and the Webflow legal page renders no text without a browser.

How DzGrid uses GSAP: optional peer dependency (`gsap ^3.13.0`), never bundled or redistributed in our packages, loaded only when the app opts into `motion()`; without it the grid works with no animation. DzGrid is a data grid, not a visual animation or site builder.

To do: re-read https://gsap.com/standard-license when it is back online, check the clauses on competing products and on redistribution, and close this item before any npm publication.

## Re-read before the first npm publication (2026-10-28)

https://gsap.com/standard-license was back online and was read (public page only; no GSAP source, nothing under
node_modules/gsap). Page dates: « Effective date: April 30, 2025 », « Last modified date: May 30, 2025 ». npm metadata
of `gsap` 3.15.0 (latest), `license`: « Standard 'no charge' license: https://gsap.com/standard-license. ».

Quotes:
- Grant (II): « Webflow grants you a non-exclusive, worldwide license to use, reproduce, display, and implement GSAP
  Products solely for Permitted Uses. »
- « "Permitted Uses" means the implementation and/or use of GSAP Products on any website, web application, or digital
  interface by any person or entity (which may include, for clarity, those of companies that compete with Webflow in
  other areas of business). »
- « "Prohibited Uses" means any implementation and/or use of GSAP Products in tools that allow users to build visual
  animations without code that encourages, induces, or materially assists in creating a solution that competes with
  Webflow's visual animation building capabilities. »
- Restrictions (III): « You may not: 1. Use any GSAP Products for any Prohibited Uses without prior written consent;
  2. Reverse engineer any GSAP Products for the purpose of creating Competitive Products; 3. Remove or alter any
  proprietary notices or branding from GSAP Products. »
- « "Competitive Products" means any software, tool, or service that enables users to create, edit, or manage
  animations through a visual interface or builder similar to Webflow. »
- « Commercial usage is covered under the standard license. »
- VI.2: « Webflow reserves the right to update or modify this GSAP License at any time by posting the revised terms on
  this website […] »
- The page says nothing on redistribution, sublicensing, npm, dependencies or open source.

Finding: DzGrid's use is a Permitted Use. `@dzgrid/dom` declares `gsap` as an **optional peer dependency** only; it never
bundles, copies or redistributes GSAP (release-review.test.ts checks that no shipped file carries GreenSock's code), and
the application installs GSAP itself, under GSAP's own licence. DzGrid is a data grid in web applications, not a tool to
build visual animations without code, and not a Competitive Product; nothing is reverse engineered. Our MIT licence
covers our code only; the dom README says GSAP « comes under its own licence ». Nothing in the licence forbids an MIT
package from naming GSAP as an optional peer. Not legal advice; the licence may change (VI.2), so re-read it at each
major release. **Item closed for 1.0.0.**
