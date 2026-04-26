# Bytell Cloud

Multi-cloud free-tier infrastructure powering services at `bytell.com`.

## What lives where

| Cloud | Role |
|---|---|
| **OCI** (Phoenix) | Long-running compute (E2.1.Micro × 2, Ampere ARM target), Vault, Object Storage, NoSQL |
| **GCP** (us-east1) | App data bus (Pub/Sub), analytics (BigQuery), state (Firestore), Firebase, on-demand e2-micro |
| **Cloudflare** | DNS for bytell.com, named tunnels, free TLS, future home for R2 / Pages / Workers |
| **GitHub** | Source of truth (`bytell-cloud` org), CI/CD via Actions, Pages hosting this site |

See the [Infrastructure overview](infra/overview.md) for the full picture.

## Why free tier

This site is part of an experiment in building a meaningful multi-cloud footprint **without a monthly bill**. Each provider's always-free quota fills a different niche; together they cover every layer a real product needs — compute, storage, ingest, analytics, state, edge, DNS, source control, CI, and a public face.

## Quick links

- [GitHub org](https://github.com/bytell-cloud) — source repos
- [Repo for this site](https://github.com/bytell-cloud/docs)
