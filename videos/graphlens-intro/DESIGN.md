# GraphLens Intro Video Design

## Style Prompt

A precise DevTools product demo for GraphLens, a Chrome extension that inspects GraphQL traffic. Use a restrained developer-tool interface: light DevTools panels, compact tables, crisp hairline borders, and a warm copper brand accent taken from the extension UI. The video should focus only on the GraphLens DevTools panel, with concise English callouts and no sample website surface.

## Colors

- Background: `#f5f1e8` warm off-white canvas matching GraphLens light mode.
- Surface: `#fffdf8` for DevTools panels.
- Chrome Frame: `#25231f` for browser and DevTools chrome.
- Text: `#2f2a22` for primary copy.
- Muted Text: `#746d62` for secondary labels.
- Brand Accent: `#b66a33` for active tab, highlights, and buttons.
- Success: `#2f9c5c` for successful HTTP responses.
- Query Blue: `#2f8091` for GraphQL query badges and highlights.
- Error Red: `#c9453d` for GraphQL error visibility.

## Typography

- UI and callouts: `Inter`, `SF Pro Display`, `PingFang SC`, system sans-serif.
- Code: `SFMono-Regular`, `Menlo`, `Consolas`, monospace.
- Headline weights stay compact and product-like; no oversized landing-page hero text.

## Motion

- State-driven workflow with short 0.35-0.7s transitions.
- Use table-row pulses, selection highlights, panel slides, and subtle code/detail reveals.
- Keep the browser and DevTools stage stable while callouts and active states change.

## What NOT To Do

- Do not use decorative gradient blobs, neon palettes, or abstract hero illustrations.
- Do not use subtitle bands; labels must be part of the demonstrated UI.
- Do not make a marketing landing page.
- Do not nest UI cards inside cards.
- Do not let hidden scenes occupy layout space; demo stages are fixed-position layers.
- Do not show graphql-ws, GraphQL SSE, or a left search panel in this version.
- Do not use `GQL`, `WS`, or `SSE` badges in the request list; use GraphQL operation badges such as `Q` and `M`.
- Do not show a mouse cursor or border focus frame; use row backgrounds, active chips, and tab states to guide attention.
- Filtered-out rows must collapse out of the request list rather than fade in place.
- Do not show an example website or browser page content; the demo surface is only DevTools.
- Do not show a `live capture` indicator in the upper-right header.
