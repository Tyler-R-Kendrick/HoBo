const reason = {
  error: "error",
  default: "default"
};

const emptyContext = Object.freeze({
  attributes: []
});

export function createEvaluator(provider, hooks = []) {
  return {
    async getBooleanDetails(key, defaultValue, context) {
      return evaluate({
        kind: "boolean",
        method: "getBooleanDetails",
        key,
        defaultValue,
        context,
        provider,
        hooks,
        validate: (value) => typeof value === "boolean"
      });
    },

    async getStringDetails(key, defaultValue, context) {
      return evaluate({
        kind: "string",
        method: "getStringDetails",
        key,
        defaultValue,
        context,
        provider,
        hooks,
        validate: (value) => typeof value === "string"
      });
    },

    async getNumberDetails(key, defaultValue, context) {
      return evaluate({
        kind: "number",
        method: "getNumberDetails",
        key,
        defaultValue,
        context,
        provider,
        hooks,
        validate: (value) => typeof value === "number" && Number.isFinite(value)
      });
    },

    async getObjectDetails(key, defaultValue, context) {
      return evaluate({
        kind: "object",
        method: "getObjectDetails",
        key,
        defaultValue,
        context,
        provider,
        hooks,
        validate: isJsonValue
      });
    }
  };
}

async function evaluate(input) {
  const normalizedContext = input.context ?? emptyContext;
  const invocation = {
    flagKey: input.key,
    valueType: input.kind,
    defaultValue: toJsonValue(input.defaultValue),
    context: normalizedContext
  };

  let context = normalizedContext;
  for (const hook of input.hooks) {
    if (typeof hook.before === "function") {
      context = (await hook.before(invocation)) ?? context;
    }
  }

  try {
    const raw = await input.provider[input.method](input.key, input.defaultValue, context);
    if (!raw || !input.validate(raw.value)) {
      throw new TypeError(`provider returned invalid ${input.kind} flag value`);
    }

    const details = {
      flagKey: raw.flagKey ?? input.key,
      value: raw.value,
      reason: raw.reason ?? reason.default,
      variant: raw.variant,
      error: raw.error
    };
    await runAfterHooks(input.hooks, invocation, input.kind, details);
    return details;
  } catch (cause) {
    const details = errorDetails(input, cause);
    for (const hook of input.hooks) {
      if (typeof hook.onError === "function") {
        await hook.onError(invocation, details.error);
      }
    }
    await runAfterHooks(input.hooks, invocation, input.kind, details);
    return details;
  } finally {
    for (const hook of input.hooks) {
      if (typeof hook.finally === "function") {
        await hook.finally(invocation);
      }
    }
  }
}

async function runAfterHooks(hooks, invocation, kind, details) {
  for (const hook of hooks) {
    if (typeof hook.after === "function") {
      await hook.after(invocation, { tag: kind, val: details });
    }
  }
}

function errorDetails(input, cause) {
  return {
    flagKey: input.key,
    value: input.defaultValue,
    reason: reason.error,
    error: {
      code: "provider-error",
      message: cause instanceof Error ? cause.message : String(cause)
    }
  };
}

export function isJsonValue(value) {
  if (!value || typeof value !== "object" || typeof value.encodedJson !== "string") {
    return false;
  }

  try {
    return isJsonSerializable(JSON.parse(value.encodedJson));
  } catch {
    return false;
  }
}

export function toJsonValue(value) {
  if (isJsonValue(value)) {
    return value;
  }

  if (!isJsonSerializable(value)) {
    throw new TypeError("value is not JSON serializable");
  }

  return { encodedJson: JSON.stringify(value) };
}

function isJsonSerializable(value) {
  if (value === null) {
    return true;
  }

  switch (typeof value) {
    case "boolean":
    case "string":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object":
      if (Array.isArray(value)) {
        return value.every(isJsonSerializable);
      }
      return Object.values(value).every(isJsonSerializable);
    default:
      return false;
  }
}
