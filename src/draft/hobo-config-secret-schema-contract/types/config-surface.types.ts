import {
  config,
  createConfigContext,
  env,
  fromBinding,
  secretRef
} from "../src/config-schema.js";

const cfg = config({
  DB: fromBinding("db"),
  STRIPE: secretRef("stripe/api-key"),
  LOG_LEVEL: env("info")
});

const ctx = createConfigContext(cfg, async () => "resolved");

const stripe: Promise<string> = ctx.config.STRIPE();
const db: Promise<string> = ctx.config.DB();
const logLevel: Promise<string> = ctx.config.LOG_LEVEL();

void stripe;
void db;
void logLevel;

// @ts-expect-error undeclared config keys must not be callable.
ctx.config.MISSING();
