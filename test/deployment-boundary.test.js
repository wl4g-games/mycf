import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

test("GitHub Actions deploys only the static frontend to Pages", () => {
  const workflow = readFileSync(`${root}/.github/workflows/release.yml`, "utf8");
  assert.match(workflow, /name: Build for GitHub Pages[\s\S]*VITE_MYCF_WS_URL:[\s\S]*npm run build/);
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v\d+[\s\S]*path: \.\/dist/);
  assert.match(workflow, /uses: actions\/deploy-pages@v\d+/);
  assert.match(workflow, /MYCF_WS_URL must contain the stable Vercel production URL/);
  assert.match(workflow, /deploy-pages:\n\s+name: Deploy GitHub Pages\n\s+needs: \[build, release\]/);
});

test("pull requests validate code while main owns every release deployment", () => {
  const pullRequestWorkflow = readFileSync(`${root}/.github/workflows/ci.yml`, "utf8");
  const releaseWorkflow = readFileSync(`${root}/.github/workflows/release.yml`, "utf8");

  assert.match(pullRequestWorkflow, /pull_request:/);
  assert.match(pullRequestWorkflow, /npm test[\s\S]*npm test --prefix ws-server[\s\S]*npm run build/);
  assert.doesNotMatch(pullRequestWorkflow, /deploy-pages|action-gh-release|docker\/build-push-action|vercel@/);
  assert.match(releaseWorkflow, /push:\n\s+branches: \[main\]/);
  assert.match(releaseWorkflow, /name: Create GitHub Release/);
  assert.match(releaseWorkflow, /name: Build and push WebSocket server image/);
  assert.match(releaseWorkflow, /name: Deploy WebSocket server to Vercel/);
});

test("the Vercel container project exists only in the WebSocket child project", () => {
  assert.equal(existsSync(`${root}/vercel.json`), false);
  assert.equal(existsSync(`${root}/Dockerfile.vercel`), false);
  assert.equal(existsSync(`${root}/ws-server/vercel.json`), true);
  assert.equal(existsSync(`${root}/ws-server/Dockerfile.vercel`), true);
  assert.equal(existsSync(`${root}/ws-server/api/ws.js`), false);
  assert.equal(existsSync(`${root}/ws-server/api/health.js`), false);

  const dockerfile = readFileSync(`${root}/ws-server/Dockerfile.vercel`, "utf8");
  const standalone = readFileSync(`${root}/ws-server/src/standalone.js`, "utf8");
  assert.match(dockerfile, /PORT=8080/);
  assert.match(dockerfile, /CMD \["node", "src\/standalone\.js"\]/);
  assert.match(standalone, /process\.env\.PORT \|\| process\.env\.MYCF_WS_PORT/);
});

test("release builds the same WebSocket container definition for GHCR and Vercel", () => {
  const workflow = readFileSync(`${root}/.github/workflows/release.yml`, "utf8");
  assert.match(workflow, /context: \.\/ws-server[\s\S]*file: \.\/ws-server\/Dockerfile\.vercel/);
  assert.match(workflow, /name: Deploy WebSocket server to Vercel[\s\S]*working-directory: ws-server/);
  assert.match(workflow, /if: \$\{\{ vars\.VERCEL_DEPLOY_ENABLED == 'true' \}\}/);
  for (const secret of ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
    assert.match(workflow, new RegExp(`${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}`));
  }
  assert.match(workflow, /vercel@\d+\.\d+\.\d+ deploy --prod --skip-domain --yes --env PORT=8080/);
  assert.match(workflow, /node scripts\/smoke-deployment\.mjs/);
  assert.match(workflow, /vercel@\d+\.\d+\.\d+ promote "\$\{DEPLOYMENT_URL\}" --yes/);
});
