# n8n-nodes-keyvalue

A filesystem-based key-value store node for [n8n](https://n8n.io). Store, retrieve, list, and delete key-value pairs using plain directories and text files.

```
~/.n8n-keyvalue/          ← your database root
├── customers/            ← a table (subdirectory)
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
2. Select **Database → Create**, enter `my_db`.
3. Add another KeyValue node, select **Table → Write**, enter table `my_db`, key `greeting`, value `Hello n8n!`.
4. Add a third node, **Table → Read**, same table and key — outputs `Hello n8n!`.

## Operations Reference

### Database Resource

| Operation | Field | Description | Output |
|-----------|-------|-------------|--------|
| **Create** | Database Name (required) | Creates a new table (subdirectory) | `{ "database": "name", "created": true }` |
| **Delete** | Database Name (required) | Deletes a table and all its records | `{ "database": "name", "deleted": true }` |
| **List** | — | Lists all tables | `[{ "database": "name1" }, { "database": "name2" }]` |

### Table Resource

| Operation | Fields | Description | Output |
|-----------|--------|-------------|--------|
| **Read** | Table Name, Key | Reads a record's value | `{ "table": "name", "key": "k", "value": "..." }` |
| **Write** | Table Name, Key, Value | Creates/overwrites a record | `{ "table": "name", "key": "k", "value": "...", "written": true }` |
| **Delete** | Table Name, Key | Deletes a record | `{ "table": "name", "key": "k", "deleted": true }` |
| **List** | Table Name, Key Filter, Value Filter | Lists records (with optional glob + content filters) | `[{ "table": "name", "key": "k", "value": "..." }]` |

### List Filters

- **Key Filter** — glob pattern on filename. `*` matches any characters, `?` matches one. Example: `user_*` matches `user_alice`, `user_bob`.
- **Value Filter** — substring match inside file content. Example: `active` returns only records containing "active".
- Both filters combined use AND logic. Both empty returns all records.

## Examples

### Create a database and write a record

```
KeyValue (Database → Create, db: "config")
  → KeyValue (Table → Write, table: "config", key: "api_url", value: "https://api.example.com")
```

### List all databases, then delete one

```
KeyValue (Database → List)
  → KeyValue (Database → Delete, database: "old_db")
```

### Filter records by pattern

```
KeyValue (Table → List, table: "users", Key Filter: "admin_*")
  → returns only keys starting with "admin_"
```

## Data Model

| n8n concept | Filesystem |
|-------------|------------|
| Database (table) | Subdirectory under `~/.n8n-keyvalue/` |
| Record (key-value pair) | File whose name is the key, contents are the value |
| Value | Plain UTF-8 text stored in the file |

## Environment Variables

*(Planned)* — `N8N_KEYVALUE_DIR` to override the default base directory for Docker/persistent volume setups.

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
