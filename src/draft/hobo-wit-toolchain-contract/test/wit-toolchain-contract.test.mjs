import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  EXPECTED_INTERFACES,
  JCO_PATH,
  PACKAGE_ROOT,
  assertGeneratedMatches,
  parseHoboSdkSkeleton,
  readToolchainLock,
  readWitSource,
  validateToolchainLock,
  writeGeneratedBindings,
} from "../src/wit-toolchain-contract.mjs";

test("hobo:sdk WIT package skeleton validates without filling downstream interfaces", async () => {
  const source = await readWitSource();
  const contract = parseHoboSdkSkeleton(source);

  assert.equal(contract.package, "hobo:sdk");
  assert.equal(contract.version, "0.1.0");
  assert.deepEqual(contract.world.imports, EXPECTED_INTERFACES);
  for (const entry of Object.values(contract.interfaces)) {
    assert.deepEqual(entry.functions, []);
  }

  assert.throws(
    () => parseHoboSdkSkeleton(source.replace("interface workflow {\n}", "interface workflow {\n  run: func();\n}")),
    /wit_toolchain.scope_creep_filled_interfaces/,
  );
});

test("toolchain lock pins the canonical generator and vendored WIT dependencies", async () => {
  const lock = await readToolchainLock();
  const result = await validateToolchainLock(lock);

  assert.equal(result.canonicalGenerator, "@bytecodealliance/jco@1.24.3");
  assert.equal(result.deps, 3);
  assert.ok(lock.compatFloor.policy.endsWith("07-portability-extensibility.md#adr-0024"));

  await assert.rejects(
    () =>
      validateToolchainLock({
        ...lock,
        canonicalGenerator: { ...lock.canonicalGenerator, name: "wit-bindgen-cli" },
      }),
    /canonical generator must be @bytecodealliance\/jco/,
  );
  await assert.rejects(
    () =>
      validateToolchainLock({
        ...lock,
        witDeps: [
          {
            ...lock.witDeps[0],
            digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
          },
        ],
      }),
    /digest drift/,
  );
});

test("wit:gen produces byte-identical checked-in bindings on rerun", async (t) => {
  if (!existsSync(JCO_PATH)) {
    t.skip("package-local @bytecodealliance/jco is not installed; run npm install in this draft package");
    return;
  }

  await assertGeneratedMatches();

  const first = await withTempDir((dir) => writeAndReadGenerated(dir));
  const second = await withTempDir((dir) => writeAndReadGenerated(dir));

  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), [
    "interfaces/hobo-sdk-actor.d.ts",
    "interfaces/hobo-sdk-agent.d.ts",
    "interfaces/hobo-sdk-capability.d.ts",
    "interfaces/hobo-sdk-command.d.ts",
    "interfaces/hobo-sdk-data.d.ts",
    "interfaces/hobo-sdk-saga.d.ts",
    "interfaces/hobo-sdk-subscribe.d.ts",
    "interfaces/hobo-sdk-workflow.d.ts",
    "sdk.d.ts",
  ]);
});

test("trivial guest imports the generated hobo:sdk world and builds", async () => {
  const args = [
    "--strict",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
  ];
  const localTsc = join(
    PACKAGE_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc",
  );
  const command =
    existsSync(localTsc) ? localTsc : process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm";

  await withTempDir(async (outDir) => {
    const buildArgs = [...args, "--outDir", outDir, join(PACKAGE_ROOT, "fixtures", "trivial-guest.ts")];
    const npmExecArgs = ["exec", "--yes", "--package", "typescript@5.5.4", "--", "tsc", ...buildArgs];
    const commandArgs = existsSync(localTsc)
      ? buildArgs
      : process.platform === "win32"
        ? ["/d", "/c", "npm.cmd", ...npmExecArgs]
        : npmExecArgs;

    execFileSync(command, commandArgs, { cwd: PACKAGE_ROOT, stdio: "pipe" });
  });
});

test("uncommitted generator output drift fails closed", async (t) => {
  const driftedSource = (await readWitSource()).replace("interface data {\n}", "interface data {\n  query: func();\n}");

  assert.throws(() => parseHoboSdkSkeleton(driftedSource), /scope_creep_filled_interfaces/);

  if (!existsSync(JCO_PATH)) {
    t.skip("package-local @bytecodealliance/jco is not installed; run npm install in this draft package");
    return;
  }

  await withTempDir(async (dir) => {
    await writeGeneratedBindings({ outDir: dir });
    await writeFile(join(dir, "sdk.d.ts"), "// drifted\n");
    await assert.rejects(
      () => assertGeneratedMatches({ generatedRoot: dir }),
      /generated_content_drift: sdk\.d\.ts/,
    );
  });
});

async function writeAndReadGenerated(outDir) {
  const files = await writeGeneratedBindings({ outDir });
  return Object.fromEntries(
    await Promise.all(files.map(async (file) => [file, await readFile(join(outDir, file), "utf8")])),
  );
}

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), "hobo-wit-gen-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
