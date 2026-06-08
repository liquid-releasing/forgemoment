// TrackStack — stacked, time-aligned signal lanes over one shared axis +
// one (optional) playhead baton. The editing chassis for the Events tab,
// reusable by Phrases / Stanzas / Chapters: feed it a `scope` window + the
// lanes you want, scoped to the active slice.
//
// Design decisions (memory project_events_design):
//   - Lanes are FULL-STRENGTH, not muted — separate lanes don't compete,
//     so nothing needs dimming to stay legible.
//   - The baton (playhead) is OPTIONAL + prop-positioned: one playhead
//     clock, rendering configurable per tab (`baton='line'|'none'`).
//   - Domain-free: the events lane takes GENERIC spans
//     `{ id, start, end, color, label }` — the consumer maps its own
//     events/recipes onto that shape (same pattern as ShapeGlyph).
//
// Lanes shipped here: `funscript` (position polyline) + `events`
// (lane-packed colored bands). `audio` / `spectro` / `thumbs` are the
// next increments — they slot into the same stack + axis.
//
// One <svg> holds every lane stacked top→bottom so the shared x-axis and
// the full-height baton are trivial. ms↔x maps the `scope` window onto the
// plot width (minus a small horizontal inset).

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtTimeShort } from './primitives.jsx';
import { VELOCITY_COLOR_STOPS, interpolateColorStops } from './Charts.jsx';

const PAD_X = 8;          // horizontal inset so end-bands/ticks don't clip
const LANE_GAP = 6;       // vertical gap between lanes
const RULER_H = 16;       // bottom time-ruler height
const MAX_SPECTRO_COLS = 2048;  // cap offscreen spectro-canvas width (long tracks overflow the browser's max canvas dimension otherwise)
const LABEL_FILL = 'rgba(255,255,255,0.34)';

// Default per-lane heights; consumer can override via `laneHeights`.
const DEFAULT_HEIGHTS = {
  funscript: 92,
  events: 80,    // a band of stacked event rows
  audio: 56,
  spectro: 48,
  thumbs: 44,
};

// Compact magma ramp (matches the MediaViewer spectrogram palette closely
// enough for the lane thumbnail). t in 0..1 → [r,g,b].
const MAGMA_STOPS = [
  [0.0, [0, 0, 4]], [0.15, [28, 16, 68]], [0.3, [79, 18, 123]],
  [0.45, [129, 37, 129]], [0.6, [181, 54, 122]], [0.72, [229, 80, 100]],
  [0.85, [251, 135, 97]], [0.93, [254, 194, 135]], [1.0, [252, 253, 191]],
];
export function magmaRGB(t) {
  const x = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < MAGMA_STOPS.length - 1 && x > MAGMA_STOPS[i + 1][0]) i += 1;
  const [t0, c0] = MAGMA_STOPS[i];
  const [t1, c1] = MAGMA_STOPS[Math.min(i + 1, MAGMA_STOPS.length - 1)];
  const f = t1 > t0 ? (x - t0) / (t1 - t0) : 0;
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * f),
    Math.round(c0[1] + (c1[1] - c0[1]) * f),
    Math.round(c0[2] + (c1[2] - c0[2]) * f),
  ];
}

export function TrackStack({
  scope,                          // { start, end } ms — the slice window
  actions = [],                   // funscript [{ at, pos }] (any range)
  events = [],                    // [{ id, start, end, color, label }]
  waveform = null,                // { peaks:[0..1], hopMs } — audio lane
  spectrogram = null,             // { cells, nMels, nFrames, hopMs } — spectro lane
  beats = null,                   // { beatsMs:[…] } | [ms] — ticks on the audio lane
  lanes = ['events', 'funscript'],// top→bottom order; only present data renders
  currentMs = null,
  baton = 'line',                 // 'line' | 'none'
  selectedEventId = null,
  onSeek,
  onSelectEvent,
  laneHeights,
  eventRows = 4,                  // lane-packing rows inside the events lane
  showRuler = true,
  funscriptColor = 'rgba(255,255,255,0.82)', // solid-mode position-line stroke
  funscriptColorMode = 'solid',   // 'solid' | 'velocity' (per-stroke speed map)
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const start = scope?.start ?? 0;
  const end = Math.max(start + 1, scope?.end ?? start + 1);
  const dur = end - start;

  const heights = { ...DEFAULT_HEIGHTS, ...(laneHeights || {}) };
  // Only render lanes that have data (funscript needs actions; events needs
  // events). Keeps the stack honest when a slice has no events yet.
  const activeLanes = lanes.filter((l) => {
    if (l === 'funscript') return actions.length > 0;
    if (l === 'events') return true; // always show the lane (may be empty)
    if (l === 'audio') return !!(waveform?.peaks?.length);
    if (l === 'spectro') return !!(spectrogram?.cells?.length && spectrogram?.nFrames);
    return false; // thumbs not wired yet
  });

  // Vertical layout: stack lanes with gaps, ruler at the very bottom.
  const layout = useMemo(() => {
    let y = 0;
    const rows = activeLanes.map((kind) => {
      const h = heights[kind] ?? 60;
      const row = { kind, y, h };
      y += h + LANE_GAP;
      return row;
    });
    const rulerY = y;
    const total = y + (showRuler ? RULER_H : 0);
    return { rows, rulerY, total: Math.max(total, 1) };
  }, [activeLanes, heights, showRuler]);

  const plotW = Math.max(1, width - PAD_X * 2);
  const xFor = (ms) => PAD_X + ((ms - start) / dur) * plotW;
  const xToMs = (x) => start + ((x - PAD_X) / plotW) * dur;
  const laneOf = (kind) => layout.rows.find((r) => r.kind === kind);

  // Funscript lane, binned per pixel column (NOT decimated). Each bin keeps
  // the stroke envelope (min/max pos) for the bar height and the PEAK velocity
  // measured from RAW consecutive actions for its color. Decimating first and
  // measuring velocity between the sampled points (the old approach) aliased
  // long, dense chapters into a low, slow-looking blue line — the bin keeps
  // both the full 0-100 envelope and the true stroke speed, matching the
  // FunscriptChart / ChapterRibbon heatmap. Returns per-bin bars + a max-pos
  // envelope path `d` for solid mode.
  const fun = useMemo(() => {
    const row = laneOf('funscript');
    if (!row || !actions.length || dur <= 0) return null;
    const inWin = actions.filter((a) => a.at >= start && a.at <= end);
    const src = inWin.length > 1 ? inWin : actions;
    const nBins = Math.max(1, Math.round(plotW));
    const bins = new Array(nBins);
    let maxVel = 0;
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = Math.min(nBins - 1, Math.max(0, Math.floor(((a.at - start) / dur) * nBins)));
      let bin = bins[b];
      if (!bin) bin = bins[b] = { min: a.pos, max: a.pos, vel: 0 };
      if (a.pos < bin.min) bin.min = a.pos;
      if (a.pos > bin.max) bin.max = a.pos;
      if (i > 0) {
        const dt = Math.max(1, a.at - src[i - 1].at);
        const v = Math.abs(a.pos - src[i - 1].pos) / dt;
        if (v > bin.vel) bin.vel = v;
        if (v > maxVel) maxVel = v;
      }
    }
    if (maxVel === 0) maxVel = 1;
    const yOf = (pos) => row.y + (1 - pos / 100) * row.h;
    const bars = [];
    for (let b = 0; b < nBins; b++) {
      const bin = bins[b];
      if (!bin) continue;
      const x = xFor(start + ((b + 0.5) / nBins) * dur);
      bars.push({ x, yMax: yOf(bin.max), yMin: yOf(bin.min), vel: bin.vel });
    }
    const d = bars
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.yMax.toFixed(1)}`)
      .join('');
    return { bars, maxVel, d };
  }, [actions, start, end, plotW, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Events overlapping the window, greedily packed into `eventRows`.
  const placedEvents = useMemo(() => {
    const row = laneOf('events');
    if (!row) return [];
    const vis = events
      .filter((e) => (e.end ?? e.start) >= start && e.start <= end)
      .sort((a, b) => a.start - b.start);
    const lanesEnd = new Array(eventRows).fill(-Infinity);
    return vis.map((e) => {
      let r = lanesEnd.findIndex((endMs) => endMs <= e.start);
      if (r === -1) r = eventRows - 1;
      lanesEnd[r] = e.end ?? e.start;
      return { ...e, row: r };
    });
  }, [events, start, end, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Audio lane — peaks within the scope window, decimated to the plot width
  // and drawn as a centered filled waveform (full-strength). Beat ticks (if
  // provided) overlay as faint verticals.
  const audio = useMemo(() => {
    const row = laneOf('audio');
    if (!row || !waveform?.peaks?.length) return null;
    const peaks = waveform.peaks;
    const hopMs = waveform.hopMs || 10;
    const f0 = Math.max(0, Math.floor(start / hopMs));
    const f1 = Math.min(peaks.length, Math.ceil(end / hopMs));
    if (f1 - f0 < 2) return null;
    const cols = Math.max(2, Math.min(Math.floor(plotW), f1 - f0));
    const cy = row.y + row.h / 2;
    const half = row.h / 2 - 2;
    const colAmp = new Array(cols).fill(0);
    let maxAmp = 0;
    for (let c = 0; c < cols; c += 1) {
      const a = f0 + Math.floor((c / cols) * (f1 - f0));
      const b = f0 + Math.floor(((c + 1) / cols) * (f1 - f0));
      let m = 0;
      for (let i = a; i < Math.max(a + 1, b); i += 1) {
        const v = Math.abs(peaks[i] ?? 0);
        if (v > m) m = v;
      }
      colAmp[c] = m;
      if (m > maxAmp) maxAmp = m;
    }
    if (maxAmp <= 0) maxAmp = 1;
    const top = [];
    const bot = [];
    for (let c = 0; c < cols; c += 1) {
      const x = PAD_X + (c / (cols - 1)) * plotW;
      const h = (colAmp[c] / maxAmp) * half;
      top.push(`${x.toFixed(1)},${(cy - h).toFixed(1)}`);
      bot.push(`${x.toFixed(1)},${(cy + h).toFixed(1)}`);
    }
    const d = `M${top.join('L')}L${bot.reverse().join('L')}Z`;
    const beatMs = Array.isArray(beats) ? beats : (beats?.beatsMs || []);
    const inView = beatMs.filter((b) => b >= start && b <= end);
    // Drop ticks once they'd pack tighter than ~4px — thousands of stacked
    // translucent lines wash the audio lane solid white (see ChapterRibbon).
    const tickXs = inView.length <= plotW / 4 ? inView.map((b) => xFor(b)) : [];
    return { d, row, tickXs };
  }, [waveform, beats, start, end, plotW, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Spectro lane — paint the in-window cells to an offscreen canvas (magma)
  // and hand the data URL to an <image> scaled across the lane. Regenerates
  // only when the spectrogram or the scope window changes (not per frame).
  const spectro = useMemo(() => {
    const row = laneOf('spectro');
    if (!row || !spectrogram?.cells?.length) return null;
    const { cells, nMels, nFrames } = spectrogram;
    const hopMs = spectrogram.hopMs || 10;
    if (!nMels || !nFrames || typeof document === 'undefined') return null;
    const f0 = Math.max(0, Math.floor(start / hopMs));
    const f1 = Math.min(nFrames, Math.ceil(end / hopMs));
    const frames = Math.max(1, f1 - f0);
    // Cap the offscreen canvas width. One column per frame overflows the
    // browser's max canvas dimension on long tracks (e.g. a 92-min file at
    // hop=23ms is ~240k frames, well past the ~65535px limit) — the canvas
    // then fails to allocate and toDataURL() returns "data:," which renders
    // as a broken-image box. We never need more columns than display pixels
    // anyway, so when there are more frames than MAX_SPECTRO_COLS we
    // max-pool each output column over its frame span (max preserves the
    // visible energy peaks better than averaging).
    const vw = Math.min(frames, MAX_SPECTRO_COLS);
    const canvas = document.createElement('canvas');
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
        const dstRow = nMels - 1 - bin; // low freq at bottom
        const px = (dstRow * vw + t) * 4;
        data[px] = r; data[px + 1] = g; data[px + 2] = bl; data[px + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL();
    // Defensive: a failed/oversized canvas yields the empty "data:," URL.
    // Drop the lane rather than render a broken-image box.
    if (!url || url.length < 16) return null;
    return { url, row };
  }, [spectrogram, start, end, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ruler ticks: ~5 evenly spaced.
  const ticks = useMemo(() => {
    const n = 5;
    return Array.from({ length: n + 1 }, (_, i) => start + (dur * i) / n);
  }, [start, dur]);

  const eventsRow = laneOf('events');
  const rowH = eventsRow ? (eventsRow.h - 2) / eventRows : 0;

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <svg
        width={width} height={layout.total}
        style={{ display: 'block', background: 'var(--bg)', borderRadius: 8, cursor: 'pointer' }}
        onClick={(e) => {
          if (!onSeek) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(Math.max(start, Math.min(end, xToMs(e.clientX - rect.left))));
        }}
      >
        {/* Lane backgrounds (labels are drawn last, on top of lane content) */}
        {layout.rows.map((row) => (
          <rect key={row.kind} x={PAD_X} y={row.y} width={plotW} height={row.h}
                fill="rgba(255,255,255,0.02)" rx={4} />
        ))}

        {/* Spectro lane — magma image scaled to the lane rect */}
        {spectro && (
          <image href={spectro.url} x={PAD_X} y={spectro.row.y}
                 width={plotW} height={spectro.row.h}
                 preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />
        )}

        {/* Audio lane — centered waveform + beat ticks */}
        {audio && (
          <g style={{ pointerEvents: 'none' }}>
            {audio.tickXs.map((x, i) => (
              <line key={i} x1={x} x2={x} y1={audio.row.y + 2} y2={audio.row.y + audio.row.h - 2}
                    stroke="rgba(255,255,255,0.16)" strokeWidth={1} />
            ))}
            <path d={audio.d} fill="rgba(120,180,255,0.45)"
                  stroke="rgba(160,205,255,0.85)" strokeWidth={0.6} />
          </g>
        )}

        {/* Events lane — colored bands, lane-packed */}
        {eventsRow && placedEvents.map((ev) => {
          const x0 = xFor(ev.start);
          const x1 = xFor(ev.end ?? ev.start);
          const w = Math.max(2, x1 - x0);
          const y = eventsRow.y + 1 + ev.row * rowH;
          const sel = ev.id === selectedEventId;
          const color = ev.color || 'var(--accent)';
          return (
            <g key={ev.id}
               onClick={(e) => { e.stopPropagation(); onSelectEvent?.(ev.id); }}
               style={{ cursor: 'pointer' }}>
              <rect x={x0} y={y + 2} width={w} height={Math.max(6, rowH - 4)}
                    rx={2} fill={color} fillOpacity={sel ? 0.95 : 0.7}
                    stroke={sel ? '#fff' : 'transparent'} strokeWidth={sel ? 1.25 : 0} />
              {w > 30 && ev.label && (
                <text x={x0 + 4} y={y + rowH - 4}
                      fontSize={9} fontWeight={700} fill="#0d0d0d"
                      style={{ pointerEvents: 'none' }}>
                  {ev.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Funscript lane — full-strength position line. Velocity mode
            strokes each segment by stroke speed (blue→red); solid mode is
            one path in funscriptColor. */}
        {fun && funscriptColorMode === 'velocity' && fun.bars.length > 0 && (
          <g style={{ pointerEvents: 'none' }}>
            {fun.bars.map((p, i) => (
              <line key={i} x1={p.x} x2={p.x} y1={p.yMax} y2={Math.max(p.yMax + 1, p.yMin)}
                    stroke={interpolateColorStops(VELOCITY_COLOR_STOPS, p.vel / fun.maxVel)}
                    strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        )}
        {fun && funscriptColorMode !== 'velocity' && fun.d && (
          <path d={fun.d} fill="none"
                stroke={funscriptColor} strokeWidth={1.25}
                strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }} />
        )}

        {/* Lane labels — drawn last so they stay legible over the spectro
            image / audio fill. */}
        {layout.rows.map((row) => (
          <text key={`lbl-${row.kind}`} x={PAD_X + 6} y={row.y + 11}
                fontSize={9} fontWeight={700}
                fill={row.kind === 'spectro' ? 'rgba(255,255,255,0.62)' : LABEL_FILL}
                style={{ pointerEvents: 'none', letterSpacing: '0.08em',
                         textTransform: 'uppercase' }}>
            {row.kind}
          </text>
        ))}

        {/* Ruler */}
        {showRuler && ticks.map((ms, i) => (
          <text key={i}
                x={Math.min(plotW + PAD_X - 2, Math.max(PAD_X, xFor(ms)))}
                y={layout.rulerY + 11}
                fontSize={9} fill="var(--text-dim)"
                textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
                style={{ pointerEvents: 'none', fontFamily: 'var(--font-mono)' }}>
            {fmtTimeShort(ms)}
          </text>
        ))}

        {/* Baton — optional, full-height playhead line */}
        {baton === 'line' && currentMs != null && currentMs >= start && currentMs <= end && (
          <line x1={xFor(currentMs)} x2={xFor(currentMs)}
                y1={0} y2={layout.rulerY}
                stroke="var(--accent)" strokeWidth={1.5}
                style={{ pointerEvents: 'none' }} />
        )}
      </svg>
    </div>
  );
}
