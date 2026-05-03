# Mellon

The local "Heroku-tier" host. Sits at home on residential network, fronts public services through named Cloudflare tunnels, complements the OCI VMs by carrying app-shaped workloads that don't fit comfortably on micro-tier always-free compute.

## Hardware

| Resource | Value |
|---|---|
| Make | Apple MacBook Pro 11,4 (mid-2014, 15") |
| OS | Ubuntu 22.04.5 LTS (kernel 5.15) |
| CPU | Intel i7-4870HQ — 4C/8T, 2.5–3.7 GHz |
| RAM | 16 GB |
| Disk | 98 GB root (LVM); ~52 GB free |
| Network | WiFi only — `wlp3s0` on `10.0.0.3/24` |
| Chassis | Laptop (built-in battery acts as implicit short-window UPS) |

## Hosted services

| Service | Port | Public hostname | Auto-start? |
|---|---|---|---|
| Cerebro backend (uvicorn) | `127.0.0.1:8001` | `cerebro-api.bytell.com` | ⚠️ unit `disabled` |
| Cerebro frontend (Vite) | `127.0.0.1:5173` | `cerebro.bytell.com` | ⚠️ unit `disabled` |
| Cerebro Celery worker + beat | n/a | n/a | ✅ enabled |
| Cerebro outbox consumer | n/a | n/a | ✅ enabled |
| Postgres 15 (Docker, `cerebro_postgres_dev`) | `127.0.0.1:5432` | n/a | (Docker policy) |
| Redis 7 | `127.0.0.1:6379` | n/a | (system) |
| Filebrowser (Docker) | `127.0.0.1:3000` | `files.bytell.com` | ✅ enabled |
| SSH (host) | `0.0.0.0:22` | `ssh.bytell.com` | ✅ enabled |

`⚠️` rows are flagged in [Known issues](#known-issues) below.

## Cloudflare tunnels

| Tunnel name | UUID | Public hostname | Origin | systemd unit | Config path |
|---|---|---|---|---|---|
| `cerebro-backend` | `16c390e3-…33f7` | `cerebro-api.bytell.com` | `http://localhost:8001` | `cerebro-tunnel-backend.service` | `~/cerebro/scripts/cloudflare-backend-config.yml` |
| `cerebro-frontend` | `af101597-…f1ab` | `cerebro.bytell.com` | `http://localhost:5173` | `cerebro-tunnel-frontend.service` | `~/cerebro/scripts/cloudflare-frontend-config.yml` |
| `filebrowser` | `a29e3f20-…99e0` | `files.bytell.com` | `http://localhost:3000` | `cloudflare-tunnel-filebrowser.service` | `~/.cloudflared/cloudflare-filebrowser-config.yml` |
| `ssh-access` | `8dbfd533-…8ec9` | `ssh.bytell.com` | `ssh://localhost:22` | `cloudflare-tunnel-ssh.service` | `~/.cloudflared/cloudflare-ssh-config.yml` |

All four tunnels run as `trbynum`, share `~/.cloudflared/cert.pem`, and use per-tunnel credential JSONs in `~/.cloudflared/`. Mellon also holds Cloudflare Access tokens for `edge-oci.bytell.com` and `utility-oci.bytell.com` (Mellon is a Zero Trust Access *client* of those, separate from being an *origin* for the tunnels above).

## Identity

- Linux user: `trbynum`
- Cloudflare tunnels owned by `claude@bytell.com` (origin cert in `~/.cloudflared/cert.pem`)

## Status aggregator hookup

The status aggregator (utility-oci, see ISSUE-032) probes Mellon **externally**, via the public CF tunnel hostnames — keeping the aggregator location-agnostic and avoiding any new auth surface.

| Probe | What it checks |
|---|---|
| `mellon_services` | `https://cerebro.bytell.com`, `https://cerebro-api.bytell.com`, `https://files.bytell.com` — counts any HTTP < 500 (incl. CF Access login walls) as "origin reachable." |
| `cloudflare_tunnels` | Tunnel-connector up/down state for *all* named tunnels (Mellon's four included), via the Cloudflare API. |

`ssh.bytell.com` is intentionally not in the URL list — its origin is `ssh://`, not HTTP-probable; tunnel state covers it.

Host-level metrics (uptime, load, free disk/RAM, systemd-unit-active counts) are *not* yet probed. Adding them requires Mellon to expose a `/healthz` JSON endpoint that the aggregator can poll — flagged as a follow-up issue from ISSUE-045.

## Known issues

1. **`cerebro-backend.service` and `cerebro-frontend.service` are `disabled`.** Currently running because someone started them manually. They will not return after a reboot. Either `systemctl enable` them (matches the rest of the Cerebro units) or document why they must remain manual-start.
2. **Tunnel configs split across two locations.** `cerebro-*` configs live under `~/cerebro/scripts/`, while `filebrowser` and `ssh-access` live under `~/.cloudflared/`. Consolidate to one location (recommend `~/.cloudflared/`) and update the systemd units to match.
3. **Service-name inconsistency.** `cerebro-tunnel-*` vs. `cloudflare-tunnel-*` — same kind of unit, two naming conventions. Pick one (recommend `cf-tunnel-<service>.service`) and rename.
4. **No Postgres backup cadence.** The Docker volume holds Cerebro's primary data; nothing offsite. Out of scope for ISSUE-045 — flagged for a follow-up.

### Resolved during ISSUE-045

- **Postgres LAN exposure** (2026-05-02): Docker compose previously published `5432:5432` (and `5433`, `6379`) on all interfaces, exposing Cerebro's DB to anything on `10.0.0.0/24`. The original reason was pre-tunnel cross-LAN access from the user's lab; obsolete since Cloudflare tunnels landed. Rebound to `127.0.0.1:` in `cerebro_backend/docker-compose.yml` for postgres / postgres_test / redis. Verified cerebro-backend reconnects via the Docker bridge gateway (`172.18.0.1`) without errors.

## Reliability profile (accepted)

The constraints below are known and **explicitly accepted** as part of Mellon's role — not problems to mitigate. Any workload that can't tolerate them belongs on the OCI tier, not on Mellon.

- **WiFi-only** (`wlp3s0`). Cloudflare's edge handles brief drops transparently; longer drops or IP changes take Mellon-fronted services offline until network recovers. No wired/LTE failover planned.
- **Laptop chassis on consumer power.** Battery is an ad-hoc UPS for short outages; longer outages take Mellon down with the house.
- **Single SSD, no RAID.** A disk failure = full restore from whatever backups exist (Postgres backup cadence is a separate open question).
- **Disk headroom.** 52 GB free at last audit. No proactive threshold / cleanup automation; check periodically by hand.

## Role

Mellon is the **permanent primary local node** — the "Heroku-tier" host for the stack. App-shaped workloads (Cerebro and successors) live here; latency-sensitive or always-on services that need to survive home-network outages live on the OCI tier.

This was confirmed during ISSUE-045 (2026-05-02). Mellon is not a stopgap — there is no plan to migrate to a successor SFF/Mac mini absent a concrete capacity or reliability blocker.
