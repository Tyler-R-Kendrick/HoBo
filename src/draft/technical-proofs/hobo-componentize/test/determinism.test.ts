import { describe, expect, it } from "vitest";

import { runComponentSmoke } from "../src/index.js";
import { buildHelloBindle } from "./helpers.js";

describe("componentize determinism", () => {
  it("keeps canonical inputs stable and smoke output consistent across rebuilds", async () => {
    const first = await buildHelloBindle();
    const second = await buildHelloBindle();

    expect(second.reproducibility.inputsDigest).toBe(first.reproducibility.inputsDigest);
    expect(second.reproducibility.sourceDigests).toEqual(first.reproducibility.sourceDigests);

    const firstSmoke = await runComponentSmoke(first.component, { exportName: "health" });
    const secondSmoke = await runComponentSmoke(second.component, { exportName: "health" });
    expect(secondSmoke.stdout).toBe(firstSmoke.stdout);
    expect(secondSmoke.stdout).toBe("hello-bindle:ok\n");

    if (second.component.digest === first.component.digest) {
      expect(Buffer.from(second.component.bytes)).toEqual(Buffer.from(first.component.bytes));
      expect(second.oci.manifestDigest).toBe(first.oci.manifestDigest);
    }
  }, 360_000);
});
