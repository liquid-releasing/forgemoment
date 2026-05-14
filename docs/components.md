# Component reference

Every export from forgemoment. Organized by category. Inside each
category, components are listed in the order a consumer typically
reaches for them.

- [Primitives](#primitives)
- [Transport / playback](#transport--playback)
- [Charts](#charts)
- [AppShell](#appshell)
- [Authoring](#authoring)
- [Utilities](#utilities)

---

## Primitives

Small UI atoms — every studio app composes with these.

### `Icon`

Drop-in for kebab-case lucide names: `<Icon name="play" size={16} />`.
Backed by `lucide-react` via a small `LUCIDE_MAP` shim — unknown
names render a transparent placeholder + dev console warning rather
than crashing.

**Adding a new icon:** import it in [`src/primitives.jsx`](https://github.com/liquid-releasing/forgemoment/blob/main/src/primitives.jsx)
and add a one-line entry to `LUCIDE_MAP`. See
[Maintainer notes](maintainer-notes.md#lucide-map-shim) for why
this shim exists.

| Prop | Type | Notes |
|---|---|---|
| `name` | string | kebab-case lucide name (`'play'`, `'chevron-right'`) |
| `size` | number | px, default 16 |
| `stroke` | number | default 1.75 |
| `style` | object | merged onto the inner element |

### `Button`

```jsx
<Button kind="primary" size="md" icon="play" onClick={...}>Start</Button>
```

| Prop | Values |
|---|---|
| `kind` | `primary`, `secondary`, `ghost`, `danger`, `success` |
| `size` | `sm`, `md` (default), `icon` |
| `icon` | optional lucide name (rendered before children) |

### `Pill`

```jsx
<Pill tone="success" dot>ready</Pill>
```

| Prop | Values |
|---|---|
| `tone` | `neutral` (default), `success`, `warn`, `danger`, `info`, `accent` |
| `dot` | boolean — show a leading colored dot |

### `Card`

Container with surface + border + radius. `padding` defaults to
`14`; pass `style` to override anything else.

### `Field`

Labeled wrapper: `label` above the children, optional `hint` below.

### `TextInput`, `Slider`, `Segmented`

Standard controlled inputs.

- `Slider` — props `min`, `max`, `step`, `value`, `onChange`,
  optional `valueLabel`.
- `Segmented` — props `options` (string[] or `{value, label}[]`),
  `value`, `onChange`.

### `SectionHeading`

Centered heading row used inside Cards. `right` slot for trailing
content (a count, a button).

### `SectionLabel`

Eyebrow-style label above content blocks. `right` slot for meta on
the trailing edge. Used everywhere in the playground above charts.

---

## Transport / playback

### `MediaViewer`

The master clock viewer. **Read [master-clock.md](master-clock.md)
before using this.**

```jsx
<MediaViewer
  currentMs={currentMs}
  isPlaying={isPlaying}
  mode={mode}                       // 'video' | 'audio' | 'funscript'
  onModeChange={setMode}
  onSeek={setCurrentMs}
  onPlayPause={() => setIsPlaying((p) => !p)}
  onTimeChange={(ms) => fanOut(ms)}
  onPrev={() => setCurrentMs(Math.max(0, currentMs - 30_000))}
  onNext={() => setCurrentMs(Math.min(total, currentMs + 30_000))}
  onMark={(ms) => createChapter(ms)}
  markLabel="Chapter"               // changes the button text + onMark contract
  chapter={currentChapter}          // optional — scopes baton + viz
  totalMs={total}
  audioWaveform={{ peaks, durationMs }}
  funscript={{ actions: [{at, pos}] }}
  videoSrc={url}                    // currently shows a stylised poster fallback
  width={320} height={280}
/>
```

| Prop | Notes |
|---|---|
| `mode` / `defaultMode` / `onModeChange` | Controlled or uncontrolled three-mode toggle. `showModeToggle={false}` hides the chip strip. |
| `chapter` | When supplied, baton + waveform + funscript curve render scoped to this chapter (chapter-relative). Out-of-scope playhead fades the baton + shows a directional chip. |
| `videoSrc` / `audioWaveform` / `funscript` | Data-pluggable visualisation slots. Missing data → stylised placeholder. |
| `onMark` + `markLabel` | Generic integration point. See [master-clock.md](master-clock.md#mark--the-generic-integration-point). |

### `HoldSeekButton`

Press-and-hold rewind / fast-forward with a `2 → 4 → 8 → 16×` ramp
every 600ms.

```jsx
<HoldSeekButton direction={-1} currentMs={currentMs} totalMs={total} onSeek={setCurrentMs} />
<HoldSeekButton direction={1}  currentMs={currentMs} totalMs={total} onSeek={setCurrentMs} />
```

---

## Charts

Pure-SVG visualisation primitives — crisp at any zoom, no canvas
fallbacks, no library dependencies. Every chart that displays time
takes the same `currentMs` master clock and an optional `onSeek`.

### `ScriptChart`

Funscript curve over a viewport window. Phrase tag bands across the
top, edit-region highlight, click-to-seek anywhere on the canvas.
The "zoom in / drill in" view.

| Prop | Notes |
|---|---|
| `actions` | `[{at, pos}]` |
| `phrases` | `[{id, start, end, tag, bpm}]` (optional) |
| `tags` | `[{id, label, color}]` — phrase-tag catalog |
| `totalMs`, `startMs`, `endMs` | Viewport window |
| `currentMs`, `onSeek` | Master clock |
| `selectedPhraseId`, `onSelectPhrase` | Optional phrase-select highlight |
| `showActions` | `'auto'` (default) / `'always'` / `'never'` |
| `tone` | `{fill, stroke, dot}` — override curve color |
| `highlight` | `{start, end, label}` — edit-region overlay |
| `height` | px, default 180 |

### `BpmBandChart`

The "colored funscript" overview. Full-script chart with phrase
boundaries as full-height bands tinted by BPM tier (high=orange,
mid=blue, low=grey), funscript curve over the top, top-right
legend. Click-to-seek, optional playhead.

```jsx
<BpmBandChart
  actions={funscript.actions}
  phrases={phrases}
  totalMs={total}
  title="demo-track.funscript"
  currentMs={currentMs}
  onSeek={setCurrentMs}
  height={240}
/>
```

This is the canonical Export-tab preview across FFP, forgegen, and
beatflo. When the user said "we are hitting it now with forgegen
and just about every product," this is the component.

### `PreviewChart`

Two stacked `ScriptChart`s — Original on top, transformed Preview
below. Each row is BPM-tier-tinted so the higher-energy side reads
at a glance. The canonical before/after view.

```jsx
<PreviewChart
  original={{ actions, bpm, start, end }}
  preview={{ actions, bpm, start, end }}
  label="Preview · density × 0.5"
  highlight={{ start, end, label }}    // ranges BOTH charts
/>
```

### `PhraseDetailZoomChart`

Single-phrase close-up — every action drawn as a connected dot,
BPM-tier tint behind. Drill-in companion to BpmBandChart.

```jsx
<PhraseDetailZoomChart
  phrase={{ start, end, bpm }}
  actions={[{at, pos}, ...]}           // INSIDE this phrase
  index={3}                            // 0-based ordinal → "Phrase 4"
  cycles={42}                          // auto-derived if omitted
  label="custom heading"               // overrides "Phrase N"
  height={220}
/>
```

ResizeObserver-driven width; renders at whatever container width
it gets.

### `ScopePlayer`

Composite player widget — stylised poster + a scoped `ScriptChart`
underneath + transport row at the bottom. The "scope" is what the
player is locked to.

```jsx
<ScopePlayer
  scope={{ kind: 'chapter', label: 'Build', start: 60_000, end: 180_000 }}
  actions={funscript.actions}
  phrases={phrases}
  tags={tags}
  currentMs={currentMs}
  isPlaying={isPlaying}
  onPlayPause={() => setIsPlaying((p) => !p)}
  onSeek={setCurrentMs}
  height={280}
  compact={false}
/>
```

| `scope.kind` | Icon | Use |
|---|---|---|
| `'script'` | `film` | Whole script |
| `'chapter'` | `bookmark` | A chapter |
| `'phrase'` | `scan-line` | A single phrase (forces `showActions="always"`) |
| `'pattern'` | `shapes` | A recurring pattern |

> **Maintainer note** — ScopePlayer doesn't render real `<video>`
> playback. It shows a stylised film-strip poster. Real playback is
> still a TODO ([feature-complete gaps](maintainer-notes.md#feature-complete-gaps)).
> When that ships, ScopePlayer + MediaViewer will probably share an
> internal `<VideoSurface>` primitive.

### `ChapterStrip`

Chapter list as a click-to-scope-AND-seek strip. Renders chapters as
colored bands; clicking one fires both `onSelect(chapter)` AND
`onSeek(chapter.at_ms)`. Closes the +mark → visible chapter loop.

```jsx
<ChapterStrip
  chapters={[{id, name, at_ms, end_ms, color?}, ...]}
  totalMs={total}
  currentMs={currentMs}
  selectedId={scopedChapterId}
  onSelect={(ch) => setScopedChapterId(ch.id)}
  onSeek={setCurrentMs}
/>
```

### `PhraseRibbon`

Horizontal phrase strip with click-to-select. `tags` prop replaces
iter 08's `window.FF_TAGS` global.

### `BehaviorTagBar`

Stacked %-bar showing time distribution across behavior tags.

### `MiniWave`

Deterministic mini-waveform thumbnail (seed → stable shape). Pure
SVG visual placeholder for cards / list rows — *not* a real audio
renderer.

```jsx
<MiniWave seed="ch-1" color="#3ed598" height={24} />
```

### `Sparkline`

Tiny funscript line for table rows / phrase lists. Optional fill.

```jsx
<Sparkline actions={[...]} start={0} end={60_000} color="var(--accent)" filled />
```

### `DiffSparkline`

Ghost-dashed original under solid-filled preview. Natural micro-
counterpart to `PreviewChart` for compact "compare these two"
displays.

```jsx
<DiffSparkline
  original={origActions}
  preview={previewActions}
  start={0} end={total}
  height={56}
/>
```

### `ChartTitleStrip`

Small title-strip header (title · meta · meta · meta). Used by
`PhraseDetailZoomChart` and consumer-built chart cards that want
the same look.

---

## AppShell

The frame of a studio app — TopBar / TabStrip / TabBody / StatusBar
form the outer chrome.

### `TopBar`

Top strip of an lqr studio app. Every FFP-specific bit is consumer-
owned via slots — there's no hardcoded logo / file metadata / help
menu.

```jsx
<TopBar
  logo={<MyLogoBlock />}
  file={{ title, durationMs, phraseCount, actionCount }}
  badge={<Pill tone="accent" dot>playground</Pill>}
  scope={<ScopePicker ... />}
  leftActions={<>...</>}
  rightActions={<>...</>}
/>
```

### `TabStrip`

Horizontal tabs with pipeline-ready states (green-dot when
accepted, dimmed when upstream isn't). `tabs` / `utilityTabs` /
`helpItems` props replace iter 08's hardcoded FF_TABS / FF_UTILITY_TABS
/ HelpMenu items.

```jsx
<TabStrip
  tabs={[{id, label, icon, pipeline}, ...]}
  active={activeTab}
  onChange={setActiveTab}
  pipelineState={{ tab1: { accepted: true }, tab2: { accepted: false } }}
  utilityTabs={[...]}
  helpItems={[...]}
/>
```

### `ScopePicker`

Generic scope picker (replaces iter 08's chapter-specific
`ChapterScopePicker`). Accepts a `scopes` array of
`{id, title, color?, start?, end?, meta?}`.

```jsx
<ScopePicker
  scopes={scopeOptions}
  value={scopeValue}
  onChange={(id) => setScopedChapterId(id === '__all' ? null : id)}
/>
```

> Note — ScopePicker is generic, so it doesn't auto-seek when a
> scope is picked. If the scope has a time range and you want the
> playhead to jump there too, wire that in `onChange`. (Compare
> with `ChapterStrip` which DOES auto-seek.)

### `StatusBar`

Bottom strip — Synced indicator / scope / chain file / version
stamp. All slots optional.

```jsx
<StatusBar synced scope="chapter-2" chainFile="viewer.chain.json" version="myapp v1.2.0" />
```

### `AcceptBar`

The canonical "Accept and chain" bottom-of-tab bar. Primary button
/ Reset / accepted-state Pill / chain-file hint.

### `TabBody`, `TabHeader`, `SectionLabel`

Layout helpers for the inside of a tab — eyebrow + title + subtitle,
content container with padding, and section-label rows.

---

## Authoring

### `TransformPanel`

360px right-side editor — category radio · transform select
(filtered by category) · dynamic parameter sliders · Apply / Cancel.

```jsx
<TransformPanel
  transforms={transformsCatalog}        // [{id, category, label, summary, description, params, bestFor}]
  tags={tagsCatalog}                    // [{id, label, color}] for the bestFor pills
  categories={['tone', 'behavior', ...]}  // optional override
  category={transformCategory}
  onCategoryChange={setTransformCategory}
  transformId={transformId}
  onTransformChange={setTransformId}
  params={params}
  onParamsChange={setParams}
  onApply={() => apply(transformId, params)}
  onCancel={() => setParams({})}
/>
```

Fully controlled — parent owns category + transformId + params.
`transforms` / `tags` / `categories` props replace iter 08's
`window.FF_TRANSFORMS` / `window.FF_TAGS` globals.

---

## Utilities

| Export | Signature | Use |
|---|---|---|
| `fmtTime(ms)` | `(number) => string` | `MM:SS.xx` |
| `fmtTimeShort(ms)` | `(number) => string` | `M:SS` |
| `BPM_TIERS` | `[{id, label, min, fill, stroke, dot}, ...]` | High / mid / low tier descriptors |
| `bpmTier(bpm)` | `(number) => tier` | Classify a BPM into a tier |
| `tagColor(tagId, tags)` | `(string, catalog) => color` | Resolve a phrase-tag color |
| `tagLabel(tagId, tags)` | `(string, catalog) => label` | Resolve a phrase-tag label |

`tagColor` / `tagLabel` take a `tags` catalog instead of reading
from a global. This is the same pattern the chart components use —
no hidden globals, everything is data-in.

> **Maintainer note** — `BPM_TIERS` colors are deliberately the
> same hex values used by the matplotlib export pipeline (the
> tier dot colors). Don't redefine these; the screen + export
> legend rely on them matching exactly.
