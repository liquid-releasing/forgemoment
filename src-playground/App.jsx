// Playground for forgemoment — dogfood the components against a fake
// playback loop so the master-clock contract is visible at a glance.
//
// Run with `npm run dev` from the forgemoment/ repo root; opens at
// http://localhost:5174.

import { useEffect, useState } from 'react';
import {
  Button, Card, ChapterStrip, Field, HoldSeekButton, MediaViewer, Pill,
  SectionHeading, Segmented, Slider, TextInput, fmtTime,
} from 'forgemoment';

const TRACK_DURATION_MS = 300_000; // 5 minutes

// Seed chapters — gives the ChapterStrip something to render on first
// load and demonstrates the +Mark → ChapterStrip → MediaViewer scope
// loop without forcing the user to mark three chapters before anything
// renders. Names/colors mirror the canonical music/ambient template
// so the playground reads like real content.
const INITIAL_CHAPTERS = [
  { id: 'ch-1', name: 'Intro',  at_ms:      0, end_ms:  60_000, color: '#3ed598' },
  { id: 'ch-2', name: 'Build',  at_ms: 60_000, end_ms: 180_000, color: '#4dabf7' },
  { id: 'ch-3', name: 'Climax', at_ms: 180_000, end_ms: 260_000, color: '#ff7b7b' },
  { id: 'ch-4', name: 'Outro',  at_ms: 260_000, end_ms: 300_000, color: '#ffb547' },
];

// Synthetic data the data-driven MediaViewer renderers can chew on.
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

export function App() {
  // The master clock — owned by the parent here so we can demonstrate
  // a play loop. In the real apps, this would be wired to a <video>
  // element's timeupdate event or to a Web Audio AudioContext clock.
  const [currentMs, setCurrentMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState('video');
  const [batonObservers, setBatonObservers] = useState({ count: 0, lastMs: 0 });
  // Chapters created from the Viewer's +Chapter button land here so the
  // playground can prove the callback fires. Real consumers would push
  // into a sidecar / chapter list and re-render.
  const [marks, setMarks] = useState([]);
  // The +<markLabel> button is a generic integration point — the
  // playground swaps the label to show that the SAME button can mean
  // "create chapter" or "drop a beat" or "tag a note" depending on
  // what the consuming app wires onMark to.
  const [markLabel, setMarkLabel] = useState('Chapter');
  // The full chapter list the ChapterStrip renders. Marks the user
  // adds via +Chapter prepend to this list (with auto-cycled palette
  // colour); the Strip is click-to-select; whichever chapter is
  // selected becomes the MediaViewer's `chapter` prop so the Viewer
  // scopes to that chapter's slice.
  const [chapters, setChapters] = useState(INITIAL_CHAPTERS);
  const [scopedChapterId, setScopedChapterId] = useState(INITIAL_CHAPTERS[1].id);
  const scopedChapter = chapters.find((c) => c.id === scopedChapterId) || null;
  // MediaViewer's existing `chapter` prop wants {id, title, color, start, end}
  // — map our richer chapter shape into that.
  const viewerChapter = scopedChapter && {
    id: scopedChapter.id,
    title: scopedChapter.name,
    color: scopedChapter.color,
    start: scopedChapter.at_ms,
    end:   scopedChapter.end_ms,
  };

  // Fake play loop: 24fps simulated playback. Demonstrates that the
  // Viewer's onTimeChange fires as the clock advances.
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

  // "Other baton" — pretends to be a sibling subview that subscribes to
  // the Viewer's master clock. Counter + last-ms readout proves the
  // signal is firing.
  const handleTimeChange = (ms) => {
    setBatonObservers((b) => ({ count: b.count + 1, lastMs: ms }));
  };

  return (
    <div style={{
      padding: 32, maxWidth: 1100, margin: '0 auto',
      display: 'flex', flexDirection: 'column', gap: 32,
    }}>
      <SectionHeading
        title="forgemoment playground"
        subtitle="Dogfood the components. The MediaViewer drives the master clock; the sibling card subscribes to it."
        right={<Pill tone="accent" dot>v0.0.1</Pill>}
      />

      {/* MediaViewer + sibling subscriber + ChapterStrip below */}
      <Card padding={20}>
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <span>Chapter strip — click to scope the viewer</span>
            <span className="mono" style={{ color: 'var(--text-dim)', fontSize: 10 }}>
              {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
              {scopedChapter && ` · scoped: ${scopedChapter.name}`}
            </span>
          </div>
          <ChapterStrip
            chapters={chapters}
            totalMs={TRACK_DURATION_MS}
            currentMs={currentMs}
            selectedId={scopedChapterId}
            onSelect={(ch) => setScopedChapterId(ch.id)}
            onSeek={setCurrentMs}
          />
        </div>
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
              // When the user is marking Chapters specifically, also
              // append to the live chapter list so the ChapterStrip
              // below the Viewer renders it immediately. Other mark
              // kinds (Beat / Note / Cue) just go to the marks card.
              if (markLabel === 'Chapter') {
                const newId = `ch-mark-${Date.now()}`;
                setChapters((cs) => {
                  // Insert in time order, then re-bound the neighbouring
                  // chapters' end_ms / at_ms so the strip stays gapless.
                  const next = [...cs, {
                    id: newId, name: `Chapter ${cs.length + 1}`,
                    at_ms: ms,
                  }];
                  return next.sort((a, b) => a.at_ms - b.at_ms);
                });
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

      {/* Primitives gallery */}
      <Card padding={20}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Primitives</h3>
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
    </div>
  );
}

function MarksCard({ marks, markLabel, onLabelChange, onClear }) {
  // The +<markLabel> button on the Viewer is a generic integration
  // point — the label here drives what the button says AND what the
  // collected marks get tagged as. Same code path; different meaning
  // per consumer. Switching the label mid-session shows the marks
  // collected under multiple labels, which is the real cross-app
  // story: one app might collect "Chapter" marks AND "Beat" marks
  // simultaneously by toggling.
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
