// AppShell — TopBar + TabStrip + StatusBar + AcceptBar + page-body
// helpers (TabBody, TabHeader, SectionLabel). Frame for every lqr
// studio app (FFP / forgegen / beatflo / ForgeStream).
//
// Ported from forge-ui-design/iterations/08-redesign/design_files/AppShell.jsx
// with the FFP-specific parts carved into props per the
// REUSABLE_INVENTORY.md plan:
//
//   - FF_TABS / FF_UTILITY_TABS → consumer-owned `tabs` / `utilityTabs`
//     props. Library never hardcodes a tab list.
//   - Logo (was `assets/logo-wide.png`) → `logo` prop (React node, so
//     consumer can pass an <img>, a custom component, or just text).
//   - Top-right action buttons (Undo/Redo/Project/Export) → optional
//     `leftActions` / `rightActions` slots taking React nodes.
//   - ChapterScopePicker → generic `ScopePicker` exported separately;
//     TopBar accepts a `scope` slot for arbitrary pickers, not just
//     chapter ones.
//   - HelpMenu items (FFP-specific URLs) → optional `helpItems` prop;
//     Help button only renders when items are supplied.
//   - Status bar version string → `version` prop.
//
// Everything is composable: a consumer can use just TabBody / TabHeader
// without the TopBar+TabStrip, or build their own shell from primitives
// and only pull in AcceptBar.

import { useState } from 'react';
import { Button, Icon, Pill, fmtTimeShort } from './primitives.jsx';

// ─── TopBar ────────────────────────────────────────────────────────
//
// The very top strip. Logo · file info · optional badge · scope picker
// in the middle · action buttons on the right.
//
// Props:
//   logo          React node — the brand image / wordmark on the left.
//                 Pass null to omit. Consumers typically pass
//                 `<img src="..." style={{ height: 28 }} />`.
//   file          { title, durationMs, phraseCount?, actionCount?, imported? }
//                 Renders the file metadata strip. Pass null to omit.
//   badge         React node — small pill / status indicator beside
//                 the file info. E.g. `<Pill tone="accent" dot>Alpha 0.5</Pill>`.
//   scope         React node — middle slot for an arbitrary scope
//                 picker (typically a `<ScopePicker />`). Pass null
//                 to omit.
//   leftActions   React node — left side of the right-most action group
//                 (typically Undo / Redo).
//   rightActions  React node — right side of the right-most action
//                 group (typically Open Project / Export).
export function TopBar({ logo, file, badge, scope, leftActions, rightActions }) {
  return (
    <header style={{
      height: 'var(--header-h, 56px)',
      padding: '0 18px',
      flexShrink: 0,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}>
      {logo}
      {file && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{file.title}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {fmtTimeShort(file.durationMs)}
            {file.phraseCount != null && ` · ${file.phraseCount} phrases`}
            {file.actionCount != null && ` · ${file.actionCount} actions`}
            {file.imported && ` · imported ${file.imported}`}
          </span>
        </div>
      )}
      {badge}

      <div style={{ flex: 1 }} />
      {scope}
      <div style={{ flex: 1 }} />

      {(leftActions || rightActions) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {leftActions}
          {leftActions && rightActions && (
            <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 6px' }} />
          )}
          {rightActions}
        </div>
      )}
    </header>
  );
}

// ─── ScopePicker ───────────────────────────────────────────────────
//
// Generic scope picker — replaces iter 08's ChapterScopePicker. The
// canonical use is chapter scoping ("All chapters" + per-chapter
// entries), but the same shape handles phrase scope, pattern scope,
// or anything else a consumer wants.
//
// Props:
//   scopes        [{ id, title, color?, start?, end?, meta? }]
//                 Renders one row per entry. `color` paints the swatch;
//                 `start`/`end` (ms) renders the time range on the
//                 right; `meta` is an arbitrary trailing string for
//                 anything else.
//   value         id of the currently-selected scope
//   onChange      (id) => void
//   label         text above the value (default 'Scope')
export function ScopePicker({ scopes = [], value, onChange, label = 'Scope' }) {
  const [open, setOpen] = useState(false);
  const current = scopes.find((s) => s.id === value) ?? scopes[0];
  if (!current) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 12px', borderRadius: 8,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {current.color && (
          <span style={{ width: 10, height: 10, borderRadius: 2, background: current.color }} />
        )}
        <span style={{
          fontSize: 11, color: 'var(--text-dim)', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{current.title}</span>
        <Icon name="chevron-down" size={12} style={{ color: 'var(--text-dim)' }} />
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0,
            minWidth: 240, padding: 4, zIndex: 20,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: 'var(--elev-2)',
          }}
        >
          {scopes.map((s) => (
            <button
              key={s.id}
              onClick={() => { onChange?.(s.id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 10px', borderRadius: 5, border: 'none',
                background: s.id === current.id ? 'var(--surface-2)' : 'transparent',
                color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, textAlign: 'left',
              }}
            >
              {s.color && (
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
              )}
              <span>{s.title}</span>
              {(s.start != null || s.meta) && (
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
                  {s.start != null && s.end != null
                    ? `${fmtTimeShort(s.start)}–${fmtTimeShort(s.end)}`
                    : s.meta}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TabStrip ──────────────────────────────────────────────────────
//
// Horizontal tab list. Pipeline-aware: tabs whose upstream isn't
// `accepted` get a dimmed "not ready" look, and accepted tabs show a
// green dot. Iter 08's FF_TABS / FF_UTILITY_TABS arrays are now
// consumer-owned props.
//
// Tab shape:
//   { id, label, icon, pipeline? }
//
// `pipeline` is the optional key into the `pipelineState` prop —
// usually identical to `id`, but distinct when one pipeline stage
// is exposed across multiple tabs.
//
// Props:
//   tabs            primary tab list (left-aligned)
//   utilityTabs     secondary tab list (right-aligned, separated by
//                   a vertical divider). Optional.
//   active          id of the active tab
//   onChange        (id) => void
//   pipelineState   { [pipelineKey]: { accepted: bool } } — drives
//                   the green-dot + not-ready states. Optional; if
//                   omitted, all tabs render as enabled.
//   helpItems       optional array → renders a Help dropdown at the
//                   far right. Each item: { icon, label, sub?, divider?,
//                   onClick?, href? }. Pass `divider: true` for a rule.
export function TabStrip({
  tabs = [], utilityTabs = [], active, onChange,
  pipelineState = {}, helpItems,
}) {
  return (
    <nav style={{
      display: 'flex', alignItems: 'stretch',
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      padding: '0 18px', gap: 2, flexShrink: 0, overflowX: 'auto',
    }}>
      {tabs.map((t, i) => (
        <TabButton
          key={t.id} tab={t} index={i} list={tabs}
          active={active} pipelineState={pipelineState} onChange={onChange}
        />
      ))}
      <div style={{ flex: 1 }} />
      {utilityTabs.length > 0 && (
        <>
          <div style={{ width: 1, background: 'var(--border)', margin: '8px 8px' }} />
          {utilityTabs.map((t, i) => (
            <TabButton
              key={t.id} tab={t} index={i} list={utilityTabs}
              active={active} pipelineState={pipelineState} onChange={onChange}
            />
          ))}
        </>
      )}
      {helpItems && helpItems.length > 0 && <HelpMenu items={helpItems} />}
    </nav>
  );
}

function TabButton({ tab, index, list, active, pipelineState, onChange }) {
  const isActive = tab.id === active;
  const upstream = index === 0 ? null : list[index - 1];
  const accepted = tab.pipeline ? pipelineState[tab.pipeline]?.accepted : false;
  const upAccepted = !upstream || !upstream.pipeline || pipelineState[upstream.pipeline]?.accepted;
  const notReady = !upAccepted && !isActive;
  return (
    <button
      onClick={() => onChange?.(tab.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 14px', border: 'none',
        background: 'transparent', cursor: 'pointer',
        color: isActive ? 'var(--text)' : (notReady ? 'var(--text-dim)' : 'var(--text-muted)'),
        fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
        borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
        opacity: notReady ? 0.7 : 1,
        position: 'relative',
      }}
    >
      {tab.icon && <Icon name={tab.icon} size={14} />}
      <span>{tab.label}</span>
      {accepted && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--success)',
          boxShadow: '0 0 6px rgba(62,213,152,0.6)',
        }} />
      )}
    </button>
  );
}

function HelpMenu({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 14px', border: 'none', background: 'transparent',
          cursor: 'pointer', color: 'var(--text-muted)',
          fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
          borderBottom: `2px solid ${open ? 'var(--accent)' : 'transparent'}`,
        }}
      >
        <Icon name="help-circle" size={14} />
        <span>Help</span>
        <Icon name="chevron-down" size={11} style={{ color: 'var(--text-dim)' }} />
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 19 }}
          />
          <div style={{
            position: 'absolute', top: 'calc(100% - 1px)', right: 0,
            minWidth: 280, padding: 6, zIndex: 20,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: 'var(--elev-2)',
          }}>
            {items.map((it, i) => it.divider ? (
              <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
            ) : (
              <button
                key={i}
                onClick={() => { it.onClick?.(); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '9px 10px', borderRadius: 5, border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  color: 'var(--text)', fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                {it.icon && <Icon name={it.icon} size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{it.label}</div>
                  {it.sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>{it.sub}</div>}
                </div>
                {it.href && <Icon name="external-link" size={11} style={{ color: 'var(--text-dim)' }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── StatusBar ─────────────────────────────────────────────────────
//
// Bottom strip. Sync indicator, scope hint, chain-file hint, version
// stamp. Every field is optional — pass only what you have.
//
// Props:
//   synced       bool — green check + "Synced" when true (default true)
//   scope        string — current scope (free-form)
//   chainFile    string — name of the chain file the active tab writes
//   version      string — version stamp shown on the right
export function StatusBar({ synced = true, scope, chainFile, version }) {
  return (
    <footer style={{
      height: 'var(--status-h, 28px)', padding: '0 14px', flexShrink: 0,
      background: 'var(--surface)', borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 14,
      fontSize: 11, color: 'var(--text-dim)',
    }}>
      {synced && (
        <span>
          <Icon name="check" size={11} style={{
            verticalAlign: '-1px', color: 'var(--success)', marginRight: 4,
          }} />
          Synced
        </span>
      )}
      {scope && <span className="mono">scope: {scope}</span>}
      {chainFile && <span className="mono">→ {chainFile}</span>}
      <div style={{ flex: 1 }} />
      {version && <span>{version}</span>}
    </footer>
  );
}

// ─── AcceptBar ─────────────────────────────────────────────────────
//
// Bottom-of-tab bar with the canonical "Accept and chain" action.
// Writes a chain file the next tab consumes. Render this once per
// editable tab; consumer wires onAccept / onReset.
//
// Props:
//   summary        primary line of explanatory text
//   chainFile      optional name of the file the action writes
//   accepted       bool — toggles between "Accept and chain" and
//                  "Re-accept" + the Accepted pill
//   onAccept       () => void
//   onReset        () => void
//   primaryLabel   override the primary button label (default
//                  "Accept and chain")
export function AcceptBar({
  summary, chainFile, accepted, onAccept, onReset,
  primaryLabel = 'Accept and chain',
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 22px', background: 'var(--surface)',
      borderTop: '1px solid var(--border)', flexShrink: 0,
    }}>
      <Icon
        name={accepted ? 'check' : 'info'}
        size={16}
        style={{ color: accepted ? 'var(--success)' : 'var(--text-dim)' }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>{summary}</span>
        {chainFile && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            writes <span style={{ color: 'var(--accent-2, #ff7b7b)' }}>{chainFile}</span> · downstream tabs read this file
          </span>
        )}
      </div>
      {accepted && <Pill tone="success" dot>Accepted</Pill>}
      <Button kind="ghost" size="sm" onClick={onReset}>Reset</Button>
      <Button
        kind={accepted ? 'secondary' : 'primary'}
        icon={accepted ? 'rotate-ccw' : 'check'}
        onClick={onAccept}
      >
        {accepted ? 'Re-accept' : primaryLabel}
      </Button>
    </div>
  );
}

// ─── Layout helpers ────────────────────────────────────────────────

export function TabBody({ children, padded = true }) {
  return (
    <div style={{
      flex: 1, minHeight: 0, overflow: 'auto',
      padding: padded ? '24px 28px' : 0,
      background: 'var(--bg)',
    }}>
      {children}
    </div>
  );
}

export function TabHeader({ title, subtitle, eyebrow, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 16, marginBottom: 22,
    }}>
      <div>
        {eyebrow && (
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
          }}>
            {eyebrow}
          </div>
        )}
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
        {subtitle && (
          <div style={{
            fontSize: 13, color: 'var(--text-muted)', marginTop: 6,
            maxWidth: 720, lineHeight: 1.5,
          }}>
            {subtitle}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}

export function SectionLabel({ children, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginBottom: 12,
    }}>
      <span>{children}</span>
      {right}
    </div>
  );
}
