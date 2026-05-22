// MediaViewer — the master clock viewer for the lqr studio family.
//
// Three display modes share one thumbnail canvas + one transport row.
// Per the 2026-05-10 Unified Viewer spec (project_unified_viewer_baton_master_clock):
//
//   1. **Video**     — video frame / poster at the current playback time
//   2. **Audio**     — waveform around the playhead (precise positioning;
//                      voice transients, silences, screams)
//   3. **Funscript** — funscript curve playing in real time, aligned to
//                      the baton (haptic-intent preview)
//
// The MediaViewer EMITS its current time as a signal — `onTimeChange(ms)`
// fires whenever the playhead moves. Other "batons" (sibling sub-views,
// PluginViews, external apps, network sessions) subscribe to that signal
// and stay in lock-step. The Viewer is single-source for time across the
// app; never maintain a parallel clock.
//
// Ported from forge-ui-design/iterations/08-redesign/design_files/MediaViewer.jsx,
// extended with the 3-mode toggle, the master-clock callback, and data-
// pluggable visualizations (videoSrc / audioWaveform / funscript). When
// the data props aren't supplied, each mode renders the iter 08
// placeholder so the component is usable bare for layout work.
//
// Props (alphabetical):
//   audioWaveform     {peaks: number[], durationMs: number}  optional
//   spectrogram       {cells: Uint8Array, nMels, nFrames,    optional
//                      hopMs, durationMs, dbFloor, dbCeiling}
//                       Pre-computed mel spectrogram from
//                       videoflow.audio_spectrogram. Cells are uint8
//                       (0..255) time-major: cells[t * nMels + bin].
//                       SpectrogramCanvas reads its own 12s window
//                       around currentMs — no chapter-scope slicing
//                       needed from the consumer.
//   beats             {bpm, beatsMs: number[], downbeatsMs: ...}  optional
//                       Pre-computed beat times from
//                       videoflow.audio_beats. AudioDashboard reads
//                       `bpm` to surface the music tempo; the visible
//                       beat-tick overlay on the waveform was removed
//                       2026-05-22 — beat editing is forgegen / Beatflo
//                       territory, the Chapters tab doesn't need it.
//   chapter           {id, title, color, start, end}         optional
//                       When set, the baton position is computed
//                       relative to chapter.start/end instead of
//                       absolute totalMs. Matches iter 08 behaviour.
//   currentMs         number                                  playhead in ms
//   funscript         {actions: [{at: ms, pos: 0-100}]}      optional
//   height            number (px)                             optional
//   isPlaying         boolean                                 default false
//   media             {kind: 'video'|'audio', title?: string} default video
//                       Used for the corner label only — the mode
//                       toggle takes precedence for what renders.
//   mode              'video' | 'audio' | 'funscript'         optional
//                       Controlled mode. If absent, the Viewer
//                       manages its own mode state initialised to
//                       `defaultMode`.
//   defaultMode       same                                    default 'video'
//   markLabel         string                                  default 'Chapter'
//                       Label shown on the +<label> button. The button
//                       is a generic integration point; consumers
//                       co-opt it to mean whatever fits their app —
//                       "Chapter", "Beat", "Cue", "Note", "Event", etc.
//                       Just renames the button; the meaning is in the
//                       onMark callback the consumer wires.
//   nextTitle         string                                  optional
//   onMark            (ms) => void                            optional
//                       Fires when the +<markLabel> button is pressed,
//                       with the current playhead position in ms. The
//                       consumer decides what to do with it (create a
//                       chapter, drop a marker on a script, fire an
//                       event, etc.).
//   onModeChange      (mode) => void                          optional
//                       Fires when the user toggles modes. If
//                       `mode` is controlled, the parent must
//                       reflect this back into the prop.
//   onNext            () => void                              optional
//   onPlayPause       () => void                              optional
//   onPrev            () => void                              optional
//   onSeek            (ms) => void                            optional
//   onTimeChange      (ms) => void                            optional
//                       Master clock signal. Fires whenever
//                       currentMs changes. Subscribers follow.
//   prevTitle         string                                  optional
//   showMark          boolean                                 default true
//                       Hide the +<markLabel> button entirely if the
//                       consuming app doesn't want a marking action.
//   showModeToggle    boolean                                 default true
//                       Hide the mode chip strip if the
//                       consuming app pins to a single mode.
//   totalMs           number                                  optional
//                       Falls back to chapter.end - chapter.start
//                       when chapter is set; otherwise required to
//                       compute baton position outside a chapter.
//   videoSrc          string                                  optional
//                       URL of the actual video to render. When
//                       absent, the iter 08 stylised poster
//                       renders instead. NOTE: native <video>
//                       integration is intentionally simple here
//                       — for frame-accurate seek the consumer
//                       wires its own <video ref> and feeds
//                       currentMs back.
//   width             number (px)                             default 240

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Segmented } from './primitives.jsx';
import { Sparkline } from './Charts.jsx';

// Haptic mode removed 2026-05-19 — placeholder-only, no real signal to
// show. Funscript mode covers the "what's about to fire on the device"
// preview the user actually wants; haptic was visual noise next to it.
//
// Spectrogram (2026-05-21) — second audio visualization. Where Audio
// (peak envelope) shows "loud vs quiet", Spectro shows "what's in this
// audio" (bass band, vocal band, percussive vs sustained). Particularly
// valuable for Chapters-tab split-finding workflows; see
// SpectrogramCanvas below for the canvas2D + magma LUT renderer.
const MODE_OPTIONS = [
  { value: 'video',       label: 'Video' },
  { value: 'audio',       label: 'Audio' },
  { value: 'spectrogram', label: 'Spectro' },
  { value: 'funscript',   label: 'Funscript' },
];

// Magma-inspired warm-on-dark gradient. Control points sampled along
// matplotlib's magma colormap and linearly interpolated into a 256-entry
// LUT, built once at module load. Each LUT entry is 4 bytes (RGBA);
// SpectrogramCanvas indexes by the quantized cell byte and copies the
// triple straight into an ImageData buffer — no float math at paint time.
//
// Why magma: warm-on-dark reads well on a black thumbnail background,
// preserves perceptual ordering (brightness = energy), and matches the
// matplotlib reference renders committed under
// funscriptforge/test_funscript/*.spectrogram.png — so the static
// reference PNGs and the in-app canvas tell a consistent visual story.
const MAGMA_STOPS = [
  // [t, r, g, b]
  [0.00,   0,   0,   4],  // near-black with a hint of blue
  [0.18,  35,  18,  90],  // deep purple
  [0.36,  92,  20, 120],  // wine
  [0.54, 175,  47, 100],  // magenta-red
  [0.72, 250, 110,  70],  // orange-red
  [0.86, 252, 175,  85],  // amber
  [1.00, 252, 253, 191],  // near-white, warm yellow
];

const MAGMA_LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let lo = 0;
    while (lo < MAGMA_STOPS.length - 1 && MAGMA_STOPS[lo + 1][0] < t) lo += 1;
    const a = MAGMA_STOPS[lo];
    const b = MAGMA_STOPS[Math.min(lo + 1, MAGMA_STOPS.length - 1)];
    const span = (b[0] - a[0]) || 1;
    const f = (t - a[0]) / span;
    lut[i * 4 + 0] = a[1] + (b[1] - a[1]) * f;
    lut[i * 4 + 1] = a[2] + (b[2] - a[2]) * f;
    lut[i * 4 + 2] = a[3] + (b[3] - a[3]) * f;
    lut[i * 4 + 3] = 255;
  }
  return lut;
})();

export function MediaViewer({
  audioWaveform,
  spectrogram,
  beats,
  chapter,
  currentMs = 0,
  defaultMode = 'video',
  funscript,
  height,
  isPlaying = false,
  markLabel = 'Chapter',
  media = { kind: 'video', title: 'preview' },
  mode: modeProp,
  nextTitle = 'Next chapter',
  onMark,
  onModeChange,
  onNext,
  onPlayPause,
  onPrev,
  onSeek,
  onTimeChange,
  prevTitle = 'Previous chapter',
  showMark = true,
  showModeToggle = true,
  // Mode-toggle layout knobs. Used by the FunscriptForge Chapters tab to
  // place the toggle quietly in the top-left of the viewer (instead of the
  // default centered chip strip) and shrink it so the active mode reads
  // as ambient context rather than UI chrome.
  modeToggleAlign = 'center',  // 'start' | 'center' | 'end'
  modeToggleSize = 'default',  // 'default' | 'sm'
  // Hide the corner "VIDEO" / "AUDIO" / "FUNSCRIPT" mode label. Redundant
  // with the visible toggle in most contexts; the Chapters tab opts it out.
  showModeLabel = true,
  // Thumbnail aspect ratio. When set (CSS aspect-ratio value like '16/9'),
  // the thumbnail area uses `aspect-ratio` instead of flex-fill — total
  // viewer height becomes chrome + thumbnail-by-aspect. Default null
  // keeps the legacy flex:1 behaviour so existing callers (which pin
  // `height` and let the thumbnail grow into the leftover) aren't
  // affected. With `objectFit: contain` on the video, the whole frame
  // is always visible inside the aspect-shaped box; any leftover space
  // letterboxes against the surface background.
  thumbnailAspect = null,
  // Transport controls — declared list rendered in order. Each entry is one
  // of: 'prev' | 'frame-back' | 'back5' | 'play' | 'forward5' |
  // 'frame-forward' | 'next'. The play button is always rendered with the
  // primary (circular accent) treatment. Consumers pick whichever set fits
  // the editing scope:
  //   Chapters tab:   ['prev','back5','play','forward5','next']
  //   Edit/Phrases:   ['prev','frame-back','back5','play','forward5','frame-forward','next']
  //   Library scrub:  ['back5','play','forward5']
  controls = ['prev', 'frame-back', 'back5', 'play', 'forward5', 'frame-forward', 'next'],
  // Show a centered HH:MM:SS.mmm timecode readout below the media surface.
  // Updates from `currentMs` so it ticks at whatever rate the consumer drives
  // playback. Millisecond precision is intentional for frame-accurate edits.
  showTimecode = true,
  totalMs,
  videoSrc,
  // External "loading" hint — when set, an overlay is shown with this
  // text. Used by ChaptersTab to surface the chapter byte-range pre-
  // warm ("Loading chapter…") that primes the kernel page cache before
  // playback. Distinct from internal `isBuffering` (mid-playback decode
  // stalls) — when both fire, the explicit label wins.
  loadingLabel = null,
  // When `videoSrc` is a chapter-extracted temp clip (rather than the
  // original full-length media), this offset says what original-ms
  // position the clip's internal time 0 corresponds to. The consumer
  // continues to think in original-ms throughout (currentMs / onSeek /
  // onTimeChange are all original-ms); MediaViewer translates to
  // clip-relative video.currentTime internally. Default 0 = original
  // media (no offset).
  videoSrcOffsetMs = 0,
  width = 240,
  // Back-compat aliases. Older callers may pass onCreateChapter /
  // showCreateChapter; we accept them transparently. Drop after the
  // first consumer migration is complete (probably v0.1).
  onCreateChapter,
  showCreateChapter,
  // Older callers also used onPrevChapter / onNextChapter for the
  // chapter-nav buttons.
  onPrevChapter,
  onNextChapter,
}) {
  // Resolve back-compat aliases. onMark wins if both are set; otherwise
  // fall back to the legacy name. Same for showMark / showCreateChapter.
  const onMarkResolved = onMark ?? onCreateChapter;
  const showMarkResolved = showCreateChapter ?? showMark;
  // Mode state — controlled when `mode` prop is supplied, uncontrolled
  // otherwise. Either way we expose `onModeChange` so a controlled
  // consumer can intercept and an uncontrolled consumer can observe.
  const [internalMode, setInternalMode] = useState(defaultMode);
  const mode = modeProp ?? internalMode;
  const handleModeChange = (next) => {
    if (modeProp === undefined) setInternalMode(next);
    onModeChange?.(next);
  };

  // Master clock — emit on every currentMs change so subscribers stay
  // in sync. This is THE contract that makes MediaViewer the time-
  // backbone of the toolchain.
  useEffect(() => {
    onTimeChange?.(currentMs);
  }, [currentMs, onTimeChange]);

  // ── Video element wiring ────────────────────────────────────────
  // The <video> element is rendered with just a src by default; without
  // ref-based control it plays nothing. These effects bind the element
  // to the consumer's props so the viewer's chrome (play button, baton,
  // scrub, mode toggle, transport) drives real playback.
  const videoRef = useRef(null);
  // Mirror `isPlaying` into a ref so deferred-play handlers (below) can
  // read the *current* user intent without re-subscribing every render.
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  // `pendingPlayRef` is set whenever we *wanted* to play but couldn't
  // yet (readyState too low after a cold seek, or a `waiting` stall
  // mid-playback). The buffer-readiness handler picks this up and
  // promotes it to an actual v.play() once the decoder has enough data.
  // Single flag handles both the "user clicks play right after seek"
  // and "playback stalled" cases — they both reduce to "user intends
  // to play, video isn't ready yet, resume when it is."
  const pendingPlayRef = useRef(false);
  // Visible state: are we waiting on the decoder/disk to catch up? Set
  // when `waiting` fires (mid-playback stall) or when play() is deferred
  // for buffer reasons. Cleared once tryResume actually starts playback.
  // Surfaces as a small "Buffering…" overlay so long-file users (90min+
  // / 18GB files) can tell the difference between a stutter (frame drops
  // while playback continues) and a buffer pause (we paused to wait for
  // disk I/O). Without this UI both presented identically.
  const [isBuffering, setIsBuffering] = useState(false);

  // Play / pause sync. video.play() returns a Promise that rejects on
  // autoplay block, codec failure, decode error, etc. We log the
  // rejection rather than swallow it — silent rejection is what made
  // "no sound" hard to diagnose during the first dogfood pass
  // (2026-05-19).
  //
  // Buffer gate (2026-05-20): on big high-bitrate sources (the user's
  // 18GB Angel Anjelica file, etc.) a chapter jump lands in a cold
  // buffer region. Calling v.play() immediately makes Chromium push
  // partial frames before the decoder catches up, producing the choppy
  // first few seconds the user flagged. So we only call play() when
  // readyState is HAVE_ENOUGH_DATA (4). If it isn't, we mark
  // `pendingPlayRef` and let the buffer-readiness handler below promote
  // the deferred intent to a real play() once data is ready. Pause is
  // synchronous and always honoured immediately.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoSrc) return;
    if (isPlaying) {
      if (v.readyState >= 4 /* HAVE_ENOUGH_DATA */) {
        pendingPlayRef.current = false;
        setIsBuffering(false);
        const p = v.play();
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            console.warn('MediaViewer: video.play() rejected', err?.name, err?.message);
          });
        }
      } else {
        // Defer — the buffer-readiness handler below will pick this up.
        pendingPlayRef.current = true;
        setIsBuffering(true);
      }
    } else {
      pendingPlayRef.current = false;
      setIsBuffering(false);
      v.pause();
    }
  }, [isPlaying, videoSrc]);

  // Seek sync. When currentMs drifts from the video's clock by more
  // than the SEEK_TOLERANCE_MS threshold, snap the video to match.
  // Threshold matters: timeupdate fires at ~4 Hz on Chromium with
  // perceptible jitter, and assigning video.currentTime triggers a
  // seek that itself fires timeupdate — without a tolerance we get a
  // feedback loop where every consumer setCurrentMs call snaps the
  // video, which fires timeupdate, which re-runs the consumer's
  // setCurrentMs, etc. 80ms is comfortably above the jitter and below
  // perceptible drift.
  const SEEK_TOLERANCE_MS = 80;
  // Tracks the last currentMs value WE emitted via the timeupdate
  // handler. Used by the seek-sync effect to distinguish an external
  // seek (chapter switch, scrub) from an echo of our own emit
  // bouncing back through the consumer. Without this gate, the
  // throttle-induced lag between v.currentTime (live) and the parent's
  // currentMs prop (stale by ~one throttle interval) tricks the drift
  // check into seeking backward on every render — observed 2026-05-22
  // as a 5Hz waiting/resume ping-pong producing the choppy playback
  // the user flagged on chapters 3/7. The video's clock is master
  // while playing; our own emits don't justify a re-seek.
  const lastEmittedMsRef = useRef(0);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoSrc) return;
    // Ignore echoes of our own timeupdate emit. Tolerance covers one
    // throttle interval (250ms) plus React/render latency; anything
    // bigger is genuinely an external seek the consumer requested.
    const echoMs = Math.abs((currentMs ?? 0) - lastEmittedMsRef.current);
    if (echoMs < 400) return;
    // currentMs is in the original-media timeline. Subtract the offset
    // to get clip-relative seconds — when the src is the full file,
    // offset is 0 so this is a no-op. When the src is a chapter clip,
    // offset shifts the timeline so clip second 0 = chapter.atMs.
    const clipMs = (currentMs ?? 0) - (videoSrcOffsetMs || 0);
    const targetSec = Math.max(0, clipMs) / 1000;
    if (Number.isNaN(targetSec)) return;
    const driftMs = Math.abs(v.currentTime * 1000 - clipMs);
    if (driftMs > SEEK_TOLERANCE_MS) {
      try { v.currentTime = targetSec; } catch { /* readyState gate not met */ }
    }
  }, [currentMs, videoSrc, videoSrcOffsetMs]);

  // Time-update emitter. The <video> drives the master clock when it's
  // playing — onTimeChange fires per video frame (Chromium delivers
  // ~4-5 Hz, which is good enough for the baton). This is the inverse
  // of the seek-sync effect: the video is the source of truth while
  // playing; the consumer is the source of truth while seeking. The
  // tolerance gate above prevents the two from fighting each other.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    // Throttle the consumer-facing timeupdate emitter to 10Hz. The
    // diagnostic with the emitter disabled (2026-05-21) proved that
    // the React re-render cascade triggered by setCurrentMs on every
    // video frame was starving Chromium's video decoder, causing the
    // long-file stutter. Chromium fires `timeupdate` at ~4-5Hz when
    // playing but can burst higher on certain transitions; the
    // throttle caps the cost regardless of source rate.
    // Baton / timecode / funscript-tape updates at 10Hz look smooth;
    // the underlying video plays at its native frame rate.
    // 250ms / 4Hz cap. Tried 100ms (10Hz) after gating AudioDashboard
    // by mode but the user reported stop-motion playback + buffering
    // cycling on Euphoria 2026-05-22. 4Hz is the compromise: baton
    // still moves faster than the previous 2Hz (500ms) without the
    // 10Hz render pressure. If 4Hz still stutters the cause isn't
    // the throttle; check Console for `<video> error` codes.
    // Architectural rule for every LQR app using React + HTML5 video:
    // never let `timeupdate` drive React renders unthrottled.
    const THROTTLE_MS = 250;
    let lastEmit = 0;
    const handler = () => {
      const now = performance.now();
      if (now - lastEmit < THROTTLE_MS) return;
      lastEmit = now;
      // Re-add the chapter-clip offset before reporting back to the
      // consumer so currentMs stays in the original-media timeline.
      const emitted = v.currentTime * 1000 + (videoSrcOffsetMs || 0);
      // Record what we emit so the seek-sync effect can ignore the
      // echo when the consumer re-renders us with this value.
      lastEmittedMsRef.current = emitted;
      onTimeChange?.(emitted);
    };
    v.addEventListener('timeupdate', handler);
    return () => v.removeEventListener('timeupdate', handler);
  }, [onTimeChange, videoSrcOffsetMs]);

  // Buffer-pause + deferred-play promoter. Two paths into the same
  // resume logic:
  //
  //   (a) Mid-playback stall: video fires `waiting` when the decoder
  //       runs out of buffered data. Chromium would otherwise try to
  //       resume the instant new bytes arrive, producing the burpy
  //       "almost playing" frames the user flagged on long videos.
  //       We catch `waiting`, explicitly pause, and set pendingPlayRef
  //       so the readiness handler resumes when there's *real* data.
  //
  //   (b) Cold-seek into a new region: the user clicks a chapter band
  //       (or presses play after a seek). The play/pause effect above
  //       sees readyState < HAVE_ENOUGH_DATA, doesn't call v.play(),
  //       sets pendingPlayRef. The readiness handler picks it up.
  //
  // Both paths gate on `readyState >= HAVE_ENOUGH_DATA` (4) — *not*
  // `canplay`'s readyState 3 (HAVE_FUTURE_DATA). On big high-bitrate
  // sources (Angel Anjelica 18GB), Chromium reports HAVE_FUTURE_DATA
  // with just a frame or two of decoded buffer, and resuming there is
  // exactly what made playback choppy. canplaythrough fires when the
  // browser estimates it can play through without stalling — for cold
  // seeks on local files that's usually a couple seconds of decoded
  // headroom, which is what we want. We listen on `canplay`,
  // `canplaythrough`, and `playing` (catch-all for "decoder is alive")
  // but every handler checks readyState before resuming.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoSrc) return undefined;
    const onWaiting = () => {
      pendingPlayRef.current = true;
      setIsBuffering(true);
      if (!v.paused) {
        try { v.pause(); } catch { /* swallow */ }
      }
    };
    const tryResume = () => {
      if (!pendingPlayRef.current) return;
      // The crucial readyState gate. Don't resume until there's enough
      // decoded buffer for smooth playback — anything less produces the
      // choppy partial-frame playback the user saw on chapter jumps.
      if (v.readyState < 4 /* HAVE_ENOUGH_DATA */) return;
      if (!isPlayingRef.current) {
        // User changed their mind while we were buffering — drop intent.
        pendingPlayRef.current = false;
        setIsBuffering(false);
        return;
      }
      pendingPlayRef.current = false;
      setIsBuffering(false);
      if (v.paused) {
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => { /* swallow */ });
      }
    };
    // Video element error / source-load failure surfaces here. The
    // mediaError carries an MediaError object whose .code maps to:
    //   1 = MEDIA_ERR_ABORTED, 2 = NETWORK, 3 = DECODE, 4 = SRC_NOT_SUPPORTED.
    // For chapter clips: code 4 means the asset:// URL didn't resolve
    // (file path / protocol scope), code 3 means ffmpeg produced a
    // file Chromium can't decode.
    const onError = () => {
      const err = v.error;
      // Log message + src as separate console args so DevTools shows the
      // full strings (object-nested props get truncated at ~80 chars).
      // Chromium's PIPELINE_ERROR_DECODE includes diagnostic context
      // ("Failed to send buffer", first-packet metadata, etc.) that we
      // need verbatim to root-cause the failure.
      console.warn(
        'MediaViewer: <video> error code:', err?.code,
        '\nmessage:', err?.message,
        '\nsrc:', v.currentSrc || v.src,
      );
    };
    v.addEventListener('error', onError);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('canplay', tryResume);
    v.addEventListener('canplaythrough', tryResume);
    v.addEventListener('playing', tryResume);
    v.addEventListener('loadeddata', tryResume);

    // Buffer watchdog. Chromium / WebView2 silently drops frames on
    // long high-bitrate files (18GB Angel Anjelica, 90min Victoria
    // Oaks): the decoder stays just above the "empty" threshold so
    // `waiting` never fires, but disk I/O can't feed the decoder fast
    // enough so frames get skipped. The user sees stutter; the official
    // event API tells us nothing. So poll `v.buffered` ourselves — if
    // the forward buffer at the playhead drops below FORWARD_THRESHOLD
    // seconds, treat it as buffering and pause until we have
    // RESUME_THRESHOLD seconds of headroom.
    //
    // Threshold tuning: small gap avoids flicker; small absolute number
    // avoids "frozen on buffering" when the buffer can't climb high
    // enough fast enough. 1.5s pause / 5s resume = ~3.5s of buffer
    // headroom when we resume, enough for ~3s of play before the
    // watchdog fires again. Visible cycle but playback actually
    // progresses, which is the floor we couldn't get below with
    // larger thresholds on the user's 18GB / 90min files.
    // Skip the watchdog entirely for blob: sources. Blob URLs read
    // from JS-heap memory — there's no disk I/O bottleneck the
    // watchdog could correct, only decoder pace. The watchdog
    // interpreted decoder pace as buffer starvation, paused, decode
    // caught up during the pause, watchdog resumed, repeat every
    // 200ms — the watchdog itself was producing the visible flicker
    // on blob-backed chapter clips. Trust Chromium when bytes are
    // already in RAM.
    const isBlobSrc = typeof videoSrc === 'string' && videoSrc.startsWith('blob:');
    const FORWARD_THRESHOLD = 1.5;
    const RESUME_THRESHOLD = 5.0;
    const watchdog = isBlobSrc ? null : setInterval(() => {
      if (!v || v.ended) return;
      let forward = 0;
      for (let i = 0; i < v.buffered.length; i += 1) {
        const start = v.buffered.start(i);
        const end = v.buffered.end(i);
        if (start <= v.currentTime + 0.05 && v.currentTime <= end + 0.05) {
          forward = end - v.currentTime;
          break;
        }
      }
      if (!v.paused && forward < FORWARD_THRESHOLD) {
        // Forward buffer is too thin to sustain smooth playback.
        // Pause and mark as buffering; resume gate above will pick
        // it up when readyState climbs back to HAVE_ENOUGH_DATA.
        pendingPlayRef.current = true;
        setIsBuffering(true);
        try { v.pause(); } catch { /* swallow */ }
      } else if (v.paused && pendingPlayRef.current && forward >= RESUME_THRESHOLD) {
        // Forward buffer recovered. Resume via the normal tryResume
        // path so all the readiness gates fire consistently.
        tryResume();
      }
    }, 200);

    return () => {
      if (watchdog !== null) clearInterval(watchdog);
      v.removeEventListener('error', onError);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('canplay', tryResume);
      v.removeEventListener('canplaythrough', tryResume);
      v.removeEventListener('playing', tryResume);
      v.removeEventListener('loadeddata', tryResume);
    };
  }, [videoSrc]);

  // Back-compat: callers may still pass onPrevChapter/onNextChapter.
  const prev = onPrev ?? onPrevChapter;
  const next = onNext ?? onNextChapter;

  // Position the baton inside the thumbnail. When a chapter is set,
  // it's chapter-relative (the viewer renders the chapter's slice).
  // Otherwise it's absolute against totalMs.
  const batonRange = chapter
    ? { start: chapter.start, end: chapter.end }
    : { start: 0, end: totalMs ?? 1 };
  const batonDur = Math.max(1, batonRange.end - batonRange.start);
  const rawBatonPos = (currentMs - batonRange.start) / batonDur;
  const batonPos = Math.min(1, Math.max(0, rawBatonPos));
  // Out-of-scope: playhead is outside the chapter range. We still draw
  // the baton (clamped to the edge) but faded and with a direction
  // arrow at the matching edge, so the user reads "playhead is past
  // the chapter end →" instead of "the baton broke." This was a real
  // dogfood confusion 2026-05-14.
  const outOfScope = chapter && (rawBatonPos < 0 || rawBatonPos > 1);
  const outDirection = rawBatonPos > 1 ? 'after' : rawBatonPos < 0 ? 'before' : null;

  const stepFrame = (dir) => {
    // Frame jog is for precise inspection — pause first if playing so
    // the playhead doesn't blow past the new position on the next
    // frame. Back-5s and chapter-nav stay playing (matches YouTube /
    // generic player conventions). Fix triggered by user observation
    // 2026-05-14: "frame-forward looked broken because playback
    // continued past the new position."
    if (isPlaying) onPlayPause?.();
    // ~30 fps step (33ms). Frame jog is consumer-tunable via onSeek.
    onSeek?.((currentMs || 0) + dir * 33);
  };
  const back5 = () => onSeek?.(Math.max(0, (currentMs || 0) - 5000));
  // Forward 5s symmetric with back5. When totalMs is known clamp to it,
  // otherwise just step forward — the parent decides what to do with an
  // overshoot (typically clamp into chapter.end / track length).
  const forward5 = () => {
    const cap = chapter ? chapter.end : (totalMs ?? Number.POSITIVE_INFINITY);
    onSeek?.(Math.min(cap, (currentMs || 0) + 5000));
  };

  // Absorb wheel events so they don't fall through to the surrounding
  // page scroll. User flagged 2026-05-20 that wheeling over the viewer
  // scrolls the editor's outer page instead of doing nothing — the
  // viewer is a media surface, not a scroll target. No zoom action
  // here; just block the bubble. (The chart panels under the viewer
  // own their own wheel-zoom; this is only for the media surface.)
  const handleWheelAbsorb = (e) => { e.preventDefault(); };

  return (
    <div
      onWheel={handleWheelAbsorb}
      style={{
      width, height, flexShrink: 0,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Mode toggle — chip strip pinned above the thumbnail. Pinning
          above rather than overlaying keeps the canvas content clean
          and gives the toggle a stable hit target regardless of mode.
          Alignment + size are consumer-tuned (chapter-scoped viewers
          prefer flex-start / sm so the toggle reads as quiet context). */}
      {showModeToggle && (
        <div style={{
          padding: modeToggleSize === 'sm' ? '4px 6px' : '6px 8px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent:
            modeToggleAlign === 'start' ? 'flex-start'
            : modeToggleAlign === 'end' ? 'flex-end'
            : 'center',
        }}>
          <Segmented
            options={MODE_OPTIONS}
            value={mode}
            onChange={handleModeChange}
            size={modeToggleSize}
          />
        </div>
      )}

      {/* Thumbnail — one of three modes renders inside. Baton overlays
          all three. Corner labels stay the same so the user always
          knows what they're looking at.
          When `thumbnailAspect` is set the box is aspect-shaped (height
          derives from width). Otherwise the legacy flex:1 fill behaviour
          applies — caller pins the total viewer height and the
          thumbnail grows into the leftover. */}
      <div style={{
        ...(thumbnailAspect
          ? { aspectRatio: thumbnailAspect, flex: '0 0 auto' }
          : { flex: 1, minHeight: 0 }),
        background: '#000',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Video element — mounted whenever videoSrc is set, regardless
            of mode. Visibility is mode-controlled (hide when mode !==
            'video') but the element stays in the DOM so its audio
            decoder keeps running. Unmounting on mode change would kill
            audio playback during Audio/Funscript views, which is the
            opposite of what those modes are for (Audio mode shows the
            waveform *while you listen*; Funscript mode shows the curve
            *while audio plays the beat*). The element acts as the
            master audio source across all modes. */}
        {videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            // Intentionally unmuted — this is an authoring tool, the
            // user wants to hear the audio to align the funscript
            // against beats and vocals. Autoplay restrictions don't
            // bite because play() is triggered by the user clicking
            // the transport (user activation flows through to the
            // effect that calls v.play()).
            playsInline
            preload="auto"
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              // `contain` shows the whole video frame and letterboxes
              // against the (black) box background. `cover` cropped
              // top/bottom or sides depending on the box aspect — the
              // user couldn't always see the whole video, especially
              // when the viewer box was wider than the source.
              objectFit: 'contain',
              display: mode === 'video' ? 'block' : 'none',
            }}
          />
        )}
        {mode === 'video' && !videoSrc && <VideoPoster title={media.title} />}
        {mode === 'audio' && (
          audioWaveform
            ? <WaveformCanvas
                waveform={audioWaveform}
                spectrogram={spectrogram}
                currentMs={currentMs}
              />
            : <AudioWavePlaceholder />
        )}
        {mode === 'spectrogram' && (
          spectrogram && spectrogram.cells && spectrogram.cells.length > 0
            ? <SpectrogramCanvas
                spectrogram={spectrogram}
                currentMs={currentMs}
              />
            : <SpectrogramPlaceholder />
        )}
        {mode === 'funscript' && (
          funscript
            ? <FunscriptBeatWindow
                actions={funscript.actions}
                currentMs={currentMs}
                batonRange={batonRange}
              />
            : <FunscriptPlaceholder />
        )}

        {/* Baton — the playhead. Hidden in video mode: the frame
            itself IS the playhead, so a baton over it is redundant
            chrome (and adds a sync surface that has to keep up with
            playback). For audio (waveform) and funscript (curve)
            modes the underlying art is static, so a moving baton
            earns its keep.
            `transform: translateX(-50%)` centers the 1.5px line on
            its position so the baton stays visible at both edges
            (without this, batonPos=1 puts the line's left edge at
            the container's right edge and the whole 1.5px gets
            clipped by overflow:hidden — looked like "disappeared").
            When out of scope (playhead past chapter.end or before
            chapter.start), draw faded so the user reads "playhead is
            outside this chapter" not "the baton broke". The arrow
            chip below makes the direction explicit. */}
        {/* Per-mode batons now live INSIDE each canvas component
            (WaveformCanvas, SpectrogramCanvas, FunscriptBeatWindow). All
            three use the same window-relative positioning model since
            they all scroll a 12s window around currentMs. Video mode
            uses the frame itself as the playhead (no baton). The old
            chapter-relative outer audio baton + out-of-scope chip were
            retired 2026-05-21 when WaveformCanvas moved to absolute-
            window canvas2D and stopped needing the parent's batonPos. */}

        {/* Loading / buffering indicator. Two sources:
            - `loadingLabel` (external) — e.g. ChaptersTab pre-warming
              the chapter's byte range in the kernel page cache.
            - `isBuffering` (internal) — mid-playback decoder stall
              caught by the buffer watchdog.
            External label wins when both fire; otherwise the generic
            "Buffering…" text covers the mid-play case. */}
        {(loadingLabel || isBuffering) && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '6px 12px',
            borderRadius: 14,
            background: 'rgba(0,0,0,0.65)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: 'rgba(255,255,255,0.92)',
            fontSize: 11, fontWeight: 500, letterSpacing: '0.04em',
            pointerEvents: 'none', zIndex: 8,
          }}>
            {loadingLabel || 'Buffering…'}
          </div>
        )}

        {/* Corner mode label — redundant with the toggle but useful
            when the toggle is hidden via showModeToggle=false. Opt out
            via showModeLabel=false in places where both are shown. */}
        {showModeLabel && (
          <div style={{
            position: 'absolute', top: 6, left: 8,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase',
          }}>
            {mode}
          </div>
        )}

        {chapter && (
          <div style={{
            position: 'absolute', bottom: 6, left: 8, right: 8,
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 9.5, color: 'rgba(255,255,255,0.8)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: chapter.color }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chapter.title}
            </span>
          </div>
        )}
      </div>

      {/* Audio dashboard — live "what is this audio right now" readout.
          Renders only in Audio + Spectro modes (where the user is
          already studying audio). In Video / Funscript modes the
          per-render energy/centroid walk is cost we don't need — the
          dashboard's React work at every timeupdate was confirmed
          2026-05-21 to starve Chromium's video decoder on long files
          (90min+ / 18GB sources). Gating by mode keeps the dashboard
          for the modes where it earns its keep, zero cost otherwise. */}
      {(mode === 'audio' || mode === 'spectrogram') && (
        <AudioDashboard
          audioWaveform={audioWaveform}
          spectrogram={spectrogram}
          beats={beats}
          currentMs={currentMs}
        />
      )}

      {/* Prominent centered timecode — HH:MM:SS.mmm. Drives off `currentMs`,
          so it ticks at whatever rate the consumer drives playback. The
          older split start/end readout has been retired: the chapter strip
          adjacent to the player now carries that context. Pass
          `showTimecode={false}` to opt out. */}
      {showTimecode && (
        <div className="mono" style={{
          padding: '6px 10px', fontSize: 15,
          color: 'var(--text)', letterSpacing: '0.02em',
          borderTop: '1px solid var(--border)',
          textAlign: 'center', fontVariantNumeric: 'tabular-nums',
        }}>
          {fmtHHMMSSmmm(currentMs)}
        </div>
      )}

      {/* Transport — chapter nav + frame jog + play/pause.
          Icon choices on the frame-jog (◀/▶ → step-back/step-forward):
          ◀ and ▶ next to ⏪ (back 5s) and ⏭ (next chapter) read as
          "back" + "fast-back" / "forward" + "fast-forward". The lucide
          step-back/step-forward glyphs (triangle + vertical bar) read
          unambiguously as single-frame step. Validated via user
          feedback 2026-05-14. */}
      <div style={{
        padding: '6px 8px', display: 'flex', gap: 4, justifyContent: 'center',
        borderTop: '1px solid var(--border)',
      }}>
        {controls.map((kind, i) => {
          switch (kind) {
            case 'prev':
              return <TransportButton key={i} title={prevTitle} onClick={prev}>⏮</TransportButton>;
            case 'frame-back':
              return (
                <TransportButton key={i} title="Frame back" onClick={() => stepFrame(-1)}>
                  <Icon name="step-back" size={14} />
                </TransportButton>
              );
            case 'back5':
              return <TransportButton key={i} title="Back 5s" onClick={back5}>⏪</TransportButton>;
            case 'play':
              return (
                <TransportButton key={i} primary
                                 title={isPlaying ? 'Pause' : 'Play'}
                                 onClick={onPlayPause}>
                  {isPlaying ? '⏸' : '▶'}
                </TransportButton>
              );
            case 'forward5':
              return <TransportButton key={i} title="Forward 5s" onClick={forward5}>⏩</TransportButton>;
            case 'frame-forward':
              return (
                <TransportButton key={i} title="Frame forward" onClick={() => stepFrame(1)}>
                  <Icon name="step-forward" size={14} />
                </TransportButton>
              );
            case 'next':
              return <TransportButton key={i} title={nextTitle} onClick={next}>⏭</TransportButton>;
            default:
              return null;
          }
        })}
      </div>

      {showMarkResolved && (
        <div style={{
          padding: '0 8px 8px', display: 'flex', gap: 4, justifyContent: 'center',
        }}>
          <button
            onClick={() => onMarkResolved?.(currentMs)}
            title={`Mark ${markLabel.toLowerCase()} at playhead`}
            style={{
              padding: '0 8px', height: 22,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              cursor: 'pointer', fontSize: 10.5,
              borderRadius: 6,
              fontFamily: 'inherit',
            }}
          >
            ➕ {markLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Transport button — small square / pill ──────────────────────
function TransportButton({ children, primary, ...rest }) {
  const base = {
    width: 26, height: 26, borderRadius: 6,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    cursor: 'pointer', fontSize: 13,
    display: 'grid', placeItems: 'center',
    fontFamily: 'inherit', padding: 0,
  };
  const primaryStyles = primary ? {
    width: 32, height: 32, borderRadius: 16,
    background: 'var(--accent)', borderColor: 'transparent',
    color: '#fff', fontSize: 14,
  } : {};
  return (
    <button {...rest} style={{ ...base, ...primaryStyles }}>
      {children}
    </button>
  );
}

// ─── Mode placeholders (iter 08 art) ─────────────────────────────
// These render when the consumer hasn't passed data for a mode yet.
// Each one is intentionally low-key so the absence of real data is
// obvious without being noisy.
function VideoPoster({ title }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <pattern id="stripes" width="6" height="60" patternUnits="userSpaceOnUse">
          <rect width="2" height="6" x="0" y="2" fill="rgba(255,255,255,0.04)" />
          <rect width="2" height="6" x="0" y="52" fill="rgba(255,255,255,0.04)" />
        </pattern>
      </defs>
      <rect width="100" height="60" fill="url(#stripes)" />
      <rect x="0" y="34" width="100" height="26" fill="rgba(217,87,33,0.10)" />
      <circle cx="72" cy="28" r="9" fill="rgba(255,180,120,0.18)" />
      <circle cx="72" cy="28" r="4" fill="rgba(255,200,140,0.35)" />
      <path d="M 0 42 Q 25 38 50 42 T 100 42 L 100 60 L 0 60 Z" fill="rgba(60,40,30,0.55)" />
      {title && (
        <text x="50" y="56" textAnchor="middle" fontSize="3" fill="rgba(255,255,255,0.4)">
          {title}
        </text>
      )}
    </svg>
  );
}

function AudioWavePlaceholder() {
  const bars = Array.from({ length: 48 });
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={{ display: 'block' }}>
      {bars.map((_, i) => {
        const x = (i / bars.length) * 100;
        const w = 100 / bars.length - 0.4;
        const h = 6 + Math.abs(Math.sin(i * 1.3) * 18) + Math.abs(Math.cos(i * 0.7) * 10);
        const y = (60 - h) / 2;
        return <rect key={i} x={x} y={y} width={w} height={h} rx="0.5" fill="rgba(217,87,33,0.55)" />;
      })}
    </svg>
  );
}

function FunscriptPlaceholder() {
  const pts = Array.from({ length: 48 }, (_, i) => {
    const x = (i / 47) * 100;
    const y = 30 + Math.sin(i * 0.35) * 20 + Math.cos(i * 0.7) * 6;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke="rgba(77,171,247,0.65)" strokeWidth="0.8" />
      {/* faint zero-line */}
      <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(255,255,255,0.04)" strokeWidth="0.4" />
    </svg>
  );
}

// ─── Real-data renderers (used when data props are supplied) ─────
// WaveformCanvas — peak envelope, 12s absolute window scrolling with
// the playhead (same windowing model as SpectrogramCanvas and
// FunscriptBeatWindow). Three lock-step time-aware modes now share
// one positioning contract.
//
// Earlier shape (pre-2026-05-21): SVG `<rect>` per peak in a 16%-of-
// chapter window, with consumers downsampling to ~200 bars BEFORE
// passing in to keep React reconciliation from echoing playback on
// long files. That was the chapters tab's TARGET_BARS=200 dance.
// Canvas2D imperative paint handles thousands of bars cheaply (no React
// diff per timeupdate), so we read the full-track peaks directly and
// window absolutely against `currentMs` — no more chapter-scope
// downsample, no more "advances every 2 seconds" feel.
//
// Coordinate model: peaks indexed by absolute frame number (frame =
// floor(timeMs / hopMs)). Visible window = 12s around currentMs,
// clamped to track bounds. Baton sits roughly centered, with the same
// edge-clamp + translateX shift as FunscriptBeatWindow.
//
// Optional `spectrogram` prop: if provided, each peak bar gets colored
// by the audio's frequency distribution at that moment (bass = warm
// orange, vocal range = yellow-green, treble = cyan-blue, broadband =
// blended). This turns the waveform into a frequency-aware overview
// without an extra mode — you see WHERE the audio sits in addition to
// HOW LOUD it is. Same DaVinci-style aesthetic. Falls back to solid
// orange when the spectrogram sidecar isn't loaded.
function WaveformCanvas({ waveform, spectrogram, currentMs, windowMs = 12000 }) {
  const canvasRef = useRef(null);

  const peaks = waveform?.peaks;
  const durationMs = waveform?.durationMs ?? 0;
  const hopMs = waveform?.hopMs ?? (
    // Back-compat: legacy callers may not pass hopMs. Derive from
    // peak count + duration when we can; default to 10 (the standard
    // peak hop) otherwise.
    peaks && durationMs > 0 && peaks.length > 0
      ? Math.max(1, Math.round(durationMs / peaks.length))
      : 10
  );

  // Precomputed per-peak RGB color cache, derived once from the
  // spectrogram (NOT recomputed every paint). Without this cache the
  // colorize loop was doing nMels = 64 cell reads + 3 band sums + a
  // template-literal fillStyle string + a fillStyle parse per bar at
  // ~1200 bars/paint × 5Hz, which re-introduced the playback stutter
  // canvas2D was supposed to fix. Precomputing reduces hot-loop work
  // to one Uint8Array read per channel + a cheap int comparison.
  const peakColors = useMemo(() => {
    if (!peaks || peaks.length === 0) return null;
    const specCells = spectrogram?.cells;
    const specHopMs = spectrogram?.hopMs ?? 0;
    const specNMels = spectrogram?.nMels ?? 0;
    const specNFrames = spectrogram?.nFrames ?? 0;
    if (!specCells || specHopMs <= 0 || specNMels <= 0 || specNFrames <= 0) {
      return null;
    }
    const split1 = Math.floor(specNMels / 3);
    const split2 = Math.floor((specNMels * 2) / 3);
    const n = peaks.length;
    // Flat Uint8Array of [r, g, b] per peak frame. 30-min track at
    // 10ms hop = 180,000 peaks × 3 bytes = 540KB. Held for the
    // lifetime of the spectrogram identity, freed on project change.
    const out = new Uint8Array(n * 3);
    let lastSpecIdx = -1;
    let cachedR = 217, cachedG = 87, cachedB = 33;
    for (let p = 0; p < n; p += 1) {
      const timeMs = p * hopMs;
      const specIdx = Math.floor(timeMs / specHopMs);
      if (specIdx !== lastSpecIdx) {
        if (specIdx < 0 || specIdx >= specNFrames) {
          cachedR = 217; cachedG = 87; cachedB = 33;
        } else {
          const offset = specIdx * specNMels;
          let bass = 0, mid = 0, high = 0;
          for (let i = 0; i < split1; i += 1) bass += specCells[offset + i];
          for (let i = split1; i < split2; i += 1) mid += specCells[offset + i];
          for (let i = split2; i < specNMels; i += 1) high += specCells[offset + i];
          const total = bass + mid + high;
          if (total <= 24) {
            cachedR = 217; cachedG = 87; cachedB = 33;
          } else {
            const br = bass / total;
            const mr = mid / total;
            const hr = high / total;
            cachedR = Math.round(217 * br + 200 * mr +  70 * hr);
            cachedG = Math.round( 87 * br + 200 * mr + 160 * hr);
            cachedB = Math.round( 33 * br +  80 * mr + 230 * hr);
          }
        }
        lastSpecIdx = specIdx;
      }
      const o = p * 3;
      out[o] = cachedR;
      out[o + 1] = cachedG;
      out[o + 2] = cachedB;
    }
    return out;
  }, [peaks, spectrogram, hopMs]);

  // Visible window — computed in render so the baton overlay and the
  // canvas paint use the exact same range. Cheap math, no allocations.
  let windowStart = 0;
  let batonXPct = 0;
  if (peaks && peaks.length > 0 && durationMs > 0) {
    const playhead = Math.max(0, Math.min(durationMs, currentMs ?? 0));
    const effWindowMs = Math.min(windowMs, durationMs);
    const half = effWindowMs / 2;
    windowStart = playhead - half;
    if (windowStart < 0) windowStart = 0;
    if (windowStart + effWindowMs > durationMs) {
      windowStart = Math.max(0, durationMs - effWindowMs);
    }
    batonXPct = ((playhead - windowStart) / effWindowMs) * 100;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0 || durationMs <= 0 || hopMs <= 0) return;

    const effWindowMs = Math.min(windowMs, durationMs);
    const startFrame = Math.max(0, Math.floor(windowStart / hopMs));
    const framesInWindow = Math.max(1, Math.ceil(effWindowMs / hopMs));
    const endFrame = Math.min(peaks.length, startFrame + framesInWindow);
    const visibleFrames = Math.max(1, endFrame - startFrame);

    // Canvas height = container height in CSS pixels (browser scales the
    // 1px-per-frame internal width to fit). Fixed internal height of 80
    // gives crisp vertical bars without pixel doubling cost on retina.
    const internalHeight = 80;
    if (canvas.width !== visibleFrames) canvas.width = visibleFrames;
    if (canvas.height !== internalHeight) canvas.height = internalHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, visibleFrames, internalHeight);

    // Paint loop reads from the precomputed `peakColors` cache (built
    // once per spectrogram-identity change in the useMemo above). The
    // earlier in-loop implementation that summed mel bands + built a
    // template-literal fillStyle per bar was the actual stutter cause —
    // ~1200 bars × (64 cell reads + 3 sums + string alloc) × 5Hz was
    // ~5–10ms of jank per paint, enough to starve the video decoder.
    const midY = internalHeight / 2;
    if (peakColors) {
      // Color path. fillStyle changes are coalesced for sustained
      // passages (kick / sustained vocal / etc.) so a 1200-bar paint
      // typically does <50 fillStyle assignments + fillRect calls.
      let lastR = -1, lastG = -1, lastB = -1;
      for (let t = 0; t < visibleFrames; t += 1) {
        const peakFrame = startFrame + t;
        const v = peaks[peakFrame] ?? 0;
        const co = peakFrame * 3;
        const r = peakColors[co];
        const g = peakColors[co + 1];
        const b = peakColors[co + 2];
        if (r !== lastR || g !== lastG || b !== lastB) {
          ctx.fillStyle = `rgba(${r},${g},${b},0.78)`;
          lastR = r; lastG = g; lastB = b;
        }
        const halfH = Math.max(0.5, v * (internalHeight / 2));
        ctx.fillRect(t, midY - halfH, 1, halfH * 2);
      }
    } else {
      // Solid-orange fallback when no spectrogram is loaded.
      ctx.fillStyle = 'rgba(217,87,33,0.75)';
      for (let t = 0; t < visibleFrames; t += 1) {
        const v = peaks[startFrame + t] ?? 0;
        const halfH = Math.max(0.5, v * (internalHeight / 2));
        ctx.fillRect(t, midY - halfH, 1, halfH * 2);
      }
    }

  }, [peaks, durationMs, hopMs, windowStart, windowMs, peakColors]);

  if (!peaks || peaks.length === 0) return <AudioWavePlaceholder />;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          imageRendering: 'auto',
          background: '#0a0a0e',
        }}
      />
      {/* Window-relative baton — matches SpectrogramCanvas + FunscriptBeatWindow. */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: `${batonXPct}%`,
        width: 2,
        transform: `translateX(${-2 * (batonXPct / 100)}px)`,
        background: 'rgba(255,255,255,0.95)',
        boxShadow: '0 0 6px rgba(255,255,255,0.6)',
        pointerEvents: 'none',
        zIndex: 5,
      }} />
    </div>
  );
}

// SpectrogramCanvas — mel-spectrogram heatmap, 12s window scrolling
// with the playhead (same windowing model as FunscriptBeatWindow).
//
// Renders imperatively to a <canvas> in a useEffect paint pass — never
// through React's reconciler. The peaks WaveformCanvas earlier in this
// file uses per-bar SVG <rect>s and the React diff cost at every
// timeupdate (5 Hz) caused playback echo on long files (commit b4a7082
// in funscriptforge). Spectrogram cell counts are higher still (~64
// bins × ~500 visible frames = ~32k cells per paint), so per-element
// rendering is a non-starter. One imperative `ctx.putImageData()` per
// paint handles it cheaply.
//
// Coordinate model: cells are time-major (`cells[t * nMels + bin]`) so
// a visible window is a contiguous byte range. Mel bins render with
// low frequency at the bottom of the canvas (matching matplotlib's
// `y_axis="mel"` convention used in the reference PNGs at
// funscriptforge/test_funscript/*.spectrogram.png).
//
// Baton is rendered INSIDE this component (not via the outer audio
// baton in MediaViewer) because the window slides with currentMs and
// the baton sits roughly centered — different positioning model from
// Audio mode's chapter-relative batonPos.
// View modes for the spectrogram surface. Two presets cover the two
// common editing tasks:
//   - 'fine' (12s window, full 64 mel bins): beat / phrase work; see
//     individual transients, vocal articulation, percussion strikes.
//   - 'coarse' (60s window, every 2nd mel bin): section finding; see
//     song-section transitions as broad color blocks (the DaVinci
//     audio-overlay aesthetic). Bass / mid / treble groupings pop.
// Implemented as a local component state — no parent wiring required.
// Pinch-zoom / wheel-zoom could replace the discrete toggle later but
// discrete is more discoverable for first-time users.
const SPEC_VIEW_PRESETS = {
  fine:   { windowMs: 12000, binStride: 1 },
  coarse: { windowMs: 60000, binStride: 2 },
};

function SpectrogramCanvas({ spectrogram, currentMs, windowMs }) {
  const canvasRef = useRef(null);
  const [view, setView] = useState('fine');  // 'fine' | 'coarse'
  const preset = SPEC_VIEW_PRESETS[view] ?? SPEC_VIEW_PRESETS.fine;
  // Caller can override the fine-mode window via prop; the coarse preset
  // always uses its larger window so the section-finding behaviour stays
  // consistent across consumers.
  const baseWindowMs = view === 'coarse' ? preset.windowMs : (windowMs ?? preset.windowMs);
  const binStride = preset.binStride;

  // Compute the visible window once per render. Same math used below
  // for the baton overlay AND in the paint effect, kept in one place
  // so they can't drift.
  const cells = spectrogram?.cells;
  const nMels = spectrogram?.nMels ?? 0;
  const nFrames = spectrogram?.nFrames ?? 0;
  const hopMs = spectrogram?.hopMs ?? 0;
  const durationMs = spectrogram?.durationMs ?? 0;

  let windowStart = 0;
  let batonXPct = 0;
  if (nFrames > 0 && hopMs > 0 && durationMs > 0) {
    const playhead = Math.max(0, Math.min(durationMs, currentMs ?? 0));
    const effWindowMs = Math.min(baseWindowMs, durationMs);
    const half = effWindowMs / 2;
    windowStart = playhead - half;
    if (windowStart < 0) windowStart = 0;
    if (windowStart + effWindowMs > durationMs) {
      windowStart = Math.max(0, durationMs - effWindowMs);
    }
    batonXPct = ((playhead - windowStart) / effWindowMs) * 100;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cells || nMels <= 0 || nFrames <= 0 || hopMs <= 0) return;

    const effWindowMs = Math.min(baseWindowMs, durationMs);
    const startFrame = Math.max(0, Math.floor(windowStart / hopMs));
    const framesInWindow = Math.max(1, Math.ceil(effWindowMs / hopMs));
    const endFrame = Math.min(nFrames, startFrame + framesInWindow);
    const visibleFrames = Math.max(1, endFrame - startFrame);
    // Effective vertical resolution in coarse mode is nMels/binStride;
    // when we skip bins we ALSO shrink the internal canvas height so
    // the cells look correspondingly chunkier (browser bilinear up-
    // scaling does the rest). Without this, skipping bins would just
    // leave horizontal stripes — not what "coarser" should read as.
    const outBins = Math.max(1, Math.floor(nMels / binStride));

    if (canvas.width !== visibleFrames) canvas.width = visibleFrames;
    if (canvas.height !== outBins) canvas.height = outBins;

    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(visibleFrames, outBins);
    const data = imageData.data;

    // Paint cells. Loop order: outer t (column), inner bin (row).
    // `dstRow = outBins - 1 - i` flips the axis so low freq is at
    // bottom of the canvas, high freq at top.
    for (let t = 0; t < visibleFrames; t += 1) {
      const srcT = startFrame + t;
      const srcRowOffset = srcT * nMels;
      for (let i = 0; i < outBins; i += 1) {
        // In coarse mode (binStride=2) average each pair of source bins
        // to smooth the band aggregation. In fine mode this is a single
        // read.
        let byte = 0;
        let n = 0;
        for (let k = 0; k < binStride; k += 1) {
          const srcBin = i * binStride + k;
          if (srcBin < nMels) {
            byte += cells[srcRowOffset + srcBin];
            n += 1;
          }
        }
        const v = n > 0 ? Math.round(byte / n) : 0;
        const lutOffset = v * 4;
        const dstRow = outBins - 1 - i;
        const pxOffset = (dstRow * visibleFrames + t) * 4;
        data[pxOffset + 0] = MAGMA_LUT[lutOffset + 0];
        data[pxOffset + 1] = MAGMA_LUT[lutOffset + 1];
        data[pxOffset + 2] = MAGMA_LUT[lutOffset + 2];
        data[pxOffset + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, [cells, nMels, nFrames, hopMs, durationMs, windowStart, baseWindowMs, binStride]);

  // Window-duration label for the toggle button — the two presets map to
  // discrete user-meaningful spans (beat-level vs section-level).
  const otherView = view === 'fine' ? 'coarse' : 'fine';
  const toggleLabel = view === 'fine' ? '12s' : '60s';
  const toggleHint = view === 'fine'
    ? 'Switch to section view (60s, coarser bins)'
    : 'Switch to detail view (12s, full bins)';

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          // Default 'auto' rendering = bilinear interp. The 1px-per-frame
          // canvas stretched to ~500-800 display px reads smoothly; with
          // 'pixelated' the cells would render as visible blocks which
          // hurts the "see frequency texture" intent.
          imageRendering: 'auto',
          background: '#000004',
        }}
      />
      {/* Window-relative baton. Mirrors FunscriptBeatWindow's positioning:
          translateX shift keeps the line fully visible at both edges. */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        left: `${batonXPct}%`,
        width: 2,
        transform: `translateX(${-2 * (batonXPct / 100)}px)`,
        background: 'rgba(255,255,255,0.95)',
        boxShadow: '0 0 6px rgba(255,255,255,0.6)',
        pointerEvents: 'none',
        zIndex: 5,
      }} />
      {/* Detail / Section toggle. Lives in the top-right corner of the
          surface so it doesn't fight with the corner mode label. The
          one-character window-span label is enough information once the
          user has used it twice; the tooltip carries the full intent. */}
      <button
        type="button"
        title={toggleHint}
        onClick={() => setView(otherView)}
        style={{
          position: 'absolute',
          top: 6, right: 6,
          padding: '2px 8px',
          fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
          color: 'rgba(255,255,255,0.85)',
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 4,
          cursor: 'pointer',
          fontFamily: 'inherit',
          backdropFilter: 'blur(4px)',
          zIndex: 6,
        }}
      >
        {toggleLabel}
      </button>
    </div>
  );
}

// ─── AudioDashboard — live readout of "what is this audio right now" ──
//
// A compact two-row band that activates whenever audio-derived sidecars
// are loaded (peaks and/or spectrogram). Visible across all modes —
// the audio is the master clock even when the video frame is on screen,
// so the user benefits from a numerical readout regardless of which
// visual mode is active.
//
// Layout:
//   ● bass-heavy · loud           ▁▂▄█▆▃▁ ← live mel sparkline
//   E: 78  [55–82]  ƒ: 480Hz  [380–520]  ← numbers + 1s [min–max] ranges
//
// All values are read directly off the already-loaded sidecars. No
// state, no setInterval, no rolling buffers — every render walks
// ~100 frames of trailing window (≈ 1s at 10ms hop, ≈ 43 frames at
// 23ms hop), which is sub-millisecond work. The sparkline paints
// via canvas2D imperative paint (no per-bar React diff).
//
// Future home for Bruce's "tonal lift" idea ([[project-tonal-slope-transform]]):
// the centroid Hz readout is the live signal that drives the auto-
// build-from-pitch-trajectory transform concept. Watch it scrub through
// a track to validate whether the signal carries the musical-intensity
// information before committing to the transform.
function AudioDashboard({ audioWaveform, spectrogram, beats, currentMs }) {
  const bpm = beats?.bpm > 0 ? Math.round(beats.bpm) : null;
  const sparkRef = useRef(null);

  const peaks = audioWaveform?.peaks;
  const peaksHopMs = audioWaveform?.hopMs || 10;
  const peakFrameIdx = peaks
    ? Math.min(
        peaks.length - 1,
        Math.max(0, Math.floor((currentMs ?? 0) / peaksHopMs)),
      )
    : -1;

  const cells = spectrogram?.cells;
  const nMels = spectrogram?.nMels ?? 64;
  const nFrames = spectrogram?.nFrames ?? 0;
  const fmax = spectrogram?.fmax ?? 8000;
  const specHopMs = spectrogram?.hopMs || 23;
  const specFrameIdx = cells
    ? Math.min(
        nFrames - 1,
        Math.max(0, Math.floor((currentMs ?? 0) / specHopMs)),
      )
    : -1;

  // ── Energy: current + 1s [min–max] range ─────────────────────────
  let energyCur = 0, energyMin = 0, energyMax = 0, hasEnergy = false;
  if (peaks && peakFrameIdx >= 0) {
    hasEnergy = true;
    const halfWin = Math.round(500 / peaksHopMs);
    const lo = Math.max(0, peakFrameIdx - halfWin);
    const hi = Math.min(peaks.length, peakFrameIdx + halfWin);
    let mn = 1, mx = 0;
    for (let i = lo; i < hi; i += 1) {
      const v = peaks[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    energyCur = peaks[peakFrameIdx] ?? 0;
    energyMin = mn === 1 ? energyCur : mn;
    energyMax = mx;
  }

  // ── Dominant band + centroid Hz from current mel frame ──────────
  let dominantBand = null;
  let centroidCur = 0, centroidMin = 0, centroidMax = 0, hasCentroid = false;
  if (cells && specFrameIdx >= 0) {
    hasCentroid = true;
    centroidCur = _frameCentroidHz(cells, specFrameIdx, nMels, fmax);
    dominantBand = _frameDominantBand(cells, specFrameIdx, nMels);

    // Centroid 1s range — walk ~43 frames at 23ms hop, cheap.
    const halfWin = Math.round(500 / specHopMs);
    const lo = Math.max(0, specFrameIdx - halfWin);
    const hi = Math.min(nFrames, specFrameIdx + halfWin);
    let mn = fmax, mx = 0;
    for (let f = lo; f < hi; f += 1) {
      const hz = _frameCentroidHz(cells, f, nMels, fmax);
      if (hz <= 0) continue;
      if (hz < mn) mn = hz;
      if (hz > mx) mx = hz;
    }
    centroidMin = mn === fmax ? centroidCur : mn;
    centroidMax = mx;
  }

  // ── Sparkline canvas: current mel frame as 64 inline vertical bars ──
  useEffect(() => {
    const canvas = sparkRef.current;
    if (!canvas || !cells || specFrameIdx < 0) return;
    if (canvas.width !== nMels) canvas.width = nMels;
    if (canvas.height !== 18) canvas.height = 18;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, nMels, 18);
    // Warm orange to match the waveform mode — visually links the
    // sparkline to the Audio mode's surface even when looking at
    // Video or Spectro.
    ctx.fillStyle = 'rgba(217,87,33,0.85)';
    const offset = specFrameIdx * nMels;
    for (let i = 0; i < nMels; i += 1) {
      const v = cells[offset + i] / 255;
      const h = Math.max(0.5, v * 18);
      ctx.fillRect(i, 18 - h, 1, h);
    }
  }, [cells, specFrameIdx, nMels]);

  // Hide entirely when no audio data — keeps Library scrub players /
  // estim-only flows free of a dead-data band.
  if (!hasEnergy && !hasCentroid) return null;

  const energyLabel = hasEnergy ? _energyLabel(energyCur) : null;
  const headlineLabel =
    dominantBand && energyLabel
      ? `${dominantBand} · ${energyLabel}`
      : (dominantBand ?? energyLabel ?? '—');

  return (
    <div style={{
      padding: '4px 10px 5px',
      borderTop: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 2,
      fontSize: 10.5, lineHeight: 1.3,
      color: 'rgba(255,255,255,0.7)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 8,
        // nowrap — when the headline gets long ("broadband · moderate"),
        // we'd rather truncate with ellipsis than wrap onto two lines.
        // Wrapping was shifting the viewer's vertical layout frame-to-
        // frame as the classification label changed.
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          // minWidth: 0 lets the flex child shrink below its content
          // size so ellipsis kicks in instead of overflowing.
          minWidth: 0,
        }}>
          <span style={{
            display: 'inline-block', flexShrink: 0,
            width: 6, height: 6, borderRadius: '50%',
            background: hasEnergy && energyCur > 0.02
              ? 'rgba(217,87,33,0.85)' : 'rgba(255,255,255,0.25)',
          }} />
          <span style={{
            color: 'var(--text)', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {headlineLabel}
          </span>
        </div>
        {hasCentroid && (
          <canvas
            ref={sparkRef}
            title="Current mel spectrum"
            style={{
              flexShrink: 0,
              width: 72, height: 18,
              imageRendering: 'auto',
              background: 'rgba(0,0,0,0.35)',
              borderRadius: 2,
            }}
          />
        )}
      </div>
      <div className="mono" style={{
        display: 'flex', gap: 14, fontSize: 9.5,
        color: 'rgba(255,255,255,0.55)',
        // Same anti-wrap treatment. Each value span is a flex child;
        // if the row truly can't fit at any width, the ƒ readout
        // (last child) clips first via overflow.
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}>
        {hasEnergy && (
          <span style={{ flexShrink: 0 }}>
            <span style={{ opacity: 0.6 }}>E:</span>{' '}
            <span style={{ color: 'rgba(255,255,255,0.95)' }}>
              {Math.round(energyCur * 100)}
            </span>{' '}
            <span style={{ opacity: 0.55 }}>
              [{Math.round(energyMin * 100)}–{Math.round(energyMax * 100)}]
            </span>
          </span>
        )}
        {hasCentroid && centroidCur > 0 && (
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ opacity: 0.6 }}>ƒ:</span>{' '}
            <span style={{ color: 'rgba(255,255,255,0.95)' }}>
              {centroidCur}Hz
            </span>{' '}
            <span style={{ opacity: 0.55 }}>
              [{centroidMin}–{centroidMax}]
            </span>
          </span>
        )}
        {bpm != null && (
          <span style={{ flexShrink: 0 }} title="Music BPM (from beats sidecar)">
            <span style={{ opacity: 0.6 }}>♩</span>{' '}
            <span style={{ color: 'rgba(255,255,255,0.95)' }}>{bpm}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function _frameCentroidHz(cells, frameIdx, nMels, fmax) {
  // ∑(bin_index × bin_energy) / ∑(bin_energy). Approximate Hz by
  // linearly mapping the average bin index across [0, fmax]; mel scale
  // is logarithmic so this is a rough display value rather than a
  // physical centroid. For a readout it's enough; if Bruce's
  // tonal-slope transform ever needs precise Hz we lift the librosa
  // mel_frequencies LUT into the sidecar and look up.
  const offset = frameIdx * nMels;
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < nMels; i += 1) {
    const v = cells[offset + i];
    sum += v;
    weighted += v * i;
  }
  if (sum < 8) return 0;
  const avgBin = weighted / sum;
  return Math.round((avgBin / (nMels - 1)) * fmax);
}

function _frameDominantBand(cells, frameIdx, nMels) {
  const offset = frameIdx * nMels;
  const split1 = Math.floor(nMels / 3);
  const split2 = Math.floor((nMels * 2) / 3);
  let low = 0, mid = 0, high = 0;
  for (let i = 0; i < split1; i += 1) low += cells[offset + i];
  for (let i = split1; i < split2; i += 1) mid += cells[offset + i];
  for (let i = split2; i < nMels; i += 1) high += cells[offset + i];
  const total = low + mid + high;
  if (total < 24) return 'silent';
  const max = Math.max(low, mid, high);
  // Single dominant band (>50% of total energy)
  if (max === low && low > total * 0.5) return 'bass-heavy';
  if (max === mid && mid > total * 0.5) return 'vocal range';
  if (max === high && high > total * 0.5) return 'high-pitched';
  // Two-band dominance
  if (low + mid > total * 0.75) return 'bass+mid';
  if (mid + high > total * 0.75) return 'mid+high';
  return 'broadband';
}

function _energyLabel(v) {
  if (v < 0.02) return 'silent';
  if (v < 0.2) return 'quiet';
  if (v < 0.5) return 'moderate';
  if (v < 0.85) return 'loud';
  return 'peak';
}

function SpectrogramPlaceholder() {
  // Shown when the .spectrogram.json sidecar is absent — the viewer
  // can't compute on demand under the new architecture (sidecars are
  // built by videoflow.structural.auto_chapter during chapter analysis).
  // Empty state nudges the user toward the action that produces it.
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 6,
      color: 'rgba(255,255,255,0.55)',
      fontSize: 11, lineHeight: 1.4,
      background: '#000004',
      textAlign: 'center', padding: 14,
    }}>
      <div style={{ fontSize: 22, opacity: 0.55 }}>🎵</div>
      <div>Spectrogram not built yet.</div>
      <div style={{ opacity: 0.7, fontSize: 10 }}>
        Run “Analyze with videoflow” on the Chapters tab —
        spectrogram is built alongside chapter detection.
      </div>
    </div>
  );
}

// FunscriptBeatWindow — scrolling beat tape centered on the playhead.
//
// The funscript view exists to show "what the device is about to do":
// individual strokes pop as discrete features, velocity-colored
// (canonical blue→red colormap), close enough together to read the
// beat pattern. A 12-second window is the default — wide enough to see
// the next handful of strokes coming, narrow enough that single strokes
// remain visually distinct.
//
// Baton behaviour (per user direction 2026-05-19):
//   - At the start of a chapter, the baton sits at the left edge. The
//     funscript extends to its right (future beats). No empty space
//     before the start since there's no past content yet.
//   - As `currentMs` advances past windowMs/2, the window slides forward
//     and the baton settles at center. Past beats scroll off the left,
//     future beats arrive from the right. This is the "guitar hero"
//     scroll.
//   - Near the end of the chapter, the window stops sliding and the
//     baton continues past center toward the right, matching how the
//     start works symmetrically.
//
// Coordinate space: 100×100 viewBox like Sparkline. x = window-relative
// time, y = inverted funscript position (pos=100 at top, pos=0 at
// bottom — matches Charts.jsx convention).
function FunscriptBeatWindow({ actions, currentMs, batonRange, windowMs = 12000 }) {
  if (!actions || actions.length === 0) return <FunscriptPlaceholder />;

  const trackStart = batonRange.start;
  const trackEnd = batonRange.end;
  const trackSpan = Math.max(1, trackEnd - trackStart);
  // If the chapter is shorter than the window, just render the whole
  // chapter — no scrolling needed, the baton sweeps across it.
  const effWindowMs = Math.min(windowMs, trackSpan);
  const half = effWindowMs / 2;

  // Clamp the playhead into [trackStart, trackEnd]. Compute the window
  // start so the playhead sits at center, then clamp to track bounds:
  // sliding the window past either end of the chapter would show empty
  // space, so the window pins at the boundary and the baton position
  // slides instead.
  const playhead = Math.max(trackStart, Math.min(trackEnd, currentMs ?? trackStart));
  let windowStart = playhead - half;
  if (windowStart < trackStart) windowStart = trackStart;
  if (windowStart + effWindowMs > trackEnd) windowStart = trackEnd - effWindowMs;
  const windowEnd = windowStart + effWindowMs;
  const batonXPct = ((playhead - windowStart) / effWindowMs) * 100;

  // Filter to the visible window with a small overscan so polyline
  // endpoints connect cleanly at the edges instead of being clipped
  // mid-stroke.
  const overscan = Math.max(50, effWindowMs * 0.02);
  const visible = actions.filter(
    (a) => a.at >= windowStart - overscan && a.at <= windowEnd + overscan,
  );

  // Render the baton overlay regardless of whether the window slice has
  // content. Earlier shape (2026-05-19 PM) returned FunscriptPlaceholder
  // when visible was empty and stripped the baton with it — user lost
  // the baton when video playback parked the playhead in a sparse region
  // of the funscript (or before the chapter's actions begin). The baton
  // is the navigation anchor; it has to render even when the curve is
  // momentarily empty.
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {visible.length > 0 ? (
        <Sparkline
          actions={visible}
          start={windowStart}
          end={windowEnd}
          colorMode="velocity"
          filled
          height="100%"
        />
      ) : (
        <FunscriptPlaceholder />
      )}
      <div style={{
        position: 'absolute', top: 0, bottom: 0,
        // Clamp via translateX based on edge proximity so the baton
        // stays fully visible at both ends. At left edge: no shift
        // (line at x=[0,2]). At right edge: shift by full width (line
        // at x=[w-2, w]). Linear interp between.
        left: `${batonXPct}%`,
        width: 2,
        transform: `translateX(${-2 * (batonXPct / 100)}px)`,
        background: 'rgba(255,255,255,0.95)',
        boxShadow: '0 0 6px rgba(255,255,255,0.6)',
        pointerEvents: 'none',
        zIndex: 5,
      }} />
    </div>
  );
}

// ─── Local time formatter (avoids primitives circular import risk) ──
// HH:MM:SS.mmm — used by the prominent centered timecode. Pads HH/MM/SS to
// two digits and milliseconds to three. Always shows hours so the display
// width stays stable across short and long-form material (no layout jump
// when crossing 60min).
function fmtHHMMSSmmm(ms) {
  const total = Math.max(0, Math.floor(ms ?? 0));
  const millis = total % 1000;
  const totalSec = Math.floor(total / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  return (
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:`
    + `${String(sec).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
  );
}
