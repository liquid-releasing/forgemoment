// library/types.js — data shapes + constants for the LibraryView surface.
//
// Forgemoment is consumed by Tauri apps, plain web apps, and potentially
// Electron — so this module has zero filesystem coupling. Consumers pass
// an FsAdapter into the scan / config functions; forgemoment just describes
// the shape of data flowing through.

// ── Media extensions ────────────────────────────────────────────────────
// Lowercase, leading dot. Compared against fs.extname(path).toLowerCase().

export const VIDEO_EXTS = new Set([
  '.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v',
]);

export const AUDIO_EXTS = new Set([
  '.mp3', '.wav', '.flac', '.ogg', '.m4a',
]);

// Audio fidelity ranking — used to pick the primary when a project has
// multiple audio files at the same stem and no video. Higher = preferred.
// Lossless ahead of lossy; .m4a (AAC) ahead of .mp3 (older codec).
export const AUDIO_FIDELITY = {
  '.wav': 5,
  '.flac': 4,
  '.m4a': 3,
  '.mp3': 2,
  '.ogg': 1,
};

// Sidecar filenames inside `.<stem>.forge/` — checked for pill detection.
// Forgemoment knows about these conventions because they're LQR-wide;
// apps that use different conventions can ignore them by providing a
// custom pill resolver (see scan.js `options.detectPills`).
export const SIDECAR_NAMES = {
  feel: 'feel.yml',                        // canonical cross-device sidecar (future)
  chapters: '.chapters.json',              // current chapter sidecar (transitional)
  audioPeaks: '.audio.json',
  spectrogram: '.spectrogram.json',
  beats: '.beats.json',
  thumb: 'thumb.jpg',                      // cached cover (frame or waveform crop)
  completed: '.completed',                 // user-flagged-completed marker
};

// ── JSDoc typedefs ──────────────────────────────────────────────────────
// Re-exported via barrel; type-only — no runtime cost.

/**
 * One configured library root. Persisted in `library.json`.
 * @typedef {Object} Root
 * @property {string} path        absolute path to the directory
 * @property {string} label       display name (defaults to path's basename)
 * @property {string} addedAt     ISO-8601 timestamp
 */

/**
 * One library config record — what's persisted at the OS-convention path.
 * @typedef {Object} LibraryConfig
 * @property {number} version     schema version, currently 1
 * @property {Root[]} roots       configured library roots
 */

/**
 * A single media file inside a project (primary or companion).
 * @typedef {Object} MediaFile
 * @property {string} path        absolute path
 * @property {string} name        basename with extension
 * @property {string} ext         lowercase with leading dot
 * @property {'video'|'audio'} kind
 */

/**
 * Boolean pills shown on a project card. Each pill renders only when true
 * (UI rule: show only what we know — no greyed-out "missing X" markers).
 * @typedef {Object} Pills
 * @property {boolean} video       primary media is video OR a companion video exists
 * @property {boolean} audio       audio source present (companion file OR analysis sidecar)
 * @property {boolean} funscript   <stem>.funscript exists alongside the media
 * @property {boolean} forged      <stem>.feel.yml exists in the forge dir
 */

/**
 * Cheap metadata read from .forge/ sidecars or filesystem stat. Each field
 * is null when not known; the card renders only known values.
 * @typedef {Object} Metadata
 * @property {number|null} chapters
 * @property {number|null} bpm
 * @property {number|null} beats
 * @property {number|null} actionCount
 * @property {string|null} funscriptTopology  'single' | 'tri-phase' | 'four-phase'
 */

/**
 * @typedef {'raw'|'active'|'completed'} ProjectStatus
 * `raw`       — no `.<stem>.forge/` directory at all
 * `completed` — user explicitly flagged (`.completed` marker in the forge dir)
 * `active`    — `.<stem>.forge/` exists, not flagged completed
 */

/**
 * A library project. Built by scan.js from a directory listing.
 * @typedef {Object} Project
 * @property {string}      id            stable key — absolute path of primary media file
 * @property {string}      mediaPath     absolute path of primary media (== id)
 * @property {'video'|'audio'} kind      kind of the primary media
 * @property {string[]}    companions    absolute paths of secondary media at same stem
 * @property {string}      title         display title — defaults to stem
 * @property {string}      stem          filename without extension
 * @property {string}      dirPath       absolute path of the directory holding the media
 * @property {string}      forgeDir      absolute path of `.<stem>.forge/` (may not exist)
 * @property {number}      sizeBytes
 * @property {string}      mtime         ISO-8601 last-modified time
 * @property {number|null} durationMs    null until thumb/metadata pass runs
 * @property {Pills}       pills
 * @property {Metadata}    metadata
 * @property {string[]}    tags          manual user tags (v1: empty array)
 * @property {ProjectStatus} status
 * @property {string|null} thumbPath     absolute path; null until thumb resolver runs
 */

/**
 * Result of scanning one root.
 * @typedef {Object} ScanResult
 * @property {Root}      root
 * @property {Project[]} projects        flat list across all subdirs
 * @property {string[]}  errors          per-path errors (permission denied, bad JSON, etc.)
 * @property {number}    scannedAt       ms since epoch
 */

/**
 * Single directory entry. Modeled on Node's Dirent — but minimal so any
 * platform binding can satisfy it.
 * @typedef {Object} DirEntry
 * @property {string}  name              filename only, not a full path
 * @property {boolean} isDirectory
 * @property {boolean} isFile
 */

/**
 * Filesystem stat — only the fields scan.js needs.
 * @typedef {Object} FileStat
 * @property {number} size               bytes
 * @property {number} mtimeMs            ms since epoch
 */

/**
 * Platform-agnostic filesystem adapter passed into scan.js / config.js.
 * Consumers implement this against Tauri (Rust → JS bridge), Electron's
 * `fs` module, or — for unit tests — an in-memory fake.
 *
 * @typedef {Object} FsAdapter
 * @property {(dirPath: string) => Promise<DirEntry[]>} readdir
 * @property {(path: string) => Promise<FileStat>}      stat
 * @property {(path: string) => Promise<boolean>}       exists
 * @property {(path: string) => Promise<any>}           readJson   parsed; throws on bad JSON
 * @property {(path: string) => Promise<string>}        readText
 * @property {(path: string, text: string) => Promise<void>} writeText
 * @property {(...parts: string[]) => string}           join       platform-aware path join
 * @property {(path: string) => string}                 basename   filename with extension
 * @property {(path: string) => string}                 extname    lowercase, with leading dot
 * @property {(path: string) => string}                 stem       filename without extension
 */
