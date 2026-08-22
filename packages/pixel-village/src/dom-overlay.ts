/**
 * DOM chrome for the Phaser host: HUD pills, action toolbar, and the OpenUI
 * sheet overlay. Sheets stay HTML (accessibility + schema-driven forms) and
 * confirm through the same control-api endpoints as the CLI.
 */
import type { YardProjectionSnapshot } from "@hobo/management";
import { YARD_LAYOUT, type ZoneId } from "./layout.js";
import type { ConfirmOp, YardAction, YardClient } from "./net/yard-client.js";
import type { GenerativeSheet } from "./openui/sheets.js";
import type { Waybill } from "./waybills.js";
import { sheetForZone } from "./yard-engine.js";

/** GenerativeSheet plus legacy info-card kinds ("bootstrap", "inspect"). */
/** Which side of the yard the sheet panel occupies. */
export type SheetDock = "left" | "right";

/**
 * Dock the sheet on the side the zone is NOT on. The panel is ~360px of a
 * 1280px stage, so a right-docked sheet blankets everything past x≈900 —
 * which is exactly where Connection Bay and Cost Booth live.
 */
export function dockForZone(zone: ZoneId): SheetDock {
	const z = YARD_LAYOUT.zones[zone];
	const centre = z.x + z.width / 2;
	return centre > YARD_LAYOUT.width / 2 ? "left" : "right";
}

export type DisplaySheet = Readonly<{
	kind: string;
	title: string;
	description: string;
	confirmOp: ConfirmOp;
	/** When present, confirm runs these client actions instead of confirmOp. */
	runActions?: readonly YardAction[];
	/** Present when this sheet renders a waybill (STAMP / SPIKE grammar). */
	waybill?: Readonly<{ id: string; kind: string }>;
	fields: readonly {
		name: string;
		label: string;
		type: "string" | "select" | "number" | "readonly";
		value?: string | number;
		options?: readonly string[];
	}[];
	streamChunks: readonly string[];
}>;

/**
 * Waybill → sheet: title prefixed WAYBILL, description carries the summary
 * plus the blast-radius line, fields are read-only (you read, then stamp).
 * Confirm values ride along as read-only form fields so the same
 * confirmValues() → client.confirm path fires unchanged.
 */
export function displaySheetForWaybill(w: Waybill): DisplaySheet {
	const named = new Set(w.fields.map((f) => f.name));
	const sheet: DisplaySheet = {
		kind: w.kind,
		title: `WAYBILL — ${w.title}`,
		description: `${w.summary}\nBlast radius: ${w.blastRadius}.`,
		confirmOp: w.confirmOp === "init-up" ? "noop" : w.confirmOp,
		waybill: { id: w.id, kind: w.kind },
		fields: [
			...w.fields.map((f) => ({
				name: f.name,
				label: f.label,
				type: "readonly" as const,
				value: f.value,
			})),
			...Object.entries(w.values)
				.filter(([name]) => !named.has(name))
				.map(([name, value]) => ({
					name,
					label: name,
					type: "readonly" as const,
					value,
				})),
		],
		streamChunks: ["Reading waybill…"],
	};
	if (w.confirmOp === "init-up")
		return { ...sheet, runActions: ["init", "up"] };
	return sheet;
}

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
	/**
	 * `dock` places the panel away from the prop it describes — docking over
	 * the clicked zone would hide the state the operator is acting on.
	 */
	openSheet(sheet: DisplaySheet, dock?: SheetDock): void;
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
	/** A waybill was STAMPed (approved) and its op succeeded. */
	onStamped?: (waybill: { id: string; kind: string }) => void;
	/** A waybill was SPIKEd (denied) — no op fires. */
	onSpiked?: (waybillId: string) => void;
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
		// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
		sheet: doc.getElementById("sheet") as HTMLElement | null,
		sheetTitle: doc.getElementById("sheet-title"),
		sheetDesc: doc.getElementById("sheet-desc"),
		// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
		sheetForm: doc.getElementById("sheet-form") as HTMLFormElement | null,
		sheetStream: doc.getElementById("sheet-stream"),
		sheetClose: doc.getElementById("sheet-close"),
		sheetConfirm: doc.getElementById("sheet-confirm"),
	};

	// SPIKE (deny) lives beside the STAMP in the sheet footer; created here so
	// older index.html copies keep working.
	// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
	let spikeBtn = doc.getElementById("sheet-spike") as HTMLButtonElement | null;
	if (!spikeBtn && el.sheet) {
		const footer = el.sheet.querySelector("footer");
		if (footer) {
			spikeBtn = doc.createElement("button");
			spikeBtn.type = "button";
			spikeBtn.id = "sheet-spike";
			spikeBtn.textContent = "SPIKE";
			footer.insertBefore(spikeBtn, footer.firstChild);
		}
	}

	let current: DisplaySheet | null = null;
	let streamTimer: ReturnType<typeof setInterval> | null = null;

	const overlay: DomOverlay = {
		openSheet(sheet, dock = "right") {
			current = sheet;
			if (!el.sheet) return;
			el.sheet.dataset.dock = dock;
			el.sheet.hidden = false;
			if (el.sheetTitle) el.sheetTitle.textContent = sheet.title;
			if (el.sheetDesc) el.sheetDesc.textContent = sheet.description;
			// Waybill sheets get the approval grammar: STAMP APPROVE / SPIKE.
			if (el.sheetConfirm) {
				el.sheetConfirm.textContent = sheet.waybill
					? "STAMP APPROVE"
					: "Confirm";
			}
			if (spikeBtn) spikeBtn.hidden = !sheet.waybill;
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
				// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
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
				let message: string;
				if (sheet.runActions && sheet.runActions.length > 0) {
					// station.open first-run special: init then up.
					message = "";
					for (const action of sheet.runActions) {
						message = await client.runAction(action);
					}
				} else {
					message = await client.confirm(
						sheet.confirmOp,
						overlay.confirmValues(),
					);
				}
				overlay.closeSheet();
				if (sheet.waybill) opts.onStamped?.(sheet.waybill);
				else opts.onConfirmed(message);
			} catch (err) {
				if (el.sheetStream) {
					// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
					el.sheetStream.textContent = String((err as Error).message ?? err);
				}
			}
		})();
	});
	spikeBtn?.addEventListener("click", () => {
		const sheet = current;
		if (!sheet?.waybill) return;
		overlay.closeSheet();
		opts.onSpiked?.(sheet.waybill.id);
	});
	for (const btn of doc.querySelectorAll("#actions button")) {
		btn.addEventListener("click", () => {
			// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
			const action = btn.getAttribute("data-action") as YardAction | null;
			if (!action) return;
			void client
				.runAction(action)
				.then((message) => opts.onAction(message))
				.catch((err) =>
					// SAFETY: The typed boundary or test fixture establishes this value's shape before use.
					opts.onActionError(String((err as Error).message ?? err)),
				);
		});
	}

	return overlay;
}
