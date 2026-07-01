import { describe } from "vitest";

import { createCapabilityLinkTable } from "@hobo/runtime-local";

import { capabilityEnforcementSuite } from "../src/capability-enforcement/suite.js";

describe("@hobo/runtime-local capability enforcement", () => {
  capabilityEnforcementSuite((options) => createCapabilityLinkTable(options ?? {}));
});
