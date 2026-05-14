// TransformPanel — right-side editor for transform authoring.
//
// Ported from forge-ui-design/iterations/08-redesign/design_files/TransformPanel.jsx.
// The original walked through three lqr-specific contexts (Phrase
// Editor, Pattern Editor, Catalog Sandbox) and reached for two
// window.* globals — FF_TRANSFORMS (the transform catalog) and
// FF_TAGS (for the "suggested for this phrase tag" hint).
//
// The carve removes those globals; consumers pass `transforms` and
// `tags` as props. Categories are also a prop with a sensible default
// (the same 3 categories iter 08 hardcoded), so non-FFP consumers can
// override or extend without forking.
//
// Layout: 360px right-aligned sidebar. Header (transform label) →
// category radios → transform select → parameter sliders → description
// card → Apply / Cancel apply bar at the bottom.
//
// Transform record shape (per iter 08):
//   {
//     id: string,
//     label: string,
//     category: string,        // matches a `categories[i].id`
//     summary?: string,        // shown below the dropdown
//     description?: string,    // shown in the description card
//     params: [{
//       id, label, min, max, step?, default, unit?
//     }],
//     bestFor?: [tagId, ...],  // tags this transform fits
//   }
//
// Tag record (for the "suggested" lookup):
//   { id, label, color?, primary?: transformId }
//   When phraseTag matches a tag with `primary` set and the user has
//   picked a different transform, a small "Use suggested" link appears.

import { useMemo } from 'react';
import { Button, Icon } from './primitives.jsx';
import { SectionLabel } from './AppShell.jsx';

const DEFAULT_CATEGORIES = [
  { id: 'tone',       label: 'Tone',       hint: '' },
  { id: 'behavior',   label: 'Behavior',   hint: '' },
  { id: 'structural', label: 'Structural', hint: '' },
];

export function TransformPanel({
  // Catalog
  transforms = [],
  tags = [],
  categories = DEFAULT_CATEGORIES,
  // Selection (controlled)
  category, onCategoryChange,
  transformId, onTransformChange,
  params, onParamsChange,
  // Context for the "suggested" hint
  phraseTag,
  // Actions
  applyLabel = 'Apply',
  cancelLabel = 'Cancel',
  onApply, onCancel,
  // Layout
  width = 360,
  hideHeader = false,
}) {
  const tx = transforms.find((t) => t.id === transformId);

  // Filter transforms by the active category; memoised so the dropdown
  // isn't re-filtering on unrelated parent renders.
  const visibleTransforms = useMemo(
    () => transforms.filter((t) => t.category === category),
    [transforms, category],
  );

  // Per-category counts populate the category-radio hint when the
  // consumer hasn't supplied an explicit `hint` for that category.
  // Matches iter 08's "6 options" / "17 options" affordance.
  const categoryCounts = useMemo(() => {
    const acc = {};
    for (const t of transforms) {
      acc[t.category] = (acc[t.category] || 0) + 1;
    }
    return acc;
  }, [transforms]);

  // The "suggested" transform for the current phrase tag — drives the
  // "Use suggested" affordance + the star marker in the dropdown.
  const suggestedId = phraseTag
    ? tags.find((t) => t.id === phraseTag)?.primary
    : null;

  return (
    <aside style={{
      width, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {!hideHeader && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            Transform
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
            {tx ? tx.label : 'Select a transform'}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {/* Category radios — one button per category, equal-width grid */}
        <div style={{ marginBottom: 18 }}>
          <SectionLabel>Category</SectionLabel>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${categories.length}, 1fr)`,
            gap: 6,
          }}>
            {categories.map((c) => {
              const sel = c.id === category;
              const hint = c.hint || (categoryCounts[c.id]
                ? `${categoryCounts[c.id]} option${categoryCounts[c.id] === 1 ? '' : 's'}`
                : '');
              return (
                <button
                  key={c.id}
                  onClick={() => onCategoryChange?.(c.id)}
                  style={{
                    padding: '10px 8px', borderRadius: 6,
                    background: sel ? 'rgba(255,75,75,0.10)' : 'var(--surface-2)',
                    border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                    color: sel ? 'var(--accent-2, #ff7b7b)' : 'var(--text-muted)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{c.label}</span>
                  {hint && (
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{hint}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Transform select. Compact dropdown so the parameter sliders
            stay above the fold on small windows. The "Use suggested"
            affordance only appears when phraseTag is supplied AND the
            current selection isn't already the suggested one. */}
        <div style={{ marginBottom: 18 }}>
          <SectionLabel
            right={
              suggestedId && phraseTag && transformId !== suggestedId
                ? (
                  <button
                    onClick={() => onTransformChange?.(suggestedId)}
                    style={{
                      background: 'none', border: 'none',
                      color: 'var(--accent-2, #ff7b7b)',
                      fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}
                  >
                    Use suggested
                  </button>
                )
                : null
            }
          >
            Transform
          </SectionLabel>
          <select
            value={transformId ?? ''}
            onChange={(e) => onTransformChange?.(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 5,
              background: 'var(--surface-2)', color: 'var(--text)',
              border: '1px solid var(--border)', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {visibleTransforms.length === 0 && (
              <option value="" disabled>No transforms in this category</option>
            )}
            {visibleTransforms.map((t) => {
              const isSuggested = t.id === suggestedId;
              const isFor = phraseTag && (t.bestFor || []).includes(phraseTag);
              const tag = isSuggested ? ' ★ suggested' : isFor ? ' · fits' : '';
              return <option key={t.id} value={t.id}>{t.label}{tag}</option>;
            })}
          </select>
          {tx?.summary && (
            <div style={{
              fontSize: 11, color: 'var(--text-dim)', marginTop: 6,
              lineHeight: 1.45,
            }}>
              {tx.summary}
            </div>
          )}
        </div>

        {/* Parameter sliders */}
        {tx && (tx.params || []).length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel
              right={
                <button
                  onClick={() => {
                    const defs = {};
                    for (const p of tx.params) defs[p.id] = p.default;
                    onParamsChange?.(defs);
                  }}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-dim)',
                    fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}
                >
                  Reset
                </button>
              }
            >
              Parameters
            </SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {tx.params.map((p) => (
                <ParamRow
                  key={p.id}
                  param={p}
                  value={params?.[p.id] ?? p.default}
                  onChange={(v) => onParamsChange?.({ ...(params || {}), [p.id]: v })}
                />
              ))}
            </div>
          </div>
        )}

        {tx && (tx.params || []).length === 0 && (
          <div style={{
            padding: 14, background: 'var(--surface-2)', borderRadius: 6,
            fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5,
          }}>
            <Icon name="info" size={12} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            <strong style={{ color: 'var(--text)' }}>{tx.label}</strong> has no parameters — apply as-is.
          </div>
        )}

        {/* Description card */}
        {tx?.description && (
          <div style={{
            padding: 14, background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 6,
            fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55,
          }}>
            {tx.description}
          </div>
        )}
      </div>

      {/* Apply bar — Cancel on the left, primary Apply on the right
          (2:1 width ratio matches iter 08). */}
      <div style={{
        display: 'flex', gap: 8, padding: '12px 16px',
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
      }}>
        <Button kind="ghost" size="sm" onClick={onCancel} style={{ flex: 1 }}>
          {cancelLabel}
        </Button>
        <Button kind="primary" size="sm" icon="play" onClick={onApply} style={{ flex: 2 }}>
          {applyLabel}
        </Button>
      </div>
    </aside>
  );
}

// Slider + label + min/max footer for one parameter row. Auto-formats
// the value: ints display verbatim with optional unit suffix; fractional
// values render with two decimals.
function ParamRow({ param, value, onChange }) {
  const isInt = (param.step ?? 1) >= 1;
  const display = param.unit
    ? `${value}${param.unit}`
    : (isInt ? value : Number(value).toFixed(2));
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
          {param.label}
        </span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>
          {display}
        </span>
      </div>
      <input
        type="range"
        min={param.min} max={param.max} step={param.step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 10, color: 'var(--text-dim)', marginTop: 2,
      }}>
        <span className="mono">{param.min}</span>
        <span className="mono">{param.max}</span>
      </div>
    </div>
  );
}
