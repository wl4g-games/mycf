# CI/CD Architecture

Two workflows cover the path from pull request validation to a versioned
GitHub Release, an amd64 WebSocket-server image, and a static GitHub Pages
frontend deployment. Vercel deployment of the independent `ws-server`
project is intentionally outside these workflows.

## Workflows

| File | Trigger | Responsibility |
|---|---|---|
| `ci.yml` | Pull request opened, updated, reopened, or marked ready | Maintain one live PR status comment, install and test both Node.js projects, syntax-check their sources, and verify the static frontend build |
| `release.yml` | Push to `main` (including a merged PR), or manual dispatch | Package the frontend `dist`, validate the WebSocket child project, publish a GitHub Release, then publish the validated amd64 server image and deploy Pages independently |

## Release pipeline

```text
main updated
  |-> determine semantic version
  |    -> frontend npm ci + Vite build
  |    -> mycf-vX.Y.Z-dist.tar.gz
  |    -> GitHub Release
  |         +-> static dist artifact -> GitHub Pages
  +-> ws-server npm ci + tests + syntax checks
       -> ws-server linux/amd64 image -> ghcr.io/wl4g-games/mycf
```

The Pages build installs only the root frontend dependencies and uploads only
`dist/`. The Docker build uses only the `ws-server` package manifest and
lockfile to install production dependencies, and contains no frontend bundle.
The independent Vercel project uses
`ws-server/vercel.json` and a Vercel Root Directory of `ws-server`.

The first release uses the stable version in `package.json`. Later releases
inspect all commits since the highest stable `vX.Y.Z` tag:

- a breaking-change marker or a `refactor:` commit-message line bumps the major version;
- a `feat:` commit-message line bumps the minor version;
- `fix:`, `ci:`, and every other main update bump the patch version.

If a workflow is rerun for a commit that is already tagged, it reuses that tag
instead of incrementing the version again.

## Pull request status comment

PR validation uses `.github/scripts/upsert-pr-ci-comment.mjs` to maintain one
sticky comment marked with `<!-- mycf-ci-status -->`. The start job creates or
updates the pending state; the final job runs with `always()` and replaces it
with the build result. Comment API failures are warnings and never override the
actual test/build result.

The reporting jobs receive only `contents: read`, `issues: write`, and
`pull-requests: write`. The build job retains read-only repository access.

## Required repository setting

GitHub Pages is configured to use **GitHub Actions** as its source. Set the
optional `MYCF_WS_URL` repository variable to the separately deployed
multiplayer endpoint. The workflows use only the repository-scoped
`GITHUB_TOKEN`; no deployment secret is required for GitHub Release, GHCR, or
Pages. Vercel project authorization is managed separately.
