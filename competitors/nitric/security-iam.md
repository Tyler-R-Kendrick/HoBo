# Nitric — Security & IAM

> Part of the [Nitric competitor reference](./README.md).

## Inline permissions → least-privilege IAM
Permissions are declared at the point of use via `.allow(...)`:
```javascript
const data   = bucket('data').allow('read','write')
const tasks  = queue('tasks').allow('enqueue')
const apiKey = secret('api-key').allow('access')
```
From these, Nitric generates **least-privilege** policies per cloud automatically:
- **AWS:** IAM roles + policies
- **GCP:** IAM bindings
- **Azure:** role assignments

No manual IAM authoring; access is explicit in code, eliminating overly broad grants. This is one of Nitric's headline differentiators vs raw IaC.

## API authentication (OIDC)
```javascript
const rule = oidcRule({
  name: 'default',
  audiences: ['https://myapp.example.com'],
  issuer: 'https://auth-provider.example.com',
})
const secure = api('main', { security: [rule()] })
secure.get('/protected', securityRule('default'), async (ctx) => { /* authenticated */ })
```
Works with OIDC-compatible providers (Auth0, Cognito, FusionAuth, …).

## Custom auth middleware
```javascript
async function validateApiKey(ctx, next) {
  if (ctx.req.headers['x-api-key'] !== process.env.API_KEY) { ctx.res.status = 401; return ctx }
  return await next(ctx)
}
api('main').use(validateApiKey)
```

## Notable limitation
Security rules are **not enforced in local dev** (`nitric start`) — you must deploy to a cloud to test them.
