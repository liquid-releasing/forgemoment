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

// ─── Panel: tempo map (local BPM curve) ───────────────────────────
// Local BPM over time, computed from `beatsMs`. Distinct from the
// global BPM number in the KPI strip — drums getting faster going
// into a drop, slower in breakdowns. Collapsing the whole rhythmic
// dimension to one number hides those swings; this panel surfaces
// them so a script can be evaluated against the music's pulse.
//
// Algorithm:
//   ioi[i] = beats[i+1] - beats[i]                    (inter-onset)
//   localBpm[i] = 60_000 / mean(ioi over ±K/2 around i)
// K = 12 is the smoothing window. Smaller = more responsive but
// noisier; larger = smoother but lags real tempo changes.
//
// Visual: accent-color curve over a faint horizontal reference at
// the global BPM. Same band/axis vocabulary as PitchLine — reads as
// a sibling row, not a competing chart.
export function TempoMap({
  status = 'loading', beats, globalBpm, durationMs, error, onRetry,
}) {
  const beatList = Array.isArray(beats) ? beats : (beats?.beatsMs ?? null);
  return (
    <PanelShell
      eyebrow="Tempo map"
      right={<SourceBadge kind="audio" />}
    >
      {status === 'error'   ? <ErrorCard height={64} message={error} onRetry={onRetry} /> :
       status === 'empty'   ? <EmptyCard height={64} message="No beat data — analyze media first." icon="activity" /> :
       status === 'loading' ? <Skeleton height={64} label="Computing local BPM…" /> :
       (beatList?.length ?? 0) >= 3
         ? <TempoMapCanvas beats={beatList} globalBpm={globalBpm}
                            durationMs={durationMs} height={64} />
         : <EmptyCard height={64} message="Need at least 3 beats to chart tempo." icon="activity" />}
    </PanelShell>
  );
}

function TempoMapCanvas({ beats, globalBpm, durationMs, height = 64 }) {
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
    paintTempoCurve(ctx, w, h, beats, globalBpm, durationMs);
  }, [width, height, beats, globalBpm, durationMs]);

  return (
    <div ref={wrapRef} style={{
      width: '100%', borderRadius: 8, overflow: 'hidden',
      background: 'var(--bg)', border: '1px solid var(--border)',
    }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// Compute local BPM per beat, then resample onto the pixel axis and
// paint. Total ≈ max(lastBeat, durationMs) so the curve ends at the
// right edge whether the project carries a duration or not.
function paintTempoCurve(ctx, w, h, beats, globalBpm, durationMs) {
  const n = beats.length;
  if (n < 3) { paintEmptyTrack(ctx, w, h); return; }

  // Local BPM per beat. K is window radius in IOIs on each side.
  const K = 6;
  const local = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - K);
    const hi = Math.min(n - 1, i + K);
    let sumIoi = 0; let count = 0;
    for (let j = lo; j < hi; j++) {
      const ioi = beats[j + 1] - beats[j];
      if (ioi > 0) { sumIoi += ioi; count++; }
    }
    local[i] = count > 0 ? 60_000 / (sumIoi / count) : 0;
  }

  const total = Math.max(beats[n - 1], durationMs ?? 0) || beats[n - 1];

  // Resample to per-pixel curve. For each x, find the surrounding
  // beats and linearly interpolate their local BPM. Beats are sparse
  // relative to pixels; linear interp keeps the curve smooth.
  const values = new Float32Array(w);
  let bi = 0;
  for (let x = 0; x < w; x++) {
    const t = (x / Math.max(1, w - 1)) * total;
    while (bi < n - 1 && beats[bi + 1] < t) bi++;
    if (bi >= n - 1) { values[x] = local[n - 1]; continue; }
    if (t <= beats[bi]) { values[x] = local[bi]; continue; }
    const span = beats[bi + 1] - beats[bi];
    const frac = span > 0 ? (t - beats[bi]) / span : 0;
    values[x] = local[bi] + (local[bi + 1] - local[bi]) * frac;
  }

  // Range: pad observed [lo, hi] symmetrically by 8% to give the
  // line breathing room. If the user has globalBpm, ensure it falls
  // inside the range so the reference line is always visible.
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (local[i] > 0 && local[i] < lo) lo = local[i];
    if (local[i] > hi) hi = local[i];
  }
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) {
    const c = isFinite(lo) && lo > 0 ? lo : (globalBpm ?? 120);
    lo = c - 5; hi = c + 5;
  }
  if (globalBpm != null && isFinite(globalBpm)) {
    lo = Math.min(lo, globalBpm);
    hi = Math.max(hi, globalBpm);
  }
  const span = Math.max(2, hi - lo);
  const vMin = lo - span * 0.08;
  const vMax = hi + span * 0.08;

  const padTop = 6;
  const padBot = 6;
  const usable = h - padTop - padBot;
  const range = Math.max(1e-6, vMax - vMin);
  const yAt = (v) => padTop + (1 - (v - vMin) / range) * usable;

  // Global BPM reference line (faint, behind the curve).
  if (globalBpm != null && isFinite(globalBpm)) {
    const yRef = yAt(globalBpm);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, yRef);
    ctx.lineTo(w, yRef);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Filled area under the curve (same accent family as PitchLine).
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
// headline rhythm visualization. Per-beat height comes from the audio
// peaks envelope sampled at each beat's ms position when `peaks` is
// provided — that maps "the data we have" (beat times + amplitude
// envelope) onto the eyebrow's "per-beat envelope" promise. Without
// peaks, every beat renders at a uniform mid-height so the grid still
// communicates rhythm.
//
// Focused chapter (if `chapters` + `focusedIdx`) paints a subtle band
// behind the bars in that chapter's time range — visual context for
// "these beats belong to the chapter you're drilling into below."
export function BeatStrengthBars({
  status = 'loading', beats, downbeats, chapters, peaks, peaksHopMs,
  durationMs, focusedIdx, onFocus, error, onRetry,
}) {
  const beatList = Array.isArray(beats) ? beats : (beats?.beatsMs ?? null);
  const downbeatList = Array.isArray(downbeats) ? downbeats : (downbeats?.downbeatsMs ?? null);
  return (
    <PanelShell
      eyebrow="Beat strength · per-beat envelope"
      right={beatList?.length ? (
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {beatList.length} beats
          {downbeatList?.length ? ` · ${downbeatList.length} downbeats` : ''}
        </span>
      ) : null}
    >
      {status === 'error'   ? <ErrorCard height={140} message={error} onRetry={onRetry} /> :
       status === 'empty'   ? <EmptyCard height={140} message="No beats detected yet." icon="activity" /> :
       status === 'loading' ? <Skeleton height={140} label="Detecting beats…" /> :
       beatList?.length      ? <BeatStrengthCanvas
                                  beats={beatList}
                                  downbeats={downbeatList}
                                  chapters={chapters}
                                  peaks={peaks}
                                  peaksHopMs={peaksHopMs}
                                  durationMs={durationMs}
                                  focusedIdx={focusedIdx}
                                  onFocus={onFocus}
                                  height={140}
                                /> :
                              <EmptyCard height={140} message="No beats in this track." icon="activity" />}
    </PanelShell>
  );
}

// Beat-strength painter. Layout (top → bottom inside `height`):
//   • optional focused-chapter background band, full height, very low alpha
//   • bars: each beat = thin vertical bar; height = envelope amplitude at
//     the beat's ms (peaks-derived), normalised to the 95th percentile so
//     a single loud transient doesn't compress the rest
//   • baseline: 1px line at the bottom, faint white
//
// Bars vs envelope curve: we deliberately render discrete bars (not a
// continuous envelope curve) because the question this panel answers is
// "how does each beat hit?", not "what does the amplitude look like
// overall?". The Pitch Line row above already shows the continuous
// shape. This row's job is the beat grid.
function BeatStrengthCanvas({
  beats, downbeats, chapters, peaks, peaksHopMs,
  durationMs, focusedIdx, onFocus, height = 140,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Click-to-focus — pick the chapter under the click's x. Mirrors the
  // ChapterStripPanel UX so the two surfaces feel like the same control.
  const handleClick = (e) => {
    if (!onFocus || !chapters?.length || !durationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = (x / rect.width) * durationMs;
    const i = chapters.findIndex((c) => t >= (c.atMs ?? 0) && t < (c.endMs ?? durationMs));
    if (i >= 0) onFocus(i);
  };

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

    // Total time — prefer explicit durationMs; fall back to last beat
    // so the panel still renders if the project's duration hasn't been
    // hydrated yet.
    const lastBeat = beats[beats.length - 1] ?? 0;
    const total = Math.max(1, durationMs ?? lastBeat);

    paintFocusedChapterBand(ctx, w, h, chapters, focusedIdx, total);

    // Per-beat strength. With peaks: sample envelope at beat ms with a
    // tiny smoothing window (±1 hop) so a beat that lands between two
    // hops doesn't quantise to a single noisy sample. Without peaks:
    // uniform 0.75 — visible, but not loud enough to claim it's data
    // (full height would imply "we measured this").
    const strengths = new Float32Array(beats.length);
    if (peaks?.length && peaksHopMs) {
      const tmp = new Float32Array(beats.length);
      for (let i = 0; i < beats.length; i++) {
        tmp[i] = envelopeAtMs(peaks, peaksHopMs, beats[i]);
      }
      // Normalise to 95th percentile (same idea as the velocity heatmap).
      const sorted = Array.from(tmp).sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      const ref = Math.max(0.02, p95);
      for (let i = 0; i < beats.length; i++) {
        strengths[i] = Math.min(1, tmp[i] / ref);
      }
    } else {
      strengths.fill(0.75);
    }

    // Downbeat lookup — O(1) per beat. Downbeats are a subset of beats,
    // typically every 4th. We mark by ms equality with a small tolerance
    // since both arrays come from the same librosa run; exact match works.
    const downbeatSet = new Set(downbeats || []);

    paintBeatBars(ctx, w, h, beats, downbeatSet, strengths, total);
  }, [width, height, beats, downbeats, chapters, peaks, peaksHopMs,
      durationMs, focusedIdx]);

  return (
    <div
      ref={wrapRef}
      onClick={handleClick}
      style={{
        width: '100%', borderRadius: 8, overflow: 'hidden',
        background: 'var(--bg)', border: '1px solid var(--border)',
        cursor: onFocus && chapters?.length ? 'pointer' : 'default',
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

// Sample peaks envelope at an absolute ms position with a small smoothing
// window (±1 hop). Clamped to [0,1]; returns 0 outside the peaks range.
function envelopeAtMs(peaks, hopMs, ms) {
  const center = Math.floor(ms / hopMs);
  if (center < 0 || center >= peaks.length) return 0;
  const lo = Math.max(0, center - 1);
  const hi = Math.min(peaks.length - 1, center + 1);
  let s = 0;
  let n = 0;
  for (let i = lo; i <= hi; i++) {
    s += Math.max(0, Math.min(1, peaks[i]));
    n++;
  }
  return n > 0 ? s / n : 0;
}

function paintFocusedChapterBand(ctx, w, h, chapters, focusedIdx, total) {
  if (!chapters?.length || focusedIdx == null || focusedIdx < 0) return;
  const c = chapters[focusedIdx];
  if (!c) return;
  const x0 = Math.max(0, Math.floor(((c.atMs ?? 0) / total) * w));
  const x1 = Math.min(w, Math.ceil(((c.endMs ?? total) / total) * w));
  const color = c.color || 'var(--accent-2)';
  ctx.fillStyle = `color-mix(in srgb, ${color} 14%, transparent)`;
  ctx.fillRect(x0, 0, x1 - x0, h);
}

function paintBeatBars(ctx, w, h, beats, downbeatSet, strengths, total) {
  const padTop = 10;
  const padBot = 12;
  const baseline = h - padBot;
  const usable = baseline - padTop;

  // Baseline.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, baseline + 0.5);
  ctx.lineTo(w, baseline + 0.5);
  ctx.stroke();

  // Beats. Min bar height = 8% of usable so quiet beats are still visible.
  const beatColor = 'rgba(255, 255, 255, 0.42)';
  const downbeatColor = 'rgba(86, 184, 224, 0.95)';
  for (let i = 0; i < beats.length; i++) {
    const t = beats[i] / total;
    if (t < 0 || t > 1) continue;
    const x = Math.floor(t * w);
    const strength = Math.max(0.08, strengths[i]);
    const barH = strength * usable;
    const isDownbeat = downbeatSet.has(beats[i]);
    ctx.fillStyle = isDownbeat ? downbeatColor : beatColor;
    const barW = isDownbeat ? 2 : 1;
    ctx.fillRect(x - Math.floor(barW / 2), baseline - barH, barW, barH);
  }
}

// ─── Panel: energy heatmap ────────────────────────────────────────
// Per-chapter energy stripe — hot reds for energetic chapters, cool
// blues for calm. Click-to-focus. Chapter-discrete, contrast to the
// continuous pitch line above.
//
// Two data-source modes:
//   1. `energy: number[]` — pre-computed, one value per chapter, in
//      whatever units the caller chose. We min-max normalise across
//      the array so the brightest chapter pegs red, quietest pegs blue.
//   2. `spectrogram: { cells, nMels, nFrames, hopMs }` — raw mel data.
//      We compute per-chapter mean cell intensity inline (cheap; for a
//      ~1hr file at hopMs=20, nMels=64 that's ~12M cells = ~30ms).
//
// Either mode produces the same colored ribbon. AnalysisTab currently
// hands us the spectrogram; ForgeGen may pre-compute and pass `energy`.
export function EnergyHeatRibbon({
  status = 'loading', chapters, energy, spectrogram, durationMs,
  focusedIdx, onFocus, error, onRetry,
}) {
  // Derive per-chapter energies. Prefer caller-provided `energy`;
  // otherwise compute from spectrogram. Returns null when neither is
  // available (renders as empty card).
  const perChapter = chapters?.length ? (
    Array.isArray(energy) && energy.length === chapters.length
      ? energy
      : spectrogram?.cells?.length && spectrogram.hopMs
        ? perChapterEnergyFromSpectrogram(chapters, spectrogram, durationMs)
        : null
  ) : null;

  return (
    <PanelShell eyebrow="Energy heat ribbon" right={<span style={{ fontSize: 11, color: 'var(--text-dim)' }}>per chapter</span>}>
      {status === 'error'   ? <ErrorCard height={42} message={error} onRetry={onRetry} /> :
       status === 'empty'   ? <EmptyCard height={42} message="No energy data yet." icon="zap" /> :
       status === 'loading' ? <Skeleton height={42} label="Computing per-chapter energy…" /> :
       perChapter            ? <EnergyHeatRibbonBody
                                  chapters={chapters}
                                  energies={perChapter}
                                  durationMs={durationMs}
                                  focusedIdx={focusedIdx}
                                  onFocus={onFocus}
                                /> :
                              <EmptyCard height={42} message="No chapters or spectrogram yet." icon="zap" />}
    </PanelShell>
  );
}

// Per-chapter mean spectrogram intensity. For each chapter we average
// every cell value across its time range and all mel bins. Single pass
// over cells, O(nFrames * nMels). The sum-then-divide approach trades
// peak intensity (which would highlight transients) for sustained
// energy — what "this whole chapter is energetic" actually means.
function perChapterEnergyFromSpectrogram(chapters, spectrogram, durationMs) {
  const { cells, nMels, hopMs, nFrames } = spectrogram;
  const frames = nFrames ?? Math.floor(cells.length / nMels);
  const out = new Array(chapters.length).fill(0);

  for (let ci = 0; ci < chapters.length; ci++) {
    const c = chapters[ci];
    const atMs = c.atMs ?? 0;
    const endMs = c.endMs ?? durationMs ?? (frames * hopMs);
    const f0 = Math.max(0, Math.floor(atMs / hopMs));
    const f1 = Math.min(frames, Math.ceil(endMs / hopMs));
    if (f1 <= f0) continue;

    let sum = 0;
    let count = 0;
    for (let f = f0; f < f1; f++) {
      const base = f * nMels;
      for (let b = 0; b < nMels; b++) {
        sum += cells[base + b];
        count++;
      }
    }
    // Mean in [0,255] → normalise to [0,1].
    out[ci] = count > 0 ? (sum / count) / 255 : 0;
  }

  return out;
}

function EnergyHeatRibbonBody({ chapters, energies, durationMs, focusedIdx, onFocus }) {
  // Min-max normalise across chapters so the colormap uses the full
  // gradient even when raw energies live in a narrow band. Without this
  // step a project where every chapter sat at ~0.4 mean intensity would
  // render as a uniform mid-green strip — true to the numbers but
  // useless for comparison. Min floor at 0.05 of span prevents a single
  // outlier (a silent intro chapter, say) from collapsing everything
  // else to the top of the gradient.
  const lo = Math.min(...energies);
  const hi = Math.max(...energies);
  const span = Math.max(0.05, hi - lo);

  return (
    <div style={{
      display: 'flex', height: 42, gap: 0, minWidth: 0,
      borderRadius: 8, overflow: 'hidden',
      background: 'var(--surface-2)', border: '1px solid var(--border)',
    }}>
      {chapters.map((c, i) => {
        const dur = (c.endMs ?? 0) - (c.atMs ?? 0);
        const flex = Math.max(0.0001, dur / (durationMs || 1));
        const focused = i === focusedIdx;
        const t = (energies[i] - lo) / span;
        const color = interpolateColorStops(VELOCITY_COLOR_STOPS, Math.min(1, Math.max(0, t)));
        const label = `${Math.round(energies[i] * 100)}`;
        return (
          <button
            key={c.id ?? i}
            onClick={() => onFocus?.(i)}
            title={`Chapter ${i + 1} · energy ${label}`}
            style={{
              flex, minWidth: 0,
              background: color,
              border: 'none',
              cursor: 'pointer', textAlign: 'center',
              padding: 0, color: '#fff',
              fontFamily: 'inherit',
              outline: focused ? '1px solid rgba(255,255,255,0.45)' : 'none',
              outlineOffset: -1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10.5, fontWeight: 700,
              letterSpacing: '0.04em',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              opacity: focusedIdx == null || focused ? 1 : 0.85,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
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

// `data` shape (all fields optional — each sub-renderer handles its
// own absence):
//   { chapters, phrases, trackBeats, trackPeaks, trackSpectrogram,
//     durationMs, focusedIdx, onFocus }
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
                                <CategoryBody categoryId={cat.id} categoryLabel={cat.label} data={data} />}
      </div>
    </div>
  );
}

// Dispatch to per-category renderer. Each renderer is responsible for
// its own empty state if it gets no data — the panel-level "ready"
// status only means "the upstream pipeline finished," not "this tab
// has data" (e.g. structure has chapters but phrases sidecar might
// be missing — Structure renders chapters with a "no phrases" hint).
function CategoryBody({ categoryId, categoryLabel, data }) {
  switch (categoryId) {
    case 'structure': return <StructureCategoryBody data={data} />;
    case 'phrases':   return <PhrasesCategoryBody data={data} />;
    case 'beats':     return <BeatsCategoryBody data={data} />;
    case 'energy':    return <EnergyCategoryBody data={data} />;
    case 'pitch':     return <PitchCategoryBody data={data} />;
    default: return <Skeleton height={120} label={`${categoryLabel} renderer pending`} />;
  }
}

// Phrase-mode palette — the 8 shape ids from assessment/shape_labeler.py.
// Loosely ordered by intensity (calm → driving), so multi-mode chapters
// read as a low→high gradient when the modes are listed in this order.
// Exported so other surfaces (PhrasesTab list, Patterns drilldown) can
// share the vocabulary.
export const PHRASE_MODE_COLORS = {
  steady:    '#6b7280',
  drift:     '#56b8e0',
  tide:      '#14b8a6',
  pulse:     '#84cc16',
  three_one: '#eab308',
  swell:     '#f97316',
  taper:     '#f472b6',
  burst:     '#ef4444',
};

function phraseModeColor(label) {
  return PHRASE_MODE_COLORS[label] || 'var(--text-dim)';
}

// ─── Structure category body ──────────────────────────────────────
// Chapter-by-chapter list. Each row shows the chapter's compound label
// (texture · voice), duration, and a small tally of the phrase modes
// inside it. Click a row to focus that chapter — sets focusedIdx, the
// same state the chapter strip + energy ribbon read from.
//
// Phrase modes come from assessment/shape_labeler.py: one of 8 shape
// ids. We tally them by chapter and render up to the top 3 as compact
// "MODE × n" chips — enough to communicate the chapter's character
// without overwhelming the row.
function StructureCategoryBody({ data }) {
  const chapters = data?.chapters ?? [];
  const phrases = data?.phrases ?? [];
  const focusedIdx = data?.focusedIdx;
  const onFocus = data?.onFocus;

  if (!chapters.length) {
    return <EmptyCard height={120} message="No chapters yet — analysis pending." icon="layers" />;
  }

  // Bucket phrases by chapter_id (preferred) or chapter_idx fallback.
  // chapter_id matches chapter.id; chapter_idx is positional. Old
  // sidecars wrote one, new sidecars write both — handle both so a
  // stale sidecar still renders.
  const byChapter = bucketPhrasesByChapter(phrases, chapters);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: 8,
    }}>
      {chapters.map((c, i) => {
        const focused = i === focusedIdx;
        const dur = (c.endMs ?? 0) - (c.atMs ?? 0);
        const category = formatChapterCategory(c);
        const chapterPhrases = byChapter[i] ?? [];
        const modeTally = tallyPhraseModes(chapterPhrases);
        return (
          <button
            key={c.id ?? i}
            onClick={() => onFocus?.(i)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: focused ? 'var(--accent)' : 'var(--border)',
              background: focused ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : 'var(--surface-2)',
              color: 'var(--text)',
              cursor: 'pointer', textAlign: 'left',
              fontFamily: 'inherit',
              minHeight: 96,
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              justifyContent: 'space-between',
            }}>
              <span style={{
                fontSize: 10.5, fontWeight: 700, color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.04em',
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {category && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                  padding: '2px 5px', borderRadius: 3,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-dim)',
                  whiteSpace: 'nowrap',
                }}>
                  {category}
                </span>
              )}
            </div>
            <div style={{
              fontSize: 13, fontWeight: 600,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {c.name || `Chapter ${i + 1}`}
            </div>
            <div style={{
              fontSize: 10.5, color: 'var(--text-muted)',
              display: 'flex', gap: 6, alignItems: 'center',
            }}>
              <span>{formatDuration(dur)}</span>
              <span style={{ color: 'var(--text-dim)' }}>·</span>
              <span>
                {chapterPhrases.length
                  ? `${chapterPhrases.length} phrase${chapterPhrases.length === 1 ? '' : 's'}`
                  : 'no phrases'}
              </span>
            </div>
            {modeTally.length > 0 && (
              <div style={{
                display: 'flex', gap: 3, flexWrap: 'wrap',
                marginTop: 'auto',
              }}>
                {modeTally.slice(0, 3).map((m) => (
                  <span
                    key={m.label}
                    title={`${m.label} × ${m.count}`}
                    style={{
                      fontSize: 9.5, fontWeight: 700,
                      padding: '2px 6px', borderRadius: 999,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.02em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.label.toUpperCase()}·{m.count}
                  </span>
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function bucketPhrasesByChapter(phrases, chapters) {
  const out = {};
  const idToIdx = new Map();
  chapters.forEach((c, i) => { if (c.id != null) idToIdx.set(c.id, i); });
  for (const p of phrases) {
    let idx = -1;
    if (p.chapter_id != null && idToIdx.has(p.chapter_id)) {
      idx = idToIdx.get(p.chapter_id);
    } else if (typeof p.chapter_idx === 'number') {
      idx = p.chapter_idx;
    } else {
      // Last resort: time-bin by midpoint into chapter ranges. Slow
      // for big phrase counts but correct without sidecar metadata.
      const mid = ((p.at_ms ?? 0) + (p.end_ms ?? 0)) / 2;
      idx = chapters.findIndex((c) => mid >= (c.atMs ?? 0) && mid < (c.endMs ?? Infinity));
    }
    if (idx < 0) continue;
    if (!out[idx]) out[idx] = [];
    out[idx].push(p);
  }
  return out;
}

function tallyPhraseModes(phrases) {
  const counts = {};
  for (const p of phrases) {
    const label = p.label || p.mode || 'unknown';
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0s';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

// ─── Phrases category body ────────────────────────────────────────
// Per-chapter phrase-mode breakdown laid out chronologically. Each
// card shows one chapter's mode distribution as a mini stacked bar.
// A whole-track strip at the top gives the aggregate view; cards
// below answer "and how does that distribution shift chapter to
// chapter?" — the editing question the tab exists to surface.
//
// Modes are listed in PHRASE_MODE_COLORS order (calm → driving) so
// the stacked bars read as a coherent gradient when modes cluster.
function PhrasesCategoryBody({ data }) {
  const phrases = data?.phrases ?? [];
  const chapters = data?.chapters ?? [];
  const focusedIdx = data?.focusedIdx;
  const onFocus = data?.onFocus;

  if (!phrases.length) {
    return <EmptyCard height={120} message="No phrases sidecar yet — run analysis first." icon="list" />;
  }

  const total = phrases.length;
  const allTally = tallyPhraseModes(phrases);
  const paletteOrder = Object.keys(PHRASE_MODE_COLORS);
  const orderModes = (tally) => [
    ...paletteOrder
      .map((label) => tally.find((t) => t.label === label))
      .filter(Boolean),
    ...tally.filter((t) => !paletteOrder.includes(t.label))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const orderedAll = orderModes(allTally);

  const durations = phrases
    .map((p) => (p.end_ms ?? 0) - (p.at_ms ?? 0))
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  const medianMs = durations.length ? durations[Math.floor(durations.length / 2)] : 0;

  const byChapter = chapters.length ? bucketPhrasesByChapter(phrases, chapters) : {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', fontSize: 12, color: 'var(--text-muted)' }}>
        <span><strong style={{ color: 'var(--text)' }}>{total}</strong> phrases</span>
        <span>median duration <strong style={{ color: 'var(--text)' }}>{formatDuration(medianMs)}</strong></span>
        <span>{orderedAll.length} mode{orderedAll.length === 1 ? '' : 's'}</span>
      </div>

      <div>
        <div style={{
          fontSize: 10.5, fontWeight: 700, color: 'var(--text-dim)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          marginBottom: 6,
        }}>
          Whole track · all phrases
        </div>
        <div style={{
          display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden',
          border: '1px solid var(--border)',
        }}>
          {orderedAll.map((m) => (
            <div
              key={m.label}
              title={`${m.label} · ${m.count} (${Math.round((m.count / total) * 100)}%)`}
              style={{ flex: m.count, background: phraseModeColor(m.label) }}
            />
          ))}
        </div>
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap',
          marginTop: 6, fontSize: 10.5, color: 'var(--text-muted)',
        }}>
          {orderedAll.map((m) => (
            <span key={m.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 8, height: 8, borderRadius: 2,
                background: phraseModeColor(m.label),
              }} />
              <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
                {m.label.toUpperCase()}
              </span>
              <span style={{ color: 'var(--text-dim)' }}>{m.count}</span>
            </span>
          ))}
        </div>
      </div>

      {chapters.length > 0 && (
        <div>
          <div style={{
            fontSize: 10.5, fontWeight: 700, color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 6,
          }}>
            Per chapter · chronological
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 8,
          }}>
            {chapters.map((c, i) => {
              const focused = i === focusedIdx;
              const chPhrases = byChapter[i] ?? [];
              const chOrdered = orderModes(tallyPhraseModes(chPhrases));
              const chTotal = chPhrases.length;
              return (
                <button
                  key={c.id ?? i}
                  onClick={() => onFocus?.(i)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 6,
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: focused ? 'var(--accent)' : 'var(--border)',
                    background: focused ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : 'var(--surface-2)',
                    color: 'var(--text)',
                    cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'inherit',
                    minHeight: 84,
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'baseline',
                    justifyContent: 'space-between', gap: 8,
                  }}>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, color: 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                    }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{
                      fontSize: 10.5, color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {chTotal} phrase{chTotal === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: 600,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {c.name || `Chapter ${i + 1}`}
                  </div>
                  {chTotal === 0 ? (
                    <div style={{
                      height: 12, borderRadius: 3,
                      border: '1px dashed var(--border)',
                      marginTop: 'auto',
                    }} />
                  ) : (
                    <div style={{
                      display: 'flex', height: 12, borderRadius: 3,
                      overflow: 'hidden', border: '1px solid var(--border)',
                      marginTop: 'auto',
                    }}>
                      {chOrdered.map((m) => (
                        <div
                          key={m.label}
                          title={`${m.label} · ${m.count}`}
                          style={{
                            flex: m.count,
                            background: phraseModeColor(m.label),
                          }}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Beats category body ──────────────────────────────────────────
// Beat-grid stability. The headline visualization (BeatStrengthBars)
// already shows *where* the beats are; this drilldown answers "how
// stable is the grid?" — useful for spotting tempo drift, missing
// beats, or a beat tracker that lost the pulse mid-track.
//
// Metrics:
//   • BPM (from sidecar) + computed BPM from median IOI as a sanity check
//   • Regularity = 1 − (IOI std-dev / median IOI), clamped 0-100%
//   • Downbeats per bar = mean spacing between consecutive downbeats,
//     divided by median beat IOI — usually 3, 4, or 6
function BeatsCategoryBody({ data }) {
  const trackBeats = data?.trackBeats;
  const beats = trackBeats?.beatsMs;
  const downbeats = trackBeats?.downbeatsMs;
  if (!beats?.length) {
    return <EmptyCard height={120} message="No beat sidecar yet — run analysis first." icon="activity" />;
  }

  const iois = [];
  for (let i = 1; i < beats.length; i++) iois.push(beats[i] - beats[i - 1]);
  const sortedIois = [...iois].sort((a, b) => a - b);
  const medianIoi = sortedIois[Math.floor(sortedIois.length / 2)] || 0;
  const meanIoi = iois.length ? iois.reduce((s, x) => s + x, 0) / iois.length : 0;
  const variance = iois.length
    ? iois.reduce((s, x) => s + (x - meanIoi) ** 2, 0) / iois.length
    : 0;
  const stdIoi = Math.sqrt(variance);
  const computedBpm = medianIoi > 0 ? Math.round((60_000 / medianIoi) * 10) / 10 : null;
  const regularity = medianIoi > 0
    ? Math.max(0, Math.min(100, Math.round((1 - stdIoi / medianIoi) * 100)))
    : 0;

  // Downbeat spacing — how many beats per bar?
  let beatsPerBar = null;
  if (downbeats?.length >= 2 && medianIoi > 0) {
    const dbGaps = [];
    for (let i = 1; i < downbeats.length; i++) dbGaps.push(downbeats[i] - downbeats[i - 1]);
    const medDb = [...dbGaps].sort((a, b) => a - b)[Math.floor(dbGaps.length / 2)];
    beatsPerBar = Math.round(medDb / medianIoi);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
      }}>
        <StatTile label="BPM (sidecar)" value={trackBeats.bpm != null
            ? `${Math.round(trackBeats.bpm * 10) / 10}` : '—'} />
        <StatTile label="BPM (from IOI)" value={computedBpm != null ? `${computedBpm}` : '—'} />
        <StatTile label="Regularity" value={`${regularity}%`}
                  subtitle={`σ ${Math.round(stdIoi)}ms`} />
        <StatTile label="Beats / bar" value={beatsPerBar != null ? `${beatsPerBar}` : '—'}
                  subtitle={downbeats?.length ? `${downbeats.length} downbeats` : 'no downbeats'} />
      </div>

      <IoiHistogram iois={iois} medianIoi={medianIoi} stdIoi={stdIoi} />
    </div>
  );
}

// Compact stat tile reused across the beats / energy / pitch tabs.
// Visually quieter than the top-level KpiCell so the drilldown tabs
// don't compete with the KPI strip above.
function StatTile({ label, value, subtitle }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 6,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>{label}</div>
      <div style={{
        fontSize: 17, fontWeight: 700, color: 'var(--text)',
        fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em',
      }}>{value}</div>
      {subtitle && (
        <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{subtitle}</div>
      )}
    </div>
  );
}

// Inter-onset-interval histogram. A perfectly regular grid renders as
// a single tall bar at the median; tempo drift smears it; a tracker
// that drops every other beat shows two peaks (1× and 2× the median).
function IoiHistogram({ iois, medianIoi, stdIoi }) {
  if (!iois.length) return null;
  // 20 buckets centred on the median, spanning ±3σ (or ±25% if σ is tiny).
  const spread = Math.max(stdIoi * 3, medianIoi * 0.25, 1);
  const lo = Math.max(0, medianIoi - spread);
  const hi = medianIoi + spread;
  const nBuckets = 20;
  const buckets = new Uint32Array(nBuckets);
  for (const ioi of iois) {
    const t = (ioi - lo) / (hi - lo);
    if (t < 0 || t > 1) continue;
    const i = Math.min(nBuckets - 1, Math.floor(t * nBuckets));
    buckets[i]++;
  }
  const peak = Math.max(1, ...buckets);

  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        marginBottom: 6,
      }}>
        IOI distribution · {Math.round(lo)}–{Math.round(hi)}ms
      </div>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 2,
        height: 64, padding: '6px 8px',
        borderRadius: 6,
        background: 'var(--bg)', border: '1px solid var(--border)',
      }}>
        {Array.from(buckets).map((count, i) => {
          // Mark the median bucket — gives the eye an anchor point.
          const midBucket = Math.floor(((medianIoi - lo) / (hi - lo)) * nBuckets);
          const isMid = i === midBucket;
          return (
            <div
              key={i}
              title={`${count} IOI${count === 1 ? '' : 's'}`}
              style={{
                flex: 1,
                height: `${(count / peak) * 100}%`,
                background: isMid
                  ? 'rgba(86, 184, 224, 0.95)'
                  : 'rgba(255, 255, 255, 0.28)',
                borderRadius: 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Energy category body ─────────────────────────────────────────
// Per-chapter mean intensity laid out as a wrapping grid of cards.
// Default order is chronological (matches Structure / Phrases), and
// a small toggle re-orders by energy descending to answer "which
// chapter is loudest?" — both views are useful, neither is the
// single canonical reading.
function EnergyCategoryBody({ data }) {
  const chapters = data?.chapters ?? [];
  const spectrogram = data?.trackSpectrogram;
  const durationMs = data?.durationMs;
  const focusedIdx = data?.focusedIdx;
  const onFocus = data?.onFocus;
  const [sortMode, setSortMode] = useState('chronological');

  if (!chapters.length) {
    return <EmptyCard height={120} message="No chapters yet." icon="zap" />;
  }
  if (!spectrogram?.cells?.length || !spectrogram.hopMs) {
    return <EmptyCard height={120} message="No spectrogram yet — run analysis first." icon="zap" />;
  }

  const energies = perChapterEnergyFromSpectrogram(chapters, spectrogram, durationMs);
  const rows = energies.map((e, i) => ({ idx: i, energy: e, chapter: chapters[i] }));
  const ordered = sortMode === 'energy'
    ? [...rows].sort((a, b) => b.energy - a.energy)
    : rows;

  const lo = Math.min(...energies);
  const hi = Math.max(...energies);
  const span = Math.max(0.05, hi - lo);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SortToggle
        value={sortMode}
        onChange={setSortMode}
        options={[
          { id: 'chronological', label: 'First → last' },
          { id: 'energy',        label: 'By energy' },
        ]}
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 8,
      }}>
        {ordered.map((row, rank) => {
          const t = (row.energy - lo) / span;
          const tClamped = Math.min(1, Math.max(0, t));
          const color = interpolateColorStops(VELOCITY_COLOR_STOPS, tClamped);
          const dur = (row.chapter.endMs ?? 0) - (row.chapter.atMs ?? 0);
          const focused = row.idx === focusedIdx;
          const isTop = sortMode === 'energy' && rank === 0;
          return (
            <button
              key={row.chapter.id ?? row.idx}
              onClick={() => onFocus?.(row.idx)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: focused ? 'var(--accent)' : 'var(--border)',
                background: focused
                  ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))'
                  : isTop
                    ? 'color-mix(in srgb, var(--accent) 6%, var(--surface-2))'
                    : 'var(--surface-2)',
                color: 'var(--text)',
                cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit',
                minHeight: 88,
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'baseline',
                justifyContent: 'space-between', gap: 8,
              }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, color: 'var(--text-dim)',
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                }}>
                  {String(row.idx + 1).padStart(2, '0')}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {Math.round(row.energy * 100)}
                </span>
              </div>
              <div style={{
                fontSize: 12, fontWeight: 600,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {row.chapter.name || `Chapter ${row.idx + 1}`}
              </div>
              <div style={{
                height: 10, borderRadius: 2, overflow: 'hidden',
                background: 'var(--bg)', border: '1px solid var(--border)',
                marginTop: 'auto',
              }}>
                <div style={{
                  width: `${Math.max(2, tClamped * 100)}%`,
                  height: '100%', background: color,
                }} />
              </div>
              <div style={{
                fontSize: 10.5, color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}>
                {formatDuration(dur)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Small segmented control used by the Energy sub-tab (and reusable
// elsewhere). Active option gets the accent border; inactive options
// stay quiet. Sized to sit comfortably under the sub-tab headline.
function SortToggle({ value, onChange, options }) {
  return (
    <div style={{
      display: 'inline-flex', alignSelf: 'flex-start',
      borderRadius: 6, overflow: 'hidden',
      border: '1px solid var(--border)',
      background: 'var(--surface-2)',
    }}>
      {options.map((o, i) => {
        const active = o.id === value;
        const isLast = i === options.length - 1;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              padding: '5px 10px',
              fontSize: 11, fontWeight: 700,
              letterSpacing: '0.04em',
              border: 'none',
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              cursor: active ? 'default' : 'pointer',
              fontFamily: 'inherit',
              borderRight: isLast ? 'none' : '1px solid var(--border)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Pitch category body ──────────────────────────────────────────
// Distribution + drift for the chosen pitch source.
//
// Funscript mode: histogram of `pos` values (0..100) — where does the
//   script *sit*? Plus a simple linear-regression slope over time
//   ("rising / falling / stable") computed against action timestamps.
// Audio mode: mel-bin distribution from the spectrogram (collapsed
//   across time) — "is this track bass-heavy or vocal-heavy?". Drift
//   here = trend in spectral centroid across the run.
function PitchCategoryBody({ data }) {
  const actions = data?.actions ?? null;
  const spectrogram = data?.trackSpectrogram;

  // Prefer the more informative source: spectrogram > funscript.
  // (Pitch is principally an audio question; funscript is the fallback
  // when no media is loaded.) This matches PitchLine's preference order.
  if (spectrogram?.cells?.length && spectrogram.nMels) {
    return <PitchAudioBody spectrogram={spectrogram} />;
  }
  if (actions?.length) {
    return <PitchFunscriptBody actions={actions} />;
  }
  return <EmptyCard height={120} message="No pitch source — load a funscript or analyze media." icon="trending-up" />;
}

function PitchFunscriptBody({ actions }) {
  const positions = actions.map((a) => a.pos).filter((p) => typeof p === 'number');
  if (!positions.length) {
    return <EmptyCard height={120} message="No position data in funscript." icon="trending-up" />;
  }

  const sorted = [...positions].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p10 = sorted[Math.floor(sorted.length * 0.10)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];

  // 20-bucket histogram across 0..100. Same bucket count as the IOI
  // histogram so the two surfaces visually rhyme.
  const nBuckets = 20;
  const buckets = new Uint32Array(nBuckets);
  for (const p of positions) {
    const i = Math.min(nBuckets - 1, Math.floor((p / 100) * nBuckets));
    buckets[i]++;
  }
  const peak = Math.max(1, ...buckets);

  // Drift = linear regression slope of pos vs at, normalised to
  // pos-points per minute. Positive = rising baseline, negative =
  // falling. Threshold ±2 pts/min before calling drift "drifting" —
  // tighter than that is noise.
  const drift = linearSlope(actions);
  const driftLabel = Math.abs(drift) < 2 ? 'stable'
                    : drift > 0 ? `rising · +${drift.toFixed(1)} pts/min`
                                : `falling · ${drift.toFixed(1)} pts/min`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <StatTile label="Median pos" value={`${median}`} subtitle="0–100 scale" />
        <StatTile label="10th pct" value={`${p10}`} subtitle="lowest 10%" />
        <StatTile label="90th pct" value={`${p90}`} subtitle="highest 10%" />
        <StatTile label="Drift" value={driftLabel} />
      </div>

      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          marginBottom: 6,
        }}>
          Position distribution · 0 (down) → 100 (up)
        </div>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 2,
          height: 64, padding: '6px 8px',
          borderRadius: 6,
          background: 'var(--bg)', border: '1px solid var(--border)',
        }}>
          {Array.from(buckets).map((count, i) => {
            const t = i / (nBuckets - 1);
            const color = interpolateColorStops(VELOCITY_COLOR_STOPS, t);
            return (
              <div
                key={i}
                title={`${i * 5}–${(i + 1) * 5}: ${count} actions`}
                style={{
                  flex: 1,
                  height: `${(count / peak) * 100}%`,
                  background: color,
                  opacity: 0.85,
                  borderRadius: 1,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PitchAudioBody({ spectrogram }) {
  const { cells, nMels, nFrames, hopMs } = spectrogram;
  const frames = nFrames ?? Math.floor(cells.length / nMels);

  // Mel-bin distribution: sum intensity per bin across all frames.
  const binTotals = new Float64Array(nMels);
  for (let f = 0; f < frames; f++) {
    const base = f * nMels;
    for (let b = 0; b < nMels; b++) {
      binTotals[b] += cells[base + b];
    }
  }
  const peak = Math.max(1, ...binTotals);

  // Centroid per frame, then linear-regression slope across time for
  // "is the track getting brighter or darker over its run?"
  const centroids = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const base = f * nMels;
    let num = 0; let den = 0;
    for (let b = 0; b < nMels; b++) {
      const m = cells[base + b];
      num += b * m;
      den += m;
    }
    centroids[f] = den > 1e-9 ? num / den : 0;
  }
  const sortedC = Array.from(centroids).sort((a, b) => a - b);
  const medC = sortedC[Math.floor(sortedC.length / 2)] || 0;

  // Slope = mel-bins per minute. nMels typically 64, so ~0.5 bins/min
  // is a perceptible drift across a 10-min track.
  const slopeBinsPerFrame = linearSlopeArray(centroids);
  const slopeBinsPerMin = slopeBinsPerFrame * (60_000 / hopMs);
  const driftLabel = Math.abs(slopeBinsPerMin) < 0.5 ? 'stable'
                    : slopeBinsPerMin > 0 ? `brightening · +${slopeBinsPerMin.toFixed(2)} bins/min`
                                          : `darkening · ${slopeBinsPerMin.toFixed(2)} bins/min`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <StatTile label="Median centroid" value={`${medC.toFixed(1)}`}
                  subtitle={`bin · 0–${nMels - 1}`} />
        <StatTile label="Drift" value={driftLabel} />
        <StatTile label="Frames" value={`${frames}`}
                  subtitle={`hop ${hopMs}ms`} />
      </div>

      <div>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 6,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Spectral profile · where the music's energy sits
          </div>
          <div style={{
            fontSize: 10.5, color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            bass <span style={{ opacity: 0.5 }}>← {nMels} bands →</span> treble
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 1,
          height: 64, padding: '6px 8px',
          borderRadius: 6,
          background: 'var(--bg)', border: '1px solid var(--border)',
        }}>
          {Array.from(binTotals).map((v, b) => {
            // Color by VALUE so height and color tell the same story:
            // loud bands burn hot, quiet bands fade cool. Previously
            // colored by bin INDEX (a decorative bass→treble gradient)
            // which fought the height encoding — user-confusing per
            // 2026-05-25 dogfood ("bass on left with 0 as the highest
            // blue value? confused.").
            const t = v / peak;
            const color = interpolateColorStops(VELOCITY_COLOR_STOPS, t);
            return (
              <div
                key={b}
                title={`bin ${b}: ${v.toFixed(0)}`}
                style={{
                  flex: 1,
                  height: `${Math.max(2, t * 100)}%`,
                  background: color,
                  opacity: 0.9,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Linear regression slope of pos vs at across actions. Returns
// pos-points per minute. Closed-form OLS so it's O(n) and exact.
function linearSlope(actions) {
  const n = actions.length;
  if (n < 2) return 0;
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (const a of actions) {
    const x = a.at;
    const y = a.pos;
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return 0;
  const slopePerMs = (n * sxy - sx * sy) / denom;
  return slopePerMs * 60_000; // per-ms → per-minute
}

// OLS slope for an unindexed numeric array (x = index). Used for the
// spectral-centroid drift over frames.
function linearSlopeArray(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += arr[i]; sxx += i * i; sxy += i * arr[i];
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return 0;
  return (n * sxy - sx * sy) / denom;
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
