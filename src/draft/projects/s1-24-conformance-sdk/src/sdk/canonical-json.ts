export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function diffJsonPaths(
  expected: unknown,
  actual: unknown,
  prefix = "",
): string[] {
  if (canonicalJson(expected) === canonicalJson(actual)) {
    return [];
  }

  if (
    expected === null ||
    actual === null ||
    typeof expected !== "object" ||
    typeof actual !== "object"
  ) {
    return [prefix || "$"];
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return [prefix || "$"];
    }

    const paths: string[] = [];
    const max = Math.max(expected.length, actual.length);
    for (let index = 0; index < max; index += 1) {
      const childPrefix = `${prefix}[${index}]`;
      if (index >= expected.length || index >= actual.length) {
        paths.push(childPrefix);
        continue;
      }
      paths.push(...diffJsonPaths(expected[index], actual[index], childPrefix));
    }
    return paths.length > 0 ? paths : [prefix || "$"];
  }

  const expectedRecord = expected as Record<string, unknown>;
  const actualRecord = actual as Record<string, unknown>;
  const keys = new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)]);
  const paths: string[] = [];

  for (const key of [...keys].sort()) {
    const childPrefix = prefix ? `${prefix}.${key}` : key;
    if (!(key in expectedRecord) || !(key in actualRecord)) {
      paths.push(childPrefix);
      continue;
    }
    paths.push(...diffJsonPaths(expectedRecord[key], actualRecord[key], childPrefix));
  }

  return paths.length > 0 ? paths : [prefix || "$"];
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
  );
}
