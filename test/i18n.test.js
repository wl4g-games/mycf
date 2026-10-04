import assert from "node:assert/strict";
import test from "node:test";

import {
  CHARACTER_PROFILES, LOADOUTS, MAPS, THROWABLES, VEHICLE_TYPES, WEAPONS,
} from "../src/config.js";
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

test("every configured player-facing equipment key resolves in both locales", () => {
  const keys = new Set();
  const collect = (value) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [property, nested] of Object.entries(value)) {
      if (property.endsWith("Key") && typeof nested === "string") keys.add(nested);
      else if (property.endsWith("Keys") && Array.isArray(nested)) nested.forEach(key => keys.add(key));
      else collect(nested);
    }
  };

  [CHARACTER_PROFILES, LOADOUTS, MAPS, THROWABLES, VEHICLE_TYPES, WEAPONS].forEach(collect);
  assert.ok(keys.size > 0);
  for (const key of keys) {
    assert.ok(en.messages[key], `Missing English config message: ${key}`);
    assert.ok(zhCN.messages[key], `Missing Simplified Chinese config message: ${key}`);
  }
});
