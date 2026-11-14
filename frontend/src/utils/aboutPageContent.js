export const ABOUT_PAGE_UPDATED_EVENT = "faithflow:about-page-updated";
export const ABOUT_PAGE_STORAGE_KEY = "faithflow_about_page_content";

export const DEFAULT_ABOUT_PAGE_CONTENT = {
  parishName: "Our Lady of Guadalupe Parish - Villanueva",
  parishTagline: "A parish service platform designed for easier requests, clearer schedules, and faster updates.",
  sacramentalOffers: ["Marriage", "Christening", "Funeral Mass", "Blessing"],
  certificateOffers: ["Baptismal Certificate", "Marriage Certificate"],
  missionTitle: "Our Lady of Guadalupe Parish Villanueva Mission",
  missionBody:
    "Guided by the love of Jesus and the maternal care of Our Lady of Guadalupe, We commit ourselves to building a vibrant and welcoming parish community where every baptized person feels valued and included.\n\nWe nurture our faith through active participation in the sacraments, ongoing catechesis, and the strengthening of Basic Ecclesial Communities that foster prayer, communion, and shared responsibility in the life and mission of the Church.\n\nWe promote the formation of families as the domestic church, recognizing their vital role in nurturing faith, values, and Christian life in the community.\n\nWe prioritize the formation and accompaniment of the youth, empowering them to become active disciples and leaders in the Church and society.\n\nRooted in faith and inspired to serve, we seek to respond with humility and compassion to the social challenges affecting our community, faithfully living out and proclaiming the message of the Gospel.",
  visionTitle: "Our Lady of Guadalupe Parish Villanueva Vision",
  visionBody:
    "Our Lady of Guadalupe Parish of Villanueva is a strengthened community of faithful who deeply appreciate the sacraments, where every baptized person feels a true sense of belongingness.\n\nCentered on the love of Jesus, united in prayer, devoted to humble and compassionate service, and persevering in carrying out the message of the Gospel.",
  brandTitle: "FaithFlow",
  heroBackgroundImage: "",
  brandBody:
    "FaithFlow is an online parish service management system developed for Our Lady of Guadalupe Parish - Villanueva. It provides a convenient digital platform where parishioners can request sacramental services such as Christening Mass, Marriage, Funeral Mass, and Blessings, as well as submit certificate requests including Baptismal and Marriage Certificates.\n\nBy moving these services into one system, FaithFlow helps make the process faster, more organized, and easier to track for both parishioners and parish staff. It improves request handling, reduces manual paperwork, and supports more efficient schedule and record management.",
};

const MAX_TEXT_LENGTH = {
  parishName: 180,
  parishTagline: 400,
  offerItem: 80,
  sectionTitle: 180,
  sectionBody: 6000,
};

const sanitizeHeroBackgroundImage = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("data:image/") && text.length < 8000000) return text;
  if (text.startsWith("/uploads/") || text.startsWith("/api/") || /^https?:\/\//i.test(text)) return text.slice(0, 500);
  return "";
};

const clampText = (value, fallback, maxLength) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
};

const sanitizeOfferList = (value, fallback) => {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\n|,/)
        .map((item) => item.trim());
  const cleaned = source
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((item) => item.slice(0, MAX_TEXT_LENGTH.offerItem));
  return cleaned.length > 0 ? cleaned : [...fallback];
};

export const sanitizeAboutPageContent = (value = {}) => ({
  parishName: clampText(value.parishName, DEFAULT_ABOUT_PAGE_CONTENT.parishName, MAX_TEXT_LENGTH.parishName),
  parishTagline: clampText(value.parishTagline, DEFAULT_ABOUT_PAGE_CONTENT.parishTagline, MAX_TEXT_LENGTH.parishTagline),
  sacramentalOffers: sanitizeOfferList(value.sacramentalOffers, DEFAULT_ABOUT_PAGE_CONTENT.sacramentalOffers),
  certificateOffers: sanitizeOfferList(value.certificateOffers, DEFAULT_ABOUT_PAGE_CONTENT.certificateOffers),
  missionTitle: clampText(value.missionTitle, DEFAULT_ABOUT_PAGE_CONTENT.missionTitle, MAX_TEXT_LENGTH.sectionTitle),
  missionBody: clampText(value.missionBody, DEFAULT_ABOUT_PAGE_CONTENT.missionBody, MAX_TEXT_LENGTH.sectionBody),
  visionTitle: clampText(value.visionTitle, DEFAULT_ABOUT_PAGE_CONTENT.visionTitle, MAX_TEXT_LENGTH.sectionTitle),
  visionBody: clampText(value.visionBody, DEFAULT_ABOUT_PAGE_CONTENT.visionBody, MAX_TEXT_LENGTH.sectionBody),
  brandTitle: clampText(value.brandTitle, DEFAULT_ABOUT_PAGE_CONTENT.brandTitle, MAX_TEXT_LENGTH.sectionTitle),
  brandBody: clampText(value.brandBody, DEFAULT_ABOUT_PAGE_CONTENT.brandBody, MAX_TEXT_LENGTH.sectionBody),
  heroBackgroundImage: sanitizeHeroBackgroundImage(value.heroBackgroundImage),
});

export const splitParagraphs = (value) =>
  String(value || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

export const splitParishHeroLines = (parishName) => {
  const text = String(parishName || "").trim() || DEFAULT_ABOUT_PAGE_CONTENT.parishName;
  const match = text.match(/^(.*?)(\s+Parish\b.*)$/i);
  if (match?.[1]?.trim() && match[2]?.trim()) {
    return [match[1].trim(), match[2].trim()];
  }
  return [text];
};

export const fetchAboutPageContent = async () => {
  const response = await fetch("/api/settings/about-page", { cache: "no-store" });
  const responseData = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseData?.message || "Unable to load About Us content.");
  }
  return sanitizeAboutPageContent(responseData?.aboutPage || {});
};

export const saveAboutPageContent = async (aboutPageInput, options = {}) => {
  const sanitizedContent = sanitizeAboutPageContent(aboutPageInput);
  const response = await fetch("/api/settings/about-page", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adminID: options?.adminID ?? null,
      aboutPage: sanitizedContent,
    }),
  });
  const responseData = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseData?.message || "Unable to save About Us content.");
  }
  const savedContent = sanitizeAboutPageContent(responseData?.aboutPage || sanitizedContent);
  try {
    localStorage.setItem(ABOUT_PAGE_STORAGE_KEY, JSON.stringify(savedContent));
  } catch {
    // Ignore storage quota issues; the API save is the source of truth.
  }
  window.dispatchEvent(
    new CustomEvent(ABOUT_PAGE_UPDATED_EVENT, {
      detail: { aboutPage: savedContent },
    }),
  );
  return savedContent;
};
