# GraphLens

A Chrome DevTools extension for inspecting GraphQL traffic — HTTP, WebSocket (`graphql-ws`), and SSE (`graphql-sse`) — with filtering, full-text search, and detailed request inspection.

## Features

- **Captures all GraphQL transports** — HTTP queries/mutations, WebSocket subscriptions (`graphql-ws`), and Server-Sent Events (`graphql-sse`)
- **Request list** — operation name, status, size, duration; resizable columns; auto-scrolls to newest request
- **Detail panel** — Headers, Query (syntax-highlighted), Variables, Response (JSON tree), Messages / EventStream tabs
- **Filter bar** — filter by operation name or URL, Transport type (Graphql / Graphql-ws / Graphql-sse), and GQL operation type (All / Query / Mutation / Subscription)
- **Full-text search** (⌘F / Ctrl+F) — searches across operation names, URLs, query bodies, variables, response bodies, and WS/SSE frames; click any hit to jump to the matching tab
- **Persisted queries** — handles Apollo-style APQ requests (no `query` field, just `operationName` + `extensions.persistedQuery`)
- **Error visibility** — rows with GraphQL `errors` in the response render with bold red names and a red left border
- **JSON tree viewer** — collapsible, selectable, right-click to copy value or property path
- **Dark mode** — follows system preference

## Installation

### From source

```bash
git clone https://github.com/yourname/graphlens.git
cd graphlens
npm install
npm run build
```

Then load the unpacked extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

### Package for distribution

```bash
npm run package
```

Produces `graphlens.zip` ready for upload to the Chrome Web Store.

## Development

```bash
npm run dev   # watch mode — rebuilds on every file change
```

Reload the extension in `chrome://extensions` after each rebuild to pick up changes.

## Project structure

```
src/
  background/       Chrome service worker
  content/
    patch.ts        Injected script — intercepts fetch/XHR/WS/SSE
    injector.ts     Relays messages from page → DevTools panel
  devtools.ts       Registers the DevTools panel
  panel/
    App.tsx         Root component — layout, state, resize handles
    components/     UI components (FilterBar, RequestTable, DetailPanel, SearchPanel, …)
    hooks/          useNetworkCapture, useSearch
    lib/            Types, filter logic, detection (classifyBody/classifyFrame), settings
    search/         Full-text search engine, highlight helper, types
public/
  manifest.json     Extension manifest (MV3)
```

## Tech stack

- **React 18** + **TypeScript**
- **Tailwind CSS v4**
- **Vite** (build)
- **react-virtuoso** (virtualised request list and frame list)
- **Prism.js** + **graphql** package (query syntax highlighting and formatting)
