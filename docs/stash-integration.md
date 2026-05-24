# Stash integration — architecture

The `LibraryView` component (forgemoment's shared library surface — used by FunscriptForge, the Player, and any future LQR app that needs a "what's in my collection" view) optionally enriches its cards with metadata from a running [Stash](https://github.com/stashapp/stash) instance.

This doc captures the design before any of it ships. **Nothing here lands in v1.** v1 of the Library is purely standalone — scan, pills, metadata from `.forge/`, no Stash contact. Read-only enrich is the *next pass* after v1 (cheap technically, but worth letting v1 settle first). Bidirectional sync is *post-beta*.

The architecture is documented now because Stash and LQR are **complementary** — Stash is authoritative for *what content the user has* (paths, tags, performers, studio, cover thumbs); LQR is authoritative for *what forge state has been applied* (`.forge/` sidecars, characters, patterns, devices). The two answer different questions, and the integration shape should respect that. Writing it down now keeps us honest about the orthogonality when we come back to wire it.

## The contract

LQR's library is **standalone by default**. Stash is optional. The integration is a *layer of enrichment* over the LQR scan, not a replacement for it.

```
┌──────────────────────────────────────────────────────────┐
│  LibraryView                                              │
│  ─ scans configured roots from ~/.lqr/library.json       │
│  ─ builds cards from filesystem (.forge/ sidecars)       │
│  ─ shows pills + cheap metadata (the spine)              │
└──────────────────────────────────────────────────────────┘
            ↓ optional, only if Stash endpoint configured
┌──────────────────────────────────────────────────────────┐
│  Stash enrich layer                                       │
│  ─ GraphQL query against localhost:9999 (default)        │
│  ─ matches LQR cards to Stash scenes by absolute path    │
│  ─ overlays: tags, performers, studio, cover thumbnail   │
│  ─ NEVER required for the library to function            │
└──────────────────────────────────────────────────────────┘
```

If Stash is not configured, the library is unchanged. If Stash is configured but unreachable, the library logs a warning and falls back to the unenriched view. The user never gets blocked by Stash.

## Integration levels

| Level | What it does | Risk | Where it lands |
|---|---|---|---|
| 1. UX inspiration only | Copy Stash's multi-root + tag patterns; no API contact | None | **v1** — already in the Library brief |
| 2. **Read-only enrich** | GraphQL `findScenes(path:...)` → overlay tags / performers / studio / cover thumb | Low — read only, fall back on error | **Next pass after v1** |
| 3. **Bidirectional with `lqr:*` namespace** | Read as level 2 + write LQR status back as namespaced tags (`lqr:forged`, `lqr:character=reactive`) | Medium — mutating user's Stash DB; needs opt-in flow | **Post-beta** |
| 4. Stash plugin shape | Ship LQR as a Stash plugin; lives inside Stash UI | High — couples LQR UX to Stash's plugin model | Not planned |

## Tag namespace convention

When level 3 ships, every tag LQR writes back to Stash MUST be namespaced `lqr:*`. This keeps the two ecosystems from colliding over the same vocabulary.

Reserved namespace:

| Tag | Meaning |
|---|---|
| `lqr:raw` | Has video, no `.forge/` directory yet |
| `lqr:active` | `.forge/` exists; not user-flagged completed |
| `lqr:completed` | User has flagged the project as done |
| `lqr:forged` | `.feel.yml` exists with non-empty per-chapter character or tone assignments |
| `lqr:has-funscript` | A `.funscript` is present |
| `lqr:has-multiaxis` | Multi-axis funscript variants present |
| `lqr:character=<id>` | Per-chapter character assignment (one tag per distinct character in the project) |
| `lqr:device=<id>` | Project has output for this device class (estim, bhaptics, vibrator, etc.) |

LQR MUST NOT write any tag outside the `lqr:*` namespace, regardless of source. LQR MUST NOT delete or modify tags it didn't create.

## Matching strategy

**File path is the join key.** Stash indexes scenes by absolute path; LQR scans return absolute paths. Match by exact string equality, case-insensitive on Windows.

```
LQR scan card                  Stash scene
─────────────────              ─────────────────
path: /movies/euph2.mp4   ←→   path: /movies/euph2.mp4
```

No content hashing, no fuzzy matching, no user-managed link table. If the paths agree, the records merge in memory at render time. If they don't, the LQR card renders without enrichment.

This works because:
- Both apps are pointed at the user's media folders. Same roots → same paths.
- Stash already maintains a path → scene-id index. The lookup is a single GraphQL query.
- No persistence is needed on the LQR side. Re-match on every scan.

If a user moves files, both Stash and LQR will need to re-scan; the match recovers automatically. No stale link tables to maintain.

## Config schema

The Stash endpoint and credentials live in the same shared LQR config that holds the library roots:

```json
{
  "roots": [
    { "path": "/movies/forge", "label": "Forge projects", "addedAt": "2026-05-24T..." }
  ],
  "stash": {
    "enabled": true,
    "endpoint": "http://localhost:9999/graphql",
    "apiKey": "...",
    "writeback": false
  }
}
```

`stash.enabled` is a master switch. `stash.writeback` opt-in flips on level 3 behavior; defaults to `false` so a user upgrading to a writeback-capable release doesn't have their Stash DB mutated by surprise.

`apiKey` is optional — Stash's default config has no auth. Read from the user's Stash config when possible (the API key lives in Stash's own `config.yml`).

## GraphQL query shape (level 2)

One query per scan batch (not per card — batch the paths):

```graphql
query EnrichLqrCards($paths: [String!]!) {
  findScenes(
    scene_filter: { path: { value: $paths, modifier: INCLUDES } }
  ) {
    scenes {
      id
      files { path }
      title
      cover_path        # local file path Stash cached
      tags { id name }
      performers { id name }
      studio { id name }
      organized
    }
  }
}
```

Returns 0..N scenes. Match each scene's `files[].path` to LQR cards by absolute path. Overlay the metadata.

Failure modes (all degrade gracefully):
- Stash not running → fetch fails → fall back to unenriched view, log once.
- API key wrong → 401 → same fallback, surface a small "Stash auth failed" banner.
- Query times out → same fallback.
- Schema drift (future Stash version changes field names) → log the parse error, fall back.

## Per-app scoping

Not every LQR app integrates with Stash. Where it makes sense:

| App | Stash integration |
|---|---|
| **FunscriptForge — Library tab** | Yes. Editors benefit from seeing performer / studio / tag context when picking what to author against. |
| **Sync Player / FunscriptPlayer — Library tab** | Yes. Players especially benefit — playback UIs commonly want performer / tag filtering. |
| **Beatflo — Source library** | No (initially). Beatflo's source library is music tracks + raw footage; the metadata Stash provides is scene-centric and doesn't map cleanly. Revisit if Beatflo grows a scene-clip-library surface. |
| **Haptic Studio** | Same as FunscriptForge (it's a build variant). |

Per-app scoping is enforced by the consuming app deciding whether to wire `<LibraryView stashEnrich={true} />`. The library component itself just respects the prop.

## Cover thumbnail strategy

LQR's library wants thumbnails. ffmpeg can generate them (~100ms each, cacheable into `.forge/<stem>.forge/thumb.jpg`). Stash already generates and caches scene cover images.

When Stash is matched to an LQR card AND Stash has a cover, use it:

```
priority: Stash cover_path > .forge/<stem>.forge/thumb.jpg > generate via ffmpeg > fallback placeholder
```

This avoids re-doing work Stash has already done, and avoids forking the user's disk space.

## Surface treatment

When a card is matched to a Stash scene, surface it subtly:

- Small Stash logo / icon in a card corner indicating "matched"
- Click the icon → open the scene in Stash (deep-link via `stash://...` URL or web browser to the Stash UI)
- Performer / studio chips render alongside LQR pills (different visual treatment so the source is clear at a glance — e.g., Stash chips have a thin outline tint matching Stash's brand color)
- Stash-sourced tags are filter-able the same way LQR tags are; the filter chip strip distinguishes source

Don't make Stash status loud. Most users who use both apps want them to feel like one tool, not two tools shouting at each other.

## Open questions for when level 3 lands

Defer these until post-beta when bidirectional ships:

1. **What triggers a writeback?** Every status change immediately, or batched on a "publish to Stash" action? Immediate is more honest; batched gives the user a moment to undo. My read: immediate, with an undo affordance.
2. **What about projects LQR has that Stash doesn't?** LQR could optionally `sceneCreate` in Stash so the project shows up there too. That's a heavier integration — discuss when the time comes.
3. **Tag deletion semantics.** If a user un-flags a project as completed in LQR, does the `lqr:completed` tag get removed from Stash? Probably yes — namespaced tags reflect LQR state, not Stash state.
4. **Multi-Stash users.** Some setups have multiple Stash instances. The config schema above is single-endpoint; either add an array or punt.

## Related docs

- `forge-ui-design/REDESIGN_BRIEF_EVENTS.md` — adjacent design pass on Events tab against the cross-device thesis.
- `forge-ui-design/CROSS_DEVICE_PATTERN_THESIS.md` — the cross-device design thesis Stash sits orthogonal to (Stash is about *what content you have*; the thesis is about *how you author across devices*).
- `forge-ui-design/iterations/08-redesign/README.md` — original FunscriptForge pipeline + Library tab framing.
