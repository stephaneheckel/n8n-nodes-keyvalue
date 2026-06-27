import * as fs from 'fs';
import * as path from 'path';
import type {
	ITriggerFunctions,
	ITriggerResponse,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { BASE_DIR, globToRegex, tryReadContent } from '../utils';

export class KeyValueTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'KeyValue Trigger',
		name: 'keyValueTrigger',
		icon: 'file:keyValue.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '=Directory: {{$parameter["directoryName"]}}',
		description: 'Triggers a workflow when records are added or changed in a KeyValue directory',
		defaults: {
			name: 'KeyValue Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Directory Name',
				name: 'directoryName',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'my_directory',
				description: 'Name of the directory to watch for changes',
			},
			{
				displayName: 'Poll Time',
				name: 'pollTime',
				type: 'number',
				default: 30,
				description: 'Interval in seconds between each directory scan. Minimum: 5 seconds.',
			},
			{
				displayName: 'Watch Events',
				name: 'watchEvents',
				type: 'multiOptions',
				default: ['add', 'change'],
				options: [
					{
						name: 'File Created',
						value: 'add',
						description: 'Trigger when a new record file appears in the directory',
					},
					{
						name: 'File Changed',
						value: 'change',
						description: 'Trigger when an existing record file is modified',
					},
				],
				required: true,
				description: 'Which file system events to watch for',
			},
			{
				displayName: 'Key Filter',
				name: 'keyFilter',
				type: 'string',
				default: '',
				placeholder: 'user_*',
				description: 'Glob pattern to filter records by filename. Use * for any characters, ? for one character. Leave empty to match all.',
			},
			{
				displayName: 'Include Content',
				name: 'includeContent',
				type: 'boolean',
				default: true,
				description: 'Whether to read and return the content of detected records. Disable for faster scanning when you only need filenames.',
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const directoryName = this.getNodeParameter('directoryName') as string;
		const pollTime = this.getNodeParameter('pollTime', 30) as number;
		const watchEvents = this.getNodeParameter('watchEvents') as string[];
		const keyFilter = this.getNodeParameter('keyFilter', '') as string;
		const includeContent = this.getNodeParameter('includeContent', true) as boolean;

		const dirPath = path.join(BASE_DIR, directoryName);
		const statePath = path.join(dirPath, '.keyvalue-watch-state.json');
		const pollMs = Math.max(pollTime, 5) * 1000;

		// Cache the previous state in memory to avoid disk I/O on every tick
		let previousState: Record<string, number> = {};

		const scan = () => {
			if (!fs.existsSync(dirPath)) return;

			// 1. Load previous state (first scan: read from disk)
			if (Object.keys(previousState).length === 0) {
				try {
					previousState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
				} catch {
					previousState = {};
				}
			}

			// 2. Scan the directory
			const currentState: Record<string, number> = {};
			const keyRegex = keyFilter ? globToRegex(keyFilter) : null;
			const entries = fs.readdirSync(dirPath, { withFileTypes: true });

			for (const entry of entries) {
				if (!entry.isFile()) continue;
						if (keyRegex && !keyRegex.test(entry.name)) continue;
				currentState[entry.name] = fs.statSync(path.join(dirPath, entry.name)).mtimeMs;
			}

			// 3. Detect changes
			const changes: Array<{
				directory: string;
				key: string;
				event: string;
				value?: string | object;
				mtimeMs: number;
			}> = [];

			for (const [filename, mtimeMs] of Object.entries(currentState)) {
				if (!(filename in previousState) && watchEvents.includes('add')) {
					changes.push({
						directory: directoryName,
						key: filename,
						event: 'add',
						...(includeContent ? { value: tryReadContent(path.join(dirPath, filename)) } : {}),
						mtimeMs,
					});
				} else if (
					filename in previousState &&
					previousState[filename] !== mtimeMs &&
					watchEvents.includes('change')
				) {
					changes.push({
						directory: directoryName,
						key: filename,
						event: 'change',
						...(includeContent ? { value: tryReadContent(path.join(dirPath, filename)) } : {}),
						mtimeMs,
					});
				}
			}

			// 4. Save the new state (only write disk if directory exists)
			previousState = currentState;
			try {
				if (!fs.existsSync(dirPath)) {
					fs.mkdirSync(dirPath, { recursive: true });
				}
				fs.writeFileSync(statePath, JSON.stringify(currentState), 'utf-8');
			} catch {
				// State file write failure is non-fatal — next scan will re-sync from scratch
			}

			// 5. Emit if changes detected
			if (changes.length > 0) {
				this.emit([this.helpers.returnJsonArray(changes)]);
			}
		};

		// First scan: establishes the baseline (no emits)
		scan();

		// Polling loop
		const interval = setInterval(scan, pollMs);

		// Cleanup when workflow is deactivated
		const closeFunction = async () => {
			clearInterval(interval);
		};

		return { closeFunction };
	}
}
