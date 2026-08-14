import { describe, expect, it } from "vitest";

import { createResourceLifecycle } from "../src/session-lifecycle.js";

describe("local resource lifecycle", () => {
	it("can register a local topology resource as already started", () => {
		const life = createResourceLifecycle();
		life.register({
			id: "yard:local",
			kind: "yard",
			provisioned: true,
			initiallyStarted: true,
		});
		const snap = life.snapshot("yard:local");
		expect(snap.started).toBe(true);
		expect(snap.ready).toBe(true);
		expect(snap.state).toBe("ready");
	});

	it("does not mark a provisioned-only resource Ready", () => {
		const life = createResourceLifecycle();
		life.register({
			id: "web",
			kind: "http",
			provisioned: true,
		});
		const snap = life.snapshot("web");
		expect(snap.provisioned).toBe(true);
		expect(snap.started).toBe(false);
		expect(snap.ready).toBe(false);
		expect(snap.state).toBe("stopped");
	});

	it("marks Ready only after start plus a passing health probe", async () => {
		const life = createResourceLifecycle({
			probe: async (id) => ({ ok: id === "web" }),
		});
		life.register({
			id: "web",
			kind: "http",
			healthUrl: "http://127.0.0.1/health",
		});
		await life.start("web");
		const snap = life.snapshot("web");
		expect(snap.started).toBe(true);
		expect(snap.healthy).toBe(true);
		expect(snap.ready).toBe(true);
		expect(snap.state).toBe("ready");
	});

	it("keeps started-but-unhealthy resources not Ready", async () => {
		const life = createResourceLifecycle({
			probe: async () => ({ ok: false, reason: "connection refused" }),
		});
		life.register({ id: "api", kind: "http" });
		await life.start("api");
		const snap = life.snapshot("api");
		expect(snap.started).toBe(true);
		expect(snap.healthy).toBe(false);
		expect(snap.ready).toBe(false);
		expect(snap.state).toBe("unhealthy");
	});

	it("stop and restart clear then re-probe Ready", async () => {
		let healthy = true;
		const life = createResourceLifecycle({
			probe: async () => ({ ok: healthy }),
		});
		life.register({ id: "web", kind: "http" });
		await life.start("web");
		expect(life.snapshot("web").ready).toBe(true);
		await life.stop("web");
		expect(life.snapshot("web").ready).toBe(false);
		expect(life.snapshot("web").state).toBe("stopped");
		healthy = false;
		await life.restart("web");
		expect(life.snapshot("web").started).toBe(true);
		expect(life.snapshot("web").ready).toBe(false);
	});
});
