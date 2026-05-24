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
  // The ancestorProjects map carries stems claimed by directories higher
  // in the tree. When we descend and find a media file whose stem matches
  // an ancestor's, the file is promoted to a companion of that ancestor
  // rather than starting a new project. This handles the stim-output case
  // (per-channel mp3s sitting in a subfolder of the source video) without
  // a separate code path.
  await walkDir(root.path, projects, errors, fs, new Map());
  return {
    root,
    projects,
    errors,
    scannedAt: Date.now(),
  };
}

/**
 * Recursive directory walk. For each directory: group media files by stem,
 * either (a) promote to companions of an ancestor project with the same
 * stem, or (b) build a new Project. Then recurse into subdirs, carrying
 * down the merged set of ancestor projects.
 *
 * Skips `.<stem>.forge/` directories — those are sidecar storage, not
 * project storage. Skips any directory starting with a dot to avoid
 * surprises in user folders (`.git`, `.DS_Store` parents, etc.).
 *
 * @param {string} dirPath
 * @param {import('./types.js').Project[]} projects
 * @param {string[]} errors
 * @param {import('./types.js').FsAdapter} fs
 * @param {Map<string, import('./types.js').Project>} ancestorProjects
 */
async function walkDir(dirPath, projects, errors, fs, ancestorProjects) {
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
  // Funscript candidates in this dir — used downstream to pair funscripts
  // with media via prefix-with-boundary matching (handles "IPZZ-125.omfg
  // .funscript pairs with IPZZ-125.omfg_iris3.mp4" style mismatches).
  /** @type {{stem: string, name: string}[]} */
  const funscriptCandidates = [];

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
    if (ext === '.funscript') {
      funscriptCandidates.push({ stem: fs.stem(entry.name), name: entry.name });
      continue;
    }
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

  // Decide for each stem group: promote to an ancestor's companions, or
  // build a new Project. Track this dir's new projects so we can extend
  // the ancestor map for the recursion below.
  // Process video-bearing stem groups first so audio groups in the same
  // directory can see the just-built video projects when checking for
  // dot-prefix derivative matches (the Edger stim case:
  // `liquidreleasing.stereostim.mp3` derives from `liquidreleasing.mp4`).
  const orderedStemGroups = [...stemGroups.entries()].sort((a, b) => {
    const aHasVideo = a[1].some((f) => f.kind === 'video');
    const bHasVideo = b[1].some((f) => f.kind === 'video');
    if (aHasVideo === bHasVideo) return 0;
    return aHasVideo ? -1 : 1;
  });

  /** @type {import('./types.js').Project[]} */
  const localProjects = [];
  /** @type {Map<string, import('./types.js').Project>} */
  const localProjectsByStem = new Map();
  for (const [stem, files] of orderedStemGroups) {
    // Look for a video project (ancestor OR local same-dir) whose stem
    // either matches exactly OR is a dot-prefix of this stem. Only audio-
    // only stem groups can be derivatives (a video in a subdir is its
    // own project, not a derivative of an upper video).
    //
    // Inlined the ancestor+local merge so we never depend on top-level
    // function hoisting across this file — a Vite Fast-Refresh edge
    // case was producing a ReferenceError in the dev server.
    let claimable;
    if (localProjectsByStem.size === 0) {
      claimable = ancestorProjects;
    } else {
      claimable = new Map(ancestorProjects);
      for (const [s, p] of localProjectsByStem) claimable.set(s, p);
    }
    const match = findDerivativeMatch(stem, files, claimable);
    if (match) {
      for (const f of files) match.companions.push(f.path);
      match.pills.audio = true;
      continue;
    }
    try {
      const project = await buildProject(stem, files, dirPath, fs, funscriptCandidates);
      projects.push(project);
      localProjects.push(project);
      localProjectsByStem.set(stem, project);
    } catch (e) {
      errors.push(`buildProject ${stem} in ${dirPath}: ${e?.message ?? e}`);
    }
  }

  // Build the ancestor map passed to children: parent ancestors PLUS this
  // dir's new projects (stem-keyed). New per branch — sibling subdirs at
  // the same depth see the same ancestors, not each other's projects.
  const childAncestors = new Map(ancestorProjects);
  for (const p of localProjects) childAncestors.set(p.stem, p);

  for (const subdir of subdirs) {
    await walkDir(subdir, projects, errors, fs, childAncestors);
  }
}

/**
 * Find a video project this audio-only stem group should attach to as
 * companions. Returns null if there's no good match — caller then builds
 * a standalone project. The rule is intentionally narrow to avoid
 * collapsing user-organized duplicates (see scan.test.js for the
 * Prisoner vs. stim cases).
 *
 * Match rules (any one suffices, ALL within a video-only ancestor):
 *   1. Exact stem match — `source.mp4` claims `source.mp3` in a subdir.
 *   2. Dot-prefix match — `source.mp4` claims `source.alpha.mp3`,
 *      `source.prostate.stereostim.mp3`, etc. The trailing dot is
 *      required so `liquidreleasing.mp4` does NOT claim
 *      `liquidreleasingexit.stereostim.mp3` (the prefix would have to
 *      end at a `.` boundary).
 *
 * When multiple ancestors could match (e.g. `liquid.mp4` and
 * `liquid.bar.mp4` both ancestors of `liquid.bar.baz.mp3`), the LONGEST
 * matching prefix wins — the most specific ancestor claims.
 *
 * @param {string} stem                    the stem of the candidate group
 * @param {import('./types.js').MediaFile[]} files
 * @param {Map<string, import('./types.js').Project>} candidates
 */
function findDerivativeMatch(stem, files, candidates) {
  // Only audio-only groups are eligible — videos in subdirs are always
  // their own projects (covers `/lib/archive/Prisoner.mp4` etc.).
  if (!files.every((f) => f.kind === 'audio')) return null;

  // Exact match takes precedence.
  const exact = candidates.get(stem);
  if (exact && exact.kind === 'video') return exact;

  // Longest dot-prefix wins.
  let best = null;
  let bestLen = 0;
  for (const [candidateStem, project] of candidates) {
    if (project.kind !== 'video') continue;
    if (
      stem.length > candidateStem.length + 1
      && stem.startsWith(`${candidateStem}.`)
      && candidateStem.length > bestLen
    ) {
      best = project;
      bestLen = candidateStem.length;
    }
  }
  return best;
}

/**
 * Build a Project from a stem group. Primary selection: prefer video; if
 * audio-only, pick highest-fidelity audio (.wav > .flac > .m4a > .mp3 > .ogg).
 * All non-primary files become companions.
 */
async function buildProject(stem, files, dirPath, fs, funscriptCandidates = []) {
  const primary = pickPrimary(files);
  const companions = files
    .filter((f) => f.path !== primary.path)
    .map((f) => f.path);

  // Stat the primary for size + mtime. If it fails, propagate so the
  // caller can record the error and skip this project.
  const stat = await fs.stat(primary.path);

  const forgeDir = fs.join(dirPath, `.${stem}.forge`);
  const forgeDirExists = await fs.exists(forgeDir);

  // Resolve the funscript for this project up front so the result is
  // available to both the pill check AND the project record (callers
  // need the actual matched filename, not just a boolean — see the
  // IPZZ-125.omfg.funscript / IPZZ-125.omfg_iris3.mp4 case).
  const funscriptMatch = findFunscriptMatch(stem, funscriptCandidates);
  const funscriptName = funscriptMatch?.name ?? null;

  // Pills — pure existence checks. `forged` requires reading `.feel.yml`
  // contents in the future to validate non-empty assignments; v1 ships
  // the simple version (file exists) and refines once .feel.yml lands.
  const pills = await detectPills({
    stem, dirPath, forgeDir, forgeDirExists, primary, companions, files, fs,
    funscriptName,
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
    funscriptName,
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
 * Pair a funscript file with a project's media stem.
 *
 *   1. Exact stem match (case-insensitive) wins outright.
 *   2. Otherwise, the longest funscript-stem that the project stem starts
 *      with — followed by a boundary char (`.`, `_`, `-`) — wins.
 *
 * The boundary requirement keeps `Movie.funscript` from claiming
 * `MovieExtended.mp4`, while still pairing `IPZZ-125.omfg.funscript` with
 * `IPZZ-125.omfg_iris3.mp4` (the case the strict scan was missing).
 *
 * @param {string} projectStem
 * @param {{stem: string, name: string}[]} candidates
 * @returns {{stem: string, name: string} | null}
 */
function findFunscriptMatch(projectStem, candidates) {
  if (!candidates || candidates.length === 0) return null;
  const projLower = projectStem.toLowerCase();

  // Exact case-insensitive match takes precedence.
  for (const c of candidates) {
    if (c.stem.toLowerCase() === projLower) return c;
  }

  // Longest prefix-with-boundary match.
  let best = null;
  let bestLen = 0;
  for (const c of candidates) {
    const candLower = c.stem.toLowerCase();
    if (candLower.length >= projLower.length) continue;
    if (!projLower.startsWith(candLower)) continue;
    const boundary = projLower.charAt(candLower.length);
    if (boundary !== '.' && boundary !== '_' && boundary !== '-') continue;
    if (candLower.length > bestLen) {
      best = c;
      bestLen = candLower.length;
    }
  }
  return best;
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
  funscriptName,
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

  // funscript pill — driven by findFunscriptMatch upstream (see
  // buildProject). Allows the relaxed prefix-with-boundary pairing that
  // the strict `<stem>.funscript` existence check would miss.
  const hasFunscript = !!funscriptName;

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
