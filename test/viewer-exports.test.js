import { describe, it, expect } from 'vitest';
import * as fm from '../src/index.js';

// The Viewer was carved out of FunscriptForge so ForgeAssembler and
// ForgePlayer could mount the same surface. Three consumers now import these
// names through the barrel, and a barrel that re-exports a name the module
// does not have fails at RUNTIME, in whichever app loads it first — not here,
// and not in a build. Importing the barrel for real is the cheapest way to
// make a rename fail in this package instead.
describe('viewer barrel', () => {
  it('exports the panel and its pieces', () => {
    for (const name of ['ViewerPanel', 'ChannelStack', 'StatRow']) {
      expect(typeof fm[name], name).toBe('function');
    }
  });

  it('exports the pure helpers a host may want on its own', () => {
    for (const name of ['computeIntensity', 'resolveMonitorFunscript',
                        'analyzeChannels', 'livelinessInWindow', 'posAt',
                        'computeStats', 'livelinessScore', 'quantile', 'mean']) {
      expect(typeof fm[name], name).toBe('function');
    }
  });
});
