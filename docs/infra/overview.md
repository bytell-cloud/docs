# Infrastructure overview

The stack is intentionally split across providers so each piece sits on its strongest free tier.

## Topology

```
                    ┌──────────────────────┐
                    │      bytell.com      │
                    │   (Cloudflare DNS)   │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
   ┌──────▼──────┐      ┌──────▼──────┐      ┌──────▼──────┐
   │   GitHub    │      │ Cloudflare  │      │   Tunnels   │
   │   Pages     │      │   Pages /   │      │  (private)  │
   │ (this site) │      │   Workers   │      │             │
   └─────────────┘      └─────────────┘      └──────┬──────┘
                                                     │
                                              ┌──────▼──────┐
                                              │  Local /    │
                                              │  OCI VMs    │
                                              └─────────────┘

   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │  OCI (PHX)   │◄──►│  GCP (IAD)   │    │  GitHub      │
   │              │    │              │    │              │
   │ • E2 micros  │    │ • Pub/Sub    │    │ • Source     │
   │ • Ampere     │    │ • BigQuery   │    │ • Actions    │
   │ • Vault      │    │ • Firestore  │    │ • Pages      │
   │ • OS / NoSQL │    │ • Firebase   │    │              │
   └──────────────┘    └──────────────┘    └──────────────┘
```

## Free-tier role per provider

### Compute
- **OCI Always Free**: 2 × E2.1.Micro (1/8 OCPU, 1 GB) + 1 × A1.Flex Ampere ARM (4 OCPU, 24 GB total share)
- **GCP Always Free**: 1 × e2-micro burstable (us-east1/central1/west1)
- **GitHub Codespaces**: 120 core-hours/month (dev only, not deploy targets)

### Storage
- **OCI Object Storage**: 20 GB standard + 10 GB archive
- **GCS** (GCP): 5 GB standard
- **Cloudflare R2**: 10 GB **with no egress fees** — this is the killer free-tier storage primitive
- **GitHub Packages**: standard limits

### Data plane
- **GCP Pub/Sub**: 10 GiB/mo for app message bus
- **GCP BigQuery**: 10 GiB storage + 1 TiB query/mo for analytics
- **GCP Firestore**: 1 GiB + 50k reads/day for realtime state
- **OCI NoSQL**: 25 GB + 133M ops/mo per table (3 tables) — for bulk state

### Edge / public face
- **Cloudflare DNS, TLS, DDoS, Tunnels**: free for unlimited records
- **Cloudflare Workers**: 100k req/day free
- **GitHub Pages**: this site
- **Firebase Hosting**: 10 GB / 360 MB/day

### Egress
- **OCI**: 10 TB/month — by far the most generous
- **Cloudflare R2**: $0 egress (no cap)
- **GCP**: 1 GB/mo to NA, then metered
- This shape means **bulk transfer originates from OCI or R2**, not GCP.

## Identity model

- **claude@bytell.com** — dedicated cloud-ops Workspace identity used for OCI tenancy admin and GCP project ownership
- **terraform SA** in GCP (`terraform@bytell-claude-cloud.iam.gserviceaccount.com`) — all terraform operations impersonate this SA via ADC; no exported keys (org policy `iam.disableServiceAccountKeyCreation` enforced)
- **tim@bytell.com** — primary human Workspace identity
- **GitHub `tbynum`** — admin of `bytell-cloud` org

## Source of truth

All infrastructure-as-code lives in a private workspace; this docs site is the public-facing summary. Issues for cloud work are tracked locally in `ProjectMgmt/` and referenced here when relevant.
