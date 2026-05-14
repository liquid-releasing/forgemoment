# forgemoment

Shared React component library for the lqr studio family
(FunscriptForge Pro, forgegen, beatflo, eventually ForgeStream). The
canonical Level-3 reusable UI per [forgegen/docs/architecture/canonical-emit-pattern.md](https://github.com/liquid-releasing/forgegen/blob/main/docs/architecture/canonical-emit-pattern.md).

> *"The Qt widget that lets a user pick an exact moment (with audio +
> video + waveform + frame-step) is built once in forgemoment as a
> library."* — original 2026-04-26 framing, now a React library.

## What's in the box

| Export | Role |
|---|---|
| **`MediaViewer`** | The master clock viewer. 3-mode thumbnail (Video / Audio / Funscript), transport, baton sync, `onTimeChange` signal that sibling subviews subscribe to. |
| **`ChapterStrip`** | Click-to-scope chapter strip. Renders the chapter list as colored bands; clicking one returns its `chapter` record so the consumer can set the MediaViewer's `chapter` prop to scope into it. Pairs with the +Mark integration point to close the chapter-creation loop. (NEW — not in iter 08.) |
| **`ScriptChart`** | Funscript curve over a viewport window. Phrase tag bands, edit-region highlight, click-to-seek, configurable BPM-tier tone. Use when the consumer wants to zoom / drill in. |
| **`PreviewChart`** | Two stacked `ScriptChart`s — Original on top, transformed Preview below. The canonical "before / after" view; tints each row by its BPM tier so the higher-energy side reads at a glance. |
| **`BpmBandChart`** | The "colored funscript" overview — full-script chart with phrase boundaries as full-height bands tinted by BPM tier (high=orange / mid=blue / low=grey), funscript curve over the top, top-right legend. Click-to-seek, optional playhead. Used in FFP Export, forgegen Output, and every cross-product preview. |
| **`PhraseDetailZoomChart`** | Single-phrase close-up; every action drawn as a connected dot, tier-tinted background. Companion to `BpmBandChart` for drill-in views. |
| **`ScopePlayer`** | Composite player widget — stylised video poster + scoped `ScriptChart` + transport row. Scope chip (script / chapter / phrase / pattern) in the corner. |
| **`TopBar`** | Top strip of an lqr studio app — logo / file info / badge / scope slot / left + right action slots. Every FFP-specific bit is consumer-owned. |
| **`TabStrip`** | Horizontal tabs with pipeline-ready states (green-dot when accepted, dimmed when upstream isn't). `tabs` / `utilityTabs` / `helpItems` props replace iter 08's hardcoded FF_TABS / FF_UTILITY_TABS / HelpMenu items. |
| **`ScopePicker`** | Generic scope picker (replaces iter 08's chapter-specific ChapterScopePicker). Accepts a `scopes` array of `{id, title, color?, start?, end?}`. |
| **`StatusBar`** | Bottom strip — Synced indicator / scope / chain file / version stamp. All optional. |
| **`AcceptBar`** | The canonical "Accept and chain" bar — primary / Reset / accepted-state Pill / chain-file hint. |
| **`TabBody`**, **`TabHeader`**, **`SectionLabel`** | Layout helpers for the inside of a tab. |
| **`TransformPanel`** | Right-side editor with category radio · transform select (filtered by category) · dynamic parameter sliders · Apply/Cancel. `transforms` / `tags` / `categories` props replace iter 08's `window.FF_TRANSFORMS` / `window.FF_TAGS` globals. Fully controlled — parent owns selection + parameter values. |
| `PhraseRibbon` | Horizontal phrase strip with click-to-select. `tags` prop replaces iter 08's `window.FF_TAGS` global. |
| `BehaviorTagBar` | Stacked % bar showing time distribution across behavior tags. |
| `ChartTitleStrip` | Small title-strip header (title · meta · meta · time). |
| `BPM_TIERS`, `bpmTier` | BPM classification helpers (high / mid / low). |
| `tagColor`, `tagLabel` | Phrase-tag color/label resolvers; take a `tags` catalog prop. |
| `MiniWave` | Deterministic mini-waveform thumbnail (seed → shape). Card / list-row visual placeholders. |
| `Sparkline` | Tiny funscript line for table rows / phrase lists. Optional fill. |
| `DiffSparkline` | Original-vs-preview overlay sparkline — ghost dashed original under solid filled preview. Natural micro-counterpart to `PreviewChart`. |
| `HoldSeekButton` | Press-and-hold rewind / fast-forward with 2→4→8→16× ramp every 600ms. |
| `Button`, `Pill`, `Card`, `Field`, `TextInput`, `Slider`, `Segmented`, `SectionHeading`, `Icon` | Base UI primitives. |
| `fmtTime`, `fmtTimeShort` | Time-formatting helpers. |

As of **v0.0.2** [iter 08's `Charts.jsx`](https://github.com/liquid-releasing/forge-ui-design/blob/main/iterations/08-redesign/design_files/Charts.jsx)
is fully carved out — every visualisation component shipped. Combined
with v0.0.1's primitives / MediaViewer / HoldSeekButton / AppShell /
TransformPanel, every target in
[REUSABLE_INVENTORY.md](https://github.com/liquid-releasing/forge-ui-design/blob/main/REUSABLE_INVENTORY.md)
now lives in this library.

## Master clock contract

`MediaViewer` is the single source of time across an lqr app. The
parent app owns `currentMs` (controlled), and `MediaViewer` emits
`onTimeChange(ms)` whenever it changes. Any number of sibling
sub-views can subscribe and stay locked.

```jsx
import { MediaViewer } from 'forgemoment';

function Editor() {
  const [currentMs, setCurrentMs] = useState(0);
  return (
    <>
      <MediaViewer
        currentMs={currentMs}
        isPlaying={isPlaying}
        onSeek={setCurrentMs}
        onTimeChange={(ms) => {
          // Fan out to subscribers — Stim panel, multi-axis preview,
          // network-broadcast hook, plugin views, etc.
          stimPanel.setTime(ms);
          haptics.setTime(ms);
        }}
        chapter={currentChapter}
        funscript={authoredFunscript}
        audioWaveform={analyzedWaveform}
      />
      {/* All these subscribe to currentMs as the single source */}
      <StimTimeline currentMs={currentMs} />
      <MultiAxisPreview currentMs={currentMs} />
    </>
  );
}
```

Use the `mode` prop (controlled) or `defaultMode` (uncontrolled) to
pick between `'video'`, `'audio'`, `'funscript'`. `showModeToggle={false}`
hides the chip strip if you want to pin a single mode.

## The +mark integration point

The `MediaViewer`'s `+<markLabel>` button is a **generic integration
point** — same button code, different meaning per consumer. The
component doesn't know whether you're creating a chapter, dropping a
beat marker, or tagging a note; it just fires `onMark(currentMs)` and
your app decides.

```jsx
// Create chapters
<MediaViewer markLabel="Chapter" onMark={(ms) => createChapter(ms)} />

// Drop beat markers
<MediaViewer markLabel="Beat" onMark={(ms) => beats.push(ms)} />

// Tag notes for a script reviewer
<MediaViewer markLabel="Note" onMark={(ms) => openNoteEditor(ms)} />
```

Set `showMark={false}` to hide the button entirely when the consuming
app doesn't need a marking action. Old callers passing
`onCreateChapter` / `showCreateChapter` still work as back-compat
aliases — drop them when you migrate.

## Data-pluggable visualizations

Each mode renders a placeholder when its data prop is absent and a
real visualization when supplied:

| Mode | Data prop | Fallback |
|---|---|---|
| `video` | `videoSrc` — URL | Stylised film-strip poster |
| `audio` | `audioWaveform = { peaks: number[], durationMs }` | Synthesized waveform shape |
| `funscript` | `funscript = { actions: [{at, pos}] }` | Stylised curve |

Real audio + funscript renderers are scoped to the **chapter** when a
chapter is supplied (chapter-relative baton), or to the **full track**
otherwise.

## Local dev

```bash
npm install
npm run dev          # playground at http://localhost:5174
npm run build        # library bundle into dist/
```

Playground is in `src-playground/`; the dev server aliases
`forgemoment` to `src/index.js` so the imports in the playground
match what consumer apps will write.

## Stack

- React 18 (peer dep — consumer brings its own copy)
- Vite 6 (dev + library build)
- lucide-react (icons; bundled as external)
- No CSS-in-JS framework — every component uses inline `style` +
  CSS variables for theming (see `src/tokens.css`)

## Where it came from

Carved out from
[forge-ui-design](https://github.com/liquid-releasing/forge-ui-design)
per [REUSABLE_INVENTORY.md](https://github.com/liquid-releasing/forge-ui-design/blob/main/REUSABLE_INVENTORY.md).
The source iter 08 JSX was Babel-in-browser; this package converts
to ES modules + npm-installable distribution. The Qt-era `forgemoment`
plan (Level-3 in the canonical-emit pattern) flows through here in
React form after the 2026-05-10 framework pivot to Tauri + React.

## License

MIT — © Liquid Releasing
