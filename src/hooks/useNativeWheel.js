// useNativeWheel — attach a non-passive wheel listener to a DOM node.
//
// React's onWheel is passive-by-default per the React 17+ change, which
// silently swallows e.preventDefault() — wheeling over the surface
// scrolls the outer page even though the JSX calls preventDefault.
// This hook binds the listener directly via addEventListener({passive: false})
// so preventDefault works as written.
//
// The handler closure is kept fresh across renders without re-binding
// the native listener — bind once, dispatch through a ref. Avoids the
// add/remove churn that an effect dependency on the handler itself
// would cause.
//
// Use anywhere you want wheel-driven zoom/pan on a fixed surface
// (ribbon, chart, timeline) without losing scroll capture to the page.

import { useEffect, useRef } from 'react';

export function useNativeWheel(elementRef, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return undefined;
    const listener = (e) => {
      if (!e.cancelable) return;
      handlerRef.current(e);
    };
    el.addEventListener('wheel', listener, { passive: false });
    return () => el.removeEventListener('wheel', listener);
  }, [elementRef]);
}
