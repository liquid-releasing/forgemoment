// CaptureBar — mark a begin / end span from the playhead.
//
// Carved out of FunscriptForge's Events tab so any consumer (FFP, demoforge,
// …) can drop in the same "grab the current playhead as begin/end, derive the
// duration, commit the span" interaction. The component is vocabulary-free:
// it knows nothing about events, cues, or chapters — it just captures a
// [beginMs, endMs] span and hands it back via callbacks.
//
// Neutral (grey) palette — no accent fills. Begin/End grab the current
// playhead position (optionally snapped to beat); DURATION is derived; Chain /
// Snap are sticky toggles the consumer owns. All visual tokens come from the
// consumer's tokens.css (var(--surface), var(--border), …).
//
// Props
//   beginMs, endMs        captured marks (ms) or null
//   chain, snap           sticky-toggle states (consumer-owned)
//   canSnap               whether Snap is available (e.g. beats present)
//   scopeStart, scopeEnd  clamp typed/nudged times to [start, end] (optional)
//   onCaptureBegin()      mark the current playhead as begin
//   onCaptureEnd()        mark the current playhead as end
//   onBeginChange(ms)     a typed/nudged begin value (clamped)
//   onEndChange(ms)       a typed/nudged end value (clamped)
//   onToggleChain()       flip the Chain toggle
//   onToggleSnap()        flip the Snap toggle
//   onReset()             clear both marks
//   step                  badge number (default 1); pass null to hide it
//   title                 heading text (default 'Mark begin / end from playhead')

import { useEffect, useRef, useState } from 'react';
import { Icon } from './primitives.jsx';

// fmtClock returns mm:ss.mmm (millisecond precision) for time readouts.
export function fmtClock(ms) {
  if (ms == null || Number.isNaN(ms)) return '––:––.–––';
  const total = Math.max(0, Math.round(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const f = total % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(3, '0')}`;
}

// parseClock parses a typed time → ms. Accepts h:mm:ss.mmm, mm:ss.mmm,
// m:ss.mmm, ss.mmm, or a plain seconds value. Returns null on anything
// unparseable.
export function parseClock(str) {
  const s = String(str).trim();
  if (!s || !/^[\d:.]+$/.test(s)) return null;
  const parts = s.split(':');
  if (parts.length > 3) return null;
  const sec = parseFloat(parts[parts.length - 1]);
  if (Number.isNaN(sec)) return null;
  let ms = sec * 1000;
  if (parts.length >= 2) {
    const mins = parseInt(parts[parts.length - 2], 10);
    if (Number.isNaN(mins)) return null;
    ms += mins * 60000;
  }
  if (parts.length === 3) {
    const hrs = parseInt(parts[0], 10);
    if (Number.isNaN(hrs)) return null;
    ms += hrs * 3600000;
  }
  return Math.round(ms);
}

// Shared step badge — red fill, dark glyph, 22px.
const STEP_RED = '#ff5a5f';
function StepBadge({ n }) {
  return (
    <span style={{
      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: STEP_RED, color: '#0d0d0d', fontSize: 12, fontWeight: 800,
    }}>{n}</span>
  );
}

function TargetDot({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="7" cy="7" r="1.6" fill="currentColor" />
    </svg>
  );
}

function GreyCheck({ checked, disabled, label, onToggle }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      title={disabled ? `${label} — needs beats` : label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        background: 'transparent', border: 'none', padding: 0,
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text-dim)' : 'var(--text-soft)',
        fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: checked ? 'var(--text-muted)' : 'transparent',
        border: `1px solid ${checked ? 'var(--text-muted)' : 'var(--border)'}`,
        color: 'var(--bg)', fontSize: 11, fontWeight: 800, lineHeight: 1,
      }}>
        {checked ? '✓' : ''}
      </span>
      {label}
    </button>
  );
}

function CaptureButton({ label, set, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} from playhead`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '7px 13px', borderRadius: 7,
        background: set ? 'var(--surface-2)' : 'var(--bg)',
        border: `1px solid ${set ? 'var(--text-dim)' : 'var(--border)'}`,
        color: set ? 'var(--text)' : 'var(--text-soft)',
        fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
      }}
    >
      <TargetDot />
      Capture
    </button>
  );
}

// Editable time field. Click to type mm:ss.mmm (Enter/blur commits + clamps
// to [min,max]; Esc reverts; ↑/↓ nudge ±100ms, Shift ±1s). Read-only display
// otherwise. onCommit gets a clamped, rounded ms.
function ClockField({ ms, onCommit, min, max }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const set = ms != null;

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);

  const clamp = (v) => {
    let x = v;
    if (min != null) x = Math.max(min, x);
    if (max != null) x = Math.min(max, x);
    return Math.round(x);
  };
  const commit = () => {
    const parsed = parseClock(draft);
    if (parsed != null) onCommit?.(clamp(parsed));
    setEditing(false);
  };
  const nudge = (delta) => {
    const v = clamp((set ? ms : (min ?? 0)) + delta);
    onCommit?.(v);
    setDraft(fmtClock(v));
  };

  const box = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '7px 12px', borderRadius: 7, minWidth: 96, width: 96,
    background: 'var(--bg)', border: '1px solid var(--border)',
    fontSize: 14, fontWeight: 600, letterSpacing: '0.02em',
    fontFamily: 'var(--font-mono)',
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(e.shiftKey ? 1000 : 100); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(e.shiftKey ? -1000 : -100); }
        }}
        style={{ ...box, color: 'var(--text)', outline: 'none', textAlign: 'center', boxShadow: '0 0 0 1px var(--text-dim) inset' }}
      />
    );
  }
  return (
    <span
      role="button" tabIndex={0}
      title="Click to type a time (mm:ss.mmm) · ↑/↓ nudge, Shift ±1s"
      onClick={() => { setDraft(set ? fmtClock(ms) : ''); setEditing(true); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDraft(set ? fmtClock(ms) : ''); setEditing(true); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(e.shiftKey ? 1000 : 100); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(e.shiftKey ? -1000 : -100); }
      }}
      style={{ ...box, color: set ? 'var(--text)' : 'var(--text-dim)', cursor: 'text' }}
    >
      {fmtClock(ms)}
    </span>
  );
}

export function CaptureBar({
  beginMs, endMs, chain, snap, canSnap, scopeStart, scopeEnd,
  onCaptureBegin, onCaptureEnd, onBeginChange, onEndChange,
  onToggleChain, onToggleSnap, onReset,
  step = 1, title = 'Mark begin / end from playhead',
}) {
  const dur = (beginMs != null && endMs != null) ? Math.abs(endMs - beginMs) : null;

  return (
    <div style={{
      marginTop: 12, padding: '14px 16px',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10,
    }}>
      {/* Row 1 — mark begin / end */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {step != null && <StepBadge n={step} />}
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'var(--text-muted)',
        }}>
          {title}
        </span>

        <span style={{ width: 8 }} />

        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Begin</span>
        <CaptureButton label="Begin" set={beginMs != null} onClick={onCaptureBegin} />
        <ClockField ms={beginMs} onCommit={onBeginChange} min={scopeStart} max={scopeEnd} />

        <Icon name="arrow-right" size={14} style={{ color: 'var(--text-dim)' }} />

        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>End</span>
        <CaptureButton label="End" set={endMs != null} onClick={onCaptureEnd} />
        <ClockField ms={endMs} onCommit={onEndChange} min={scopeStart} max={scopeEnd} />
      </div>

      {/* Row 2 — derived duration · toggles · reset */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginTop: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: 'var(--text-dim)',
          }}>
            Duration · derived
          </div>
          <div className="mono" style={{
            fontSize: 18, fontWeight: 600, marginTop: 1,
            color: dur != null ? 'var(--text)' : 'var(--text-dim)',
          }}>
            {dur != null ? fmtClock(dur) : '––:––.–––'}
          </div>
        </div>

        <span style={{ flex: 1 }} />

        <GreyCheck checked={chain} label="Chain" onToggle={onToggleChain} />
        <GreyCheck checked={snap && canSnap} disabled={!canSnap} label="Snap to beat" onToggle={onToggleSnap} />

        <button
          type="button"
          onClick={onReset}
          disabled={beginMs == null && endMs == null}
          title="Clear marks"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '6px 11px', borderRadius: 7,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-soft)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
            opacity: (beginMs == null && endMs == null) ? 0.5 : 1,
          }}
        >
          <Icon name="rotate-ccw" size={12} /> Reset
        </button>
      </div>
    </div>
  );
}
