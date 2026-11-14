import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X } from "lucide-react";
import "./PageGuide.css";

const PAGE_GUIDES = {
  "appointment-requests": {
    title: "Appointment Request",
    controlGroups: [
      { title: "Page actions", description: "Change how requests are displayed or open the separate declined-request list.", items: ["List / Grid view", "Declined Requests"] },
      { title: "Find a request", description: "Narrow the queue by category, requester, review state, or date order.", items: ["Search requester or category", "Review Status", "Sort By", "Request category cards"] },
      { title: "Review a request", description: "Open the submission first, then approve it with a pickup schedule or decline it with a reason.", items: ["Open request details", "Approve", "Decline"] },
    ],
    steps: [
      "Choose a category card, such as a sacrament or special program, to show only those requests.",
      "Search by requester or category, then filter by review status or sort by date.",
      "Click a request to read the full details before you decide.",
      "Approve an online request and set the pickup date and time. Decline asks for a reason.",
      "Open Declined Requests to review requests that were turned down.",
    ],
  },
  "progress-tracker": {
    title: "Progress Tracker",
    controlGroups: [
      { title: "Progress views", description: "Switch between all active appointments, those in progress, and finished appointments.", items: ["Total", "Ongoing", "Completed"] },
      { title: "Find an appointment", description: "Search across appointment details and narrow results to a sacramental type.", items: ["Search", "Sacramental Type"] },
      { title: "Manage records", description: "Edit reusable requirement steps, restore cancelled work, or open a record to see its progress.", items: ["Manage Templates", "Cancelled Appointments", "Appointment cards"] },
    ],
    steps: [
      "Total shows every active appointment. Ongoing and Completed narrow the list.",
      "Search by name, sacrament, or status, and filter by sacramental type.",
      "Click anywhere on a card to open that appointment’s progress.",
      "A special program card opens its applicant list instead.",
      "Manage Templates edits the requirement steps. Cancelled Appointments lists the ones that were stopped.",
    ],
  },
  "cancelled-appointments": {
    title: "Cancelled Appointments",
    controlGroups: [
      { title: "Cancelled records", description: "Each record keeps the requester, appointment date, and the reason it was stopped.", items: ["Cancelled appointment cards", "Cancellation reason"] },
      { title: "Available action", description: "Restore a record when the parish and requester are ready to continue.", items: ["Restore Appointment"] },
    ],
    steps: [
      "This list shows appointments that were cancelled from the Progress Tracker.",
      "Each card includes the requester, the date, and the reason it was cancelled.",
      "Use Restore Appointment when the parish wants to continue that request.",
    ],
  },
  "priest-management": {
    title: "Priest Management",
    controlGroups: [
      { title: "Priest list", description: "Choose a priest to load their profile and schedule, or create an account for a new priest.", items: ["Select a priest", "Add Priest"] },
      { title: "Schedule views", description: "Separate future assignments from events already completed by the selected priest.", items: ["Upcoming", "Completed"] },
      { title: "Schedule details", description: "Open an event to review its timing, location, and linked appointment submissions.", items: ["Open an event"] },
    ],
    steps: [
      "Select a priest to see their profile, status, and assigned schedules.",
      "Add Priest creates a new priest account with a Gmail address, a phone number, or both.",
      "Upcoming and Completed group that priest’s events.",
      "Click an event to see the date, time, location, and any linked appointment submissions.",
    ],
  },
  "certificate-requests": {
    title: "Certificate Requests",
    controlGroups: [
      { title: "Request status", description: "Choose a status tab to review only requests at that stage; the count helps show the queue size.", items: ["Pending", "Approved", "Declined"] },
      { title: "Find a request", description: "Search by requester, certificate, or status to locate a specific submission.", items: ["Search requester or certificate type"] },
      { title: "Review actions", description: "Inspect submitted answers, set a pickup window when approving, record a decline reason, or finish a claimed certificate.", items: ["Edit Certificate Types", "Open request details", "Accept", "Decline", "Mark as Done"] },
    ],
    steps: [
      "Pending, Approved, and Declined switch the list. The filled tab is the one you are viewing.",
      "Search by requester, certificate type, or status.",
      "Click a request to open its details, including the form answers.",
      "Accept a pending request and set the pickup window. Decline records a reason.",
      "On an approved request, Mark as Done when the certificate has been claimed.",
    ],
  },
  reports: {
    title: "Reports",
    controlGroups: [
      { title: "Report filters", description: "Search records, choose Appointment, Special Program, or Certificate Request, then pick a specific type. Use the status cards to show all, ongoing, completed, or cancelled records.", items: ["Search", "Type", "Appointment / Special Program / Certificate", "Sort By", "All Records / Ongoing / Completed / Cancelled"] },
      { title: "Report actions", description: "Switch the record layout, open a row for more information, or prepare a printable report.", items: ["List / Grid view", "Print", "View more"] },
    ],
    steps: [
      "Search or filter by appointment, special program, or certificate request, then use the status cards to focus the list.",
      "The name shown for a sacrament comes from the form answers, not the account name.",
      "Use Print when you need a paper or PDF copy of the current report.",
    ],
  },
  "special-programs": {
    title: "Special Programs",
    controlGroups: [
      { title: "Program list", description: "Open a program to review its schedule and the people who have applied.", items: ["Program cards", "Open a program"] },
      { title: "Program actions", description: "Create a new parish program or update the details and schedule of an existing one.", items: ["Add program", "Edit program"] },
    ],
    steps: [
      "This page lists parish sacramental programs such as community baptisms.",
      "Open a program to see its schedule and who has applied.",
      "Add or edit a program when the parish sets a new date.",
    ],
  },
  "sacrament-form-manager": {
    title: "Sacrament Form Manager",
    controlGroups: [
      {
        title: "Sacrament types",
        description: "Choose a type to edit its form. Add a new type or open Archived to restore a type that was removed from the active list.",
        items: ["Sacrament Types", "Add Type", "Archived", "Archive"],
      },
      {
        title: "Form editor",
        description: "Edit the selected type's name, update its requirements, or add fields to its request form.",
        items: ["Edit name", "Edit Requirements", "Add Field", "Edit Field"],
      },
      {
        title: "Field controls",
        description: "Change field order, duplicate a field, or remove a field from the form.",
        items: ["Move up", "Move down", "Duplicate field", "Delete field"],
      },
    ],
    steps: [
      "Select a sacrament type from the left panel to load its current form fields.",
      "Use Add Type to create another form, or Archived to review and restore archived types.",
      "Edit the selected type's name or use Edit Requirements to manage the documents and other requirements it needs.",
      "Use Add Field to add a question to the request form. Choose Edit Field to change its label, type, placeholder, or validation.",
      "Reorder fields with the up and down controls. Duplicate a field as a starting point or delete it when it is no longer needed.",
    ],
  },
  "sacrament-archive": {
    title: "Archived Sacrament Types",
    controlGroups: [
      {
        title: "Archived types",
        description: "Each card identifies an archived type and summarizes how many fields, documents, and other requirements it contains.",
        items: ["Archived", "fields", "documents", "other requirements"],
      },
      {
        title: "Restore a type",
        description: "Restore returns the type to the Sacrament Form Manager so it can be selected and used again.",
        items: ["Restore"],
      },
      {
        title: "Delete a type",
        description: "Delete permanently removes the archived type. Review the confirmation dialog before proceeding.",
        items: ["Delete"],
      },
      {
        title: "Return to forms",
        description: "Go back to the Sacrament Form Manager to edit active types.",
        items: ["Back to Sacrament Manager"],
      },
    ],
    steps: [
      "Review each archived card and its field and requirement counts before taking action.",
      "Choose Restore to return a type to the active Sacrament Form Manager list.",
      "Choose Delete only when the archived type should be permanently removed, then confirm the action.",
      "Use Back to Sacrament Manager to return to active forms.",
    ],
  },
  "certificate-type-manager": {
    title: "Certificate Type Manager",
    controlGroups: [
      {
        title: "Certificate types",
        description: "Select a type to edit its form. Add a type, open the archive, or remove a type that is no longer needed.",
        items: ["Certificate Types", "Add certificate type", "Archive", "Remove"],
      },
      {
        title: "Certificate settings",
        description: "Edit the selected certificate's name and fee. Leave the fee blank or set it to zero for a free certificate.",
        items: ["Edit certificate name", "Fee", "Save Fee"],
      },
      {
        title: "Request fields",
        description: "Add and edit the questions applicants answer, change their order, duplicate a field, or remove one.",
        items: ["Add Field", "Edit Field", "Hide Edit", "Move up", "Move down", "Duplicate field", "Remove field"],
      },
      {
        title: "Return to requests",
        description: "Go back to Certificate Requests when you are finished managing the form.",
        items: ["Back to Certificate Requests"],
      },
    ],
    steps: [
      "Select a certificate type from the list to load its current request form.",
      "Use Add certificate type to create another option, or Archive to review archived types.",
      "Edit the type name and fee in the editor. Save Fee applies the fee shown for the selected certificate.",
      "Use Add Field to add a question. Edit Field opens its settings, including its label, input type, and placeholder.",
      "Use the arrow controls to reorder fields, Duplicate field to copy one, and Remove field to delete it.",
      "Back to Certificate Requests returns to the request queue.",
    ],
  },
  "special-sacrament-form-manager": {
    title: "Special Sacrament Form Manager",
    controlGroups: [
      {
        title: "Special sacrament types",
        description: "Select a program type to edit its form. Add a type for a special program or remove one that is no longer used.",
        items: ["Special Sacrament Types", "Add special sacrament type", "Remove"],
      },
      {
        title: "Program form settings",
        description: "Edit the selected program's name and manage its required documents and other requirements.",
        items: ["Edit program name", "Edit Requirements"],
      },
      {
        title: "Request fields",
        description: "Add and edit the questions applicants answer, change their order, duplicate a field, or remove one.",
        items: ["Add Field", "Edit Field", "Hide Edit", "Move up", "Move down", "Duplicate field", "Remove field"],
      },
      {
        title: "Return to programs",
        description: "Go back to Special Programs when you are finished managing the form.",
        items: ["Back to Special Programs"],
      },
    ],
    steps: [
      "Select a special sacrament type from the list to load its current form fields.",
      "Use Add special sacrament type to add a form for a new program. Remove deletes a type after confirmation.",
      "Edit the selected program name or choose Edit Requirements to update the documents and other requirements applicants must complete.",
      "Use Add Field to add a question to the program form. Edit Field opens its label, input type, and placeholder settings.",
      "Use the arrow controls to reorder fields, Duplicate field to copy one, and Remove field to delete it.",
      "Back to Special Programs returns to the program list.",
    ],
  },
  profile: {
    title: "Profile",
    controlGroups: [
      {
        title: "Profile photo and security",
        description: "Update your profile picture and use Change Password to update the password for this account.",
        items: ["Change Profile Picture", "Attach Profile Picture", "Change Password"],
      },
      {
        title: "Profile details",
        description: "Review the account or parish details shown here. Use an edit icon beside an editable detail to update it.",
        items: ["Church Name", "Parish Secretary Name", "Username", "Contact Number", "Email", "Address", "Edit profile details"],
      },
      {
        title: "Return",
        description: "Use Back to return to the previous page.",
        items: ["Back"],
      },
    ],
    steps: [
      "Review the account details displayed on the profile page.",
      "Use the edit icon beside an editable detail to change that value, then save the change in the dialog.",
      "Choose Change Profile Picture or Attach Profile Picture to upload an image for the account.",
      "Choose Change Password to update the account password.",
      "Use Back to return to the page you came from.",
    ],
  },
  "admin-history": {
    title: "History",
    controlGroups: [
      { title: "Find a record", description: "Search by a person or sacrament, then narrow the archive by record status or type.", items: ["Search", "Status filter", "Type filter"] },
      { title: "History view", description: "Choose a layout and open any result to review its submission and final outcome.", items: ["List / Grid view", "Open a record"] },
    ],
    steps: [
      "History keeps finished and declined parish records in one list.",
      "Filter by status, then search for a name or sacrament.",
      "Open a record to review what was submitted and how it ended.",
    ],
  },
  "user-status": {
    title: "Status",
    controlGroups: [
      { title: "Your requests", description: "Search and combine type, certificate, status, and sort filters to find a request.", items: ["Search requests", "Sacramental Type", "Certificate Type", "Status", "Sort By"] },
      { title: "Request actions", description: "Review cancelled appointments separately or open an active card to follow its requirements.", items: ["Cancelled Appointments", "Open a request card"] },
    ],
    steps: [
      "This page shows the appointments you have requested and where each one stands.",
      "Use the status filters to see pending, ongoing, or other stages.",
      "Open a card to follow the requirements still needed for that sacrament.",
    ],
  },
  "user-history": {
    title: "History",
    controlGroups: [
      { title: "Find a record", description: "Search older requests and use available filters to reduce the list.", items: ["Search", "Status filter", "Type filter"] },
      { title: "History list", description: "Open a saved record to see the details and outcome retained in your account.", items: ["Request cards", "Open a record"] },
    ],
    steps: [
      "History lists the appointments and requests that are already finished.",
      "Search or filter to find an older record.",
      "Open a record to see the details that were saved.",
    ],
  },
  "assigned-appointments": {
    title: "Assigned Appointments",
    controlGroups: [
      { title: "Appointment views", description: "Switch between assignments awaiting your attention and ones with a remark.", items: ["Awaiting", "Remarked"] },
      { title: "Find an appointment", description: "Search appointment details, filter by sacramental type, and order the results.", items: ["Search", "Type", "Sort By"] },
      { title: "Assigned records", description: "Check the service details on a card and open it when you need the full submission.", items: ["Appointment cards", "Open appointment details"] },
    ],
    steps: [
      "This list shows the sacramental appointments assigned to you.",
      "Check the date, time, location, and the person the sacrament is for.",
      "Open an appointment when you need the submitted details.",
    ],
  },
  "priest-history": {
    title: "Priest History",
    controlGroups: [
      { title: "Find a record", description: "Search completed services and narrow them by sacramental type, status, or order.", items: ["Search", "Sacramental Type", "Status", "Sort By"] },
      { title: "History actions", description: "Change the layout or open a record for service details.", items: ["List / Grid view", "Open a record"] },
    ],
    steps: [
      "This page keeps the appointments you have already finished.",
      "Search the list when you need an older record.",
      "Open a record to review the details from that service.",
    ],
  },
  "parish-activity": {
    title: "Recent Parish Activity",
    controlGroups: [
      { title: "Activity gallery", description: "Browse recent event cards and their photos with the previous and next controls.", items: ["Previous activity", "Next activity", "Activity cards"] },
      { title: "Activity action", description: "Post a parish event with its details and photo.", items: ["Add Activity"] },
    ],
    steps: [
      "These cards show recent parish events and their photos.",
      "Use the arrows to move through the activities.",
      "Add Activity posts a new event with its photo.",
    ],
  },
  "dashboard-special-programs": {
    title: "Special Sacramental Programs",
    controlGroups: [
      { title: "Upcoming programs", description: "Review scheduled community sacraments and open a program for its dates and details.", items: ["Program cards", "Open program schedule"] },
      { title: "Program action", description: "Start an application for a program that is open to parishioners.", items: ["Apply"] },
    ],
    steps: [
      "These are the upcoming community sacraments on the parish calendar.",
      "Open a program to apply or see its schedule.",
    ],
  },
};

const getControlTargetInfo = (element, guide) => {
  const label = [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("placeholder"),
    element.labels ? Array.from(element.labels, (item) => item.textContent).join(" ") : "",
    element.innerText,
    element.textContent,
  ]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .find(Boolean) || "Page control";
  const searchable = `${label} ${element.className || ""} ${element.getAttribute("name") || ""}`.toLowerCase();
  const normalizedSearchable = searchable.replace(/[^a-z0-9]+/g, " ").trim();
  let bestMatch = null;
  let bestScore = 0;

  guide.controlGroups.forEach((group) => {
    let score = 0;
    const normalizedTitle = group.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (normalizedSearchable.includes(normalizedTitle)) score += 2;
    group.items.forEach((item) => {
      const normalizedItem = item.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (normalizedItem && normalizedSearchable.includes(normalizedItem)) score += 3;
      const keywords = normalizedItem.split(" ").filter((word) => word.length > 3 && !["open", "show", "card", "cards", "view", "list", "details"].includes(word));
      const matches = keywords.filter((word) => normalizedSearchable.includes(word)).length;
      if (keywords.length) score += matches / keywords.length;
    });

    const tagName = element.tagName.toLowerCase();
    if ((tagName === "input" || tagName === "select" || tagName === "textarea") && /find|filter|search/i.test(group.title)) score += 0.5;
    if (/card|item|record/i.test(element.className || "") && /list|record|request|program/i.test(group.title)) score += 0.5;
    if (score > bestScore) {
      bestMatch = group;
      bestScore = score;
    }
  });

  const fallbackInstruction = element.matches("a, button, [role='button'], [tabindex='0']")
    ? "Select this control to open or update the related page content."
    : "Use this field to narrow the information shown on the page.";
  return {
    label: label.length > 72 ? `${label.slice(0, 69)}...` : label,
    groupTitle: bestMatch?.title || "Page control",
    instruction: bestMatch?.description || fallbackInstruction,
  };
};

export default function PageGuide({ pageKey }) {
  const guide = PAGE_GUIDES[pageKey];
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewScale, setPreviewScale] = useState(0);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const previewViewportRef = useRef(null);
  const previewFrameRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const pageLayout = document.querySelector(".dashboard-layout, .profile-layout");
    const appRoot = document.getElementById("root");
    if (!pageLayout || !appRoot) {
      setPreview(null);
      return undefined;
    }

    const viewportWidth = Math.max(document.documentElement.clientWidth, 320);
    const viewportHeight = Math.max(document.documentElement.clientHeight, 400);
    const pageBounds = pageLayout.getBoundingClientRect();
    const clonedLayout = pageLayout.cloneNode(true);
    const sourceFields = pageLayout.querySelectorAll("input, textarea, select");
    const clonedFields = clonedLayout.querySelectorAll("input, textarea, select");

    sourceFields.forEach((field, index) => {
      const clonedField = clonedFields[index];
      if (!clonedField) return;
      if (field instanceof HTMLInputElement) {
        clonedField.setAttribute("value", field.value);
        if (field.checked) clonedField.setAttribute("checked", "");
        else clonedField.removeAttribute("checked");
      } else if (field instanceof HTMLTextAreaElement) {
        clonedField.textContent = field.value;
      } else if (field instanceof HTMLSelectElement) {
        Array.from(clonedField.options).forEach((option, optionIndex) => {
          if (field.options[optionIndex]?.selected) option.setAttribute("selected", "");
          else option.removeAttribute("selected");
        });
      }
    });

    const sourceNodes = [pageLayout, ...pageLayout.querySelectorAll("*")];
    const clonedNodes = [clonedLayout, ...clonedLayout.querySelectorAll("*")];
    sourceNodes.forEach((sourceNode, index) => {
      const clonedNode = clonedNodes[index];
      if (clonedNode) {
        clonedNode.scrollTop = sourceNode.scrollTop;
        clonedNode.scrollLeft = sourceNode.scrollLeft;
      }
    });

    const sourceImages = pageLayout.querySelectorAll("img");
    const clonedImages = clonedLayout.querySelectorAll("img");
    sourceImages.forEach((image, index) => {
      const clonedImage = clonedImages[index];
      if (!clonedImage) return;
      clonedImage.removeAttribute("srcset");
      if (image.complete && image.currentSrc) clonedImage.setAttribute("src", image.currentSrc);
    });
    clonedLayout.querySelectorAll("script, iframe, link, video, audio, source").forEach((element) => element.remove());
    clonedLayout.querySelectorAll("[autofocus]").forEach((element) => element.removeAttribute("autofocus"));

    const targetRoot = pageLayout.querySelector(".dashboard-main, .profile-main") || pageLayout;
    const targets = Array.from(targetRoot.querySelectorAll("button, input:not([type='hidden']), select, textarea, a[href], label.profile-upload-button, [role='button'], [tabindex='0']"))
      .filter((element) => !element.matches(".page-guide-trigger"))
      .map((element, index) => {
        const bounds = element.getBoundingClientRect();
        if (bounds.width < 8 || bounds.height < 8 || bounds.right < 0 || bounds.bottom < 0 || bounds.left > viewportWidth || bounds.top > viewportHeight) return null;
        const info = getControlTargetInfo(element, guide);
        return {
          ...info,
          id: `${pageKey}-target-${index}`,
          left: Math.max(0, bounds.left - pageBounds.left),
          top: Math.max(0, bounds.top - pageBounds.top),
          width: Math.min(bounds.width, viewportWidth - Math.max(0, bounds.left - pageBounds.left)),
          height: Math.min(bounds.height, viewportHeight - Math.max(0, bounds.top - pageBounds.top)),
        };
      })
      .filter((target) => target && target.width > 0 && target.height > 0);

    clonedLayout.style.width = `${viewportWidth}px`;
    clonedLayout.style.height = `${viewportHeight}px`;
    clonedLayout.style.overflow = "hidden";
    clonedLayout.style.pointerEvents = "none";

    setPreview({
      width: viewportWidth,
      height: viewportHeight,
      targets,
      node: clonedLayout,
    });
    setPreviewLoaded(false);
    setSelectedTarget(null);
    return undefined;
  }, [guide, isOpen, pageKey]);

  useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame || !preview?.node) return undefined;
    frame.replaceChildren(preview.node);
    return undefined;
  }, [preview]);

  useEffect(() => {
    const viewport = previewViewportRef.current;
    if (!isOpen || !preview || !viewport) return undefined;

    const updateScale = () => {
      const availableWidth = viewport.clientWidth;
      setPreviewScale(availableWidth > 0 ? Math.min(availableWidth / preview.width, 1) : 0);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isOpen, preview]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  if (!guide) return null;

  return (
    <>
      <button
        type="button"
        className="page-guide-trigger"
        aria-label={`Open guide for ${guide.title}`}
        onClick={(event) => {
          event.stopPropagation();
          setPreview(null);
          setPreviewLoaded(false);
          setSelectedTarget(null);
          setIsOpen(true);
        }}
      >
        <CircleHelp size={18} aria-hidden="true" />
      </button>
      {isOpen
        ? createPortal(
        <div className="page-guide-overlay" role="presentation" onClick={() => setIsOpen(false)}>
          <section
            className="page-guide-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${guide.title} guide`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="page-guide-bar">
              <div>
                <p className="page-guide-kicker">Page guide</p>
                <h3>{guide.title}</h3>
                <p className="page-guide-hint">
                  {selectedTarget ? "Select another control to see its instructions." : "Click inside the UI to see instructions."}
                </p>
              </div>
              <button type="button" className="page-guide-close" aria-label="Close guide" onClick={() => setIsOpen(false)}>
                <X size={16} strokeWidth={2.2} />
              </button>
            </header>
            <div className={`page-guide-content${selectedTarget ? " has-selection" : ""}`}>
              <section className="page-guide-preview" aria-label={`${guide.title} interface preview`}>
                {preview ? (
                  <div
                    className="page-guide-preview-viewport"
                    ref={previewViewportRef}
                    style={{ height: `${preview.height * previewScale}px` }}
                  >
                    <div
                      className={`page-guide-preview-frame${previewScale > 0 ? " is-loaded" : ""}`}
                      ref={previewFrameRef}
                      style={{
                        width: `${preview.width}px`,
                        height: `${preview.height}px`,
                        transform: `scale(${previewScale})`,
                      }}
                    />
                    <div className="page-guide-hotspots" aria-label="Select a control to read its guide">
                      {preview.targets.map((target) => (
                        <button
                          type="button"
                          className={`page-guide-hotspot${selectedTarget?.id === target.id ? " is-selected" : ""}`}
                          key={target.id}
                          aria-label={`Guide: ${target.label}`}
                          title={target.label}
                          onClick={() => setSelectedTarget(target)}
                          style={{
                            left: `${target.left * previewScale}px`,
                            top: `${target.top * previewScale}px`,
                            width: `${target.width * previewScale}px`,
                            height: `${target.height * previewScale}px`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="page-guide-preview-unavailable">The page preview is not available here.</p>
                )}
                <p className="page-guide-preview-caption">Snapshot of the current page</p>
              </section>
              {selectedTarget ? (
                <section className="page-guide-instructions" key={selectedTarget.id} aria-live="polite">
                  <p className="page-guide-instruction-kicker">{selectedTarget.groupTitle}</p>
                  <h4>{selectedTarget.label}</h4>
                  <p className="page-guide-instruction-copy">{selectedTarget.instruction}</p>
                  <button type="button" className="page-guide-back" onClick={() => setSelectedTarget(null)}>
                    Back to preview
                  </button>
                </section>
              ) : null}
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
