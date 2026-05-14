# forgemoment — user guide

Shared React component library for the lqr studio family
(FunscriptForge Pro, forgegen, beatflo, eventually ForgeStream).
The canonical Level-3 reusable UI per
[forgegen/docs/architecture/canonical-emit-pattern.md](https://github.com/liquid-releasing/forgegen/blob/main/docs/architecture/canonical-emit-pattern.md).

This folder is the deep reference. The repo
[README](../README.md) is the elevator pitch; come here when you
need details, props, recipes, or design context.

## Read in order

| Topic | When to read |
|---|---|
| [Getting started](getting-started.md) | First time installing forgemoment in a consumer app. Install, peer deps, design tokens, dev loop. |
| [Master clock contract](master-clock.md) | Before wiring `MediaViewer` into anything. Explains the single-source-of-time pattern that every sibling sub-view subscribes to. |
| [Component reference](components.md) | When you want to know what a specific component does and what its props mean. 24 components + helpers, alphabetical inside each category. |
| [Carve-in guide](carve-in.md) | Replacing a local copy (iter 08 design files, FFP `primitives.jsx`, etc.) with a forgemoment import. The mechanical rewrite rules. |
| [Recipes](recipes.md) | Cookbook of common compositions — building an Export tab, wiring +Mark to a chapter list, swapping ScriptChart for BpmBandChart, etc. |
| [Maintainer notes](maintainer-notes.md) | Why the API looks the way it does. Read this if you're extending forgemoment, not just consuming it. |

## Library at a glance

- 24 components + 6 utilities
- React 18 peer dep
- Pure inline `style` + CSS variables — no CSS-in-JS framework
- `lucide-react` for icons (via a small `LUCIDE_MAP` shim so consumers
  pass icon names, not components)
- ES + CJS dual build via Vite library mode
- ~84 kB ES / ~19 kB gzipped, fully tree-shakable
- MIT license, [github.com/liquid-releasing/forgemoment](https://github.com/liquid-releasing/forgemoment)

## Versioning so far

| Version | What landed |
|---|---|
| **v0.0.1** | Whole REUSABLE_INVENTORY plan: primitives, AppShell, MediaViewer (master-clock), HoldSeekButton, TransformPanel, Charts subset, BpmBandChart (the canonical "colored funscript" cross-product display). |
| **v0.0.2** | The 6 deferred Charts.jsx components: PreviewChart, PhraseDetailZoomChart, ScopePlayer, MiniWave, Sparkline, DiffSparkline. Charts.jsx is now fully carved out — every iter 08 visualisation lives here. |

> **Maintainer note** — these versions both shipped on 2026-05-14. The
> library is structurally complete (every iter 08 component carved
> out) but two real gaps remain before "feature complete":
> `MediaViewer` doesn't actually play media yet (it's a stylised
> placeholder for video / audio / funscript modes), and no real
> consumer has carved in yet so the API hasn't been stress-tested.
> See [Maintainer notes](maintainer-notes.md) for context.
