// The Viewer's intensity arc — one 0..1 curve over the whole timeline.
//
// It answers "where is this output hot, and where does it sag" at a glance,
// above the per-channel lanes. Two sources, in order of preference:
//
//  1. The `volume` channel, when the device has one. That channel is an
//     AUTHORED arc — someone decided the shape — so it beats anything
//     derived. Read it straight, as a percentage.
//  2. Otherwise a velocity envelope of the densest channel. Densest, not
//     first: a sparse channel (a slow `frequency` sweep, say) would draw a
//     flat line and claim the whole output is dead.
//
// Pure. No React, no platform.

import { posAt } from './stats.js';

/**
 * @param channels    [{ name, actions:[{at,pos}] }]
 * @param durationMs  full timeline length
 * @param bins        resolution of the returned curve
 * @returns [{ at, v }] with v in 0..1, or [] when there is nothing to draw
 */
export function computeIntensity(channels, durationMs, bins = 320) {
  if (!channels?.length || durationMs <= 0) return [];
  const vol = channels.find((c) => c.name === 'volume' || c.name === 'volume-prostate');
  const step = durationMs / bins;

  if (vol && vol.actions.length > 1) {
    return Array.from({ length: bins + 1 }, (_, i) => {
      const at = i * step;
      return { at, v: Math.max(0, Math.min(1, posAt(vol.actions, at) / 100)) };
    });
  }

  const ch = channels.reduce(
    (a, b) => (b.actions.length > a.actions.length ? b : a), channels[0]);
  const a = ch.actions;
  const binMax = new Array(bins + 1).fill(0);
  let gmax = 0;
  for (let i = 1; i < a.length; i += 1) {
    const dt = Math.max(1, a[i].at - a[i - 1].at);
    const v = Math.abs(a[i].pos - a[i - 1].pos) / dt;
    const bi = Math.min(bins, Math.floor(a[i].at / step));
    if (v > binMax[bi]) binMax[bi] = v;
    if (v > gmax) gmax = v;
  }
  // A channel that never moves would divide by zero and paint NaN across the
  // whole arc — which renders as nothing at all, indistinguishable from "no
  // data". Normalising against 1 draws it as the flat line it really is.
  if (gmax === 0) gmax = 1;
  return binMax.map((v, i) => ({ at: i * step, v: v / gmax }));
}
