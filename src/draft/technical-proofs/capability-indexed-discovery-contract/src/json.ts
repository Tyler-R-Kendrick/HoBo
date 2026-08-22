export function isString<T>(value: T): value is T & string {
  return Object.prototype.toString.call(value) === "[object String]";
}

export function isRecord<T>(value: T): value is T & Record<string, string | number | boolean | null> {
  return Object.prototype.toString.call(value) === "[object Object]";
}
