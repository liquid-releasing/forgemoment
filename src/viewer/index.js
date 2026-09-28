// Viewer — the review surface: "what did I actually generate?"
//
// Carved out of FunscriptForge's Viewer stage (2026-09-28) so ForgeAssembler
// and ForgePlayer mount the same panel instead of each growing their own.
// `ViewerPanel` is the whole thing; the pieces are exported too, for a host
// that wants the lane stack or the stats without the surrounding layout.
//
// Nothing here touches the filesystem or a backend. The host loads the data
// and converts paths to URLs — see ViewerPanel's "The seam" note.

export { ViewerPanel, StatRow } from './ViewerPanel.jsx';
export { ChannelStack } from './ChannelStack.jsx';
export { computeIntensity } from './intensity.js';
export { resolveMonitorFunscript } from './monitorChannel.js';
export {
  quantile,
  mean,
  computeStats,
  livelinessScore,
  posAt,
  livelinessInWindow,
  analyzeChannels,
} from './stats.js';
