# Maintainer notes

For the library author, not the consumer. Why the API looks the
way it does, what's deliberate vs. accidental, and what's still
TODO.

## Why this library exists

The lqr studio family — FunscriptForge Pro, forgegen, beatflo,
eventually ForgeStream — has overlapping UI. Each app had its own
copy of the same components, drifting independently. The
carve-out plan ([REUSABLE_INVENTORY.md](https://github.com/liquid-releasing/forge-ui-design/blob/main/REUSABLE_INVENTORY.md))
collapses those copies into one canonical library.

The name `forgemoment` was coined in forgegen's architecture docs
back when the implementation language was Qt. The 2026-05-10
framework pivot to Tauri + React kept the name; only the language
changed.

> **The original framing** (2026-04-26):
> *"The Qt widget that lets a user pick an exact moment (with
> audio + video + waveform + frame-step) is built once in
> forgemoment as a library."*
>
> The Qt widget is now `MediaViewer`. Everything else accreted
> around it during the carve-out.

## Design pillars

### Data-in, no globals

Every component takes its data as props. No `window.X`, no React
context for catalog data, no module-level singletons.

The iter 08 Babel files used `window.FF_TAGS`, `window.FF_TRANSFORMS`,
`window.FF_TABS` — fine for a single-app prototype, but a non-starter
for a shared library. The rewrite threads everything through:

- `PhraseRibbon` / `ScriptChart` / `BpmBandChart` / `tagColor` /
  `tagLabel` all take a `tags` catalog prop.
- `TransformPanel` takes `transforms` + `categories` + `tags` props.
- `TabStrip` takes `tabs` + `utilityTabs` + `helpItems` props.
- `TopBar` is all-slots — logo, file, badge, scope, leftActions,
  rightActions.

### Controlled by default

Components don't own application state. The parent owns
`currentMs`, `isPlaying`, `mode`, `selectedPhraseId`, `category`,
`transformId`, `params`, `tabIndex`, etc. The components fire
`onX(next)` and let the parent decide what to do.

This is the only way `currentMs` can be the master clock — if it
lived inside MediaViewer, sibling subviews couldn't read it without
imperative refs.

A few components offer **`defaultMode`** / **`defaultValue`** as
uncontrolled escapes for the very simple case where the consumer
doesn't care.

### Pure SVG charts

Every chart is pure SVG. No `<canvas>`, no D3, no chart library.
Reasons:

- Crisp at any zoom (Vite HMR in the playground regularly reloads
  at every viewport size).
- Hit-testing for `onSeek` is a single line per chart.
- React renders SVG natively — no imperative draw loop to manage.
- Tree-shake-friendly — pulling in `BpmBandChart` doesn't drag a
  charting library along with it.

Cost: large action arrays (>10k points) might want canvas eventually.
Hasn't been a problem yet.

### Inline `style` + CSS variables

No CSS-in-JS framework (no styled-components, no emotion, no
Tailwind). Every component uses inline `style={{ ... }}` reading
from CSS variables (`var(--accent)`, `var(--surface)`).

Reasons:

- One CSS file (`tokens.css`) is the theme. Consumers override by
  redeclaring variables — no build tooling required.
- Inline styles compose naturally with the `style` prop every
  component accepts.
- No CSS bundle to ship; the build output is pure JS.

Cost: no `:hover` / `:focus` via inline styles. Components that need
pseudo-states use `onMouseEnter` / `onFocus` handlers. This is the
right cost — pseudo-states are rare on these components, and the
explicit hooks are easier to override per consumer.

### `LUCIDE_MAP` shim

The iter 08 design files used `window.lucide` at runtime — every
`<Icon name="play">` did a `lucide.createIcons()` DOM-mutation pass
after render. forgemoment uses `lucide-react` (real React
components) but keeps the iter 08 `<Icon name="kebab-case">` API.

The bridge is a small `LUCIDE_MAP` object in
[`src/primitives.jsx`](https://github.com/liquid-releasing/forgemoment/blob/main/src/primitives.jsx):

```jsx
const LUCIDE_MAP = {
  play: Play,
  pause: Pause,
  'chevron-right': ChevronRight,
  ...
};
```

Adding a new icon is a two-line edit — one in the import, one in
the map. Unknown names render a transparent placeholder + dev
console warning. The list grows incrementally; every PR that needs
a new icon adds it to the map.

## Playground aliasing

The playground (`src-playground/`) imports from `'forgemoment'`,
not from `'./src/index.js'` — even though the playground lives
inside the library repo.

```js
// vite.config.js (dev mode only)
resolve: {
  alias: {
    'forgemoment':         path.resolve(__dirname, 'src/index.js'),
    'forgemoment/styles':  path.resolve(__dirname, 'src/tokens.css'),
  },
}
```

The benefit: playground code reads exactly like what a consumer will
write. When the user dogfoods a component in the playground and
catches a bug, the fix is "do this on the consumer side" — and the
playground code is already that shape, so the fix is verbatim.

If you ever change the package's public name, change the alias to
match. Don't introduce a `./src/...` shortcut for "playground only" —
the divergence makes the dogfood weaker.

## Carve-out playbook

The mechanical steps for porting another iter 08 component into
forgemoment (this happened 18 times during v0.0.1 + 6 more during
v0.0.2):

1. Open the iter 08 source —
   `forge-ui-design/iterations/08-redesign/design_files/*.jsx`.
2. Rewrite:
   - `const { useX } = React` → real imports from `'react'`
   - `chState` / `chRef` / `chMemo` / `chEffect` → real hooks
   - `window.X = X` → `export function X`
   - `window.FF_*` globals → consumer props (`tags`,
     `transforms`, etc.)
3. Add the export to `src/index.js` barrel.
4. Wire it into the playground with a card that exercises **every
   callback**. If a callback isn't tested in the playground, the
   API isn't validated.
5. Update the [Component reference](components.md).
6. `npm run build` — eyeball the bundle delta. A "small" new
   component adding >3 kB gzipped is suspicious.
7. Commit with the established message style (see git log).

## Feature-complete gaps

The library is **structurally complete** (every iter 08 component
carved out) but **two real gaps remain** before "feature complete":

1. **MediaViewer doesn't actually play media yet.** It accepts
   `videoSrc` / `audioWaveform` / `funscript` props but currently
   renders stylised placeholders for all three modes. Real video
   playback needs a `<video>` element wired to `currentMs` /
   `isPlaying`. Real audio waveform needs a WebAudio decode path.
   Real funscript playback shares the action curve viz with
   `ScriptChart`; the new piece is the time-driven baton movement
   tied to actual audio output, not just the play-loop tick.
2. **No real consumer has carved in yet.** The API is theoretically
   validated by the playground, but it hasn't been stress-tested
   by an app with its own state machine and edge cases. The first
   carve-in (forgegen Output tab is probably the easiest target,
   since it's the most current/simplest UI) will almost certainly
   surface friction. Do this **before** building real media
   playback — the friction may change how the playback API needs
   to look.

## Versioning plan

Loose plan, subject to revision:

- **v0.0.x** — pre-consumer iteration. API may break between
  patches. Currently at v0.0.2.
- **v0.1.0** — first version validated by ≥1 production consumer.
  Cut after the first carve-in lands and stays merged for a week
  without regressions.
- **v1.0.0** — every consumer in the studio family (FFP, forgegen,
  beatflo) imports from forgemoment. iter 08 design files
  deprecated. MediaViewer has real playback.

## Open roadmap items

In rough priority order:

1. **Tag v0.0.2** — six new components form a coherent "Charts.jsx
   fully ported" milestone. v0.0.1 was tagged; v0.0.2 is pushed
   but not yet tagged.
2. **First consumer carve-in.** Where API friction will surface.
3. **Real `<video>` playback in MediaViewer.** Currently a
   stylised film-strip poster.
4. **Real audio waveform rendering.** WebAudio decode + peaks.

### Deferred until ≥1 consumer carves in

These are the "make it a proper reusable library" tasks. They're
deliberately deferred until a real consumer has stress-tested the
API — doing them sooner would mean redoing the work if the
carve-in surfaces API churn.

- **npm publish.** Today consumers install via
  `github:liquid-releasing/forgemoment#vX.Y.Z` which is fragile
  in CI. One `npm publish` fixes this, but only do it once the
  semver promise is real.
- **TypeScript types.** Either handwritten `.d.ts` files (lighter,
  decoupled from source) or convert source to `.tsx` and emit
  types from `tsc` (more invasive but a single source of truth).
- **CHANGELOG.md.** Today the change history lives in commit
  messages.
- **GitHub Actions CI.** `npm run build` on PR at minimum.
- **package.json polish.** `keywords` / `bugs` / `homepage` fields.
- **Test suite.** Charts can be snapshot-tested; MediaViewer needs
  behavior tests (the dogfood findings — out-of-scope baton,
  frame-jog pause — should each have a regression test).

## What NOT to do

- Don't add component-level state for things the parent should own.
  If a consumer wants to programmatically scrub the playhead, they
  set `currentMs`. If MediaViewer held its own ms, that wouldn't
  work.
- Don't reach for a CSS-in-JS framework. The inline-style + CSS-
  variable pattern is deliberate; pulling in styled-components etc.
  would balloon the bundle and complicate theming.
- Don't introduce a runtime icon registry global. The `LUCIDE_MAP`
  is a compile-time object — adding an icon is intentional, not
  automatic.
- Don't add components without a playground card that exercises
  every callback. If you can't dogfood it, you can't ship it.
- Don't write tests that mock React. Test the components at the
  composition layer — render them with `@testing-library/react`,
  click them, assert on visible output. Mocking internals locks the
  implementation; the components should be free to evolve under
  the API.
- Don't break the master-clock contract. If you ever need to make
  MediaViewer hold ms internally, you've taken a wrong turn —
  revisit and figure out why the parent can't own it.

## Repo

- [github.com/liquid-releasing/forgemoment](https://github.com/liquid-releasing/forgemoment)
- Local clone: `_lqr/forgemoment/`
- Playground: `npm run dev` → `localhost:5174`
- Build: `npm run build` → `dist/`
- License: MIT
