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

const PAD_X = 8;          // horizontal inset so end-bands/ticks don't clip
const LANE_GAP = 6;       // vertical gap between lanes
const RULER_H = 16;       // bottom time-ruler height
const LABEL_FILL = 'rgba(255,255,255,0.34)';

// Default per-lane heights; consumer can override via `laneHeights`.
const DEFAULT_HEIGHTS = {
  funscript: 92,
  events: 80,    // a band of stacked event rows
  audio: 56,
  spectro: 48,
  thumbs: 44,
};

export function TrackStack({
  scope,                          // { start, end } ms — the slice window
  actions = [],                   // funscript [{ at, pos }] (any range)
  events = [],                    // [{ id, start, end, color, label }]
  lanes = ['events', 'funscript'],// top→bottom order; only present data renders
  currentMs = null,
  baton = 'line',                 // 'line' | 'none'
  selectedEventId = null,
  onSeek,
  onSelectEvent,
  laneHeights,
  eventRows = 4,                  // lane-packing rows inside the events lane
  showRuler = true,
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
    return false; // audio/spectro/thumbs not wired yet
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

  // Funscript polyline, scoped + decimated to ~plot width.
  const funPath = useMemo(() => {
    const row = laneOf('funscript');
    if (!row || !actions.length) return '';
    const inWin = actions.filter((a) => a.at >= start && a.at <= end);
    const src = inWin.length > 1 ? inWin : actions;
    const target = Math.min(plotW, 1500);
    const stride = Math.max(1, Math.floor(src.length / target));
    const pts = [];
    for (let i = 0; i < src.length; i += stride) {
      const a = src[i];
      pts.push([xFor(a.at), row.y + (1 - a.pos / 100) * row.h]);
    }
    const last = src[src.length - 1];
    if (last) pts.push([xFor(last.at), row.y + (1 - last.pos / 100) * row.h]);
    return pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
      .join('');
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
        {/* Lane backgrounds + labels */}
        {layout.rows.map((row) => (
          <g key={row.kind}>
            <rect x={PAD_X} y={row.y} width={plotW} height={row.h}
                  fill="rgba(255,255,255,0.02)" rx={4} />
            <text x={PAD_X + 6} y={row.y + 11}
                  fontSize={9} fontWeight={700} fill={LABEL_FILL}
                  style={{ pointerEvents: 'none', letterSpacing: '0.08em',
                           textTransform: 'uppercase' }}>
              {row.kind}
            </text>
          </g>
        ))}

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

        {/* Funscript lane — full-strength position line */}
        {funPath && (
          <path d={funPath} fill="none"
                stroke="rgba(255,255,255,0.82)" strokeWidth={1.25}
                strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }} />
        )}

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
