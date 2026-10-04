import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../.github/scripts/upsert-pr-ci-comment.mjs", import.meta.url));

function render(phase, result) {
  const execution = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      GH_TOKEN: "dry-run-token",
      GITHUB_REPOSITORY: "wl4g-games/mycf",
      MYCF_PR_NUMBER: "42",
      MYCF_COMMENT_DRY_RUN: "true",
      MYCF_COMMENT_PHASE: phase,
      MYCF_RUN_ID: "42",
      MYCF_RUN_URL: "https://github.com/wl4g-games/mycf/actions/runs/42",
      MYCF_CI_RESULT: result || "",
    },
  });
  assert.equal(execution.status, 0, execution.stderr);
  return execution.stdout;
}

test("PR CI comment reports a pending run without exposing a token", () => {
  const comment = render("started");
  assert.match(comment, /<!-- mycf-ci-status run-id=42 -->/);
  assert.match(comment, /⏳/);
  assert.doesNotMatch(comment, /dry-run-token/);
});

test("PR CI comment reports final success and failure in place", () => {
  assert.match(render("final", "success"), /✅ success[\s\S]*CI passed/);
  assert.match(render("final", "failure"), /❌ failure[\s\S]*CI did not pass/);
});
