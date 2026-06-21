# Building an n8n Community Node: What We Learned Building KeyValue

We built a filesystem-based key-value store for n8n called KeyValue. Every directory under a base path becomes a namespace, every file inside it becomes a record whose name is the key and whose content is the value. The node supports directory operations (create, delete, list) and record operations (read, write, delete, append, list with glob filtering). Here is what we learned along the way.

Start from the n8n-nodes-starter template. Clone it, delete the example nodes and credentials, then scaffold your directory structure. A node needs three files: a TypeScript implementation, a JSON codex file for metadata, and an SVG or PNG icon. The class name must match the file name. Use `npm install --legacy-peer-deps` to work around ESLint peer dependency conflicts, and install `@types/node` and `n8n-workflow` as dev dependencies for type checking.

Choose programmatic style when your node does more than wrap an HTTP API. It gives you an execute method with full control over file operations, error handling, and item looping. The declarative style works better for simple REST integrations. For filesystem operations, programmatic is the only option.

Community node lint rules are strict but predictable. Every returnData push must include pairedItem to preserve item linking through the workflow. Errors inside the item loop need NodeApiError with itemIndex as the third argument. Operation options in dropdowns must be alphabetically sorted. The node description must include a subtitle expression. The `default: ''` pattern makes a field optional without needing `required: false`. Build passes require zero unused imports.

Filesystem nodes can never run on n8n Cloud. Disable cloud compatibility checks with `npx n8n-node cloud-support disable` so the linter stops flagging imports of Node.js built-in modules like fs, path, and os. Your node will pass lint but will not be eligible for Cloud verification.

Multi-item output is the n8n convention for list operations. Instead of returning a single item containing an array, push one item per entity. This lets users pipe list results directly into downstream nodes without inserting a SplitInBatches step. The same pattern applies to directory listing and record listing.

Cross-platform paths need `os.homedir()` and `path.join()`. Never hardcode slashes. An environment variable like `N8N_KEYVALUE_DIR` lets Docker users point the node at a persistent volume mount while keeping the default at `~/.n8n-keyvalue` for local development. Document the interaction with `N8N_RESTRICT_FILE_ACCESS_TO` so users know to include the directory in the allowed list.

When publishing to npm, only the dist folder belongs in the tarball. Remove build artifacts like tsconfig.tsbuildinfo and duplicate package.json copies from the dist directory. Do not include a `main` field in package.json unless you ship a matching index.js. n8n loads nodes through the `n8n.nodes` array, not through main. An incorrect main field pointing to a nonexistent file is a known source of loading failures.

The most persistent bug we hit was the "Class could not be found" error on Docker installations. This is a known n8n core issue. The fix is to enter the container, navigate to the community nodes directory, delete node_modules and package-lock.json, run npm install, and restart. The package.json manifest preserves all installed nodes so nothing is lost. This same workaround applies to any community node showing this error.

Append operations need a configurable separator. Defaulting to a newline works for logs but users who want CSV or direct concatenation need control. The Node.js filesystem APIs expect real characters, not escape sequences, so normalize user-typed `\n` to an actual newline at runtime.

Wrapping value parameters with `String()` prevents crashes when n8n expressions produce DateTime objects or numbers. The filesystem only accepts strings and buffers, so coercion is essential.

Testing on both Windows and Linux revealed no platform-specific issues beyond the Docker loader bug. The same code ran without modification on both operating systems thanks to Node.js abstractions. Persistent storage worked correctly when the base directory was placed inside the Docker volume mount.

The entire project, including its README with full operation reference and Docker setup guide, lives in a single TypeScript file, a JSON codex file, an SVG icon, and a standard npm package.json. No external dependencies beyond n8n-workflow and Node.js built-ins.
