// library/index.js — barrel for the library data layer.
//
// Phase A ships the data shapes + scan + config. Phase B will add
// LibraryView (component) and LibraryCard (default card slot) and
// re-export them through here.

export {
  VIDEO_EXTS,
  AUDIO_EXTS,
  AUDIO_FIDELITY,
  SIDECAR_NAMES,
} from './types.js';

export {
  scanRoot,
  _internal as _scanInternals,
} from './scan.js';

export {
  defaultConfig,
  loadConfig,
  saveConfig,
  addRoot,
  removeRoot,
  renameRoot,
} from './config.js';
