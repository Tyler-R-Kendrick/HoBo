import type { PlatformMatrixRow } from "./types.js";

/**
 * Isolation platform matrix (ADR-0139).
 * Rift preferred on CoW filesystems; classical worktree is first-class everywhere.
 */
export const ISOLATION_PLATFORM_MATRIX: readonly PlatformMatrixRow[] = [
	{
		platform: "linux-btrfs",
		preferredBackend: "rift",
		fallback: "worktree",
		cowCapable: true,
		ciDefault: "worktree",
		notes:
			"Rift CoW via btrfs when available; CI uses worktree for determinism.",
	},
	{
		platform: "linux-reflink",
		preferredBackend: "rift",
		fallback: "worktree",
		cowCapable: true,
		ciDefault: "worktree",
		notes: "XFS/Btrfs reflink capable hosts may use rift; otherwise worktree.",
	},
	{
		platform: "linux-generic",
		preferredBackend: "worktree",
		fallback: "worktree",
		cowCapable: false,
		ciDefault: "worktree",
		notes: "Non-CoW Linux must use classical git worktrees.",
	},
	{
		platform: "darwin-apfs",
		preferredBackend: "rift",
		fallback: "worktree",
		cowCapable: true,
		ciDefault: "worktree",
		notes: "APFS clonefile enables rift; worktree remains mandatory fallback.",
	},
	{
		platform: "win32",
		preferredBackend: "worktree",
		fallback: "worktree",
		cowCapable: false,
		ciDefault: "worktree",
		notes: "Windows always uses classical git worktrees.",
	},
] as const;

export function matrixForPlatform(
	platform: string = process.platform,
): PlatformMatrixRow {
	if (platform === "darwin") {
		return (
			ISOLATION_PLATFORM_MATRIX.find((r) => r.platform === "darwin-apfs") ??
			ISOLATION_PLATFORM_MATRIX[4]!
		);
	}
	if (platform === "win32") {
		return (
			ISOLATION_PLATFORM_MATRIX.find((r) => r.platform === "win32") ??
			ISOLATION_PLATFORM_MATRIX[4]!
		);
	}
	// Linux: generic until a CoW probe upgrades to rift.
	return (
		ISOLATION_PLATFORM_MATRIX.find((r) => r.platform === "linux-generic") ??
		ISOLATION_PLATFORM_MATRIX[2]!
	);
}
