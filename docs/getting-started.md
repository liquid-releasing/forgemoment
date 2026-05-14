# Getting started

## Install

forgemoment isn't on npm yet. Consume it via git or a local workspace
link until [the publish task](maintainer-notes.md#open-roadmap-items)
ships.

### Option A — git dependency

```bash
npm install github:liquid-releasing/forgemoment#v0.0.2
```

Pin to a tag (`#v0.0.2`) rather than the branch — `main` may move.

### Option B — local workspace link

When you're developing the consumer and the library side-by-side:

```bash
# In forgemoment/
npm link

# In your consumer app/
npm link forgemoment
```

Changes in `forgemoment/dist/` show up immediately. Run
`npm run build` in `forgemoment/` after editing source.

## Peer dependencies

```json
{
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  }
}
```

`react` and `react-dom` are **peer** — forgemoment expects the
consumer to bring its own copy. `lucide-react` is a regular dep,
pulled in automatically.

## Design tokens

forgemoment ships its design tokens as a CSS file. Import it once
at the top of your app:

```jsx
import 'forgemoment/styles';
```

This pulls in [`tokens.css`](https://github.com/liquid-releasing/forgemoment/blob/main/src/tokens.css)
which declares CSS variables (`--bg`, `--surface`, `--text`,
`--accent`, `--font-mono`, etc.) that every component uses.

You can override any token by redeclaring it later in your CSS — the
components don't hardcode colors:

```css
:root {
  --accent: #7e5cef;        /* override the default accent */
  --bg: #0a0b0d;
}
```

## First component

```jsx
import { Button, Pill } from 'forgemoment';
import 'forgemoment/styles';

export function App() {
  return (
    <div style={{ padding: 24 }}>
      <Button kind="primary" icon="play">Start</Button>
      <Pill tone="success" dot>ready</Pill>
    </div>
  );
}
```

If you see unstyled buttons, you missed the `'forgemoment/styles'`
import — that brings in the variables every component reads from.

## Dev loop in the library itself

Working on forgemoment? Three commands:

```bash
npm run dev      # playground at http://localhost:5174
npm run build    # library bundle into dist/
npm run preview  # preview the production build
```

The playground (`src-playground/`) aliases `forgemoment` →
`src/index.js` so imports in playground code look identical to what
consumer apps will write. See
[Maintainer notes](maintainer-notes.md#playground-aliasing) for
why this matters.

## Folder layout

```
forgemoment/
  src/                  library source (consume via the npm package)
    index.js            barrel — every export
    primitives.jsx      Icon, Button, Pill, Card, ...
    MediaViewer.jsx     master clock
    HoldSeekButton.jsx  press-and-hold seek ramp
    Charts.jsx          ScriptChart, BpmBandChart, ChapterStrip, ...
    AppShell.jsx        TopBar, TabStrip, StatusBar, ...
    TransformPanel.jsx  right-side parametric editor
    tokens.css          CSS variables
  src-playground/       dogfood app, not shipped
  docs/                 you are here
  dist/                 build output (gitignored)
```

> **Maintainer note** — the playground was built deliberately as a
> dogfood surface: every component there exercises every callback
> the component exposes. If a component lacks playground coverage,
> the API probably hasn't been validated.
