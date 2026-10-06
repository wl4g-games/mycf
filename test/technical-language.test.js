import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const simplifiedChineseCatalog = new Set([
  "src/locales/parental-zh-CN.js",
  "src/locales/zh-CN.js",
]);
const bilingualReadme = "README.md";
const ignoredDirectories = new Set([".git", "assets", "dist", "node_modules"]);
const chineseCharacters = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;
const localizedMessageLine = /^\s*(?:nativeName|"[A-Za-z0-9_.-]+"):\s*"(?:[^"\\]|\\.)*",?\s*$/u;

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else files.push(path);
  }
  return files;
}

test("Chinese characters are limited to UI localization and the bilingual root README", () => {
  const violations = [];
  let localizedLineCount = 0;
  for (const file of sourceFiles(root)) {
    const projectPath = relative(root, file).replaceAll("\\", "/");
    const content = readFileSync(file);
    if (content.includes(0)) continue;
    content.toString("utf8").split("\n").forEach((line, index) => {
      if (!chineseCharacters.test(line)) return;
      if (projectPath === bilingualReadme) return;
      if (simplifiedChineseCatalog.has(projectPath) && localizedMessageLine.test(line)) {
        localizedLineCount += 1;
        return;
      }
      violations.push(`${projectPath}:${index + 1}`);
    });
  }
  assert.deepEqual(violations, []);
  assert.ok(localizedLineCount > 0, "The Simplified Chinese UI catalog must contain localized messages.");
});
