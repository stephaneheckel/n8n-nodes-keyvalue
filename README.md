# n8n-nodes-keyvalue

A filesystem-based key-value store node for [n8n](https://n8n.io). Store, retrieve, list, and delete key-value pairs using plain directories and text files.

```
~/.n8n-keyvalue/          ← your store root
├── customers/            ← a directory
│   ├── alice             ← a record (text file)
│   └── bob
└── orders/
    ├── order_001
    └── order_002
```

## Installation

Install from the n8n community nodes panel, or:

```bash
npm install n8n-nodes-keyvalue
```

No external dependencies — uses only Node.js built-in modules (`fs`, `path`, `os`).

> **Note:** This node operates on the local filesystem and cannot run on n8n Cloud.

## Quick Start

1. Add a **KeyValue** node to your workflow.
2. Select **Directory → Create**, enter `my_dir`.
3. Add another KeyValue node, select **Record → Write**, enter directory `my_dir`, key `greeting`, value `Hello n8n!`.
4. Add a third node, **Record → Read**, same directory and key — outputs `Hello n8n!`.

## Operations Reference

### Counter Resource

| Operation | Fields | Description | Output |
|-----------|--------|-------------|--------|
| **Get** | Counter Name (required) | Reads the current counter value | `{ "counter": "name", "value": 42 }` |
| **Increment** | Counter Name, Increment By, Start At | Increments a counter and returns the new value. Creates it at `startAt` on first call | `{ "counter": "name", "value": 43 }` |
| **Reset** | Counter Name, Reset To | Resets a counter to a target value | `{ "counter": "name", "value": 0 }` |

- **Increment By** (default `1`) — amount to add each call.
- **Start At** (default `0`) — value to create the counter at if it doesn't exist yet. Ignored once the counter exists.
- **Reset To** (default `0`) — value to set the counter to on reset.
- Counters are stored as plain text files under `counters/` in the base directory.
- **Get** and **Reset** on a non-existent counter throw an error.

### Directory Resource

| Operation | Field | Description | Output |
|-----------|-------|-------------|--------|
| **Create** | Directory Name (required) | Creates a new directory | `{ "directory": "name", "created": true }` |
| **Delete** | Directory Name (required) | Deletes a directory and all its records | `{ "directory": "name", "deleted": true }` |
| **List** | — | Lists all directories | `[{ "directory": "name1" }, { "directory": "name2" }]` |

### Record Resource

| Operation | Fields | Description | Output |
|-----------|--------|-------------|--------|
| **Append** | Directory Name, Key, Value, Separator | Appends value to a record (creates if missing) | `{ "directory": "name", "key": "k", "value": "...", "appended": true }` |
| **Count** | Directory Name, Key Filter | Counts records in a directory with optional glob filter. Does NOT read file contents — only directory metadata | `{ "directory": "name", "count": 5 }` |
| **Delete** | Directory Name, Key | Deletes a record | `{ "directory": "name", "key": "k", "deleted": true }` |
| **Exists** | Directory Name, Key | Checks if a record exists without throwing an error | `{ "directory": "name", "key": "k", "exists": true }` |
| **List** | Directory Name, Key Filter, Value Filter | Lists records (with optional glob + content filters) | `[{ "directory": "name", "key": "k", "value": "..." }]` |
| **Read** | Directory Name, Key | Reads a record's value. JSON objects/arrays are auto-parsed | `{ "directory": "name", "key": "k", "value": "..." }` |
| **Write** | Directory Name, Key, Value | Creates/overwrites a record. JSON objects/arrays are auto-detected and stored as parsed JSON | `{ "directory": "name", "key": "k", "value": "...", "written": true }` |

### List Filters

- **Directory Filter** (Directory → List) — glob pattern on directory names. `*` matches any characters, `?` matches one. Example: `prod_*` matches `prod_eu`, `prod_us`.
- **Key Filter** (Record → List, Count) — glob pattern on filename. `*` matches any characters, `?` matches one. Example: `user_*` matches `user_alice`, `user_bob`.
- **Value Filter** (Record → List) — substring match inside file content. Example: `active` returns only records containing "active".
- All filters combined use AND logic. Empty = match all.

### Append Separator

The **Separator** field on Record → Append defaults to a newline. You can type `\n` for a newline, use `,` for CSV-style, or leave empty for direct concatenation.

## Examples

### Counter: basic counting

```
KeyValue (Counter → Increment, name: "page_visits")
  → first call returns { "counter": "page_visits", "value": 1 }
  → second call returns { "counter": "page_visits", "value": 2 }
```

```
KeyValue (Counter → Reset, name: "page_visits")
  → returns { "counter": "page_visits", "value": 0 }
```

### Counter: starting at a custom value

```
KeyValue (Counter → Increment, name: "invoice", Start At: 1000)
  → first call returns { "counter": "invoice", "value": 1001 }
  → second call returns { "counter": "invoice", "value": 1002 }
```

### Create a directory and write a record

```
KeyValue (Directory → Create, name: "config")
  → KeyValue (Record → Write, directory: "config", key: "api_url", value: "https://api.example.com")
```

### List all directories, then delete one

```
KeyValue (Directory → List)
  → KeyValue (Directory → Delete, name: "old_dir")
```

### Filter records by pattern

```
KeyValue (Record → List, directory: "users", Key Filter: "admin_*")
  → returns only keys starting with "admin_"
```

### Count records in a directory

```
KeyValue (Record → Count, directory: "users", Key Filter: "admin_*")
  → returns { "directory": "users", "count": 3 }
```

### Conditional branching with Exists

```
KeyValue (Record → Exists, directory: "cache", key: "latest_report")
  → returns { "directory": "cache", "key": "latest_report", "exists": true }
  → use {{ $json.exists }} in an IF node to branch
```

### JSON auto-detection

When you write a record whose value is a valid JSON object or array (`{...}` / `[...]`), it is stored as structured JSON and automatically parsed back on Read and List:

```
KeyValue (Record → Write, directory: "contacts", key: "jean",
  value: {"prenom": "Jean", "nom": "Dupont", "telephone": "+33 6 12 34 56 78"})
  → stored as formatted JSON on disk

KeyValue (Record → Read, directory: "contacts", key: "jean")
  → returns { "prenom": "Jean", "nom": "Dupont", ... }
  → use {{ $json.value.prenom }} in downstream nodes

KeyValue (Record → Write, directory: "contacts", key: "jean_copy",
  value: {{ $json.value }})
  → the parsed array/object is passed directly and stored as JSON
```

Plain text, numbers, and booleans are stored as-is (strings). Only `{...}` and `[...]` trigger JSON mode. The Append operation always treats values as plain text.

## Data Model

| n8n concept | Filesystem |
|-------------|------------|
| Counter | Plain text file under `counters/` containing a number |
| Directory | Subdirectory under `~/.n8n-keyvalue/` |
| Record (key-value pair) | File whose name is the key, contents are the value |
| Value | Plain UTF-8 text stored in the file. JSON objects/arrays ({...} / [...]) are auto-detected on Write and auto-parsed on Read |
| Count | Lightweight tally of records in a directory — no file contents read |
| Exists | `fs.existsSync` check — no file contents read, never throws |

## KeyValue Use Cases

When building robust automation in n8n, certain heavy lifting, like initializing an environment or creating a specific SQL table, should only happen exactly once. By pairing the n8n-nodes-keyvalue community node with the built-in `$workflow.id` variable, you can seamlessly track initialization states across executions without complex error-handling.

![Run-once initialization workflow](assets/run-once-init.png)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `N8N_KEYVALUE_DIR` | `~/.n8n-keyvalue` | Override the base directory. Useful for Docker / persistent volume mounts. |

### Setting up a persistent directory (Docker)

If your n8n container has a persistent volume at `/home/node/.n8n`, set up KeyValue inside it:

```bash
# Inside the container (or add to your Dockerfile/entrypoint)
mkdir -p /home/node/.n8n/keyvalue
```

Then set the environment variable on your n8n container:

```
N8N_KEYVALUE_DIR=/home/node/.n8n/keyvalue
```

All directories and records will now be stored under `/home/node/.n8n/keyvalue/` and survive container restarts.

> **Security note:** If your n8n instance has `N8N_RESTRICT_FILE_ACCESS_TO` set, include the KeyValue directory in its semicolon-separated list:
> ```
> N8N_KEYVALUE_DIR=/home/node/.n8n/keyvalue
> N8N_RESTRICT_FILE_ACCESS_TO=/home/node/.n8n
> ```

## Limitations

- **No input validation:** Directory names and record keys are passed directly to the filesystem. Invalid characters (`/`, `<`, `>`, `:`, `"`, `\`, `|`, `?`, `*`) will cause OS-level errors. Stick to alphanumeric names, hyphens, and underscores for now.

## Development

```bash
git clone https://github.com/stephaneheckel/n8n-nodes-keyvalue.git
cd n8n-nodes-keyvalue
npm install --legacy-peer-deps
npm run build
npm run dev        # starts n8n with hot-reload at localhost:5678
```

## License

MIT
