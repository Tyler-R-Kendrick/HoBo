import { type EmailSender } from "@wasp.sh/spec";

/**
 * SMTP placeholder so `wasp build` can run for Temporary Accounts client deploys.
 * Local `wasp start` still works; emails need a real SMTP/SendGrid provider for production.
 * Dummy is rejected by Wasp when building for production.
 */
export const emailSender: EmailSender = {
  provider: "SMTP",
  defaultFrom: {
    name: "Open SaaS App",
    email: "me@example.com",
  },
};
