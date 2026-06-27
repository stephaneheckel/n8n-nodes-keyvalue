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
import { BASE_DIR, globToRegex, tryParseJSON } from '../utils';

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
						const keyRegex = keyFilter ? globToRegex(keyFilter) : null;

						const entries = fs.readdirSync(dirPath, { withFileTypes: true });
						for (const entry of entries) {
							if (!entry.isFile()) continue;
							// Skip internal state files
							if (entry.name.startsWith('.keyvalue')) continue;
							// Apply key filter
							if (keyRegex && !keyRegex.test(entry.name)) continue;
							const recPath = path.join(dirPath, entry.name);
							const content = fs.readFileSync(recPath, 'utf-8');
							const value = tryParseJSON(content);
							// Apply value filter
							if (valueFilter) {
								const contentStr = typeof value === 'string' ? value : JSON.stringify(value);
								if (!contentStr.includes(valueFilter)) continue;
							}
							returnData.push({ json: { directory: directoryName, key: entry.name, value }, pairedItem: { item: i } });
						}
					} else if (operation === 'count') {
						if (!fs.existsSync(dirPath)) {
							throw new NodeApiError(this.getNode(), {
								message: `Directory "${directoryName}" does not exist`,
							} as JsonObject, { itemIndex: i });
						}
						const keyFilter = this.getNodeParameter('keyFilter', i, '') as string;
						const keyRegex = keyFilter ? globToRegex(keyFilter) : null;

						const entries = fs.readdirSync(dirPath, { withFileTypes: true });
						let count = 0;
						for (const entry of entries) {
							if (!entry.isFile()) continue;
							if (keyRegex && !keyRegex.test(entry.name)) continue;
							count++;
						}
						returnData.push({ json: { directory: directoryName, count }, pairedItem: { item: i } });
					} else if (operation === 'delete') {
						const keyFilter = this.getNodeParameter('keyFilter', i, '') as string;
						const valueFilter = this.getNodeParameter('valueFilter', i, '') as string;

						if (!keyFilter && !valueFilter) {
							throw new NodeApiError(this.getNode(), {
								message: 'At least one filter (Key Filter or Value Filter) is required for Delete. Use "*" as Key Filter to match all records.',
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
							if (entry.name.startsWith('.keyvalue')) continue;
							if (keyRegex && !keyRegex.test(entry.name)) continue;
							const recPath = path.join(dirPath, entry.name);
							if (valueFilter) {
								const content = fs.readFileSync(recPath, 'utf-8');
								if (!content.includes(valueFilter)) continue;
							}
							fs.unlinkSync(recPath);
							returnData.push({ json: { directory: directoryName, key: entry.name, deleted: true }, pairedItem: { item: i } });
						}
					} else {
						const key = this.getNodeParameter('key', i) as string;
						const recordPath = path.join(dirPath, key);

						if (operation === 'append') {
							const value = String(this.getNodeParameter('value', i));
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
							const content = fs.readFileSync(recordPath, 'utf-8');
							const value = tryParseJSON(content);
							returnData.push({ json: { directory: directoryName, key, value }, pairedItem: { item: i } });
						} else if (operation === 'write') {
							const rawParam = this.getNodeParameter('value', i);
							// If an object/array arrives directly from n8n (e.g. {{ $json }}), treat as JSON
							const parsed = typeof rawParam === 'object' && rawParam !== null
								? rawParam
								: tryParseJSON(String(rawParam));
							const value = parsed;
							const storageValue = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
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
