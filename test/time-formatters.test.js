// A time formatter must never render NaN.
//
// FunscriptForge's TopBar reads `file.durationMs` through `fmtTimeShort`, but
// both of App.jsx's loading placeholders carry a preformatted `duration: '—'`
// and no `durationMs` at all. The author's intent was right and the wiring was
// wrong: TopBar never looks at `duration`, so for the whole of every project
// load the header read the literal string "NaN:NaN" — on every tab, because
// the placeholder outlives the tab you happen to be on (dogfood 2026-09-23).
//
// Neither of the two idioms already in this file sanitises:
//
//   Math.max(0, ms)     — Math.max returns NaN if ANY argument is NaN
//   ms ?? 0             — `??` catches null/undefined but NOT NaN
//
// Number.isFinite is the one check that rejects NaN, ±Infinity, undefined,
// null and non-numbers together, which is why it guards both formatters now.

import { describe, expect, it } from 'vitest';

import { fmtDurationMs, fmtTimeShort, UNKNOWN_TIME } from '../src/primitives.jsx';

const NOT_A_TIME = [undefined, null, NaN, Infinity, -Infinity, 'abc', {}, []];

describe('fmtTimeShort', () => {
  it('never renders NaN, whatever it is handed', () => {
    for (const bad of NOT_A_TIME) {
      expect(fmtTimeShort(bad), `input ${String(bad)}`).not.toMatch(/NaN/);
    }
  });

  it('shows the unknown placeholder rather than a wrong number', () => {
    // THE regression. A length we do not have yet has to read as "not yet";
    // rendering 0:00 instead would be a lie the user cannot tell from a real
    // zero-length project.
    expect(fmtTimeShort(undefined)).toBe(UNKNOWN_TIME);
    expect(fmtTimeShort(NaN)).toBe(UNKNOWN_TIME);
  });

  it('still formats real durations', () => {
    expect(fmtTimeShort(0)).toBe('0:00');
    expect(fmtTimeShort(312_000)).toBe('5:12');
    expect(fmtTimeShort(3_600_000)).toBe('60:00');
  });

  it('clamps a negative time instead of rejecting it', () => {
    // Negative is a finite number — a seek that ran past the start, say — so
    // it clamps, unlike the not-a-number cases above.
    expect(fmtTimeShort(-5_000)).toBe('0:00');
  });
});

describe('fmtDurationMs', () => {
  it('never renders NaN, whatever it is handed', () => {
    for (const bad of NOT_A_TIME) {
      expect(fmtDurationMs(bad), `input ${String(bad)}`).not.toMatch(/NaN/);
    }
  });

  it('shows the unknown placeholder for a length it does not have', () => {
    expect(fmtDurationMs(NaN)).toBe(UNKNOWN_TIME);
    expect(fmtDurationMs(undefined)).toBe(UNKNOWN_TIME);
  });

  it('keeps the sub-minute decimal and the m:ss fallback', () => {
    expect(fmtDurationMs(18_000)).toBe('18.0s');
    expect(fmtDurationMs(4_300)).toBe('4.3s');
    expect(fmtDurationMs(90_000)).toBe('1:30');
  });

  it('the placeholder is an em dash, not an empty string', () => {
    // An empty span collapses and the row jumps height when the real value
    // lands; a dash holds the line.
    expect(UNKNOWN_TIME).toBe('—');
  });
});
