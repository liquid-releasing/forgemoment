// HoldSeekButton — press-and-hold rewind / fast-forward.
//
// Ported from forge-ui-design/iterations/08-redesign/design_files/HoldSeekButton.jsx
// with the same 2× → 4× → 8× → 16× ramp every 600ms while held. Release
// stops. Continuous seek: advances currentMs by (rate × elapsed) each
// requestAnimationFrame frame in `direction` (+1 forward, -1 reverse).
//
// Props:
//   direction (1 | -1)   default 1 (forward)
//   currentMs            current playhead position (controlled by parent)
//   totalMs              upper bound; seek clamps at totalMs
//   onSeek(ms)           fired with the new playhead position on each tick
//   size                 px (default 44)

import { useState, useRef, useEffect } from 'react';

export function HoldSeekButton({ direction = 1, currentMs, totalMs, onSeek, size = 44 }) {
  const [rate, setRate] = useState(0); // 0 means idle
  const stateRef = useRef({ raf: 0, lastT: 0, msAcc: currentMs, rampTimer: 0, rate: 0 });

  // Keep msAcc in sync with the controlled playhead so a fresh hold
  // starts from the right place. Without this, a parent seek between
  // holds would be ignored on the next press.
  useEffect(() => {
    stateRef.current.msAcc = currentMs;
  }, [currentMs]);

  const stop = () => {
    const s = stateRef.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    if (s.rampTimer) clearTimeout(s.rampTimer);
    s.raf = 0;
    s.rampTimer = 0;
    s.rate = 0;
    setRate(0);
  };

  const start = () => {
    const s = stateRef.current;
    if (s.rate) return; // already held — no-op
    s.lastT = performance.now();
    s.msAcc = currentMs;
    s.rate = 2;
    setRate(2);

    const tick = () => {
      const now = performance.now();
      const dt = now - s.lastT;
      s.lastT = now;
      s.msAcc = Math.max(0, Math.min(totalMs, s.msAcc + direction * s.rate * dt));
      onSeek?.(s.msAcc);
      if (s.rate) s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);

    const rampStep = (next) => {
      if (!s.rate) return;
      s.rate = next;
      setRate(next);
      if (next < 16) s.rampTimer = setTimeout(() => rampStep(next * 2), 600);
    };
    s.rampTimer = setTimeout(() => rampStep(4), 600);
  };

  // Clean up RAF + timers on unmount so a held button mid-press doesn't
  // leak a runaway loop.
  useEffect(() => () => stop(), []);

  const arrows = direction > 0 ? '▶▶' : '◀◀';
  const label = direction > 0 ? 'Fast forward' : 'Rewind';
  const active = rate > 0;

  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); start(); }}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={(e) => { e.preventDefault(); start(); }}
      onTouchEnd={stop}
      onTouchCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      title={`${label} · hold to accelerate (2× → 16×)`}
      style={{
        width: size, height: size, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2,
        background: active ? 'var(--accent-soft, #2b3340)' : 'var(--surface)',
        border: `1px solid ${active ? 'var(--accent, #4dabf7)' : 'var(--border)'}`,
        borderRadius: 6, color: 'var(--text)', cursor: 'pointer',
        fontFamily: 'inherit', userSelect: 'none',
        transition: 'background 80ms, border-color 80ms',
      }}
    >
      <span style={{ fontSize: 11, letterSpacing: '0.5px', lineHeight: 1 }}>{arrows}</span>
      <span className="mono" style={{
        fontSize: 9, fontWeight: 700,
        color: active ? 'var(--accent, #4dabf7)' : 'var(--text-dim)',
        lineHeight: 1, minHeight: 9,
      }}>
        {active ? `${rate}×` : ' '}
      </span>
    </button>
  );
}
