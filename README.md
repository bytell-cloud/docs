# bytell-cloud/docs

Source for the [cloud.bytell.com](https://cloud.bytell.com) docs site.

Built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/), deployed to GitHub Pages on every push to `main`.

## Local preview

```bash
pip install mkdocs-material
mkdocs serve
# → http://127.0.0.1:8000
```

## Structure

```
docs/
├── index.md                # landing
└── infra/
    ├── overview.md         # multi-cloud topology + per-provider role
    ├── oci.md              # Oracle Cloud allotment + state
    ├── gcp.md              # Google Cloud allotment + state
    └── cloudflare.md       # Cloudflare zone + tunnels + edge primitives
```
