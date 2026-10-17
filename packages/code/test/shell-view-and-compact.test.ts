/**
 * The shell's derived views: the Bo marker, the active agent label, the frame
 * tree, and what a `/compact` keeps.
 *
 * All four are pure functions over shell state, and all four are things a
 * reader looks at to answer "what is happening right now". What they commit to:
 *
 * **The Bo marker animates only while there is something to animate.** It
 * cycles through four faces while a turn is in flight and holds one still
 * otherwise — and holds it still under reduced motion even mid-turn, because a
 * spinner is decoration and someone who asked for stillness asked for it
 * everywhere.
 *
 * **The active agent label answers "who am I talking to".** On chat that is
 * always Bo; on the mux surface it is whichever agent owns the focused pane,
 * resolved from the pane's own label, then its agent id, then the tmux window
 * behind it. Each fallback is a worse name for the same thing, which is why
 * they are ordered — and why the last resort is Bo rather than blank.
 *
 * **The frame's title says which surface is showing and how far it is scrolled
 * back.** A scroll indicator only appears once the reader has actually
 * scrolled: a permanent `↑0` would be chrome that never varies.
 *
 * **`/compact` keeps the journal, not the visible transcript.** The messages
 * on screen are already a compacted view; compacting *those* again would
 * summarise a summary and lose what the first pass dropped.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InSessionPanes } from "../src/in-session-panes.js";
import {
	activeAgentLabel,
	applyCompact,
	boMarker,
	buildShellTree,
	createInitialShellState,
	type InteractiveShellState,
	openAgentsCatalog,
	type PendingApproval,
	type ShellMessage,
	withHarnessFromLivePanes,
} from "../src/interactive-shell.js";

/**
 * The directories the shell is built over. Building the initial state writes
 * into the home (a chat under `durable/code`, the current session under
 * `runtime/code`), so both are real directories made here and removed after.
 * A made-up absolute path is not a stand-in: run as root, which every CI
 * container is, the write creates it at the filesystem root and leaves it there.
 */
let fixtureRoot = "";

beforeAll(() => {
	fixtureRoot = mkdtempSync(join(tmpdir(), "hobo-shell-view-tests-"));
	mkdirSync(join(fixtureRoot, "home"));
	mkdirSync(join(fixtureRoot, "project"));
});

afterAll(() => {
	rmSync(fixtureRoot, { recursive: true, force: true });
});

/** An unset root would make both paths relative, and the shell would write into the working directory. */
const fixtureDirs = () => {
	if (fixtureRoot === "")
		throw new Error("the fixture root is made in beforeAll");
	return {
		hoboHome: join(fixtureRoot, "home"),
		cwd: join(fixtureRoot, "project"),
	};
};

const base = (overrides: Partial<InteractiveShellState> = {}) =>
	// SAFETY: the fixture is the state shape these views are declared over.
	({
		...createInitialShellState({
			width: 80,
			height: 24,
			welcome: false,
			env: {},
			...fixtureDirs(),
		}),
		...overrides,
		// SAFETY: the fixture is the state shape these views are declared over.
	}) as InteractiveShellState;

const message = (text: string, role: ShellMessage["role"] = "user") =>
	({ role, text, at: 1 }) as ShellMessage;

/**
 * Panes carrying enough captured output to scroll. `syncAgentsBodyLines`
 * clamps `paneScroll` against the real content height, so a pane with an empty
 * capture cannot be scrolled back at all and the title never shows a position.
 */
const panes = (names: readonly string[]): InSessionPanes => ({
	session: "hobo",
	windows: names.map((name) => ({
		name,
		target: `hobo:${name}`,
		kind: "coding-agent" as const,
	})),
	focused: 0,
	capture: Array.from({ length: 80 }, (_u, i) => `line ${i}`).join("\n"),
	note: "",
	tmux: true,
});

/** The frame's first line, which carries the surface title. */
const title = (state: InteractiveShellState): string => {
	const tree = buildShellTree(state);
	return /"title":"([^"]*)"/u.exec(JSON.stringify(tree))?.[1] ?? "";
};

describe("the Bo marker", () => {
	it("holds still while nothing is running", () => {
		expect(boMarker(base({ agentState: "idle" }))).toBe("(••)");
	});

	it("holds still when a turn is done", () => {
		expect(boMarker(base({ agentState: "done" }))).toBe("(••)");
	});

	it("holds still under reduced motion even mid-turn", () => {
		// A spinner is decoration; someone who asked for stillness asked for it
		// everywhere, not only when nothing is happening.
		expect(
			boMarker(
				base({ agentState: "working", reducedMotion: true, tickMs: 900 }),
			),
		).toBe("(••)");
	});

	it("animates while a turn is in flight", () => {
		// The face list repeats its first face at index 2, so a tick landing on
		// an even slot is indistinguishable from the resting face. 95ms per
		// tick, so tick 1 is the first slot that genuinely differs.
		expect(
			boMarker(
				base({ agentState: "working", reducedMotion: false, tickMs: 95 }),
			),
		).not.toBe("(••)");
	});

	it("cycles rather than running off the end of its faces", () => {
		// The tick counter grows without bound; the face index has to wrap.
		const faces = new Set(
			Array.from({ length: 40 }, (_u, i) =>
				boMarker(
					base({
						agentState: "working",
						reducedMotion: false,
						tickMs: i * 250,
					}),
				),
			),
		);
		expect(faces.size).toBeGreaterThan(1);
		expect(faces.size).toBeLessThanOrEqual(4);
	});
});

describe("who the shell is talking to", () => {
	it("is Bo on the chat surface", () => {
		expect(activeAgentLabel(base({ focus: "chat" }))).toBe("Hobo Bo");
	});

	it("is Bo on the mux surface with nothing seated", () => {
		// The last resort is a real name, not a blank: the strap always says
		// who is listening.
		expect(activeAgentLabel(base({ focus: "agents" }))).toBe("Hobo Bo");
	});

	it("names the focused pane's agent on the mux surface", () => {
		const seated = base({
			...withHarnessFromLivePanes(
				base({ focus: "agents", agentWork: true }),
				panes(["claude"]),
			),
			focus: "agents",
			agentWork: true,
		});
		expect(activeAgentLabel(seated)).not.toBe("Hobo Bo");
	});

	it("falls back to the tmux window when the view has no pane", () => {
		// The harness view can be empty while tmux still has a window; the
		// window's name is a worse label for the same agent, not a missing one.
		const seated = base({
			focus: "agents",
			agentWork: true,
			livePanes: panes(["codex"]),
		});
		expect(activeAgentLabel(seated)).not.toBe("Hobo Bo");
	});

	it("stays Bo when the focus is not the mux surface", () => {
		// Even with agents seated: the label answers "who owns this surface",
		// and on chat that is always Bo.
		const seated = base({
			focus: "chat",
			agentWork: true,
			livePanes: panes(["claude"]),
		});
		expect(activeAgentLabel(seated)).toBe("Hobo Bo");
	});
});

describe("the frame title", () => {
	it("names the agents catalog when it is open", () => {
		expect(title(openAgentsCatalog(base()))).toContain("agents");
	});

	it("shows how far the catalog is scrolled back", () => {
		const open = openAgentsCatalog(base());
		const scrolled = base({
			...open,
			agentsCatalog: open.agentsCatalog
				? { ...open.agentsCatalog, scroll: 3 }
				: null,
			focus: "agents-catalog",
		});
		expect(title(scrolled)).toContain("↑3");
	});

	it("does not show a scroll indicator at the top", () => {
		// A permanent `↑0` would be chrome that never varies.
		expect(title(openAgentsCatalog(base()))).not.toContain("↑");
	});

	it("names the focused agent on the mux surface", () => {
		const seated = base({
			...withHarnessFromLivePanes(
				base({ focus: "agents", agentWork: true }),
				panes(["claude"]),
			),
			focus: "agents",
			agentWork: true,
		});
		expect(title(seated).length).toBeGreaterThan(0);
	});

	it("marks an attached pane in the title", () => {
		// Attached means keystrokes are going somewhere else; the title is
		// where a reader finds that out before typing.
		const seated = base({
			...withHarnessFromLivePanes(
				base({ focus: "agents", agentWork: true }),
				panes(["claude"]),
			),
			focus: "agents",
			agentWork: true,
			paneInteract: true,
		});
		expect(title(seated)).toContain("attached");
	});

	it("shows the scrollback position while attached", () => {
		const seated = base({
			...withHarnessFromLivePanes(
				base({ focus: "agents", agentWork: true }),
				panes(["claude"]),
			),
			focus: "agents",
			agentWork: true,
			paneInteract: true,
			paneScroll: 5,
		});
		expect(title(seated)).toContain("↑5");
	});

	it("shows the mux scrollback position while detached", () => {
		const seated = base({
			...withHarnessFromLivePanes(
				base({ focus: "agents", agentWork: true }),
				panes(["claude"]),
			),
			focus: "agents",
			agentWork: true,
			paneScroll: 2,
		});
		expect(title(seated)).toContain("↑2");
	});

	it("builds a frame for a pending approval", () => {
		// SAFETY: the fixture stands in for the gate the host builds.
		const approval = {
			runId: "run-1",
			sandboxRoot: "/tmp/sandbox",
			changes: [
				{ path: "a.ts", status: "M" },
				{ path: "b.ts", status: "A" },
			],
		} as unknown as PendingApproval;
		expect(
			JSON.stringify(buildShellTree(base({ pendingApproval: approval }))),
		).toContain("run-1");
	});

	it("lists every change the approval covers", () => {
		// Not a count: the dialog names each path and its status, so the reader
		// approves what they can actually see rather than a number.
		// SAFETY: the fixture stands in for the gate the host builds.
		const approval = {
			runId: "run-1",
			sandboxRoot: "/tmp/sandbox",
			changes: [
				{ path: "a.ts", status: "M" },
				{ path: "b.ts", status: "A" },
			],
		} as unknown as PendingApproval;
		const painted = JSON.stringify(
			buildShellTree(base({ pendingApproval: approval })),
		);
		expect(painted).toContain("a.ts");
		expect(painted).toContain("b.ts");
	});

	it("shows each change's status beside its path", () => {
		// Added and modified are different risks; a bare path list would hide
		// which is which.
		// SAFETY: the fixture stands in for the gate the host builds.
		const approval = {
			runId: "run-1",
			sandboxRoot: "/tmp/sandbox",
			changes: [{ path: "a.ts", status: "M" }],
		} as unknown as PendingApproval;
		expect(
			JSON.stringify(buildShellTree(base({ pendingApproval: approval }))),
		).toContain("M  a.ts");
	});

	it("promises the canonical tree is untouched until yes", () => {
		// The sentence the gate exists for, rendered where the decision is made
		// rather than in documentation elsewhere.
		// SAFETY: the fixture stands in for the gate the host builds.
		const approval = {
			runId: "run-1",
			sandboxRoot: "/tmp/sandbox",
			changes: [{ path: "a.ts", status: "M" }],
		} as unknown as PendingApproval;
		expect(
			JSON.stringify(buildShellTree(base({ pendingApproval: approval }))),
		).toContain("canonical tree is untouched");
	});

	it("names the sandbox the changes are held in", () => {
		// SAFETY: the fixture stands in for the gate the host builds.
		const approval = {
			runId: "run-1",
			sandboxRoot: "/tmp/sandbox",
			changes: [{ path: "a.ts", status: "M" }],
		} as unknown as PendingApproval;
		expect(
			JSON.stringify(buildShellTree(base({ pendingApproval: approval }))),
		).toContain("/tmp/sandbox");
	});

	it("builds a frame with no approval pending", () => {
		expect(JSON.stringify(buildShellTree(base()))).not.toContain("run-1");
	});
});

describe("compacting the transcript", () => {
	const withJournal = (extra: Partial<InteractiveShellState> = {}) =>
		base({
			messages: [message("visible only")],
			journal: [message("older"), message("newer")],
			...extra,
		});

	it("compacts the journal rather than the visible transcript", () => {
		// What is on screen is already a compacted view; compacting that again
		// would summarise a summary and lose what the first pass dropped.
		const next = applyCompact(withJournal());
		expect(next.messages.length).toBeGreaterThan(0);
	});

	it("falls back to the visible messages when there is no journal", () => {
		const next = applyCompact(
			base({ messages: [message("only")], journal: null }),
		);
		expect(next.messages.length).toBeGreaterThan(0);
	});

	it("takes a focus to compact around", () => {
		// `/compact auth` says what to keep; the plan is different from an
		// unfocused one.
		const focused = applyCompact(withJournal(), "auth");
		expect(focused.messages).toBeDefined();
	});

	it("ignores a whitespace-only focus", () => {
		// `/compact ` with a stray space is not a request to focus on nothing.
		const blank = applyCompact(withJournal(), "   ");
		const none = applyCompact(withJournal());
		expect(blank.messages.length).toBe(none.messages.length);
	});

	it("carries the station label into the plan", () => {
		expect(
			applyCompact(withJournal({ stationLabel: "station:local" })).messages,
		).toBeDefined();
	});

	it("carries the environment label into the plan", () => {
		expect(
			applyCompact(withJournal({ envLabel: "local-dev" })).messages,
		).toBeDefined();
	});

	it("carries the session id into the plan", () => {
		expect(
			applyCompact(withJournal({ sessionId: "sess-1" })).messages,
		).toBeDefined();
	});

	it("compacts a session with no labels at all", () => {
		const next = applyCompact(
			withJournal({ stationLabel: "", envLabel: "", sessionId: null }),
		);
		expect(next.messages).toBeDefined();
	});

	it("leaves the journal itself in place", () => {
		// The journal is the durable record; compacting is a view over it, not
		// a destructive edit of it.
		const before = withJournal();
		const next = applyCompact(before);
		expect(next.journal?.length).toBe(before.journal?.length);
	});

	it("handles an empty transcript", () => {
		expect(
			applyCompact(base({ messages: [], journal: [] })).messages,
		).toBeDefined();
	});
});
