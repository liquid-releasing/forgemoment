// ChapterContextStrip — chapter-scoped waveform with overlaid clickable
// bands. The shared "active chapter expanded full-width" shape used by
// Patterns (instances as bands), Phrases (phrases as bands), and any
// future chapter-scoped editing tab.
//
// Layout (top → bottom inside the surface row):
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │ {header content from consumer}              [▲ Collapse]    │  ← header row
//   ├──────────────────────────────────────────────────────────────┤
//   │ {headerExtra — only when expanded}                           │  ← description, etc.
//   ├──────────────────────────────────────────────────────────────┤
//   │ ░░░░░ Velocity-colored chapter waveform ░░░░░                │  ← only when expanded
//   │ ░░░ Per-band wash + outline + (optional) focus ring ░░░      │
//   └──────────────────────────────────────────────────────────────┘
//
// Collapse: when `expanded` is false, only the header row renders.
// Header content is consumer-owned (Patterns shows pattern info when
// expanded, chapter info when collapsed; Phrases shows chapter info in
// both states). The collapse button auto-renders when `onToggleExpanded`
// is provided.
//
// Band styling is fully consumer-controlled. Each band record carries
// its own `fill` / `fillOpacity` / `stroke` / `strokeWidth` /
// `strokeOpacity` / optional `focused` flag. Consumers map their
// domain (pattern instances, phrases, scenes, …) into this visual
// vocabulary.
//
// Forward direction (not yet built): grow the strip body into a
// chapter-scoped row that places this waveform on the left and a
// MediaViewer on the right, both driven by one synced clock. The
// `currentMs` prop is the seam — today it's `null` and the baton
// hides; when the per-tab playback clock lands (see Chapters tab's
// "Live playhead through MediaViewer" pending), every consumer of
// this strip gets the synced viewer in one place.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkline } from './Charts.jsx';
import { Icon } from './primitives.jsx';

export function ChapterContextStrip({
  chapter,                  // { at_ms, end_ms }
  actions,                  // [{ at, pos }] — full project; filtered to chapter window internally
  bands,                    // see schema below
  onSelectBand,             // (bandId) => void
  expanded = true,
  onToggleExpanded,         // omit to suppress the collapse button (always-expanded mode)
  header,                   // JSX — left side of the header row
  headerExtra,              // JSX — extra rows under the header (only rendered when expanded)
  currentMs = null,
  onSeek,                   // (ms) => void — click on empty waveform background
  height = 96,
}) {
  return (
    <div style={{
      padding: '12px 22px 14px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      {/* Header row — consumer content on the left, collapse button on the right */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
        {onToggleExpanded && (
          <button
            onClick={onToggleExpanded}
            title={expanded ? 'Collapse' : 'Expand'}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 5,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-dim)',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
            }}
          >
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={12} />
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>

      {expanded && headerExtra && <div>{headerExtra}</div>}

      {expanded && (
        <div style={{ marginTop: 10 }}>
          <StripBody
            chapter={chapter}
            actions={actions}
            bands={bands}
            onSelectBand={onSelectBand}
            currentMs={currentMs}
            onSeek={onSeek}
            height={height}
          />
        </div>
      )}
    </div>
  );
}

// Axis padding — reserved space around the plot area for the Y-axis
// labels on the left and the X-axis time ticks at the bottom. Values
// chosen so the labels read at 9px without crowding the waveform.
const PAD_LEFT = 26;
const PAD_RIGHT = 6;
const PAD_TOP = 4;
const PAD_BOTTOM = 16;

// The visual core: chapter-scoped velocity waveform with absolute-
// positioned band overlays. Pulled out as its own component mostly for
// clarity — the parent above is otherwise just header chrome + the
// collapse gate.
//
// All time-mapped content (Sparkline, bands, focus rings, playhead, X
// ticks) lives inside a single inset wrapper offset by `PAD_LEFT` and
// `PAD_RIGHT`. Y-axis labels live in the outer left padding; nothing
// else does. xFor returns coordinates *inside the plot area* — callers
// stay agnostic of the outer padding.
function StripBody({ chapter, actions, bands, onSelectBand, currentMs, onSeek, height }) {
  const wrapRef = useRef(null);
  const [pxWidth, setPxWidth] = useState(800);
  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setPxWidth(entry.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const span = Math.max(1, chapter.end_ms - chapter.at_ms);
  const plotW = Math.max(1, pxWidth - PAD_LEFT - PAD_RIGHT);
  const xFor = (ms) => ((ms - chapter.at_ms) / span) * plotW;
  // Click handler is on the inset plot div, so its e.clientX-rect.left
  // is already plot-relative — no PAD_LEFT subtraction needed here.
  const msFromX = (xLocal) => chapter.at_ms + (xLocal / plotW) * span;

  // Slice + shift actions to the chapter window. Sparkline's start/end
  // are in the same time scale as the actions, so we re-base to 0 here.
  const chapterActions = useMemo(
    () => (actions || [])
      .filter((a) => a.at >= chapter.at_ms && a.at <= chapter.end_ms)
      .map((a) => ({ at: a.at - chapter.at_ms, pos: a.pos })),
    [actions, chapter.at_ms, chapter.end_ms],
  );

  // Time-axis ticks — pick the largest "nice" step that still leaves
  // fewer than 10 ticks across the chapter so labels don't overlap.
  // The list grows from 5s to 5m; chapters longer than ~50 min use the
  // 5m step and just live with crowded labels at the end.
  const ticks = useMemo(() => {
    const niceSteps = [5000, 10000, 15000, 30000, 60000, 120000, 300000];
    const step = niceSteps.find((s) => span / s < 10) ?? 300000;
    const first = Math.ceil(chapter.at_ms / step) * step;
    const out = [];
    for (let t = first; t <= chapter.end_ms; t += step) out.push(t);
    return out;
  }, [chapter.at_ms, chapter.end_ms, span]);

  const handleBackgroundClick = (e) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(msFromX(e.clientX - rect.left));
  };

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative', height,
        background: 'var(--bg)',
        border: '1px solid var(--border)', borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {/* Y-axis labels in the left padding. Three values (100/50/0)
          aligned to the top, middle, and bottom of the plot area. The
          labels read top→bottom as "position high → position low,"
          matching how the Sparkline draws (y=0 is top, pos=100 is top). */}
      <div style={{
        position: 'absolute',
        left: 0, top: PAD_TOP, width: PAD_LEFT,
        height: height - PAD_TOP - PAD_BOTTOM,
        fontFamily: 'var(--font-mono)', fontSize: 9,
        color: 'var(--text-dim)', pointerEvents: 'none',
      }}>
        <span style={{ position: 'absolute', right: 4, top: -3 }}>100</span>
        <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}>50</span>
        <span style={{ position: 'absolute', right: 4, bottom: -3 }}>0</span>
      </div>

      {/* Plot area — the inset rect that owns Sparkline + bands + ticks.
          Click handler lives here so e.clientX is already plot-relative. */}
      <div
        onClick={handleBackgroundClick}
        style={{
          position: 'absolute',
          left: PAD_LEFT, right: PAD_RIGHT,
          top: PAD_TOP, bottom: PAD_BOTTOM,
          cursor: onSeek ? 'pointer' : 'default',
        }}
      >
        {/* Layer 1 — velocity-colored chapter waveform (rebased to 0..span) */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <Sparkline
            actions={chapterActions}
            start={0}
            end={span}
            colorMode="velocity"
            height="100%"
            filled
          />
        </div>

        {/* Layer 2 — per-band wash. Consumer sets opacity 0 to let the
            waveform read at full contrast (Patterns: selected = 0). */}
        {bands.map((band) => {
          const left = xFor(band.at_ms);
          const right = xFor(band.end_ms);
          const w = Math.max(2, right - left);
          return (
            <div
              key={`wash-${band.id}`}
              style={{
                position: 'absolute',
                left, top: 0, width: w, height: '100%',
                background: band.fill ?? 'transparent',
                opacity: band.fillOpacity ?? 0,
                pointerEvents: 'none',
                borderRadius: 3,
              }}
            />
          );
        })}

        {/* Layer 3 — per-band outline button. Click target. Consumer
            chooses border weight / color (incl. alpha suffix). */}
        {bands.map((band) => {
          const left = xFor(band.at_ms);
          const right = xFor(band.end_ms);
          const w = Math.max(2, right - left);
          return (
            <button
              key={band.id}
              onClick={(e) => { e.stopPropagation(); onSelectBand?.(band.id); }}
              title={band.title || ''}
              style={{
                position: 'absolute',
                left, top: 0, width: w, height: '100%',
                background: 'transparent',
                border: band.stroke
                  ? `${band.strokeWidth ?? 2}px solid ${band.stroke}`
                  : 'none',
                opacity: band.strokeOpacity ?? 1,
                borderRadius: 3,
                padding: 0, cursor: 'pointer', boxSizing: 'border-box',
              }}
            >
              {band.label && w > 24 && (
                <span style={{
                  position: 'absolute', left: 4, top: 2,
                  padding: '1px 5px',
                  fontSize: 10, fontWeight: 700, fontFamily: 'inherit',
                  color: band.labelColor || 'rgba(255,255,255,0.85)',
                  background: band.labelBg || 'rgba(0,0,0,0.45)',
                  borderRadius: 2,
                  pointerEvents: 'none',
                }}>
                  {band.label}
                </span>
              )}
            </button>
          );
        })}

        {/* Layer 4 — focus ring (white inset, painted on top). Phrases'
            single-mode uses this; Patterns leaves `focused` unset. */}
        {bands.filter((b) => b.focused).map((band) => {
          const left = xFor(band.at_ms);
          const right = xFor(band.end_ms);
          const w = Math.max(2, right - left);
          return (
            <div
              key={`focus-${band.id}`}
              style={{
                position: 'absolute',
                left, top: 0, width: w, height: '100%',
                border: '1.5px solid #fff',
                borderRadius: 3,
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }}
            />
          );
        })}

        {/* Layer 5 — playhead. Renders only if the clock is inside the chapter. */}
        {currentMs != null && currentMs >= chapter.at_ms && currentMs <= chapter.end_ms && (
          <div style={{
            position: 'absolute',
            left: xFor(currentMs), top: 0, bottom: 0,
            width: 1, background: '#fff', opacity: 0.95,
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* X-axis time ticks in the bottom padding. Aligned to the same
          inset as the plot area so tick x-positions match the band/wave
          x-positions exactly. Each tick is anchored at its time; tiny
          stem reaches up into the plot's bottom edge. */}
      <div style={{
        position: 'absolute',
        left: PAD_LEFT, right: PAD_RIGHT, bottom: 0,
        height: PAD_BOTTOM, pointerEvents: 'none',
      }}>
        {ticks.map((t) => {
          const x = xFor(t);
          if (x < 0 || x > plotW) return null;
          return (
            <div key={t} style={{ position: 'absolute', left: x, top: 0 }}>
              <div style={{
                position: 'absolute', left: -0.5, top: 0,
                width: 1, height: 3, background: 'var(--border)',
                opacity: 0.7,
              }} />
              <span style={{
                position: 'absolute', left: 3, top: 1,
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--text-dim)', whiteSpace: 'nowrap',
              }}>
                {fmtTickMs(t - chapter.at_ms)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// X-axis tick formatter — chapter-relative times read as 0:00 / 0:30 / 1:00.
// Keeps the labels compact and tied to "how far into this chapter am I."
function fmtTickMs(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
