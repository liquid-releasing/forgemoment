// primitives — base UI kit shared by every lqr studio component.
//
// Ported from forge-ui-design/iterations/08-redesign/design_files/primitives.jsx.
// Converted from Babel-in-browser + window globals to ES modules + named
// exports. The Icon component swapped from runtime lucide.createIcons()
// against window.lucide → the official lucide-react package so consumer
// apps don't need a script tag.
//
// All component names keep their original identifiers (Icon, Button,
// Pill, Card, Field, TextInput, Slider, Segmented, SectionHeading,
// fmtTime, fmtTimeShort) so the carve-out can be a near-mechanical
// import-rewrite in the consuming apps.

import { useState, useRef, useEffect } from 'react';
import {
  // Icon name → component map covers every lucide name the design
  // files reference. Adding a new icon is a one-line lookup + dynamic
  // import; falling back to a generic placeholder when an icon name
  // isn't mapped means a typo doesn't crash the app.
  Activity, AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Bookmark, Box, Check, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, Circle, Clock, Cog, Copy, CornerUpLeft, CornerUpRight,
  Cpu, Download,
  Edit, ExternalLink, Eye, EyeOff, File, FileCog, FileText, Film, Folder, FolderOpen,
  GitBranch, Hash, HelpCircle,
  Home, Image, Info, Layers, Library, Link, List, Loader, Lock, LogIn, LogOut,
  Maximize, Menu, MoreHorizontal, MoreVertical, Move, Move3d, Music, Pause, Pencil,
  Play, Plus, Radio, RefreshCcw, RotateCcw, Save, ScanLine, Search, Settings, Settings2,
  Shapes, Share2,
  Scissors, SkipBack, SkipForward, Sliders, Square, Star, StepBack, StepForward,
  Target,
  Trash, Trash2, Upload, UploadCloud, User, Video, Volume2, VolumeX, X, Zap,
  ZoomIn, ZoomOut,
} from 'lucide-react';

const LUCIDE_MAP = {
  activity: Activity, 'alert-circle': AlertCircle, 'alert-triangle': AlertTriangle,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight, bookmark: Bookmark, box: Box, check: Check,
  'chevron-down': ChevronDown, 'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight, 'chevron-up': ChevronUp, circle: Circle,
  clock: Clock, cog: Cog, copy: Copy,
  'corner-up-left': CornerUpLeft, 'corner-up-right': CornerUpRight,
  cpu: Cpu, download: Download, edit: Edit,
  'external-link': ExternalLink, eye: Eye,
  'eye-off': EyeOff, file: File, 'file-cog': FileCog, 'file-text': FileText, film: Film,
  folder: Folder, 'folder-open': FolderOpen, 'git-branch': GitBranch,
  hash: Hash, 'help-circle': HelpCircle,
  home: Home, image: Image, info: Info, layers: Layers, library: Library,
  link: Link, list: List, loader: Loader, lock: Lock, 'log-in': LogIn, 'log-out': LogOut,
  maximize: Maximize, menu: Menu, 'more-horizontal': MoreHorizontal,
  'more-vertical': MoreVertical, move: Move, 'move-3d': Move3d, 'axis-3d': Move3d,
  music: Music, pause: Pause,
  pencil: Pencil, play: Play, plus: Plus, radio: Radio,
  'refresh-ccw': RefreshCcw, 'rotate-ccw': RotateCcw, save: Save,
  'scan-line': ScanLine, search: Search, settings: Settings, 'settings-2': Settings2,
  shapes: Shapes,
  'share-2': Share2, scissors: Scissors, 'skip-back': SkipBack,
  'skip-forward': SkipForward, sliders: Sliders, square: Square, star: Star,
  'step-back': StepBack, 'step-forward': StepForward,
  target: Target,
  trash: Trash, 'trash-2': Trash2, upload: Upload, 'upload-cloud': UploadCloud,
  user: User, video: Video,
  'volume-2': Volume2, 'volume-x': VolumeX, x: X, zap: Zap,
  'zoom-in': ZoomIn, 'zoom-out': ZoomOut,
};

// ─── Icon ─────────────────────────────────────────────────────────
// Drop-in for the Babel-era `<Icon name="play" />` API — accepts the
// same kebab-case lucide names the original code used. Unknown names
// fall back to a small empty span (visible-rect outline removed) so
// design typos don't poison the layout.
export function Icon({ name, size = 16, stroke = 1.75, style = {}, className = '' }) {
  const Component = LUCIDE_MAP[name];
  if (!Component) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[forgemoment] Icon: unknown lucide name "${name}". Add it to LUCIDE_MAP in primitives.jsx.`);
    }
    return <span style={{ width: size, height: size, display: 'inline-block', ...style }} className={className} />;
  }
  return <Component size={size} strokeWidth={stroke} style={{ display: 'inline-block', ...style }} className={className} />;
}

// ─── Button ───────────────────────────────────────────────────────
const ffBtnBase = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '8px 14px', borderRadius: 8,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'transform 150ms var(--ease-standard), box-shadow 150ms var(--ease-standard), background 150ms, border-color 150ms, color 150ms',
  background: 'transparent', color: 'var(--text)',
  whiteSpace: 'nowrap', userSelect: 'none',
};

export function Button({ kind = 'secondary', size = 'md', icon, iconRight, children, disabled, onClick, title, active, style = {}, ...rest }) {
  const sizeStyles = size === 'sm'
    ? { padding: '6px 10px', fontSize: 12, gap: 6 }
    : size === 'icon'
      ? { padding: 8, gap: 0 }
      : {};
  const kindStyles = {
    primary:   { background: 'var(--accent)', color: '#fff' },
    secondary: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' },
    ghost:     { background: 'transparent', color: active ? 'var(--text)' : 'var(--text-muted)' },
    danger:    { background: 'transparent', color: 'var(--danger)', borderColor: 'var(--danger)' },
    success:   { background: 'var(--success)', color: '#0e1117' },
  }[kind];
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const hoverStyle = !disabled && hover ? (
    kind === 'primary' ? { transform: 'translateY(-2px)', boxShadow: 'var(--elev-2)' } :
    kind === 'secondary' ? { borderColor: 'var(--accent)', background: 'rgba(255,75,75,0.06)' } :
    kind === 'ghost' ? { background: 'var(--surface)', color: 'var(--text)' } :
    kind === 'danger' ? { background: 'rgba(255,84,112,0.10)' } : {}
  ) : {};
  const pressStyle = press && !disabled ? { transform: 'none', boxShadow: 'var(--elev-1)' } : {};
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        ...ffBtnBase, ...sizeStyles, ...kindStyles, ...hoverStyle, ...pressStyle,
        ...(active ? { background: 'var(--surface)', color: 'var(--text)' } : {}),
        ...(disabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
        ...style,
      }}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </button>
  );
}

// ─── Pill / Badge ────────────────────────────────────────────────
export function Pill({ tone = 'neutral', dot, children, style = {} }) {
  const palettes = {
    neutral: { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
    success: { background: 'rgba(62,213,152,0.12)', color: '#3ed598' },
    warn:    { background: 'rgba(255,181,71,0.12)', color: '#ffb547' },
    danger:  { background: 'rgba(255,84,112,0.14)', color: '#ff5470' },
    info:    { background: 'rgba(77,171,247,0.12)', color: '#4dabf7' },
    accent:  { background: 'rgba(255,75,75,0.12)', color: '#ff7b7b', border: '1px solid rgba(255,75,75,0.3)' },
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 500, lineHeight: 1.4,
      ...palettes[tone], ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />}
      {children}
    </span>
  );
}

// ─── Card ────────────────────────────────────────────────────────
export function Card({ children, padding = 20, style = {}, hoverable, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--surface)',
        // Split into longhand so the hover override of `borderColor` does
        // not collide with the `border` shorthand (React warns otherwise).
        borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
        borderRadius: 10, padding,
        transition: 'background 150ms, border-color 150ms, box-shadow 150ms',
        ...(hoverable && hover ? { boxShadow: 'var(--elev-1)', borderColor: 'var(--border-strong)', cursor: onClick ? 'pointer' : 'default' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Field wrapper + TextInput ───────────────────────────────────
export function Field({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{label}</label>}
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{hint}</span>}
    </div>
  );
}

export function TextInput({ value, onChange, mono, placeholder, style = {}, ...rest }) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        background: 'var(--surface-2)', border: `1px solid ${focus ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 6, padding: '8px 10px', color: 'var(--text)', outline: 'none',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontSize: 13, ...(focus ? { boxShadow: 'var(--glow-accent)' } : {}), ...style,
      }}
      {...rest}
    />
  );
}

// ─── Slider ──────────────────────────────────────────────────────
export function Slider({ value, min = 0, max = 100, step = 1, onChange, label, valueLabel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(label || valueLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          {label && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>}
          {valueLabel && <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>{valueLabel}</span>}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </div>
  );
}

// ─── Segmented (tab strip) ───────────────────────────────────────
export function Segmented({ options, value, onChange, size = 'default' }) {
  // size='sm' is the compact/dim variant: no surface fill, smaller type,
  // subtler active state. Used in places where the toggle should sit
  // quietly above a viewer (e.g. MediaViewer chapter scope, where the
  // active mode is obvious from the canvas content).
  const sm = size === 'sm';
  return (
    <div style={{
      display: 'inline-flex', padding: sm ? 2 : 3,
      background: sm ? 'transparent' : 'var(--surface-2)',
      borderRadius: sm ? 6 : 8,
      border: '1px solid var(--border)',
    }}>
      {options.map((opt) => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const lbl = typeof opt === 'string' ? opt : opt.label;
        const active = v === value;
        return (
          <button
            key={v}
            onClick={() => onChange?.(v)}
            style={{
              padding: sm ? '2px 8px' : '5px 12px',
              fontSize: sm ? 10 : 12,
              fontWeight: sm ? 500 : 600,
              borderRadius: sm ? 3 : 5,
              border: 'none',
              background: active ? (sm ? 'var(--surface-2)' : 'var(--accent)') : 'transparent',
              color: active ? (sm ? 'var(--text)' : '#fff') : 'var(--text-dim)',
              cursor: 'pointer', transition: 'all 120ms', fontFamily: 'inherit',
              letterSpacing: sm ? '0.02em' : 'normal',
            }}
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

// ─── Section heading ─────────────────────────────────────────────
export function SectionHeading({ title, subtitle, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
        {subtitle && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

// ─── Format helpers ──────────────────────────────────────────────
// fmtTime returns MM:SS.xx (two decimal seconds) — used in time
// readouts that need millisecond precision. fmtTimeShort returns M:SS
// for compact contexts.
export function fmtTime(ms) {
  const s = Math.max(0, ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

// fmtDurationMs is fmtTime's sibling for *lengths* (not timestamps).
// Sub-minute spans render with one decimal second ("18.0s") so users
// can read the slim difference between e.g. 4.3s and 6.2s phrases;
// once you're over a minute the decimal drops and it falls back to m:ss.
export function fmtDurationMs(ms) {
  const total = Math.max(0, ms ?? 0);
  if (total < 60_000) {
    return `${(total / 1000).toFixed(1)}s`;
  }
  const s = Math.floor(total / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtTimeShort(ms) {
  const s = Math.max(0, ms / 1000);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s - m * 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
