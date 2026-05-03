# Oracle Cloud Infrastructure

OCI is the long-running compute home — the most generous free tier for sustained workloads.

## Always-free allotment

| Resource | Quota |
|---|---|
| AMD VMs (E2.1.Micro) | 2 instances, 1/8 OCPU + 1 GB RAM each |
| Ampere ARM (A1.Flex) | 4 OCPU + 24 GB total, splittable across up to 4 instances |
| Block volumes | 200 GB total |
| Object Storage | 20 GB standard + 10 GB archive |
| Vault (KMS) | 150 secret versions, 20 software key versions |
| NoSQL DB | 25 GB + 133M reads/writes/mo per table, up to 3 tables |
| **MySQL HeatWave** | 1 DB system in PHX-AD-2 only — `MySQL.Free` shape (1 OCPU, 8 GB RAM, 50 GB storage). Optional HeatWave cluster (in-memory analytics) can be enabled. **Reserved, not provisioned** — see below. |
| Outbound transfer | **10 TB/month** |

## What's running

- **`claude-edge`** (E2.1.Micro, PHX-AD-2) — running
- **`claude-utility`** (E2.1.Micro, PHX-AD-2) — running
- **`claude-ampere`** — provisioning loop active; rotates across all 3 Phoenix ADs every 10 min, retries until capacity opens. The free Ampere tier is famously hard to grab in Phoenix.
- **`claude-cloud-vault`** — DEFAULT type (software-backed); primary cross-cloud secret store for the entire stack
- **Object Storage namespace** `axd9ku6m85mx` — available, no buckets provisioned yet

## Tenancy

- **Region**: us-phoenix-1
- **Compartment**: root tenancy
- **Identity**: claude@bytell.com via OCI federation, profile DEFAULT in `~/.oci/config`

## Notes

- E2.1.Micro is **fixed at 1/8 OCPU** — fine for low-frequency cron / utility workloads, struggles with anything sustained-CPU. For the right workload, the 1 GB RAM ceiling matters more than the OCPU floor (e.g. `sshd` will OOM if you run a heavy daemon alongside it).
- Ampere is the workhorse once landed — 4 OCPU baseline, 24 GB RAM, ARM. Capacity is rationed by Oracle's free-tier policy and effectively requires polling.
- 10 TB egress means **OCI is where bulk data leaves the stack** — backups, archives, exports.

## Reserved free-tier capability: MySQL HeatWave

The Always-Free MySQL HeatWave slot is **available but deliberately not provisioned** — see ISSUE-048 in the local `ProjectMgmt/closed/` archive for the evaluation that landed there. The slot stays reserved against future use cases that warrant it.

**What it would buy us if provisioned:**

- **Managed MySQL 8** with daily backups, single-AD durability — useful if a workload needs managed MySQL specifically (Cerebro is on Postgres, so not a current fit).
- **HeatWave Cluster** — in-memory analytics accelerator on top of the base MySQL.
- **HeatWave Lakehouse** — SQL queries over Parquet/CSV/JSON in **OCI Object Storage** (free 10 GB), in-place. *Does not work against arbitrary S3-compatible endpoints like Cloudflare R2*; per docs, the URI / PAR / Resource Principal access methods are all OCI-Object-Storage-shaped. If we wanted Lakehouse over our existing R2 archive, we'd need to dual-write the relevant Parquet to OCI Object Storage as well.
- **HeatWave Vector Store** — pgvector-equivalent inside MySQL.
- **HeatWave GenAI** — in-DB RAG using OCI GenAI's Cohere models (different LLM family from the AI gateway's Claude path).

**What would justify provisioning:**

| If you decide to… | …HeatWave Free becomes the right tool |
|---|---|
| Migrate Cerebro from Postgres to a managed MySQL with backups | Stops the Mellon Docker-Postgres backup gap (cheaper alternatives: `pg_dump → R2` cron) |
| Run ad-hoc SQL over Cribl logs without touching BigQuery's 1 TB-queried/mo cap | Requires Cribl to dual-write archives to OCI Object Storage |
| Stand up an in-DB vector + structured store for a future product where Supabase pgvector doesn't fit | Speculative |
| Experiment with HeatWave GenAI for in-DB RAG over OCI-resident data | Different LLM family from the existing AI gateway |

**What would not justify provisioning:**

- "It's free" — the slot stays free whether or not we use it; provisioning without a real workload is the stack-expansion anti-pattern documented in `project_stack_expansion_threshold` memory.
- Crosswire's Phase 6 archive-query needs — covered cleanly by BigQuery via the existing Cribl→Pub/Sub bridge.
- Using HeatWave to serve traffic — single-AD = no HA; not a workload candidate.

**Constraints when provisioning eventually happens:**

- PHX-AD-2 only (zero quota in AD-1, AD-3).
- No public IP allowed; connect from within `claude-cloud-vcn` (utility-oci, edge-oci, or a Bastion).
- 8 GB RAM total caps the HeatWave hot-working-set well below the 50 GB storage cap; design queries with that in mind.
- Single-AD = scheduled OCI maintenance windows take it down.
