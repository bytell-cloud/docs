# Glue: cross-cloud patterns

The infrastructure intentionally spans seven providers. Most of the value
comes from picking each provider's strongest free-tier surface — but the
cost is **glue**: every service-to-service call across provider boundaries
needs auth, discovery, and observability of its own. This page collects the
patterns we've adopted (and the ones we haven't built yet but should), so
each new component slots into a known shape rather than reinventing one.

## What needs glue, and what already exists

| Concern | Current state | Recommended pattern |
|---|---|---|
| **Service discovery** — where does service A find service B? | Hardcoded URLs in env files | **Cloudflare KV namespace `service-registry`** with one key per service |
| **Cross-cloud auth** — how does service A prove identity to service B? | Mix of CF Access service tokens, shared bearer secrets, OAuth | **Standardize on bearer tokens stored in OCI Vault**; per-pair shared secret with rotation |
| **Secret distribution** — services on N clouds, secrets canonical in OCI Vault | Each provider's env vars set manually from Vault values | **Vault-sync cron** — small Cloud Run job replicates Vault → per-provider secret stores |
| **Cross-cloud event bus** — provider X emits event, provider Y consumes | GCP Pub/Sub exists but only Cribl publishes to it | **Generalize the Cribl-ingest bridge** as the canonical "post events to Pub/Sub" path for every provider |
| **Observability ingest** — every provider's logs/metrics → one home | Cribl is the routing hub but most providers don't ship to it yet | **Per-provider log-shipper recipe** documented per cloud, all targeting Cribl |
| **Status / capacity** — am I about to overrun a free tier? | Status aggregator (Issue 032) covers a few; not all free-tier limits yet | **Extend aggregator probes** for each free-tier limit per provider |
| **Data store ownership** — five SQL/KV options, which owns what entity? | Implicit / TBD | **Decision flowchart + ownership table** per app domain |
| **Deployment coordination** — each provider has its own deploy CLI | Top-level `Makefile` exists but per-provider only | **Per-app deploy manifests** plus a single `make deploy app=<name>` |

The rest of this page details each pattern and where to read more.

---

## 1. Service discovery via Cloudflare KV

**Problem.** Twelve services across five clouds need to find each other.
Hardcoding URLs in env vars works until you redeploy a service in a
different region or behind a different ingress.

**Pattern.** A single Cloudflare Worker KV namespace `service-registry`,
one key per service, value is JSON:

```json
{
  "id": "ai-gateway",
  "url": "https://ai.bytell.com",
  "auth": {"type": "bearer", "secret_ref": "ai_gateway_token"},
  "region": "phx",
  "owner": "claude@bytell.com",
  "last_updated": "2026-05-01T...Z"
}
```

Every service reads it once at startup (or every N minutes) via the public
KV REST API, scoped to a token with KV:Read on this one namespace. Writes
are done via terraform (or a small admin script) — services never write to
their own entry except through CI.

**Why KV.** Free, globally-replicated (~50ms reads worldwide), no idle
cost, terraformable. Cribl Cloud KV would also work but adds an extra
provider to the call path.

**Why a single namespace.** Easier to rotate access, easier to reason
about. Per-service namespaces buy you nothing at this scale.

**Status:** not yet built. Track with a new issue when more than ~3
services need to discover each other.

---

## 2. Cross-cloud auth: bearer-from-Vault

**Problem.** Every service-to-service call needs auth. We've got mixed
patterns:

- Cloudflare Access service tokens (CF Worker → OCI tunnel)
- Shared bearer secrets (Cribl → cribl-ingest Cloud Run)
- OAuth client credentials (Cribl management API)
- GCP SA impersonation (within GCP)

**Standard.** Adopt **bearer tokens minted by OCI Vault** as the default
service-to-service auth, except where we already have a stronger
provider-native option (CF Access, GCP IAM).

The shape: each call has `Authorization: Bearer <X>` where X is a
high-entropy token stored in Vault under `<caller>-<callee>-token`. The
callee resolves the token from its own env (set from Vault at deploy
time), compares constant-time, accepts or 401.

**When to break the rule:**

- Within GCP — use IAM + impersonation (workload identity is stronger).
- Behind Cloudflare tunnels — CF Access service tokens are stronger.
- For human admin endpoints — CF Access SSO is the right gate.

**Rotation.** Rotate per-pair tokens every 90 days. The vault-sync cron
(below) makes this a one-line operation: bump the version in Vault, force
a re-deploy on the dependent services.

---

## 3. Secret distribution: vault-sync cron

**Problem.** OCI Vault is the canonical secret store, but most secrets get
consumed by services in GCP (Cloud Run env), Cloudflare (Worker secrets),
fly.io (`flyctl secrets`), and elsewhere. Manually copying values across
five providers is the typical place where production breaks.

**Pattern.** A small Cloud Run cron job, **`vault-sync`**, reads from OCI
Vault hourly and pushes selected entries to each provider's native secret
store. Per-secret config is a YAML file in the repo:

```yaml
secrets:
  - vault_id: ai_gateway_token
    targets:
      - provider: gcp
        secret: cribl-ingest-shared-secret
      - provider: cloudflare
        worker_secret: AI_GATEWAY_TOKEN
        worker: bytell-status-dashboard
      - provider: fly
        app: claude-cloud-hello
        secret: AI_GATEWAY_TOKEN
```

When you rotate a secret in Vault, every provider has it within an hour
without manual intervention.

**Why Cloud Run.** Free-tier eligible, runs as a workload-identity SA so
no JSON keys, has outbound egress to all the other providers' APIs.

**Status:** not built. New issue when secret rotation becomes painful (~5+
secrets actively used cross-cloud).

---

## 4. Generalized event bus via Pub/Sub bridge

**Problem.** Asynchronous communication between providers — service in
fly.io needs to trigger work in Cloud Run, with retries and dead-letter
support. Per-pair custom wiring is hard to maintain.

**Pattern.** Reuse the **`cribl-ingest`** Cloud Run service we built for
Cribl → BigQuery as a **universal event ingest**. Any service posts to it
with `Authorization: Bearer <its token>` and a JSON body; cribl-ingest
publishes to the GCP Pub/Sub `claude-events` topic. Subscribers consume
via Pub/Sub subscriptions in the language/runtime of their choice.

The Pub/Sub message has an `attributes.source` field set by the publisher,
so consumers can filter without parsing the payload.

**What's already in place:**

- `cribl-ingest` Cloud Run service (Python, stdlib only)
- `claude-events` topic
- BQ subscription `events-to-bq-raw` → `claude_logs.events_raw` for
  archival of every event

**To generalize:**

- Issue per-caller bearer secrets in Vault rather than one shared secret
- Add `attributes.source` validation in the Cloud Run handler
- Document the publish recipe in each per-provider README

**Why not direct-to-Pub/Sub.** Cloud Run with bearer auth works from any
runtime that can do an HTTPS POST. Direct Pub/Sub publish requires GCP
auth on the caller side, which is awkward from non-GCP services.

---

## 5. Per-provider observability shipping

**Problem.** Cribl is the routing hub for logs and events. Each provider
ships data into it differently.

**Recipes** (each documented at length in the per-provider section of this
site):

| Provider | How logs reach Cribl |
|---|---|
| **CF Workers** | `console.log` is captured by the runtime; ship via Cloudflare Logpush → Worker that POSTs to Cribl HTTP source. (Not yet wired.) |
| **GCP Cloud Run** | Cloud Logging sink → Pub/Sub topic → Cribl Pub/Sub source. (Future.) |
| **OCI VMs** | rsyslog → Cribl Edge agent on the Ampere host (post-landing) → Cribl Cloud. (Future.) |
| **fly.io** | `flyctl logs` is human-only; for ingest, app code POSTs to Cribl HTTP source directly. |
| **Render** | Render Log Streams → endpoint we operate → Cribl HTTP source. |
| **Anywhere else** | App calls `cribl-ingest` directly; same pattern as the event bus above. |

The point of the table is **don't invent a sixth recipe**. Pick the row
that matches the provider, follow it.

---

## 6. Free-tier capacity awareness

**Problem.** Each provider has different free-tier limits and different
ways to surface usage. Overrunning even one quietly turns this from "free"
into "surprise bill."

**Pattern.** The status aggregator (Issue 032) writes a rolled-up JSON to
Cloudflare KV every 60 seconds. Each new provider added to the stack ships
with a probe that reports usage versus its key free-tier limit:

| Provider | Limit to track |
|---|---|
| OCI | NoSQL read/write/storage; egress (10 TB/mo) |
| GCP | BigQuery storage (10 GiB), query (1 TiB/mo); Pub/Sub (10 GiB/mo) |
| Cloudflare | Worker requests (100K/day); R2 storage (10 GB) |
| Cribl | 1 TB/day ingest |
| Supabase | DB size (500 MB); MAU (50K) |
| Neon | compute-hours (191.9/mo); storage (0.5 GB) |
| Upstash | commands (500K/mo); DB size (256 MB) |
| Turso | row reads (1B/mo); writes (25M/mo); storage (9 GB) |
| fly.io | trial credit ($5/mo) |
| Render | instance-hours (~750/mo) |

The dashboard at status.bytell.com surfaces these as capacity bars — a bar
above 80% gets visible, above 95% gets an alert email via Resend.

---

## 7. Data store ownership — pick one per entity

**Problem.** With Postgres in three flavors (Supabase, Neon, OCI MySQL),
KV in three (Upstash, CF KV, OCI NoSQL), and a doc store (Firestore), the
question of where a given entity lives is no longer obvious.

**Decision flowchart (proposed):**

1. Is it auth/user data needing RLS? → **Supabase**
2. Does it need to be queried directly from CF Workers with a real
   relational model? → **Neon**
3. Is it heavily read across regions, or per-tenant with many small DBs?
   → **Turso**
4. Is it ephemeral, with TTLs, atomic counters, or rate-limit windows?
   → **Upstash**
5. Is it config or feature flags read globally? → **Cloudflare KV**
6. Is it bulk durable structured data (logs, raw events, large rowsets)?
   → **OCI NoSQL** (when quota lands) or **BigQuery**
7. Is it cold archival? → **Cloudflare R2**
8. Is it realtime sync (presence, live cursors)? → **Firestore** or
   **Supabase Realtime**
9. Default if unclear → **Supabase Postgres**

Once we have an actual app driving this, the flowchart goes in the repo
as a `decision.md` and gets revisited per-feature.

---

## 8. Deployment coordination

**Problem.** Five compute providers, five deploy CLIs (`flyctl`, `gcloud`,
`wrangler`, `supabase`, `terraform`). Onboarding a new app means knowing
which to use where.

**Pattern.** A per-app deploy manifest in the repo (`apps/<name>/deploy.yml`)
declares which provider hosts which piece, plus secrets it needs. A
top-level Makefile target `make deploy app=<name>` reads the manifest and
calls the right per-provider tooling. Mostly a quality-of-life
convenience; the underlying CLIs are still doing the work.

**Status:** not yet built. Land it once we have the second app, when the
pattern is confirmed.

---

## What we're explicitly not building

- **A service mesh** (Istio, Consul, etc) — overkill at this scale; the
  glue patterns above cover the same concerns more simply.
- **A central API gateway** (Kong, Tyk, etc) — Cloudflare Workers + Access
  cover what we'd need from a gateway for free.
- **A unified IAM** — each provider's native IAM is good enough; Vault
  bridges the trust boundary at the secret layer.
- **An observability platform from scratch** — Cribl is the platform; we
  just need shippers.

The point of the multi-cloud setup isn't engineering elegance, it's free
quotas across the board. Glue stays minimal so the savings stay real.
