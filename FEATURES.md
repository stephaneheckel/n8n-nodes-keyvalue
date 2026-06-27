# Proposed Features

Ideas for future `n8n-nodes-keyvalue` releases. Not a roadmap — just a holding pen.

## Implemented (v0.5.0)

- **Touch** — update record timestamp without changing content. Creates if missing. Trigger-compatible.
- **Filter-based Delete** — single-key or bulk deletion via Key Filter + Value Filter, same UX as List.
- **Counter** — atomic increment/get/reset for numeric values.
- **Trigger** — polling-based watcher on directories, detects add/change via mtime.

---

## Quick Wins (single `fs` call, 10-15 lines each)

| # | Resource | Operation | Node.js call | Use case |
|---|----------|-----------|-------------|----------|
| 1 | Directory | **Exists** | `fs.existsSync()` | Branch without catching errors, same pattern as Record Exists |
| 2 | Directory | **Rename** | `fs.renameSync()` | Reorganize directories without delete + recreate |
| 3 | Record | **Rename** | `fs.renameSync()` | Change a key without read + write + delete |
| 4 | Record | **Copy** | `fs.copyFileSync()` | Clone a record (templates, backups) |
| 5 | Record | **Stat** | `fs.statSync()` | File size, mtime, birthtime — metadata without reading content |
| 6 | Record | **Touch** | `fs.utimesSync()` + `fs.openSync('w')` | ✅ Done |

## Solid Additions (more logic, still zero-deps)

| # | Resource | Operation | What it does |
|---|----------|-----------|-------------|
| 7 | Directory | **Stats** | File count + total size + oldest/newest mtime — one `readdirSync` + loop |
| 8 | Directory | **Empty** | Delete all records inside without removing the directory itself |
| 9 | Record | **Bulk Copy / Move** | Copy or move records matching a filter between directories |
| 10 | Record | **Prepend** | Write value at the *beginning* of a file (complement to Append) |
| 11 | Cross | **Search** | Search all directories for records containing a value substring |
| 12 | Cross | **Export** | Dump entire store as a single JSON object `{ dir: { key: value } }` |

## Niche but Useful

| # | Resource | Operation | Use case |
|---|----------|-----------|----------|
| 13 | Record | **Lock / Acquire** | Atomic create via `wx` flag — distributed mutex between workflows. Release = Delete. |

## Killer Feature

### Scheduled Records (temporal key-value pairs)

Write a record with `Activate At` (future timestamp) and/or `TTL` (seconds). The file lives on disk but is invisible until activation. After TTL expires, it becomes invisible again.

**Fields:**
- `Activate At` (optional) — ISO 8601 timestamp. Record invisible to Read/List/Exists/Trigger until this time.
- `TTL` (optional) — seconds. Record auto-expires this long after activation. Invisible after expiry.

**Use cases:**
- **Delayed task execution** — Write with future activation time, Trigger fires on activation
- **Temporary locks** — TTL guarantees release even if workflow crashes
- **Cache with expiry** — Write expensive result with TTL, auto-refresh on miss
- **Rate limit windows** — Short TTL creates natural windows with zero cleanup

**Why zero dependencies:** No timers, no background processes. Read/List/Exists simply check `Date.now()` against metadata. Expired records are invisible. Physical cleanup is lazy.

---

## Papercuts

Small fixes and UX improvements — quick wins.

| # | Description |
|---|-------------|
| 18 | Add `\t` (tab) normalization to the Separator field, alongside existing `\n` |

## Other Ideas

| # | Scope | Description |
|---|-------|-------------|
| 14 | CLI | `kv` command-line interface — thin wrapper over `utils.ts`, all 14 ops from terminal |
| 15 | Config | Base Directory override — per-node field instead of `N8N_KEYVALUE_DIR` env var only |
| 16 | New Package | `n8n-nodes-duckdb` — SQL queries on Parquet/CSV/JSON files via DuckDB |
| 17 | Auth | API key authentication via n8n credential system — guard node execution with `N8N_KEYVALUE_API` env var |
