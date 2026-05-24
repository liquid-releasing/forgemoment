// library/scan.js — walk a configured library root and emit Project[].
//
// Pure-function module. All filesystem I/O goes through an FsAdapter the
// caller supplies (see types.js `FsAdapter`). That keeps forgemoment free
// of Tauri/Electron/Node coupling — same scan code runs in any consumer
// app, browser-side or native.

import {
  VIDEO_EXTS, AUDIO_EXTS, AUDIO_FIDELITY, SIDECAR_NAMES,
} from './types.js';

/**
 * Walk a library root, build Project records. Pure with respect to fs —
 * never blocks the caller on thumbnail generation or other slow work.
 *
 * @param {import('./types.js').Root} root
 * @param {import('./types.js').FsAdapter} fs
 * @returns {Promise<import('./types.js').ScanResult>}
 */
export async function scanRoot(root, fs) {
  /** @type {import('./types.js').Project[]} */
  const projects = [];
  const errors = [];
  await walkDir(root.path, projects, errors, fs);
  return {
    root,
    projects,
    errors,
    scannedAt: Date.now(),
  };
}

/**
 * Recursive directory walk. For each directory: group media files by stem
 * into one Project per stem (video + same-stem audio = one project per the
 * companion rule), then recurse into subdirs.
 *
 * Skips `.<stem>.forge/` directories — those are sidecar storage, not
 * project storage. Skips any directory starting with a dot to avoid
 * surprises in user folders (`.git`, `.DS_Store` parents, etc.).
 */
async function walkDir(dirPath, projects, errors, fs) {
  /** @type {import('./types.js').DirEntry[]} */
  let entries;
  try {
    entries = await fs.readdir(dirPath);
  } catch (e) {
    errors.push(`readdir ${dirPath}: ${e?.message ?? e}`);
    return;
  }

  // Group media files in this directory by stem; collect subdirs for
  // post-recursion. Two passes are cleaner than one because companion
  // grouping must complete before we can build Projects.
  /** @type {Map<string, import('./types.js').MediaFile[]>} */
  const stemGroups = new Map();
  /** @type {string[]} */
  const subdirs = [];

  for (const entry of entries) {
    if (entry.isDirectory) {
      // `.<stem>.forge/` is sidecar storage — never recurse in.
      // Other dotted dirs (`.git`, `.cache`, etc.) — also skip;
      // the user's media never lives in hidden dirs.
      if (entry.name.startsWith('.')) continue;
      subdirs.push(fs.join(dirPath, entry.name));
      continue;
    }
    if (!entry.isFile) continue;

    const ext = fs.extname(entry.name).toLowerCase();
    const isVideo = VIDEO_EXTS.has(ext);
    const isAudio = AUDIO_EXTS.has(ext);
    if (!isVideo && !isAudio) continue;

    const stem = fs.stem(entry.name);
    const fullPath = fs.join(dirPath, entry.name);
    /** @type {import('./types.js').MediaFile} */
    const media = {
      path: fullPath,
      name: entry.name,
      ext,
      kind: isVideo ? 'video' : 'audio',
    };
    if (!stemGroups.has(stem)) stemGroups.set(stem, []);
    stemGroups.get(stem).push(media);
  }

  // Build one Project per stem group in this directory.
  for (const [stem, files] of stemGroups) {
    try {
      const project = await buildProject(stem, files, dirPath, fs);
      projects.push(project);
    } catch (e) {
      errors.push(`buildProject ${stem} in ${dirPath}: ${e?.message ?? e}`);
    }
  }

  // Recurse into subdirs.
  for (const subdir of subdirs) {
    await walkDir(subdir, projects, errors, fs);
  }
}

/**
 * Build a Project from a stem group. Primary selection: prefer video; if
 * audio-only, pick highest-fidelity audio (.wav > .flac > .m4a > .mp3 > .ogg).
 * All non-primary files become companions.
 */
async function buildProject(stem, files, dirPath, fs) {
  const primary = pickPrimary(files);
  const companions = files
    .filter((f) => f.path !== primary.path)
    .map((f) => f.path);

  // Stat the primary for size + mtime. If it fails, propagate so the
  // caller can record the error and skip this project.
  const stat = await fs.stat(primary.path);

  const forgeDir = fs.join(dirPath, `.${stem}.forge`);
  const forgeDirExists = await fs.exists(forgeDir);

  // Pills — pure existence checks. `forged` requires reading `.feel.yml`
  // contents in the future to validate non-empty assignments; v1 ships
  // the simple version (file exists) and refines once .feel.yml lands.
  const pills = await detectPills({
    stem, dirPath, forgeDir, forgeDirExists, primary, companions, files, fs,
  });

  // Metadata — cheap reads only (sidecar JSON parsing). Each field is
  // null when not known; UI renders only known values.
  const metadata = await readMetadata({ stem, forgeDir, forgeDirExists, fs });

  // Status — explicit `.completed` marker takes priority; presence of
  // forgeDir means `active`; nothing means `raw`.
  let status = /** @type {import('./types.js').ProjectStatus} */ ('raw');
  if (forgeDirExists) {
    const completedMarker = fs.join(forgeDir, SIDECAR_NAMES.completed);
    if (await fs.exists(completedMarker)) {
      status = 'completed';
    } else {
      status = 'active';
    }
  }

  // Cached thumbnail — populated on prior scan if the thumb resolver
  // already ran. v1 scan never generates thumbs; the consuming app's
  // resolver runs progressively after the scan.
  let thumbPath = null;
  if (forgeDirExists) {
    const candidateThumb = fs.join(forgeDir, SIDECAR_NAMES.thumb);
    if (await fs.exists(candidateThumb)) thumbPath = candidateThumb;
  }

  return {
    id: primary.path,
    mediaPath: primary.path,
    kind: primary.kind,
    companions,
    title: stem,
    stem,
    dirPath,
    forgeDir,
    sizeBytes: stat.size,
    mtime: new Date(stat.mtimeMs).toISOString(),
    durationMs: metadata.durationMs ?? null,
    pills,
    metadata,
    tags: [],
    status,
    thumbPath,
  };
}

/**
 * Pick the primary media file from a stem group.
 *   1. Video wins over audio (any video file).
 *   2. Multiple videos: pick by extension priority (mp4 > mkv > webm > ...).
 *      Today there's no fidelity ranking for videos — just take the first.
 *   3. Audio-only group: pick highest fidelity per AUDIO_FIDELITY.
 */
function pickPrimary(files) {
  const videos = files.filter((f) => f.kind === 'video');
  if (videos.length > 0) return videos[0];
  const audios = files.filter((f) => f.kind === 'audio');
  return audios
    .slice()
    .sort((a, b) => (AUDIO_FIDELITY[b.ext] ?? 0) - (AUDIO_FIDELITY[a.ext] ?? 0))[0];
}

/**
 * Build the Pills record. Pure existence checks; never reads file
 * contents (forged-marker validation comes when .feel.yml lands).
 */
async function detectPills({
  stem, dirPath, forgeDir, forgeDirExists, primary, companions, files, fs,
}) {
  // video pill = the project has at least one video file
  const hasVideo = files.some((f) => f.kind === 'video');

  // audio pill = the project has an audio source — either a standalone
  // audio file at the same stem, OR an audio-analysis sidecar exists
  // (peaks / beats / spectrogram).
  let hasAudio = files.some((f) => f.kind === 'audio');
  if (!hasAudio && forgeDirExists) {
    const peaks = fs.join(forgeDir, `${stem}${SIDECAR_NAMES.audioPeaks}`);
    const beats = fs.join(forgeDir, `${stem}${SIDECAR_NAMES.beats}`);
    const spectro = fs.join(forgeDir, `${stem}${SIDECAR_NAMES.spectrogram}`);
    hasAudio = (await fs.exists(peaks))
      || (await fs.exists(beats))
      || (await fs.exists(spectro));
  }

  // funscript pill — `<dirPath>/<stem>.funscript` next to the media,
  // NOT inside the forge dir.
  const funscriptPath = fs.join(dirPath, `${stem}.funscript`);
  const hasFunscript = await fs.exists(funscriptPath);

  // forged pill — `.feel.yml` exists in the forge dir. v1 is simple
  // file-exists; once .feel.yml has a concrete shape, refine to require
  // non-empty chapters[].character or chapters[].tone.
  let isForged = false;
  if (forgeDirExists) {
    const feelPath = fs.join(forgeDir, SIDECAR_NAMES.feel);
    isForged = await fs.exists(feelPath);
  }

  return {
    video: hasVideo,
    audio: hasAudio,
    funscript: hasFunscript,
    forged: isForged,
  };
}

/**
 * Read cheap metadata from sidecars. Each field is null when not known.
 * No errors propagate from here — a malformed sidecar shouldn't sink a
 * scan; it just means we don't surface that field. Errors aren't even
 * collected because they'd appear once per scan; debug-print only.
 */
async function readMetadata({ stem, forgeDir, forgeDirExists, fs }) {
  /** @type {import('./types.js').Metadata & { durationMs: number|null }} */
  const result = {
    chapters: null,
    bpm: null,
    beats: null,
    actionCount: null,
    funscriptTopology: null,
    durationMs: null,
  };
  if (!forgeDirExists) return result;

  // Chapters — try .feel.yml first (future), fall back to <stem>.chapters.json.
  const chaptersPath = fs.join(forgeDir, `${stem}${SIDECAR_NAMES.chapters}`);
  if (await fs.exists(chaptersPath)) {
    try {
      const data = await fs.readJson(chaptersPath);
      if (Array.isArray(data?.chapters)) result.chapters = data.chapters.length;
      if (typeof data?.durationMs === 'number') result.durationMs = data.durationMs;
    } catch { /* malformed sidecar — silently skip */ }
  }

  // Beats / BPM — from beats sidecar if present.
  const beatsPath = fs.join(forgeDir, `${stem}${SIDECAR_NAMES.beats}`);
  if (await fs.exists(beatsPath)) {
    try {
      const data = await fs.readJson(beatsPath);
      if (Array.isArray(data?.times)) result.beats = data.times.length;
      if (typeof data?.bpm === 'number') result.bpm = Math.round(data.bpm);
    } catch { /* skip */ }
  }

  // Funscript topology — would require reading the .funscript header.
  // Defer to a later pass when the funscript reader is wired; v1 leaves
  // this null (so the topology pill simply doesn't render).

  return result;
}

// ── Test helpers ────────────────────────────────────────────────────────
// Exported for unit tests / scripted verification. Not part of the
// stable public API; consumers should use scanRoot.
export const _internal = { walkDir, buildProject, pickPrimary };
