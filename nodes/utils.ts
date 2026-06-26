import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const BASE_DIR = process.env.N8N_KEYVALUE_DIR || path.join(os.homedir(), '.n8n-keyvalue');

export function globToRegex(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	const regexStr = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
	return new RegExp(`^${regexStr}$`);
}

export function tryParseJSON(raw: string): string | object {
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed === 'object' && parsed !== null) {
			return parsed;
		}
	} catch { /* not JSON, return raw string */ }
	return raw;
}

export function tryReadContent(filePath: string): string | object {
	const content = fs.readFileSync(filePath, 'utf-8');
	return tryParseJSON(content);
}
