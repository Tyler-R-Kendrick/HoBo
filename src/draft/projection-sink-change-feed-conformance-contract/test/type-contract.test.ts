import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

test("TypeScript contract keeps non-change-feed sinks reactive false", () => {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? [
          "/d",
          "/s",
          "/c",
          "npm.cmd exec --yes --package typescript@5.5.4 -- tsc --noEmit --project tsconfig.json",
        ]
      : [
          "exec",
          "--yes",
          "--package",
          "typescript@5.5.4",
          "--",
          "tsc",
          "--noEmit",
          "--project",
          "tsconfig.json",
        ];
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    encoding: "utf8",
    shell: false,
  });

  assert.equal(
    result.status,
    0,
    [result.error?.message, result.stdout, result.stderr].filter(Boolean).join("\n") ||
      "TypeScript exited non-zero",
  );
});
