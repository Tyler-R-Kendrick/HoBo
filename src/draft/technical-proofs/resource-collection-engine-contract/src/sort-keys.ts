export function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeys(entry)) as T;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
  ) as T;
}
