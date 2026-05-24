// scan.test.js — covers the directory-walk / project-build behavior of
// library/scan.js without touching the real filesystem.

import { describe, it, expect } from 'vitest';
import { scanRoot } from '../../src/library/scan.js';
import { InMemoryFs } from '../_helpers/InMemoryFs.js';

const ROOT = { path: '/lib', label: 'Test', addedAt: '2026-05-24T00:00:00Z' };

describe('scanRoot — empty cases', () => {
  it('returns empty projects for an empty directory', async () => {
    const fs = new InMemoryFs({}, ['/lib']);
    const result = await scanRoot(ROOT, fs);
    expect(result.projects).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.root).toBe(ROOT);
  });

  it('records an error if the root does not exist', async () => {
    const fs = new InMemoryFs({});
    const result = await scanRoot(ROOT, fs);
    expect(result.projects).toEqual([]);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/readdir \/lib/);
  });

  it('ignores non-media files', async () => {
    const fs = new InMemoryFs({
      '/lib/notes.txt': '',
      '/lib/readme.md': '',
      '/lib/cover.jpg': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects).toEqual([]);
  });
});

describe('scanRoot — single project', () => {
  it('builds one project for a lone video', async () => {
    const fs = new InMemoryFs({ '/lib/Euphoria2.mp4': '' });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    const p = result.projects[0];
    expect(p.mediaPath).toBe('/lib/Euphoria2.mp4');
    expect(p.kind).toBe('video');
    expect(p.stem).toBe('Euphoria2');
    expect(p.forgeDir).toBe('/lib/.Euphoria2.forge');
    expect(p.companions).toEqual([]);
    expect(p.pills.video).toBe(true);
    expect(p.pills.audio).toBe(false);
    expect(p.pills.funscript).toBe(false);
    expect(p.pills.forged).toBe(false);
    expect(p.status).toBe('raw');
    expect(p.tags).toEqual([]);
  });

  it('builds one project for a lone audio file', async () => {
    const fs = new InMemoryFs({ '/lib/track1.mp3': '' });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    const p = result.projects[0];
    expect(p.kind).toBe('audio');
    expect(p.pills.audio).toBe(true);
    expect(p.pills.video).toBe(false);
  });
});

describe('scanRoot — companion grouping (same stem in same directory)', () => {
  it('groups video + same-stem audio into one project with audio as companion', async () => {
    const fs = new InMemoryFs({
      '/lib/Euphoria2.mp4': '',
      '/lib/Euphoria2.wav': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    const p = result.projects[0];
    expect(p.kind).toBe('video');
    expect(p.mediaPath).toBe('/lib/Euphoria2.mp4');
    expect(p.companions).toEqual(['/lib/Euphoria2.wav']);
    expect(p.pills.audio).toBe(true);
  });

  it('handles multiple audio companions to one video', async () => {
    const fs = new InMemoryFs({
      '/lib/movie.mp4': '',
      '/lib/movie.wav': '',
      '/lib/movie.mp3': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    expect(result.projects[0].kind).toBe('video');
    expect(result.projects[0].companions.sort()).toEqual([
      '/lib/movie.mp3',
      '/lib/movie.wav',
    ]);
  });

  it('picks highest-fidelity audio as primary when no video exists', async () => {
    // wav > flac > m4a > mp3 > ogg
    const fs = new InMemoryFs({
      '/lib/track.mp3': '',
      '/lib/track.wav': '',
      '/lib/track.flac': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    expect(result.projects[0].mediaPath).toBe('/lib/track.wav');
    expect(result.projects[0].companions.sort()).toEqual([
      '/lib/track.flac',
      '/lib/track.mp3',
    ]);
  });

  it('does NOT group same-stem media across different directories', async () => {
    const fs = new InMemoryFs({
      '/lib/a/Track1.mp4': '',
      '/lib/b/Track1.wav': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(2);
    const paths = result.projects.map((p) => p.mediaPath).sort();
    expect(paths).toEqual(['/lib/a/Track1.mp4', '/lib/b/Track1.wav']);
    for (const p of result.projects) {
      expect(p.companions).toEqual([]);
    }
  });
});

describe('scanRoot — pills', () => {
  it('funscript pill = true when <stem>.funscript exists next to media', async () => {
    const fs = new InMemoryFs({
      '/lib/Euphoria2.mp4': '',
      '/lib/Euphoria2.funscript': '{}',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects[0].pills.funscript).toBe(true);
  });

  it('audio pill = true when peaks sidecar exists in forge dir', async () => {
    const fs = new InMemoryFs({
      '/lib/Euphoria2.mp4': '',
      '/lib/.Euphoria2.forge/Euphoria2.audio.json': '{}',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects[0].pills.audio).toBe(true);
  });

  it('forged pill = true when feel.yml exists in forge dir', async () => {
    const fs = new InMemoryFs({
      '/lib/Euphoria2.mp4': '',
      '/lib/.Euphoria2.forge/feel.yml': 'chapters: []',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects[0].pills.forged).toBe(true);
  });

  it('all pills false when only the media file exists', async () => {
    const fs = new InMemoryFs({ '/lib/Euphoria2.mp4': '' });
    const result = await scanRoot(ROOT, fs);
    const p = result.projects[0];
    expect(p.pills).toEqual({
      video: true,
      audio: false,
      funscript: false,
      forged: false,
    });
  });
});

describe('scanRoot — status', () => {
  it('status = raw when no forge dir', async () => {
    const fs = new InMemoryFs({ '/lib/m.mp4': '' });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects[0].status).toBe('raw');
  });

  it('status = active when forge dir exists and no completed marker', async () => {
    const fs = new InMemoryFs({
      '/lib/m.mp4': '',
      '/lib/.m.forge/m.audio.json': '{}',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects[0].status).toBe('active');
  });

  it('status = completed when .completed marker exists', async () => {
    const fs = new InMemoryFs({
      '/lib/m.mp4': '',
      '/lib/.m.forge/.completed': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects[0].status).toBe('completed');
  });
});

describe('scanRoot — traversal rules', () => {
  it('recurses into subdirectories', async () => {
    const fs = new InMemoryFs({
      '/lib/a.mp4': '',
      '/lib/sub/b.mp4': '',
      '/lib/sub/deep/c.mp4': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(3);
    const paths = result.projects.map((p) => p.mediaPath).sort();
    expect(paths).toEqual([
      '/lib/a.mp4', '/lib/sub/b.mp4', '/lib/sub/deep/c.mp4',
    ]);
  });

  it('skips .<stem>.forge/ directories (does not treat their contents as projects)', async () => {
    const fs = new InMemoryFs({
      '/lib/Euphoria2.mp4': '',
      // A media-looking file inside the forge dir — must NOT be picked
      // up as a project. Forge dirs are sidecar storage.
      '/lib/.Euphoria2.forge/something.mp4': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    expect(result.projects[0].mediaPath).toBe('/lib/Euphoria2.mp4');
  });

  it('skips other hidden directories (.git, .cache, etc.)', async () => {
    const fs = new InMemoryFs({
      '/lib/a.mp4': '',
      '/lib/.git/HEAD': 'ref: refs/heads/main',
      '/lib/.cache/something.mp4': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    expect(result.projects[0].mediaPath).toBe('/lib/a.mp4');
  });
});

describe('scanRoot — metadata + cached thumb', () => {
  it('reads chapter count from <stem>.chapters.json sidecar', async () => {
    const fs = new InMemoryFs({
      '/lib/m.mp4': '',
      '/lib/.m.forge/m.chapters.json': JSON.stringify({
        chapters: [{ id: 'ch1' }, { id: 'ch2' }, { id: 'ch3' }],
      }),
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects[0].metadata.chapters).toBe(3);
  });

  it('reads bpm + beat count from beats sidecar', async () => {
    const fs = new InMemoryFs({
      '/lib/m.mp4': '',
      '/lib/.m.forge/m.beats.json': JSON.stringify({
        bpm: 92.7, times: new Array(120).fill(0),
      }),
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects[0].metadata.bpm).toBe(93);  // rounded
    expect(result.projects[0].metadata.beats).toBe(120);
  });

  it('leaves metadata fields null when sidecar absent or malformed', async () => {
    const fs = new InMemoryFs({
      '/lib/m.mp4': '',
      '/lib/.m.forge/m.beats.json': 'not valid json',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects[0].metadata.bpm).toBe(null);
    expect(result.projects[0].metadata.beats).toBe(null);
  });

  it('picks up cached thumbnail when forge dir holds thumb.jpg', async () => {
    const fs = new InMemoryFs({
      '/lib/m.mp4': '',
      '/lib/.m.forge/thumb.jpg': 'binary-ish',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects[0].thumbPath).toBe('/lib/.m.forge/thumb.jpg');
  });

  it('thumbPath is null when no cached thumb', async () => {
    const fs = new InMemoryFs({ '/lib/m.mp4': '' });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects[0].thumbPath).toBe(null);
  });
});

describe('scanRoot — ancestor-stem matching (companion promotion)', () => {
  it('promotes a same-stem audio in a subdir to a companion of the ancestor video', async () => {
    // The stim-output case: /lib/Euphoria2.mp4 + /lib/stim/Euphoria2.mp3.
    // The subdir mp3 must NOT become its own project; it attaches to the
    // ancestor.
    const fs = new InMemoryFs({
      '/lib/Euphoria2.mp4': '',
      '/lib/stim/Euphoria2.mp3': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    const p = result.projects[0];
    expect(p.mediaPath).toBe('/lib/Euphoria2.mp4');
    expect(p.companions).toContain('/lib/stim/Euphoria2.mp3');
    // Audio pill flips on because we now have an audio companion.
    expect(p.pills.audio).toBe(true);
  });

  it('promotes multiple deeper companions to one ancestor', async () => {
    const fs = new InMemoryFs({
      '/lib/Source.mp4': '',
      '/lib/stim/Source.mp3': '',
      '/lib/renders/Source.wav': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    expect(result.projects[0].companions.sort()).toEqual([
      '/lib/renders/Source.wav',
      '/lib/stim/Source.mp3',
    ]);
  });

  it('does not promote across sibling subdirs (only ancestor stems claim)', async () => {
    // /lib/a/Track.mp4 and /lib/b/Track.mp4 are siblings — they are two
    // separate projects, NOT one with the other as companion.
    const fs = new InMemoryFs({
      '/lib/a/Track.mp4': '',
      '/lib/b/Track.mp4': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(2);
    for (const p of result.projects) {
      expect(p.companions).toEqual([]);
    }
  });

  it('a stem at the root claims same-stem media at any depth below', async () => {
    const fs = new InMemoryFs({
      '/lib/movie.mp4': '',
      '/lib/sub/movie.mp3': '',
      '/lib/sub/deep/movie.wav': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    expect(result.projects[0].companions.sort()).toEqual([
      '/lib/sub/deep/movie.wav',
      '/lib/sub/movie.mp3',
    ]);
  });

  it('a stem first seen in a subdir does not retro-claim sibling subdirs', async () => {
    // /lib/a/foo.mp4 is its own project. /lib/b/foo.mp4 is also its own
    // project (sibling — ancestor map at /lib was empty when /lib/b
    // was entered). Neither is a companion of the other.
    const fs = new InMemoryFs({
      '/lib/a/foo.mp4': '',
      '/lib/b/foo.mp4': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(2);
  });

  it('promotes Edger-style stim audio (stem + dot + suffix) in a subdir', async () => {
    // The real user case: stim outputs are named `<source>.stereostim.mp3`,
    // `<source>.prostate.stereostim.mp3` etc. — stems differ from the
    // source video stem by a dot-suffix.
    const fs = new InMemoryFs({
      '/lib/liquidreleasing/liquidreleasing.mp4': '',
      '/lib/liquidreleasing/estim/liquidreleasing.stereostim.mp3': '',
      '/lib/liquidreleasing/estim/liquidreleasing.prostate.stereostim.mp3': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    expect(result.projects[0].mediaPath).toBe('/lib/liquidreleasing/liquidreleasing.mp4');
    expect(result.projects[0].companions.sort()).toEqual([
      '/lib/liquidreleasing/estim/liquidreleasing.prostate.stereostim.mp3',
      '/lib/liquidreleasing/estim/liquidreleasing.stereostim.mp3',
    ]);
    expect(result.projects[0].pills.audio).toBe(true);
  });

  it('dot-prefix derivative in the SAME directory promotes too', async () => {
    const fs = new InMemoryFs({
      '/lib/track.mp4': '',
      '/lib/track.alpha.mp3': '',
      '/lib/track.beta.mp3': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    expect(result.projects[0].kind).toBe('video');
    expect(result.projects[0].companions.sort()).toEqual([
      '/lib/track.alpha.mp3',
      '/lib/track.beta.mp3',
    ]);
  });

  it('prefix match requires a dot boundary (no liquidreleasing claiming liquidreleasingexit derivatives)', async () => {
    const fs = new InMemoryFs({
      '/lib/liquidreleasing.mp4': '',
      '/lib/estim/liquidreleasingexit.stereostim.mp3': '',
    });
    const result = await scanRoot(ROOT, fs);
    // Two separate projects — the audio's stem isn't a dot-prefix of the video's.
    expect(result.projects.length).toBe(2);
    expect(result.projects.find((p) => p.kind === 'video').companions).toEqual([]);
  });

  it('longest dot-prefix wins when multiple ancestors could match', async () => {
    const fs = new InMemoryFs({
      '/lib/liquid.mp4': '',
      '/lib/liquid.bar.mp4': '',
      '/lib/sub/liquid.bar.baz.mp3': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(2);
    const bar = result.projects.find((p) => p.stem === 'liquid.bar');
    expect(bar.companions).toEqual(['/lib/sub/liquid.bar.baz.mp3']);
    const liquid = result.projects.find((p) => p.stem === 'liquid');
    expect(liquid.companions).toEqual([]);
  });

  it('does NOT promote same-kind same-stem video in subdir (user-organized duplicate)', async () => {
    // Two Prisoner.mp4 in different folders — both are valid separate
    // projects; the deeper video is NOT a derivative of the upper.
    const fs = new InMemoryFs({
      '/lib/Prisoner.mp4': '',
      '/lib/archive/Prisoner.mp4': '',
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(2);
  });

  it('adjacent companion (same dir) still works alongside ancestor promotion', async () => {
    // Make sure the existing same-dir companion rule and the new
    // ancestor-stem rule cooperate cleanly.
    const fs = new InMemoryFs({
      '/lib/track.mp4': '',
      '/lib/track.wav': '',          // adjacent companion
      '/lib/sub/track.mp3': '',      // promoted from subdir
    });
    const result = await scanRoot(ROOT, fs);
    expect(result.projects.length).toBe(1);
    expect(result.projects[0].mediaPath).toBe('/lib/track.mp4');
    expect(result.projects[0].companions.sort()).toEqual([
      '/lib/sub/track.mp3',
      '/lib/track.wav',
    ]);
  });
});

describe('scanRoot — output stability', () => {
  it('returns scannedAt as a number (ms epoch)', async () => {
    const fs = new InMemoryFs({}, ['/lib']);
    const before = Date.now();
    const result = await scanRoot(ROOT, fs);
    const after = Date.now();
    expect(result.scannedAt).toBeGreaterThanOrEqual(before);
    expect(result.scannedAt).toBeLessThanOrEqual(after);
  });

  it('preserves the original Root reference identity', async () => {
    const fs = new InMemoryFs({}, ['/lib']);
    const result = await scanRoot(ROOT, fs);
    expect(result.root).toBe(ROOT);
  });
});
