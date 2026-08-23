export function isString<T>(value: T): value is T & string {
  return Object.prototype.toString.call(value) === "[object String]";
}

export function isRecord<T>(value: T): value is T & object {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function isObjectLike<T>(value: T): value is T & object {
  const tag = Object.prototype.toString.call(value);
  return tag === "[object Object]" || tag === "[object Array]";
}
