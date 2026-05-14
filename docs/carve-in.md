# Carve-in guide

How to replace a local copy of these components (the iter 08 design
files, FFP's local `primitives.jsx`, etc.) with a forgemoment
import. The mechanical rewrite rules.

## When to carve in

You have a consumer app — FFP, forgegen, beatflo — that has a local
copy of one or more of these components, either:

- Lifted from `forge-ui-design/iterations/08-redesign/design_files/*.jsx`
  (the Babel-in-browser source);
- Or vendored into the app at an earlier point and slowly diverged.

Carving in means deleting that local copy and importing from
`forgemoment` instead. The goal is **one shared canonical
implementation** — bug fixes and feature work compound across every
product instead of being rewritten per app.

## Prerequisites

1. Install forgemoment ([Getting started](getting-started.md)).
2. Import `'forgemoment/styles'` once at the top of the app.
3. Make sure React 18+ is in the consumer.

## Rewrite rules

The iter 08 design files used Babel-in-browser + `window.X = X`
globals + aliased React hooks (`chState`, `chRef`, `chMemo`,
`chEffect`). forgemoment converts every one of these to standard
ES module patterns. Carving in means applying the same rewrites
to consumer code that previously relied on the iter 08 conventions:

| Iter 08 pattern | forgemoment / consumer pattern |
|---|---|
| `const { useState, useRef } = React` | `import { useState, useRef } from 'react'` |
| `chState(0)` | `useState(0)` |
| `chRef(null)` | `useRef(null)` |
| `chMemo(() => ..., [])` | `useMemo(() => ..., [])` |
| `chEffect(() => ..., [])` | `useEffect(() => ..., [])` |
| `window.ScriptChart` | `import { ScriptChart } from 'forgemoment'` |
| `window.FF_TAGS` global | `tags` prop on each component |
| `window.FF_TRANSFORMS` global | `transforms` prop on `TransformPanel` |
| `window.FF_TABS` / `FF_UTILITY_TABS` | `tabs` / `utilityTabs` props on `TabStrip` |
| `<Icon name="...">` via `window.lucide` | Same JSX — `Icon` from forgemoment uses `lucide-react` under the hood |

If a component currently relies on a `window.X` global, you have to
thread that data through as a prop. This is the main source of
diff bulk during carve-in.

## Renames you'll see

| Iter 08 name | forgemoment name |
|---|---|
| `ChapterScopePicker` | `ScopePicker` (now generic — takes a `scopes` array) |
| `onCreateChapter` / `showCreateChapter` on MediaViewer | `onMark` / `markLabel`. Old props still work as back-compat aliases — drop them on migration. |

## Suggested order

Start with the **smallest, leafmost** components and work outward.
A bottom-up carve-in lets you ship working PRs at each stage
without leaving the consumer broken between merges.

1. **Primitives first** — `Button`, `Pill`, `Card`, `Field`,
   `TextInput`, `Slider`, `Segmented`, `Icon`, `fmtTime`. Each one
   is independent and the import rewrite is one-for-one.
2. **Chart leaves next** — `MiniWave`, `Sparkline`, `DiffSparkline`,
   `ChartTitleStrip`, `BehaviorTagBar`, `PhraseRibbon`. Small and
   independent.
3. **Chart composites** — `ScriptChart`, `BpmBandChart`,
   `PreviewChart`, `PhraseDetailZoomChart`, `ChapterStrip`.
   `ScriptChart` is the big one — every other chart wraps or stacks
   it.
4. **AppShell** — `TopBar`, `TabStrip`, `StatusBar`, `AcceptBar`,
   `ScopePicker`, `TabBody/TabHeader/SectionLabel`. Touches the
   outer chrome of the app, so review carefully.
5. **MediaViewer + HoldSeekButton** — last, because it's the
   master clock and replacing it is a big behavioral surface. Test
   thoroughly:
   - Play loop ticks → `onTimeChange` fires
   - Sibling sub-views still get the playhead
   - Out-of-scope baton fades correctly
   - Frame-jog pauses if playing
   - +Mark wires to the consumer's chapter / beat / note list
6. **TransformPanel** — independent, but the catalog object shape is
   load-bearing. See [components.md](components.md#transformpanel)
   for the expected shape.

## What to delete after each step

Each carve-in step deletes:

- The local copy of the component file
- The `window.X = X` registration line (if any) for that component
- Any global catalog (`window.FF_TAGS`, `window.FF_TRANSFORMS`)
  *if* it's no longer read anywhere else
- Tests that asserted the local copy's behavior (forgemoment is
  the canonical source — assert in the library, not in the consumer)

Don't delete the global catalogs until you've grepped for them
across the whole consumer codebase. They tend to have one quiet
last reader.

## Verification checklist

After carving in each component, before merging:

- [ ] Build succeeds (no missing imports)
- [ ] Type checker succeeds (if the consumer is typed; forgemoment
      itself isn't typed yet — see
      [Maintainer notes](maintainer-notes.md#open-roadmap-items))
- [ ] App boots without console errors
- [ ] The component renders in its primary location with no visual
      regression
- [ ] Every callback the consumer was passing still fires
- [ ] If you carved in a chart with `onSeek`, clicking the chart
      still moves the playhead
- [ ] If you carved in `MediaViewer`, sibling sub-views are still
      receiving `currentMs` updates

## Common gotchas

- **Missing CSS variables.** If a component renders unstyled (or
  half-styled), you forgot `import 'forgemoment/styles'`.
- **Lucide icons not rendering.** Check the dev console for
  `[forgemoment] Icon: unknown lucide name "X"`. Add the missing
  icon to `LUCIDE_MAP` in `src/primitives.jsx` and rebuild.
- **`window.FF_TAGS is undefined` errors.** Some local code somewhere
  still reads the global. Grep for it; thread the catalog through
  as a prop.
- **Baton stuck at left edge.** The chapter prop covers a range
  but `currentMs` initializes at `0` outside the chapter. The baton
  is supposed to look that way — out-of-scope fade is intentional.
  Either initialise `currentMs` to the chapter's start, or accept
  the chip.
- **Two MediaViewers in one tree.** Don't. There's one master clock.
  Use `<MediaViewer>` once and let siblings subscribe via the
  parent's `currentMs`.

## After every consumer carves in

When FFP, forgegen, AND beatflo are all importing from forgemoment:

- Delete the iter 08 design files that no longer ship to anyone.
  They're a historical reference at that point, not a source of
  truth.
- Move the canonical changelog to forgemoment itself (today the
  carve-out history lives in commit messages).
- Cut a `v0.1.0` tag once the library has been validated by ≥1
  production consumer. See
  [Maintainer notes](maintainer-notes.md#versioning-plan).
