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
