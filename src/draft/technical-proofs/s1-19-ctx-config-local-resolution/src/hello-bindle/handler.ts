import type { RuntimeCtx } from "../runtime/ctx.js";
import type { cfg } from "./config.js";
import { SecretValue } from "../core/secret-value.js";

export async function helloHandler(ctx: RuntimeCtx<typeof cfg>): Promise<{
  greeting: string;
  logLevel: string;
  apiKey: string;
}> {
  const greeting = await ctx.config.GREETING();
  const logLevel = await ctx.config.LOG_LEVEL();
  const apiKeyValue = await ctx.config.API_KEY();

  ctx.log("hello-bindle booted", { greeting, logLevel });
  ctx.emit("hello.Greeted", { greeting, logLevel });
  ctx.stream({ greeting, logLevel, apiKey: apiKeyValue });

  const apiKey =
    apiKeyValue && typeof apiKeyValue === "object" && apiKeyValue instanceof SecretValue
      ? apiKeyValue.reveal()
      : String(apiKeyValue);
  return { greeting: String(greeting), logLevel: String(logLevel), apiKey };
}
