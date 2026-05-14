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

// Charts — visualisation primitives (subset; ScopePlayer / BpmBandChart
// / PreviewChart still deferred until a consumer needs them).
export {
  BPM_TIERS,
  BehaviorTagBar,
  ChapterStrip,
  ChartTitleStrip,
  PhraseRibbon,
  ScriptChart,
  bpmTier,
  tagColor,
  tagLabel,
} from './Charts.jsx';
