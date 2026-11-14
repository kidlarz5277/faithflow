import { Plus, X } from "lucide-react";
import { createDefaultListValue, normalizeListValue, parseListFieldConfig } from "../utils/listField";
import "./ListInput.css";

const PHONE_NUMBER_REGEX = /^09\d{9}$/;

export const toComparableListName = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

function ListInput({ field, value, onChange, takenNames }) {
  const { minEntries } = parseListFieldConfig(field);
  const entries = normalizeListValue(value, minEntries);

  const getDuplicateMessage = (index) => {
    if (!takenNames) return "";
    const name = toComparableListName(entries[index]?.name);
    if (!name) return "";
    const usedElsewhere = takenNames.get(name);
    if (usedElsewhere) return `Already entered as ${usedElsewhere}.`;
    const firstIndex = entries.findIndex((entry) => toComparableListName(entry.name) === name);
    if (firstIndex !== index) return `Same name as entry ${firstIndex + 1}.`;
    return "";
  };

  const handleEntryChange = (index, property, nextValue) => {
    onChange(entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, [property]: nextValue } : entry)));
  };

  const handleAddEntry = () => {
    onChange([...entries, { name: "", phone: "" }]);
  };

  const handleRemoveEntry = (index) => {
    if (entries.length <= minEntries) return;
    onChange(entries.filter((_, entryIndex) => entryIndex !== index));
  };

  return (
    <div className="list-input">
      <header className="list-input-header">
        <button type="button" className="list-add-button" onClick={handleAddEntry}>
          <Plus size={14} aria-hidden="true" />
          Add Entry
        </button>
      </header>
      <div className="list-entry-list">
        {entries.map((entry, index) => {
          const duplicateMessage = getDuplicateMessage(index);
          return (
            <div key={`list-entry-${index}`} className="list-entry-row">
              <div className="list-entry-index">{index + 1}</div>
              <label className="list-entry-field">
                <span>Full Name{index < minEntries ? " *" : ""}</span>
                <input
                  type="text"
                  value={entry.name}
                  placeholder="Enter full name"
                  className={duplicateMessage ? "is-duplicate-name" : undefined}
                  aria-invalid={duplicateMessage ? true : undefined}
                  onChange={(event) => handleEntryChange(index, "name", event.target.value)}
                  required={field.required !== false && index < minEntries}
                />
                {duplicateMessage ? <small className="list-entry-error">{duplicateMessage}</small> : null}
              </label>
              <label className="list-entry-field">
                <span>Phone Number (Optional)</span>
                <input
                  type="tel"
                  value={entry.phone}
                  placeholder="09XXXXXXXXX"
                  className={entry.phone.length > 0 && !PHONE_NUMBER_REGEX.test(entry.phone.trim()) ? "invalid-phone" : undefined}
                  inputMode="numeric"
                  pattern="09\\d{9}"
                  minLength={11}
                  maxLength={11}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
                    handleEntryChange(index, "phone", digits);
                  }}
                />
              </label>
              {index >= minEntries ? (
                <button
                  type="button"
                  className="list-remove-button"
                  aria-label={`Remove entry ${index + 1}`}
                  onClick={() => handleRemoveEntry(index)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : (
                <span className="list-remove-spacer" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { createDefaultListValue };
export default ListInput;
