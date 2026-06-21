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
					{ name: 'Database', value: 'database' },
					{ name: 'Table', value: 'table' },
				],
				default: 'database',
				noDataExpression: true,
				required: true,
				description: 'Operate on databases (directories) or tables (files within a directory)',
			},
			// Database operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: { resource: ['database'] },
				},
				options: [
					{ name: 'Create', value: 'create', description: 'Create a new database (directory)', action: 'Create a database' },
					{ name: 'Delete', value: 'delete', description: 'Delete a database (directory)', action: 'Delete a database' },
					{ name: 'List', value: 'list', description: 'List all databases', action: 'List databases' },
				],
				default: 'create',
				noDataExpression: true,
			},
			// Database: databaseName field
			{
				displayName: 'Database Name',
				name: 'databaseName',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['database'],
						operation: ['create', 'delete'],
					},
				},
				default: '',
				placeholder: 'my_database',
				description: 'Name of the database (subdirectory under ~/.n8n-keyvalue)',
			},
			// Table operations (alphabetically sorted)
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: { resource: ['table'] },
				},
				options: [
					{ name: 'Delete', value: 'delete', description: 'Delete a record by key', action: 'Delete a record' },
					{ name: 'List', value: 'list', description: 'List all records in a table', action: 'List records' },
					{ name: 'Read', value: 'read', description: 'Read a record by key', action: 'Read a record' },
					{ name: 'Write', value: 'write', description: 'Write (create or overwrite) a record', action: 'Write a record' },
				],
				default: 'read',
				noDataExpression: true,
			},
			// Table: tableName field
			{
				displayName: 'Table Name',
				name: 'tableName',
				type: 'string',
				required: true,
				displayOptions: {
					show: { resource: ['table'] },
				},
				default: '',
				placeholder: 'my_table',
				description: 'Name of the table (subdirectory) to operate on',
			},
			// Table: key field
			{
				displayName: 'Key',
				name: 'key',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['table'],
						operation: ['read', 'write', 'delete'],
					},
				},
				default: '',
				placeholder: 'record_key',
				description: 'The record key (filename)',
			},
			// Table: value field
			{
				displayName: 'Value',
				name: 'value',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['table'],
						operation: ['write'],
					},
				},
				default: '',
				placeholder: 'record value',
				description: 'The value to store (plain text)',
			},
			// Table: key filter (list only)
			{
				displayName: 'Key Filter',
				name: 'keyFilter',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['table'],
						operation: ['list'],
					},
				},
				default: '',
				placeholder: 'user_*',
				description: 'Glob pattern to filter records by key (filename). Use * for any characters, ? for one character. Leave empty to match all',
			},
			// Table: value filter (list only)
			{
				displayName: 'Value Filter',
				name: 'valueFilter',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['table'],
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
				if (resource === 'database') {
					// --- Database operations ---
					if (operation === 'list') {
						if (!fs.existsSync(BASE_DIR)) {
							continue;
						}
						const entries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
						const databases = entries
							.filter((e: fs.Dirent) => e.isDirectory())
							.map((e: fs.Dirent) => e.name);
						for (const db of databases) {
							returnData.push({ json: { database: db }, pairedItem: { item: i } });
						}
					} else {
						const databaseName = this.getNodeParameter('databaseName', i) as string;
						const dbPath = path.join(BASE_DIR, databaseName);

						if (operation === 'create') {
							if (fs.existsSync(dbPath)) {
								throw new NodeApiError(this.getNode(), {
									message: `Database "${databaseName}" already exists`,
								} as JsonObject, { itemIndex: i });
							}
							fs.mkdirSync(dbPath, { recursive: true });
							returnData.push({ json: { database: databaseName, created: true }, pairedItem: { item: i } });
						} else if (operation === 'delete') {
							if (!fs.existsSync(dbPath)) {
								throw new NodeApiError(this.getNode(), {
									message: `Database "${databaseName}" does not exist`,
								} as JsonObject, { itemIndex: i });
							}
							fs.rmSync(dbPath, { recursive: true, force: true });
							returnData.push({ json: { database: databaseName, deleted: true }, pairedItem: { item: i } });
						}
					}
				} else if (resource === 'table') {
					// --- Table operations ---
					const tableName = this.getNodeParameter('tableName', i) as string;
					const tablePath = path.join(BASE_DIR, tableName);

					if (operation === 'list') {
						if (!fs.existsSync(tablePath)) {
							throw new NodeApiError(this.getNode(), {
								message: `Table "${tableName}" does not exist`,
							} as JsonObject, { itemIndex: i });
						}
						const keyFilter = this.getNodeParameter('keyFilter', i, '') as string;
						const valueFilter = this.getNodeParameter('valueFilter', i, '') as string;
						const keyRegex = keyFilter ? globToRegex(keyFilter) : null;

						const entries = fs.readdirSync(tablePath, { withFileTypes: true });
						for (const entry of entries) {
							if (!entry.isFile()) continue;
							// Apply key filter
							if (keyRegex && !keyRegex.test(entry.name)) continue;
							const recPath = path.join(tablePath, entry.name);
							const content = fs.readFileSync(recPath, 'utf-8');
							// Apply value filter
							if (valueFilter && !content.includes(valueFilter)) continue;
							returnData.push({ json: { table: tableName, key: entry.name, value: content }, pairedItem: { item: i } });
						}
					} else {
						const key = this.getNodeParameter('key', i) as string;
						const recordPath = path.join(tablePath, key);

						if (operation === 'read') {
							if (!fs.existsSync(recordPath)) {
								throw new NodeApiError(this.getNode(), {
									message: `Record "${key}" does not exist in table "${tableName}"`,
								} as JsonObject, { itemIndex: i });
							}
							const content = fs.readFileSync(recordPath, 'utf-8');
							returnData.push({ json: { table: tableName, key, value: content }, pairedItem: { item: i } });
						} else if (operation === 'write') {
							const value = String(this.getNodeParameter('value', i));
							if (!fs.existsSync(tablePath)) {
								fs.mkdirSync(tablePath, { recursive: true });
							}
							fs.writeFileSync(recordPath, value, 'utf-8');
							returnData.push({ json: { table: tableName, key, value, written: true }, pairedItem: { item: i } });
						} else if (operation === 'delete') {
							if (!fs.existsSync(recordPath)) {
								throw new NodeApiError(this.getNode(), {
									message: `Record "${key}" does not exist in table "${tableName}"`,
								} as JsonObject, { itemIndex: i });
							}
							fs.unlinkSync(recordPath);
							returnData.push({ json: { table: tableName, key, deleted: true }, pairedItem: { item: i } });
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
