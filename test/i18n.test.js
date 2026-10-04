import assert from "node:assert/strict";
import test from "node:test";

import { en } from "../src/locales/en.js";
import { zhCN } from "../src/locales/zh-CN.js";

const placeholders = (message) => [...String(message).matchAll(/\{([A-Za-z0-9_]+)\}/g)]
  .map((match) => match[1])
  .sort();

test("UI locale catalogs expose matching non-empty messages and placeholders", () => {
  const englishKeys = Object.keys(en.messages).sort();
  const simplifiedChineseKeys = Object.keys(zhCN.messages).sort();

  assert.deepEqual(simplifiedChineseKeys, englishKeys);
  for (const key of englishKeys) {
    assert.notEqual(String(en.messages[key]).trim(), "", `Empty English message: ${key}`);
    assert.notEqual(String(zhCN.messages[key]).trim(), "", `Empty Simplified Chinese message: ${key}`);
    assert.deepEqual(
      placeholders(zhCN.messages[key]),
      placeholders(en.messages[key]),
      `Placeholder mismatch: ${key}`,
    );
  }
});
