# CI/CD Architecture

Two workflows cover the path from pull request validation to a versioned
GitHub Release, an amd64 GHCR image, and a GitHub Pages deployment.

## Workflows

| File | Trigger | Responsibility |
|---|---|---|
| `ci.yml` | Pull request opened, updated, reopened, or marked ready | Maintain one live PR status comment, install dependencies, run tests, and verify the production build |
| `release.yml` | Push to `main` (including a merged PR), or manual dispatch | Package `dist`, publish a GitHub Release, then publish an amd64 image and deploy Pages in parallel |

## Release pipeline

```text
main updated
  -> determine semantic version
  -> npm ci + Vite build
  -> mycf-vX.Y.Z-dist.tar.gz
  -> GitHub Release
       |-> linux/amd64 image -> ghcr.io/wl4g-games/mycf
       +-> dist artifact -> GitHub Pages
```

The first release uses the stable version in `package.json`. Later releases
inspect all commits since the highest stable `vX.Y.Z` tag:

- a breaking-change marker or a `refactor:` subject bumps the major version;
- a `feat:` subject bumps the minor version;
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

GitHub Pages is configured to use **GitHub Actions** as its source. The
workflows use only the repository-scoped `GITHUB_TOKEN`; no deployment secret
is required.
