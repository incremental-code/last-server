# Last Server

A zero-config dev server for the [last-act](../last-act) / [last-router](../last-router) stack, with JSX support.

```
npx last-server src
```

That compiles every `.jsx` under `src/` into a `.last-server/` mirror, then starts last-router pointed at the mirror. The original `src/` is untouched.

## What you write

```jsx
// src/page.jsx
export default function Home({ body }) {
    return <div>
        <h1>{body.title}</h1>
        <p>{body.intro}</p>
    </div>;
}
```

```jsx
// src/[username]/page.jsx
export default function Profile({ params: { username }, body }) {
    return <div>
        <h1>Profile for {username}</h1>
        <p>{body.greeting}</p>
    </div>;
}
```

JSX is transformed with `createElement` from last-act as the factory. Fragments (`<>...</>`) are supported via a tiny shim that returns its children.

`.ts` and `.tsx` are also supported — types are stripped, TSX gets the same JSX treatment as JSX. Imports must use the post-compile `.js` extension (e.g. `import { greet } from './api.js'` even when the source is `api.ts`).

`page.js` and `api.js` files are copied through unchanged, so you can mix JS, JSX, and TS freely.

## CLI

```
last-server <srcDir> [options]

  --port <n>     Port to listen on (default: 3000)
  --out <dir>    Compile output directory (default: .last-server)
  --no-watch     Disable file watching
```

Add `.last-server/` to your `.gitignore`.

## Programmatic

```js
import { startServer } from '@incremental-code/last-server';

await startServer({
    srcDir: './src',
    outDir: './.last-server',
    port: 3000,
});
```

## Notes

- Each saved `.jsx` recompiles in place; the browser sees the new file on reload.
- Module-level changes to server-rendered files require a server restart (Node caches `import()` results).
- For routes, see the [last-router readme](../last-router/readme.md) — folder names map to URL segments, `[name]` becomes `:name`.
- `last-server` exposes a built-in `GET /health` endpoint that returns `200 OK` with body `ok`.
