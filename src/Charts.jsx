// Shared visualisation primitives — pure SVG so they stay crisp at any
// zoom. Ported from forge-ui-design/iterations/08-redesign/design_files/Charts.jsx
// per the REUSABLE_INVENTORY.md plan, scope-trimmed to the v0.0.2 subset
// (timeline / phrase / chapter strip primitives + small utilities).
//
// Shipped here:
//   - PhraseRibbon         — horizontal phrase strip with click-to-select
//   - BehaviorTagBar       — stacked %-bar by behavior tag
//   - ChapterStrip   (NEW) — chapter list as a click-to-scope strip;
//                            closes the +mark → visible chapter loop
//   - ChartTitleStrip      — header strip (title · meta · meta · time)
//   - BPM_TIERS, bpmTier   — small classification utility
//   - tagColor, tagLabel   — phrase-tag → color/label, with `tags` prop
//                            for the lookup table (was window.FF_TAGS
//                            in the iter 08 Babel build).
//
// Deferred to a future version (port when consumers actually need them):
//   - ScriptChart          — funscript curve over a window
//   - PreviewChart         — original-vs-preview overlay
//   - ScopePlayer          — composite player widget
//   - MiniWave             — small waveform thumbnail
//   - Sparkline            — phrase-mini sparkline
//   - DiffSparkline        — diff visualization
//   - BpmBandChart         — full-script BPM bands + curve
//   - PhraseDetailZoomChart — zoomed phrase view

import { useEffect, useMemo, useRef, useState } from 'react';

// ─── BPM tiers ──────────────────────────────────────────────────────
//
// Classification used by the BPM bands. Match colors in the
// matplotlib export pipeline so the screen + export legend look
// consistent.
export const BPM_TIERS = [
  { id: 'high', label: 'High BPM (>110)', min: 110, fill: 'rgba(255,181,71,0.10)', stroke: 'rgba(255,181,71,0.28)', dot: '#ffb547' },
  { id: 'mid',  label: 'Mid BPM (60–110)', min: 60,  fill: 'rgba(91,108,255,0.12)', stroke: 'rgba(91,108,255,0.30)', dot: '#5b6cff' },
  { id: 'low',  label: 'Low BPM (<60)',    min: 0,   fill: 'rgba(148,163,184,0.08)', stroke: 'rgba(148,163,184,0.22)', dot: '#94a3b8' },
];

export function bpmTier(bpm) {
  if (bpm > 110) return BPM_TIERS[0];
  if (bpm >= 60) return BPM_TIERS[1];
  return BPM_TIERS[2];
}

// ─── Tag color / label (replaces window.FF_TAGS lookup) ────────────
//
// In iter 08, both helpers reached for a global `window.FF_TAGS`. For
// the library, the tag catalog is now a prop the consumer passes —
// matches the rest of the framework's "data flows through props"
// posture and lets FFP / forgegen / beatflo each carry their own
// vocabularies if they want.
//
// `tags` shape: `[{ id, label, color }, ...]`. Missing tagId means
// "well-formed" (success-green) per the FFP behavior-tag convention.
export function tagColor(tagId, tags = []) {
  if (!tagId) return '#3ed598';
  const t = tags.find((x) => x.id === tagId);
  return t ? t.color : 'var(--text-muted)';
}

export function tagLabel(tagId, tags = []) {
  if (!tagId) return 'well-formed';
  const t = tags.find((x) => x.id === tagId);
  return t ? t.label : tagId;
}

// ─── PhraseRibbon ──────────────────────────────────────────────────
//
// Horizontal strip of phrase bands across the whole script. Click a
// band to select; the playhead position renders as a vertical white
// line. `tags` is the catalog used to resolve `phrase.tag` → color.
export function PhraseRibbon({
  phrases, totalMs, height = 26,
  selectedId, onSelect, currentMs, tags = [],
}) {
  const wrapRef = useRef();
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  const xFor = (ms) => (ms / totalMs) * width;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height }}>
      <svg width={width} height={height}>
        {phrases.map((ph) => {
          const x = xFor(ph.start);
          const w = Math.max(2, xFor(ph.end) - x - 1);
          const color = tagColor(ph.tag, tags);
          const sel = ph.id === selectedId;
          return (
            <g key={ph.id}>
              <rect
                x={x} y={0} width={w} height={height - 4} rx={2}
                fill={color}
                fillOpacity={sel ? 0.95 : ph.tag ? 0.7 : 0.45}
                stroke={sel ? '#fff' : 'transparent'} strokeWidth={1}
                onClick={() => onSelect?.(ph.id)}
                style={{ cursor: 'pointer' }}
              />
              {ph.tag && w > 36 && (
                <text
                  x={x + 4} y={height - 9} fontSize={9}
                  fill="#0e1117" fontWeight={700}
                  style={{ pointerEvents: 'none' }}
                  clipPath={`inset(0 ${Math.max(0, width - x - w + 4)}px 0 ${x + 2}px)`}
                >
                  {tagLabel(ph.tag, tags)}
                </text>
              )}
            </g>
          );
        })}
        {currentMs != null && (
          <line
            x1={xFor(currentMs)} x2={xFor(currentMs)} y1={0} y2={height - 4}
            stroke="#fff" strokeWidth={1}
          />
        )}
      </svg>
    </div>
  );
}

// ─── BehaviorTagBar ────────────────────────────────────────────────
//
// Stacked horizontal bar showing the % of script duration in each
// behavior tag bucket. Same `tags` prop as PhraseRibbon — order of
// segments matches the tag catalog order (with "well-formed" first).
export function BehaviorTagBar({ phrases, totalMs, height = 14, tags = [] }) {
  const buckets = useMemo(() => {
    const acc = {};
    for (const p of phrases) {
      const dur = p.end - p.start;
      const k = p.tag || '_clean';
      acc[k] = (acc[k] || 0) + dur;
    }
    const order = ['_clean', ...tags.map((t) => t.id)];
    return order.filter((k) => acc[k]).map((k) => ({
      id: k,
      label: k === '_clean' ? 'well-formed' : tagLabel(k, tags),
      color: k === '_clean' ? '#3ed598' : tagColor(k, tags),
      pct: (acc[k] / totalMs) * 100,
    }));
  }, [phrases, totalMs, tags]);
  return (
    <div style={{
      display: 'flex', height, borderRadius: 4, overflow: 'hidden',
      background: 'var(--surface-2)',
    }}>
      {buckets.map((b) => (
        <div
          key={b.id}
          title={`${b.label} · ${b.pct.toFixed(1)}%`}
          style={{ width: `${b.pct}%`, background: b.color }}
        />
      ))}
    </div>
  );
}

// ─── ChapterStrip (NEW) ────────────────────────────────────────────
//
// Net-new for forgemoment v0.0.2. Iter 08's Charts.jsx didn't expose a
// chapter strip; forgegen invented one locally in
// `tauri/src/components/analysis/ChapterStrip.jsx`. Promoting the shape
// here closes the loop the user identified 2026-05-14 — the +mark
// integration point produces chapter records, ChapterStrip renders
// them as a click-to-select strip, the consuming app then sets the
// MediaViewer's `chapter` prop to scope into one.
//
// Chapter shape (flexible — accepts both authored and proposal forms):
//   { id?, at_ms, end_ms?, name?, color?, intent? }
//
// `at_ms` is required; everything else has a sensible default. Trailing
// chapters with `end_ms === undefined` extend to the next chapter's
// start (or to `totalMs` if it's the last one). Colors default to a
// repeating palette indexed by chapter position so a freshly-marked
// chapter list looks distinct without the consumer hand-coloring.
const CHAPTER_PALETTE = [
  '#4dabf7', '#3ed598', '#ffb547', '#c77dff', '#ff7b7b',
  '#56e0a0', '#8b9bff', '#ff5470', '#5b6cff', '#22c55e',
];

export function ChapterStrip({
  chapters, totalMs, currentMs,
  selectedId, onSelect,
  height = 28,
}) {
  const wrapRef = useRef();
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Normalise: sort by at_ms, fill in end_ms from the next chapter's
  // start when missing, ensure each has a stable id (fall back to
  // position-based key if none given), pick a palette color when none
  // provided.
  const normalised = useMemo(() => {
    const sorted = [...(chapters || [])].sort((a, b) => a.at_ms - b.at_ms);
    return sorted.map((ch, i) => {
      const next = sorted[i + 1];
      const end = ch.end_ms ?? next?.at_ms ?? totalMs ?? ch.at_ms + 1000;
      return {
        ...ch,
        id: ch.id ?? `__ch-${i}-${ch.at_ms}`,
        end_ms: end,
        color: ch.color ?? CHAPTER_PALETTE[i % CHAPTER_PALETTE.length],
      };
    });
  }, [chapters, totalMs]);

  const range = Math.max(1, totalMs ?? (normalised[normalised.length - 1]?.end_ms || 1));
  const xFor = (ms) => (ms / range) * width;

  return (
    <div ref={wrapRef} style={{
      position: 'relative', width: '100%', height,
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      {normalised.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          fontSize: 11, color: 'var(--text-dim)',
        }}>
          no chapters yet
        </div>
      )}
      <svg width={width} height={height} style={{ display: 'block' }}>
        {normalised.map((ch) => {
          const x = xFor(ch.at_ms);
          const w = Math.max(2, xFor(ch.end_ms) - x - 1);
          const sel = ch.id === selectedId;
          return (
            <g key={ch.id}>
              <rect
                x={x} y={2} width={w} height={height - 4} rx={3}
                fill={ch.color}
                fillOpacity={sel ? 0.95 : 0.55}
                stroke={sel ? '#fff' : 'transparent'} strokeWidth={1}
                onClick={() => onSelect?.(ch)}
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
              />
              {ch.name && w > 40 && (
                <text
                  x={x + 6} y={height / 2 + 3} fontSize={10}
                  fill="#0e1117" fontWeight={700}
                  style={{ pointerEvents: 'none' }}
                  clipPath={`inset(0 ${Math.max(0, width - x - w + 6)}px 0 ${x + 2}px)`}
                >
                  {ch.name}
                </text>
              )}
            </g>
          );
        })}
        {currentMs != null && (
          <line
            x1={xFor(currentMs)} x2={xFor(currentMs)} y1={0} y2={height}
            stroke="#fff" strokeWidth={1.5}
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>
    </div>
  );
}

// ─── ChartTitleStrip ───────────────────────────────────────────────
//
// Header used above the deferred BpmBandChart / PhraseDetailZoomChart.
// Ported here because it's small and useful in its own right
// (title · meta · meta · meta, dot-separated, mono-styled). Consumers
// can compose their own chart headers using it.
export function ChartTitleStrip({ title, meta = [] }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'baseline',
      gap: 14, padding: '10px 14px',
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      fontSize: 13, color: 'var(--text)', fontWeight: 600,
    }}>
      <span className="mono" style={{ color: 'var(--text)' }}>{title}</span>
      {meta.map((m, i) => (
        <span key={i} style={{ display: 'inline-flex', gap: 14, alignItems: 'baseline' }}>
          <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>·</span>
          <span className="mono" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{m}</span>
        </span>
      ))}
    </div>
  );
}
