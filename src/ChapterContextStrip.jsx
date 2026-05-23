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
import { MediaViewer } from './MediaViewer.jsx';
import { useNativeWheel } from './hooks/useNativeWheel.js';

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
  onSeek,                   // (ms) => void — explicit user seek (waveform click, viewer scrub)
  onTimeChange,             // (ms) => void — high-frequency clock tick from MediaViewer playback. Falls back to onSeek when not provided.
  // ── Media viewer (optional) ────────────────────────────────────────
  // Pass a `media` object to render a compact MediaViewer to the right
  // of the waveform. The viewer becomes the master clock for this
  // strip — its onTimeChange / onPlayPause / onSeek emit signals the
  // tab forwards back as `currentMs` / `isPlaying` / `onSeek` props.
  // When `media` is absent the strip renders as before (waveform fills
  // the full width). The shared "side MediaViewer + synced baton"
  // unlock described in project_chapter_context_strip.md.
  media = null,             // { src, kind: 'video'|'audio', title? } | null
  isPlaying = false,
  onPlayPause,
  height = 96,
}) {
  return (
    <div style={{
      // Transparent zero-padding wrapper — the strip is just the rounded
      // StripBody panel when no header content. Consumers that pass a
      // header still get the header row above with consistent spacing.
      // Background is page-bg by inheritance; the panel inside is the
      // only "lifted" surface.
      background: 'transparent',
      flexShrink: 0,
    }}>
      {/* Header row renders only if there's content. Consumers that move
          the title into a tab-level row above the strip pass header=null
          and onToggleExpanded=null (handled here as undefined), so this
          row is fully omitted and the StripBody panel's top sits flush
          with the grid cell — matching the MediaViewer's top in the
          adjacent cell. */}
      {(header || onToggleExpanded) && (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)',
          padding: 'var(--s-3) var(--s-5) 0',
        }}>
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
      )}

      {expanded && headerExtra && <div style={{ padding: '0 var(--s-5)' }}>{headerExtra}</div>}

      {expanded && (
        <div style={{
          marginTop: (header || onToggleExpanded || headerExtra) ? 'var(--s-2)' : 0,
          display: media?.src ? 'grid' : 'block',
          // Viewer on the right (~300px) when media is present; waveform
          // takes the remaining space. Single column otherwise.
          gridTemplateColumns: media?.src ? 'minmax(360px, 1fr) 300px' : undefined,
          gap: media?.src ? 14 : 0,
          alignItems: 'stretch',
        }}>
          <StripBody
            chapter={chapter}
            actions={actions}
            bands={bands}
            onSelectBand={onSelectBand}
            currentMs={currentMs}
            onSeek={onSeek}
            height={height}
          />
          {media?.src && (
            <MediaViewer
              media={{ kind: media.kind || 'video', title: media.title }}
              videoSrc={media.kind === 'video' || !media.kind ? media.src : undefined}
              chapter={{
                id: 'strip',
                title: media.title || '',
                color: '#4dabf7',
                start: chapter.at_ms,
                end: chapter.end_ms,
              }}
              currentMs={currentMs ?? chapter.at_ms}
              isPlaying={isPlaying}
              onPlayPause={onPlayPause}
              onSeek={onSeek}
              onTimeChange={onTimeChange ?? onSeek}
              showMark={false}
              showModeToggle={false}
              height={height}
            />
          )}
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
  const plotRef = useRef(null);
  const [pxWidth, setPxWidth] = useState(800);
  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setPxWidth(entry.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Wheel-zoomable view window ──────────────────────────────────────
  // The strip's visible time range. Initially the whole chapter; wheel
  // zooms in/out, panning to keep the cursor's time stable. Clamps to
  // chapter bounds at both edges. Reset to whole-chapter on chapter
  // change (new context, fresh view).
  //
  // Closes the parity gap with Project / Device / Chapters tab, which
  // get wheel zoom via FunscriptChart. PhrasesTab / PatternsTab /
  // StanzasTab / CharactersTab use this strip instead of FunscriptChart
  // (different click semantics — band overlays), so the zoom had to
  // land here too.
  const [view, setView] = useState(() => ({
    start: chapter.at_ms,
    end: chapter.end_ms,
  }));
  useEffect(() => {
    setView({ start: chapter.at_ms, end: chapter.end_ms });
  }, [chapter.at_ms, chapter.end_ms]);

  const span = Math.max(1, chapter.end_ms - chapter.at_ms);
  const viewSpan = Math.max(1, view.end - view.start);
  const plotW = Math.max(1, pxWidth - PAD_LEFT - PAD_RIGHT);
  const xFor = (ms) => ((ms - view.start) / viewSpan) * plotW;
  // Click handler is on the inset plot div, so its e.clientX-rect.left
  // is already plot-relative — no PAD_LEFT subtraction needed here.
  const msFromX = (xLocal) => view.start + (xLocal / plotW) * viewSpan;

  // Slice + shift actions to the chapter window. Sparkline takes the
  // chapter-rebased actions and we pass it view-relative start/end so
  // it draws only the visible window. Keeping the rebase keyed on
  // chapter (not view) avoids re-filtering ~all-project-actions on
  // every wheel tick.
  const chapterActions = useMemo(
    () => (actions || [])
      .filter((a) => a.at >= chapter.at_ms && a.at <= chapter.end_ms)
      .map((a) => ({ at: a.at - chapter.at_ms, pos: a.pos })),
    [actions, chapter.at_ms, chapter.end_ms],
  );

  // Time-axis ticks — pick the largest "nice" step that still leaves
  // fewer than 10 ticks across the visible window so labels don't
  // overlap. Step grows from 5s to 5m; ticks recompute on zoom so a
  // zoomed-in 12s window gets 5s ticks while the whole-chapter view
  // uses 1m or 5m ticks.
  const ticks = useMemo(() => {
    const niceSteps = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000];
    const step = niceSteps.find((s) => viewSpan / s < 10) ?? 300000;
    const first = Math.ceil(view.start / step) * step;
    const out = [];
    for (let t = first; t <= view.end; t += step) out.push(t);
    return out;
  }, [view.start, view.end, viewSpan]);

  const handleBackgroundClick = (e) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(msFromX(e.clientX - rect.left));
  };

  // Wheel handler — zoom in/out anchored on the cursor's time so the
  // point under the cursor stays under the cursor. preventDefault stops
  // page scroll bleed-through. React's onWheel is passive-by-default
  // and can't preventDefault, hence useNativeWheel.
  const handleWheel = (e) => {
    e.preventDefault();
    if (!plotRef.current) return;
    const rect = plotRef.current.getBoundingClientRect();
    const xLocal = e.clientX - rect.left;
    if (xLocal < 0 || xLocal > rect.width) return;
    const cursorMs = view.start + (xLocal / rect.width) * viewSpan;
    // Negative deltaY = scroll up = zoom IN (narrower window).
    const zoomFactor = e.deltaY < 0 ? 0.82 : 1.22;
    // Min visible window: 500ms (frame-level precision). Max: chapter.
    const MIN_WIDTH_MS = 500;
    let newWidth = viewSpan * zoomFactor;
    newWidth = Math.max(MIN_WIDTH_MS, Math.min(span, newWidth));
    // Keep cursor time fixed in screen x.
    const ratio = (cursorMs - view.start) / viewSpan;
    let newStart = cursorMs - ratio * newWidth;
    let newEnd = newStart + newWidth;
    // Clamp to chapter bounds.
    if (newStart < chapter.at_ms) {
      newStart = chapter.at_ms;
      newEnd = newStart + newWidth;
    }
    if (newEnd > chapter.end_ms) {
      newEnd = chapter.end_ms;
      newStart = Math.max(chapter.at_ms, newEnd - newWidth);
    }
    setView({ start: newStart, end: newEnd });
  };
  useNativeWheel(plotRef, handleWheel);

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
          Click handler lives here so e.clientX is already plot-relative.
          Wheel listener (via useNativeWheel) is on this same ref so
          wheeling over the waveform zooms the view. */}
      <div
        ref={plotRef}
        onClick={handleBackgroundClick}
        style={{
          position: 'absolute',
          left: PAD_LEFT, right: PAD_RIGHT,
          top: PAD_TOP, bottom: PAD_BOTTOM,
          cursor: onSeek ? 'pointer' : 'default',
        }}
      >
        {/* Layer 1 — velocity-colored waveform. Actions are rebased to
            chapter (memoized once per chapter) and the Sparkline is told
            to draw only the visible view window, expressed in
            chapter-relative time. Zooming in passes a smaller sub-range
            to Sparkline; the curve stretches to fill the plot width. */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <Sparkline
            actions={chapterActions}
            start={view.start - chapter.at_ms}
            end={view.end - chapter.at_ms}
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
            chooses border weight / color (incl. alpha suffix).
            The click passes the clicked ms as a second arg so consumers
            who want "click anywhere in the strip seeks to that point"
            (PhrasesTab) can use it. Consumers that only care about
            band selection (ChaptersTab) ignore the second arg, so the
            change is backward-compatible. */}
        {bands.map((band) => {
          const left = xFor(band.at_ms);
          const right = xFor(band.end_ms);
          const w = Math.max(2, right - left);
          return (
            <button
              key={band.id}
              onClick={(e) => {
                e.stopPropagation();
                const plotRect = e.currentTarget.parentElement.getBoundingClientRect();
                const clickedMs = msFromX(e.clientX - plotRect.left);
                onSelectBand?.(band.id, clickedMs);
              }}
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

        {/* Layer 5 — playhead. Renders only if the clock is inside the
            current view window (which is itself inside the chapter).
            2px wide with a soft glow so it reads against the velocity-
            colored waveform (1px got lost in the colors). */}
        {currentMs != null && currentMs >= view.start && currentMs <= view.end && (
          <div style={{
            position: 'absolute',
            left: xFor(currentMs) - 1, top: 0, bottom: 0,
            width: 2, background: '#fff', opacity: 0.95,
            boxShadow: '0 0 4px rgba(255,255,255,0.6)',
            pointerEvents: 'none',
            zIndex: 5,
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
                {fmtTickMs(t)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// X-axis tick formatter — absolute times (M:SS) so the strip's axis
// reads the same units as the header / table / per-row chart editors.
// Earlier this formatter subtracted chapter.at_ms to produce "0:00 ..
// 11:00" chapter-relative labels, but the user flagged 2026-05-23 that
// the mixed relative/absolute axes across the same view was disorienting
// (header said 17:37, axis said 0:00 for the same point). Now everything
// reads as absolute M:SS.
function fmtTickMs(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
