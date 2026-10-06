import { en } from "./locales/en.js?v=20261006-lan-v10";
import { zhCN } from "./locales/zh-CN.js?v=20261006-lan-v10";

const STORAGE_KEY = "toon-strike.locale";
const locales = Object.freeze({ en, "zh-CN": zhCN });
const listeners = new Set();

function detectLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (locales[saved]) return saved;
  } catch (error) {}
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

let activeLocale = detectLocale();

export function t(key, params = {}) {
  const template = locales[activeLocale].messages[key] ?? en.messages[key] ?? key;
  return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, name) => (
    Object.hasOwn(params, name) ? String(params[name]) : `{${name}}`
  ));
}

export function getLocale() {
  return activeLocale;
}

export function setLocale(locale) {
  if (!locales[locale] || locale === activeLocale) return;
  activeLocale = locale;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch (error) {}
  applyDocumentTranslations();
  listeners.forEach(listener => listener(locale));
}

export function toggleLocale() {
  setLocale(activeLocale === "en" ? "zh-CN" : "en");
}

export function onLocaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyDocumentTranslations(root = document) {
  document.documentElement.lang = activeLocale;
  root.querySelectorAll("[data-i18n]").forEach(node => { node.textContent = t(node.dataset.i18n); });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(node => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
  root.querySelectorAll("[data-i18n-content]").forEach(node => {
    node.setAttribute("content", t(node.dataset.i18nContent));
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach(node => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  const toggle = root.querySelector("#language-toggle");
  if (toggle) {
    const alternative = activeLocale === "en" ? zhCN : en;
    toggle.textContent = alternative.nativeName;
    toggle.setAttribute("aria-label", `${t("language.switch")}: ${alternative.nativeName}`);
  }
}
