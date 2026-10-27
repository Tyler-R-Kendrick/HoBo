# Vercel queue contracts

`queue.proto` records the two messages the Vercel queue accepts: a wakeup for a
previously committed delivery, and a scheduled or continuation repair request.
`queue.cue` constrains the fields used by the worker while permitting Vercel's
additional delivery metadata. Its fixtures cover both kinds and invalid input.
The `null` input used for an explicitly authenticated manual tick is a local
command, not a Vercel queue message.
