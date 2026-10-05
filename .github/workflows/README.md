# CI/CD Architecture

Two workflows cover the path from pull request validation to a versioned
GitHub Release, an amd64 WebSocket-server image, a Vercel container Function,
and a static GitHub Pages frontend deployment.

## Workflows

| File | Trigger | Responsibility |
|---|---|---|
| `ci.yml` | Pull request opened, updated, reopened, or marked ready | Maintain one live PR status comment, install and test both Node.js projects, syntax-check their sources, and verify the static frontend build |
| `release.yml` | Push to `main` (including a merged PR), or manual dispatch | Package the frontend `dist`, validate the WebSocket child project, publish a GitHub Release, publish the validated amd64 server image, optionally deploy the same container definition to Vercel, and deploy Pages |

## Release pipeline

```text
main updated
  |-> determine semantic version
  |    -> frontend npm ci + Vite build
  |    -> mycf-vX.Y.Z-dist.tar.gz
  |    -> GitHub Release
  |         -> static dist artifact -> GitHub Pages
  +-> ws-server npm ci + tests + syntax checks
       |-> Dockerfile.vercel -> linux/amd64 image -> ghcr.io/wl4g-games/mycf
       +-> Dockerfile.vercel -> staged Vercel production build
            -> /health and cross-origin /ws smoke tests -> promote
```

The Pages build installs only the root frontend dependencies and uploads only
`dist/`. The container build context is `ws-server`, uses
`ws-server/Dockerfile.vercel`, and contains no frontend bundle. GHCR and Vercel
build the same definition independently: GitHub Actions pushes the first image
to GHCR, while Vercel builds and stores its image in Vercel Container Registry.
The server test suite uses the in-memory `ICache` backend and an injected fake
Redis client, so PR and release validation need no Redis service or credential.
A deployed container selects Redis only when its runtime environment supplies
the documented Redis endpoint variables.
The Vercel project has a Root Directory of `ws-server`, uses the `Container`
framework preset, has Fluid compute enabled, and uses `PORT=8080`. The workflow
also passes this non-secret port explicitly on every deployment. Disable
Vercel's automatic Git deployments for this project when GitHub Actions owns
production deployment; otherwise one merge can create two production
deployments.

The Vercel job stages a production build without assigning its domains, checks
the immutable deployment URL, and promotes it only after both probes succeed.

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

## Required deployment settings

GitHub Pages is configured to use **GitHub Actions** as its source. Set the
`MYCF_WS_URL` repository variable to the stable HTTPS production domain of the
separately deployed multiplayer endpoint. Vite converts it to WSS in the Pages
bundle, and the server origin policy accepts the GitHub Pages browser origin.

Vercel deployment is credential-gated so forks and unconfigured repositories
can still validate and publish the other artifacts safely. Set the repository
variable `VERCEL_DEPLOY_ENABLED` to `true`, then configure `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as secrets in the
`vercel-production` GitHub environment or at repository scope. The workflow
deploys only `ws-server` and verifies `/health` plus a cross-origin `/ws`
handshake after deployment. GitHub Release, GHCR, and Pages continue to use the
repository-scoped `GITHUB_TOKEN` and need no Vercel credential.
