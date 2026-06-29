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

// ── Frontmatter utilities ────────────────────────────────────────────

/** Minimal YAML scalar parser — handles strings, numbers, booleans, null. */
function parseYAMLScalar(value: string): unknown {
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (value === 'null' || value === '~') return null;
	if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
	if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
	if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
	return value;
}

/** Parse a YAML inline array: [item1, "item 2", true, 42] */
function parseYAMLArray(raw: string): unknown[] {
	const inner = raw.slice(1, -1).trim();
	if (!inner) return [];
	const items: unknown[] = [];
	let current = '';
	let inQuote = false;
	let quoteChar = '';
	for (let i = 0; i < inner.length; i++) {
		const ch = inner[i];
		if (inQuote) {
			if (ch === '\\' && i + 1 < inner.length) {
				current += inner[++i];
			} else if (ch === quoteChar) {
				inQuote = false;
			} else {
				current += ch;
			}
		} else if (ch === '"' || ch === "'") {
			inQuote = true;
			quoteChar = ch;
		} else if (ch === ',') {
			const item = current.trim();
			if (item) items.push(parseYAMLScalar(item));
			current = '';
		} else {
			current += ch;
		}
	}
	const item = current.trim();
	if (item) items.push(parseYAMLScalar(item));
	return items;
}

/** Parse flat key: value YAML (no nesting beyond inline arrays). */
function parseSimpleYAML(yaml: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const lines = yaml.split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const colonIdx = trimmed.indexOf(':');
		if (colonIdx === -1) continue;
		const key = trimmed.slice(0, colonIdx).trim();
		const value = trimmed.slice(colonIdx + 1).trim();

		if (value === '') {
			result[key] = null;
		} else if (value.startsWith('[') && value.endsWith(']')) {
			result[key] = parseYAMLArray(value);
		} else {
			result[key] = parseYAMLScalar(value);
		}
	}
	return result;
}

/** Format a flat object as YAML key: value lines. */
function formatYAML(obj: Record<string, unknown>): string {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(obj)) {
		if (value === null || value === undefined) continue;
		if (Array.isArray(value)) {
			lines.push(`${key}: [${value.map((v) => JSON.stringify(v)).join(', ')}]`);
		} else if (typeof value === 'object') {
			lines.push(`${key}: ${JSON.stringify(value)}`);
		} else if (typeof value === 'string') {
			// Quote if the string contains special YAML characters
			if (/[:{}[\],&*?|>!%@`#]/.test(value) || value.startsWith(' ') || value.endsWith(' ')) {
				lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
			} else {
				lines.push(`${key}: ${value}`);
			}
		} else {
			lines.push(`${key}: ${value}`);
		}
	}
	return lines.join('\n');
}

/**
 * Parse frontmatter from raw file content.
 * Returns { frontmatter, body }.
 * - If the file starts with "---\n", parses the YAML block and returns the rest as body.
 * - Otherwise returns frontmatter: null and the entire content as body.
 */
export function parseFrontmatter(raw: string): {
	frontmatter: Record<string, unknown> | null;
	body: string;
} {
	// Handle both \n and \r\n line endings
	const sep = raw.startsWith('---\r\n') ? '\r\n' : raw.startsWith('---\n') ? '\n' : null;
	if (!sep) {
		return { frontmatter: null, body: raw };
	}

	const searchStart = 4 + (sep === '\r\n' ? 1 : 0);
	const closingMarker = `${sep}---${sep}`;
	const closingIdx = raw.indexOf(closingMarker, searchStart);

	if (closingIdx === -1) {
		// Malformed — treat entire content as body
		return { frontmatter: null, body: raw };
	}

	const yamlBlock = raw.slice(searchStart, closingIdx);
	const body = raw.slice(closingIdx + closingMarker.length);
	const frontmatter = parseSimpleYAML(yamlBlock);

	return { frontmatter, body };
}

/**
 * Format content with optional YAML frontmatter.
 * If frontmatter is provided and non-empty, prepends "---\n<YAML>\n---\n".
 * Otherwise returns the body unchanged.
 */
export function formatWithFrontmatter(body: string, frontmatter?: Record<string, unknown>): string {
	if (!frontmatter || Object.keys(frontmatter).length === 0) {
		return body;
	}
	const yaml = formatYAML(frontmatter);
	return `---\n${yaml}\n---\n${body}`;
}
