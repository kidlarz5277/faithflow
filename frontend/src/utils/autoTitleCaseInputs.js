let isGlobalTitleCaseEnabled = false;

const EXCLUDED_KEYWORD_REGEX = /(email|e-mail|username|user_name|password|passcode)/i;
const TITLE_CASE_WORD_REGEX = /\b([a-z])([a-z']*)/gi;

const toTitleCase = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(TITLE_CASE_WORD_REGEX, (_match, firstChar, rest = "") => `${firstChar.toUpperCase()}${rest}`);

const shouldSkipElement = (element) => {
  if (!element || element.disabled || element.readOnly) return true;
  if (element.dataset?.titleCase === "off") return true;

  const tagName = String(element.tagName || "").toLowerCase();
  if (tagName !== "input" && tagName !== "textarea") return true;

  const inputType = String(element.type || "").toLowerCase();
  if (tagName === "input" && ["email", "password"].includes(inputType)) {
    return true;
  }
  if (String(element.value || "").includes("@")) {
    return true;
  }

  const identifiers = [
    element.name,
    element.id,
    element.getAttribute("autocomplete"),
    element.getAttribute("placeholder"),
    element.getAttribute("aria-label"),
  ]
    .filter(Boolean)
    .join(" ");

  return EXCLUDED_KEYWORD_REGEX.test(identifiers);
};

const applyValueWithNativeSetter = (element, nextValue) => {
  const tagName = String(element.tagName || "").toLowerCase();
  const prototype =
    tagName === "textarea" ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
  const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
  const setter = descriptor?.set;
  if (typeof setter === "function") {
    setter.call(element, nextValue);
    return;
  }
  element.value = nextValue;
};

const handleGlobalTitleCaseBlur = (event) => {
  const element = event.target;
  if (shouldSkipElement(element)) return;

  const rawValue = String(element.value || "");
  if (!rawValue.trim()) return;

  const titleCasedValue = toTitleCase(rawValue);
  if (titleCasedValue === rawValue) return;

  applyValueWithNativeSetter(element, titleCasedValue);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

export const enableGlobalTitleCaseInputs = () => {
  if (isGlobalTitleCaseEnabled) return;
  isGlobalTitleCaseEnabled = true;
  document.addEventListener("blur", handleGlobalTitleCaseBlur, true);
};
