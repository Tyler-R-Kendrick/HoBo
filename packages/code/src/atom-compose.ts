import type { AtomTemplate } from "./atom-template.js";

export type ComposeAtomsCode = "ATOM_COMPOSE_MISSING" | "ATOM_COMPOSE_CYCLE";

export interface ComposeAtomsResult {
	readonly ok: boolean;
	readonly atoms: readonly AtomTemplate[];
	readonly missing?: readonly string[];
	readonly cycle?: readonly string[];
	readonly code?: ComposeAtomsCode;
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function providedBy(atoms: readonly AtomTemplate[]): Set<string> {
	return new Set(atoms.flatMap((atom) => [...atom.provides]));
}

function tagOverlap(
	atom: AtomTemplate,
	selected: readonly AtomTemplate[],
): number {
	const wanted = new Set(selected.flatMap((item) => [...item.tags, item.kind]));
	return atom.tags.filter((tag) => wanted.has(tag)).length;
}

function pickProvider(
	capability: string,
	corpus: readonly AtomTemplate[],
	exclude: ReadonlySet<string>,
	selected: readonly AtomTemplate[],
): AtomTemplate | undefined {
	return [...corpus]
		.filter(
			(atom) => atom.provides.includes(capability) && !exclude.has(atom.id),
		)
		.sort((left, right) => {
			const overlap = tagOverlap(right, selected) - tagOverlap(left, selected);
			if (overlap !== 0) return overlap;
			return left.id.localeCompare(right.id);
		})[0];
}

function satisfyRequires(
	selected: readonly AtomTemplate[],
	corpus: readonly AtomTemplate[],
): ComposeAtomsResult {
	const working = [...selected];
	const seen = new Set(selected.map((atom) => atom.id));
	for (let step = 0; step < 64; step += 1) {
		const have = providedBy(working);
		const missing = unique(
			working.flatMap((atom) => [...atom.requires]),
		).filter((capability) => !have.has(capability));
		if (missing.length === 0) {
			return { ok: true, atoms: working };
		}
		let added = false;
		for (const capability of missing) {
			const provider = pickProvider(capability, corpus, seen, working);
			if (!provider) {
				return {
					ok: false,
					atoms: [],
					missing,
					code: "ATOM_COMPOSE_MISSING",
				};
			}
			working.push(provider);
			seen.add(provider.id);
			added = true;
		}
		if (!added) {
			return {
				ok: false,
				atoms: [],
				missing,
				code: "ATOM_COMPOSE_MISSING",
			};
		}
	}
	return {
		ok: false,
		atoms: [],
		cycle: working.map((atom) => atom.id),
		code: "ATOM_COMPOSE_CYCLE",
	};
}

function topoSort(atoms: readonly AtomTemplate[]): ComposeAtomsResult {
	const byId = new Map(atoms.map((atom) => [atom.id, atom]));
	const incoming = new Map<string, Set<string>>();
	const outgoing = new Map<string, Set<string>>();
	for (const atom of atoms) {
		incoming.set(atom.id, incoming.get(atom.id) ?? new Set());
		outgoing.set(atom.id, outgoing.get(atom.id) ?? new Set());
	}
	for (const depender of atoms) {
		for (const capability of depender.requires) {
			for (const provider of atoms) {
				if (!provider.provides.includes(capability)) continue;
				if (provider.id === depender.id) continue;
				incoming.get(depender.id)?.add(provider.id);
				outgoing.get(provider.id)?.add(depender.id);
			}
		}
	}
	const ready = [...atoms]
		.filter((atom) => (incoming.get(atom.id)?.size ?? 0) === 0)
		.map((atom) => atom.id)
		.sort((left, right) => left.localeCompare(right));
	const ordered: AtomTemplate[] = [];
	while (ready.length > 0) {
		const id = ready.shift();
		if (id === undefined) break;
		const atom = byId.get(id);
		if (!atom) continue;
		ordered.push(atom);
		for (const next of [...(outgoing.get(id) ?? [])].sort((left, right) =>
			left.localeCompare(right),
		)) {
			incoming.get(next)?.delete(id);
			if ((incoming.get(next)?.size ?? 0) === 0) ready.push(next);
		}
	}
	if (ordered.length !== atoms.length) {
		return {
			ok: false,
			atoms: [],
			cycle: atoms
				.filter((atom) => !ordered.some((item) => item.id === atom.id))
				.map((atom) => atom.id),
			code: "ATOM_COMPOSE_CYCLE",
		};
	}
	return { ok: true, atoms: ordered };
}

/**
 * Satisfy requires from the corpus, then topo-sort. Fail closed on
 * missing providers or cycles.
 */
export function composeAtoms(
	selected: readonly AtomTemplate[],
	corpus: readonly AtomTemplate[] = selected,
): ComposeAtomsResult {
	if (selected.length === 0) return { ok: true, atoms: [] };
	const satisfied = satisfyRequires(selected, corpus);
	if (!satisfied.ok) return satisfied;
	return topoSort(satisfied.atoms);
}
