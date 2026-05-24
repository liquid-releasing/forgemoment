// library/config.js — read/write the shared LQR library config.
//
// The config file holds the user's configured library roots. Lives at
// the OS-convention path (resolved by the consuming app via Tauri's
// `app_config_dir()` or equivalent); forgemoment doesn't know about
// that path — the consumer passes it in.
//
// All I/O is via the FsAdapter, same pattern as scan.js.

const CONFIG_SCHEMA_VERSION = 1;

/**
 * Default config — used when the file doesn't exist yet (first run).
 * Empty roots list; the user adds their first root via the UI.
 * @returns {import('./types.js').LibraryConfig}
 */
export function defaultConfig() {
  return {
    version: CONFIG_SCHEMA_VERSION,
    roots: [],
  };
}

/**
 * Load the config from disk. Returns the default config when the file
 * is missing or unreadable — the library still functions, just with no
 * roots configured.
 *
 * @param {import('./types.js').FsAdapter} fs
 * @param {string} configPath        absolute path to library.json
 * @returns {Promise<import('./types.js').LibraryConfig>}
 */
export async function loadConfig(fs, configPath) {
  if (!(await fs.exists(configPath))) return defaultConfig();
  try {
    const data = await fs.readJson(configPath);
    return normalizeConfig(data);
  } catch {
    // Corrupted JSON — fall back to defaults rather than crashing.
    // Consumer can decide whether to surface the error in the UI.
    return defaultConfig();
  }
}

/**
 * Save the config to disk. Caller is responsible for making sure the
 * parent directory exists; forgemoment doesn't know about platform-
 * specific dir creation semantics.
 *
 * @param {import('./types.js').LibraryConfig} config
 * @param {import('./types.js').FsAdapter} fs
 * @param {string} configPath
 * @returns {Promise<void>}
 */
export async function saveConfig(config, fs, configPath) {
  const normalized = normalizeConfig(config);
  const json = JSON.stringify(normalized, null, 2);
  await fs.writeText(configPath, json);
}

/**
 * Add a root. Idempotent — adding a path that's already configured
 * returns the existing config unchanged. Validation (e.g. confirming
 * the path exists and is a directory) is the caller's responsibility;
 * forgemoment trusts the FsAdapter to surface bad paths at scan time.
 *
 * @param {import('./types.js').LibraryConfig} config
 * @param {string} path                          absolute path
 * @param {{ label?: string }} [opts]
 * @returns {import('./types.js').LibraryConfig} new config (immutable)
 */
export function addRoot(config, path, opts = {}) {
  const normalized = normalizeConfig(config);
  if (normalized.roots.some((r) => r.path === path)) return normalized;
  /** @type {import('./types.js').Root} */
  const newRoot = {
    path,
    label: opts.label ?? defaultLabelForPath(path),
    addedAt: new Date().toISOString(),
  };
  return {
    ...normalized,
    roots: [...normalized.roots, newRoot],
  };
}

/**
 * Remove a root by path. No-op if the path isn't in the list. Doesn't
 * touch the filesystem — only unregisters from the index.
 *
 * @param {import('./types.js').LibraryConfig} config
 * @param {string} path
 * @returns {import('./types.js').LibraryConfig}
 */
export function removeRoot(config, path) {
  const normalized = normalizeConfig(config);
  return {
    ...normalized,
    roots: normalized.roots.filter((r) => r.path !== path),
  };
}

/**
 * Update a root's label (rename in the UI). Path stays the join key.
 *
 * @param {import('./types.js').LibraryConfig} config
 * @param {string} path
 * @param {string} newLabel
 */
export function renameRoot(config, path, newLabel) {
  const normalized = normalizeConfig(config);
  return {
    ...normalized,
    roots: normalized.roots.map((r) =>
      r.path === path ? { ...r, label: newLabel } : r,
    ),
  };
}

// ── Internals ───────────────────────────────────────────────────────────

/**
 * Defensive normalization. Accepts an arbitrary parsed-JSON value and
 * coerces it into a valid LibraryConfig. Unknown fields are dropped;
 * malformed roots are filtered out. The config file may have been
 * hand-edited by a user or written by a future schema version.
 */
function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return defaultConfig();
  const roots = Array.isArray(raw.roots) ? raw.roots : [];
  /** @type {import('./types.js').Root[]} */
  const normalizedRoots = [];
  for (const r of roots) {
    if (!r || typeof r !== 'object') continue;
    if (typeof r.path !== 'string' || r.path.length === 0) continue;
    normalizedRoots.push({
      path: r.path,
      label: typeof r.label === 'string' && r.label.length > 0
        ? r.label
        : defaultLabelForPath(r.path),
      addedAt: typeof r.addedAt === 'string' ? r.addedAt : new Date().toISOString(),
    });
  }
  return {
    version: CONFIG_SCHEMA_VERSION,
    roots: normalizedRoots,
  };
}

/**
 * Derive a display label from an absolute path. Takes the last path
 * component; works for both POSIX (`/`) and Windows (`\`) separators
 * without needing the FsAdapter (label generation is pure string work).
 */
function defaultLabelForPath(path) {
  // Strip trailing separators, then take the last segment.
  const trimmed = path.replace(/[/\\]+$/, '');
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}
