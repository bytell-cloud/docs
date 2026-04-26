# Cloudflare

Cloudflare fronts the entire `bytell.com` zone and provides edge primitives (Workers, Pages, R2) that complement the OCI/GCP backend.

## Zone

- **bytell.com** — fully delegated to Cloudflare (NS: `danica.ns.cloudflare.com`, `michael.ns.cloudflare.com`)
- Free TLS via the universal SSL cert
- DDoS protection and CDN included on the Free plan

## Tunnels

`cloudflared` named tunnels expose private services to gated hostnames without inbound firewall rules. Tunnel hostnames and configuration are kept private.

## Free-tier capabilities

| Service | Free tier | Status |
|---|---|---|
| **DNS** | unlimited records | ✓ in use |
| **TLS** | universal cert | ✓ in use |
| **Tunnels** | unlimited | ✓ 4 active |
| **R2** | 10 GB + **$0 egress** | not yet adopted |
| **Workers** | 100k req/day | not yet adopted |
| **Pages** | unlimited bandwidth, 500 builds/mo | not yet adopted |
| **D1** | 100k reads/day | not yet adopted |
| **KV** | 100k reads/day | not yet adopted |
| **Email Routing** | unlimited routes | available |
| **Access (Zero Trust)** | 50 users | available |

## Why Cloudflare matters

R2's **zero-egress** pricing is the most strategic free-tier offering across all four providers — anything that needs to be served *out* (downloads, public datasets, large media) costs $0 from R2 vs. metered from OCI / GCP / GitHub.
