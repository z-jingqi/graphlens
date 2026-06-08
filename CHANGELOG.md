# Changelog

GraphLens is a Chrome DevTools extension for inspecting GraphQL traffic across HTTP, WebSocket (`graphql-ws`), and Server-Sent Events (`graphql-sse`). It captures requests and stream frames, provides filtering and full-text search, and shows request details including headers, queries, variables, responses, messages, and collapsible JSON payloads.

## 1.2.1 - 2026-06-08

### Added

- Added grouped rendering for long JSON arrays. Arrays with more than 50 items are displayed as collapsible ranges such as `[0…49]` and `[50…99]`, reducing scroll distance and making large payloads easier to navigate.
- Added search-aware expansion for long-array ranges so only the range containing a matched item opens automatically.

### Changed

- Improved JSON search expansion behavior: matched paths expand automatically, but users can still manually collapse them; the next highlighted search navigation expands them again.
- Improved global search result navigation by syncing clicked search results into the detail-panel find state, so jumped JSON matches can highlight and expand consistently.

### Performance

- Replaced repeated per-node subtree serialization during JSON search with a single search index built per JSON payload and query. JSON nodes now check matched paths directly instead of repeatedly scanning their entire subtree.
- Reduced DOM work for large arrays by rendering collapsed range rows first and only rendering array items inside an expanded range.
