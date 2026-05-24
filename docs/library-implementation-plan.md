# Library — implementation plan

The `LibraryView` is forgemoment's shared "what's in my collection" surface. Consumed by FunscriptForge (Library tab), the Player (Library tab), and Beatflo (Source library) eventually. v1 ships standalone — no Stash integration yet (see [stash-integration.md](stash-integration.md) for the deferred design).

This doc is the wiring plan. Architectural decisions are locked; phases are sequenced for incremental testing.

---

## Decisions locked

| # | Decision | Why |
|---|---|---|
| 1 | **Config location:** OS-convention path resolved via Tauri's `app_config_dir()` — `%APPDATA%\LQR\library.json` (Win), `~/Library/Application Support/LQR/library.json` (macOS), `~/.config/LQR/library.json` (Linux) | Stash convention; better Windows citizenship than a dotfile |
| 2 | **Thumbnails:** Generate; OS-cached thumb first, ffmpeg fallback, placeholder last resort. Cache into `.forge/<stem>.forge/thumb.jpg` | Instant for already-watched files (Explorer/Finder caches); correct for the long tail |
| 3 | **Scan depth:** Fully recursive from each configured root | Real users have nested folders. `.forge/<stem>.forge/` directories are NOT recursed into |
| 4 | **FF Library tab:** Replace outright, no transitional coexistence | Current tab is a thin file-picker — nothing to preserve |
| 5 | **Project key:** Video file (`.mp4`, `.mkv`, `.webm`, `.mov`, `.avi`, `.m4v`) OR solo audio file (`.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`) | Funscripts can be edited against audio-only sources (music-track haptics) |
| 6 | **Card slot pattern:** Forgemoment exports `LibraryView` + default `LibraryCard`. Per-app variation via `renderCard` slot | Heavy plumbing shared; card-level visual variation lives at the app |

---

## Phase A — Foundation (no UI)

Build the data model + scan logic. Verifiable via direct invocation against a test folder.

### A.1 — Types

`forgemoment/src/library/types.js` — JSDoc typedefs (forgemoment is JS, not TS):

```js
/** @typedef {Object} Root
 *  @property {string} path        absolute path
 *  @property {string} label       display name (defaults to basename)
 *  @property {string} addedAt     ISO-8601
 */

/** @typedef {Object} Project
 *  @property {string}  id           absolute path of the media file (stable key)
 *  @property {string}  mediaPath    absolute path
 *  @property {'video'|'audio'} kind
 *  @property {string}  title        display title (basename without ext)
 *  @property {string}  stem         filename without ext (for `.forge/<stem>.forge/` lookup)
 *  @property {string}  forgeDir     absolute path of `.forge/<stem>.forge/` (may not exist yet)
 *  @property {number}  sizeBytes
 *  @property {string}  mtime        ISO-8601 last-modified
 *  @property {number|null} durationMs    cached if `.forge/` has it; null otherwise
 *  @property {Pills}   pills        what sidecars / states exist
 *  @property {Metadata} metadata    cheap reads from `.forge/`
 *  @property {string[]} tags        manual user tags from `.feel.yml` (v1: empty array)
 *  @property {ProjectStatus} status 'raw' | 'active' | 'completed'
 *  @property {string|null} thumbPath  absolute path to cover, or null if not yet generated
 */

/** @typedef {Object} Pills
 *  @property {boolean} video
 *  @property {boolean} audio        peaks/spectrogram/beats sidecars present
 *  @property {boolean} funscript
 *  @property {boolean} forged       `.feel.yml` exists with non-empty character/tone assignments
 */

/** @typedef {Object} Metadata
 *  @property {number|null} chapters
 *  @property {number|null} bpm
 *  @property {number|null} beats
 *  @property {number|null} actionCount
 *  @property {string|null} funscriptTopology  'single' | 'tri-phase' | 'four-phase' | null
 */

/** @typedef {'raw'|'active'|'completed'} ProjectStatus */

/** @typedef {Object} ScanResult
 *  @property {Root}      root
 *  @property {Project[]} projects
 *  @property {string[]}  errors       per-file errors (permission denied, etc.)
 *  @property {number}    scannedAt    ms since epoch
 */
```

### A.2 — Scan logic

`forgemoment/src/library/scan.js` — pure functions, no I/O bindings (takes a `fs` adapter as input so forgemoment doesn't depend on Tauri):

```js
/**
 * Walk a root directory, find all media projects, return ScanResult.
 * @param {Root} root
 * @param {FsAdapter} fs   { readdir, stat, exists, readJson }
 * @returns {Promise<ScanResult>}
 */
async function scanRoot(root, fs) { ... }
```

The FsAdapter pattern lets forgemoment stay platform-agnostic. The consuming app (FunscriptForge via Tauri, Player via Electron, etc.) provides the actual filesystem implementation. Same scan logic, different I/O.

Project detection rules:
- A file is a *project root* if its extension is in `VIDEO_EXTS` or `AUDIO_EXTS`.
- For each project root, the associated `.forge/<stem>.forge/` directory is the sibling sidecar dir. Check existence; do not require.
- Pills derived purely from file-exists checks in `.forge/<stem>.forge/`:
  - `audio` = `<stem>.audio.json` OR `<stem>.spectrogram.npy` OR `<stem>.beats.json` exists
  - `funscript` = `<stem>.funscript` exists (alongside the media, NOT inside `.forge/`)
  - `forged` = `<stem>.feel.yml` exists AND has non-empty `chapters[].character` or `chapters[].tone` assignments
- Status derived:
  - `raw` = no `.forge/<stem>.forge/` directory
  - `completed` = `.forge/<stem>.forge/.completed` marker file exists
  - `active` = otherwise

### A.3 — Config

`forgemoment/src/library/config.js` — read/write `library.json`. Same FsAdapter pattern:

```js
async function loadConfig(fs, configPath) { ... }
async function saveConfig(config, fs, configPath) { ... }
async function addRoot(config, path, fs, configPath) { ... }
async function removeRoot(config, path, fs, configPath) { ... }
```

Config schema:

```json
{
  "version": 1,
  "roots": [
    { "path": "/movies/forge", "label": "Forge projects", "addedAt": "2026-05-24T..." }
  ]
}
```

(The `stash` section from `stash-integration.md` lands when that pass starts — not in v1.)

### A.4 — Thumbnails (deferred to Phase B integration, but design now)

Thumbnail resolver lives in the consuming app (it needs platform-native bindings):

```js
/**
 * Resolve a thumbnail path for a project. Tries cached → OS → ffmpeg.
 * @param {Project} project
 * @returns {Promise<string|null>}  absolute path to thumbnail, or null
 */
async function resolveThumb(project) { ... }
```

Strategy:
1. Check `.forge/<stem>.forge/thumb.jpg` — return if exists.
2. Try OS thumb (Windows COM `IShellItemImageFactory`, macOS `QLThumbnailGenerator`). On success, copy to `.forge/<stem>.forge/thumb.jpg` and return.
3. Run ffmpeg `-ss 00:00:30 -frames:v 1` (or mid-video seek for short files). Save to `.forge/<stem>.forge/thumb.jpg`. Return.
4. Return `null` — card renders placeholder.

Don't block the scan. Scan returns `Project` with `thumbPath: null`; the resolver runs after, fires a per-project update, card re-renders with the thumb. Progressive enhancement.

---

## Phase B — Component

Build `LibraryView` + default `LibraryCard` in forgemoment. Visualizes Phase A's scan output.

### B.1 — Component API

```jsx
<LibraryView
  config={config}                    // from loadConfig()
  scanResults={scanResults}          // Map<rootPath, ScanResult>
  onAddRoot={(path) => ...}          // user clicked +
  onRemoveRoot={(path) => ...}       // user clicked remove on a root card
  onRevealRoot={(path) => ...}       // user clicked reveal-in-Explorer
  onRescanRoot={(path) => ...}       // user triggers rescan (or progressive thumb pass)
  renderCard={(project) => ...}      // SLOT — defaults to <LibraryCard />
  // Optional UX controls
  defaultSort="lastEdited"           // 'lastEdited' | 'title' | 'duration'
  defaultStatusFilter="all"          // 'all' | 'raw' | 'active' | 'completed'
/>
```

### B.2 — Layout

```
┌──────────────────────────────────────────────────────────┐
│  Roots row (cards + plus)                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────┐             │
│  │ Forge   │ │ Music   │ │ Imports │ │  +  │             │
│  │ 23      │ │ 7       │ │ 142     │ │     │             │
│  └─────────┘ └─────────┘ └─────────┘ └─────┘             │
├──────────────────────────────────────────────────────────┤
│  Filter strip   [All] [Raw] [Active] [Completed]  Sort ▾ │
├──────────────────────────────────────────────────────────┤
│  Project grid (cards via renderCard slot)                │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                         │
│  │ thumb│ │ thumb│ │ thumb│ │ thumb│                         │
│  │ title│ │ title│ │ title│ │ title│                         │
│  │ pills│ │ pills│ │ pills│ │ pills│                         │
│  │ meta │ │ meta │ │ meta │ │ meta │                         │
│  └─────┘ └─────┘ └─────┘ └─────┘                         │
└──────────────────────────────────────────────────────────┘
```

### B.3 — Default LibraryCard

```jsx
<LibraryCard
  project={project}
  onOpen={() => ...}          // primary click handler — app-specific intent
  // Optional children render as an overlay (Player adds a play button etc.)
  children={null}
/>
```

Card content (top to bottom):
- Thumbnail (16:9 letterbox, placeholder until thumb resolves)
- Title (1 line, truncate)
- Pill row — only render pills for which `project.pills[x] === true`. **Show only what we know.**
- Metadata row — render fields only when non-null. **Show only what we know.**

No empty placeholders. No "—". No "0 chapters."

### B.4 — Status filter + sort

Pure client-side; forgemoment owns the filter state, exposes it via a controlled-or-uncontrolled prop pattern.

---

## Phase C — FunscriptForge wiring

### C.1 — Tauri commands (`funscriptforge/src-tauri/src/commands/library.rs`)

```rust
#[tauri::command]
async fn library_load_config() -> Result<LibraryConfig, String> { ... }

#[tauri::command]
async fn library_save_config(config: LibraryConfig) -> Result<(), String> { ... }

#[tauri::command]
async fn library_scan_root(path: String) -> Result<ScanResult, String> { ... }

#[tauri::command]
async fn library_add_root(path: String) -> Result<LibraryConfig, String> { ... }

#[tauri::command]
async fn library_remove_root(path: String) -> Result<LibraryConfig, String> { ... }

#[tauri::command]
async fn library_reveal_in_explorer(path: String) -> Result<(), String> { ... }

#[tauri::command]
async fn library_resolve_thumb(project_id: String) -> Result<Option<String>, String> { ... }
```

Each calls into a Rust-side `library/` module that implements the FsAdapter interface plus the platform thumb resolver.

### C.2 — JS API layer (`funscriptforge/ui/web/src/api/library.js`)

Thin wrappers around `invoke()` for each command.

### C.3 — Replace LibraryTab

`funscriptforge/ui/web/src/screens/LibraryTab.jsx` — delete the current contents, replace with:

```jsx
import { LibraryView } from 'forgemoment';
import { loadConfig, scanRoot, addRoot, ... } from '../api/library.js';

export default function LibraryTab({ onOpenProject }) {
  const [config, setConfig] = useState(null);
  const [scanResults, setScanResults] = useState(new Map());

  // load config on mount; scan each root on config change
  useEffect(() => { ... }, []);

  return (
    <LibraryView
      config={config}
      scanResults={scanResults}
      onAddRoot={async (path) => { setConfig(await addRoot(path)); }}
      onRemoveRoot={async (path) => { setConfig(await removeRoot(path)); }}
      onRevealRoot={(path) => revealInExplorer(path)}
      onRescanRoot={async (path) => {
        const result = await scanRoot(path);
        setScanResults(prev => new Map(prev).set(path, result));
      }}
      renderCard={(p) => (
        <LibraryCard project={p} onOpen={() => onOpenProject(p.mediaPath)} />
      )}
    />
  );
}
```

The existing `onOpenProject` handler in App.jsx — the one the old Library tab uses — gets wired to the card's primary click. No new open-project pipeline.

---

## Phase D — Test against the real folder

1. User adds a small folder via the + card.
2. Verify roots row reflects the addition.
3. Verify scan completes and cards render with correct pills.
4. Verify status filter and sort work.
5. Verify thumb resolver populates cards progressively.
6. Click a card — verify the project opens in FF as if from the old Library tab.
7. Reveal-in-explorer works on each platform.

---

## Out of scope for v1

Deferred to later passes:

- Manual tag CRUD (was originally in v1; defer — UX is non-trivial and Stash-integration design will inform tag namespace conventions). Tags can land as a thin add-on without re-architecting.
- Stash integration (entire `stash-integration.md` design).
- Free-text search.
- Bulk operations (multi-select cards, batch tag, batch delete).
- Drag-to-reorder roots.
- Per-root status badge breakdown in the roots row (the "5 active / 12 completed" line).

---

## Files this lands

forgemoment:
- `src/library/types.js` (NEW)
- `src/library/scan.js` (NEW)
- `src/library/config.js` (NEW)
- `src/LibraryView.jsx` (NEW)
- `src/LibraryCard.jsx` (NEW)
- `src/index.js` (UPDATED — export the new bits)

funscriptforge:
- `src-tauri/src/commands/library.rs` (NEW)
- `src-tauri/src/library/mod.rs` (NEW — scan + config + thumb resolver Rust impl)
- `src-tauri/src/library/scan.rs`
- `src-tauri/src/library/config.rs`
- `src-tauri/src/library/thumb.rs` (platform-specific behind cfg)
- `src-tauri/src/main.rs` (UPDATED — register the new commands)
- `ui/web/src/api/library.js` (NEW)
- `ui/web/src/screens/LibraryTab.jsx` (REWRITE)

---

## Sequencing

Foundation → Component → FF wiring → Test. Each phase is verifiable before the next starts.

Phase A is self-contained (just functions, can unit-test scan against a fixture folder). Phase B can use a mocked scan result. Phase C is the integration. Phase D is real-data validation.
