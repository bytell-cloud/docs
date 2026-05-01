# Bytell Cloud

Multi-cloud free-tier infrastructure powering services at `bytell.com`.

## What lives where

The stack is intentionally split across providers, each used for its
strongest free-tier surface. See [Infrastructure overview](infra/overview.md)
for the full topology, current status per component, and identity model.

| Layer | Provider |
|---|---|
| **Always-on compute** | OCI Phoenix (E2.1.Micro × 2 + Ampere ARM in flight) |
| **Stateless HTTP / serverless containers** | GCP Cloud Run, fly.io, Render |
| **Edge logic + frontends** | Cloudflare Workers, Cloudflare Pages |
| **DNS / TLS / tunnels / R2 archive** | Cloudflare |
| **Postgres (transactional + auth + realtime)** | Supabase |
| **Postgres (edge-callable + branching)** | Neon |
| **SQLite at the edge / multi-tenant** | Turso |
| **Bulk KV** | OCI NoSQL (pending quota), Cloudflare KV |
| **Cache / rate-limit / TTL state** | Upstash Redis |
| **Realtime sync** | Supabase Realtime, GCP Firestore |
| **Event bus** | GCP Pub/Sub |
| **Analytics + warm logs** | GCP BigQuery |
| **Cold object archive** | Cloudflare R2 |
| **Observability backbone** | Cribl Cloud Free |
| **Alerting** | Resend (email) via Cribl pipeline |
| **Secrets** | OCI Vault (canonical, single source of truth) |
| **AI inference (internal)** | OCI-hosted gateway proxying Anthropic API (in flight) |
| **Source / CI** | GitHub (`bytell-cloud` org) |
| **This site** | mkdocs-material on GitHub Pages |

## Why a wide free-tier footprint

This site is part of an experiment in building a meaningful production-shaped
stack **without a monthly bill**. Each provider's always-free quota fills a
different niche; together they cover every layer a real product needs. The
trade-off is **glue** — making services across cloud boundaries find each
other, authenticate to each other, and ship logs to one place. The
[Glue page](infra/glue.md) covers the patterns we've adopted and the ones
still ahead.

## Live surfaces

| URL | What |
|---|---|
| [`cloud.bytell.com`](https://cloud.bytell.com) | This documentation site |
| `status.bytell.com` | Live infrastructure health dashboard *(launching soon)* |
| `ai.bytell.com` | Internal AI inference gateway *(launching soon, Access-gated)* |
| `edge-oci.bytell.com` / `utility-oci.bytell.com` | OCI VM SSH endpoints *(Access-gated)* |

## Quick links

- [Infrastructure overview](infra/overview.md) — full topology, per-provider role, current status
- [Cross-cloud glue](infra/glue.md) — service discovery, auth, secrets, eventing patterns
- [GitHub org](https://github.com/bytell-cloud)
- [Repo for this site](https://github.com/bytell-cloud/docs)
