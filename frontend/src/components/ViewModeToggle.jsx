import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import "./ViewModeToggle.css";

const STORAGE_PREFIX = "faithflow_view_mode:";

const readStoredViewMode = (storageKey) => {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
};

export const useViewMode = (storageKey) => {
  const [viewMode, setViewMode] = useState(() => readStoredViewMode(storageKey));

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, viewMode);
    } catch {
      // Storage can be unavailable in private mode; the choice still applies for this visit.
    }
  }, [storageKey, viewMode]);

  return [viewMode, setViewMode];
};

const OPTIONS = [
  { id: "list", label: "List layout", Icon: List },
  { id: "grid", label: "Grid layout", Icon: LayoutGrid },
];

function ViewModeToggle({ value, onChange, className = "" }) {
  return (
    <div className={`view-mode-toggle${className ? ` ${className}` : ""}`} role="radiogroup" aria-label="Layout">
      {OPTIONS.map(({ id, label, Icon }) => {
        const isActive = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            className={`view-mode-toggle-option${isActive ? " is-active" : ""}`}
            onClick={() => onChange(id)}
          >
            <Icon size={18} strokeWidth={2.1} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export default ViewModeToggle;
