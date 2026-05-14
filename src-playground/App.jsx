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

import { useEffect, useState } from 'react';
import {
  AcceptBar, Button, Card, ChapterStrip, Field, HoldSeekButton,
  MediaViewer, Pill, ScopePicker, ScriptChart, SectionLabel, Segmented,
  Slider, StatusBar, TabBody, TabHeader, TabStrip, TextInput, TopBar,
  fmtTime,
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
  { id: 'p-1', start:       0, end:  60_000, tag: 'tease'   },
  { id: 'p-2', start:  60_000, end: 180_000, tag: 'build'   },
  { id: 'p-3', start: 180_000, end: 260_000, tag: 'climax'  },
  { id: 'p-4', start: 260_000, end: 300_000, tag: 'recover' },
];

const TABS = [
  { id: 'viewer',     label: 'Viewer',     icon: 'film',     pipeline: 'viewer'     },
  { id: 'curve',      label: 'Curve',      icon: 'activity', pipeline: 'curve'      },
  { id: 'primitives', label: 'Primitives', icon: 'layers',   pipeline: 'primitives' },
];

const HELP_ITEMS = [
  { icon: 'file-text', label: 'README',          sub: 'github.com/liquid-releasing/forgemoment',
    href: 'https://github.com/liquid-releasing/forgemoment' },
  { icon: 'info',      label: 'About forgemoment', sub: 'v0.0.x · MIT license' },
];

export function App() {
  const [currentMs, setCurrentMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState('video');
  const [batonObservers, setBatonObservers] = useState({ count: 0, lastMs: 0 });
  const [marks, setMarks] = useState([]);
  const [markLabel, setMarkLabel] = useState('Chapter');
  const [chapters, setChapters] = useState(INITIAL_CHAPTERS);
  const [scopedChapterId, setScopedChapterId] = useState(INITIAL_CHAPTERS[1].id);
  const [scriptViewport, setScriptViewport] = useState('chapter');
  const [selectedPhraseId, setSelectedPhraseId] = useState(null);
  const [activeTab, setActiveTab] = useState('viewer');
  const [accepted, setAccepted] = useState(false);

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
  const handleScopeChange = (id) => setScopedChapterId(id === '__all' ? null : id);

  // Pipeline state for the TabStrip — flips on "Accept" in any tab.
  // Demonstrates the green-dot + ready-state machinery without
  // hardwiring a real pipeline.
  const pipelineState = {
    viewer:     { accepted: activeTab !== 'viewer' || accepted },
    curve:      { accepted: false },
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
            scriptViewport={scriptViewport} setScriptViewport={setScriptViewport}
            selectedPhraseId={selectedPhraseId} setSelectedPhraseId={setSelectedPhraseId}
            scopedChapter={scopedChapter}
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
        version="forgemoment v0.0.x · playground"
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
  currentMs, setCurrentMs, scriptViewport, setScriptViewport,
  selectedPhraseId, setSelectedPhraseId, scopedChapter,
}) {
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
    </>
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
