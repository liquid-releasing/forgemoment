// ChapterRibbon — contextual pathway strip showing where in a long
// funscript the user is editing right now.
//
// The ribbon is **chrome**, not the edit surface. The actual editing
// happens below it (tone picker, sliders, before/after, etc.). What
// this component does:
//
//   1. Render every band as a time-proportional rectangle on a single
//      timeline. Each band carries its mini-waveform (canonical velocity
//      colormap), title, and 3-dot action menu. The selected band gets
//      a clean white border.
//
//   2. Let the user **zoom** (wheel) and **pan** (drag) the viewport
//      smoothly. Bands stay anchored to their `at_ms`/`end_ms`; only
//      the viewport changes. Same idiom as a chart timeline. Min zoom
//      shows the full track; max zoom shows the active band filling
//      the viewport with slivers of the neighbours visible.
//
//   3. Selection is independent of viewport. Click any visible band's
//      title or frame → that band becomes the active edit-scope.
//
// **One layout, no modes.** Earlier iterations tried separate
// "overview" / "zoomed" modes; the user pushed back, correctly: the
// zoom math already produces the magnified view as you zoom in. Modes
// add cognitive load and bugs the zoom math doesn't.
//
// Reusable across scopes. Today this drives the Chapters tab on
// FunscriptForge. Tomorrow the same component drives the Edit tab's
// phrase selector (within a chapter) and the pattern selector (within
// a phrase). The vocabulary differs; the component doesn't.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNativeWheel } from './hooks/useNativeWheel.js';
import { Icon } from './primitives.jsx';
import { Sparkline } from './Charts.jsx';
import { magmaRGB } from './TrackStack.jsx';

const GREY_TINT = '#6b7280';        // bands without a tone set
const MAX_SPECTRO_COLS = 2048;      // cap spectro-canvas width (long tracks overflow the browser's max canvas dimension otherwise)
const MIN_BAND_PX = 6;              // hide title/menu when the band is narrower than this
const MIN_TITLE_PX = 60;            // hide title when the band is narrower than this
const MAX_ZOOM_PADDING = 0.08;      // 8% of viewport reserved on each side at max zoom
const WHEEL_ZOOM_SPEED = 0.0015;    // sensitivity of wheel-to-zoom

// Axis chrome. The Y axis is a fixed gutter on the left showing
// funscript position (0..100); it does not zoom. The X axis is a thin
// row across the bottom showing time tick labels that update as the
// viewport pans/zooms.
const Y_AXIS_PX = 28;
const X_AXIS_PX = 18;

export function ChapterRibbon({
  bands,                            // [{ id, at_ms, end_ms, name?, color?, toneColor? }]
  actions = [],                     // full funscript [{at, pos}] for waveform rendering
  selectedId,
  onSelect,                         // (band) => void
  // Optional within-band seek. Click semantics (per user direction
  // 2026-05-19): clicking a DIFFERENT band selects it (onSelect, jumps
  // playhead to band.at_ms via the consumer's selection effect).
  // Clicking the ALREADY-SELECTED band fires onSeek(ms) with the click
  // position mapped to ms inside the band — within-chapter scrub. The
  // two modes are disambiguated by which band you clicked, so there's
  // no ambiguity over "did I mean to change chapter or scrub."
  onSeek,                           // (ms) => void
  menu = [],                        // [{ id, label, icon?, onClick, disabled? }]
  height = 120,                     // total ribbon height
  // Show Y axis (0/50/100 position labels) and X axis (time tick labels).
  // Both default on for the main edit ribbon. Pass `false` to render a
  // narrow chrome-only strip — used when the ribbon is a *secondary*
  // scope picker (e.g. chapter row above the predominant phrase row
  // on the Transform tab). Bands fill the full ribbon area when axes
  // are hidden.
  showAxes = true,
  // Wheel-zoom into the active band. Default on for the primary scope
  // ribbon (Chapters tab). Pass `false` for secondary scope strips that
  // shouldn't capture the wheel — the Transform tab's chapter + phrase
  // rows for example, where zoom belongs to a different UI surface (TBD).
  zoomable = true,
  // Optional initial viewport. If omitted the ribbon starts full-track.
  // Pass these to deep-link into a particular zoom/pan state.
  initialViewStart,
  initialViewEnd,
  // Notification when the viewport changes — consumers can mirror this
  // into a main funscript chart's viewport so the two stay in sync.
  onViewChange,
  // Optional playhead position in ms. When provided, the ribbon draws a
  // baton (vertical line + glow) at that timestamp. The baton is clamped
  // to the current viewport — if the playhead has scrolled out of the
  // zoomed viewport, no baton renders (rather than pinning to the edge,
  // which would suggest the playhead is right there when it isn't).
  //
  // Consumer convention (FunscriptForge 2026-05-19): only pass
  // currentMs when the *companion* viewer is showing audio or
  // funscript — for video mode, the frame itself IS the playhead and a
  // redundant baton just adds visual chrome. Pass `undefined` (not 0)
  // to hide the baton; 0 still renders one at the track start. Earlier
  // design omitted the cursor entirely (see [[project-chapter-context-
  // strip]] thinking); the MediaViewer master clock made it useful
  // again for non-video modes.
  currentMs,
  // Optional reference lanes under the chapter bands (audio peaks + magma
  // spectrogram), windowed to the same zoom view. Present → the bands shrink
  // to the top sub-lane and audio/spectro stack beneath (Characters tab).
  waveform = null,          // { peaks:[0..1], hopMs }
  spectrogram = null,       // { cells, nMels, nFrames, hopMs }
  beats = null,             // { beatsMs:[…] } | [ms]
  // fill → stretch to the grid cell + measure the real height for the lane
  // split (match an adjacent video player). Cell must allow stretch.
  fill = false,
}) {
  const sortedBands = useMemo(
    () => [...(bands || [])].sort((a, b) => a.at_ms - b.at_ms),
    [bands],
  );
  const trackStart = sortedBands[0]?.at_ms ?? 0;
  const trackEnd = sortedBands[sortedBands.length - 1]?.end_ms ?? 0;
  const trackSpan = Math.max(1, trackEnd - trackStart);
  const active = sortedBands.find((b) => b.id === selectedId) || sortedBands[0];

  // Viewport state in ms. Default = full track.
  const [viewStart, setViewStart] = useState(initialViewStart ?? trackStart);
  const [viewEnd, setViewEnd] = useState(initialViewEnd ?? trackEnd);
  useEffect(() => {
    // Track changes (new project, new chapters) reset the viewport to full.
    setViewStart(trackStart);
    setViewEnd(trackEnd);
  }, [trackStart, trackEnd]);
  useEffect(() => { onViewChange?.({ viewStart, viewEnd }); }, [viewStart, viewEnd, onViewChange]);

  // Max zoom: viewport just fits the active chapter plus slivers of
  // adjacent context. minSpan is the smallest the viewport can shrink to.
  // (Slivers come from MAX_ZOOM_PADDING — at this span the active chapter
  // takes up (1 - 2*padding) of the viewport, with the remaining space
  // showing the adjacent chapters on each side.)
  const activeSpan = active ? (active.end_ms - active.at_ms) : trackSpan;
  const minSpan = Math.max(1, activeSpan / Math.max(0.01, 1 - 2 * MAX_ZOOM_PADDING));
  const maxSpan = trackSpan;

  // Pixel measurements. ResizeObserver-driven so the ribbon adapts to
  // the parent container when layout changes (rail width, app window
  // resize, devtools open, etc.). plotWidth is the band area only —
  // it excludes the Y-axis gutter on the left when axes are shown.
  const wrapRef = useRef(null);
  const specRef = useRef(null);
  const [outerWidth, setOuterWidth] = useState(800);
  const [outerHeight, setOuterHeight] = useState(height);
  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      setOuterWidth(entry.contentRect.width);
      setOuterHeight(entry.contentRect.height);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  const yAxisPx = showAxes ? Y_AXIS_PX : 0;
  const xAxisPx = showAxes ? X_AXIS_PX : 0;
  const pxWidth = Math.max(1, outerWidth - yAxisPx);
  // In fill mode the measured height drives the layout so it tracks the
  // stretched grid cell; otherwise the fixed `height` prop does.
  const effHeight = fill ? (outerHeight || height) : height;

  const viewSpan = Math.max(1, viewEnd - viewStart);
  const xFor = (ms) => ((ms - viewStart) / viewSpan) * pxWidth;
  const msFor = (px) => viewStart + (px / Math.max(1, pxWidth)) * viewSpan;

  // ── Sub-lane split — when reference lanes are present, the bands occupy
  // the top sub-lane (weight 2) and audio / spectro stack beneath (weight 1
  // each). All windowed to the zoom view so they pan/zoom with the bands.
  const hasAudio = !!(waveform?.peaks?.length);
  const hasSpectro = !!(spectrogram?.cells?.length && spectrogram?.nFrames);
  const lanesBandsHeight = Math.max(1, effHeight - xAxisPx);
  const laneRects = useMemo(() => {
    const defs = [{ kind: 'bands', w: 2 }];
    if (hasAudio) defs.push({ kind: 'audio', w: 1 });
    if (hasSpectro) defs.push({ kind: 'spectro', w: 1 });
    const totalW = defs.reduce((s, l) => s + l.w, 0);
    let acc = 0;
    const rects = {};
    for (const l of defs) {
      const h = lanesBandsHeight * (l.w / totalW);
      rects[l.kind] = { top: acc, h };
      acc += h;
    }
    return rects;
  }, [hasAudio, hasSpectro, lanesBandsHeight]);

  const audioLane = useMemo(() => {
    if (!hasAudio) return null;
    const peaks = waveform.peaks;
    const hop = waveform.hopMs || 10;
    const f0 = Math.max(0, Math.floor(viewStart / hop));
    const f1 = Math.min(peaks.length, Math.ceil(viewEnd / hop));
    if (f1 - f0 < 2) return null;
    const cols = Math.max(2, Math.min(800, f1 - f0));
    const amps = [];
    let mx = 0;
    for (let c = 0; c < cols; c += 1) {
      const a = f0 + Math.floor((c / cols) * (f1 - f0));
      const b = f0 + Math.floor(((c + 1) / cols) * (f1 - f0));
      let m = 0;
      for (let i = a; i < Math.max(a + 1, b); i += 1) {
        const v = Math.abs(peaks[i] ?? 0);
        if (v > m) m = v;
      }
      amps.push(m);
      if (m > mx) mx = m;
    }
    if (mx <= 0) mx = 1;
    const top = [];
    const bot = [];
    for (let c = 0; c < cols; c += 1) {
      const x = (c / (cols - 1)) * 100;
      const h = (amps[c] / mx) * 47;
      top.push(`${x.toFixed(2)},${(50 - h).toFixed(2)}`);
      bot.push(`${x.toFixed(2)},${(50 + h).toFixed(2)}`);
    }
    const d = `M${top.join('L')}L${bot.reverse().join('L')}Z`;
    const beatMs = Array.isArray(beats) ? beats : (beats?.beatsMs || []);
    const tickX = beatMs
      .filter((b) => b >= viewStart && b <= viewEnd)
      .map((b) => ((b - viewStart) / viewSpan) * 100);
    return { d, tickX };
  }, [hasAudio, waveform, beats, viewStart, viewEnd, viewSpan]);

  useEffect(() => {
    const canvas = specRef.current;
    if (!canvas || !hasSpectro) return;
    const { cells, nMels, nFrames } = spectrogram;
    const hop = spectrogram.hopMs || 10;
    const f0 = Math.max(0, Math.floor(viewStart / hop));
    const f1 = Math.min(nFrames, Math.ceil(viewEnd / hop));
    const frames = Math.max(1, f1 - f0);
    // Cap the canvas width — one column per frame overflows the browser's
    // max canvas dimension on long tracks (a 92-min file at hop=23ms is
    // ~240k frames vs the ~65535px limit) and the canvas silently fails to
    // allocate, leaving a blank lane. We never need more columns than the
    // lane's pixels, so max-pool frames into MAX_SPECTRO_COLS columns.
    const vw = Math.min(frames, MAX_SPECTRO_COLS);
    canvas.width = vw;
    canvas.height = nMels;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(vw, nMels);
    const data = img.data;
    for (let t = 0; t < vw; t += 1) {
      const rel0 = Math.floor((t / vw) * frames);
      const rel1 = Math.max(rel0 + 1, Math.floor(((t + 1) / vw) * frames));
      const a = f0 + rel0;
      const b = f0 + rel1;
      for (let bin = 0; bin < nMels; bin += 1) {
        let m = 0;
        for (let fr = a; fr < b; fr += 1) {
          const v = cells[fr * nMels + bin] ?? 0;
          if (v > m) m = v;
        }
        const [r, g, bl] = magmaRGB(m / 255);
        const dr = nMels - 1 - bin;
        const px = (dr * vw + t) * 4;
        data[px] = r; data[px + 1] = g; data[px + 2] = bl; data[px + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [hasSpectro, spectrogram, viewStart, viewEnd]);

  // ── Gestures ──────────────────────────────────────────────────────
  // Wheel zoom: always pivots on the **active chapter's center**, not
  // the cursor. With the "stay in scope" constraint (active must remain
  // visible), cursor-pivot would just be the user pushing themselves
  // out of view and getting yanked back by the clamp. Anchoring on the
  // active center turns the wheel into a clean "more or less context
  // around what I'm editing" knob. Selection (clicking another band) is
  // the only way to change which chapter sits in the center.
  //
  // Attached via the `useNativeWheel` hook (passive: false) because
  // React's onWheel is passive-by-default, which silently makes
  // preventDefault a no-op. Without the override, wheeling over the
  // ribbon scrolls the outer page — the bug the user flagged
  // 2026-05-21.
  const handleWheel = (e) => {
    if (!zoomable) return;
    if (sortedBands.length === 0 || !active) return;
    e.preventDefault();
    const pivot = (active.at_ms + active.end_ms) / 2;
    const factor = Math.exp(e.deltaY * WHEEL_ZOOM_SPEED);
    let nextSpan = viewSpan * factor;
    if (nextSpan < minSpan) nextSpan = minSpan;
    if (nextSpan > maxSpan) nextSpan = maxSpan;
    let nextStart = pivot - nextSpan / 2;
    let nextEnd = nextStart + nextSpan;
    // Clamp to track bounds; this can push the viewport off-center near
    // the ends of the track, but the active chapter stays visible because
    // we're zooming around its center.
    if (nextStart < trackStart) { nextEnd += (trackStart - nextStart); nextStart = trackStart; }
    if (nextEnd > trackEnd)     { nextStart -= (nextEnd - trackEnd);   nextEnd = trackEnd; }
    if (nextStart < trackStart)  nextStart = trackStart;
    if (nextEnd > trackEnd)      nextEnd = trackEnd;
    setViewStart(nextStart);
    setViewEnd(nextEnd);
  };

  const plotRef = useRef(null);
  useNativeWheel(plotRef, handleWheel);

  // Selection change → snap the viewport to re-center on the new active
  // chapter. Preserve the current zoom span when possible; if the new
  // chapter doesn't fit (e.g. selection changed to a much longer chapter
  // while we were zoomed tight), expand the span just enough to fit it.
  useEffect(() => {
    if (!active) return;
    const pivot = (active.at_ms + active.end_ms) / 2;
    let span = viewEnd - viewStart;
    if (span < minSpan) span = minSpan;
    if (span > maxSpan) span = maxSpan;
    let nextStart = pivot - span / 2;
    let nextEnd = nextStart + span;
    if (nextStart < trackStart) { nextEnd += (trackStart - nextStart); nextStart = trackStart; }
    if (nextEnd > trackEnd)     { nextStart -= (nextEnd - trackEnd);   nextEnd = trackEnd; }
    if (nextStart < trackStart)  nextStart = trackStart;
    if (nextEnd > trackEnd)      nextEnd = trackEnd;
    setViewStart(nextStart);
    setViewEnd(nextEnd);
    // We intentionally exclude viewStart/viewEnd from the deps so
    // wheeling doesn't re-trigger this effect — it only fires when the
    // selection or the track bounds change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, trackStart, trackEnd, minSpan, maxSpan]);

  // ── Empty state ──────────────────────────────────────────────────
  if (sortedBands.length === 0) {
    return (
      <div style={{
        height, background: 'var(--surface-2)',
        border: '1px solid var(--border)', borderRadius: 8,
        display: 'grid', placeItems: 'center',
        fontSize: 12, color: 'var(--text-dim)',
      }}>no chapters yet</div>
    );
  }

  const bandsHeight = lanesBandsHeight;
  const xTicks = useMemo(
    () => (showAxes ? buildXTicks(viewStart, viewEnd, pxWidth) : []),
    [showAxes, viewStart, viewEnd, pxWidth],
  );

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        height: fill ? '100%' : height,
        minHeight: fill ? height : undefined,
        width: '100%',
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 8, overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Y-axis gutter — fixed, doesn't zoom. Position is 0..100 with
          top=100 (max) and bottom=0 (rest), matching the funscript
          convention used by Sparkline inside each band. Suppressed
          when showAxes is false (narrow-chrome use). */}
      {showAxes && <YAxis height={laneRects.bands.h} />}

      {/* Plot area: bands above, X axis below (X axis hidden when
          showAxes is false). Wheel attaches here so the gutter doesn't
          capture zoom gestures. */}
      <div
        ref={plotRef}
        style={{
          position: 'absolute',
          left: yAxisPx, right: 0, top: 0,
          height: fill ? '100%' : height,
        }}
        title={zoomable ? 'Wheel to zoom · click a band to focus' : 'Click a band to focus'}
      >
        {/* Bands — top sub-lane (full bandsHeight when no ref lanes). */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: laneRects.bands.h, overflow: 'hidden' }}>
          {sortedBands.map((band) => {
            const leftPx = xFor(band.at_ms);
            const rightPx = xFor(band.end_ms);
            const widthPx = rightPx - leftPx;
            if (rightPx < 0 || leftPx > pxWidth) return null;       // clipped off
            if (widthPx < 1) return null;
            return (
              <Band
                key={band.id}
                band={band}
                actions={actions}
                selected={band.id === active?.id}
                leftPx={leftPx}
                widthPx={widthPx}
                menu={menu}
                index={sortedBands.findIndex((b) => b.id === band.id)}
                onSelect={onSelect}
                onSeek={onSeek}
              />
            );
          })}

        </div>

        {/* Audio lane — centered waveform (0..100 viewBox, stretched) + beat
            ticks, windowed to the zoom view. */}
        {audioLane && laneRects.audio && (
          <div style={{
            position: 'absolute', left: 0, right: 0,
            top: laneRects.audio.top, height: laneRects.audio.h,
            borderTop: '1px solid rgba(255,255,255,0.06)', pointerEvents: 'none',
          }}>
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
                 style={{ display: 'block' }}>
              {audioLane.tickX.map((x, i) => (
                <line key={i} x1={x} x2={x} y1={4} y2={96}
                      stroke="rgba(255,255,255,0.16)" strokeWidth={0.4} />
              ))}
              <path d={audioLane.d} fill="rgba(120,180,255,0.45)"
                    stroke="rgba(160,205,255,0.85)" strokeWidth={0.3} />
            </svg>
          </div>
        )}

        {/* Spectro lane — magma canvas, CSS-stretched across the lane. */}
        {hasSpectro && laneRects.spectro && (
          <div style={{
            position: 'absolute', left: 0, right: 0,
            top: laneRects.spectro.top, height: laneRects.spectro.h,
            borderTop: '1px solid rgba(255,255,255,0.06)', pointerEvents: 'none',
          }}>
            <canvas ref={specRef} style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>
        )}

        {/* Playhead baton — spans all sub-lanes (bands + audio + spectro).
            Only renders when inside the current viewport. */}
        {Number.isFinite(currentMs) && currentMs >= viewStart && currentMs <= viewEnd && (
          <div style={{
            position: 'absolute',
            top: 0, height: bandsHeight,
            left: xFor(currentMs),
            width: 2,
            transform: 'translateX(-1px)',
            background: 'rgba(255,255,255,0.9)',
            boxShadow: '0 0 6px rgba(255,255,255,0.5)',
            pointerEvents: 'none',
            zIndex: 5,
          }} />
        )}

        {/* X axis */}
        <XAxis ticks={xTicks} top={bandsHeight} height={X_AXIS_PX} />
      </div>
    </div>
  );
}

function YAxis({ height }) {
  // Labels at 100 (top), 50 (mid), 0 (bottom). Position is funscript
  // depth percentage; fixed across all zoom levels. Tiny tick marks
  // help the eye when the band waveform is busy.
  const ticks = [100, 50, 0];
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: Y_AXIS_PX, height,
      borderRight: '1px solid var(--border)',
      pointerEvents: 'none',
    }}>
      {ticks.map((t) => {
        const top = ((100 - t) / 100) * height;
        return (
          <div key={t} style={{
            position: 'absolute', right: 4, top: top - 6,
            fontSize: 9.5, color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          }}>{t}</div>
        );
      })}
    </div>
  );
}

function XAxis({ ticks, top, height }) {
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top, height,
      borderTop: '1px solid var(--border)',
      pointerEvents: 'none',
    }}>
      {ticks.map((t) => (
        <div key={`${t.ms}-${t.label}`} style={{
          position: 'absolute',
          left: t.x, top: 2,
          transform: 'translateX(-50%)',
          fontSize: 9.5, color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          whiteSpace: 'nowrap',
        }}>{t.label}</div>
      ))}
    </div>
  );
}

// Pick a "nice" tick interval based on the visible time span, then
// generate evenly-spaced ticks across the viewport. The interval ladder
// covers everything from 0.5s up to 30min so the axis stays readable
// across the full zoom range.
function buildXTicks(viewStart, viewEnd, pxWidth) {
  const span = Math.max(1, viewEnd - viewStart);
  const TARGET_TICKS = 6;                      // visual target — pixel width / ~120px per tick
  const rough = span / TARGET_TICKS;
  const LADDER_MS = [
    500, 1000, 2000, 5000, 10_000, 15_000, 30_000,
    60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
    60 * 60_000,
  ];
  const interval = LADDER_MS.find((v) => v >= rough) || LADDER_MS[LADDER_MS.length - 1];
  const first = Math.ceil(viewStart / interval) * interval;
  const ticks = [];
  for (let ms = first; ms <= viewEnd; ms += interval) {
    const x = ((ms - viewStart) / span) * pxWidth;
    ticks.push({ ms, x, label: fmtTickLabel(ms, interval) });
  }
  return ticks;
}

function fmtTickLabel(ms, intervalMs) {
  // Show MM:SS when the interval is sub-minute or sub-10min material;
  // switch to HH:MM:SS once we're zoomed out far enough that hours
  // matter (1 hour+ intervals). Keeps width stable enough to not jitter.
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (intervalMs >= 60 * 60_000 || h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function Band({
  band, actions, selected, leftPx, widthPx, menu, index, onSelect, onSeek,
}) {
  const tone = band.toneColor || GREY_TINT;
  const isGrey = !band.toneColor;
  const bgWash = isGrey ? 'rgba(107,114,128,0.10)' : `${tone}22`;
  const borderColor = selected ? '#ffffff' : (isGrey ? 'rgba(255,255,255,0.12)' : `${tone}55`);
  const borderWidth = selected ? 2 : 1;

  // When the kebab dropdown is open, the band needs to paint above its
  // siblings so the menu (rendered inside the band's box) isn't covered
  // by the next band in DOM order. Lifted up here so the wrapper can
  // set zIndex; BandMenu reports its open state via onOpenChange.
  const [menuOpen, setMenuOpen] = useState(false);

  const slice = useMemo(
    () => (actions || []).filter((a) => a.at >= band.at_ms && a.at <= band.end_ms),
    [actions, band.at_ms, band.end_ms],
  );

  const showTitle = widthPx >= MIN_TITLE_PX;
  const showMenu = widthPx >= MIN_BAND_PX * 4;

  // Click: select if it's a different band; seek to clicked position if
  // it's the already-selected band. The fallback to onSelect when
  // onSeek is missing means consumers who don't wire seek still get
  // the "click-active-band = no-op" they used to (rather than a
  // confusing "click changes nothing" when there's no seek handler).
  const handleClick = (e) => {
    if (selected && onSeek) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const frac = rect.width > 0 ? x / rect.width : 0;
      const ms = band.at_ms + frac * (band.end_ms - band.at_ms);
      onSeek(ms);
    } else {
      onSelect?.(band);
    }
  };

  return (
    <div
      onClick={handleClick}
      title={band.name || band.id}
      style={{
        position: 'absolute',
        left: leftPx, top: 0, width: widthPx, height: '100%',
        background: bgWash,
        border: `${borderWidth}px solid ${borderColor}`,
        borderRadius: 6,
        // No `overflow: hidden` here on purpose — the BandMenu dropdown
        // needs to escape the band's bounds to render on top of adjacent
        // bands. Sparkline clipping moves down to the inner inset:4
        // wrapper below, which has its own overflow:hidden + matching
        // border-radius so the visual is identical.
        cursor: 'pointer',
        // Selected chapter stays at full opacity; others subdue noticeably
        // so the active one reads as the focus. Earlier value (0.85) was
        // too close to 1 — the dim was nearly invisible (user flagged
        // 2026-05-17). 0.55 matches the patterns strip's wash convention.
        opacity: selected ? 1 : 0.55,
        boxSizing: 'border-box',
        zIndex: menuOpen ? 50 : 'auto',
      }}
    >
      {/* Waveform fills the band's interior. Sparkline auto-sizes to its
          container, so it adapts as the viewport zooms. */}
      <div style={{ position: 'absolute', inset: 4, overflow: 'hidden', borderRadius: 4 }}>
        <Sparkline
          actions={slice}
          start={band.at_ms}
          end={band.end_ms}
          colorMode="velocity"
          height="100%"
          filled
        />
      </div>

      {/* Accept checkmark — corner badge for chapters the user has
          signed off on (per-chapter accept from ChaptersTab). Consumers
          pass `accepted: true` on the band record to opt in. Pinned to
          the upper-left of the band so the title can sit next to it
          when both are shown. Only renders when the band is wide enough
          for the title (avoids stacking on tiny bands). */}
      {band.accepted && showTitle && (
        <div style={{
          position: 'absolute', top: 4, left: 6,
          width: 14, height: 14, borderRadius: 7,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)',
          border: `1px solid ${tone}`,
          color: tone,
          fontSize: 9, fontWeight: 700,
          boxShadow: '0 0 4px rgba(0,0,0,0.45)',
          pointerEvents: 'none',
        }}>
          <Icon name="check" size={9} />
        </div>
      )}

      {showTitle && (
        <div style={{
          position: 'absolute', top: 4,
          // Shift the title right when a check badge is showing so they
          // don't overlap; otherwise the title hugs the left edge as
          // before.
          left: band.accepted ? 26 : 8,
          right: 30,
          fontSize: 11.5, fontWeight: 700,
          // Selected band: white title so it reads cleanly over the
          // brighter tinted background. Non-selected: tone color (or
          // muted when no tone is set). User flagged 2026-05-16: tone-
          // color title on the active band fades into the wash.
          color: selected ? '#ffffff' : (isGrey ? 'var(--text-muted)' : tone),
          textShadow: '0 0 4px rgba(0,0,0,0.55)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          pointerEvents: 'none',
        }}>
          {band.name || band.id}
        </div>
      )}

      {showMenu && menu && menu.length > 0 && (
        <BandMenu band={band} menu={menu} index={index} onOpenChange={setMenuOpen} />
      )}
    </div>
  );
}

function BandMenu({ band, menu, index, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'absolute', top: 3, right: 3 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((s) => !s); }}
        onMouseDown={(e) => e.stopPropagation()}
        title="Band actions"
        aria-label="Band actions"
        style={{
          width: 22, height: 22, borderRadius: 5,
          // Light-grey overlay with dark dots — high-contrast against any
          // chapter color, so the kebab reads as available rather than
          // hidden. Previously rgba(0,0,0,0.45) + white icon, which
          // disappeared into the band color on dim chapters.
          background: 'rgba(230,230,230,0.92)',
          border: '1px solid rgba(0,0,0,0.15)',
          color: 'rgba(20,20,20,0.85)',
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon name="more-horizontal" size={12} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 26, right: 0, minWidth: 200,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
            padding: 4, zIndex: 30,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.map((item) => {
            const disabled = item.disabled ? item.disabled(band, index) : false;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (disabled) return;
                  item.onClick?.(band, index);
                  setOpen(false);
                }}
                disabled={disabled}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 10px',
                  background: 'transparent', border: 'none',
                  color: disabled ? 'var(--text-dim)' : 'var(--text)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  borderRadius: 5, fontFamily: 'inherit', fontSize: 12.5,
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!disabled) e.currentTarget.style.background = 'var(--surface)';
                }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {item.icon && <Icon name={item.icon} size={13} />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
