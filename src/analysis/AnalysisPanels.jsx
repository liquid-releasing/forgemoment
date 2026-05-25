// analysis/AnalysisPanels.jsx — primitives for the LQR Analysis surface.
//
// Pure presentational components. Each panel takes data-source-agnostic
// props plus a `status: 'loading' | 'error' | 'empty' | 'ready'` so the
// consuming app can drive progressive reveal as pipeline stages land.
//
// **Reuse target**: FunscriptForge composes these in its Analysis tab;
// ForgeGen will compose them into its own analysis screen; Beatflo
// will lift the chapter-discrete subset for its overview. None of the
// panels know which app they're inside — they render data they're
// given and otherwise show their skeleton.
//
// **Error contract** (per the user-actionable-errors rule): every
// panel in `status === 'error'` renders a red-bordered card with the
// error message + a Retry button. Never strand the page on a half-
// loaded section with no way to recover.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../primitives.jsx';
import { VELOCITY_COLOR_STOPS, interpolateColorStops } from '../Charts.jsx';

// Legacy → new texture-label map for chapters written by pre-2026-05-24
// builds (music/ambient/mixed → driving/calm/varied). Mirrors
// videoflow.chapters._LEGACY_CONTENT_TYPE_MAP — the Python writer
// migrates on its next analyze pass, but the UI maps on read so old
// sidecars still display the new vocabulary without a re-analyze.
const LEGACY_CONTENT_TYPE_MAP = {
  music: 'driving',
  ambient: 'calm',
  mixed: 'varied',
};

// Format a chapter's content+voice into a compound label like
// "TALK · DRIVING" or "CALM" (when no voice detected). Empty string
// when the chapter has neither — caller renders just the chapter
// number in that case.
function formatChapterCategory(chapter) {
  if (!chapter) return '';
  const rawTexture = chapter.contentType ?? chapter.content_type ?? '';
  const texture = LEGACY_CONTENT_TYPE_MAP[rawTexture] ?? rawTexture;
  const voice = chapter.voiceLabel ?? chapter.voice_label ?? '';
  if (voice && texture) return `${voice} · ${texture}`.toUpperCase();
  if (voice) return voice.toUpperCase();
  if (texture) return texture.toUpperCase();
  return '';
}

// ─── Section chrome ───────────────────────────────────────────────
// Every panel shares this outer shape: eyebrow + title + body. Keeps
// the visual rhythm consistent across rows.

function SectionEyebrow({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function PanelShell({ eyebrow, right, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        {right}
      </div>
      {children}
    </div>
  );
}

// Skeleton block — quiet grey panel sized to the eventual visualization.
// No animation (static) so the page reads as "calmly loading," not
// "thrashing." If we want a pulse later, define the keyframes once in
// tokens.css and toggle it via className.
function Skeleton({ height, label }) {
  return (
    <div
      role="presentation"
      aria-busy="true"
      style={{
        height, borderRadius: 8,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        display: 'grid', placeItems: 'center',
        color: 'var(--text-dim)',
        fontSize: 11.5,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Icon name="loader" size={12} stroke={1.5} />
        {label}
      </span>
    </div>
  );
}

// Error card — actionable per the user-actionable-errors rule. Always
// includes a Retry button when `onRetry` is provided; falls back to a
// plain error pane otherwise.
function ErrorCard({ height, message, onRetry }) {
  return (
    <div style={{
      height, borderRadius: 8,
      background: 'rgba(255, 84, 112, 0.06)',
      border: '1px solid rgba(255, 84, 112, 0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, padding: '0 14px',
      fontSize: 12, color: 'var(--text)',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Icon name="alert-triangle" size={13} style={{ color: '#ff5470' }} />
        <span>{message || 'Failed to load.'}</span>
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: 'transparent', color: '#ff5470',
            border: '1px solid rgba(255, 84, 112, 0.55)', borderRadius: 4,
            padding: '4px 10px', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Icon name="rotate-ccw" size={11} />
          Retry
        </button>
      )}
    </div>
  );
}

// Empty card — distinct from "loading." Renders when a panel ran
// successfully but produced no data (e.g., no funscript loaded, so
// the script overview has nothing to draw). Lighter visual weight
// than the error card.
function EmptyCard({ height, message, icon = 'circle' }) {
  return (
    <div style={{
      height, borderRadius: 8,
      background: 'var(--surface-2)',
      border: '1px dashed var(--border)',
      display: 'grid', placeItems: 'center',
      fontSize: 11.5, color: 'var(--text-dim)',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={12} />
        {message}
      </span>
    </div>
  );
}

// ─── Panel: chapter strip ─────────────────────────────────────────
// Top row — chapter ribbon with click-to-focus. Reuses the chapter
// vocabulary forgemoment already standardised. v1 ships a thin
// placeholder; the real ChapterRibbon hookup lands when the analyze
// trigger wires up.
export function ChapterStripPanel({
  status = 'loading', chapters, focusedIdx, onFocus,
  durationMs, error, onRetry,
}) {
  return (
    <PanelShell eyebrow="Script overview">
      {status === 'error'   ? <ErrorCard height={56} message={error} onRetry={onRetry} /> :
       status === 'empty'   ? <EmptyCard height={56} message="No chapters yet — analysis pending." icon="bookmark" /> :
       status === 'loading' ? <Skeleton height={56} label="Detecting chapters…" /> :
                              <ChapterStripBody chapters={chapters} focusedIdx={focusedIdx}
                                                onFocus={onFocus} durationMs={durationMs} />}
    </PanelShell>
  );
}

function ChapterStripBody({ chapters, focusedIdx, onFocus, durationMs }) {
  if (!chapters || chapters.length === 0 || !durationMs) {
    return <EmptyCard height={56} message="No chapters in this project." icon="bookmark" />;
  }
  return (
    <div style={{
      display: 'flex', height: 56, gap: 0, minWidth: 0,
      borderRadius: 8, overflow: 'hidden',
      background: 'var(--surface-2)', border: '1px solid var(--border)',
    }}>
      {chapters.map((c, i) => {
        const dur = (c.endMs ?? 0) - (c.atMs ?? 0);
        const flex = Math.max(0.0001, dur / durationMs);
        const focused = i === focusedIdx;
        const color = c.color || 'var(--accent-2)';
        return (
          <button
            key={c.id ?? i}
            onClick={() => onFocus?.(i)}
            title={c.name}
            style={{
              flex, minWidth: 0,
              background: focused ? color : `color-mix(in srgb, ${color} 60%, transparent)`,
              border: 'none',
              cursor: 'pointer', textAlign: 'left',
              padding: '8px 12px', color: '#fff',
              fontFamily: 'inherit',
              outline: focused ? '1px solid rgba(255,255,255,0.4)' : 'none',
              outlineOffset: -1,
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
            }}
          >
            <div style={{ fontSize: 9.5, fontWeight: 700, opacity: 0.9, letterSpacing: '0.05em',
                          textTransform: 'uppercase', textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}>
              {String(i + 1).padStart(2, '0')}{(() => {
                const cat = formatChapterCategory(c);
                return cat ? ` · ${cat}` : '';
              })()}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}>
              {c.name || `Chapter ${i + 1}`}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Panel: script overview row ───────────────────────────────────
// The data-source-agnostic colored row (PythonDancer-style funscript
// heatmap). Falls back to audio amplitude or video motion when no
// funscript is loaded yet — so a media-only project still shows
// something meaningful. Single row, ~24px tall.
//
// `source.kind` selects the renderer:
//   'funscript' → color by velocity (rainbow)
//   'audio'     → color by RMS amplitude (grey→amber)
//   'motion'    → color by motion magnitude (future; grey→cyan)
//
// v1 ships the skeleton + empty/error variants; the canvas painters
// land alongside the analyze hookup.
export function ScriptOverviewRow({
  status = 'loading', source, durationMs, error, onRetry,
}) {
  const eyebrow = source?.kind === 'audio' ? 'Audio overview'
                : source?.kind === 'motion' ? 'Motion overview'
                : 'Funscript heatmap';
  return (
    <PanelShell
      eyebrow={eyebrow}
      right={source?.kind && <SourceBadge kind={source.kind} />}
    >
      {status === 'error'   ? <ErrorCard height={28} message={error} onRetry={onRetry} /> :
       status === 'empty'   ? <EmptyCard height={28} message="No script, audio, or motion data yet." icon="activity" /> :
       status === 'loading' ? <Skeleton height={28} label="Reading script signal…" /> :
       source                ? <ScriptOverviewCanvas source={source} durationMs={durationMs} height={28} /> :
                              <EmptyCard height={28} message="Source unavailable." icon="activity" />}
    </PanelShell>
  );
}

// ScriptOverviewCanvas — the data-source-agnostic colored row painter.
//
// Funscript mode: per-pixel column color comes from the MAX |Δpos/Δt|
// among action pairs that overlap the column's time range. Max (not
// mean) so a single hot spike in the column reads bright — the row's
// job is to flag intensity, not average it away. Velocity is normalized
// to FUNSCRIPT_VELOCITY_REF (1.5 pos/ms ≈ 1500 pos/s) so the colormap
// is comparable across scripts; anything above that pegs at full red.
//
// Audio mode: per-pixel column = MAX peaks value in the overlapping
// bins, mapped through the same VELOCITY_COLOR_STOPS gradient. Using
// the same gradient (rather than a separate audio-specific one) gives
// readers a single visual vocabulary: blue = quiet/slow, red = loud/fast.
//
// Motion mode: same shape as audio, against a `motion` array. Deferred
// until video-motion analysis lands.
function ScriptOverviewCanvas({ source, durationMs, height = 28 }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [width, setWidth] = useState(0);

  // Resize observer — react to container width changes. Mirrors the
  // pattern used in Charts.jsx so analysis canvases behave the same
  // as the rest of forgemoment's chart family.
  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(width);
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (source?.kind === 'funscript') {
      paintFunscriptHeatmap(ctx, w, h, source, durationMs);
    } else if (source?.kind === 'audio') {
      paintAudioHeatmap(ctx, w, h, source, durationMs);
    } else if (source?.kind === 'motion') {
      paintAudioHeatmap(ctx, w, h, { ...source, peaks: source.motion, hopMs: source.hopMs }, durationMs);
    } else {
      paintEmptyTrack(ctx, w, h);
    }
  }, [width, height, source, durationMs]);

  return (
    <div ref={wrapRef} style={{
      width: '100%', borderRadius: 8, overflow: 'hidden',
      background: 'var(--bg)', border: '1px solid var(--border)',
    }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// Velocity normalization reference is computed PER SCRIPT, not fixed.
// A fixed cap (1.5 pos/ms tried first) made calm scripts wash out to
// blue/green even at their peaks. The row's job is "where are this
// script's hot spots?" — qualitative within the script, not absolute
// cross-script. Cross-script comparison happens in the KPI strip
// (avg speed numbers).
//
// We use the 95th-percentile velocity as the reference so a single
// outlier spike doesn't compress the rest of the colormap; the top
// 5% of segments peg at full red, which reads as "the hot spots."
function paintFunscriptHeatmap(ctx, w, h, source, fallbackDurationMs) {
  const actions = source.actions;
  if (!actions || actions.length < 2) {
    paintEmptyTrack(ctx, w, h);
    return;
  }
  const lastAt = actions[actions.length - 1].at;
  const total = Math.max(1, source.durationMs ?? fallbackDurationMs ?? lastAt);

  // Pass 1 — compute every action-pair velocity once.
  const n = actions.length;
  const vels = new Float32Array(n - 1);
  for (let i = 1; i < n; i++) {
    const dt = Math.max(1, actions[i].at - actions[i - 1].at);
    vels[i - 1] = Math.abs(actions[i].pos - actions[i - 1].pos) / dt;
  }

  // Reference velocity = 95th percentile. Min floor of 0.05 protects
  // against degenerate flat scripts where every segment is the same
  // speed — colormap would otherwise saturate everything at red.
  const sorted = Array.from(vels).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const ref = Math.max(0.05, p95);

  // Pass 2 — max-pool normalized velocity into pixel columns.
  const colByPx = new Float32Array(w);
  for (let i = 1; i < n; i++) {
    const a = actions[i - 1];
    const b = actions[i];
    const v = Math.min(1, vels[i - 1] / ref);
    const x0 = Math.max(0, Math.min(w - 1, Math.floor((a.at / total) * w)));
    const x1 = Math.max(0, Math.min(w - 1, Math.floor((b.at / total) * w)));
    for (let x = x0; x <= x1; x++) {
      if (v > colByPx[x]) colByPx[x] = v;
    }
  }

  paintColumns(ctx, w, h, colByPx);
}

function paintAudioHeatmap(ctx, w, h, source, fallbackDurationMs) {
  const peaks = source.peaks;
  const hopMs = source.hopMs;
  if (!peaks || peaks.length === 0 || !hopMs) {
    paintEmptyTrack(ctx, w, h);
    return;
  }
  const total = Math.max(1, peaks.length * hopMs);
  const _ = fallbackDurationMs; // unused — audio sidecar self-describes its duration
  const colByPx = new Float32Array(w);

  // Max-pool peaks into pixel columns. Same "max" semantics as the
  // funscript path so the rows read consistently.
  const samplesPerPx = peaks.length / w;
  for (let x = 0; x < w; x++) {
    const start = Math.floor(x * samplesPerPx);
    const end = Math.max(start + 1, Math.floor((x + 1) * samplesPerPx));
    let m = 0;
    for (let i = start; i < end && i < peaks.length; i++) {
      const v = Math.min(1, Math.max(0, peaks[i]));
      if (v > m) m = v;
    }
    colByPx[x] = m;
  }

  paintColumns(ctx, w, h, colByPx);
}

function paintColumns(ctx, w, h, colByPx) {
  // 1px-wide columns. With a 28px-tall row this paints fast even at
  // 4K (≈4000 fillRects), well below 1ms in practice.
  for (let x = 0; x < w; x++) {
    const t = colByPx[x];
    if (t <= 0) continue;
    ctx.fillStyle = interpolateColorStops(VELOCITY_COLOR_STOPS, t);
    ctx.fillRect(x, 0, 1, h);
  }
}

function paintEmptyTrack(ctx, w, h) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.fillRect(0, 0, w, h);
}

// ─── Panel: pitch line ────────────────────────────────────────────
// Continuous baseline curve over the whole file. Distinct from the
// velocity heatmap above (intensity per moment) and the per-chapter
// energy ribbon below (chapter-discrete). This row answers "where
// does the script *sit* over time, and how does it drift?"
//
// Source modes:
//   funscript → smoothed position centerline (mean `pos` over a
//               sliding window). High = pegging up, low = retreated.
//   audio     → spectral centroid when a mel spectrogram is available
//               (bright/percussive vs. dark/bass), else amplitude
//               envelope as a fallback.
//   motion    → smoothed motion magnitude (deferred).
export function PitchLine({
  status = 'loading', source, durationMs, error, onRetry,
}) {
  return (
    <PanelShell
      eyebrow="Pitch line"
      right={source?.kind && (
        <SourceBadge kind={source.kind} />
      )}
    >
      {status === 'error'   ? <ErrorCard height={64} message={error} onRetry={onRetry} /> :
       status === 'empty'   ? <EmptyCard height={64} message="No pitch source available." icon="trending-up" /> :
       status === 'loading' ? <Skeleton height={64} label="Computing pitch baseline…" /> :
       source                ? <PitchLineCanvas source={source} durationMs={durationMs} height={64} /> :
                              <EmptyCard height={64} message="Source unavailable." icon="trending-up" />}
    </PanelShell>
  );
}

function PitchLineCanvas({ source, durationMs, height = 64 }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(width);
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (source?.kind === 'funscript') {
      paintFunscriptPitch(ctx, w, h, source, durationMs);
    } else if (source?.kind === 'audio' && source.cells && source.nMels) {
      paintAudioSpectrogramPitch(ctx, w, h, source);
    } else if (source?.kind === 'audio' && source.peaks) {
      paintAudioPeaksPitch(ctx, w, h, source);
    } else {
      paintEmptyTrack(ctx, w, h);
    }
  }, [width, height, source, durationMs]);

  return (
    <div ref={wrapRef} style={{
      width: '100%', borderRadius: 8, overflow: 'hidden',
      background: 'var(--bg)', border: '1px solid var(--border)',
    }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// Funscript pitch = smoothed position centerline. Bucket actions into
// pixel columns, take the mean `pos` per column (with carry-forward
// across empty columns so sparse regions don't snap to zero), then
// smooth with a small moving-average window. Funscript pos is 0..100;
// high values draw at the top of the chart.
function paintFunscriptPitch(ctx, w, h, source, fallbackDurationMs) {
  const actions = source.actions;
  if (!actions || actions.length < 2) { paintEmptyTrack(ctx, w, h); return; }
  const lastAt = actions[actions.length - 1].at;
  const total = Math.max(1, source.durationMs ?? fallbackDurationMs ?? lastAt);

  const sumPos = new Float32Array(w);
  const cnt = new Uint16Array(w);
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const x = Math.max(0, Math.min(w - 1, Math.floor((a.at / total) * w)));
    sumPos[x] += a.pos;
    cnt[x] += 1;
  }

  // Mean per column with carry-forward for empty columns. Seed `last`
  // from the first action so the curve doesn't start at 50 (which would
  // create a spurious dip-or-rise opening).
  const mean = new Float32Array(w);
  let last = actions[0].pos;
  for (let i = 0; i < w; i++) {
    if (cnt[i] > 0) { mean[i] = sumPos[i] / cnt[i]; last = mean[i]; }
    else mean[i] = last;
  }

  // Smoothing radius scales with width — fixed pixel count would
  // look noisy on wide windows and over-smoothed on narrow ones.
  const radius = Math.max(4, Math.floor(w / 48));
  const smoothed = movingAverage(mean, radius);
  paintPitchTrace(ctx, w, h, smoothed, 0, 100);
}

// Audio pitch (spectrogram path) = spectral centroid. For each frame,
// the centroid = Σ(i · mag[i]) / Σ(mag[i]) over mel bins — i.e. the
// "center of mass" of the spectrum. Higher = brighter / more high-freq
// content (cymbals, vocals), lower = darker / bass-heavy.
function paintAudioSpectrogramPitch(ctx, w, h, source) {
  const cells = source.cells;
  const nMels = source.nMels;
  if (!cells || !cells.length || !nMels) { paintEmptyTrack(ctx, w, h); return; }
  const frames = Math.floor(cells.length / nMels);
  if (frames < 2) { paintEmptyTrack(ctx, w, h); return; }

  const centroids = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const base = f * nMels;
    let num = 0; let den = 0;
    for (let i = 0; i < nMels; i++) {
      const m = cells[base + i];
      num += i * m;
      den += m;
    }
    centroids[f] = den > 1e-9 ? num / den : 0;
  }

  // Bin frames into pixel columns (mean centroid per column).
  const values = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const f0 = Math.floor(x * frames / w);
    const f1 = Math.max(f0 + 1, Math.floor((x + 1) * frames / w));
    let s = 0; let n = 0;
    for (let f = f0; f < f1 && f < frames; f++) { s += centroids[f]; n++; }
    values[x] = n > 0 ? s / n : 0;
  }

  const radius = Math.max(2, Math.floor(w / 60));
  const smoothed = movingAverage(values, radius);
  // Auto-fit to observed range — spectral centroid for typical music
  // lives in a narrow band (often the lower third of the mel range),
  // so normalising against 0..nMels-1 crushes the curve against the
  // bottom. A 5% pad on each end keeps it off the edges.
  const [lo, hi] = autoRange(smoothed, 0.05);
  paintPitchTrace(ctx, w, h, smoothed, lo, hi);
}

// Audio pitch (peaks fallback) = smoothed amplitude envelope. Used
// when we only have onset peaks, not a spectrogram. Less informative
// than the centroid but gives the eye *something* to follow before the
// spectrogram stage lands.
function paintAudioPeaksPitch(ctx, w, h, source) {
  const peaks = source.peaks;
  if (!peaks || peaks.length === 0) { paintEmptyTrack(ctx, w, h); return; }

  const values = new Float32Array(w);
  const samplesPerPx = peaks.length / w;
  for (let x = 0; x < w; x++) {
    const start = Math.floor(x * samplesPerPx);
    const end = Math.max(start + 1, Math.floor((x + 1) * samplesPerPx));
    let s = 0; let n = 0;
    for (let i = start; i < end && i < peaks.length; i++) {
      s += Math.max(0, Math.min(1, peaks[i])); n++;
    }
    values[x] = n > 0 ? s / n : 0;
  }

  const radius = Math.max(2, Math.floor(w / 60));
  const smoothed = movingAverage(values, radius);
  paintPitchTrace(ctx, w, h, smoothed, 0, 1);
}

// Auto-fit a curve to its observed range with a fractional pad on
// each end. Guards against zero-range data by returning a tiny window
// around the constant value so paintPitchTrace doesn't divide by zero.
function autoRange(values, pad = 0.05) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) {
    const c = isFinite(lo) ? lo : 0;
    return [c - 0.5, c + 0.5];
  }
  const span = hi - lo;
  return [lo - span * pad, hi + span * pad];
}

// Prefix-sum-based moving average — O(n) regardless of radius, so we
// can crank the window up for wider canvases without slowing down.
function movingAverage(arr, radius) {
  const n = arr.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + arr[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n, i + radius + 1);
    out[i] = (prefix[hi] - prefix[lo]) / (hi - lo);
  }
  return out;
}

// Draws the actual line: faint midline reference, filled area under
// the curve, then the line itself on top. Uses the canonical accent
// color so it reads as a sibling of the other forgemoment visuals
// without competing with the velocity heatmap's red-blue gradient.
function paintPitchTrace(ctx, w, h, values, vMin, vMax) {
  const padTop = 6;
  const padBot = 6;
  const usable = h - padTop - padBot;
  const range = Math.max(1e-6, vMax - vMin);

  const yAt = (v) => {
    const t = Math.min(1, Math.max(0, (v - vMin) / range));
    return padTop + (1 - t) * usable; // high value = top
  };

  // Midline reference (50% / centroid of range).
  const yMid = yAt((vMin + vMax) / 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, yMid);
  ctx.lineTo(w, yMid);
  ctx.stroke();

  // Filled area under the curve.
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, yAt(values[0]));
  for (let x = 1; x < w; x++) ctx.lineTo(x, yAt(values[x]));
  ctx.lineTo(w - 1, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(86, 184, 224, 0.12)';
  ctx.fill();

  // The line itself.
  ctx.beginPath();
  ctx.moveTo(0, yAt(values[0]));
  for (let x = 1; x < w; x++) ctx.lineTo(x, yAt(values[x]));
  ctx.strokeStyle = 'rgba(86, 184, 224, 0.95)';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// ─── Panel: beat strength bars ────────────────────────────────────
// Vertical bars (one per detected beat) with downbeats accented. The
// headline visualization — communicates rhythm at a glance. Chapter
// ribbon strip underneath maps each beat to its chapter.
export function BeatStrengthBars({
  status = 'loading', beats, downbeats, chapters,
  durationMs, focusedIdx, onFocus, error, onRetry,
}) {
  return (
    <PanelShell eyebrow="Beat strength · per-beat envelope">
      {status === 'error'   ? <ErrorCard height={140} message={error} onRetry={onRetry} /> :
       status === 'empty'   ? <EmptyCard height={140} message="No beats detected yet." icon="activity" /> :
       status === 'loading' ? <Skeleton height={140} label="Detecting beats…" /> :
                              <Skeleton height={140} label="Beat renderer pending" />}
    </PanelShell>
  );
}

// ─── Panel: energy heatmap ────────────────────────────────────────
// Per-chapter energy stripe — hot reds for energetic chapters, cool
// blues for calm. Click-to-focus. Chapter-discrete, contrast to the
// continuous pitch line above.
export function EnergyHeatRibbon({
  status = 'loading', chapters, energy, durationMs,
  focusedIdx, onFocus, error, onRetry,
}) {
  return (
    <PanelShell eyebrow="Energy heat ribbon" right={<span style={{ fontSize: 11, color: 'var(--text-dim)' }}>per chapter</span>}>
      {status === 'error'   ? <ErrorCard height={42} message={error} onRetry={onRetry} /> :
       status === 'empty'   ? <EmptyCard height={42} message="No energy data yet." icon="zap" /> :
       status === 'loading' ? <Skeleton height={42} label="Computing per-chapter energy…" /> :
                              <Skeleton height={42} label="Energy renderer pending" />}
    </PanelShell>
  );
}

// ─── Panel: KPI strip ─────────────────────────────────────────────
// Five-cell stat strip. Each cell may have its own status — chapters
// count can be ready while phrases count is still loading. v1 just
// renders the cells; mixed-status handling comes when real data wires.
export function KpiStrip({ kpis = [], status = 'loading' }) {
  const slots = Array.from({ length: 5 }, (_, i) => kpis[i] || { _placeholder: true });
  return (
    <PanelShell eyebrow="Pre-generation stats">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {slots.map((k, i) => (
          <KpiCell key={i} kpi={k} status={status} />
        ))}
      </div>
    </PanelShell>
  );
}

function KpiCell({ kpi, status }) {
  const isPlaceholder = !!kpi._placeholder || status === 'loading';
  return (
    <div style={{
      padding: 12, borderRadius: 8,
      background: 'var(--surface)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 4,
      minHeight: 76,
      opacity: isPlaceholder ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name={kpi.icon ?? 'circle'} size={12} style={{ color: 'var(--text-dim)' }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {kpi.label ?? '—'}
        </span>
      </div>
      <div style={{
        fontSize: 18, fontWeight: 700, color: 'var(--text)',
        letterSpacing: '-0.01em',
        fontFamily: 'var(--font-mono)',
      }}>
        {isPlaceholder ? '—' : (kpi.value ?? '—')}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
        {isPlaceholder ? 'loading' : (kpi.subtitle ?? '')}
      </div>
    </div>
  );
}

// ─── Panel: category drill-down ───────────────────────────────────
// Five-tab panel below the headline visualizations. Active tab paints
// its own deeper view. v1 ships the tab strip + empty canvases; per-
// category renderers land alongside the analyze hookup.
export const ANALYSIS_CATEGORIES = [
  { id: 'structure', label: 'Structure', icon: 'layers',
    headline: 'Chapters and phrases',
    desc:     'How the track breaks into natural sections, and the modes inside each.' },
  { id: 'beats',     label: 'Beats',     icon: 'activity',
    headline: 'Beat grid stability',
    desc:     'PLP-detected beats with downbeat markers.' },
  { id: 'phrases',   label: 'Phrases',   icon: 'list',
    headline: 'Phrase modes',
    desc:     'Each phrase classified by mode — tease / steady / edging / break.' },
  { id: 'energy',    label: 'Energy',    icon: 'zap',
    headline: 'Per-chapter energy',
    desc:     'Mean + peak energy per chapter, normalised within each chapter.' },
  // New category 2026-05-24 — distinct from the energy/heatmap pair.
  // Pitch is continuous-shape statistics: distribution, drift, range.
  { id: 'pitch',     label: 'Pitch',     icon: 'trending-up',
    headline: 'Pitch baseline + drift',
    desc:     'Where the script\'s baseline lives and how it drifts over the run.' },
];

export function CategoryPanel({
  activeCategoryId = 'structure', onChange, status = 'loading',
  data, error, onRetry,
}) {
  const cat = ANALYSIS_CATEGORIES.find((c) => c.id === activeCategoryId) ?? ANALYSIS_CATEGORIES[0];
  return (
    <div style={{ marginBottom: 18 }}>
      <CategoryTabs activeId={cat.id} onChange={onChange} />
      <div style={{
        padding: 16, borderRadius: '0 8px 8px 8px',
        background: 'var(--surface)', border: '1px solid var(--accent)',
        borderTop: '1px solid var(--accent)',
        marginTop: -1,
        minHeight: 200,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>{cat.headline}</h2>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{cat.desc}</span>
        </div>
        {status === 'error'   ? <ErrorCard height={120} message={error} onRetry={onRetry} /> :
         status === 'empty'   ? <EmptyCard height={120} message={`No ${cat.label.toLowerCase()} data yet.`} icon={cat.icon} /> :
         status === 'loading' ? <Skeleton height={120} label={`Loading ${cat.label.toLowerCase()}…`} /> :
                                <Skeleton height={120} label={`${cat.label} renderer pending`} />}
      </div>
    </div>
  );
}

function CategoryTabs({ activeId, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 0 }}>
      {ANALYSIS_CATEGORIES.map((c) => {
        const isActive = c.id === activeId;
        return (
          <button
            key={c.id}
            onClick={() => onChange?.(c.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 14px',
              borderRadius: '8px 8px 0 0',
              border: '1px solid',
              borderColor: isActive ? 'var(--accent)' : 'var(--border)',
              borderBottom: isActive ? '1px solid transparent' : '1px solid var(--border)',
              background: isActive ? 'var(--surface)' : 'var(--surface-2)',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 600,
              marginBottom: -1,
              position: 'relative', zIndex: isActive ? 1 : 0,
            }}
          >
            <Icon name={c.icon} size={12} />
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Misc ─────────────────────────────────────────────────────────

function SourceBadge({ kind }) {
  const label = kind === 'funscript' ? 'from funscript' :
                kind === 'audio'     ? 'from audio'     :
                kind === 'motion'    ? 'from video'     :
                                       String(kind);
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      padding: '2px 8px', borderRadius: 999,
      background: 'var(--surface-2)', color: 'var(--text-dim)',
      border: '1px solid var(--border)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {label}
    </span>
  );
}
