// config.test.js — covers the persisted-config helpers of library/config.js.

import { describe, it, expect } from 'vitest';
import {
  defaultConfig,
  loadConfig,
  saveConfig,
  addRoot,
  removeRoot,
  renameRoot,
} from '../../src/library/config.js';
import { InMemoryFs } from '../_helpers/InMemoryFs.js';

const CONFIG_PATH = '/cfg/library.json';

describe('defaultConfig', () => {
  it('returns version 1 and an empty roots array', () => {
    const c = defaultConfig();
    expect(c.version).toBe(1);
    expect(c.roots).toEqual([]);
  });
});

describe('loadConfig', () => {
  it('returns default config when file does not exist', async () => {
    const fs = new InMemoryFs({}, ['/cfg']);
    const c = await loadConfig(fs, CONFIG_PATH);
    expect(c).toEqual(defaultConfig());
  });

  it('returns default config when JSON is malformed', async () => {
    const fs = new InMemoryFs({ [CONFIG_PATH]: 'not valid json' });
    const c = await loadConfig(fs, CONFIG_PATH);
    expect(c).toEqual(defaultConfig());
  });

  it('parses a valid persisted config', async () => {
    const fs = new InMemoryFs({
      [CONFIG_PATH]: JSON.stringify({
        version: 1,
        roots: [
          { path: '/movies/forge', label: 'Forge projects', addedAt: '2026-05-24T00:00:00Z' },
        ],
      }),
    });
    const c = await loadConfig(fs, CONFIG_PATH);
    expect(c.version).toBe(1);
    expect(c.roots.length).toBe(1);
    expect(c.roots[0].path).toBe('/movies/forge');
    expect(c.roots[0].label).toBe('Forge projects');
  });

  it('drops malformed roots from a persisted config', async () => {
    const fs = new InMemoryFs({
      [CONFIG_PATH]: JSON.stringify({
        roots: [
          { path: '/good', label: 'Good', addedAt: '2026-05-24T00:00:00Z' },
          { label: 'missing path' },          // dropped — no path
          'not an object',                     // dropped
          { path: '', label: 'empty path' },   // dropped — empty path
        ],
      }),
    });
    const c = await loadConfig(fs, CONFIG_PATH);
    expect(c.roots.length).toBe(1);
    expect(c.roots[0].path).toBe('/good');
  });

  it('fills in missing label and addedAt with sensible defaults', async () => {
    const fs = new InMemoryFs({
      [CONFIG_PATH]: JSON.stringify({
        roots: [{ path: '/movies/forge' }],
      }),
    });
    const c = await loadConfig(fs, CONFIG_PATH);
    expect(c.roots[0].label).toBe('forge');   // basename of path
    expect(typeof c.roots[0].addedAt).toBe('string');
    expect(c.roots[0].addedAt.length).toBeGreaterThan(0);
  });
});

describe('saveConfig', () => {
  it('writes a normalized JSON representation', async () => {
    const fs = new InMemoryFs({}, ['/cfg']);
    const cfg = addRoot(defaultConfig(), '/movies/forge', { label: 'Forge' });
    await saveConfig(cfg, fs, CONFIG_PATH);
    const written = await fs.readJson(CONFIG_PATH);
    expect(written.version).toBe(1);
    expect(written.roots[0].path).toBe('/movies/forge');
    expect(written.roots[0].label).toBe('Forge');
  });

  it('round-trips through load', async () => {
    const fs = new InMemoryFs({}, ['/cfg']);
    let cfg = defaultConfig();
    cfg = addRoot(cfg, '/movies/forge');
    cfg = addRoot(cfg, '/music/tracks');
    await saveConfig(cfg, fs, CONFIG_PATH);
    const loaded = await loadConfig(fs, CONFIG_PATH);
    expect(loaded.roots.map((r) => r.path).sort()).toEqual([
      '/movies/forge', '/music/tracks',
    ]);
  });
});

describe('addRoot', () => {
  it('adds a new root', () => {
    const c = addRoot(defaultConfig(), '/movies/forge');
    expect(c.roots.length).toBe(1);
    expect(c.roots[0].path).toBe('/movies/forge');
  });

  it('derives label from the path basename when none supplied', () => {
    const c = addRoot(defaultConfig(), '/movies/forge');
    expect(c.roots[0].label).toBe('forge');
  });

  it('handles Windows-style paths for label derivation', () => {
    const c = addRoot(defaultConfig(), 'C:\\Users\\bruce\\Movies');
    expect(c.roots[0].label).toBe('Movies');
  });

  it('uses provided label when given', () => {
    const c = addRoot(defaultConfig(), '/movies/forge', { label: 'My Forge' });
    expect(c.roots[0].label).toBe('My Forge');
  });

  it('is idempotent — adding the same path twice yields one root', () => {
    let c = addRoot(defaultConfig(), '/movies/forge');
    c = addRoot(c, '/movies/forge', { label: 'Different label' });
    expect(c.roots.length).toBe(1);
    // The first label wins (idempotent — second call is a no-op).
    expect(c.roots[0].label).toBe('forge');
  });

  it('stamps addedAt with an ISO-8601 timestamp', () => {
    const c = addRoot(defaultConfig(), '/movies/forge');
    expect(c.roots[0].addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns a new config (does not mutate input)', () => {
    const original = defaultConfig();
    const next = addRoot(original, '/movies/forge');
    expect(original.roots).toEqual([]);
    expect(next).not.toBe(original);
  });
});

describe('removeRoot', () => {
  it('removes the matching root', () => {
    let c = addRoot(defaultConfig(), '/movies/forge');
    c = addRoot(c, '/music/tracks');
    c = removeRoot(c, '/movies/forge');
    expect(c.roots.length).toBe(1);
    expect(c.roots[0].path).toBe('/music/tracks');
  });

  it('is a no-op when path is not in the list', () => {
    const c = addRoot(defaultConfig(), '/movies/forge');
    const after = removeRoot(c, '/not/here');
    expect(after.roots.length).toBe(1);
  });
});

describe('renameRoot', () => {
  it('updates the label of the matching root', () => {
    let c = addRoot(defaultConfig(), '/movies/forge');
    c = renameRoot(c, '/movies/forge', 'Pro projects');
    expect(c.roots[0].label).toBe('Pro projects');
    expect(c.roots[0].path).toBe('/movies/forge');
  });

  it('leaves other roots unchanged', () => {
    let c = addRoot(defaultConfig(), '/a');
    c = addRoot(c, '/b');
    c = renameRoot(c, '/a', 'A-renamed');
    const b = c.roots.find((r) => r.path === '/b');
    expect(b.label).toBe('b');
  });

  it('is a no-op when path is not in the list', () => {
    let c = addRoot(defaultConfig(), '/a');
    c = renameRoot(c, '/missing', 'Whatever');
    expect(c.roots[0].label).toBe('a');
  });
});
