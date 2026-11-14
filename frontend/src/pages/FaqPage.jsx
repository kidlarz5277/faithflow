import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ChevronDown, Search, X } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { FAQ_CONTENT } from "../utils/faqContent";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./FaqPage.css";

const ROLE_FAQ = {
  user: "/dashboard/faqs",
  priest: "/priest/faqs",
  admin: "/admin/faqs",
};

const ROLE_SETTINGS = {
  user: "/dashboard/settings",
  priest: "/priest/settings",
  admin: "/admin/settings",
};

const readAuthData = () => {
  const raw = localStorage.getItem("faithflow_auth") || sessionStorage.getItem("faithflow_auth");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const resolveRole = (accountType) => {
  if (accountType === "admin") return "admin";
  if (accountType === "priest") return "priest";
  return "user";
};

function FaqPage({ role, isPublic = false }) {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [openItemId, setOpenItemId] = useState("");

  const authData = useMemo(readAuthData, []);
  const user = authData?.user;
  const accountRole = resolveRole(authData?.accountType);
  const content = FAQ_CONTENT[isPublic ? "user" : role] || FAQ_CONTENT.user;

  useEffect(() => {
    document.title = "Faithflow - FAQs";
  }, []);

  useEffect(() => {
    if (isPublic) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountRole !== role) {
      navigate(ROLE_FAQ[accountRole], { replace: true });
    }
  }, [accountRole, isPublic, navigate, role, user]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleCategories = useMemo(
    () =>
      content.categories
        .filter((category) => activeCategory === "all" || category.id === activeCategory)
        .map((category) => ({
          ...category,
          items: category.items.filter((item) => {
            if (!normalizedSearch) return true;
            const haystack = `${item.question} ${item.answer.join(" ")}`.toLowerCase();
            return haystack.includes(normalizedSearch);
          }),
        }))
        .filter((category) => category.items.length > 0),
    [activeCategory, content.categories, normalizedSearch],
  );
  const totalQuestions = content.categories.reduce((sum, category) => sum + category.items.length, 0);
  const visibleCount = visibleCategories.reduce((sum, category) => sum + category.items.length, 0);

  if (!isPublic && (!user || accountRole !== role)) return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const faqBody = (
    <>
          <section className="dashboard-panel dashboard-hero faq-hero">
            <div className="faq-hero-copy">
              <span className="faq-hero-icon" aria-hidden="true">
                <BookOpen size={19} />
              </span>
              <div>
                <p className="faq-eyebrow">Help center</p>
                <h2>Frequently Asked Questions</h2>
                <p className="faq-hero-description">Find clear guidance for using Faithflow.</p>
              </div>
            </div>
            <span className="faq-total-count">{totalQuestions} articles</span>
          </section>

          <section className="dashboard-panel faq-panel">
            <div className="faq-toolbar">
              <label className="faq-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search a question or keyword"
                  aria-label="Search FAQs"
                />
                {searchTerm ? (
                  <button type="button" className="faq-search-clear" aria-label="Clear search" onClick={() => setSearchTerm("")}>
                    <X size={14} />
                  </button>
                ) : null}
              </label>
              <div className="faq-categories" role="tablist" aria-label="FAQ categories">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === "all"}
                  className={`faq-category-chip${activeCategory === "all" ? " is-active" : ""}`}
                  onClick={() => setActiveCategory("all")}
                >
                  All ({totalQuestions})
                </button>
                {content.categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === category.id}
                    className={`faq-category-chip${activeCategory === category.id ? " is-active" : ""}`}
                    onClick={() => setActiveCategory(category.id)}
                  >
                    {category.title}
                  </button>
                ))}
              </div>
            </div>

            {visibleCount === 0 ? (
              <p className="faq-empty">No questions match “{searchTerm}”. Try another keyword.</p>
            ) : (
              visibleCategories.map((category) => (
                <section key={category.id} className="faq-group">
                  <h3 className="faq-group-title">
                    <span>{category.title}</span>
                    <span className="faq-group-count">{category.items.length}</span>
                  </h3>
                  <ul className="faq-list">
                    {category.items.map((item, index) => {
                      const itemId = `${category.id}-${index}`;
                      const isOpen = openItemId === itemId || Boolean(normalizedSearch);
                      return (
                        <li key={itemId} className={`faq-item${isOpen ? " is-open" : ""}`}>
                          <button
                            type="button"
                            className="faq-question"
                            aria-expanded={isOpen}
                            onClick={() => setOpenItemId((current) => (current === itemId ? "" : itemId))}
                          >
                            <span>{item.question}</span>
                            <ChevronDown size={18} aria-hidden="true" className="faq-chevron" />
                          </button>
                          {isOpen ? (
                            <div className="faq-answer">
                              {item.answer.map((paragraph) => (
                                <p key={paragraph}>{paragraph}</p>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}

            <p className="faq-footer-note">{content.footer}</p>
          </section>
    </>
  );

  if (isPublic) {
    return (
      <main className="public-faq-page">
        <header className="public-faq-top">
          <button type="button" className="public-faq-back" onClick={() => navigate("/about")}>
            Back
          </button>
          <strong>Faithflow</strong>
        </header>
        <div className="public-faq-main">{faqBody}</div>
      </main>
    );
  }

  return (
    <main className="dashboard-layout">
      <Header
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(toggleSidebarOpen)}
        onProfile={() => navigate("/profile")}
        onSettings={() => navigate(ROLE_SETTINGS[role])}
        onLogout={handleLogout}
      />
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant={role} />
        <section className="dashboard-main">{faqBody}</section>
      </div>
    </main>
  );
}

export default FaqPage;
