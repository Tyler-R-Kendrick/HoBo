# Aspire — The `aspire` CLI

> Part of the [Aspire competitor reference](./README.md). The standalone command-line tool (distinct from `dotnet`), part of Aspire's move toward a language-agnostic, single-file-AppHost experience.

## Install
```bash
dotnet tool install -g aspire.cli      # or the installer at aspire.dev
aspire --version
```

## Project lifecycle
```bash
aspire new                 # scaffold a new Aspire solution (interactive; templates)
aspire init                # add Aspire to an existing repo (detects sln or file-based AppHost)
aspire add redis           # add a hosting integration package (e.g. Aspire.Hosting.Redis)
aspire add azure-cosmos-db
aspire update              # safely upgrade Aspire packages in the AppHost
```

## Run & inspect (local dev)
```bash
aspire run                 # find & run the AppHost; launches the dashboard
aspire run --no-dashboard
aspire run --project ./src/AppHost
aspire logs [resource] [--follow]   # stream resource logs
aspire exec <command>               # run a resource command (e.g. migrations)
```

## Publish & deploy
```bash
aspire publish [--publisher docker-compose|kubernetes] [--output-path ./dist]
aspire deploy [--refresh]
```
(See [manifest-publishers-deploy.md](./manifest-publishers-deploy.md) for what each publisher emits.)

## Config & secrets
```bash
aspire config list
aspire config set <key> <value>     # CLI/feature settings
aspire secret set ConnectionStrings__Db "..."   # user-secret management
```

## Direction
The CLI underpins the **single-file `apphost.cs`** experience (run an AppHost without a full project), the **TypeScript AppHost**, and **MCP/agent** entry points — part of repositioning Aspire from "a .NET feature" to "a polyglot orchestration tool you drive from the terminal." Exact command surface and flags evolve release-to-release; the groups above are the stable shape.
