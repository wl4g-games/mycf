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
  assert.doesNotMatch(workflow, /\bvercel\b/i);
});

test("Vercel configuration and API adapters exist only in the WebSocket child project", () => {
  assert.equal(existsSync(`${root}/vercel.json`), false);
  assert.equal(existsSync(`${root}/api/ws.js`), false);
  assert.equal(existsSync(`${root}/api/health.js`), false);
  assert.equal(existsSync(`${root}/ws-server/vercel.json`), true);
  assert.equal(existsSync(`${root}/ws-server/api/ws.js`), true);
  assert.equal(existsSync(`${root}/ws-server/api/health.js`), true);
});
