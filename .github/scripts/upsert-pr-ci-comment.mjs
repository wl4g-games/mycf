#!/usr/bin/env node

const repository = process.env.GITHUB_REPOSITORY;
const pullRequest = process.env.MYCF_PR_NUMBER;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const phase = process.env.MYCF_COMMENT_PHASE;
const runUrl = process.env.MYCF_RUN_URL;
const ciResult = process.env.MYCF_CI_RESULT;

if (!repository || !pullRequest || !token || !phase || !runUrl) {
  throw new Error("Missing MyCF PR CI comment context.");
}
if (!["started", "final"].includes(phase)) {
  throw new Error(`Unsupported MyCF PR CI comment phase: ${phase}`);
}

const [owner, repo] = repository.split("/", 2);
if (!owner || !repo) {
  throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
}

const marker = "<!-- mycf-ci-status -->";
const apiRoot = process.env.GITHUB_API_URL || "https://api.github.com";
const commentsUrl = `${apiRoot}/repos/${owner}/${repo}/issues/${pullRequest}/comments`;

const resultIcon = (result) => {
  if (result === "success") return "✅";
  if (result === "skipped") return "⏭️";
  if (["failure", "cancelled", "timed_out", "action_required", "startup_failure"].includes(result)) {
    return "❌";
  }
  return "⏳";
};

const renderComment = () => {
  const lines = [marker, "## 泡泡战区 PR CI", "", `- 运行：[Actions 日志](${runUrl})`];

  if (phase === "started") {
    lines.push("- 状态：⏳ 依赖安装、自动测试和生产构建已开始。");
    return lines.join("\n");
  }

  const result = ciResult || "pending";
  lines.push(`- 构建与测试：${resultIcon(result)} ${result}`);
  lines.push("", result === "success"
    ? "**CI 已通过。**"
    : `**CI 未通过。** 请查看 [Actions 日志](${runUrl})。`);
  return lines.join("\n");
};

const body = renderComment();
if (process.env.MYCF_COMMENT_DRY_RUN === "true") {
  console.log(body);
  process.exit(0);
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

const request = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) {
    throw new Error(
      `GitHub API ${options.method || "GET"} ${url} failed: ${response.status} ${await response.text()}`,
    );
  }
  return {
    data: response.status === 204 ? undefined : await response.json(),
    link: response.headers.get("link"),
  };
};

const nextPage = (linkHeader) => {
  if (!linkHeader) return undefined;
  const next = linkHeader.split(",").find((link) => link.includes('rel="next"'));
  return next?.match(/<([^>]+)>/)?.[1];
};

let existing;
let pageUrl = `${commentsUrl}?per_page=100`;
while (pageUrl && !existing) {
  const page = await request(pageUrl);
  existing = page.data.find(
    (comment) => comment.user?.login === "github-actions[bot]" && comment.body?.includes(marker),
  );
  pageUrl = nextPage(page.link);
}

if (existing) {
  await request(`${apiRoot}/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
} else {
  await request(commentsUrl, { method: "POST", body: JSON.stringify({ body }) });
}
