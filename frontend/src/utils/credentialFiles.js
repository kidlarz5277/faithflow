const FILE_EXTENSION = /\.(png|jpe?g|webp|gif|bmp|svg|avif|pdf|docx?)(\?|#|$)/i;

export const toStoredFileUrl = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("data:") || /^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/uploads/")) return `/api${text}`;
  if (text.startsWith("/api/uploads/")) return text;
  if (text.startsWith("uploads/")) return `/api/${text}`;
  return "";
};

export const getStoredFileKind = (url, name) => {
  const target = `${name || ""} ${url || ""}`.toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|svg|avif)(\?|#|$)/.test(target)) return "image";
  if (/\.pdf(\?|#|$)/.test(target)) return "pdf";
  return "file";
};

const fileFromValue = (value) => {
  if (typeof value === "string") {
    const url = toStoredFileUrl(value);
    const name = value.split("/").filter(Boolean).pop() || "View file";
    if (url) return { url, name, kind: getStoredFileKind(url, name) };
    if (FILE_EXTENSION.test(value.trim())) {
      return { url: "", name: value.trim(), kind: getStoredFileKind("", value) };
    }
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const url = toStoredFileUrl(value.url || value.fileUrl || value.path || value.filePath || "");
  const name = String(value.originalName || value.fileName || value.name || "").trim();
  if (!url && !FILE_EXTENSION.test(name)) return null;
  return { url, name: name || "View file", kind: getStoredFileKind(url, name) };
};

export const describeCredentialFiles = (entryValue, siblingSource = {}, key = "") => {
  if (Array.isArray(entryValue)) {
    const files = entryValue.map(fileFromValue).filter((file) => file?.url);
    if (files.length > 0 && files.length === entryValue.filter(Boolean).length) return files;
    return [];
  }
  const direct = fileFromValue(entryValue);
  if (direct?.url) return [direct];
  const base = String(key || "").replace(/(FileName|Name|FileUrl|Url)$/i, "");
  if (direct && /(FileName|Name)$/i.test(key)) {
    const url = toStoredFileUrl(siblingSource[`${base}Url`] || siblingSource[`${base}FileUrl`] || "");
    if (url) return [{ ...direct, url, kind: getStoredFileKind(url, direct.name) }];
  }
  return [];
};

export const isRedundantFileUrlKey = (key, source) => {
  if (!source || typeof source !== "object" || !/(FileUrl|Url)$/i.test(key)) return false;
  const base = String(key).replace(/(FileUrl|Url)$/i, "");
  const name = source[`${base}FileName`] || source[`${base}Name`];
  return describeCredentialFiles(name, source, `${base}FileName`).some((file) => file.url);
};
