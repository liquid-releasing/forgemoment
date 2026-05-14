# Master clock contract

`MediaViewer` is the **single source of time** for any lqr studio
app. The parent app owns the playhead (`currentMs`); MediaViewer
emits an `onTimeChange(ms)` signal whenever that playhead moves; any
number of sibling sub-views subscribe to it and stay locked.

This is the load-bearing pattern of the whole library — every chart
component, every transform preview, every haptics output, anything
that needs to know "where are we right now" reads from this one
source. Get this right and the rest of the API stops feeling
arbitrary.

## The contract

```jsx
function Editor() {
  const [currentMs, setCurrentMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <>
      <MediaViewer
        currentMs={currentMs}
        isPlaying={isPlaying}
        onSeek={setCurrentMs}
        onPlayPause={() => setIsPlaying((p) => !p)}
        onTimeChange={(ms) => {
          // Fan out to every subscriber. This fires on every play-loop
          // tick, every seek, every HoldSeekButton ramp step.
          stimPanel.setTime(ms);
          haptics.setTime(ms);
        }}
      />

      {/* Siblings read currentMs as the single source */}
      <StimTimeline currentMs={currentMs} />
      <MultiAxisPreview currentMs={currentMs} />
      <BpmBandChart actions={...} currentMs={currentMs} onSeek={setCurrentMs} />
    </>
  );
}
```

Three rules:

1. **Parent owns `currentMs`.** Components are controlled — they
   never hold the playhead in local state.
2. **MediaViewer emits `onTimeChange(ms)` for *every* change.**
   Including: play-loop ticks, user seeks, frame-jog, HoldSeekButton
   ramp, programmatic seeks. There's no separate "tick" vs "seek"
   event; consumers don't care which it is.
3. **Siblings receive `currentMs` as a prop.** They don't subscribe
   to MediaViewer directly. The parent is the bus.

## Why one-way

The natural alternative is to put `currentMs` inside MediaViewer and
let siblings subscribe with an `imperativeHandle` ref API. We don't
do that. The parent-owns model has three wins:

- **Time travel debugging works.** `currentMs` is just state, so
  React DevTools shows it, you can scrub it from outside MediaViewer,
  and you can snapshot it for replay.
- **No subscriber lifecycle to manage.** Sibling components mount
  and unmount freely. They don't need to register / deregister with
  MediaViewer.
- **The seek button on a sibling chart works the same way as the
  seek inside MediaViewer.** Both call `setCurrentMs`. Both fire
  `onTimeChange` on the next render because parent state flowed
  back down.

## When MediaViewer doesn't fire onTimeChange

`onTimeChange` is *informational*. It fires when MediaViewer
notices the playhead changed — including changes the parent made
itself. To prevent feedback loops, parent code that calls
`setCurrentMs` should treat `onTimeChange` as a re-broadcast, not a
fresh event.

In practice this means: subscribers (Stim panel, haptics, multi-axis
preview) read `currentMs` from the parent, not from `onTimeChange`.
The hook is there for **non-React** subscribers — anything outside
the component tree (a WebSocket broadcaster, a Web Audio API
scheduler, an OSC bridge) that needs the time stream as an
imperative signal.

## Scope-aware playback

When MediaViewer has a `chapter` prop, the baton, audio waveform,
and funscript curve all render scoped to that chapter (chapter-
relative). When `currentMs` is outside the chapter, the baton goes
faded with a directional chip:

| State | Display |
|---|---|
| `currentMs < chapter.start` | Faded baton at left edge, `← before start` chip |
| `chapter.start ≤ currentMs ≤ chapter.end` | Solid baton at the correct position |
| `currentMs > chapter.end` | Faded baton at right edge, `past end →` chip |

This was a v0.0.1 dogfood fix — the original behavior silently
parked the baton at the left edge whenever the playhead was outside
the chapter, and users read that as "the baton is broken." The
faded-state-with-chip pattern makes the truth visible.

## Frame-jog pauses

The frame-step buttons (`◀` / `▶`) pause if `isPlaying` before
stepping. If a user clicks frame-forward during playback, the
playback loop would have advanced past the new ms instantly,
making the button look broken. The component now flips `isPlaying`
false first, then seeks.

> **Maintainer note** — both the out-of-scope baton and the
> frame-jog pause came from the v0.0.1 dogfood session. They're not
> abstract design — they're scar tissue. If you change MediaViewer's
> internals, leave these behaviors in place.

## +Mark — the generic integration point

MediaViewer has a single labeled "create a thing here" button. It
fires `onMark(currentMs)`; the label comes from `markLabel`. Old
callers passing `onCreateChapter` / `showCreateChapter` still work
as back-compat aliases — drop them when you migrate.

```jsx
<MediaViewer markLabel="Chapter" onMark={(ms) => createChapter(ms)} />
<MediaViewer markLabel="Beat"    onMark={(ms) => beats.push(ms)} />
<MediaViewer markLabel="Note"    onMark={(ms) => openNoteEditor(ms)} />
```

`showMark={false}` hides the button entirely when the consuming app
doesn't need a marking action.

> **Maintainer note** — the original name was `onCreateChapter`,
> FFP-specific. It was renamed during the v0.0.1 dogfood because
> beatflo + forgegen want the same button to mean different things.
> The generic name is the load-bearing decision; the back-compat
> aliases exist purely so the rename doesn't break in-flight FFP
> code during the carve-in.

## Subscribing from outside React

If you have a non-React consumer (a WebSocket bridge, an audio
worklet, a hardware output thread), wire `onTimeChange` to a
plain JS object:

```jsx
const clock = {
  ms: 0,
  listeners: new Set(),
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
};

<MediaViewer
  currentMs={currentMs}
  onTimeChange={(ms) => {
    clock.ms = ms;
    clock.listeners.forEach((fn) => fn(ms));
  }}
/>
```

This is what the FFP haptics bridge does. It's not part of the
library — forgemoment doesn't ship a clock-pub-sub primitive. Roll
your own when you need it.
