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
//   - ScriptChart          — funscript curve over a window
//   - BpmBandChart         — full-script colored funscript: phrase
//                            bands by BPM tier + curve overlay. The
//                            canonical "colored funscript" view.
//   - ChartTitleStrip      — header strip (title · meta · meta · time)
//   - BPM_TIERS, bpmTier   — small classification utility
//   - tagColor, tagLabel   — phrase-tag → color/label, with `tags` prop
//                            for the lookup table (was window.FF_TAGS
//                            in the iter 08 Babel build).
//
// Deferred to a future version (port when consumers actually need them):
//   - PreviewChart         — original-vs-preview overlay (depends on
//                            ScriptChart, which is now ported)
//   - ScopePlayer          — composite player widget
//   - MiniWave             — small waveform thumbnail
//   - Sparkline            — phrase-mini sparkline
//   - DiffSparkline        — diff visualization
//   - PhraseDetailZoomChart — zoomed phrase close-up (companion to
//                            BpmBandChart for drilled-in views)

import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtTimeShort } from './primitives.jsx';

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

// ─── ScriptChart ───────────────────────────────────────────────────
//
// Funscript curve over a viewport window. Phrases drawn as faint colored
// bands on top. Optional edit-region highlight dims the surrounding
// area to focus the eye on the active range. Click anywhere on the
// canvas to seek (when onSeek is wired). The playhead renders as a
// vertical line + downward-pointing pip from the top.
//
// Tone is configurable so the curve can echo the BPM tier of whatever
// phrase the consumer is highlighting (pass `tone={bpmTier(bpm)}` style
// `{fill, stroke, dot}`). Defaults to the lqr studio accent red.
//
// Props:
//   actions          [{at: ms, pos: 0-100}]
//   phrases          [{id, start, end, tag?}] (optional)
//   tags             [{id, label, color}] (optional — tag catalog
//                    for the phrase bands; replaces iter 08's
//                    window.FF_TAGS global lookup)
//   totalMs          number — full track duration; required when
//                    endMs is not supplied
//   startMs / endMs  viewport range; defaults to the full track
//   currentMs        playhead position
//   onSeek(ms)       click handler
//   onSelectPhrase(id) phrase-band click handler
//   selectedPhraseId currently highlighted phrase
//   showPhraseTags   bool, default true
//   showActions      'auto' | 'always' | 'never'
//                    auto: render action dots when zoomed in
//                    enough that they're meaningful
//   tone             { fill, stroke, dot } override
//   highlight        { start, end } — full-height tinted band marking
//                    the active edit region; surrounding area dims
//   height           px, default 180
export function ScriptChart({
  actions, phrases = [], tags = [], totalMs,
  startMs = 0, endMs,
  currentMs, onSeek,
  height = 180, showPhraseTags = true, selectedPhraseId, onSelectPhrase,
  showActions = 'auto',
  tone,
  highlight,
}) {
  const _tone = tone || { fill: '#ff4b4b', stroke: '#ff7b7b', dot: '#ff4b4b' };
  const wrapRef = useRef();
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const vpStart = startMs;
  const vpEnd = endMs ?? totalMs;
  const vpDur = Math.max(1, vpEnd - vpStart);
  const padTop = showPhraseTags ? 22 : 6;
  const padBottom = 18;
  const plotH = height - padTop - padBottom;

  const xFor = (ms) => ((ms - vpStart) / vpDur) * width;
  const yFor = (pos) => padTop + (1 - pos / 100) * plotH;
  const msFromX = (x) => vpStart + (x / width) * vpDur;

  // Actions visible in the viewport, with one extra point on each
  // side so the curve's first/last segment renders across the edge.
  const visible = useMemo(() => {
    const out = [];
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a.at < vpStart - 50) {
        if (i + 1 < actions.length && actions[i + 1].at >= vpStart - 50) out.push(a);
        continue;
      }
      if (a.at > vpEnd + 50) { out.push(a); break; }
      out.push(a);
    }
    return out;
  }, [actions, vpStart, vpEnd]);

  const pathD = visible.length === 0 ? '' : visible.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${xFor(p.at).toFixed(1)} ${yFor(p.pos).toFixed(1)}`,
  ).join(' ');
  // Fill path closes the curve down to the bottom-left and back so
  // the gradient fills the area below the curve.
  const fillD = visible.length === 0 ? '' :
    `${pathD} L ${xFor(visible[visible.length - 1].at).toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${xFor(visible[0].at).toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

  // Time ticks at nice intervals — picks the largest step that
  // produces ≤12 ticks across the viewport so the axis doesn't
  // turn into an unreadable line of stamps.
  const ticks = useMemo(() => {
    const niceSteps = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000];
    const step = niceSteps.find((s) => vpDur / s < 12) ?? 600000;
    const first = Math.ceil(vpStart / step) * step;
    const out = [];
    for (let t = first; t <= vpEnd; t += step) out.push(t);
    return out;
  }, [vpStart, vpEnd, vpDur]);

  // Action dots are only useful when the viewport is short enough
  // and the action count is small enough that each dot is a
  // distinct pixel; otherwise they smear into the curve.
  const drawPts = showActions === 'always'
    ? true
    : showActions === 'never' ? false : vpDur < 60000 && visible.length < 200;

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek?.(msFromX(e.clientX - rect.left));
  };

  // SVG <linearGradient> needs a unique id; we derive it from the
  // fill color so a page rendering multiple ScriptCharts with
  // different tones doesn't end up sharing one gradient definition.
  const gradId = `ffFill_${_tone.fill.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <div ref={wrapRef} style={{
      width: '100%', height,
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      <svg
        width={width} height={height}
        onClick={handleClick}
        style={{ cursor: onSeek ? 'pointer' : 'default', display: 'block' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor={_tone.fill} stopOpacity="0.42" />
            <stop offset="100%" stopColor={_tone.fill} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* edit-region highlight: dim wash on either side, dashed
            frame around the active band. Drawn behind the curve so
            the action line stays readable. */}
        {highlight && highlight.end > vpStart && highlight.start < vpEnd && (() => {
          const hx = Math.max(0, xFor(Math.max(vpStart, highlight.start)));
          const hw = Math.max(2, xFor(Math.min(vpEnd, highlight.end)) - hx);
          return (
            <g>
              {hx > 0 && (
                <rect x={0} y={padTop} width={hx} height={plotH}
                      fill="#000" fillOpacity={0.45} />
              )}
              {hx + hw < width && (
                <rect x={hx + hw} y={padTop} width={width - hx - hw} height={plotH}
                      fill="#000" fillOpacity={0.45} />
              )}
              <rect x={hx} y={padTop} width={hw} height={plotH}
                    fill="none" stroke="#fff" strokeOpacity={0.5}
                    strokeWidth={1} strokeDasharray="3 3" />
            </g>
          );
        })()}

        {/* horizontal position grid (0/25/50/75/100). Mid-line at 50
            is solid; the others are dashed. */}
        {[0, 25, 50, 75, 100].map((p) => (
          <line key={p}
            x1={0} x2={width} y1={yFor(p)} y2={yFor(p)}
            stroke="var(--border)"
            strokeOpacity={p === 50 ? 0.6 : 0.25}
            strokeDasharray={p === 50 ? '' : '2 4'}
          />
        ))}

        {/* phrase tag bands across the top */}
        {showPhraseTags && phrases.map((ph) => {
          if (ph.end < vpStart || ph.start > vpEnd) return null;
          const x = Math.max(0, xFor(ph.start));
          const w = Math.min(width, xFor(ph.end)) - x;
          const sel = ph.id === selectedPhraseId;
          const color = tagColor(ph.tag, tags);
          return (
            <g key={ph.id}
              onClick={(e) => { e.stopPropagation(); onSelectPhrase?.(ph.id); }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={x} y={0} width={Math.max(2, w - 1)} height={padTop - 4}
                fill={color}
                fillOpacity={sel ? 0.85 : ph.tag ? 0.55 : 0.30}
                stroke={sel ? '#fff' : 'transparent'} strokeWidth={1}
                rx={2}
              />
              {ph.tag && w > 32 && (
                <text
                  x={x + 4} y={padTop - 8} fontSize={9} fontWeight={700}
                  fill="#0e1117" style={{ pointerEvents: 'none' }}
                  clipPath={`inset(0 ${Math.max(0, width - x - w + 4)}px 0 ${x + 2}px)`}
                >
                  {tagLabel(ph.tag, tags)}
                </text>
              )}
            </g>
          );
        })}

        {/* time ticks along the bottom */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={xFor(t)} x2={xFor(t)} y1={padTop} y2={padTop + plotH}
              stroke="var(--border)" strokeOpacity={0.2}
            />
            <text
              x={xFor(t) + 3} y={height - 5} fontSize={9}
              fontFamily="var(--font-mono)" fill="var(--text-dim)"
            >
              {fmtTimeShort(t)}
            </text>
          </g>
        ))}

        {/* the curve */}
        {fillD && <path d={fillD} fill={`url(#${gradId})`} />}
        {pathD && (
          <path
            d={pathD} fill="none" stroke={_tone.stroke}
            strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* action dots when zoomed in enough */}
        {drawPts && visible.map((p, i) => (
          <circle
            key={i} cx={xFor(p.at)} cy={yFor(p.pos)} r={2.2}
            fill={_tone.dot} stroke="#fff" strokeWidth={0.5}
          />
        ))}

        {/* playhead — vertical line + top-edge triangle pip */}
        {currentMs != null && currentMs >= vpStart && currentMs <= vpEnd && (
          <>
            <line
              x1={xFor(currentMs)} x2={xFor(currentMs)} y1={0} y2={height}
              stroke="#fff" strokeWidth={1} strokeOpacity={0.9}
            />
            <polygon
              points={`${xFor(currentMs) - 4},${padTop} ${xFor(currentMs) + 4},${padTop} ${xFor(currentMs)},${padTop + 5}`}
              fill="#fff"
            />
          </>
        )}
      </svg>
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
  selectedId, onSelect, onSeek,
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
                onClick={() => {
                  // Both gestures fire on the same click — "I clicked
                  // this chapter, take me there" is the natural mental
                  // model. Consumers wire seek to setCurrentMs and
                  // select to setScopedChapterId.
                  onSelect?.(ch);
                  onSeek?.(ch.at_ms);
                }}
                style={{ cursor: (onSelect || onSeek) ? 'pointer' : 'default' }}
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

// ─── BpmBandChart ──────────────────────────────────────────────────
//
// The "colored funscript" view used across the lqr toolchain: forgegen
// Output, FFP Export, every per-phrase mini-preview, beatflo's
// composition overview. Full-script overview where phrase boundaries
// become full-height bands tinted by BPM tier (high=orange, mid=blue,
// low=grey) and the funscript curve runs in accent over the top.
//
// What distinguishes this from `ScriptChart`:
//   - ScriptChart is a viewport into a (start, end) window — for editing
//     and inspection. Bands are thin phrase-tag chips at the top.
//   - BpmBandChart is the full-track overview. Bands are full-height
//     BPM-tier color washes. No phrase tags; phrases are identified by
//     their tier color and numbered along the top edge. Legend overlay
//     in the top-right corner names the tiers.
//
// Props:
//   actions       [{ at, pos }] — every action across the full track
//   phrases       [{ id, start, end, bpm }] — phrase records carrying
//                 their BPM (so the chart can classify each into a tier)
//   totalMs       full track duration
//   title         text shown left in the ChartTitleStrip header
//   bpmAvg        precomputed average BPM (optional — falls back to
//                 mean of phrase BPMs)
//   currentMs     playhead position (optional)
//   onSeek(ms)    click-to-seek handler (optional)
//   height        px, default 240
//
// Action down-sampling: when actions.length > 1500 the curve falls
// back to ~1200 evenly-strided points. Visually identical for the
// overview scale; keeps the SVG path under a few kB even on
// multi-hour funscripts.
export function BpmBandChart({
  actions, phrases, totalMs, title = 'script',
  bpmAvg, currentMs, onSeek, height = 240,
}) {
  const wrapRef = useRef();
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const padTop = 18, padBottom = 24, padLeft = 38, padRight = 14;
  const plotH = height - padTop - padBottom;
  const plotW = Math.max(0, width - padLeft - padRight);

  const xFor = (ms) => padLeft + (ms / totalMs) * plotW;
  const yFor = (pos) => padTop + (1 - pos / 100) * plotH;
  const msFromX = (x) => ((x - padLeft) / plotW) * totalMs;

  const ticks = useMemo(() => {
    const niceSteps = [15000, 30000, 60000, 120000, 300000, 600000];
    const step = niceSteps.find((s) => totalMs / s < 14) ?? 600000;
    const out = [];
    for (let t = 0; t <= totalMs; t += step) out.push(t);
    return out;
  }, [totalMs]);

  // Down-sample for performance on long scripts. The path is the
  // dominant render cost; phrases + ticks are fixed-count.
  const sampled = useMemo(() => {
    if (actions.length < 1500) return actions;
    const target = 1200;
    const stride = Math.ceil(actions.length / target);
    return actions.filter((_, i) => i % stride === 0);
  }, [actions]);

  const pathD = sampled.length === 0 ? '' : sampled.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${xFor(p.at).toFixed(1)} ${yFor(p.pos).toFixed(1)}`,
  ).join(' ');

  const handleClick = (e) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(msFromX(e.clientX - rect.left));
  };

  const phraseAvg = phrases.length > 0
    ? Math.round(phrases.reduce((s, p) => s + p.bpm, 0) / phrases.length)
    : 0;
  const meta = [
    `${phrases.length} phrases`,
    `${bpmAvg ?? phraseAvg} BPM avg`,
    fmtTimeShort(totalMs),
  ];

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      <ChartTitleStrip title={title} meta={meta} />
      <div ref={wrapRef} style={{ position: 'relative', background: 'var(--bg)' }}>
        <svg
          width={width} height={height} onClick={handleClick}
          style={{ display: 'block', cursor: onSeek ? 'pointer' : 'default' }}
        >
          {/* phrase BPM bands — full-height behind the curve */}
          {phrases.map((ph) => {
            const tier = bpmTier(ph.bpm);
            const x = xFor(ph.start);
            const w = Math.max(1, xFor(ph.end) - x);
            return (
              <g key={ph.id}>
                <rect x={x} y={padTop} width={w} height={plotH} fill={tier.fill} />
                <line
                  x1={x} x2={x} y1={padTop} y2={padTop + plotH}
                  stroke={tier.stroke} strokeWidth={1}
                />
              </g>
            );
          })}

          {/* y-axis grid + labels (0/25/50/75/100; mid line solid) */}
          {[0, 25, 50, 75, 100].map((p) => (
            <g key={p}>
              <line
                x1={padLeft} x2={width - padRight} y1={yFor(p)} y2={yFor(p)}
                stroke="var(--border)"
                strokeOpacity={p === 50 ? 0.55 : 0.22}
                strokeDasharray={p === 50 ? '' : '2 4'}
              />
              <text
                x={padLeft - 6} y={yFor(p) + 3} textAnchor="end"
                fontSize={9} fontFamily="var(--font-mono)" fill="var(--text-dim)"
              >
                {p}
              </text>
            </g>
          ))}
          <text
            x={6} y={padTop + plotH / 2} textAnchor="middle"
            fontSize={9} fontFamily="var(--font-mono)" fill="var(--text-dim)"
            transform={`rotate(-90 12 ${padTop + plotH / 2})`}
          >
            Position (0–100)
          </text>

          {/* x-axis time ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={xFor(t)} x2={xFor(t)} y1={padTop + plotH}
                y2={padTop + plotH + 3}
                stroke="var(--border)" strokeOpacity={0.5}
              />
              <text
                x={xFor(t)} y={height - 8} textAnchor="middle"
                fontSize={9} fontFamily="var(--font-mono)" fill="var(--text-dim)"
              >
                {fmtTimeShort(t)}
              </text>
            </g>
          ))}
          <text
            x={padLeft + plotW / 2} y={height - 1} textAnchor="middle"
            fontSize={9} fontFamily="var(--font-mono)" fill="var(--text-dim)"
          >
            Time
          </text>

          {/* phrase numbers riding top edge — skip very narrow bands */}
          {phrases.map((ph, i) => {
            const tier = bpmTier(ph.bpm);
            const x = xFor(ph.start);
            const w = Math.max(1, xFor(ph.end) - x);
            if (w < 6) return null;
            return (
              <text
                key={ph.id}
                x={x + Math.min(w / 2, 10)} y={padTop - 5}
                fontSize={9} fontFamily="var(--font-mono)"
                fill={tier.dot} textAnchor="start"
                style={{ pointerEvents: 'none' }}
              >
                {i + 1}
              </text>
            );
          })}

          {/* funscript curve — accent blue over the colored bands */}
          {pathD && (
            <path
              d={pathD} fill="none" stroke="#4dabf7" strokeWidth={1}
              strokeLinejoin="round" strokeLinecap="round" strokeOpacity={0.95}
            />
          )}

          {/* playhead */}
          {currentMs != null && currentMs >= 0 && currentMs <= totalMs && (
            <line
              x1={xFor(currentMs)} x2={xFor(currentMs)}
              y1={padTop} y2={padTop + plotH}
              stroke="#fff" strokeWidth={1} strokeOpacity={0.85}
            />
          )}
        </svg>

        {/* legend overlay — top right corner names the BPM tiers so
            the colored bands are self-explanatory at a glance. */}
        <div style={{
          position: 'absolute', top: 10, right: 16,
          display: 'flex', flexDirection: 'column', gap: 4,
          background: 'rgba(15,17,21,0.88)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '6px 10px',
          fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
        }}>
          {BPM_TIERS.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 12, height: 8, background: t.fill,
                border: `1px solid ${t.stroke}`,
              }} />
              {t.label}
            </div>
          ))}
        </div>
      </div>
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
