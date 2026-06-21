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
| **Delete** | Directory Name, Key | Deletes a record | `{ "directory": "name", "key": "k", "deleted": true }` |
| **List** | Directory Name, Key Filter, Value Filter | Lists records (with optional glob + content filters) | `[{ "directory": "name", "key": "k", "value": "..." }]` |
| **Read** | Directory Name, Key | Reads a record's value | `{ "directory": "name", "key": "k", "value": "..." }` |
| **Write** | Directory Name, Key, Value | Creates/overwrites a record | `{ "directory": "name", "key": "k", "value": "...", "written": true }` |

### List Filters

- **Directory Filter** (Directory → List) — glob pattern on directory names. `*` matches any characters, `?` matches one. Example: `prod_*` matches `prod_eu`, `prod_us`.
- **Key Filter** (Record → List) — glob pattern on filename. `*` matches any characters, `?` matches one. Example: `user_*` matches `user_alice`, `user_bob`.
- **Value Filter** (Record → List) — substring match inside file content. Example: `active` returns only records containing "active".
- All filters combined use AND logic. Empty = match all.

### Append Separator

The **Separator** field on Record → Append defaults to a newline. You can type `\n` for a newline, use `,` for CSV-style, or leave empty for direct concatenation.

## Examples

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

## Data Model

| n8n concept | Filesystem |
|-------------|------------|
| Directory | Subdirectory under `~/.n8n-keyvalue/` |
| Record (key-value pair) | File whose name is the key, contents are the value |
| Value | Plain UTF-8 text stored in the file |

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
