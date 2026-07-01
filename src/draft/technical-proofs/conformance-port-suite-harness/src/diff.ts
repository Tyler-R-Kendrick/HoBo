import type { ValueDiff } from "./types.ts";

export function firstDiff(expected: unknown, actual: unknown, path = "$"): ValueDiff | null {
  if (Object.is(expected, actual)) {
    return null;
  }

  if (typeof expected !== typeof actual || expected === null || actual === null) {
    return { path, expected, actual };
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return { path, expected, actual };
    }

    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= expected.length || index >= actual.length) {
        return {
          path: `${path}[${index}]`,
          expected: expected[index],
          actual: actual[index],
        };
      }

      const diff = firstDiff(expected[index], actual[index], `${path}[${index}]`);
      if (diff) {
        return diff;
      }
    }

    return null;
  }

  if (typeof expected === "object") {
    const keys = unique([...Object.keys(expected as object), ...Object.keys(actual as object)]);
    for (const key of keys) {
      const diff = firstDiff(
        (expected as Record<string, unknown>)[key],
        (actual as Record<string, unknown>)[key],
        joinPath(path, key),
      );
      if (diff) {
        return diff;
      }
    }

    return null;
  }

  return { path, expected, actual };
}

function joinPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
