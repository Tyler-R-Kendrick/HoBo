# Nitric — Resource Catalog (complete)

> Every Nitric resource/primitive, its SDK surface, permission verbs, and cloud mappings. Snippets are Node `@nitric/sdk`. Part of the [Nitric competitor reference](./README.md).

## Summary table
| Resource | Declaration | `.allow()` verbs | AWS | GCP | Azure |
|---|---|---|---|---|---|
| **API** (HTTP) | `api('name')` | (route-level security) | API Gateway + Lambda | Cloud Run | Container Apps |
| **KV store** | `kv('name')` | `get`,`set`,`delete` | DynamoDB | Firestore | Cosmos DB / Table |
| **Bucket** | `bucket('name')` | `read`,`write`,`delete` | S3 | Cloud Storage | Blob Storage |
| **Queue** (pull) | `queue('name')` | `enqueue`,`dequeue` | SQS | Cloud Tasks | Service Bus Queue |
| **Topic** (push) | `topic('name')` | `publish`,`subscribe` | SNS / EventBridge | Pub/Sub | Event Grid / SB Topic |
| **Secret** | `secret('name')` | `put`,`access` | Secrets Manager | Secret Manager | Key Vault |
| **SQL** (preview) | `sql('name')` | (connection string) | RDS Postgres | Cloud SQL PG | Azure DB for PG |
| **Schedule** | `schedule('name')` | n/a | EventBridge | Cloud Scheduler | Timer Trigger |
| **WebSocket** | `websocket('name')` | n/a | API GW WebSocket | Firestore+PubSub | Web PubSub |
| **Batch job** | `job('name')` | `submit` | AWS Batch | Cloud Batch | Azure Batch |
| **Website** | `websites:` (yaml) | n/a | CloudFront + S3 | Cloud Storage + CDN | Front Door + Blob |

## API
```javascript
import { api } from '@nitric/sdk'
const myApi = api('main')
myApi.get('/users/:id', async (ctx) => { ctx.res.json({ id: ctx.req.params.id }) })
// methods: get/post/put/delete/patch/options/head/all; middleware via myApi.use(fn)
// ctx.req: params, query, headers, json(), text(), body ; ctx.res: status, headers, json(), text(), send()
```
Route security via OIDC rules (see [security-iam.md](./security-iam.md)).

## Key-Value store
```javascript
import { kv } from '@nitric/sdk'
const countries = kv('countries').allow('get','set','delete')
await countries.set('USA', { population: 330_000_000 })
const c = await countries.get('USA')
await countries.delete('USA')
for await (const key of countries.keys('US')) { /* prefix scan */ }
```

## Bucket (storage)
```javascript
import { bucket } from '@nitric/sdk'
const profiles = bucket('profiles').allow('read','write','delete')
await profiles.file('u/john.png').write(bytes)         // max 4MB direct write
const b = await profiles.file('u/john.png').read()
const url = await profiles.file('u/john.png').getDownloadUrl({ expiry: 3600 })  // presigned
profiles.on('write', '/u', async (ctx) => { /* bucket notification */ })
```

## Queue (pull-based)
```javascript
import { queue } from '@nitric/sdk'
const q = queue('transactions').allow('enqueue','dequeue')
await q.enqueue({ amount: 100 })                  // single or array (batch)
const tasks = await q.dequeue(10)
for (const t of tasks) { /* t.payload */ await t.complete() }
```

## Topic (push-based pub/sub)
```javascript
import { topic } from '@nitric/sdk'
const created = topic('user-created').allow('publish')
await created.publish({ email })
created.subscribe(async (ctx) => { /* ctx.req.json() */ })   // at-least-once, may duplicate
```

## Secret
```javascript
import { secret } from '@nitric/sdk'
const apiKey = secret('api-key').allow('put','access')
const v = await apiKey.put('value')                // versioned
const value = (await apiKey.latest().access()).asString()
```

## SQL (preview)
```javascript
import { sql } from '@nitric/sdk'
const db = sql('app')
const conn = await db.connectionString()           // use with pg/SQLAlchemy/etc.
// migrations/<db>/<version>_<name>.up.sql auto-applied; or dockerfile:// for complex
```

## Schedule
```javascript
import { schedule } from '@nitric/sdk'
schedule('daily').every('24 hours', async () => {})
schedule('cleanup').cron('0 1 1 * *', async () => {})    // 5-field cron; per-stack timezone (AWS/GCP)
```

## WebSocket
```javascript
import { websocket } from '@nitric/sdk'
const chat = websocket('chat')
chat.on('connect', async (ctx) => { /* ctx.req.connectionId */ })
chat.on('message', async (ctx) => { await chat.send(ctx.req.connectionId, { reply: 'hi' }) })
chat.on('disconnect', async (ctx) => {})
// typically paired with a kv() to track connections for broadcast
```

## Batch / Job (AI/ML/HPC)
```javascript
import { job } from '@nitric/sdk'
const analyze = job('analyze')
analyze.handler(async (ctx) => { /* heavy compute */ }, { cpus: 4, memory: 16384, gpus: 1 })
// submit from a service:
const submit = job('analyze').allow('submit'); await submit.submit({ imageUrl })
```

## Website (static)
```yaml
# nitric.yaml
websites:
  - basedir: ./dist
    path: /
    index: index.html
    build: { command: npm run build, dir: dist }
    dev:   { command: npm run dev, url: http://localhost:5173 }
```
