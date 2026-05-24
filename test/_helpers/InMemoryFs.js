// InMemoryFs — an FsAdapter implementation backed by a JS object.
//
// Used by forgemoment's library tests so scan.js / config.js can be
// exercised without touching the real filesystem. Uses POSIX paths
// throughout so tests behave identically on Windows and POSIX hosts;
// real consumer adapters (Tauri Rust, etc.) handle platform-specific
// path semantics on the consumer side.

import path from 'node:path';

const pp = path.posix;

export class InMemoryFs {
  /**
   * @param {Record<string, string>} [files]  map of absolute file path → content
   * @param {string[]} [extraDirs]            paths of empty directories
   */
  constructor(files = {}, extraDirs = []) {
    this.files = new Map(Object.entries(files));
    this.dirs = new Set(extraDirs);
    // Infer directory existence from file paths.
    for (const filePath of this.files.keys()) {
      this._registerParents(filePath);
    }
    for (const d of extraDirs) this._registerParents(d);
  }

  _registerParents(p) {
    let parent = pp.dirname(p);
    while (parent && parent !== pp.dirname(parent)) {
      this.dirs.add(parent);
      parent = pp.dirname(parent);
    }
  }

  // ── FsAdapter interface ──────────────────────────────────────────────

  async readdir(dirPath) {
    if (!this.dirs.has(dirPath)) {
      // Permit the very first call against a root that we haven't seen yet
      // ONLY if it's an explicit empty dir; otherwise treat as missing.
      throw Object.assign(new Error(`ENOENT: no such directory ${dirPath}`), {
        code: 'ENOENT',
      });
    }
    const seen = new Set();
    /** @type {import('../../src/library/types.js').DirEntry[]} */
    const entries = [];
    for (const filePath of this.files.keys()) {
      if (pp.dirname(filePath) === dirPath) {
        const name = pp.basename(filePath);
        if (!seen.has(name)) {
          seen.add(name);
          entries.push({ name, isDirectory: false, isFile: true });
        }
      }
    }
    for (const d of this.dirs) {
      if (pp.dirname(d) === dirPath) {
        const name = pp.basename(d);
        if (!seen.has(name)) {
          seen.add(name);
          entries.push({ name, isDirectory: true, isFile: false });
        }
      }
    }
    return entries;
  }

  async stat(p) {
    if (!this.files.has(p)) {
      throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
    }
    const content = this.files.get(p);
    return { size: content.length, mtimeMs: 1716000000000 }; // fixed for stable tests
  }

  async exists(p) {
    return this.files.has(p) || this.dirs.has(p);
  }

  async readJson(p) {
    const text = this.files.get(p);
    if (text === undefined) {
      throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
    }
    return JSON.parse(text);
  }

  async readText(p) {
    const text = this.files.get(p);
    if (text === undefined) {
      throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
    }
    return text;
  }

  async writeText(p, text) {
    this.files.set(p, text);
    this._registerParents(p);
  }

  // Path helpers — POSIX in-memory; real consumers use native path module.
  join(...parts) { return pp.join(...parts); }
  basename(p) { return pp.basename(p); }
  extname(p) { return pp.extname(p).toLowerCase(); }
  stem(p) { return pp.basename(p, pp.extname(p)); }
}
