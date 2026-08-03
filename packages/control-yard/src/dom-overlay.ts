/**
 * DOM chrome for the Phaser host: HUD pills, action toolbar, and the OpenUI
 * sheet overlay. Sheets stay HTML (accessibility + schema-driven forms) and
 * confirm through the same control-api endpoints as the CLI.
 */
import type { YardProjectionSnapshot } from "@hobo/management";
import { YARD_LAYOUT, type ZoneId } from "./layout.js";
import type { ConfirmOp, YardAction, YardClient } from "./net/yard-client.js";
import type { GenerativeSheet } from "./openui/sheets.js";
import { sheetForZone } from "./yard-engine.js";

/** GenerativeSheet plus legacy info-card kinds ("bootstrap", "inspect"). */
export type DisplaySheet = Readonly<{
	kind: string;
	title: string;
	description: string;
	confirmOp: ConfirmOp;
	fields: readonly {
		name: string;
		label: string;
		type: "string" | "select" | "number" | "readonly";
		value?: string | number;
		options?: readonly string[];
	}[];
	streamChunks: readonly string[];
}>;

export function displaySheetForZone(
	zone: ZoneId,
	snap: YardProjectionSnapshot | null,
): DisplaySheet {
	const generative: GenerativeSheet | null = sheetForZone(zone, snap);
	if (generative) {
		return {
			kind: generative.kind,
			title: generative.title,
			description: generative.description,
			confirmOp: generative.confirmOp,
			fields: generative.fields,
			streamChunks: generative.streamChunks,
		};
	}
	if (zone === "bootstrapDesk") {
		return {
			kind: "bootstrap",
			title: "Bootstrap Desk",
			description: snap?.occupancy.bootstrapActive
				? "Bootstrap Rail active — activate a production rail"
				: "Bootstrap inactive",
			confirmOp: "noop",
			fields: [
				{
					name: "bootstrap",
					label: "bootstrapActive",
					type: "readonly",
					value: String(Boolean(snap?.occupancy.bootstrapActive)),
				},
				{
					name: "active",
					label: "activeRailHash",
					type: "readonly",
					value: snap?.occupancy.activeRailHash ?? "(none)",
				},
			],
			streamChunks: ["Reading occupancy…"],
		};
	}
	return {
		kind: "inspect",
		title: YARD_LAYOUT.zones[zone]?.label ?? zone,
		description: "Inspect zone (projection-driven)",
		confirmOp: "noop",
		fields: [{ name: "zone", label: "Zone", type: "readonly", value: zone }],
		streamChunks: ["…"],
	};
}

export type DomOverlay = {
	openSheet(sheet: DisplaySheet): void;
	closeSheet(): void;
	sheetOpen(): boolean;
	sheetKind(): string | null;
	setStatus(text: string): void;
	updatePills(snap: YardProjectionSnapshot): void;
	confirmValues(): Record<string, string>;
};

export function createDomOverlay(opts: {
	doc: Document;
	client: YardClient;
	onConfirmed: (message: string) => void;
	onDismissed: () => void;
	onAction: (message: string) => void;
	onActionError: (message: string) => void;
	/** Skip stream-chunk timers for deterministic tests. */
	instantStream?: boolean;
}): DomOverlay {
	const { doc, client } = opts;
	const el = {
		status: doc.getElementById("status"),
		seq: doc.getElementById("seq"),
		occupy: doc.getElementById("occupy"),
		rail: doc.getElementById("rail"),
		conn: doc.getElementById("conn"),
		sheet: doc.getElementById("sheet") as HTMLElement | null,
		sheetTitle: doc.getElementById("sheet-title"),
		sheetDesc: doc.getElementById("sheet-desc"),
		sheetForm: doc.getElementById("sheet-form") as HTMLFormElement | null,
		sheetStream: doc.getElementById("sheet-stream"),
		sheetClose: doc.getElementById("sheet-close"),
		sheetConfirm: doc.getElementById("sheet-confirm"),
	};

	let current: DisplaySheet | null = null;
	let streamTimer: ReturnType<typeof setInterval> | null = null;

	const overlay: DomOverlay = {
		openSheet(sheet) {
			current = sheet;
			if (!el.sheet) return;
			el.sheet.hidden = false;
			if (el.sheetTitle) el.sheetTitle.textContent = sheet.title;
			if (el.sheetDesc) el.sheetDesc.textContent = sheet.description;
			if (el.sheetForm) {
				el.sheetForm.innerHTML = "";
				for (const f of sheet.fields) {
					const lab = doc.createElement("label");
					lab.textContent = f.label;
					lab.htmlFor = `f-${f.name}`;
					el.sheetForm.appendChild(lab);
					if (f.type === "select") {
						const sel = doc.createElement("select");
						sel.id = `f-${f.name}`;
						sel.name = f.name;
						for (const opt of f.options || []) {
							const o = doc.createElement("option");
							o.value = opt;
							o.textContent = opt.slice(0, 24) + (opt.length > 24 ? "…" : "");
							if (opt === String(f.value)) o.selected = true;
							sel.appendChild(o);
						}
						el.sheetForm.appendChild(sel);
					} else {
						const input = doc.createElement("input");
						input.id = `f-${f.name}`;
						input.name = f.name;
						input.value = f.value !== undefined ? String(f.value) : "";
						input.readOnly = f.type === "readonly";
						el.sheetForm.appendChild(input);
					}
				}
			}
			if (streamTimer) clearInterval(streamTimer);
			if (el.sheetStream) {
				const chunks = sheet.streamChunks;
				if (opts.instantStream) {
					el.sheetStream.textContent = chunks[chunks.length - 1] ?? "";
				} else {
					el.sheetStream.textContent = "";
					let i = 0;
					streamTimer = setInterval(() => {
						if (i >= chunks.length) {
							if (streamTimer) clearInterval(streamTimer);
							return;
						}
						if (el.sheetStream) el.sheetStream.textContent = chunks[i++] ?? "";
					}, 180);
				}
			}
		},
		closeSheet() {
			current = null;
			if (streamTimer) clearInterval(streamTimer);
			if (el.sheet) el.sheet.hidden = true;
		},
		sheetOpen: () => current !== null,
		sheetKind: () => current?.kind ?? null,
		setStatus(text) {
			if (el.status) el.status.textContent = text;
		},
		updatePills(snap) {
			overlay.setStatus("live");
			if (el.seq) el.seq.textContent = `seq=${snap.seq}`;
			if (el.occupy) el.occupy.textContent = `occupy=${snap.occupyMode}`;
			if (el.rail) {
				el.rail.textContent = `rail=${(snap.occupancy.activeRailHash || "none").slice(0, 18)}`;
			}
			if (el.conn) {
				el.conn.textContent = `conn=${snap.connections.length} traffic=${snap.metering.trafficRate.toFixed(2)}`;
			}
		},
		confirmValues() {
			const values: Record<string, string> = {};
			if (!el.sheetForm) return values;
			for (const input of el.sheetForm.querySelectorAll("input,select")) {
				const field = input as HTMLInputElement | HTMLSelectElement;
				values[field.name] = field.value;
			}
			return values;
		},
	};

	el.sheetClose?.addEventListener("click", () => {
		overlay.closeSheet();
		opts.onDismissed();
	});
	el.sheetConfirm?.addEventListener("click", () => {
		void (async () => {
			const sheet = current;
			if (!sheet) return;
			try {
				const message = await client.confirm(
					sheet.confirmOp,
					overlay.confirmValues(),
				);
				overlay.closeSheet();
				opts.onConfirmed(message);
			} catch (err) {
				if (el.sheetStream) {
					el.sheetStream.textContent = String((err as Error).message ?? err);
				}
			}
		})();
	});
	for (const btn of doc.querySelectorAll("#actions button")) {
		btn.addEventListener("click", () => {
			const action = btn.getAttribute("data-action") as YardAction | null;
			if (!action) return;
			void client
				.runAction(action)
				.then((message) => opts.onAction(message))
				.catch((err) =>
					opts.onActionError(String((err as Error).message ?? err)),
				);
		});
	}

	return overlay;
}
