# External Memory System (`.n8n-keyvalue/memory/`)

> Full spec for the **external memory** — Hermes Agent's on-demand knowledge vault,
> powered by `n8n-nodes-keyvalue`. Companion to **active memory** (built-in `memory` tool).

## Overview

Hermes Agent has two memory systems:

| System | Storage | Size limit | When loaded |
|--------|---------|-----------|-------------|
| **active memory** | Hermes `memory` tool | ~2,200 chars | **Every turn** (injected automatically) |
| **external memory** | `~/.n8n-keyvalue/memory/` | **Unlimited** | **On demand** (search_files / read_file) |

The active memory holds critical always-on facts. The external memory stores
detailed reference material — conventions, pitfalls, project context — in
structured markdown files with YAML frontmatter.

All files live in a **single flat directory** — tags in the YAML frontmatter
provide the taxonomy, not subdirectories. This makes search trivial:
`search_files("n8n", path="~/.n8n-keyvalue/memory/")` finds everything n8n-related
regardless of whether it's a convention, pitfall, or project doc.

## Directory Structure

```
~/.n8n-keyvalue/
├── memory/                   ← Hermes external memory (single flat dir)
│   ├── profile.md            tags: [user, identity]
│   ├── preferences.md        tags: [user, preferences]
│   ├── environment.md        tags: [user, tools]
│   ├── n8n-error-format.md   tags: [n8n, conventions, critical]
│   ├── n8n-outputs.md        tags: [n8n, conventions, critical]
│   ├── git-workflow.md       tags: [git, conventions]
│   ├── n8n-imports.md        tags: [n8n, pitfalls]
│   ├── n8n-continue-on-fail.md tags: [n8n, pitfalls]
│   ├── n8n-nodes-keyvalue.md tags: [project, n8n]
│   ├── n8n-nodes-siyuankm.md tags: [project, n8n, siyuan]
│   └── reserved-directories.md tags: [conventions, memory]
├── db1/                      ← operational KeyValue data
├── counters/                 ← operational KeyValue data
└── ...                       ← other general KeyValue directories
```

## Taxonomy via Tags

No subdirectories. File type is encoded in frontmatter tags:

| Tag category | Example tags | Purpose |
|-------------|-------------|---------|
| Domain | `n8n`, `git`, `hermes` | What the file is about |
| Type | `conventions`, `pitfalls`, `project`, `user` | Kind of content |
| Priority | `critical` | Must-load rules |
| Project | `project`, `siyuan` | Project-specific context |

## File Naming Convention

- User files: short descriptive — `profile.md`, `preferences.md`
- n8n files: `n8n-<topic>.md` — `n8n-error-format.md`, `n8n-imports.md`
- Project files: `<project-name>.md` — `n8n-nodes-keyvalue.md`
- Other: descriptive — `git-workflow.md`, `reserved-directories.md`

## YAML Frontmatter Schema

```yaml
---
tags: [domain, type, priority?]
description: One-line summary
updated: "2026-06-29T14:30:00Z"
---
```

| Field | Required | Purpose |
|-------|----------|---------|
| `tags` | ✅ | Domain + type + priority. Enables Tag Filter and Tag → List |
| `description` | ✅ | Visible in List/Search snippets |
| `updated` | ✅ | ISO 8601, auto-populated on Write |

## Hermes Agent — Reading Strategy

**One directory, one search.** No need to chain multiple `search_files` calls.

```
# Find anything n8n-related (conventions + pitfalls + projects in one search)
search_files("n8n", path="~/.n8n-keyvalue/memory/")

# Filter further with Tag Filter in n8n Search → Query
Tag Filter: "critical"    → only critical rules
Tag Filter: "pitfalls"    → only pitfalls
Tag Filter: "project"     → only project docs
```

### Per-task flow

```
# n8n task
1. skill_view("n8n-node-development")
2. search_files("n8n", path="~/.n8n-keyvalue/memory/")

# Git task
1. search_files("git", path="~/.n8n-keyvalue/memory/")

# New task (unknown domain)
1. search_files("<keyword>", path="~/.n8n-keyvalue/memory/")
```

### Anti-pattern

**Never** search the entire store: `search_files("...", path="~/.n8n-keyvalue/")`
This would mix memory files with operational data (db1, counters, etc.).
Always scope to `~/.n8n-keyvalue/memory/`.

### Relationship with active memory

- **active memory** (2,200 chars): critical facts, injected every turn
- **external memory** (`~/.n8n-keyvalue/memory/`): detailed reference, read on demand
- Both coexist — active memory for always-on context, external memory for depth

## n8n Workflows — Access Pattern

| Goal | Node | Configuration |
|------|------|--------------|
| Find a rule | Search → Query | `query: "error format"`, `Tag Filter: "n8n"` |
| All critical rules | Record → List | `directory: "memory"`, `Tag Filter: "critical"` |
| Read a file | Record → Read | `directory: "memory"`, `key: "n8n-error-format.md"` |
| All tags used | Tag → List | `Directory Filter: "memory"` |
| Browse all files | Record → List | `directory: "memory"`, `Include Frontmatter: true` |
| Inject context | Record → Write | `directory: "memory"`, `key: "new-rule.md"` |

## Reserved Directory

The `memory/` directory under `~/.n8n-keyvalue/` is reserved for Hermes memory.
All other directories are general KeyValue data.

Write access to `memory/` from n8n workflows is **allowed but intentional**
— it's the mechanism for injecting context into Hermes.

## Design Decisions

- **Flat directory**: one search call covers all memory. Tags provide taxonomy
- **Filesystem over database**: plain `.md` files, git-friendly, tool-agnostic
- **YAML frontmatter**: enables filtering without parsing full content
- **Coexistence with active memory**: the built-in `memory` tool is not replaced —
  it remains the always-on context, while external memory provides depth on demand
