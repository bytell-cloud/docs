# SSH access

Every host in this fleet is reachable by a stable hostname and gated by Cloudflare Access (or Google Cloud IAP). No host has SSH open to the public internet — direct attempts hit either a CF Access challenge or a tightly-scoped origin firewall.

## At a glance

| Host | Hostname | Auth | Path |
|---|---|---|---|
| `mellon` (home box, primary bastion) | `ssh.bytell.com` | Email one-time PIN | CF tunnel |
| `claude-edge` (OCI E2.1.Micro) | `edge-oci.bytell.com` | Google Workspace SSO | CF tunnel |
| `claude-utility` (OCI E2.1.Micro) | `utility-oci.bytell.com` | Google Workspace SSO | CF tunnel |
| `claude-micro` (GCP e2-micro, when provisioned) | (alias only) | Google Cloud IAP | gcloud TCP forward |

All cloud VMs additionally lock their origin firewall to mellon's `/32`, so even if the CF/IAP layer were bypassed, the public IP would only accept SSH from a single source.

## One-time client setup

You need `cloudflared` and (for GCP) `gcloud` on the client. On `mellon` both are already installed.

Add this to `~/.ssh/config`:

```ssh
# OCI VMs — CF tunnel + Google Workspace SSO
Host edge-oci utility-oci
    HostName %h.bytell.com
    User ubuntu
    IdentityFile ~/.ssh/id_ed25519
    ProxyCommand cloudflared access ssh --hostname %h

# Mellon (or any other tunnel-fronted host) — CF tunnel + email PIN
Host mellon
    HostName ssh.bytell.com
    User trbynum
    IdentityFile ~/.ssh/id_ed25519
    ProxyCommand cloudflared access ssh --hostname %h

# GCP micro — IAP TCP forward (no DNS hostname needed; gcloud routes by name)
Host micro-gcp
    User ubuntu
    IdentityFile ~/.ssh/id_ed25519
    ProxyCommand gcloud compute start-iap-tunnel claude-micro 22 --listen-on-stdin --zone=us-east1-b
```

## Daily flow

```bash
ssh edge-oci      # Google Workspace SSO challenge first time per device per 24h
ssh utility-oci   # same
ssh mellon        # email PIN to tim@bytell.com first time per device per 24h
```

The first time you connect to any tunnel-fronted host on a new device:

1. `cloudflared access ssh` opens an auth URL.
2. Open it in a browser, sign in with `tim@bytell.com` (Google) or accept the email PIN sent to that address.
3. A JWT lands in `~/.cloudflared/<host>-<aud>-token` and is good for the app's session duration (default 24h).
4. Subsequent SSH attempts within that window are silent — no browser, no prompt.

Each Access app has its own audience (`aud`), so each hostname requires its own first-time login. Within the same browser session you usually stay signed in to Google so the second login is one click.

## Troubleshooting

### `Connection timed out during banner exchange`

Two distinct causes look identical from the client:

1. **No Access JWT cached and `cloudflared` couldn't fetch one.** Check `ls ~/.cloudflared/<host>-*-token`. If missing, run `cloudflared access login <host>` directly — it prints the URL and waits for you to complete the browser flow, then writes the token.
2. **The host's `sshd` is dead** (memory pressure on a 1 GB box, kernel hang, etc.). Verify by direct-SSHing the public IP from `mellon` (allowed by the origin firewall): `ssh ubuntu@<public-ip>`. If that also times out at banner exchange, the box itself is sick — `oci compute instance action --action SOFTRESET --instance-id …` or terminate-and-recreate via terraform.

### `Host key verification failed`

The VM was rebuilt and has a new SSH host key. Clear the stale entry:

```bash
ssh-keygen -R edge-oci.bytell.com   # or whichever
```

Then reconnect with `-o StrictHostKeyChecking=accept-new`.

### `Permission denied (publickey)`

Either:
- Wrong `User` in your SSH config (cloud images: `opc` for Oracle Linux, `ubuntu` for Canonical, varies by image).
- Public key not in the VM's `~/.ssh/authorized_keys`. For Terraform-managed OCI VMs, the key comes from `var.ssh_pubkey` in `infra/oci/terraform/terraform.tfvars`.

### CF Access shows `530`/`502` instead of an auth challenge

The tunnel connector on the host is offline. Check `sudo systemctl status cloudflared` on the box; if you can SSH directly to its public IP (mellon-only), `sudo journalctl -u cloudflared -n 50` will show why.

## Security posture

- **No public 0.0.0.0/0 SSH** anywhere. OCI security list rule for port 22 is scoped to `var.mgmt_cidr` (mellon's `/32`); GCP relies on IAP firewall tag (no public listener at all).
- **Identity-bound auth** at the CF edge before traffic ever reaches the origin: Google Workspace SSO on the OCI hosts, email one-time PIN on `ssh.bytell.com`. The SSH key on the VM is the second layer.
- **Per-app audit trail**: every tunneled SSH session shows up in CF Zero Trust → Logs → Access with the authenticated identity, source IP, and app name.
- **Revocation in seconds**: removing a user from the bytell.com Workspace cuts off all tunnel-fronted hosts simultaneously; rolling the SSH key on the VM cuts off direct paths.

## Architecture notes

- **Why 24h sessions, not 1h?** One-user, low-frequency SSH; the audit trail is enough. Bump down per-app via the `session_duration` field in `infra/cloudflare/terraform/access.tf` if a higher-risk host needs it.
- **Why Google Workspace SSO and not just email PIN everywhere?** SSO auto-revokes on Workspace removal, surfaces a per-Google-identity audit trail, and is one click after the first login. Email PIN remains in place on `ssh.bytell.com` because it predates this work and isn't worth churning.
- **Why no `cloudflared` on the GCP micro?** IAP TCP forwarding is GCP-native and doesn't require a daemon on the box — important on a 1 GB micro. Trade-off: it only works while `gcloud` is the client. If anyone needs to SSH from a non-`gcloud` machine, they go via mellon.
