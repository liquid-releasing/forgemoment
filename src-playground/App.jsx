// Playground for forgemoment — dogfood the components by composing
// them into a small but real-looking app frame.
//
// Run with `npm run dev` from the forgemoment/ repo root; opens at
// http://localhost:5174.
//
// The app frame: AppShell.TopBar + TabStrip + TabBody + StatusBar
// (StatusBar lives at the very bottom of the viewport). Three tabs
// exercise the carve-out: Viewer (MediaViewer + ChapterStrip +
// master-clock subscriber + marks card), Curve (ScriptChart with
// viewport toggle), Primitives (visual gallery of the small UI kit).
//
// The TopBar's ScopePicker drives the same scopedChapterId that the
// ChapterStrip and MediaViewer read — proves the cross-tab state can
// live in the parent and flow through forgemoment without re-mounting
// the Viewer between tabs.

import { useEffect, useMemo, useState } from 'react';
import {
  AcceptBar, BpmBandChart, Button, Card, ChapterStrip, DiffSparkline,
  Field, HoldSeekButton, MediaViewer, MiniWave, PhraseDetailZoomChart,
  Pill, PreviewChart, ScopePicker, ScopePlayer, ScriptChart,
  SectionLabel, Segmented, Slider, Sparkline, StatusBar, TabBody,
  TabHeader, TabStrip, TextInput, TopBar, TransformPanel, fmtTime,
} from 'forgemoment';

const TRACK_DURATION_MS = 300_000; // 5 minutes

const INITIAL_CHAPTERS = [
  { id: 'ch-1', name: 'Intro',  at_ms:       0, end_ms:  60_000, color: '#3ed598' },
  { id: 'ch-2', name: 'Build',  at_ms:  60_000, end_ms: 180_000, color: '#4dabf7' },
  { id: 'ch-3', name: 'Climax', at_ms: 180_000, end_ms: 260_000, color: '#ff7b7b' },
  { id: 'ch-4', name: 'Outro',  at_ms: 260_000, end_ms: 300_000, color: '#ffb547' },
];

const FAKE_WAVEFORM = {
  peaks: Array.from({ length: 1200 }, (_, i) =>
    (Math.sin(i * 0.05) * 0.6 + Math.sin(i * 0.13) * 0.3 + (Math.random() - 0.5) * 0.2)
  ),
  durationMs: TRACK_DURATION_MS,
};
const FAKE_FUNSCRIPT = {
  actions: Array.from({ length: 240 }, (_, i) => ({
    at: Math.round((i / 240) * TRACK_DURATION_MS),
    pos: Math.round(50 + Math.sin(i * 0.5) * 35 + (i % 7) * 2),
  })),
};
const FAKE_TAGS = [
  { id: 'tease',   label: 'tease',   color: '#4dabf7' },
  { id: 'build',   label: 'build',   color: '#ffb547' },
  { id: 'climax',  label: 'climax',  color: '#ff7b7b' },
  { id: 'recover', label: 'recover', color: '#3ed598' },
];
const FAKE_PHRASES = [
  { id: 'p-1', start:       0, end:  60_000, tag: 'tease',   bpm:  48 },
  { id: 'p-2', start:  60_000, end: 180_000, tag: 'build',   bpm:  82 },
  { id: 'p-3', start: 180_000, end: 260_000, tag: 'climax',  bpm: 134 },
  { id: 'p-4', start: 260_000, end: 300_000, tag: 'recover', bpm:  72 },
];

const TABS = [
  { id: 'viewer',     label: 'Viewer',     icon: 'film',     pipeline: 'viewer'     },
  { id: 'curve',      label: 'Curve',      icon: 'activity', pipeline: 'curve'      },
  { id: 'transform',  label: 'Transform',  icon: 'sliders',  pipeline: 'transform'  },
  { id: 'primitives', label: 'Primitives', icon: 'layers',   pipeline: 'primitives' },
];

// Small fake transform catalog so TransformPanel has something to chew
// on. Real consumers (FFP) pass a much larger catalog (~30 transforms
// across categories) — the panel is parametric so it doesn't care
// about size.
const FAKE_TRANSFORMS = [
  // tone
  { id: 'tone.warm',   category: 'tone', label: 'Warm',
    summary: 'Smooth out hard transients; round off the curve.',
    description: 'Applies a gentle low-pass over the action sequence so peaks and valleys feel less abrupt. Useful for shifting a percussive script towards a more sustained feel without losing rhythm.',
    params: [
      { id: 'amount', label: 'Amount', min: 0, max: 100, step: 1, default: 60, unit: '%' },
    ],
    bestFor: ['tease', 'recover'] },
  { id: 'tone.bright', category: 'tone', label: 'Bright',
    summary: 'Sharpen transients; emphasize attack.',
    description: 'High-pass-style emphasis on action edges. Pairs well with percussive source material and the climax phrase tag.',
    params: [
      { id: 'amount', label: 'Amount', min: 0, max: 100, step: 1, default: 70, unit: '%' },
      { id: 'gate',   label: 'Gate',   min: 0, max: 50,  step: 1, default: 8 },
    ],
    bestFor: ['climax'] },
  // behavior
  { id: 'behavior.halve',  category: 'behavior', label: 'Halve density',
    summary: 'Keep every other action.',
    description: 'Removes alternate actions. Use when a section feels too busy — fast → steady, steady → slow.',
    params: [],
    bestFor: ['build', 'climax'] },
  { id: 'behavior.double', category: 'behavior', label: 'Double density',
    summary: 'Interpolate between adjacent actions.',
    description: 'Inserts a midpoint between every adjacent pair of actions. Useful for slow sections that need more motion without changing the shape.',
    params: [],
    bestFor: ['build'] },
  { id: 'behavior.swing',  category: 'behavior', label: 'Swing',
    summary: 'Apply a triplet-ish rhythm to even-spaced actions.',
    description: 'Shifts every second action slightly later in time, giving a swing/shuffle feel without changing the position values.',
    params: [
      { id: 'amount',  label: 'Amount',  min: 0, max: 100, step: 1, default: 40, unit: '%' },
    ] },
  // structural
  { id: 'structural.fade-out', category: 'structural', label: 'Fade out',
    summary: 'Linear amplitude decay over the phrase.',
    description: 'Multiplies position values by a falling ramp from 1.0 at the start to 0.0 at the end of the phrase. Useful for resolution sections.',
    params: [
      { id: 'curve', label: 'Curve', min: 0, max: 100, step: 1, default: 50,
        unit: '%' },
    ],
    bestFor: ['recover'] },
];

const HELP_ITEMS = [
  { icon: 'file-text', label: 'README',          sub: 'github.com/liquid-releasing/forgemoment',
    href: 'https://github.com/liquid-releasing/forgemoment' },
  { icon: 'info',      label: 'About forgemoment', sub: 'v0.0.x · MIT license' },
];

export function App() {
  // Initial chapter scope is the second chapter (Build, 60_000ms+). The
  // playhead initializes inside that scope so first impression is "the
  // baton is right at the chapter start" rather than "the baton is
  // faded and far to the left because the playhead is 60s before the
  // visible scope." Library is doing the right thing (showing the
  // "out-of-scope" indicator); the playground just needs to start
  // inside the scope.
  const initialScopedChapter = INITIAL_CHAPTERS[1];
  const [currentMs, setCurrentMs] = useState(initialScopedChapter.at_ms);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState('video');
  const [batonObservers, setBatonObservers] = useState({ count: 0, lastMs: 0 });
  const [marks, setMarks] = useState([]);
  const [markLabel, setMarkLabel] = useState('Chapter');
  const [chapters, setChapters] = useState(INITIAL_CHAPTERS);
  const [scopedChapterId, setScopedChapterId] = useState(initialScopedChapter.id);
  const [scriptViewport, setScriptViewport] = useState('chapter');
  const [selectedPhraseId, setSelectedPhraseId] = useState(null);
  const [activeTab, setActiveTab] = useState('viewer');
  const [accepted, setAccepted] = useState(false);
  // Transform tab state — TransformPanel is fully controlled, so the
  // parent owns category / selected transform / parameter values.
  const [transformCategory, setTransformCategory] = useState('behavior');
  const [transformId, setTransformId] = useState('behavior.halve');
  const [transformParams, setTransformParams] = useState({});
  const [appliedTransform, setAppliedTransform] = useState(null);

  const scopedChapter = chapters.find((c) => c.id === scopedChapterId) || null;
  const viewerChapter = scopedChapter && {
    id: scopedChapter.id,
    title: scopedChapter.name,
    color: scopedChapter.color,
    start: scopedChapter.at_ms,
    end:   scopedChapter.end_ms,
  };

  // Fake play loop: drives currentMs forward in real time so the
  // master-clock contract has something visible to lock onto.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setCurrentMs((ms) => {
        const next = ms + dt;
        if (next >= TRACK_DURATION_MS) return TRACK_DURATION_MS;
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const handleTimeChange = (ms) => {
    setBatonObservers((b) => ({ count: b.count + 1, lastMs: ms }));
  };

  // Build the ScopePicker entries from the chapter list + a virtual
  // "All chapters" entry. The picker drives the same scopedChapterId
  // the ChapterStrip and MediaViewer read.
  const scopeOptions = [
    { id: '__all', title: 'All chapters', color: '#94a3b8' },
    ...chapters.map((c) => ({
      id: c.id, title: c.name, color: c.color, start: c.at_ms, end: c.end_ms,
    })),
  ];
  const scopeValue = scopedChapterId ?? '__all';
  // When the scope changes, also seek the playhead into the new scope.
  // Without this, scoping to a chapter that doesn't contain currentMs
  // leaves the baton out-of-range and the play loop has to crawl
  // through dead time before the playhead enters the visible scope.
  // ChapterStrip already does this on click (onSelect + onSeek); the
  // TopBar ScopePicker has to do it explicitly because ScopePicker is
  // a generic picker that doesn't know "scopes have time ranges."
  const handleScopeChange = (id) => {
    setScopedChapterId(id === '__all' ? null : id);
    if (id !== '__all') {
      const ch = chapters.find((c) => c.id === id);
      if (ch) setCurrentMs(ch.at_ms);
    }
  };

  // Pipeline state for the TabStrip — flips on "Accept" in any tab.
  // Demonstrates the green-dot + ready-state machinery without
  // hardwiring a real pipeline.
  const pipelineState = {
    viewer:     { accepted: activeTab !== 'viewer' || accepted },
    curve:      { accepted: false },
    transform:  { accepted: !!appliedTransform },
    primitives: { accepted: false },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', minHeight: 0 }}>
      <TopBar
        logo={
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            paddingRight: 4,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-warm) 100%)',
            }} />
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>
              forgemoment
            </span>
          </div>
        }
        file={{
          title: 'demo-track.mp4',
          durationMs: TRACK_DURATION_MS,
          phraseCount: FAKE_PHRASES.length,
          actionCount: FAKE_FUNSCRIPT.actions.length,
        }}
        badge={<Pill tone="accent" dot>playground</Pill>}
        scope={
          <ScopePicker
            scopes={scopeOptions}
            value={scopeValue}
            onChange={handleScopeChange}
          />
        }
        leftActions={
          <>
            <Button kind="ghost" size="icon" title="Undo"><span style={{ fontSize: 14 }}>↶</span></Button>
            <Button kind="ghost" size="icon" title="Redo"><span style={{ fontSize: 14 }}>↷</span></Button>
          </>
        }
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
        pipelineState={pipelineState}
        helpItems={HELP_ITEMS}
      />

      <TabBody>
        {activeTab === 'viewer' && (
          <ViewerTab
            currentMs={currentMs} setCurrentMs={setCurrentMs}
            isPlaying={isPlaying} setIsPlaying={setIsPlaying}
            mode={mode} setMode={setMode}
            batonObservers={batonObservers} handleTimeChange={handleTimeChange}
            marks={marks} setMarks={setMarks}
            markLabel={markLabel} setMarkLabel={setMarkLabel}
            chapters={chapters} setChapters={setChapters}
            scopedChapterId={scopedChapterId} setScopedChapterId={setScopedChapterId}
            viewerChapter={viewerChapter} scopedChapter={scopedChapter}
          />
        )}
        {activeTab === 'curve' && (
          <CurveTab
            currentMs={currentMs} setCurrentMs={setCurrentMs}
            isPlaying={isPlaying} setIsPlaying={setIsPlaying}
            scriptViewport={scriptViewport} setScriptViewport={setScriptViewport}
            selectedPhraseId={selectedPhraseId} setSelectedPhraseId={setSelectedPhraseId}
            scopedChapter={scopedChapter}
            chapters={chapters}
          />
        )}
        {activeTab === 'transform' && (
          <TransformTab
            category={transformCategory} setCategory={setTransformCategory}
            transformId={transformId} setTransformId={setTransformId}
            params={transformParams} setParams={setTransformParams}
            applied={appliedTransform} setApplied={setAppliedTransform}
          />
        )}
        {activeTab === 'primitives' && (
          <PrimitivesTab mode={mode} setMode={setMode} />
        )}
      </TabBody>

      {activeTab === 'viewer' && (
        <AcceptBar
          summary="Demo of AcceptBar — the pipeline ready-state machinery."
          chainFile="viewer.chain.json"
          accepted={accepted}
          onAccept={() => setAccepted((a) => !a)}
          onReset={() => setAccepted(false)}
        />
      )}

      <StatusBar
        synced
        scope={scopedChapter ? scopedChapter.name : 'all chapters'}
        chainFile="viewer.chain.json"
        version="forgemoment v0.0.2 · playground"
      />
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────

function ViewerTab({
  currentMs, setCurrentMs, isPlaying, setIsPlaying, mode, setMode,
  batonObservers, handleTimeChange,
  marks, setMarks, markLabel, setMarkLabel,
  chapters, setChapters, scopedChapterId, setScopedChapterId,
  viewerChapter, scopedChapter,
}) {
  return (
    <>
      <TabHeader
        eyebrow="Viewer"
        title="MediaViewer + ChapterStrip + master clock"
        subtitle="Three-mode thumbnail with a sibling subscriber locked to the Viewer's emitted time. Mark with +Chapter to append to the strip below; click any chapter to scope + seek the Viewer to it."
      />

      <SectionLabel right={
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'none' }}>
          {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
          {scopedChapter && ` · scoped: ${scopedChapter.name}`}
        </span>
      }>
        Chapter strip — click to scope + seek
      </SectionLabel>
      <div style={{ marginBottom: 22 }}>
        <ChapterStrip
          chapters={chapters}
          totalMs={TRACK_DURATION_MS}
          currentMs={currentMs}
          selectedId={scopedChapterId}
          onSelect={(ch) => setScopedChapterId(ch.id)}
          onSeek={setCurrentMs}
        />
      </div>

      <Card padding={20}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <MediaViewer
            currentMs={currentMs}
            isPlaying={isPlaying}
            mode={mode}
            onModeChange={setMode}
            onPlayPause={() => setIsPlaying((p) => !p)}
            onSeek={setCurrentMs}
            onTimeChange={handleTimeChange}
            onPrev={() => setCurrentMs(Math.max(0, currentMs - 30_000))}
            onNext={() => setCurrentMs(Math.min(TRACK_DURATION_MS, currentMs + 30_000))}
            onMark={(ms) => {
              setMarks((m) => [...m, { kind: markLabel, at_ms: ms }]);
              if (markLabel === 'Chapter') {
                const newId = `ch-mark-${Date.now()}`;
                setChapters((cs) => [
                  ...cs,
                  { id: newId, name: `Chapter ${cs.length + 1}`, at_ms: ms },
                ].sort((a, b) => a.at_ms - b.at_ms));
              }
            }}
            markLabel={markLabel}
            chapter={viewerChapter}
            totalMs={TRACK_DURATION_MS}
            audioWaveform={FAKE_WAVEFORM}
            funscript={FAKE_FUNSCRIPT}
            width={320}
            height={280}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SiblingClockSubscriber observers={batonObservers} currentMs={currentMs} />
            <MarksCard
              marks={marks}
              markLabel={markLabel}
              onLabelChange={setMarkLabel}
              onClear={() => setMarks([])}
            />
            <Field label="Scrub (parent owns time; Viewer reflects)">
              <Slider
                min={0}
                max={TRACK_DURATION_MS}
                step={100}
                value={currentMs}
                onChange={setCurrentMs}
                valueLabel={fmtTime(currentMs)}
              />
            </Field>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <HoldSeekButton direction={-1} currentMs={currentMs} totalMs={TRACK_DURATION_MS} onSeek={setCurrentMs} />
              <HoldSeekButton direction={1}  currentMs={currentMs} totalMs={TRACK_DURATION_MS} onSeek={setCurrentMs} />
              <div style={{ flex: 1 }} />
              <Button kind={isPlaying ? 'danger' : 'primary'} onClick={() => setIsPlaying((p) => !p)}>
                {isPlaying ? 'Stop play loop' : 'Start play loop'}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}

function CurveTab({
  currentMs, setCurrentMs, isPlaying, setIsPlaying,
  scriptViewport, setScriptViewport,
  selectedPhraseId, setSelectedPhraseId, scopedChapter, chapters,
}) {
  // Selected phrase for the drill-in close-up. Falls back to whichever
  // phrase the playhead is currently inside, then to the first phrase.
  const focusPhrase = useMemo(() => {
    if (selectedPhraseId) {
      const hit = FAKE_PHRASES.find((p) => p.id === selectedPhraseId);
      if (hit) return hit;
    }
    return FAKE_PHRASES.find((p) => currentMs >= p.start && currentMs < p.end)
      ?? FAKE_PHRASES[0];
  }, [selectedPhraseId, currentMs]);

  // Actions inside the focused phrase — fed to the zoom chart.
  const focusActions = useMemo(
    () => FAKE_FUNSCRIPT.actions.filter(
      (a) => a.at >= focusPhrase.start && a.at <= focusPhrase.end
    ),
    [focusPhrase]
  );

  // Build a fake "transformed preview" by halving the action density —
  // gives PreviewChart + DiffSparkline visible deviation against the
  // original without needing a real transform pipeline.
  const previewActions = useMemo(
    () => FAKE_FUNSCRIPT.actions.filter((_, i) => i % 2 === 0),
    []
  );

  const scopeForPlayer = scopedChapter
    ? { kind: 'chapter', label: scopedChapter.name,
        start: scopedChapter.at_ms, end: scopedChapter.end_ms }
    : { kind: 'script', label: 'demo-track', start: 0, end: TRACK_DURATION_MS };

  return (
    <>
      <TabHeader
        eyebrow="Curve"
        title="ScriptChart — the funscript curve"
        subtitle="Phrase tag bands across the top, click-to-seek anywhere on the canvas. Viewport toggles between the scoped chapter and the full track."
        right={
          <Field label="Viewport">
            <Segmented
              options={[
                { value: 'chapter', label: 'Scoped chapter' },
                { value: 'track',   label: 'Full track' },
              ]}
              value={scriptViewport}
              onChange={setScriptViewport}
            />
          </Field>
        }
      />

      {/* ScopePlayer — composite player widget. Stylised poster + a
          scoped ScriptChart + transport row. Locks to the current scope
          (a chapter when one's picked, the whole script otherwise) and
          shares the master clock — clicking its chart strip seeks the
          rest of the app. */}
      <div style={{ marginBottom: 22 }}>
        <SectionLabel right={
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'none' }}>
            scope chip top-left · transport shares the master clock
          </span>
        }>
          ScopePlayer — composite player
        </SectionLabel>
        <ScopePlayer
          scope={scopeForPlayer}
          actions={FAKE_FUNSCRIPT.actions}
          phrases={FAKE_PHRASES}
          tags={FAKE_TAGS}
          currentMs={currentMs}
          isPlaying={isPlaying}
          onPlayPause={() => setIsPlaying((p) => !p)}
          onSeek={setCurrentMs}
        />
      </div>

      <ScriptChart
        actions={FAKE_FUNSCRIPT.actions}
        phrases={FAKE_PHRASES}
        tags={FAKE_TAGS}
        totalMs={TRACK_DURATION_MS}
        startMs={scriptViewport === 'chapter' && scopedChapter ? scopedChapter.at_ms : 0}
        endMs={scriptViewport === 'chapter' && scopedChapter ? scopedChapter.end_ms : TRACK_DURATION_MS}
        currentMs={currentMs}
        onSeek={setCurrentMs}
        selectedPhraseId={selectedPhraseId}
        onSelectPhrase={setSelectedPhraseId}
        height={260}
      />

      {/* BpmBandChart — the "colored funscript" overview. Phrase
          boundaries become full-height bands tinted by BPM tier
          (high/mid/low). Same data as the ScriptChart above; different
          visualization. The canonical Export-tab preview across FFP /
          forgegen / beatflo. */}
      <div style={{ marginTop: 22 }}>
        <SectionLabel right={
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'none' }}>
            Click to seek · playhead syncs with the rest of the app
          </span>
        }>
          BpmBandChart — colored funscript overview
        </SectionLabel>
        <BpmBandChart
          actions={FAKE_FUNSCRIPT.actions}
          phrases={FAKE_PHRASES}
          totalMs={TRACK_DURATION_MS}
          title="demo-track.funscript"
          currentMs={currentMs}
          onSeek={setCurrentMs}
          height={240}
        />
      </div>

      {/* PreviewChart — Original vs Preview, stacked. Halved-density
          preview gives a visible before/after even with no real
          transform pipeline behind it. */}
      <div style={{ marginTop: 22 }}>
        <SectionLabel right={
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'none' }}>
            BPM-tier tone per row · `highlight` prop ranges both charts
          </span>
        }>
          PreviewChart — Original vs Preview
        </SectionLabel>
        <Card padding={14}>
          <PreviewChart
            original={{
              actions: FAKE_FUNSCRIPT.actions,
              bpm: 92, start: 0, end: TRACK_DURATION_MS,
            }}
            preview={{
              actions: previewActions,
              bpm: 64, start: 0, end: TRACK_DURATION_MS,
            }}
            label="Preview · density × 0.5"
            highlight={scopedChapter
              ? { start: scopedChapter.at_ms, end: scopedChapter.end_ms,
                  label: scopedChapter.name }
              : undefined}
          />
        </Card>
      </div>

      {/* PhraseDetailZoomChart — drill-in companion to BpmBandChart.
          Every action drawn as a connected dot inside the focused
          phrase; click the BPM ribbon on the ScriptChart above to
          switch the focus. */}
      <div style={{ marginTop: 22 }}>
        <SectionLabel right={
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'none' }}>
            focused phrase: {focusPhrase.id} · {focusActions.length} actions inside
          </span>
        }>
          PhraseDetailZoomChart — single-phrase close-up
        </SectionLabel>
        <PhraseDetailZoomChart
          phrase={focusPhrase}
          actions={focusActions}
          index={FAKE_PHRASES.indexOf(focusPhrase)}
        />
      </div>

      {/* Small charts grid — MiniWave per chapter, Sparkline per
          phrase, and a single DiffSparkline summary. Mirrors how a
          consuming app uses these inside list rows / table cells. */}
      <div style={{ marginTop: 22 }}>
        <SectionLabel>Small charts — MiniWave / Sparkline / DiffSparkline</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card padding={14}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              MiniWave — one per chapter
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {chapters.map((ch) => (
                <div key={ch.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>{ch.name}</span>
                  <MiniWave seed={ch.id} color={ch.color} />
                </div>
              ))}
            </div>
          </Card>
          <Card padding={14}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Sparkline — one per phrase
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FAKE_PHRASES.map((p) => {
                const phraseActions = FAKE_FUNSCRIPT.actions.filter(
                  (a) => a.at >= p.start && a.at <= p.end
                );
                const tagDef = FAKE_TAGS.find((t) => t.id === p.tag);
                return (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>{tagDef?.label ?? p.tag}</span>
                    <Sparkline
                      actions={phraseActions}
                      start={p.start} end={p.end}
                      color={tagDef?.color ?? 'var(--accent)'}
                      filled
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
        <Card padding={14} style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
              DiffSparkline — Original (ghost) vs Preview (filled)
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {FAKE_FUNSCRIPT.actions.length} → {previewActions.length} actions
            </span>
          </div>
          <DiffSparkline
            original={FAKE_FUNSCRIPT.actions}
            preview={previewActions}
            start={0} end={TRACK_DURATION_MS}
            height={56}
          />
        </Card>
      </div>
    </>
  );
}

function TransformTab({
  category, setCategory, transformId, setTransformId,
  params, setParams, applied, setApplied,
}) {
  // When the user picks a different category, also pick the first
  // transform in that category. Without this, transformId can point
  // to a value that's filtered out of the visible dropdown, leaving
  // the select with an out-of-range value.
  const handleCategoryChange = (next) => {
    setCategory(next);
    const first = FAKE_TRANSFORMS.find((t) => t.category === next);
    if (first) setTransformId(first.id);
    setParams({});
  };

  const handleTransformChange = (id) => {
    setTransformId(id);
    setParams({});
  };

  const handleApply = () => {
    const tx = FAKE_TRANSFORMS.find((t) => t.id === transformId);
    if (!tx) return;
    setApplied({
      label: tx.label,
      params: params,
      at: new Date().toLocaleTimeString(),
    });
  };

  const handleCancel = () => {
    setApplied(null);
    setParams({});
  };

  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'stretch', minHeight: 540 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <TabHeader
          eyebrow="Transform"
          title="TransformPanel — right-side editor"
          subtitle="Category radio · transform select (filtered by category) · dynamic parameter sliders · Apply/Cancel. Catalog + tags are consumer-owned props; the panel is fully controlled."
        />
        <Card padding={20}>
          <SectionLabel>About this demo</SectionLabel>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            The catalog here is{' '}
            <code style={{
              background: 'var(--surface-2)', padding: '1px 6px',
              borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 12,
            }}>FAKE_TRANSFORMS</code> — a small {FAKE_TRANSFORMS.length}-entry array.
            Real consumers pass a much larger catalog (FFP ships ~30
            transforms across categories) — TransformPanel is parametric
            so it doesn&apos;t care about size.
          </div>
        </Card>
        <Card padding={20}>
          <SectionLabel>Apply result</SectionLabel>
          {applied
            ? (
              <div style={{ fontSize: 13, color: 'var(--text)' }}>
                <div style={{ marginBottom: 8 }}>
                  Applied <strong>{applied.label}</strong> at{' '}
                  <span className="mono">{applied.at}</span>
                </div>
                <pre style={{
                  margin: 0, padding: 10, borderRadius: 6,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  fontSize: 11, color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {JSON.stringify(applied.params, null, 2)}
                </pre>
              </div>
            )
            : <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Nothing applied yet — pick a transform and hit Apply.</div>
          }
        </Card>
      </div>
      <TransformPanel
        transforms={FAKE_TRANSFORMS}
        category={category}
        onCategoryChange={handleCategoryChange}
        transformId={transformId}
        onTransformChange={handleTransformChange}
        params={params}
        onParamsChange={setParams}
        onApply={handleApply}
        onCancel={handleCancel}
      />
    </div>
  );
}

function PrimitivesTab({ mode, setMode }) {
  return (
    <>
      <TabHeader
        eyebrow="Primitives"
        title="Base UI kit"
        subtitle="The small components every studio app composes with. Pulled straight from primitives.jsx."
      />
      <Card padding={20}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
          <Field label="Buttons">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button kind="primary">Primary</Button>
              <Button kind="secondary">Secondary</Button>
              <Button kind="ghost">Ghost</Button>
              <Button kind="danger">Danger</Button>
              <Button kind="success">Success</Button>
              <Button icon="play">With icon</Button>
            </div>
          </Field>
          <Field label="Pills">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pill>neutral</Pill>
              <Pill tone="success" dot>success</Pill>
              <Pill tone="warn">warn</Pill>
              <Pill tone="danger" dot>danger</Pill>
              <Pill tone="info">info</Pill>
              <Pill tone="accent" dot>accent</Pill>
            </div>
          </Field>
          <Field label="Text input">
            <TextInput placeholder="type here" />
          </Field>
          <Field label="Segmented" hint={`current mode: ${mode}`}>
            <Segmented
              options={['video', 'audio', 'funscript']}
              value={mode}
              onChange={setMode}
            />
          </Field>
        </div>
      </Card>
    </>
  );
}

// ─── Cards used inside ViewerTab ────────────────────────────────────

function MarksCard({ marks, markLabel, onLabelChange, onClear }) {
  const LABEL_OPTIONS = ['Chapter', 'Beat', 'Note', 'Cue'];
  return (
    <Card padding={14}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Marks via Viewer&apos;s +{markLabel}
        </div>
        {marks.length > 0 && (
          <button
            onClick={onClear}
            style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 4,
              background: 'transparent', color: 'var(--text-dim)',
              border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            clear
          </button>
        )}
      </div>
      <div style={{ marginBottom: 10 }}>
        <Field label="What does +the-button mean right now?" hint="Swap to see one button take on different meanings.">
          <Segmented options={LABEL_OPTIONS} value={markLabel} onChange={onLabelChange} />
        </Field>
      </div>
      {marks.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>none yet — tap ➕ {markLabel} on the Viewer</div>
        : (
          <div className="mono" style={{ fontSize: 11, color: 'var(--text)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {marks.map((m, i) => (
              <span key={i} style={{
                padding: '2px 6px', borderRadius: 4,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
              }}>
                <span style={{ color: 'var(--text-muted)' }}>{m.kind}</span> {fmtTime(m.at_ms)}
              </span>
            ))}
          </div>
        )
      }
    </Card>
  );
}

function SiblingClockSubscriber({ observers, currentMs }) {
  return (
    <Card padding={14} style={{ borderColor: 'var(--accent)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        Sibling baton (subscribed to MediaViewer.onTimeChange)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>fires</div>
          <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{observers.count}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>last reported ms</div>
          <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{fmtTime(observers.lastMs)}</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        Viewer reports: <span className="mono">{fmtTime(currentMs)}</span>. Sibling stays locked.
      </div>
    </Card>
  );
}
