import { createHash } from "node:crypto";

import type { BindingResolverPort } from "./binding-resolver.js";
import { LAZY_TOKEN_PATTERN, type HoboManifest, type ResolvedEnv, parseResourceId } from "./types.js";
import type { Camp } from "./topology.js";

export class BindingResolutionError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "BindingResolutionError";
    this.path = path;
  }
}

export async function resolveLocalBindings(
  manifest: HoboManifest,
  camp: Camp,
  resolver: BindingResolverPort,
): Promise<ResolvedEnv> {
  if (camp.providerId !== "local") {
    throw new BindingResolutionError(
      "camp.providerId",
      `resolveLocalBindings requires local provider, got ${camp.providerId}`,
    );
  }

  const resolved: Record<string, string> = {};

  for (const [resourceId, resource] of Object.entries(manifest.resources)) {
    await walkStrings(resource, `resources.${resourceId}`, async (value, path) => {
      const match = LAZY_TOKEN_PATTERN.exec(value);
      if (!match) {
        return;
      }

      const [, tokenResourceId, property] = match;
      const binding = await resolver.resolve(parseResourceId(tokenResourceId!), property!);
      if (binding.source !== "runtime-local") {
        throw new BindingResolutionError(path, `expected runtime-local source for ${value}`);
      }
      resolved[path] = binding.value;
    });
  }

  const env: Record<string, string> = {};
  for (const resource of Object.values(manifest.resources)) {
    for (const [key, value] of Object.entries(resource.env ?? {})) {
      const match = LAZY_TOKEN_PATTERN.exec(value);
      if (!match) {
        env[key] = value;
        continue;
      }
      const [, tokenResourceId, property] = match;
      const binding = await resolver.resolve(parseResourceId(tokenResourceId!), property!);
      env[key] = binding.value;
    }
  }

  return Object.freeze(env);
}

export function canonicalManifestHash(manifest: HoboManifest): string {
  const canonical = JSON.stringify(sortKeys(manifest));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

async function walkStrings(
  value: unknown,
  path: string,
  visitor: (value: string, path: string) => Promise<void>,
): Promise<void> {
  if (typeof value === "string") {
    await visitor(value, path);
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      await walkStrings(item, `${path}[${index}]`, visitor);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      await walkStrings(child, `${path}.${key}`, visitor);
    }
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
  );
}
