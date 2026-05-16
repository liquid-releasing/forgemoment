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
} from './primitives.jsx';

export { HoldSeekButton } from './HoldSeekButton.jsx';
export { MediaViewer } from './MediaViewer.jsx';

// ChapterRibbon — rich, scope-aware band strip (waveform + tone + per-band
// 3-dot menu, active+peek layout). Supersedes the lighter ChapterStrip in
// Charts.jsx for any consumer that wants content preview inside the strip.
// Same component will drive the Edit tab's phrase selector.
export { ChapterRibbon } from './ChapterRibbon.jsx';

// AppShell — TopBar, TabStrip, StatusBar, AcceptBar, ScopePicker,
// TabBody, TabHeader, SectionLabel. FFP-specific data (FF_TABS,
// FF_UTILITY_TABS, hardcoded scope picker / logo / help items) is
// consumer-owned via props — never hardcoded in the library.
export {
  AcceptBar,
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
  Sparkline,
  bpmTier,
  tagColor,
  tagLabel,
} from './Charts.jsx';
