import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// MediaViewer renders its <video> with `key={videoSrc}`, so changing the
// source DESTROYS the element and mounts a new one. Any effect that grabs
// `videoRef.current` and binds to it must therefore list `videoSrc` in its
// dependencies, or it keeps its listener on the dead element and the new one
// is inert.
//
// This actually happened: the timeupdate emitter — the effect that drives the
// playhead — was the one effect of five that omitted it. The FIRST clip you
// opened worked; every clip after it had a frozen playhead, so the baton
// didn't move, frame-step jumped to the start (it steps relative to
// currentMs), and "set in / set out" recorded 0 instead of where you'd parked.
// Play still worked, which made it look like a control bug rather than a
// clock bug.
//
// A behavioural test would need jsdom + a real mount, which this package
// doesn't carry. This is the same invariant react-hooks/exhaustive-deps
// enforces, checked against the source.

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, '..', 'src', 'MediaViewer.jsx'), 'utf8');

/** Every `useEffect` whose body reads `videoRef.current`, with its deps. */
function videoBoundEffects(source) {
  const lines = source.split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/const\s+v\s*=\s*videoRef\.current/.test(lines[i])) continue;
    for (let j = i; j < Math.min(i + 160, lines.length); j++) {
      const m = /^\s*\}, \[(.*)\]\);/.exec(lines[j]);
      if (m) {
        found.push({ line: i + 1, deps: m[1] });
        break;
      }
    }
  }
  return found;
}

describe('MediaViewer effects bound to the <video> element', () => {
  const effects = videoBoundEffects(SOURCE);

  it('finds the video-bound effects at all (guards the parser itself)', () => {
    expect(effects.length).toBeGreaterThanOrEqual(4);
  });

  it('renders the <video> keyed by videoSrc — the reason this rule exists', () => {
    expect(SOURCE).toMatch(/key=\{videoSrc\}/);
  });

  it.each(effects.map((e) => [e.line, e.deps]))(
    'effect at line %i lists videoSrc in its deps',
    (_line, deps) => {
      expect(deps).toMatch(/\bvideoSrc\b/);
    },
  );
});
