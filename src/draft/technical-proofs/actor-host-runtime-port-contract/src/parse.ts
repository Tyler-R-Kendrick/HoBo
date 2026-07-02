export type ActorKey = string & { readonly __brand: "ActorKey" };
export type HolderId = string & { readonly __brand: "HolderId" };

export function parseActorKey(value: unknown): ActorKey {
  return requireNonEmptyString(value, "key") as ActorKey;
}

export function parseHolderId(value: unknown): HolderId {
  return requireNonEmptyString(value, "holderId") as HolderId;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }
  return value;
}
