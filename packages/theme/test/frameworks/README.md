The setups of `docs/theme-in-3-lines.md`, as files: the browser suite (`npm run test:browser -- --only
themes`) builds each with the real tool (Tailwind CSS 4.3.3's CLI, Tailwind CSS 3.4.19's CLI, esbuild for
Bootstrap 5.3.8's CSS) into `node_modules/.cache/dzgrid-frameworks/`, then reads the grid's computed colours
in Chrome. `packages/theme/test/docs.test.ts` checks the docs quote them. The frameworks are only run,
never read (owner T4, `CLEANROOM.md`). `-noorder` and `-bare` are the documented pitfalls (no order line;
the bridge outside Tailwind's build). Tailwind 3 is installed as `tailwindcss3` beside Tailwind 4: the build
reads `tailwindcss/` as `tailwindcss3/` in `tailwind3.css`.
