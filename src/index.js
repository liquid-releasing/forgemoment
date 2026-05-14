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

// Charts — visualisation primitives (v0.0.2 subset; heavy components
// like ScriptChart / ScopePlayer / BpmBandChart deferred until a
// consumer needs them).
export {
  BPM_TIERS,
  BehaviorTagBar,
  ChapterStrip,
  ChartTitleStrip,
  PhraseRibbon,
  bpmTier,
  tagColor,
  tagLabel,
} from './Charts.jsx';
