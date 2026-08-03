/**
 * Phaser Scene classes — thin render adapters over the presenter model.
 * All logic lives in the headless library (engine/presenter); these scenes
 * only load the measured manifest and reconcile RenderModel → GameObjects.
 * Only main.ts instantiates Phaser.Game.
 */
import Phaser from "phaser";
import { YARD_LAYOUT, type ZoneId, zoneAt } from "../layout.js";
import {
	applyLoadManifest,
	registerAnimations,
	type YardLoadManifest,
} from "../scenes/yard-scene.js";
import type { RenderItem, RenderModel, TextStyleId } from "./yard-presenter.js";

export type YardHost = {
	manifest: YardLoadManifest;
	getRenderModel: () => RenderModel;
	/** Engine tick driven by the scene clock (skipped by host in test mode). */
	onUpdate: (dtMs: number) => void;
	onZoneClick: (zone: ZoneId) => void;
	onSceneReady: () => void;
	onFrame: () => void;
};

const TEXT_STYLES: Record<
	TextStyleId,
	Phaser.Types.GameObjects.Text.TextStyle
> = {
	label: {
		fontFamily: "system-ui, sans-serif",
		fontSize: "11px",
		fontStyle: "700",
	},
	caption: { fontFamily: "system-ui, sans-serif", fontSize: "12px" },
	mono9: { fontFamily: "ui-monospace, monospace", fontSize: "9px" },
	mono11: { fontFamily: "ui-monospace, monospace", fontSize: "11px" },
	mono12: { fontFamily: "ui-monospace, monospace", fontSize: "12px" },
};

function hex(color: string): number {
	return Phaser.Display.Color.HexStringToColor(color).color;
}

export class PreloadScene extends Phaser.Scene {
	private host: YardHost;

	constructor(host: YardHost) {
		super({ key: "Preload" });
		this.host = host;
	}

	preload(): void {
		applyLoadManifest(
			{
				spritesheet: (key, url, cfg) => this.load.spritesheet(key, url, cfg),
				image: (key, url) => this.load.image(key, url),
			},
			this.host.manifest,
		);
	}

	create(): void {
		registerAnimations(
			{
				create: (cfg) => {
					this.anims.create({
						key: cfg.key,
						frames: cfg.frames.map((f) => ({
							key: f.key,
							frame: f.frame,
						})),
						frameRate: cfg.frameRate,
						repeat: cfg.repeat,
					});
				},
				exists: (key) => this.anims.exists(key),
			},
			this.host.manifest,
		);
		this.scene.start("Yard");
	}
}

export class YardScene extends Phaser.Scene {
	private host: YardHost;
	private objects = new Map<string, Phaser.GameObjects.GameObject>();
	private signatures = new Map<string, string>();
	private animBySheet = new Map<string, string>();

	constructor(host: YardHost) {
		super({ key: "Yard" });
		this.host = host;
	}

	create(): void {
		this.cameras.main.setBackgroundColor("#ffffff");
		for (const a of this.host.manifest.animations) {
			this.animBySheet.set(a.key, a.sheetKey);
		}
		this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
			const zone = zoneAt(pointer.worldX, pointer.worldY);
			if (zone) this.host.onZoneClick(zone);
		});
		this.host.onSceneReady();
		this.reconcile(this.host.getRenderModel());
	}

	override update(_time: number, delta: number): void {
		this.host.onUpdate(delta);
		this.host.onFrame();
		this.reconcile(this.host.getRenderModel());
	}

	/** Reconcile declarative model → GameObjects keyed by item id. */
	reconcile(model: RenderModel): void {
		const seen = new Set<string>();
		for (const item of model.items) {
			seen.add(item.id);
			const sig = signature(item);
			if (this.signatures.get(item.id) === sig) {
				// Sprites still need play-state upkeep even when props are stable.
				if (item.kind === "sprite") this.syncSprite(item);
				continue;
			}
			const existing = this.objects.get(item.id);
			if (existing && this.objects.get(item.id)?.constructor) {
				existing.destroy();
				this.objects.delete(item.id);
			}
			this.objects.set(item.id, this.build(item));
			this.signatures.set(item.id, sig);
		}
		for (const [id, obj] of [...this.objects]) {
			if (!seen.has(id)) {
				obj.destroy();
				this.objects.delete(id);
				this.signatures.delete(id);
			}
		}
	}

	private build(item: RenderItem): Phaser.GameObjects.GameObject {
		switch (item.kind) {
			case "rect": {
				const r = this.add.rectangle(item.x, item.y, item.w, item.h);
				r.setOrigin(0, 0);
				if (item.fill) r.setFillStyle(hex(item.fill), item.fillAlpha ?? 1);
				else r.setFillStyle(0, 0);
				if (item.stroke) {
					r.setStrokeStyle(item.lineWidth ?? 1, hex(item.stroke), 1);
				}
				r.setDepth(item.depth);
				return r;
			}
			case "line": {
				const l = this.add.line(
					0,
					0,
					item.x1,
					item.y1,
					item.x2,
					item.y2,
					hex(item.color),
					item.alpha ?? 1,
				);
				l.setOrigin(0, 0);
				l.setLineWidth(item.lineWidth / 2);
				l.setDepth(item.depth);
				return l;
			}
			case "text": {
				const t = this.add.text(item.x, item.y, item.text, {
					...TEXT_STYLES[item.style],
					color: item.color,
				});
				t.setDepth(item.depth);
				return t;
			}
			case "image": {
				const img = this.add.image(item.x, item.y, item.key);
				img.setOrigin(0, 0);
				img.setDisplaySize(item.w, item.h);
				img.setAlpha(item.alpha ?? 1);
				img.setDepth(item.depth);
				return img;
			}
			case "sprite": {
				const sheetKey = this.animBySheet.get(item.animationId);
				if (!sheetKey) {
					throw new Error(`unknown animation id: ${item.animationId}`);
				}
				const s = this.add.sprite(item.x, item.y, sheetKey);
				// Feet baseline (assets_index origin {0.5, 1}).
				s.setOrigin(0.5, 1);
				s.setScale(item.scale);
				s.setDepth(item.depth);
				this.syncSprite(item, s);
				return s;
			}
		}
	}

	private syncSprite(
		item: Extract<RenderItem, { kind: "sprite" }>,
		sprite?: Phaser.GameObjects.Sprite,
	): void {
		const s =
			sprite ?? (this.objects.get(item.id) as Phaser.GameObjects.Sprite);
		if (!s) return;
		s.setPosition(item.x, item.y);
		if (item.testFrame !== null) {
			s.anims.stop();
			const sheetKey = this.animBySheet.get(item.animationId);
			if (sheetKey) s.setTexture(sheetKey, item.testFrame);
		} else if (
			s.anims.currentAnim?.key !== item.animationId ||
			!s.anims.isPlaying
		) {
			s.play(item.animationId, true);
		}
	}
}

function signature(item: RenderItem): string {
	// Sprites move every frame; exclude position so we update, not rebuild.
	if (item.kind === "sprite") {
		return `sprite:${item.animationId}:${item.scale}:${item.depth}:${item.testFrame}`;
	}
	return JSON.stringify(item);
}

export function yardParentAspect(): { width: number; height: number } {
	return { width: YARD_LAYOUT.width, height: YARD_LAYOUT.height };
}
