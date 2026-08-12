/**
 * Entity-aware snippet merge (ADR-0152 amendment).
 *
 * Markers (valid TypeScript comments):
 *   /* @hobo.entity yard:app *\/
 *   /* @hobo.slot camps strategy=append *\/ ... /* @hobo.end *\/
 *   /* @hobo.hole greet kind=trainable *\/ ... /* @hobo.end *\/
 *
 * Same path + unmarked bodies must be identical. Marked files merge by
 * (entity, slot/hole). Skeleton mismatch or once-strategy drift fails closed.
 */

export type MergeStrategy = "append" | "union" | "once";

export type AtomMergeCode = "ATOM_MERGE_CONFLICT" | "ATOM_MERGE_UNMARKED";

export interface MergeConflict {
	readonly path: string;
	readonly reason: string;
	readonly entity?: string;
	readonly slot?: string;
}

export interface MergeFilesResult {
	readonly ok: boolean;
	readonly files: ReadonlyMap<string, string>;
	readonly holes: readonly string[];
	readonly code?: AtomMergeCode;
	readonly conflict?: MergeConflict;
}

export interface SnippetContribution {
	readonly path: string;
	readonly body: string;
	readonly atomId: string;
}

const MARKER = /\/\*\s*@hobo\.(entity|slot|hole|end)\b([^*]*)\*\//gu;

interface SlotBlock {
	readonly name: string;
	readonly strategy: MergeStrategy;
	readonly body: string;
}

interface ParsedMarked {
	readonly kind: "marked";
	readonly entity: string;
	readonly skeleton: string;
	readonly slots: readonly SlotBlock[];
	readonly holes: Readonly<Record<string, string>>;
}

interface ParsedUnmarked {
	readonly kind: "unmarked";
	readonly body: string;
}

type Parsed = ParsedMarked | ParsedUnmarked;

function parseAttrs(raw: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const tokens = raw.trim().split(/\s+/u).filter(Boolean);
	const positional: string[] = [];
	for (const token of tokens) {
		const eq = token.indexOf("=");
		if (eq === -1) positional.push(token);
		else attrs[token.slice(0, eq)] = token.slice(eq + 1);
	}
	if (positional[0] && attrs.name === undefined) attrs.name = positional[0];
	return attrs;
}

function asStrategy(value: string | undefined): MergeStrategy {
	if (value === "union" || value === "once" || value === "append") return value;
	return "append";
}

export function parseSnippet(body: string): Parsed {
	MARKER.lastIndex = 0;
	if (!MARKER.test(body)) return { kind: "unmarked", body };
	MARKER.lastIndex = 0;
	let entity = "";
	const slots: SlotBlock[] = [];
	const holes: Record<string, string> = {};
	let skeleton = "";
	let cursor = 0;
	let open:
		| {
				readonly kind: "slot" | "hole";
				readonly name: string;
				readonly strategy: MergeStrategy;
				readonly start: number;
				readonly markerEnd: number;
		  }
		| undefined;
	for (const match of body.matchAll(MARKER)) {
		const kind = match[1];
		const attrs = parseAttrs(match[2] ?? "");
		const index = match.index ?? 0;
		const markerEnd = index + match[0].length;
		if (kind === "entity") {
			entity = attrs.name ?? "";
			skeleton += body.slice(cursor, markerEnd);
			cursor = markerEnd;
			continue;
		}
		if (kind === "slot" || kind === "hole") {
			if (open) {
				return { kind: "unmarked", body };
			}
			skeleton += body.slice(cursor, index);
			open = {
				kind,
				name: attrs.name ?? attrs.id ?? "anon",
				strategy: asStrategy(attrs.strategy),
				start: markerEnd,
				markerEnd,
			};
			cursor = markerEnd;
			continue;
		}
		if (kind === "end" && open) {
			const inner = body.slice(open.start, index);
			if (open.kind === "slot") {
				const token = `__HOBO_SLOT_${open.name}__`;
				skeleton += token;
				slots.push({ name: open.name, strategy: open.strategy, body: inner });
			} else {
				const token = `__HOBO_HOLE_${open.name}__`;
				skeleton += token;
				holes[open.name] = inner;
			}
			open = undefined;
			cursor = markerEnd;
		}
	}
	skeleton += body.slice(cursor);
	if (open) return { kind: "unmarked", body };
	return { kind: "marked", entity, skeleton, slots, holes };
}

function uniqueLines(text: string): string {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const line of text.split("\n")) {
		const key = line.trim();
		if (key.length === 0) {
			if (out[out.length - 1] !== "") out.push(line);
			continue;
		}
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(line);
	}
	return out.join("\n");
}

function mergeSlot(
	left: SlotBlock,
	right: SlotBlock,
	path: string,
	entity: string,
): { ok: true; block: SlotBlock } | { ok: false; conflict: MergeConflict } {
	if (left.strategy === "once" || right.strategy === "once") {
		if (left.body.trim().length === 0) return { ok: true, block: right };
		if (right.body.trim().length === 0) return { ok: true, block: left };
		if (left.body.trim() === right.body.trim()) {
			return { ok: true, block: left };
		}
		return {
			ok: false,
			conflict: {
				path,
				entity,
				slot: left.name,
				reason: `once-slot ${left.name} drifted`,
			},
		};
	}
	if (left.strategy === "union" || right.strategy === "union") {
		return {
			ok: true,
			block: {
				name: left.name,
				strategy: "union",
				body: uniqueLines(`${left.body.trimEnd()}\n${right.body.trimStart()}`),
			},
		};
	}
	if (
		left.body.includes(right.body.trim()) ||
		right.body.includes(left.body.trim())
	) {
		return {
			ok: true,
			block: left.body.length >= right.body.length ? left : right,
		};
	}
	const joined = `${left.body.replace(/\s*$/u, "")}\n${right.body.replace(/^\s*/u, "")}`;
	return {
		ok: true,
		block: { name: left.name, strategy: "append", body: joined },
	};
}

function renderMarked(parsed: ParsedMarked): string {
	let out = parsed.skeleton;
	for (const slot of parsed.slots) {
		out = out.replace(`__HOBO_SLOT_${slot.name}__`, slot.body);
	}
	for (const [name, body] of Object.entries(parsed.holes)) {
		out = out.replace(`__HOBO_HOLE_${name}__`, body);
	}
	return out;
}

function mergeMarked(
	left: ParsedMarked,
	right: ParsedMarked,
	path: string,
): { ok: true; parsed: ParsedMarked } | { ok: false; conflict: MergeConflict } {
	const leftEntity = left.entity || path;
	const rightEntity = right.entity || path;
	if (leftEntity !== rightEntity && left.entity !== "" && right.entity !== "") {
		return {
			ok: false,
			conflict: {
				path,
				entity: leftEntity,
				reason: `entity ${leftEntity} vs ${rightEntity}`,
			},
		};
	}
	if (left.skeleton.trim() !== right.skeleton.trim()) {
		return {
			ok: false,
			conflict: {
				path,
				entity: leftEntity,
				reason: "snippet skeleton mismatch",
			},
		};
	}
	const byName = new Map(left.slots.map((slot) => [slot.name, slot]));
	for (const slot of right.slots) {
		const existing = byName.get(slot.name);
		if (!existing) {
			byName.set(slot.name, slot);
			continue;
		}
		const merged = mergeSlot(existing, slot, path, leftEntity);
		if (!merged.ok) return merged;
		byName.set(slot.name, merged.block);
	}
	const holes = { ...left.holes };
	for (const [name, body] of Object.entries(right.holes)) {
		const current = holes[name];
		if (current !== undefined && current.trim() !== body.trim()) {
			return {
				ok: false,
				conflict: {
					path,
					entity: leftEntity,
					slot: name,
					reason: `trainable hole ${name} conflicted`,
				},
			};
		}
		holes[name] = body;
	}
	return {
		ok: true,
		parsed: {
			kind: "marked",
			entity: left.entity || right.entity,
			skeleton: left.skeleton,
			slots: [...byName.values()],
			holes,
		},
	};
}

/** Merge snippet contributions that share an output path. */
export function mergeAtomFiles(
	contributions: readonly SnippetContribution[],
): MergeFilesResult {
	const grouped = new Map<string, SnippetContribution[]>();
	for (const item of contributions) {
		const list = grouped.get(item.path) ?? [];
		list.push(item);
		grouped.set(item.path, list);
	}
	const files = new Map<string, string>();
	const holes: string[] = [];
	for (const [path, items] of grouped) {
		let current: Parsed | undefined;
		for (const item of items) {
			const parsed = parseSnippet(item.body);
			if (!current) {
				current = parsed;
				continue;
			}
			if (current.kind === "unmarked" && parsed.kind === "unmarked") {
				if (current.body.trim() !== parsed.body.trim()) {
					return {
						ok: false,
						files,
						holes,
						code: "ATOM_MERGE_UNMARKED",
						conflict: {
							path,
							reason: `unmarked ${item.atomId} overwrites a different body`,
						},
					};
				}
				continue;
			}
			if (current.kind !== "marked" || parsed.kind !== "marked") {
				return {
					ok: false,
					files,
					holes,
					code: "ATOM_MERGE_CONFLICT",
					conflict: {
						path,
						reason: "cannot mix marked and unmarked snippets",
					},
				};
			}
			const merged = mergeMarked(current, parsed, path);
			if (!merged.ok) {
				return {
					ok: false,
					files,
					holes,
					code: "ATOM_MERGE_CONFLICT",
					conflict: merged.conflict,
				};
			}
			current = merged.parsed;
		}
		if (!current) continue;
		if (current.kind === "unmarked") {
			files.set(path, current.body);
		} else {
			holes.push(...Object.keys(current.holes));
			files.set(path, renderMarked(current));
		}
	}
	return { ok: true, files, holes };
}
