// MediaViewer — the master clock viewer for the lqr studio family.
//
// Three display modes share one thumbnail canvas + one transport row.
// Per the 2026-05-10 Unified Viewer spec (project_unified_viewer_baton_master_clock):
//
//   1. **Video**     — video frame / poster at the current playback time
//   2. **Audio**     — waveform around the playhead (precise positioning;
//                      voice transients, silences, screams)
//   3. **Funscript** — funscript curve playing in real time, aligned to
//                      the baton (haptic-intent preview)
//
// The MediaViewer EMITS its current time as a signal — `onTimeChange(ms)`
// fires whenever the playhead moves. Other "batons" (sibling sub-views,
// PluginViews, external apps, network sessions) subscribe to that signal
// and stay in lock-step. The Viewer is single-source for time across the
// app; never maintain a parallel clock.
//
// Ported from forge-ui-design/iterations/08-redesign/design_files/MediaViewer.jsx,
// extended with the 3-mode toggle, the master-clock callback, and data-
// pluggable visualizations (videoSrc / audioWaveform / funscript). When
// the data props aren't supplied, each mode renders the iter 08
// placeholder so the component is usable bare for layout work.
//
// Props (alphabetical):
//   audioWaveform     {peaks: number[], durationMs: number}  optional
//   chapter           {id, title, color, start, end}         optional
//                       When set, the baton position is computed
//                       relative to chapter.start/end instead of
//                       absolute totalMs. Matches iter 08 behaviour.
//   currentMs         number                                  playhead in ms
//   funscript         {actions: [{at: ms, pos: 0-100}]}      optional
//   height            number (px)                             optional
//   isPlaying         boolean                                 default false
//   media             {kind: 'video'|'audio', title?: string} default video
//                       Used for the corner label only — the mode
//                       toggle takes precedence for what renders.
//   mode              'video' | 'audio' | 'funscript'         optional
//                       Controlled mode. If absent, the Viewer
//                       manages its own mode state initialised to
//                       `defaultMode`.
//   defaultMode       same                                    default 'video'
//   markLabel         string                                  default 'Chapter'
//                       Label shown on the +<label> button. The button
//                       is a generic integration point; consumers
//                       co-opt it to mean whatever fits their app —
//                       "Chapter", "Beat", "Cue", "Note", "Event", etc.
//                       Just renames the button; the meaning is in the
//                       onMark callback the consumer wires.
//   nextTitle         string                                  optional
//   onMark            (ms) => void                            optional
//                       Fires when the +<markLabel> button is pressed,
//                       with the current playhead position in ms. The
//                       consumer decides what to do with it (create a
//                       chapter, drop a marker on a script, fire an
//                       event, etc.).
//   onModeChange      (mode) => void                          optional
//                       Fires when the user toggles modes. If
//                       `mode` is controlled, the parent must
//                       reflect this back into the prop.
//   onNext            () => void                              optional
//   onPlayPause       () => void                              optional
//   onPrev            () => void                              optional
//   onSeek            (ms) => void                            optional
//   onTimeChange      (ms) => void                            optional
//                       Master clock signal. Fires whenever
//                       currentMs changes. Subscribers follow.
//   prevTitle         string                                  optional
//   showMark          boolean                                 default true
//                       Hide the +<markLabel> button entirely if the
//                       consuming app doesn't want a marking action.
//   showModeToggle    boolean                                 default true
//                       Hide the mode chip strip if the
//                       consuming app pins to a single mode.
//   totalMs           number                                  optional
//                       Falls back to chapter.end - chapter.start
//                       when chapter is set; otherwise required to
//                       compute baton position outside a chapter.
//   videoSrc          string                                  optional
//                       URL of the actual video to render. When
//                       absent, the iter 08 stylised poster
//                       renders instead. NOTE: native <video>
//                       integration is intentionally simple here
//                       — for frame-accurate seek the consumer
//                       wires its own <video ref> and feeds
//                       currentMs back.
//   width             number (px)                             default 240

import { useEffect, useState } from 'react';
import { Icon, Segmented } from './primitives.jsx';

const MODE_OPTIONS = [
  { value: 'video',     label: 'Video' },
  { value: 'audio',     label: 'Audio' },
  { value: 'funscript', label: 'Funscript' },
];

export function MediaViewer({
  audioWaveform,
  chapter,
  currentMs = 0,
  defaultMode = 'video',
  funscript,
  height,
  isPlaying = false,
  markLabel = 'Chapter',
  media = { kind: 'video', title: 'preview' },
  mode: modeProp,
  nextTitle = 'Next chapter',
  onMark,
  onModeChange,
  onNext,
  onPlayPause,
  onPrev,
  onSeek,
  onTimeChange,
  prevTitle = 'Previous chapter',
  showMark = true,
  showModeToggle = true,
  totalMs,
  videoSrc,
  width = 240,
  // Back-compat aliases. Older callers may pass onCreateChapter /
  // showCreateChapter; we accept them transparently. Drop after the
  // first consumer migration is complete (probably v0.1).
  onCreateChapter,
  showCreateChapter,
  // Older callers also used onPrevChapter / onNextChapter for the
  // chapter-nav buttons.
  onPrevChapter,
  onNextChapter,
}) {
  // Resolve back-compat aliases. onMark wins if both are set; otherwise
  // fall back to the legacy name. Same for showMark / showCreateChapter.
  const onMarkResolved = onMark ?? onCreateChapter;
  const showMarkResolved = showCreateChapter ?? showMark;
  // Mode state — controlled when `mode` prop is supplied, uncontrolled
  // otherwise. Either way we expose `onModeChange` so a controlled
  // consumer can intercept and an uncontrolled consumer can observe.
  const [internalMode, setInternalMode] = useState(defaultMode);
  const mode = modeProp ?? internalMode;
  const handleModeChange = (next) => {
    if (modeProp === undefined) setInternalMode(next);
    onModeChange?.(next);
  };

  // Master clock — emit on every currentMs change so subscribers stay
  // in sync. This is THE contract that makes MediaViewer the time-
  // backbone of the toolchain.
  useEffect(() => {
    onTimeChange?.(currentMs);
  }, [currentMs, onTimeChange]);

  // Back-compat: callers may still pass onPrevChapter/onNextChapter.
  const prev = onPrev ?? onPrevChapter;
  const next = onNext ?? onNextChapter;

  // Position the baton inside the thumbnail. When a chapter is set,
  // it's chapter-relative (the viewer renders the chapter's slice).
  // Otherwise it's absolute against totalMs.
  const batonRange = chapter
    ? { start: chapter.start, end: chapter.end }
    : { start: 0, end: totalMs ?? 1 };
  const batonDur = Math.max(1, batonRange.end - batonRange.start);
  const rawBatonPos = (currentMs - batonRange.start) / batonDur;
  const batonPos = Math.min(1, Math.max(0, rawBatonPos));
  // Out-of-scope: playhead is outside the chapter range. We still draw
  // the baton (clamped to the edge) but faded and with a direction
  // arrow at the matching edge, so the user reads "playhead is past
  // the chapter end →" instead of "the baton broke." This was a real
  // dogfood confusion 2026-05-14.
  const outOfScope = chapter && (rawBatonPos < 0 || rawBatonPos > 1);
  const outDirection = rawBatonPos > 1 ? 'after' : rawBatonPos < 0 ? 'before' : null;

  const stepFrame = (dir) => {
    // Frame jog is for precise inspection — pause first if playing so
    // the playhead doesn't blow past the new position on the next
    // frame. Back-5s and chapter-nav stay playing (matches YouTube /
    // generic player conventions). Fix triggered by user observation
    // 2026-05-14: "frame-forward looked broken because playback
    // continued past the new position."
    if (isPlaying) onPlayPause?.();
    // ~30 fps step (33ms). Frame jog is consumer-tunable via onSeek.
    onSeek?.((currentMs || 0) + dir * 33);
  };
  const back5 = () => onSeek?.(Math.max(0, (currentMs || 0) - 5000));

  return (
    <div style={{
      width, height, flexShrink: 0,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Mode toggle — chip strip pinned above the thumbnail. Pinning
          above rather than overlaying keeps the canvas content clean
          and gives the toggle a stable hit target regardless of mode. */}
      {showModeToggle && (
        <div style={{
          padding: '6px 8px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'center',
        }}>
          <Segmented options={MODE_OPTIONS} value={mode} onChange={handleModeChange} />
        </div>
      )}

      {/* Thumbnail — one of three modes renders inside. Baton overlays
          all three. Corner labels stay the same so the user always
          knows what they're looking at. */}
      <div style={{
        flex: 1, minHeight: 0,
        background: 'linear-gradient(135deg, #16181d 0%, #1f242c 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {mode === 'video' && (
          videoSrc
            ? <video src={videoSrc} muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <VideoPoster title={media.title} />
        )}
        {mode === 'audio' && (
          audioWaveform
            ? <WaveformCanvas waveform={audioWaveform} batonPos={batonPos} />
            : <AudioWavePlaceholder />
        )}
        {mode === 'funscript' && (
          funscript
            ? <FunscriptCurve actions={funscript.actions} batonRange={batonRange} />
            : <FunscriptPlaceholder />
        )}

        {/* Baton — the playhead. Same look across modes.
            `transform: translateX(-50%)` centers the 1.5px line on
            its position so the baton stays visible at both edges
            (without this, batonPos=1 puts the line's left edge at
            the container's right edge and the whole 1.5px gets
            clipped by overflow:hidden — looked like "disappeared").
            When out of scope (playhead past chapter.end or before
            chapter.start), draw faded so the user reads "playhead is
            outside this chapter" not "the baton broke". The arrow
            chip below makes the direction explicit. */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${batonPos * 100}%`,
          width: 1.5,
          transform: 'translateX(-50%)',
          background: outOfScope ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.85)',
          boxShadow: outOfScope ? 'none' : '0 0 6px rgba(255,255,255,0.45)',
          pointerEvents: 'none',
        }} />
        {outOfScope && (
          <div style={{
            position: 'absolute',
            top: 6,
            ...(outDirection === 'after'
              ? { right: 4 }
              : { left: 4 }),
            padding: '2px 6px',
            borderRadius: 4,
            background: 'rgba(0,0,0,0.55)',
            color: 'rgba(255,255,255,0.85)',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}>
            {outDirection === 'after' ? 'past end →' : '← before start'}
          </div>
        )}

        {/* Corner mode label — redundant with the toggle but useful
            when the toggle is hidden via showModeToggle=false. */}
        <div style={{
          position: 'absolute', top: 6, left: 8,
          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase',
        }}>
          {mode}
        </div>

        {chapter && (
          <div style={{
            position: 'absolute', bottom: 6, left: 8, right: 8,
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 9.5, color: 'rgba(255,255,255,0.8)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: chapter.color }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chapter.title}
            </span>
          </div>
        )}
      </div>

      {/* Time readout */}
      <div className="mono" style={{
        padding: '5px 10px', fontSize: 10.5,
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{fmtShort(currentMs)}</span>
        {chapter && <span>{fmtShort(chapter.end)}</span>}
        {!chapter && totalMs != null && <span>{fmtShort(totalMs)}</span>}
      </div>

      {/* Transport — chapter nav + frame jog + play/pause.
          Icon choices on the frame-jog (◀/▶ → step-back/step-forward):
          ◀ and ▶ next to ⏪ (back 5s) and ⏭ (next chapter) read as
          "back" + "fast-back" / "forward" + "fast-forward". The lucide
          step-back/step-forward glyphs (triangle + vertical bar) read
          unambiguously as single-frame step. Validated via user
          feedback 2026-05-14. */}
      <div style={{
        padding: '6px 8px', display: 'flex', gap: 4, justifyContent: 'center',
        borderTop: '1px solid var(--border)',
      }}>
        <TransportButton title={prevTitle} onClick={prev}>⏮</TransportButton>
        <TransportButton title="Frame back" onClick={() => stepFrame(-1)}>
          <Icon name="step-back" size={14} />
        </TransportButton>
        <TransportButton title="Back 5s" onClick={back5}>⏪</TransportButton>
        <TransportButton primary title={isPlaying ? 'Pause' : 'Play'} onClick={onPlayPause}>
          {isPlaying ? '⏸' : '▶'}
        </TransportButton>
        <TransportButton title="Frame forward" onClick={() => stepFrame(1)}>
          <Icon name="step-forward" size={14} />
        </TransportButton>
        <TransportButton title={nextTitle} onClick={next}>⏭</TransportButton>
      </div>

      {showMarkResolved && (
        <div style={{
          padding: '0 8px 8px', display: 'flex', gap: 4, justifyContent: 'center',
        }}>
          <button
            onClick={() => onMarkResolved?.(currentMs)}
            title={`Mark ${markLabel.toLowerCase()} at playhead`}
            style={{
              padding: '0 8px', height: 22,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              cursor: 'pointer', fontSize: 10.5,
              borderRadius: 6,
              fontFamily: 'inherit',
            }}
          >
            ➕ {markLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Transport button — small square / pill ──────────────────────
function TransportButton({ children, primary, ...rest }) {
  const base = {
    width: 26, height: 26, borderRadius: 6,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    cursor: 'pointer', fontSize: 13,
    display: 'grid', placeItems: 'center',
    fontFamily: 'inherit', padding: 0,
  };
  const primaryStyles = primary ? {
    width: 32, height: 32, borderRadius: 16,
    background: 'var(--accent)', borderColor: 'transparent',
    color: '#fff', fontSize: 14,
  } : {};
  return (
    <button {...rest} style={{ ...base, ...primaryStyles }}>
      {children}
    </button>
  );
}

// ─── Mode placeholders (iter 08 art) ─────────────────────────────
// These render when the consumer hasn't passed data for a mode yet.
// Each one is intentionally low-key so the absence of real data is
// obvious without being noisy.
function VideoPoster({ title }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <pattern id="stripes" width="6" height="60" patternUnits="userSpaceOnUse">
          <rect width="2" height="6" x="0" y="2" fill="rgba(255,255,255,0.04)" />
          <rect width="2" height="6" x="0" y="52" fill="rgba(255,255,255,0.04)" />
        </pattern>
      </defs>
      <rect width="100" height="60" fill="url(#stripes)" />
      <rect x="0" y="34" width="100" height="26" fill="rgba(217,87,33,0.10)" />
      <circle cx="72" cy="28" r="9" fill="rgba(255,180,120,0.18)" />
      <circle cx="72" cy="28" r="4" fill="rgba(255,200,140,0.35)" />
      <path d="M 0 42 Q 25 38 50 42 T 100 42 L 100 60 L 0 60 Z" fill="rgba(60,40,30,0.55)" />
      {title && (
        <text x="50" y="56" textAnchor="middle" fontSize="3" fill="rgba(255,255,255,0.4)">
          {title}
        </text>
      )}
    </svg>
  );
}

function AudioWavePlaceholder() {
  const bars = Array.from({ length: 48 });
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={{ display: 'block' }}>
      {bars.map((_, i) => {
        const x = (i / bars.length) * 100;
        const w = 100 / bars.length - 0.4;
        const h = 6 + Math.abs(Math.sin(i * 1.3) * 18) + Math.abs(Math.cos(i * 0.7) * 10);
        const y = (60 - h) / 2;
        return <rect key={i} x={x} y={y} width={w} height={h} rx="0.5" fill="rgba(217,87,33,0.55)" />;
      })}
    </svg>
  );
}

function FunscriptPlaceholder() {
  const pts = Array.from({ length: 48 }, (_, i) => {
    const x = (i / 47) * 100;
    const y = 30 + Math.sin(i * 0.35) * 20 + Math.cos(i * 0.7) * 6;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke="rgba(77,171,247,0.65)" strokeWidth="0.8" />
      {/* faint zero-line */}
      <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(255,255,255,0.04)" strokeWidth="0.4" />
    </svg>
  );
}

// ─── Real-data renderers (used when data props are supplied) ─────
function WaveformCanvas({ waveform, batonPos }) {
  // Renders a peak-array waveform symmetric around the canvas center,
  // scrolling so the baton stays roughly in the middle. Falls back to
  // the static placeholder shape when peaks is empty.
  const peaks = waveform?.peaks || [];
  if (peaks.length === 0) return <AudioWavePlaceholder />;

  // Visible window: 8 seconds wide centred on the playhead. Consumers
  // wanting different zoom should pass a sliced `peaks` themselves.
  const VISIBLE_WINDOW = 0.16; // 16% of total duration
  const half = VISIBLE_WINDOW / 2;
  const start = Math.max(0, Math.min(1 - VISIBLE_WINDOW, batonPos - half));
  const startIdx = Math.floor(start * peaks.length);
  const endIdx = Math.min(peaks.length, Math.ceil((start + VISIBLE_WINDOW) * peaks.length));
  const slice = peaks.slice(startIdx, endIdx);

  return (
    <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={{ display: 'block' }}>
      {slice.map((p, i) => {
        const x = (i / slice.length) * 100;
        const w = 100 / slice.length - 0.1;
        const h = Math.max(0.5, Math.abs(p) * 50);
        const y = (60 - h) / 2;
        return <rect key={i} x={x} y={y} width={w} height={h} fill="rgba(217,87,33,0.65)" />;
      })}
    </svg>
  );
}

function FunscriptCurve({ actions, batonRange }) {
  // Renders the funscript curve inside batonRange (chapter slice or
  // full track). pos 0 = bottom of canvas, pos 100 = top. Inversion
  // matches the convention in `Charts.jsx` where higher pos = higher
  // y. Empty actions falls back to the static placeholder.
  if (!actions || actions.length === 0) return <FunscriptPlaceholder />;

  const dur = Math.max(1, batonRange.end - batonRange.start);
  const visible = actions.filter(
    (a) => a.at >= batonRange.start && a.at <= batonRange.end,
  );
  if (visible.length === 0) return <FunscriptPlaceholder />;

  const pts = visible.map((a) => {
    const x = ((a.at - batonRange.start) / dur) * 100;
    const y = 60 - (Math.max(0, Math.min(100, a.pos)) / 100) * 60;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={{ display: 'block' }}>
      <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(255,255,255,0.04)" strokeWidth="0.4" />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--accent, #ff4b4b)" strokeWidth="0.8" />
    </svg>
  );
}

// ─── Local time formatter (avoids primitives circular import risk) ──
function fmtShort(ms) {
  const s = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
