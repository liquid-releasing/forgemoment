// ViewerPanel — review a generated device output across its whole timeline.
//
// Carved out of FunscriptForge's Viewer stage so ForgeAssembler and
// ForgePlayer can mount the same surface. The layout is the point: an
// audio + spectro + intensity context strip and every channel of the
// selected device stacked on ONE time axis, with a reference monitor on the
// right tied to the same baton. Reading DOWN the stack — "the source is hot
// here but my channels are pale" — is what surfaces a soft intro or a dead
// chapter. No comparison, no editing: pure review.
//
// ── The seam ──
// This component does no IO and knows no platform. The host loads the data
// however it likes (a CLI bridge, a bundle reader, a fetch) and passes it in
// already shaped; the host also converts filesystem paths to URLs its webview
// can load, because `convertFileSrc` is Tauri's and forgemoment stays
// platform-free. What lives HERE is everything all three apps would otherwise
// each reimplement: the lane stack, the stats, the chapter liveliness bars,
// the monitor wiring, and the rule about which channel the monitor may show.
//
// UI state (which device, which channel, where the playhead is) is owned
// here, because every host wants the same behaviour from it. `onCurrentMsChange`
// is there for a host that wants to observe the playhead, not drive it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MediaViewer } from '../MediaViewer.jsx';
import { ChannelStack } from './ChannelStack.jsx';
import { analyzeChannels, livelinessInWindow } from './stats.js';
import { computeIntensity } from './intensity.js';
import { resolveMonitorFunscript } from './monitorChannel.js';

export function ViewerPanel({
  // ── Data ────────────────────────────────────────────────────────
  devices = [],
  durationMs = 0,
  chapters = [],
  audio = null,            // { peaks } for the full-timeline lane
  monitorAudio = null,     // higher-resolution { peaks } for the monitor window
  beats = null,
  events = [],
  spectrogram = null,      // in-memory spectrogram data, if the host has it
  spectrogramUrl = null,   // ...or a URL the host already converted
  screech = null,          // { source_screech_regions, generation_cap_regions }

  // ── Monitor ─────────────────────────────────────────────────────
  mediaUrl = null,         // host-converted; a bare filesystem path will not load
  mediaKind = 'video',
  mediaTitle = 'Full timeline',
  // Full-resolution actions for ONE channel. The monitor windows down to a few
  // seconds, where the lane stack's decimated min/max envelope reads as a
  // zigzag rather than as strokes. Optional: without it the monitor falls back
  // to the lane data and says so via `resolveMonitorFunscript`'s flag.
  loadChannel = null,      // (deviceName, channelName) => Promise<{ actions }>

  // ── Provenance footer ───────────────────────────────────────────
  // Which artifact is being reviewed. Worth showing: with sibling fallback you
  // can open the 4K and be reading the 1080p output.
  source = null,           // { label, name, path }

  // ── Chrome ──────────────────────────────────────────────────────
  headerExtra = null,      // host-specific controls beside the device pills
  emptyMessage = 'No generated output to review.',
  onCurrentMsChange = null,
}) {
  const [deviceName, setDeviceName] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoElRef = useRef(null);

  // Default to the first device once data lands, and recover if the device
  // we were showing disappears (the host reloaded onto a different output).
  useEffect(() => {
    if (devices.length && !devices.find((d) => d.name === deviceName)) {
      setDeviceName(devices[0].name);
    }
  }, [devices, deviceName]);

  const device = devices.find((d) => d.name === deviceName) || devices[0] || null;
  const channels = device?.channels || [];

  const seek = useCallback((ms) => {
    const clamped = Math.max(0, Math.min(durationMs, ms));
    setCurrentMs(clamped);
    onCurrentMsChange?.(clamped);
  }, [durationMs, onCurrentMsChange]);

  // ── Monitor channel, at full resolution ───────────────────────────
  const monitorChannelName = selectedChannel || channels[0]?.name || null;
  const [monitorActions, setMonitorActions] = useState([]);

  // Held in a ref, and NOT a dependency below. A host that passes an inline
  // `loadChannel={(d, c) => ...}` hands us a new function identity on every
  // one of its renders; as a dependency that would refetch the channel in a
  // loop, and each fetch's setState would cause the next render. What the
  // fetch actually depends on is the device and the channel name.
  const loadChannelRef = useRef(loadChannel);
  loadChannelRef.current = loadChannel;
  const canLoadChannel = !!loadChannel;

  const deviceKey = device?.name || null;
  useEffect(() => {
    if (!canLoadChannel || !deviceKey || !monitorChannelName) { setMonitorActions([]); return undefined; }
    let live = true;
    Promise.resolve(loadChannelRef.current(deviceKey, monitorChannelName))
      .then((res) => { if (live) setMonitorActions(res?.actions?.length ? res.actions : []); })
      .catch(() => { if (live) setMonitorActions([]); });
    return () => { live = false; };
  }, [canLoadChannel, deviceKey, monitorChannelName]);

  // Never another channel's data — see monitorChannel.js for the bug this
  // exists to prevent. Showing nothing beats showing the wrong signal.
  const monitorResolved = useMemo(
    () => resolveMonitorFunscript(monitorActions, channels, monitorChannelName),
    [monitorActions, channels, monitorChannelName],
  );
  const monitorFunscript = useMemo(
    () => ({ actions: monitorResolved.actions }), [monitorResolved],
  );

  const intensity = useMemo(
    () => computeIntensity(channels, durationMs), [channels, durationMs]);
  const summary = useMemo(
    () => analyzeChannels(channels, durationMs), [channels, durationMs]);

  // Per-chapter liveliness — where the output sags vs. peaks. Scoped to the
  // selected channel when there is one, else the whole device. This is what
  // turns "the intro feels soft" into a number.
  const perChapter = useMemo(() => {
    if (!chapters.length || !channels.length) return [];
    const scope = selectedChannel
      ? channels.filter((c) => c.name === selectedChannel)
      : channels;
    return chapters.map((ch, i) => ({
      ...ch, idx: i + 1, ...livelinessInWindow(scope, ch.start, ch.end),
    }));
  }, [chapters, channels, selectedChannel]);
  const liveValues = perChapter.map((c) => c.liveliness).filter((v) => v != null);
  const liveMax = liveValues.length ? Math.max(...liveValues) : 1;

  const screechRegions = screech?.source_screech_regions || [];
  const capCount = screech?.generation_cap_regions?.length || 0;

  // The video element is the master clock while it plays; the lanes ask it
  // where it is rather than being driven by a timer that would drift.
  const getLiveMs = useCallback(() => {
    const v = videoElRef.current;
    return v ? v.currentTime * 1000 : null;
  }, []);

  if (!devices.length) {
    return (
      <section style={{ padding: 24, color: 'var(--text-muted, #9ba3c4)' }}>
        <p>{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header — device picker + screech note */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                    borderBottom: '1px solid var(--border, #2d3148)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                       color: 'var(--text-muted, #9ba3c4)', marginRight: 4 }}>Device</span>
        {devices.map((d) => (
          <button key={d.name} type="button"
            onClick={() => { setDeviceName(d.name); setSelectedChannel(null); }}
            style={{
              padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13,
              border: '1px solid var(--border, #2d3148)',
              background: d.name === deviceName ? 'var(--accent, #ff4b4b)' : 'transparent',
              color: d.name === deviceName ? '#fff' : 'var(--text, #fafafa)',
            }}>
            {d.name} <span style={{ opacity: 0.6, fontSize: 11 }}>· {d.channels.length}</span>
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {headerExtra}
        {(screechRegions.length > 0 || capCount > 0) && (
          <span title="A screech was detected and tamed at generation"
                style={{ fontSize: 12, color: 'var(--warn, #ffb547)' }}>
            ⚠ {screechRegions.length} screech tamed{capCount ? ` · ${capCount} caps` : ''}
          </span>
        )}
      </div>

      {/* Body — stats | lanes | monitor */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Left — whole-device stats */}
        <aside style={{ width: 200, flexShrink: 0, padding: '12px 14px', overflowY: 'auto',
                        borderRight: '1px solid var(--border, #2d3148)' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
                        color: 'var(--text-muted, #9ba3c4)', marginBottom: 8 }}>{device?.name}</div>
          <StatRow label="Liveliness" value={summary.liveliness} big />
          <StatRow label="Channels" value={summary.channelCount} />
          <StatRow label="Actions" value={summary.totalActions.toLocaleString()} />
          <StatRow label="Density" value={`${summary.actionsPerSec.toFixed(2)}/s`} />
          <StatRow label="Usable range" value={`${Math.round(summary.usableRange)}`} />
          <StatRow label="Avg velocity" value={`${Math.round(summary.avgVelocity)}`} />
          <StatRow label="Avg stroke" value={`${Math.round(summary.avgStroke)}`} />
          {selectedChannel && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border, #2d3148)' }}>
              <div style={{ fontSize: 11, color: 'var(--accent, #ff4b4b)', marginBottom: 6 }}>{selectedChannel}</div>
              {(() => {
                const pc = summary.perChannel.find((p) => p.name === selectedChannel);
                if (!pc) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>—</div>;
                return <>
                  <StatRow label="Liveliness" value={pc.liveliness} />
                  <StatRow label="Density" value={`${pc.actionsPerSec.toFixed(2)}/s`} />
                  <StatRow label="Range" value={`${Math.round(pc.usableRange)}`} />
                </>;
              })()}
            </div>
          )}

          {perChapter.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border, #2d3148)' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
                            color: 'var(--text-muted, #9ba3c4)', marginBottom: 6 }}>
                Per chapter{selectedChannel ? ` · ${selectedChannel}` : ''}
              </div>
              {perChapter.map((c) => {
                const v = c.liveliness;
                const pct = v != null ? Math.max(3, (v / Math.max(1, liveMax)) * 100) : 0;
                // Warm where lively, dim where it sags — a soft chapter reads cool.
                const hot = v != null ? v / Math.max(1, liveMax) : 0;
                const bar = v == null ? 'var(--border, #2d3148)'
                  : `hsl(${20 + hot * 20}, ${40 + hot * 45}%, ${42 + hot * 10}%)`;
                return (
                  <button key={c.idx} type="button"
                    onClick={() => seek(c.start)}
                    title={`${c.name}${c.tone ? ` · ${c.tone}` : ''} — liveliness ${v ?? '—'}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                             padding: '3px 0', background: 'none', border: 'none', cursor: 'pointer',
                             textAlign: 'left' }}>
                    <span style={{ width: 16, flexShrink: 0, fontSize: 10, fontFamily: 'var(--font-mono, monospace)',
                                   color: 'var(--text-dim, #6b7390)' }}>{c.idx}</span>
                    <span style={{ flex: 1, height: 8, borderRadius: 3, overflow: 'hidden',
                                   background: 'rgba(255,255,255,0.06)' }}>
                      <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: bar }} />
                    </span>
                    <span style={{ width: 20, flexShrink: 0, textAlign: 'right', fontSize: 11,
                                   fontFamily: 'var(--font-mono, monospace)', color: 'var(--text, #fafafa)' }}>
                      {v ?? '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Center — the lane stack (the star) */}
        <main style={{ flex: 1, minWidth: 0, padding: '8px 12px', overflowY: 'auto' }}>
          <ChannelStack
            channels={channels}
            waveform={audio}
            spectrogram={spectrogram}
            spectrogramUrl={spectrogramUrl}
            intensity={intensity}
            events={events}
            beats={beats}
            screechRegions={screechRegions}
            durationMs={durationMs}
            currentMs={currentMs}
            getLiveMs={getLiveMs}
            onSeek={seek}
            selectedChannel={selectedChannel}
            onSelectChannel={setSelectedChannel}
          />
        </main>

        {/* Right — reference monitor, on the same baton. Kept narrow so the
            lane stack (the star) gets the width. */}
        <aside style={{ width: 272, flexShrink: 0, padding: 12,
                        borderLeft: '1px solid var(--border, #2d3148)' }}>
          <MediaViewer
            width="100%"
            videoElRef={videoElRef}
            thumbnailAspect="16/9"
            videoSrc={mediaUrl}
            media={{ kind: mediaKind, title: mediaTitle }}
            funscript={monitorFunscript}
            audioWaveform={monitorAudio || audio}
            spectrogram={spectrogram}
            hideEmptySpectro
            beats={beats}
            batonColorByBeat
            batonWidth={4}
            currentMs={currentMs}
            totalMs={durationMs}
            isPlaying={isPlaying}
            onPlayPause={() => setIsPlaying((p) => !p)}
            onSeek={seek}
            onTimeChange={seek}
            controls={['start', 'back1', 'frame-back', 'play', 'frame-forward', 'forward1', 'end']}
            showSpeed
            showMark={false}
            modeToggleAlign="start"
            modeToggleSize="sm"
          />
        </aside>
      </div>

      {source && (
        <div title={source.path || ''}
             style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px',
                      borderTop: '1px solid var(--border, #2d3148)', fontSize: 11,
                      color: 'var(--text-dim, #6b7390)', fontFamily: 'var(--font-mono, monospace)',
                      whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
                         color: 'var(--text-muted, #9ba3c4)' }}>
            {source.label || 'Output'}
          </span>
          <span style={{ flexShrink: 0, color: 'var(--text, #fafafa)' }}>
            {source.name || '—'}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.7 }}>
            {source.path || ''}
          </span>
        </div>
      )}
    </section>
  );
}

export function StatRow({ label, value, big = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '3px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted, #9ba3c4)' }}>{label}</span>
      <span style={{ fontSize: big ? 20 : 13, fontWeight: big ? 700 : 600,
                     color: big ? 'var(--accent-warm-2, #ffb547)' : 'var(--text, #fafafa)',
                     fontFamily: 'var(--font-mono, monospace)' }}>{value}</span>
    </div>
  );
}
