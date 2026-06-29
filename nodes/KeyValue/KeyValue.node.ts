import * as fs from 'fs';
import * as path from 'path';
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';
import { BASE_DIR, formatWithFrontmatter, globToRegex, parseFrontmatter, tryParseJSON } from '../utils';

export class KeyValue implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'KeyValue',
		name: 'keyValue',
		icon: 'file:keyValue.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Store and retrieve key-value pairs on the filesystem',
		defaults: {
			name: 'KeyValue',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			// Resource
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				options: [
						{ name: 'Counter', value: 'counter' },
						{ name: 'Directory', value: 'directory' },
						{ name: 'Record', value: 'record' },
						{ name: 'Search', value: 'search' },
						{ name: 'Tag', value: 'tag' },
						{ name: 'Vault', value: 'vault' },
					],
				default: 'directory',
				noDataExpression: true,
				required: true,
				description: 'Operate on directories or records (files within a directory)',
			},
			// Directory operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: { resource: ['directory'] },
				},
				options: [
					{ name: 'Create', value: 'create', description: 'Create a new directory', action: 'Create a directory' },
					{ name: 'Delete', value: 'delete', description: 'Delete a directory', action: 'Delete a directory' },
					{ name: 'List', value: 'list', description: 'List all directories', action: 'List directories' },
				],
				default: 'create',
				noDataExpression: true,
			},
			// Directory: directory filter (list only)
			{
				displayName: 'Directory Filter',
				name: 'directoryFilter',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['directory'],
						operation: ['list'],
					},
				},
				default: '',
				placeholder: 'prod_*',
				description: 'Glob pattern to filter directories by name. Use * for any characters, ? for one character. Leave empty to match all.',
			},
			{
				displayName: 'Directory Name',
				name: 'directoryName',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['directory'],
						operation: ['create', 'delete'],
					},
				},
				default: '',
				placeholder: 'my_directory',
				description: 'Name of the directory (subdirectory under ~/.n8n-keyvalue)',
			},
			// Record operations (alphabetically sorted)
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: { resource: ['record'] },
				},
				options: [
					{ name: 'Append', value: 'append', description: 'Append a value to an existing record', action: 'Append to a record' },
					{ name: 'Count', value: 'count', description: 'Count records in a directory', action: 'Count records' },
					{ name: 'Delete', value: 'delete', description: 'Delete records by key filter and/or value filter', action: 'Delete records' },
					{ name: 'Exists', value: 'exists', description: 'Check if a record exists', action: 'Check if a record exists' },
					{ name: 'List', value: 'list', description: 'List all records in a directory', action: 'List records' },
					{ name: 'Read', value: 'read', description: 'Read a record by key', action: 'Read a record' },
					{ name: 'Touch', value: 'touch', description: 'Update the timestamp of a record without changing its value. Creates the record if it does not exist.', action: 'Touch a record' },
					{ name: 'Write', value: 'write', description: 'Write (create or overwrite) a record', action: 'Write a record' },
				],
				default: 'read',
				noDataExpression: true,
			},
			// Counter operations (alphabetically sorted)
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: { resource: ['counter'] },
				},
				options: [
					{ name: 'Get', value: 'get', description: 'Read the current counter value without changing it', action: 'Get a counter value' },
					{ name: 'Increment', value: 'increment', description: 'Increment a counter and return the new value', action: 'Increment a counter' },
					{ name: 'Reset', value: 'reset', description: 'Reset a counter to a target value', action: 'Reset a counter' },
				],
				default: 'increment',
				noDataExpression: true,
			},
			// Record: directoryName field
			{
				displayName: 'Directory Name',
				name: 'directoryName',
				type: 'string',
				required: true,
				displayOptions: {
					show: { resource: ['record'] },
				},
				default: '',
				placeholder: 'my_directory',
				description: 'Name of the directory to operate on',
			},
			// Record: key field
			{
				displayName: 'Key',
				name: 'key',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['read', 'write', 'append', 'exists', 'touch'],
					},
				},
				default: '',
				placeholder: 'record_key',
				description: 'The record key (filename)',
			},
			// Record: read mode
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['read'],
					},
				},
				options: [
					{ name: 'Body Only', value: 'body', description: 'Return only the content (backward compatible)' },
					{ name: 'Frontmatter Only', value: 'frontmatter', description: 'Return only frontmatter metadata and tags' },
					{ name: 'Full', value: 'full', description: 'Return frontmatter, tags, and body all together' },
				],
				default: 'full',
				noDataExpression: true,
				description: 'How to parse the file content. Full returns everything; Body Only matches the legacy behavior.',
			},
			// Record: value field
			{
				displayName: 'Value',
				name: 'value',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['write', 'append'],
					},
				},
				default: '',
				placeholder: 'record value',
				description: 'The value to store. Plain text is stored as-is; JSON objects/arrays are auto-detected and stored as parsed JSON.',
			},
			// Record: frontmatter collection (write only)
			{
				displayName: 'Frontmatter',
				name: 'frontmatter',
				type: 'collection',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['write'],
					},
				},
				default: {},
				placeholder: 'Add Frontmatter',
				options: [
					{
						displayName: 'Tags',
						name: 'tags',
						type: 'string',
						default: '',
						placeholder: 'n8n, critical',
						description: 'Comma-separated list of tags to include in YAML frontmatter',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						placeholder: 'A short description',
					},
					{
						displayName: 'Updated',
						name: 'updated',
						type: 'string',
						default: '',
						placeholder: '2026-06-29T14:30:00Z',
						description: 'ISO 8601 timestamp. Leave empty to use current time.',
					},
				],
				description: 'Optional YAML frontmatter metadata to prepend to the file',
			},
			// Record: separator field (append only)
			{
				displayName: 'Separator',
				name: 'separator',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['append'],
					},
				},
				default: '\n',
				placeholder: '\\n',
				description: 'Separator inserted before the appended value. Defaults to a newline. You can type \\n for a newline. Leave empty for direct concatenation.',
			},
			// Record: key filter (list, count, delete)
			{
				displayName: 'Key Filter',
				name: 'keyFilter',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['list', 'count', 'delete'],
					},
				},
				default: '',
				placeholder: 'user_*',
				description: 'Glob pattern to filter records by key (filename). Use * for any characters, ? for one character. Leave empty to match all',
			},
			// Record: value filter (list, delete)
			{
				displayName: 'Value Filter',
				name: 'valueFilter',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['list', 'delete'],
					},
				},
				default: '',
				placeholder: 'active',
				description: 'Substring to match inside record content. Leave empty to match all.',
			},
			// Record: tag filter (list, count, delete)
			{
				displayName: 'Tag Filter',
				name: 'tagFilter',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['list', 'count', 'delete'],
					},
				},
				default: '',
				placeholder: 'n8n',
				description: 'Only match records whose frontmatter tags contain this value. Leave empty to match all.',
			},
			// Record: include frontmatter (list only)
			{
				displayName: 'Include Frontmatter',
				name: 'includeFrontmatter',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['list'],
					},
				},
				default: false,
				description: 'Whether to parse and return frontmatter metadata and tags for each record. Disable for faster listing.',
			},
			// Counter fields
			{
				displayName: 'Counter Name',
				name: 'counterName',
				type: 'string',
				required: true,
				displayOptions: {
					show: { resource: ['counter'] },
				},
				default: '',
				placeholder: 'my_counter',
				description: 'Name of the counter. Stored as a plain text file under counters/.',
			},
			{
				displayName: 'Increment By',
				name: 'incrementBy',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['counter'],
						operation: ['increment'],
					},
				},
				default: 1,
				placeholder: '1',
				description: 'Amount to add each time the counter is incremented',
			},
			{
				displayName: 'Start At',
				name: 'startAt',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['counter'],
						operation: ['increment'],
					},
				},
				default: 0,
				placeholder: '0',
				description: 'Value to create the counter at if it does not exist yet. Ignored once the counter exists.',
			},
			{
				displayName: 'Reset To',
				name: 'resetTo',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['counter'],
						operation: ['reset'],
					},
				},
				default: 0,
				placeholder: '0',
				description: 'Value to set the counter to',
			},
			// ── Search resource ─────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: { resource: ['search'] },
				},
				options: [
					{ name: 'Query', value: 'query', description: 'Full-text search across all .md files', action: 'Search across files' },
				],
				default: 'query',
				noDataExpression: true,
			},
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				required: true,
				displayOptions: {
					show: { resource: ['search'], operation: ['query'] },
				},
				default: '',
				placeholder: 'NodeOperationError itemIndex',
				description: 'Search terms. Multiple words use AND logic. Case-insensitive.',
			},
			{
				displayName: 'Directory Filter',
				name: 'directoryFilter',
				type: 'string',
				displayOptions: {
					show: { resource: ['search'], operation: ['query'] },
				},
				default: '',
				placeholder: 'conventions/*',
				description: 'Glob pattern to restrict which directories to search. Leave empty to search all.',
			},
			{
				displayName: 'Tag Filter',
				name: 'tagFilter',
				type: 'string',
				displayOptions: {
					show: { resource: ['search'], operation: ['query'] },
				},
				default: '',
				placeholder: 'n8n',
				description: 'Only search files whose frontmatter tags contain this value. Leave empty to search all.',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				displayOptions: {
					show: { resource: ['search'], operation: ['query'] },
				},
				default: 50,
				typeOptions: { minValue: 1, maxValue: 100 },
				description: 'Max number of results to return',
			},
			{
				displayName: 'Include Snippets',
				name: 'includeSnippets',
				type: 'boolean',
				displayOptions: {
					show: { resource: ['search'], operation: ['query'] },
				},
				default: true,
				description: 'Whether to include a context snippet around the first match in each result',
			},
			// ── Tag resource ─────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: { resource: ['tag'] },
				},
				options: [
					{ name: 'List', value: 'list', description: 'List all unique tags with file counts', action: 'List tags' },
				],
				default: 'list',
				noDataExpression: true,
			},
			{
				displayName: 'Directory Filter',
				name: 'directoryFilter',
				type: 'string',
				displayOptions: {
					show: { resource: ['tag'], operation: ['list'] },
				},
				default: '',
				placeholder: 'conventions/*',
				description: 'Glob pattern to restrict which directories to scan. Leave empty to scan all.',
			},
			// ── Vault resource ───────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: { resource: ['vault'] },
				},
				options: [
					{ name: 'Backlinks', value: 'backlinks', description: 'Find files that reference a target file', action: 'Find backlinks' },
					{ name: 'Recent', value: 'recent', description: 'List recently modified files', action: 'List recent files' },
					{ name: 'Stats', value: 'stats', description: 'Aggregate statistics about the vault', action: 'Show vault stats' },
					{ name: 'Tree', value: 'tree', description: 'Show directory tree structure', action: 'Show directory tree' },
				],
				default: 'stats',
				noDataExpression: true,
			},
			// Vault → Tree fields
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				displayOptions: {
					show: { resource: ['vault'], operation: ['tree'] },
				},
				default: '',
				placeholder: 'conventions',
				description: 'Directory path to start from. Leave empty for the vault root.',
			},
			{
				displayName: 'Max Depth',
				name: 'maxDepth',
				type: 'number',
				displayOptions: {
					show: { resource: ['vault'], operation: ['tree'] },
				},
				default: 3,
				typeOptions: { minValue: 1, maxValue: 10 },
				description: 'Maximum directory depth to display',
			},
			// Vault → Recent fields
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				displayOptions: {
					show: { resource: ['vault'], operation: ['recent'] },
				},
				default: 50,
				typeOptions: { minValue: 1, maxValue: 100 },
				description: 'Max number of results to return',
			},
			{
				displayName: 'Directory Filter',
				name: 'directoryFilter',
				type: 'string',
				displayOptions: {
					show: { resource: ['vault'], operation: ['recent'] },
				},
				default: '',
				placeholder: 'conventions/*',
				description: 'Glob pattern to restrict which directories to scan. Leave empty to scan all.',
			},
			{
				displayName: 'Tag Filter',
				name: 'tagFilter',
				type: 'string',
				displayOptions: {
					show: { resource: ['vault'], operation: ['recent'] },
				},
				default: '',
				placeholder: 'n8n',
				description: 'Only include files whose frontmatter tags contain this value. Leave empty to include all.',
			},
			// Vault → Backlinks fields
			{
				displayName: 'Target Path',
				name: 'targetPath',
				type: 'string',
				required: true,
				displayOptions: {
					show: { resource: ['vault'], operation: ['backlinks'] },
				},
				default: '',
				placeholder: 'conventions/n8n-error-format.md',
				description: 'Path of the file to find references to, relative to the vault root. Can be a full path or just a filename.',
			},
			{
				displayName: 'Directory Filter',
				name: 'directoryFilter',
				type: 'string',
				displayOptions: {
					show: { resource: ['vault'], operation: ['backlinks'] },
				},
				default: '',
				placeholder: 'projects/*',
				description: 'Glob pattern to restrict which directories to search for backlinks. Leave empty to search all.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'directory') {
					// --- Directory operations ---
					if (operation === 'list') {
						if (!fs.existsSync(BASE_DIR)) {
							continue;
						}
						const directoryFilter = this.getNodeParameter('directoryFilter', i, '') as string;
						const dirRegex = directoryFilter ? globToRegex(directoryFilter) : null;

						const entries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
						const directories = entries
							.filter((e: fs.Dirent) => e.isDirectory())
							.map((e: fs.Dirent) => e.name);
						for (const dir of directories) {
							if (dirRegex && !dirRegex.test(dir)) continue;
							returnData.push({ json: { directory: dir }, pairedItem: { item: i } });
						}
					} else {
						const directoryName = this.getNodeParameter('directoryName', i) as string;
						const dirPath = path.join(BASE_DIR, directoryName);

						if (operation === 'create') {
							if (fs.existsSync(dirPath)) {
								throw new NodeApiError(this.getNode(), {
									message: `Directory "${directoryName}" already exists`,
								} as JsonObject, { itemIndex: i });
							}
							fs.mkdirSync(dirPath, { recursive: true });
							returnData.push({ json: { directory: directoryName, created: true }, pairedItem: { item: i } });
						} else if (operation === 'delete') {
							if (!fs.existsSync(dirPath)) {
								throw new NodeApiError(this.getNode(), {
									message: `Directory "${directoryName}" does not exist`,
								} as JsonObject, { itemIndex: i });
							}
							fs.rmSync(dirPath, { recursive: true, force: true });
							returnData.push({ json: { directory: directoryName, deleted: true }, pairedItem: { item: i } });
						}
					}
				} else if (resource === 'record') {
					// --- Record operations ---
					const directoryName = this.getNodeParameter('directoryName', i) as string;
					const dirPath = path.join(BASE_DIR, directoryName);

					if (operation === 'list') {
					if (!fs.existsSync(dirPath)) {
						throw new NodeApiError(this.getNode(), {
							message: `Directory "${directoryName}" does not exist`,
						} as JsonObject, { itemIndex: i });
					}
					const keyFilter = this.getNodeParameter('keyFilter', i, '') as string;
					const valueFilter = this.getNodeParameter('valueFilter', i, '') as string;
					const tagFilter = this.getNodeParameter('tagFilter', i, '') as string;
					const includeFrontmatter = this.getNodeParameter('includeFrontmatter', i, false) as boolean;
					const keyRegex = keyFilter ? globToRegex(keyFilter) : null;

					const entries = fs.readdirSync(dirPath, { withFileTypes: true });
					for (const entry of entries) {
						if (!entry.isFile()) continue;
						// Apply key filter
						if (keyRegex && !keyRegex.test(entry.name)) continue;
						const recPath = path.join(dirPath, entry.name);
						const raw = fs.readFileSync(recPath, 'utf-8');
						const { frontmatter, body } = parseFrontmatter(raw);
						// Apply tag filter
						if (tagFilter) {
							const fileTags = (frontmatter?.tags as string[]) ?? [];
							if (!fileTags.includes(tagFilter)) continue;
						}
						const value = tryParseJSON(body);
						// Apply value filter
						if (valueFilter) {
							const contentStr = typeof value === 'string' ? value : JSON.stringify(value);
							if (!contentStr.includes(valueFilter)) continue;
						}
						if (includeFrontmatter) {
								returnData.push({ json: { directory: directoryName, key: entry.name, value, frontmatter, tags: (frontmatter?.tags as string[]) ?? [] }, pairedItem: { item: i } });
							} else {
								returnData.push({ json: { directory: directoryName, key: entry.name, value }, pairedItem: { item: i } });
							}
					}
					} else if (operation === 'count') {
						if (!fs.existsSync(dirPath)) {
							throw new NodeApiError(this.getNode(), {
								message: `Directory "${directoryName}" does not exist`,
							} as JsonObject, { itemIndex: i });
						}
						const keyFilter = this.getNodeParameter('keyFilter', i, '') as string;
						const tagFilter = this.getNodeParameter('tagFilter', i, '') as string;
						const keyRegex = keyFilter ? globToRegex(keyFilter) : null;

						const entries = fs.readdirSync(dirPath, { withFileTypes: true });
						let count = 0;
						for (const entry of entries) {
							if (!entry.isFile()) continue;
							if (keyRegex && !keyRegex.test(entry.name)) continue;
							// Apply tag filter (requires reading the file)
							if (tagFilter) {
								const recPath = path.join(dirPath, entry.name);
								const raw = fs.readFileSync(recPath, 'utf-8');
								const { frontmatter } = parseFrontmatter(raw);
								const fileTags = (frontmatter?.tags as string[]) ?? [];
								if (!fileTags.includes(tagFilter)) continue;
							}
							count++;
						}
						returnData.push({ json: { directory: directoryName, count }, pairedItem: { item: i } });
					} else if (operation === 'delete') {
						const keyFilter = this.getNodeParameter('keyFilter', i, '') as string;
						const valueFilter = this.getNodeParameter('valueFilter', i, '') as string;
						const tagFilter = this.getNodeParameter('tagFilter', i, '') as string;

						if (!keyFilter && !valueFilter && !tagFilter) {
							throw new NodeApiError(this.getNode(), {
								message: 'At least one filter (Key Filter, Value Filter, or Tag Filter) is required for Delete. Use "*" as Key Filter to match all records.',
							} as JsonObject, { itemIndex: i });
						}

						if (!fs.existsSync(dirPath)) {
							throw new NodeApiError(this.getNode(), {
								message: `Directory "${directoryName}" does not exist`,
							} as JsonObject, { itemIndex: i });
						}

						const keyRegex = keyFilter ? globToRegex(keyFilter) : null;
						const entries = fs.readdirSync(dirPath, { withFileTypes: true });
						for (const entry of entries) {
							if (!entry.isFile()) continue;
							if (keyRegex && !keyRegex.test(entry.name)) continue;
							const recPath = path.join(dirPath, entry.name);
							// Read content if value or tag filter is needed
							if (valueFilter || tagFilter) {
								const raw = fs.readFileSync(recPath, 'utf-8');
								// Apply tag filter
								if (tagFilter) {
									const { frontmatter } = parseFrontmatter(raw);
									const fileTags = (frontmatter?.tags as string[]) ?? [];
									if (!fileTags.includes(tagFilter)) continue;
								}
								// Apply value filter
								if (valueFilter) {
									const { body } = parseFrontmatter(raw);
									if (!body.includes(valueFilter)) continue;
								}
							}
							fs.unlinkSync(recPath);
							returnData.push({ json: { directory: directoryName, key: entry.name, deleted: true }, pairedItem: { item: i } });
						}
					} else {
						const key = this.getNodeParameter('key', i) as string;
						const recordPath = path.join(dirPath, key);

						if (operation === 'append') {
							const value = String(this.getNodeParameter('value', i)).trimEnd();
							let separator = this.getNodeParameter('separator', i, '\n') as string;
							// Normalize: if user typed literal \n, convert to real newline
							separator = separator.replace(/\\n/g, '\n');
							if (!fs.existsSync(dirPath)) {
								fs.mkdirSync(dirPath, { recursive: true });
							}
							if (fs.existsSync(recordPath)) {
								const existing = fs.readFileSync(recordPath, 'utf-8');
								fs.writeFileSync(recordPath, existing + separator + value, 'utf-8');
							} else {
								fs.writeFileSync(recordPath, value, 'utf-8');
							}
							returnData.push({ json: { directory: directoryName, key, value, appended: true }, pairedItem: { item: i } });
						} else if (operation === 'read') {
							if (!fs.existsSync(recordPath)) {
								throw new NodeApiError(this.getNode(), {
									message: `Record "${key}" does not exist in directory "${directoryName}"`,
								} as JsonObject, { itemIndex: i });
							}
							const raw = fs.readFileSync(recordPath, 'utf-8');
							const mode = this.getNodeParameter('mode', i, 'full') as string;
							const { frontmatter, body } = parseFrontmatter(raw);
							const value = tryParseJSON(body);
							const tags = (frontmatter?.tags as string[]) ?? [];

							if (mode === 'frontmatter') {
								returnData.push({ json: { directory: directoryName, key, frontmatter, tags }, pairedItem: { item: i } });
							} else if (mode === 'body') {
								returnData.push({ json: { directory: directoryName, key, value }, pairedItem: { item: i } });
							} else {
								// full (default)
								returnData.push({ json: { directory: directoryName, key, value, frontmatter, body }, pairedItem: { item: i } });
							}
						} else if (operation === 'write') {
							const rawParam = this.getNodeParameter('value', i);
							// If an object/array arrives directly from n8n (e.g. {{ $json }}), treat as JSON
							const parsed = typeof rawParam === 'object' && rawParam !== null
								? rawParam
								: tryParseJSON(String(rawParam));
							const value = parsed;
							const body = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);

							// Collect frontmatter fields from the collection
							const fmTags = this.getNodeParameter('frontmatter.tags', i, '') as string;
							const fmDescription = this.getNodeParameter('frontmatter.description', i, '') as string;
							const fmUpdated = this.getNodeParameter('frontmatter.updated', i, '') as string;

							const fmObject: Record<string, unknown> = {};
							if (fmTags.trim()) {
								fmObject.tags = fmTags.split(',').map((t) => t.trim()).filter(Boolean);
							}
							if (fmDescription.trim()) fmObject.description = fmDescription.trim();
							if (fmUpdated.trim()) fmObject.updated = fmUpdated.trim();

							const storageValue = Object.keys(fmObject).length > 0
								? formatWithFrontmatter(body, fmObject)
								: body;

							if (!fs.existsSync(dirPath)) {
								fs.mkdirSync(dirPath, { recursive: true });
							}
							fs.writeFileSync(recordPath, storageValue, 'utf-8');
							returnData.push({ json: { directory: directoryName, key, value, written: true }, pairedItem: { item: i } });
						} else if (operation === 'exists') {
							const exists = fs.existsSync(recordPath);
							returnData.push({ json: { directory: directoryName, key, exists }, pairedItem: { item: i } });
						} else if (operation === 'touch') {
							const now = new Date();
							if (fs.existsSync(recordPath)) {
								fs.utimesSync(recordPath, now, now);
								returnData.push({ json: { directory: directoryName, key, touched: true, created: false }, pairedItem: { item: i } });
							} else {
								if (!fs.existsSync(dirPath)) {
									fs.mkdirSync(dirPath, { recursive: true });
								}
								fs.closeSync(fs.openSync(recordPath, 'w'));
								fs.utimesSync(recordPath, now, now);
								returnData.push({ json: { directory: directoryName, key, touched: true, created: true }, pairedItem: { item: i } });
							}
						}
					}
					} else if (resource === 'counter') {
						// --- Counter operations ---
						const counterName = this.getNodeParameter('counterName', i) as string;
						const countersDir = path.join(BASE_DIR, 'counters');
						const counterPath = path.join(countersDir, counterName);

						if (operation === 'get') {
							if (!fs.existsSync(counterPath)) {
								throw new NodeApiError(this.getNode(), {
									message: `Counter "${counterName}" does not exist`,
								} as JsonObject, { itemIndex: i });
							}
							const value = Number(fs.readFileSync(counterPath, 'utf-8'));
							returnData.push({ json: { counter: counterName, value }, pairedItem: { item: i } });
						} else if (operation === 'increment') {
							const incrementBy = this.getNodeParameter('incrementBy', i, 1) as number;
							const startAt = this.getNodeParameter('startAt', i, 0) as number;
							if (!fs.existsSync(countersDir)) {
								fs.mkdirSync(countersDir, { recursive: true });
							}
							const currentValue = fs.existsSync(counterPath)
								? Number(fs.readFileSync(counterPath, 'utf-8'))
								: startAt;
							const newValue = currentValue + incrementBy;
							fs.writeFileSync(counterPath, String(newValue), 'utf-8');
							returnData.push({ json: { counter: counterName, value: newValue }, pairedItem: { item: i } });
						} else if (operation === 'reset') {
									const resetTo = this.getNodeParameter('resetTo', i, 0) as number;
									if (!fs.existsSync(counterPath)) {
										throw new NodeApiError(this.getNode(), {
											message: `Counter "${counterName}" does not exist`,
										} as JsonObject, { itemIndex: i });
									}
									fs.writeFileSync(counterPath, String(resetTo), 'utf-8');
									returnData.push({ json: { counter: counterName, value: resetTo }, pairedItem: { item: i } });
						}
					} else if (resource === 'search') {
					// --- Search operations ---
					if (operation === 'query') {
						const query = (this.getNodeParameter('query', i) as string).toLowerCase().trim();
						const directoryFilter = this.getNodeParameter('directoryFilter', i, '') as string;
						const tagFilter = this.getNodeParameter('tagFilter', i, '') as string;
						const limit = this.getNodeParameter('limit', i, 10) as number;
						const includeSnippets = this.getNodeParameter('includeSnippets', i, true) as boolean;

						if (!query) continue;
						if (!fs.existsSync(BASE_DIR)) continue;

						const terms = query.split(/\s+/).filter(Boolean);
						// Pre-compile term regexes (escape special chars for safe matching)
						const termRegexes = terms.map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
						const dirRegex = directoryFilter ? globToRegex(directoryFilter) : null;

						const dirEntries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const results: any[] = [];

						for (const dirEntry of dirEntries) {
							if (!dirEntry.isDirectory()) continue;
							if (dirRegex && !dirRegex.test(dirEntry.name)) continue;
							const dirPath = path.join(BASE_DIR, dirEntry.name);

							const fileEntries = fs.readdirSync(dirPath, { withFileTypes: true });
							for (const fileEntry of fileEntries) {
								if (!fileEntry.isFile()) continue;
								const filePath = path.join(dirPath, fileEntry.name);
								const raw = fs.readFileSync(filePath, 'utf-8');
								const { frontmatter, body } = parseFrontmatter(raw);

								// Tag filter
								if (tagFilter) {
									const fileTags = (frontmatter?.tags as string[]) ?? [];
									if (!fileTags.includes(tagFilter)) continue;
								}

								// Full-text AND search with scoring
								const bodyLower = body.toLowerCase();
								let score = 0;
								let allMatch = true;
								for (const regex of termRegexes) {
									const matches = bodyLower.match(regex);
									if (!matches) { allMatch = false; break; }
									score += matches.length;
								}
								if (!allMatch) continue;

								// Snippet extraction
								let snippet: string | undefined;
								if (includeSnippets) {
									const firstIdx = Math.min(
										...termRegexes.map((r) => {
											const m = bodyLower.match(r);
											return m?.index ?? Infinity;
										}),
									);
									if (firstIdx !== Infinity && firstIdx < body.length) {
										const start = Math.max(0, firstIdx - 60);
										const termLen = termRegexes[0].source.length;
										const end = Math.min(body.length, firstIdx + termLen + 60);
										const prefix = start > 0 ? '...' : '';
										const suffix = end < body.length ? '...' : '';
										snippet = prefix + body.slice(start, end).replace(/\n/g, ' ') + suffix;
									}
								}

								results.push({
									directory: dirEntry.name,
									key: fileEntry.name,
									score,
									tags: (frontmatter?.tags as string[]) ?? [],
									...(snippet ? { snippet } : {}),
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
							} as any);
							}
						}

						results.sort((a, b) => (b.score as number) - (a.score as number));
						for (const r of results.slice(0, limit)) {
							returnData.push({ json: r, pairedItem: { item: i } });
						}
					}
				} else if (resource === 'tag') {
					// --- Tag operations ---
					if (operation === 'list') {
						const directoryFilter = this.getNodeParameter('directoryFilter', i, '') as string;
						const dirRegex = directoryFilter ? globToRegex(directoryFilter) : null;

						const tagMap: Record<string, Set<string>> = {};
						if (fs.existsSync(BASE_DIR)) {
							const dirEntries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
							for (const dirEntry of dirEntries) {
								if (!dirEntry.isDirectory()) continue;
								if (dirRegex && !dirRegex.test(dirEntry.name)) continue;
								const dirPath = path.join(BASE_DIR, dirEntry.name);
								const fileEntries = fs.readdirSync(dirPath, { withFileTypes: true });
								for (const fileEntry of fileEntries) {
									if (!fileEntry.isFile()) continue;
									const filePath = path.join(dirPath, fileEntry.name);
									const raw = fs.readFileSync(filePath, 'utf-8');
									const { frontmatter } = parseFrontmatter(raw);
									const fileTags = (frontmatter?.tags as string[]) ?? [];
									const fileRef = `${dirEntry.name}/${fileEntry.name}`;
									for (const tag of fileTags) {
										if (!tagMap[tag]) tagMap[tag] = new Set();
										tagMap[tag].add(fileRef);
									}
								}
							}
						}

						for (const [tag, files] of Object.entries(tagMap)) {
							returnData.push({
								json: { tag, count: files.size, files: Array.from(files).sort() },
								pairedItem: { item: i },
							});
						}
					}
				} else if (resource === 'vault') {
					// --- Vault operations ---
					if (operation === 'tree') {
						const startPath = this.getNodeParameter('path', i, '') as string;
						const maxDepth = this.getNodeParameter('maxDepth', i, 3) as number;

						const rootPath = startPath ? path.join(BASE_DIR, startPath) : BASE_DIR;
						if (!fs.existsSync(rootPath)) continue;

						const lines: string[] = [];
						const dirs: string[] = [];
						const files: Array<{ path: string; size: number }> = [];

						const walk = (dir: string, prefix: string, depth: number): void => {
							if (depth > maxDepth) return;
							const entries = fs.readdirSync(dir, { withFileTypes: true });
							const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
							for (let j = 0; j < sorted.length; j++) {
								const e = sorted[j];
								const isLast = j === sorted.length - 1;
								const connector = isLast ? '└── ' : '├── ';
								const childPrefix = prefix + (isLast ? '    ' : '│   ');
								const fullPath = path.join(dir, e.name);
								const relPath = path.relative(BASE_DIR, fullPath).replace(/\\/g, '/');

								if (e.isDirectory()) {
									dirs.push(relPath);
									if (depth < maxDepth) {
										lines.push(`${prefix}${connector}${e.name}/`);
										walk(fullPath, childPrefix, depth + 1);
									} else {
										lines.push(`${prefix}${connector}${e.name}/`);
									}
								} else {
									try {
										const stat = fs.statSync(fullPath);
										files.push({ path: relPath, size: stat.size });
										lines.push(`${prefix}${connector}${e.name}`);
									} catch {
										lines.push(`${prefix}${connector}${e.name}`);
									}
								}
							}
						}

						const displayName = startPath || path.basename(BASE_DIR);
						lines.unshift(`${displayName}/`);
						walk(rootPath, '', 1);

						returnData.push({
							json: { tree: lines.join('\n'), directories: dirs, files },
							pairedItem: { item: i },
						});
					} else if (operation === 'stats') {
						if (!fs.existsSync(BASE_DIR)) {
							returnData.push({ json: { files: 0, directories: 0, total_size_kb: 0, unique_tags: 0 }, pairedItem: { item: i } });
							continue;
						}

						let fileCount = 0;
						let dirCount = 0;
						let totalSize = 0;
						const allTags = new Set<string>();
						let lastModPath = '';
						let lastModTime = 0;

						const dirEntries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
						for (const dirEntry of dirEntries) {
							if (!dirEntry.isDirectory()) continue;
							dirCount++;
							const dirPath = path.join(BASE_DIR, dirEntry.name);
							const fileEntries = fs.readdirSync(dirPath, { withFileTypes: true });
							for (const fileEntry of fileEntries) {
								if (!fileEntry.isFile()) continue;
								fileCount++;
								const filePath = path.join(dirPath, fileEntry.name);
								try {
									const stat = fs.statSync(filePath);
									totalSize += stat.size;
									if (stat.mtimeMs > lastModTime) {
										lastModTime = stat.mtimeMs;
										lastModPath = `${dirEntry.name}/${fileEntry.name}`;
									}
								} catch { /* skip */ }

								// Collect tags (read file only if we need tags)
								try {
									const raw = fs.readFileSync(filePath, 'utf-8');
									const { frontmatter } = parseFrontmatter(raw);
									const tags = (frontmatter?.tags as string[]) ?? [];
									for (const t of tags) allTags.add(t);
								} catch { /* skip */ }
							}
						}

						returnData.push({
							json: {
								files: fileCount,
								directories: dirCount,
								total_size_kb: Math.round((totalSize / 1024) * 10) / 10,
								unique_tags: allTags.size,
								last_modified: lastModPath || null,
								last_modified_at: lastModTime ? new Date(lastModTime).toISOString() : null,
							},
							pairedItem: { item: i },
						});
					} else if (operation === 'recent') {
						const limit = this.getNodeParameter('limit', i, 10) as number;
						const directoryFilter = this.getNodeParameter('directoryFilter', i, '') as string;
						const tagFilter = this.getNodeParameter('tagFilter', i, '') as string;
						const dirRegex = directoryFilter ? globToRegex(directoryFilter) : null;

						if (!fs.existsSync(BASE_DIR)) continue;

						type RecentEntry = { directory: string; key: string; mtimeMs: number; size: number; tags: string[] };
						const entries: RecentEntry[] = [];

						const dirEntries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
						for (const dirEntry of dirEntries) {
							if (!dirEntry.isDirectory()) continue;
							if (dirRegex && !dirRegex.test(dirEntry.name)) continue;
							const dirPath = path.join(BASE_DIR, dirEntry.name);
							const fileEntries = fs.readdirSync(dirPath, { withFileTypes: true });
							for (const fileEntry of fileEntries) {
								if (!fileEntry.isFile()) continue;
								const filePath = path.join(dirPath, fileEntry.name);
								try {
									const stat = fs.statSync(filePath);

									// Tag filter
									if (tagFilter) {
										const raw = fs.readFileSync(filePath, 'utf-8');
										const { frontmatter } = parseFrontmatter(raw);
										const fileTags = (frontmatter?.tags as string[]) ?? [];
										if (!fileTags.includes(tagFilter)) continue;
										entries.push({
											directory: dirEntry.name,
											key: fileEntry.name,
											mtimeMs: stat.mtimeMs,
											size: stat.size,
											tags: fileTags,
										});
									} else {
										entries.push({
											directory: dirEntry.name,
											key: fileEntry.name,
											mtimeMs: stat.mtimeMs,
											size: stat.size,
											tags: [],
										});
									}
								} catch { /* skip */ }
							}
						}

						entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
						for (const e of entries.slice(0, limit)) {
							returnData.push({
								json: {
									directory: e.directory,
									key: e.key,
									updated: new Date(e.mtimeMs).toISOString(),
									size: e.size,
									...(e.tags.length > 0 ? { tags: e.tags } : {}),
								},
								pairedItem: { item: i },
							});
						}
					} else if (operation === 'backlinks') {
						const targetPath = this.getNodeParameter('targetPath', i) as string;
						const directoryFilter = this.getNodeParameter('directoryFilter', i, '') as string;

						if (!fs.existsSync(BASE_DIR)) continue;

						const targetName = path.basename(targetPath, '.md');
						const dirRegex = directoryFilter ? globToRegex(directoryFilter) : null;

						const dirEntries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
						for (const dirEntry of dirEntries) {
							if (!dirEntry.isDirectory()) continue;
							if (dirRegex && !dirRegex.test(dirEntry.name)) continue;
							const dirPath = path.join(BASE_DIR, dirEntry.name);
							const fileEntries = fs.readdirSync(dirPath, { withFileTypes: true });
							for (const fileEntry of fileEntries) {
								if (!fileEntry.isFile()) continue;
								// Skip self-references
								const currentRelPath = `${dirEntry.name}/${fileEntry.name}`;
								if (currentRelPath === targetPath) continue;
								if (fileEntry.name === path.basename(targetPath)) continue;

								const filePath = path.join(dirPath, fileEntry.name);
								const raw = fs.readFileSync(filePath, 'utf-8');
								const { body } = parseFrontmatter(raw);
								const bodyLower = body.toLowerCase();

								// Search for references: exact path, wiki link, or bare filename
								const patterns = [
									targetPath,                          // full path: conventions/n8n-error-format.md
									targetPath.replace('.md', ''),       // without extension
									`[[${targetPath}]]`,                 // wiki link with full path
									`[[${targetPath.replace('.md', '')}]]`, // wiki link without extension
									`[[${targetName}]]`,                 // wiki link with just name
								];

								for (const pat of patterns) {
									const idx = bodyLower.indexOf(pat.toLowerCase());
									if (idx === -1) continue;

									// Extract context (±40 chars around the match)
									const start = Math.max(0, idx - 40);
									const end = Math.min(body.length, idx + pat.length + 40);
									const context = (start > 0 ? '...' : '') + body.slice(start, end).replace(/\n/g, ' ') + (end < body.length ? '...' : '');

									returnData.push({
										json: {
											source_directory: dirEntry.name,
											source_key: fileEntry.name,
											matched_pattern: pat,
											line: body.slice(0, idx).split('\n').length,
											context,
										},
										pairedItem: { item: i },
									});
									break; // one reference per source file is enough
								}
							}
						}
					}
					}
				} catch (error) {
				if (this.continueOnFail()) {
					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray({ error: (error as Error).message }),
						{ itemData: { item: i } },
					);
					returnData.push(...executionData);
					continue;
				}
				throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
