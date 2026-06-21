import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';

const BASE_DIR = path.join(os.homedir(), '.n8n-keyvalue');

function globToRegex(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	const regexStr = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
	return new RegExp(`^${regexStr}$`);
}

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
					{ name: 'Delete', value: 'delete', description: 'Delete a record by key', action: 'Delete a record' },
					{ name: 'List', value: 'list', description: 'List all records in a directory', action: 'List records' },
					{ name: 'Read', value: 'read', description: 'Read a record by key', action: 'Read a record' },
					{ name: 'Write', value: 'write', description: 'Write (create or overwrite) a record', action: 'Write a record' },
				],
				default: 'read',
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
						operation: ['read', 'write', 'delete'],
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
						operation: ['write'],
					},
				},
				default: '',
				placeholder: 'record value',
				description: 'The value to store (plain text)',
			},
			// Record: key filter (list only)
			{
				displayName: 'Key Filter',
				name: 'keyFilter',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['list'],
					},
				},
				default: '',
				placeholder: 'user_*',
				description: 'Glob pattern to filter records by key (filename). Use * for any characters, ? for one character. Leave empty to match all',
			},
			// Record: value filter (list only)
			{
				displayName: 'Value Filter',
				name: 'valueFilter',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['record'],
						operation: ['list'],
					},
				},
				default: '',
				placeholder: 'active',
				description: 'Substring to match inside record content. Leave empty to match all.',
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
							// Apply key filter
							if (keyRegex && !keyRegex.test(entry.name)) continue;
							const recPath = path.join(dirPath, entry.name);
							const content = fs.readFileSync(recPath, 'utf-8');
							// Apply value filter
							if (valueFilter && !content.includes(valueFilter)) continue;
							returnData.push({ json: { directory: directoryName, key: entry.name, value: content }, pairedItem: { item: i } });
						}
					} else {
						const key = this.getNodeParameter('key', i) as string;
						const recordPath = path.join(dirPath, key);

						if (operation === 'read') {
							if (!fs.existsSync(recordPath)) {
								throw new NodeApiError(this.getNode(), {
									message: `Record "${key}" does not exist in directory "${directoryName}"`,
								} as JsonObject, { itemIndex: i });
							}
							const content = fs.readFileSync(recordPath, 'utf-8');
							returnData.push({ json: { directory: directoryName, key, value: content }, pairedItem: { item: i } });
						} else if (operation === 'write') {
							const value = String(this.getNodeParameter('value', i));
							if (!fs.existsSync(dirPath)) {
								fs.mkdirSync(dirPath, { recursive: true });
							}
							fs.writeFileSync(recordPath, value, 'utf-8');
							returnData.push({ json: { directory: directoryName, key, value, written: true }, pairedItem: { item: i } });
						} else if (operation === 'delete') {
							if (!fs.existsSync(recordPath)) {
								throw new NodeApiError(this.getNode(), {
									message: `Record "${key}" does not exist in directory "${directoryName}"`,
								} as JsonObject, { itemIndex: i });
							}
							fs.unlinkSync(recordPath);
							returnData.push({ json: { directory: directoryName, key, deleted: true }, pairedItem: { item: i } });
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
