// forgemoment — barrel exports.
//
// Consumers do `import { MediaViewer, Button, fmtTime } from 'forgemoment'`.
// The shape mirrors the iter 08 design files so the carve-out can be a
// near-mechanical import rewrite in FFP / forgegen / beatflo.

export {
  Icon,
  Button,
  Pill,
  Card,
  Field,
  TextInput,
  Slider,
  Segmented,
  SectionHeading,
  fmtTime,
  fmtTimeShort,
  fmtDurationMs,
} from './primitives.jsx';

export { HoldSeekButton } from './HoldSeekButton.jsx';
export { MediaViewer } from './MediaViewer.jsx';

// ChapterRibbon — rich, scope-aware band strip (waveform + tone + per-band
// 3-dot menu, active+peek layout). Supersedes the lighter ChapterStrip in
// Charts.jsx for any consumer that wants content preview inside the strip.
// Same component will drive the Edit tab's phrase selector.
export { ChapterRibbon } from './ChapterRibbon.jsx';

// PatternRibbon — secondary scope strip for pattern instances inside the
// active chapter. Thinner sibling of ChapterRibbon: mono bands, no wave
// inside (signal lives in the center FunscriptChart pairs), no zoom.
export { PatternRibbon } from './PatternRibbon.jsx';

// ChapterContextStrip — chapter-scoped velocity waveform with overlaid
// clickable bands. Shared across editing tabs that scope to one chapter
// (Patterns: instances; Phrases: phrases; future Beats: beats).
export { ChapterContextStrip } from './ChapterContextStrip.jsx';

// TrackStack — stacked, time-aligned signal lanes (funscript / events /
// audio / spectro / thumbs) over one shared axis + one optional baton.
// The Events-tab editing chassis, reusable by Phrases/Stanzas/Chapters.
// Events lane takes generic spans; vocabulary is consumer-owned.
export { TrackStack } from './TrackStack.jsx';

// AppShell — TopBar, TabStrip, StatusBar, AcceptBar, ScopePicker,
// TabBody, TabHeader, SectionLabel. FFP-specific data (FF_TABS,
// FF_UTILITY_TABS, hardcoded scope picker / logo / help items) is
// consumer-owned via props — never hardcoded in the library.
export {
  AcceptBar,
  ProgressBar,
  ScopePicker,
  SectionLabel,
  StatusBar,
  TabBody,
  TabHeader,
  TabStrip,
  TopBar,
} from './AppShell.jsx';

// TransformPanel — right-side editor for transform authoring.
// `transforms` and `tags` catalogs are consumer-owned (replaces iter
// 08's window.FF_TRANSFORMS / window.FF_TAGS).
export { TransformPanel } from './TransformPanel.jsx';

// Hooks — small reusable React hooks. Kept under src/hooks/ so the
// library's top-level src/ stays a list of components.
export { useNativeWheel } from './hooks/useNativeWheel.js';

// Library — the shared "what's in my collection" data layer. v1 ships
// the scan + config primitives; LibraryView component lands in Phase B.
// Forgemoment stays platform-free; consumers pass an FsAdapter to scan
// and config helpers (see src/library/types.js).
export {
  VIDEO_EXTS,
  AUDIO_EXTS,
  AUDIO_FIDELITY,
  SIDECAR_NAMES,
  scanRoot,
  defaultConfig,
  loadConfig,
  saveConfig,
  addRoot,
  removeRoot,
  renameRoot,
} from './library/index.js';

// Charts — visualisation primitives. Charts.jsx is fully carved out as
// of v0.0.2 (the iter 08 source has no remaining unported components).
export {
  BPM_TIERS,
  BehaviorTagBar,
  BpmBandChart,
  ChapterStrip,
  ChartTitleStrip,
  DiffSparkline,
  MiniWave,
  PhraseDetailZoomChart,
  PhraseRibbon,
  PreviewChart,
  ScopePlayer,
  ScriptChart,
  ShapeGlyph,
  Sparkline,
  VELOCITY_COLOR_STOPS,
  bpmTier,
  interpolateColorStops,
  tagColor,
  tagLabel,
} from './Charts.jsx';

// Analysis — read-only overview surface primitives. Each panel takes
// data-source-agnostic props + a status flag so the consuming app can
// progressively reveal as pipeline stages land. Composed in FF's
// AnalysisTab; ForgeGen + Beatflo are next-up consumers.
export {
  ANALYSIS_CATEGORIES,
  ChapterStripPanel,
  ScriptOverviewRow,
  PitchLine,
  TempoMap,
  BeatStrengthBars,
  EnergyHeatRibbon,
  KpiStrip,
  CategoryPanel,
} from './analysis/AnalysisPanels.jsx';
