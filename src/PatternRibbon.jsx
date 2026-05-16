// PatternRibbon — secondary scope strip showing pattern instances inside
// the active chapter. Sibling to ChapterRibbon, one level deeper:
//
//   ChapterRibbon   : which chapter am I editing
//   PatternRibbon   : which pattern instance inside that chapter
//
// Visually thinner and simpler than ChapterRibbon:
//   - Mono bands, one color per pattern *type* (matches left-rail chip)
//   - No internal waveform — the velocity-colored signal lives in the
//     center FunscriptChart pairs, not here. Ribbon = context, chart =
//     signal.
//   - Selection ring (white border) on the active instance.
//   - No wheel-zoom, no drag-pan. Bands are positioned proportionally
//     to the chapter's `(viewStart, viewEnd)` span.
//
// Bands shape:
//   [{ id, at_ms, end_ms, color, patternId? }]
// `color` is the pattern-type tint (consumer-resolved from a catalog,
// so two instances of "Steady" share one color). `patternId` is opaque
// to the ribbon and passed back via onSelect.

import { useEffect, useRef, useState } from 'react';

const HEIGHT_DEFAULT = 28;
const MIN_BAND_PX = 2;
const MIN_LABEL_PX = 44;     // hide band label when the band is narrower than this

export function PatternRibbon({
  bands,                    // pattern instances in scope
  viewStart,                // ms — chapter start
  viewEnd,                  // ms — chapter end
  selectedId,
  onSelect,                 // (band) => void
  height = HEIGHT_DEFAULT,
}) {
  const wrapRef = useRef(null);
  const [pxWidth, setPxWidth] = useState(800);
  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setPxWidth(entry.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const sorted = (bands || []).slice().sort((a, b) => a.at_ms - b.at_ms);
  const span = Math.max(1, viewEnd - viewStart);
  const xFor = (ms) => ((ms - viewStart) / span) * pxWidth;

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative', height, width: '100%',
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 6, overflow: 'hidden', userSelect: 'none',
      }}
      title="Click a pattern instance to focus"
    >
      {sorted.map((band) => {
        const leftPx = xFor(band.at_ms);
        const rightPx = xFor(band.end_ms);
        const widthPx = Math.max(MIN_BAND_PX, rightPx - leftPx - 1);
        if (rightPx < 0 || leftPx > pxWidth) return null;
        const selected = band.id === selectedId;
        const color = band.color || '#6b7280';
        const showLabel = widthPx >= MIN_LABEL_PX && band.name;
        return (
          <button
            key={band.id}
            onClick={() => onSelect?.(band)}
            title={band.name || band.id}
            style={{
              position: 'absolute',
              left: leftPx, top: 2, width: widthPx, height: height - 4,
              background: color,
              opacity: selected ? 0.95 : 0.55,
              border: selected ? '1.5px solid #ffffff' : '1px solid transparent',
              borderRadius: 3,
              padding: 0,
              cursor: 'pointer',
              boxSizing: 'border-box',
              fontFamily: 'inherit', fontWeight: 700, fontSize: 11,
              color: '#0e1117',
              textShadow: '0 0 4px rgba(255,255,255,0.25)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >{showLabel ? band.name : null}</button>
        );
      })}
    </div>
  );
}
