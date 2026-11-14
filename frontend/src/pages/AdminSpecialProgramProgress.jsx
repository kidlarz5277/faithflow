import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, ChevronDown, CircleCheckBig, Users, X } from "lucide-react";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import { getInitialSidebarOpen, toggleSidebarOpen } from "../utils/sidebarState";
import { pushUiNotice } from "../utils/uiNotice";
import { normalizeSpecialProgramSacramentalType } from "../utils/specialProgramProgress";
import "../components/Header.css";
import "../components/Sidebar.css";
import "./Dashboard.css";
import "./AdminProgressDetails.css";
import "./AdminSpecialProgramProgress.css";

const formatDateTime = (dateValue) => {
  if (!dateValue) return "Not available";
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return "Not available";
  return parsedDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const readCredentialText = (credentials, keys) => {
  const source = credentials && typeof credentials === "object" ? credentials : {};
  for (const key of keys) {
    const value = String(source?.[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const getConductedPersonSummary = (item, sacramentalType) => {
  const credentials = item?.credentials && typeof item.credentials === "object" ? item.credentials : {};
  if (sacramentalType === "Marriage") {
    const groomName = readCredentialText(credentials, ["groomName", "groomFullName"]);
    const brideName = readCredentialText(credentials, ["brideName", "brideFullName"]);
    const coupleName = groomName && brideName ? `${groomName} & ${brideName}` : groomName || brideName;
    return { conductedPersonLabel: "Couple", conductedPersonValue: coupleName || "Not provided" };
  }
  if (sacramentalType === "Baptism") {
    return {
      conductedPersonLabel: "Child",
      conductedPersonValue: readCredentialText(credentials, ["childFullName", "fullName"]) || "Not provided",
    };
  }
  return {
    conductedPersonLabel: "Conducted for",
    conductedPersonValue: readCredentialText(credentials, ["fullName", "childFullName"]) || "Not provided",
  };
};

const normalizeChecklistSteps = (checklist) => {
  if (!Array.isArray(checklist)) return [];
  return checklist
    .map((step, stepIndex) => {
      const title = String(step?.title || `Step ${stepIndex + 1}`).trim() || `Step ${stepIndex + 1}`;
      const tasks = (Array.isArray(step?.tasks) ? step.tasks : [])
        .map((task) => (typeof task === "string" ? task.trim() : String(task?.label || task?.title || "").trim()))
        .filter(Boolean);
      return { title, tasks };
    })
    .filter((step) => step.tasks.length > 0);
};

const countChecklistTasks = (steps) =>
  (Array.isArray(steps) ? steps : []).reduce((sum, step) => sum + (Array.isArray(step.tasks) ? step.tasks.length : 0), 0);

const isApplicantTaskDone = (applicant, stepIndex, taskIndex) => {
  const task = applicant?.checklist?.[stepIndex]?.tasks?.[taskIndex];
  return Boolean(task && typeof task === "object" && task.done);
};

const buildChecklistPayload = (applicant, steps, stepIndex, taskIndex, done) => {
  const source = Array.isArray(applicant?.checklist) ? applicant.checklist : [];
  return steps.map((step, currentStepIndex) => {
    const sourceStep = source[currentStepIndex] && typeof source[currentStepIndex] === "object" ? source[currentStepIndex] : {};
    const sourceTasks = Array.isArray(sourceStep.tasks) ? sourceStep.tasks : [];
    return {
      title: String(sourceStep.title || step.title || `Step ${currentStepIndex + 1}`).trim(),
      tasks: step.tasks.map((label, currentTaskIndex) => {
        const sourceTask = sourceTasks[currentTaskIndex];
        const sourceObject = sourceTask && typeof sourceTask === "object" ? sourceTask : {};
        const isTarget = currentStepIndex === stepIndex && currentTaskIndex === taskIndex;
        const payloadTask = {
          label: String(sourceObject.label || label || "").trim() || label,
          done: isTarget ? done : Boolean(sourceObject.done),
          nextScheduleDateTime: sourceObject.nextScheduleDateTime || null,
        };
        if (sourceObject.lastUncheckReason) {
          payloadTask.lastUncheckReason = sourceObject.lastUncheckReason;
          if (sourceObject.lastUncheckedAt) payloadTask.lastUncheckedAt = sourceObject.lastUncheckedAt;
        }
        return payloadTask;
      }),
    };
  });
};

function AdminSpecialProgramProgress() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sSacramentId } = useParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [programName, setProgramName] = useState(String(location.state?.programItem?.sacramentName || "").trim());
  const [eventSchedule, setEventSchedule] = useState("");
  const [applicants, setApplicants] = useState([]);
  const [isApplicantsOpen, setIsApplicantsOpen] = useState(false);
  const [checklistSteps, setChecklistSteps] = useState([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [selectedTask, setSelectedTask] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [pendingMarkAll, setPendingMarkAll] = useState(null);
  const [uncheckReason, setUncheckReason] = useState("");
  const [savingAppointmentIds, setSavingAppointmentIds] = useState([]);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const authData = useMemo(() => {
    const localValue = localStorage.getItem("faithflow_auth");
    const sessionValue = sessionStorage.getItem("faithflow_auth");
    const raw = localValue || sessionValue;
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const user = authData?.user;
  const accountType = authData?.accountType;
  const programID = Number(sSacramentId);
  const sacramentalType = normalizeSpecialProgramSacramentalType(programName) || "Special Sacrament Program";

  useEffect(() => {
    document.title = "Faithflow - Progress Checklist";
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (accountType !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [accountType, navigate, user]);

  useEffect(() => {
    if (!user || accountType !== "admin") return;
    if (!Number.isInteger(programID) || programID <= 0) {
      setLoadError("Invalid special sacrament program.");
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    const loadProgramChecklist = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const [appointmentsResponse, specialSacramentsResponse, templatesResponse] = await Promise.all([
          fetch("/admin-api/appointments"),
          fetch("/admin-api/special-sacraments"),
          fetch("/admin-api/progress-templates"),
        ]);
        const appointmentsData = await appointmentsResponse.json().catch(() => []);
        const specialSacramentsData = await specialSacramentsResponse.json().catch(() => []);
        const templatesData = await templatesResponse.json().catch(() => []);
        if (!appointmentsResponse.ok) throw new Error("Unable to load applicants.");
        if (!specialSacramentsResponse.ok) throw new Error("Unable to load special programs.");

        const matchedProgram = (Array.isArray(specialSacramentsData) ? specialSacramentsData : []).find(
          (item) => Number(item?.s_sacramentID) === programID,
        );
        const resolvedProgramName = String(matchedProgram?.s_sacramentName || programName || "Special Sacrament").trim();
        if (!isCancelled) {
          setProgramName(resolvedProgramName);
          setEventSchedule(matchedProgram?.timeDate || "");
        }

        const confirmedApplicants = (Array.isArray(appointmentsData) ? appointmentsData : []).filter((item) => {
          const status = String(item?.status || "").trim().toUpperCase();
          return Number(item?.s_sacramentID) === programID && status === "CONFIRMED" && !item?.finishedAt;
        });

        const progressResults = await Promise.all(
          confirmedApplicants.map(async (item) => {
            const appointmentID = Number(item?.appointmentID);
            if (!Number.isInteger(appointmentID) || appointmentID <= 0) return { appointmentID, checklist: [] };
            const response = await fetch(`/admin-api/appointments/${appointmentID}/progress`, { cache: "no-store" });
            const payload = await response.json().catch(() => null);
            if (!response.ok) return { appointmentID, checklist: [] };
            return { appointmentID, checklist: Array.isArray(payload?.checklist) ? payload.checklist : [] };
          }),
        );
        const checklistByAppointment = new Map(progressResults.map((item) => [item.appointmentID, item.checklist]));

        const applicantsWithProgress = confirmedApplicants.map((item) => {
          const person = getConductedPersonSummary(item, normalizeSpecialProgramSacramentalType(resolvedProgramName));
          const appointmentID = Number(item.appointmentID);
          return {
            appointmentID,
            requesterFullName: String(item?.requesterFullName || "").trim() || "Unknown Account",
            userID: item?.userID || item?.userId || "",
            createdAt: item?.createdAt || null,
            checklist: checklistByAppointment.get(appointmentID) || [],
            ...person,
          };
        });
        applicantsWithProgress.sort((left, right) =>
          String(left.requesterFullName || "").localeCompare(String(right.requesterFullName || "")),
        );

        const richestChecklist = applicantsWithProgress.reduce((best, applicant) => {
          const steps = normalizeChecklistSteps(applicant.checklist);
          return countChecklistTasks(steps) > countChecklistTasks(best) ? steps : best;
        }, []);

        const normalizedProgramName = resolvedProgramName.toLowerCase();
        const matchedTemplate = (Array.isArray(templatesData) ? templatesData : []).find((template) => {
          if (String(template?.scope || "") !== "special_sacrament" || template?.isActive === false) return false;
          return String(template?.specialSacramentName || "").trim().toLowerCase() === normalizedProgramName;
        });
        const templateSteps = normalizeChecklistSteps(matchedTemplate?.steps);
        const resolvedSteps = richestChecklist.length > 0 ? richestChecklist : templateSteps;
        const firstOpenStepIndex = resolvedSteps.findIndex((step, stepIndex) =>
          step.tasks.some(
            (_task, taskIndex) =>
              applicantsWithProgress.length === 0 ||
              applicantsWithProgress.some((applicant) => !isApplicantTaskDone(applicant, stepIndex, taskIndex)),
          ),
        );

        if (!isCancelled) {
          setApplicants(applicantsWithProgress);
          setChecklistSteps(resolvedSteps);
          setActiveStepIndex(firstOpenStepIndex === -1 ? 0 : firstOpenStepIndex);
        }
      } catch (error) {
        if (!isCancelled) {
          setApplicants([]);
          setChecklistSteps([]);
          setLoadError(error.message || "Unable to load the program checklist.");
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    void loadProgramChecklist();
    return () => {
      isCancelled = true;
    };
  }, [accountType, programID, user]);

  const safeActiveStepIndex = Math.min(Math.max(activeStepIndex, 0), Math.max(checklistSteps.length - 1, 0));
  const activeStep = checklistSteps[safeActiveStepIndex] || null;

  const taskCompletion = useMemo(() => {
    return checklistSteps.map((step, stepIndex) =>
      step.tasks.map((_task, taskIndex) => {
        const completedCount = applicants.filter((applicant) => isApplicantTaskDone(applicant, stepIndex, taskIndex)).length;
        return {
          completedCount,
          totalCount: applicants.length,
          allCompleted: applicants.length > 0 && completedCount === applicants.length,
        };
      }),
    );
  }, [applicants, checklistSteps]);

  const sharedCompletedCount = taskCompletion.reduce(
    (sum, step) => sum + step.filter((task) => task.allCompleted).length,
    0,
  );
  const sharedTotalCount = checklistSteps.reduce((sum, step) => sum + step.tasks.length, 0);
  const firstIncompleteStepIndex = taskCompletion.findIndex((step) => step.some((task) => !task.allCompleted));

  const saveApplicantTask = async (applicant, stepIndex, taskIndex, done, reason = "") => {
    const appointmentID = Number(applicant?.appointmentID);
    if (!Number.isInteger(appointmentID) || appointmentID <= 0) return { ok: false };
    const checklist = buildChecklistPayload(applicant, checklistSteps, stepIndex, taskIndex, done);
    const requestBody = { checklist };
    if (!done) {
      requestBody.taskUncheck = {
        stepIndex,
        taskIndex,
        stepTitle: checklistSteps[stepIndex]?.title || "",
        taskLabel: checklistSteps[stepIndex]?.tasks?.[taskIndex] || "",
        reason,
      };
    }
    const response = await fetch(`/admin-api/appointments/${appointmentID}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const responseData = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(responseData?.message || "Unable to update this applicant.");
    }
    const nextChecklist = Array.isArray(responseData?.checklist) ? responseData.checklist : checklist;
    setApplicants((current) =>
      current.map((item) => (item.appointmentID === appointmentID ? { ...item, checklist: nextChecklist } : item)),
    );
    return { ok: true };
  };

  const handleConfirmToggle = async () => {
    if (!pendingToggle) return;
    if (!pendingToggle.isNextChecked && uncheckReason.trim().length < 3) return;
    const target = pendingToggle;
    setSavingAppointmentIds((current) => [...current, target.appointmentID]);
    setSaveError("");
    try {
      await saveApplicantTask(
        applicants.find((item) => item.appointmentID === target.appointmentID),
        target.stepIndex,
        target.taskIndex,
        target.isNextChecked,
        uncheckReason.trim(),
      );
      setPendingToggle(null);
      setUncheckReason("");
      pushUiNotice(target.isNextChecked ? "Task marked complete for this applicant." : "Task unchecked for this applicant.");
    } catch (error) {
      setSaveError(error.message || "Unable to update this applicant.");
    } finally {
      setSavingAppointmentIds((current) => current.filter((id) => id !== target.appointmentID));
    }
  };

  const requestMarkAllApplicants = (stepIndex, taskIndex, label) => {
    if (isMarkingAll) return;
    const remaining = applicants.filter((applicant) => !isApplicantTaskDone(applicant, stepIndex, taskIndex)).length;
    if (remaining === 0) return;
    setPendingMarkAll({
      stepIndex,
      taskIndex,
      label: String(label || "").trim() || "this task",
      remaining,
    });
  };

  const handleConfirmMarkAll = () => {
    if (!pendingMarkAll || isMarkingAll) return;
    const target = pendingMarkAll;
    setPendingMarkAll(null);
    void handleMarkAllApplicants(target.stepIndex, target.taskIndex);
  };

  const handleMarkAllApplicants = async (stepIndex, taskIndex) => {
    const pendingApplicants = applicants.filter((applicant) => !isApplicantTaskDone(applicant, stepIndex, taskIndex));
    if (pendingApplicants.length === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    setSaveError("");
    const failures = [];
    for (const applicant of pendingApplicants) {
      setSavingAppointmentIds((current) => [...current, applicant.appointmentID]);
      try {
        await saveApplicantTask(applicant, stepIndex, taskIndex, true);
      } catch (error) {
        failures.push(error.message || applicant.requesterFullName);
      } finally {
        setSavingAppointmentIds((current) => current.filter((id) => id !== applicant.appointmentID));
      }
    }
    setIsMarkingAll(false);
    if (failures.length > 0) {
      setSaveError("Some applicants could not be updated. Try again for the ones still incomplete.");
      return;
    }
    pushUiNotice("Task marked complete for all applicants.");
  };

  if (!user || accountType !== "admin") return null;

  const handleLogout = () => {
    localStorage.removeItem("faithflow_auth");
    sessionStorage.removeItem("faithflow_auth");
    navigate("/login", { replace: true });
  };

  const selectedStepTitle = selectedTask ? checklistSteps[selectedTask.stepIndex]?.title || "" : "";
  const selectedStepLabel = selectedTask
    ? String(selectedStepTitle)
        .replace(new RegExp(`^step\\s*${selectedTask.stepIndex + 1}\\s*[:.\\-]?\\s*`, "i"), "")
        .trim()
    : "";
  const selectedTaskStats = selectedTask ? taskCompletion[selectedTask.stepIndex]?.[selectedTask.taskIndex] : null;
  const isSavingSelection = Boolean(selectedTask) && isMarkingAll;

  return (
    <main className="dashboard-layout">
      <Header
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(toggleSidebarOpen)}
        onProfile={() => navigate("/profile")}
        onLogout={handleLogout}
      />
      <div className="dashboard-body">
        <Sidebar isOpen={isSidebarOpen} variant="admin" />
        <section className="dashboard-main">
          <section className="dashboard-panel dashboard-hero progress-details-header">
            <div className="progress-details-hero-copy">
              <h2>Progress Checklist</h2>
              <p>Open a task to see which applicants completed it, or mark it done for everyone.</p>
            </div>
            <button
              type="button"
              className="progress-back-button progress-details-hero-action"
              onClick={() => navigate("/admin/progress-tracker")}
            >
              Back
            </button>
          </section>

          <section className="dashboard-panel progress-details-panel">
            {loadError ? (
              <p className="appointment-requests-empty">{loadError}</p>
            ) : isLoading ? (
              <p className="appointment-requests-empty">Loading checklist...</p>
            ) : (
              <>
                <header className="progress-main-header">
                  <div className="progress-main-header-copy">
                    <p className="progress-main-header-service-row">
                      <span className="progress-service-type-label">Service Type :</span>{" "}
                      <strong className="progress-service-name">{programName || "Special Sacrament"}</strong>
                      {sacramentalType ? <span className="progress-service-alias"> ({sacramentalType})</span> : null}
                    </p>
                    {checklistSteps.length > 0 ? (
                      <section className="progress-stepper-wrap progress-stepper-wrap--inline" aria-label="Progress steps">
                        <ol className="progress-stepper-row">
                          {checklistSteps.map((step, stepIndex) => {
                            const stepStats = taskCompletion[stepIndex] || [];
                            const isDone = stepStats.length > 0 && stepStats.every((task) => task.allCompleted);
                            const hasProgress = stepStats.some((task) => task.completedCount > 0);
                            const isOngoing = !isDone && (hasProgress || stepIndex === firstIncompleteStepIndex);
                            const stepStatusClass = isDone ? "is-done" : isOngoing ? "is-ongoing" : "is-not-started";
                            return (
                              <li key={`${step.title}-${stepIndex}`} className={`progress-stepper-item ${stepStatusClass}`}>
                                <button
                                  type="button"
                                  className={`progress-stepper-button ${safeActiveStepIndex === stepIndex ? "is-active" : ""}`}
                                  onClick={() => setActiveStepIndex(stepIndex)}
                                  aria-current={safeActiveStepIndex === stepIndex ? "step" : undefined}
                                >
                                  {stepIndex + 1}
                                </button>
                                {stepIndex < checklistSteps.length - 1 ? <span className="progress-stepper-line" aria-hidden="true" /> : null}
                              </li>
                            );
                          })}
                        </ol>
                        <div className="progress-stepper-legend" aria-hidden="true">
                          <span><i className="dot is-done" /> Done / Checked</span>
                          <span><i className="dot is-ongoing" /> Ongoing</span>
                          <span><i className="dot is-not-started" /> Not Started</span>
                        </div>
                      </section>
                    ) : null}
                  </div>
                </header>
                {saveError ? <p className="appointment-requests-empty">{saveError}</p> : null}

                <div className="progress-request-overview progress-request-overview--context" aria-label="Program overview">
                  <article className={`progress-request-overview-item program-applicants-menu${isApplicantsOpen ? " is-open" : ""}`}>
                    <button
                      type="button"
                      className="program-applicants-toggle"
                      onClick={() => setIsApplicantsOpen((current) => !current)}
                      aria-expanded={isApplicantsOpen}
                      aria-controls="program-applicants-list"
                    >
                      <span className="progress-request-overview-icon" aria-hidden="true">
                        <Users size={16} strokeWidth={2.2} />
                      </span>
                      <span className="progress-request-overview-copy">
                        <span className="progress-request-overview-label">Applicants</span>
                        <span className="progress-request-overview-value">
                          {applicants.length} {applicants.length === 1 ? "person" : "people"}
                        </span>
                      </span>
                      <ChevronDown size={16} className="program-applicants-chevron" aria-hidden="true" />
                    </button>
                    {isApplicantsOpen ? (
                      <ul id="program-applicants-list" className="program-applicants-dropdown">
                        {applicants.length === 0 ? (
                          <li className="program-applicants-empty">No approved applicants yet.</li>
                        ) : (
                          applicants.map((applicant, index) => (
                            <li key={applicant.appointmentID || `applicant-${index}`}>
                              <span className="program-applicants-index">{index + 1}</span>
                              <span>
                                <strong>{applicant.requesterFullName}</strong>
                                {applicant.conductedPersonValue && applicant.conductedPersonValue !== "Not provided" ? (
                                  <small>
                                    {applicant.conductedPersonLabel}: {applicant.conductedPersonValue}
                                  </small>
                                ) : null}
                                {applicant.userID ? <span className="program-applicants-id">User ID {applicant.userID}</span> : null}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </article>
                  <article className="progress-request-overview-item">
                    <span className="progress-request-overview-icon" aria-hidden="true">
                      <CalendarClock size={16} strokeWidth={2.2} />
                    </span>
                    <div className="progress-request-overview-copy">
                      <p className="progress-request-overview-label">Event Schedule</p>
                      <p className="progress-request-overview-value">
                        {eventSchedule ? formatDateTime(eventSchedule) : "Not scheduled yet"}
                      </p>
                    </div>
                  </article>
                  <article className="progress-request-overview-item is-metric">
                    <span className="progress-request-overview-icon" aria-hidden="true">
                      <CircleCheckBig size={16} strokeWidth={2.2} />
                    </span>
                    <div className="progress-request-overview-copy">
                      <p className="progress-request-overview-label">Completed By All</p>
                      <p className="progress-request-overview-value">
                        {sharedCompletedCount} / {sharedTotalCount}
                      </p>
                    </div>
                  </article>
                </div>

                {checklistSteps.length === 0 ? (
                  <section className="progress-empty-template-state" role="status" aria-live="polite">
                    <span className="progress-empty-template-icon" aria-hidden="true">
                      <AlertTriangle size={24} />
                    </span>
                    <h3>No steps available</h3>
                    <p>This special sacrament program has no checklist template yet.</p>
                    <button type="button" className="progress-secondary-button" onClick={() => navigate("/admin/progress-templates")}>
                      Add a Template
                    </button>
                  </section>
                ) : null}

                {applicants.length === 0 && checklistSteps.length > 0 ? (
                  <p className="appointment-requests-empty">No approved applicants yet. Tasks will list each applicant once requests are approved.</p>
                ) : null}

                {activeStep ? (
                  <article className="progress-step-card">
                    <header className="progress-step-header">
                      <div className="progress-step-heading">
                        <h3>
                          Step {safeActiveStepIndex + 1}: {String(activeStep.title || "").toUpperCase()}
                        </h3>
                      </div>
                    </header>
                    <ul className="progress-task-list program-task-list">
                      {activeStep.tasks.map((task, taskIndex) => {
                        const stats = taskCompletion[safeActiveStepIndex]?.[taskIndex] || {
                          completedCount: 0,
                          totalCount: applicants.length,
                          allCompleted: false,
                        };
                        return (
                          <li key={`${safeActiveStepIndex}-${taskIndex}`} className="program-task-row">
                            <button
                              type="button"
                              className={`progress-task-item program-task-open ${stats.allCompleted ? "is-checked" : ""}`}
                              onClick={() =>
                                setSelectedTask({
                                  stepIndex: safeActiveStepIndex,
                                  taskIndex,
                                  label: String(task || "").trim() || "Task",
                                })
                              }
                            >
                              <span className={`program-task-mark ${stats.allCompleted ? "is-checked" : ""}`} aria-hidden="true" />
                              <span className="progress-task-text">{task}</span>
                            </button>
                            <span className="program-task-count">
                              {stats.completedCount} / {stats.totalCount}
                            </span>
                            <button
                              type="button"
                              className={`progress-edit-button program-task-all-button ${stats.allCompleted ? "is-complete" : ""}`}
                              onClick={() => requestMarkAllApplicants(safeActiveStepIndex, taskIndex, task)}
                              disabled={stats.allCompleted || applicants.length === 0 || isMarkingAll}
                            >
                              {stats.allCompleted ? "All applicants completed" : "Mark all as done"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                ) : null}
              </>
            )}
          </section>
        </section>
      </div>

      {selectedTask ? (
        <div
          className="header-logout-overlay"
          role="presentation"
          onClick={() => {
            if (isSavingSelection || pendingToggle || pendingMarkAll) return;
            setSelectedTask(null);
          }}
        >
          <section
            className="program-task-applicants-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="program-task-applicants-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="program-task-applicants-header">
              <div>
                <p>
                  Step {selectedTask.stepIndex + 1}
                  {selectedStepLabel ? ` · ${selectedStepLabel}` : ""}
                </p>
                <h3 id="program-task-applicants-title">{selectedTask.label}</h3>
              </div>
              <button
                type="button"
                className="program-task-applicants-close"
                onClick={() => setSelectedTask(null)}
                aria-label="Close applicant list"
                disabled={isSavingSelection}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="program-task-applicants-body">
              <div className="program-task-applicants-actions">
              <p>
                <strong>{selectedTaskStats?.completedCount || 0}</strong> of {selectedTaskStats?.totalCount || 0} applicants completed this task.
              </p>
              <button
                type="button"
                className={`program-task-all-button ${selectedTaskStats?.allCompleted ? "is-complete" : ""}`}
                onClick={() => requestMarkAllApplicants(selectedTask.stepIndex, selectedTask.taskIndex, selectedTask.label)}
                disabled={!selectedTaskStats || selectedTaskStats.allCompleted || applicants.length === 0 || isMarkingAll}
              >
                {selectedTaskStats?.allCompleted ? "All applicants completed" : "Mark all as done"}
              </button>
              </div>
              {applicants.length === 0 ? (
              <p className="program-task-applicants-empty">No approved applicants yet.</p>
            ) : (
              <ul className="program-task-applicants-list">
                {applicants.map((applicant) => {
                  const isDone = isApplicantTaskDone(applicant, selectedTask.stepIndex, selectedTask.taskIndex);
                  const isSavingApplicant = savingAppointmentIds.includes(applicant.appointmentID);
                  return (
                    <li key={applicant.appointmentID}>
                      <label className={`program-task-applicant ${isDone ? "is-done" : ""}`}>
                        <input
                          type="checkbox"
                          checked={isDone}
                          disabled={isSavingApplicant || isMarkingAll}
                          onChange={(event) => {
                            setUncheckReason("");
                            setPendingToggle({
                              appointmentID: applicant.appointmentID,
                              applicantName: applicant.requesterFullName,
                              stepIndex: selectedTask.stepIndex,
                              taskIndex: selectedTask.taskIndex,
                              label: selectedTask.label,
                              isNextChecked: event.target.checked,
                            });
                          }}
                        />
                        <span>
                          <strong>{applicant.requesterFullName}</strong>
                          <small>
                            {applicant.conductedPersonLabel}: {applicant.conductedPersonValue}
                          </small>
                        </span>
                        <em>{isSavingApplicant ? "Saving..." : isDone ? "Completed" : "Not completed"}</em>
                      </label>
                      <button
                        type="button"
                        className="program-task-applicant-link"
                        onClick={() =>
                          navigate(`/admin/progress-tracker/${applicant.appointmentID}`, {
                            state: {
                              progressItem: {
                                ...applicant,
                                sacramentName: programName,
                                sacramentalType,
                                s_sacramentID: programID,
                              },
                              fromProgram: programID,
                            },
                          })
                        }
                      >
                        Open checklist
                      </button>
                    </li>
                  );
                })}
              </ul>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {pendingToggle ? (
        <div className="program-task-confirm-overlay" role="presentation" onClick={() => setPendingToggle(null)}>
          <section
            className="program-task-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="program-task-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="program-task-confirm-header">
              <span className="program-task-confirm-icon" aria-hidden="true">
                <AlertTriangle size={18} />
              </span>
              <div>
                <h3 id="program-task-confirm-title">
                  {pendingToggle.isNextChecked ? "Mark task as completed?" : "Uncheck task?"}
                </h3>
                <p>
                  {pendingToggle.isNextChecked ? "Mark" : "Remove completion for"} <strong>{pendingToggle.label}</strong> for{" "}
                  <strong>{pendingToggle.applicantName}</strong>.
                </p>
              </div>
            </header>
            {!pendingToggle.isNextChecked ? (
              <label className="program-task-confirm-reason">
                <span>Reason for unchecking</span>
                <textarea
                  value={uncheckReason}
                  onChange={(event) => setUncheckReason(event.target.value)}
                  placeholder="Explain why this task is being unchecked so the requester is informed."
                  rows={4}
                  maxLength={500}
                  autoFocus
                />
                <small>{uncheckReason.trim().length}/500 characters (minimum 3)</small>
              </label>
            ) : null}
            <div className="program-task-confirm-actions">
              <button type="button" className="is-secondary" onClick={() => setPendingToggle(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={handleConfirmToggle}
                disabled={!pendingToggle.isNextChecked && uncheckReason.trim().length < 3}
              >
                {pendingToggle.isNextChecked ? "Mark complete" : "Uncheck"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingMarkAll ? (
        <div className="program-task-confirm-overlay" role="presentation" onClick={() => setPendingMarkAll(null)}>
          <section
            className="program-task-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="program-task-mark-all-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="program-task-confirm-header">
              <span className="program-task-confirm-icon" aria-hidden="true">
                <CircleCheckBig size={18} />
              </span>
              <div>
                <h3 id="program-task-mark-all-title">Are you sure?</h3>
                <p>
                  Mark <strong>{pendingMarkAll.label}</strong> as done for{" "}
                  <strong>
                    {pendingMarkAll.remaining} {pendingMarkAll.remaining === 1 ? "applicant" : "applicants"}
                  </strong>{" "}
                  who have not completed it yet.
                </p>
              </div>
            </header>
            <div className="program-task-confirm-actions">
              <button type="button" className="is-secondary" onClick={() => setPendingMarkAll(null)}>
                Cancel
              </button>
              <button type="button" className="is-primary" onClick={handleConfirmMarkAll} disabled={isMarkingAll}>
                Mark all as done
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default AdminSpecialProgramProgress;
