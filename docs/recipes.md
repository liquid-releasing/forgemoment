# Recipes

Common compositions. Copy, paste, adjust.

## A complete app frame

The smallest "real" forgemoment app — TopBar + TabStrip + TabBody +
StatusBar around a tab body that does the actual work.

```jsx
import { useState } from 'react';
import {
  AcceptBar, Button, Pill, ScopePicker, StatusBar,
  TabBody, TabHeader, TabStrip, TopBar,
} from 'forgemoment';
import 'forgemoment/styles';

const TABS = [
  { id: 'viewer',    label: 'Viewer',    icon: 'film',     pipeline: 'viewer'    },
  { id: 'curve',     label: 'Curve',     icon: 'activity', pipeline: 'curve'     },
  { id: 'transform', label: 'Transform', icon: 'sliders',  pipeline: 'transform' },
];

export function App() {
  const [activeTab, setActiveTab] = useState('viewer');
  const [accepted, setAccepted] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar
        logo={<MyLogoBlock />}
        file={{ title: 'demo.mp4', durationMs: 300_000 }}
        badge={<Pill tone="accent" dot>v1.0</Pill>}
        rightActions={
          <>
            <Button kind="secondary" size="sm" icon="folder">Open</Button>
            <Button kind="primary" size="sm" icon="download">Export</Button>
          </>
        }
      />
      <TabStrip
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        pipelineState={{
          viewer:    { accepted },
          curve:     { accepted: false },
          transform: { accepted: false },
        }}
      />
      <TabBody>
        {activeTab === 'viewer' && <ViewerTab />}
        {activeTab === 'curve' && <CurveTab />}
        {activeTab === 'transform' && <TransformTab />}
      </TabBody>
      <AcceptBar
        accepted={accepted}
        onAccept={() => setAccepted((a) => !a)}
        onReset={() => setAccepted(false)}
      />
      <StatusBar synced version="myapp v1.0.0" />
    </div>
  );
}
```

## Master clock + sibling subscribers

The viewer-tab cookbook. Parent owns `currentMs`; MediaViewer
broadcasts via `onTimeChange`; siblings read `currentMs` directly.

```jsx
import { useState } from 'react';
import {
  Card, HoldSeekButton, MediaViewer, Slider, fmtTime,
} from 'forgemoment';

const TOTAL_MS = 300_000;

function ViewerTab() {
  const [currentMs, setCurrentMs]   = useState(0);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [marks, setMarks]           = useState([]);

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      <MediaViewer
        currentMs={currentMs}
        isPlaying={isPlaying}
        onSeek={setCurrentMs}
        onPlayPause={() => setIsPlaying((p) => !p)}
        onTimeChange={(ms) => {
          // Hand the time stream to anything imperative — Web Audio,
          // WebSocket, hardware bridges. Sibling React subviews don't
          // need this; they read `currentMs` from this component's
          // parent (this scope) directly.
        }}
        onMark={(ms) => setMarks((m) => [...m, ms])}
        markLabel="Chapter"
        totalMs={TOTAL_MS}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            sibling reads currentMs directly
          </div>
          <div className="mono" style={{ fontSize: 20 }}>
            {fmtTime(currentMs)}
          </div>
        </Card>

        <Slider min={0} max={TOTAL_MS} value={currentMs} onChange={setCurrentMs} />

        <div style={{ display: 'flex', gap: 8 }}>
          <HoldSeekButton direction={-1} currentMs={currentMs} totalMs={TOTAL_MS} onSeek={setCurrentMs} />
          <HoldSeekButton direction={1}  currentMs={currentMs} totalMs={TOTAL_MS} onSeek={setCurrentMs} />
        </div>
      </div>
    </div>
  );
}
```

## Chapter list + click-to-scope-and-seek

ChapterStrip fires both `onSelect` AND `onSeek` on a single click —
designed to close the +mark → visible chapter loop. Pair it with
MediaViewer's `onMark` to get end-to-end "create a chapter at the
playhead, see it appear, click to jump back."

```jsx
const [chapters, setChapters] = useState([
  { id: 'ch-1', name: 'Intro',  at_ms:      0, end_ms:  60_000, color: '#3ed598' },
  { id: 'ch-2', name: 'Build',  at_ms: 60_000, end_ms: 180_000, color: '#4dabf7' },
]);
const [scopedChapterId, setScopedChapterId] = useState(null);
const scopedChapter = chapters.find((c) => c.id === scopedChapterId);

<ChapterStrip
  chapters={chapters}
  totalMs={TOTAL_MS}
  currentMs={currentMs}
  selectedId={scopedChapterId}
  onSelect={(ch) => setScopedChapterId(ch.id)}
  onSeek={setCurrentMs}
/>

<MediaViewer
  currentMs={currentMs}
  chapter={scopedChapter}        // viewer follows the scope
  onSeek={setCurrentMs}
  markLabel="Chapter"
  onMark={(ms) => {
    const newId = `ch-${Date.now()}`;
    setChapters((cs) => [
      ...cs,
      { id: newId, name: `Chapter ${cs.length + 1}`, at_ms: ms },
    ].sort((a, b) => a.at_ms - b.at_ms));
  }}
/>
```

## The Export tab (colored funscript)

`BpmBandChart` is the canonical Export-tab preview. Click-to-seek
shares the playhead with the rest of the app.

```jsx
import { BpmBandChart, SectionLabel } from 'forgemoment';

function ExportTab({ funscript, phrases, currentMs, setCurrentMs }) {
  return (
    <>
      <SectionLabel>BpmBandChart — preview</SectionLabel>
      <BpmBandChart
        actions={funscript.actions}
        phrases={phrases}
        totalMs={funscript.totalMs}
        title={funscript.title}
        currentMs={currentMs}
        onSeek={setCurrentMs}
        height={240}
      />
    </>
  );
}
```

## Before / after preview with a transform

`PreviewChart` for the macro view, `DiffSparkline` for compact list
rows. Same data, different scales.

```jsx
<PreviewChart
  original={{ actions: original, bpm: 92, start: 0, end: total }}
  preview={{  actions: preview,  bpm: 64, start: 0, end: total }}
  label="Halve density"
  highlight={scopedChapter && {
    start: scopedChapter.at_ms,
    end:   scopedChapter.end_ms,
    label: scopedChapter.name,
  }}
/>

{/* Inside a list row: */}
<DiffSparkline
  original={original}
  preview={preview}
  start={0}
  end={total}
  height={56}
/>
```

## Drill into a single phrase

Switch from `BpmBandChart` (overview) to `PhraseDetailZoomChart`
(drill-in) when the user picks a phrase.

```jsx
const [focusPhraseId, setFocusPhraseId] = useState(null);
const focusPhrase = phrases.find((p) => p.id === focusPhraseId);
const focusActions = funscript.actions.filter(
  (a) => focusPhrase && a.at >= focusPhrase.start && a.at <= focusPhrase.end
);

{focusPhrase
  ? <PhraseDetailZoomChart
      phrase={focusPhrase}
      actions={focusActions}
      index={phrases.indexOf(focusPhrase)}
    />
  : <BpmBandChart
      actions={funscript.actions}
      phrases={phrases}
      totalMs={total}
      currentMs={currentMs}
      onSeek={setCurrentMs}
      onSelectPhrase={setFocusPhraseId}
    />
}
```

## TransformPanel + apply-result panel

Right-side parametric editor. Parent owns `category`, `transformId`,
and `params`; `onApply` is when you actually run the transform.

```jsx
const [category, setCategory]       = useState('tone');
const [transformId, setTransformId] = useState('tone.warm');
const [params, setParams]           = useState({});
const [applied, setApplied]         = useState(null);

<div style={{ display: 'flex', gap: 22 }}>
  <div style={{ flex: 1 }}>
    {applied
      ? <PreviewChart original={applied.original} preview={applied.preview} />
      : <ScriptChart actions={funscript.actions} totalMs={total} />
    }
  </div>
  <TransformPanel
    transforms={MY_TRANSFORMS_CATALOG}
    tags={MY_TAGS}
    category={category}
    onCategoryChange={(next) => {
      setCategory(next);
      const first = MY_TRANSFORMS_CATALOG.find((t) => t.category === next);
      if (first) setTransformId(first.id);
      setParams({});
    }}
    transformId={transformId}
    onTransformChange={(id) => { setTransformId(id); setParams({}); }}
    params={params}
    onParamsChange={setParams}
    onApply={async () => {
      const next = await runTransform(transformId, params, funscript);
      setApplied({ original: funscript, preview: next });
    }}
    onCancel={() => { setApplied(null); setParams({}); }}
  />
</div>
```

## Hand the time stream to a non-React subscriber

When you have a Web Audio worklet, a WebSocket bridge, or any
imperative code that needs the playhead, use `onTimeChange` as the
hook. forgemoment doesn't ship a pub-sub primitive — roll your own
on top.

```jsx
const clock = useMemo(() => ({
  ms: 0,
  listeners: new Set(),
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
}), []);

// Once at boot, register the bridge:
useEffect(() => clock.subscribe((ms) => audioWorklet.postMessage({ ms })), []);

<MediaViewer
  currentMs={currentMs}
  onSeek={setCurrentMs}
  onTimeChange={(ms) => {
    clock.ms = ms;
    clock.listeners.forEach((fn) => fn(ms));
  }}
/>
```

## Override a token

Every component reads from CSS variables. Override anywhere in your
own CSS — usually `:root` or a wrapper class.

```css
:root {
  --accent: #7e5cef;
  --bg: #0a0b0d;
  --surface: #131520;
  --text: #f0f1f6;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

See [`src/tokens.css`](https://github.com/liquid-releasing/forgemoment/blob/main/src/tokens.css)
for the full list.
