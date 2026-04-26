# Google Cloud Platform

GCP fills the **app data plane** — message bus, analytics warehouse, realtime state, plus Firebase for client SDKs.

## Project

- **Project ID**: `bytell-claude-cloud`
- **Org**: bytell.com (`736390637616`)
- **Region default**: `us-east1` (closest to user, free-tier eligible)
- **BigQuery location**: `US` multi-region

## Always-free allotment

| Resource | Quota |
|---|---|
| Pub/Sub | 10 GiB/mo ingest+delivery |
| BigQuery | 10 GiB storage + 1 TiB query/mo |
| Firestore Native | 1 GiB + 50k reads/day + 20k writes/day (per project, in eligible regions) |
| Compute Engine | 1 × e2-micro per month (us-east1/central1/west1), 30 GB-mo standard PD, 1 GB NA egress |
| Cloud Run | 2M req/mo, 360k GB-s memory, 180k vCPU-s |
| Cloud Functions | 2M invocations/mo |
| Cloud Build | 120 build-min/day |
| Logging | 50 GiB/project/mo |

## What's running

- **VPC** `claude-vpc` + subnet `claude-subnet-us-east1` (10.10.0.0/24)
- **IAP-SSH firewall** — no public 0.0.0.0/0 inbound
- **Pub/Sub** topics `claude-events`, `claude-alerts`, subscription `claude-events-worker` (7-day retention)
- **BigQuery** dataset `claude_logs`, table `events` (DAY-partitioned, 30-day TTL)
- **Firestore Native** in `us-east1`
- **Firebase** project enabled (Spark plan)
- **`claude-vm`** SA (logWriter + metricWriter) ready for the gated `e2-micro`
- **14 APIs** enabled (compute, IAP, Firebase, Pub/Sub, BigQuery, Firestore, Run, Functions, Cloud Build, Secret Manager, Workflows, Logging, Monitoring, IAM Credentials)

The e2-micro VM itself is gated behind a Terraform variable — flip `enable_micro_vm = true` to provision, `false` to destroy. Network and SA stay pre-staged.

## Auth model

`claude@bytell.com` user creds via ADC → impersonate `terraform@bytell-claude-cloud.iam.gserviceaccount.com` for all Terraform operations. No exported SA JSON keys (org policy `iam.disableServiceAccountKeyCreation` enforced — best-practice default kept).

## Free-tier traps

- **BigQuery streaming inserts cost money** ($0.01/200 MB). Use load jobs or batched inserts.
- **Firestore region lock** — switching modes (Native ↔ Datastore) requires delete+recreate. Don't change without intent.
- **GCS / cross-region egress** is metered after 1 GB/mo NA — this is why bulk transfer should originate from OCI or Cloudflare R2.
- **Pub/Sub stuck consumers** can build up retained messages against the 10 GiB monthly budget. Watch subscription depth.
