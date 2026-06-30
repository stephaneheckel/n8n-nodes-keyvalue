# External Memory System (`.n8n-keyvalue/`)

> Full spec for the Hermes Agent external memory system powered by `n8n-nodes-keyvalue`.

## Overview

Hermes Agent has a built-in persistent memory limited to ~2,200 characters.
To overcome this limit, an external memory system was designed using the
filesystem-based `n8n-nodes-keyvalue` store under `~/.n8n-keyvalue/`.

This system stores structured markdown files with YAML frontmatter, making
them accessible from **both Hermes Agent** (via `read_file`, `search_files`)
and **n8n workflows** (via KeyValue nodes: Search, Record, Vault, Tag).

## Directory Structure

```
~/.n8n-keyvalue/
├── user/              ← P3 — User identity, preferences, environment
├── conventions/       ← P0 — Coding rules and standards
├── pitfalls/          ← P1 — Common mistakes and error patterns
├── projects/          ← P2 — Per-project documentation
├── ...                ← Other directories are general KeyValue data
```

| Directory | Priority | Purpose | Examples |
|-----------|----------|---------|----------|
| `conventions/` | **P0** | Rules that prevent bugs. Loaded before any matching task. | `error-format.md`, `outputs.md`, `git-workflow.md` |
| `pitfalls/` | **P1** | Mistakes that cost hours of rework. Loaded with conventions. | `imports.md`, `continue-on-fail.md` |
| `projects/` | **P2** | Architectural context for a project. Loaded at task start. | `n8n-nodes-keyvalue.md`, `n8n-nodes-siyuankm.md` |
| `user/` | **P3** | User identity and preferences. Partially redundant with `memory`. | `profile.md`, `preferences.md`, `environment.md` |

## File Naming Convention

- **`user/`**: Short descriptive names — `profile.md`, `preferences.md`
- **`conventions/`**: Short descriptive names — `error-format.md`, `outputs.md`
- **`pitfalls/`**: Short descriptive names — `imports.md`, `continue-on-fail.md`
- **`projects/`**: Repository name — `n8n-nodes-keyvalue.md`

The directory provides context (it's in `conventions/` so it's a convention).
No need to prefix filenames with the domain.

## YAML Frontmatter Schema

Every file uses the same frontmatter structure:

```yaml
---
tags: [domain, subdomain, ...]
description: One-line summary of the file's content
updated: "2026-06-29T14:30:00Z"
---
```

| Field | Required | Purpose |
|-------|----------|---------|
| `tags` | ✅ | Categories for filtering (Tag Filter, Tag → List) |
| `description` | ✅ | Human-readable summary visible in List/Search |
| `updated` | ✅ | ISO 8601 timestamp, auto-populated on Write |

## Hermes Agent — Reading Strategy

### Default flow for a n8n task

```
1. skill_view("n8n-node-development")           ← always
2. search_files("n8n", path="conventions/")     ← rules to enforce
3. search_files("n8n", path="pitfalls/")        ← mistakes to avoid
4. read_file("projects/n8n-nodes-keyvalue.md")  ← project context
```

### General flow for any task

```
1. skill_view(...)                               ← matching skill
2. search_files("<domain>", path="conventions/") ← relevant rules
3. search_files("<domain>", path="pitfalls/")    ← relevant pitfalls
4. read_file("projects/<project>.md")            ← if project-specific
5. search_files("<term>", path="user/")          ← if user preferences needed
```

### Relationship with `memory`

- `memory` (2,200 chars): durable facts, injected automatically every turn
- `.n8n-keyvalue/` files: extended knowledge, read on demand via search_files/read_file
- Both coexist — `memory` for critical always-on facts, files for detailed reference

## n8n Workflows — Access Pattern

| Goal | Node | Configuration |
|------|------|--------------|
| Find a convention | Search → Query | `query: "error format"`, `Tag Filter: "n8n"` |
| Read a file | Record → Read | `directory: "conventions"`, `key: "error-format.md"` |
| List all files | Record → List | `directory: "conventions"`, `Include Frontmatter: true` |
| Browse structure | Vault → Tree | — |
| See stats | Vault → Stats | — |
| All tags used | Tag → List | — |
| Find references | Vault → Backlinks | `Target Path: "conventions/error-format.md"` |
| Inject context | Record → Write | `directory: "conventions"`, `key: "new-rule.md"` |

## Reserved Directories

The four directories above (`user/`, `conventions/`, `pitfalls/`, `projects/`)
are reserved for Hermes memory. Other directories in `~/.n8n-keyvalue/` are
general KeyValue data and can be used freely.

Write access to reserved directories from n8n workflows is **allowed but should
be intentional** — it's a powerful mechanism for injecting context into Hermes.

## Design Decisions

- **Filesystem over database**: plain `.md` files are human-readable, git-friendly,
  and accessible from any tool (n8n, Hermes, VS Code, terminal)
- **YAML frontmatter**: structured metadata enables filtering (tags) and
  navigation (Search, Vault, Tag) without parsing the full content
- **Flat directory per domain**: KeyValue nodes operate on one directory level,
  so subdirectories are not used
- **Coexistence with `memory`**: the built-in `memory` tool is not replaced —
  it remains the primary always-on context, while files provide depth on demand
