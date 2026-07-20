# inquiso-website

Source for **[inquisoai.com](https://inquisoai.com)** — the marketing landing page and
documentation site for [Inquiso](https://github.com/inquisoai/inquiso), the open-source,
local-first, serverless AI browser sidebar and transparent agent.

Built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build) and
deployed as a fully static site on **Cloudflare Pages**.

## How it works

The documentation is **not** authored in this repo. It is pulled from the canonical
[`inquiso`](https://github.com/inquisoai/inquiso) repository, which is included here as a git
submodule at [`./inquiso`](./inquiso). Its docs live at `inquiso/docs/`.

A prebuild sync step, [`scripts/sync-docs.mjs`](./scripts/sync-docs.mjs), reads selected
markdown from `inquiso/docs/`, derives Starlight frontmatter (`title`/`description`) from each
file's first heading, rewrites intra-repo links, and writes the transformed copies into
`src/content/docs/docs/` (the site route `/docs/...`). That generated directory is gitignored
and regenerated on every `dev`/`build`. `npm`/`pnpm` runs it automatically via the `prebuild`
and `predev` hooks.

## Run locally

```bash
pnpm install
git submodule update --init   # fetch the inquiso docs
pnpm dev                       # http://localhost:4321 (runs sync-docs first)
```

Other scripts:

```bash
pnpm sync-docs   # regenerate src/content/docs/docs/ from the submodule
pnpm build       # static build into dist/ (runs sync-docs first)
pnpm preview     # preview the built site
```

## Deployment (Cloudflare Pages)

- **Build command:** `pnpm build` (the `prebuild` hook runs `scripts/sync-docs.mjs`)
- **Output directory:** `dist`
- **Submodules:** must be checked out — set the environment variable
  `GIT_SUBMODULE_STRATEGY=recursive` (or ensure the build clones submodules), otherwise
  `inquiso/docs/` will be missing and the sync step will fail.
- **Node version:** 20 or newer.

Static output only — there is no SSR adapter and no runtime network calls.
