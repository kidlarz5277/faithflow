import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import { enableGlobalTitleCaseInputs } from "./utils/autoTitleCaseInputs";
import { startParishClock } from "./utils/parishClock";
import { installSessionLogoutBridge } from "./utils/sessionLogout";
import {
  fetchAccountTextStyle,
  fetchGlobalThemeSettings,
  getStoredGlobalThemeSettings,
  initializeSystemThemeSync,
  parseStoredSettings,
  readSignedInTextStyleAccount,
  saveAppSettings,
  setStoredGlobalThemeSettings,
  withThemeSettings,
} from "./utils/appSettings";
import "./index.css";
import "./dark-theme.css";

const UserParishDashboard = lazy(() => import("./pages/UserParishDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminSectionPage = lazy(() => import("./pages/AdminSectionPage"));
const AdminAppointmentRequests = lazy(() => import("./pages/AdminAppointmentRequests"));
const AdminDeclinedAppointments = lazy(() => import("./pages/AdminDeclinedAppointments"));
const AdminDeclinedCertificates = lazy(() => import("./pages/AdminDeclinedCertificates"));
const AdminProgressTracker = lazy(() => import("./pages/AdminProgressTracker"));
const AdminSpecialProgramProgress = lazy(() => import("./pages/AdminSpecialProgramProgress"));
const AdminProgressDetails = lazy(() => import("./pages/AdminProgressDetails"));
const AdminProgressTemplates = lazy(() => import("./pages/AdminProgressTemplates"));
const AdminSacramentRequirements = lazy(() => import("./pages/AdminSacramentRequirements"));
const AdminSacramentArchive = lazy(() => import("./pages/AdminSacramentArchive"));
const AdminSpecialSacramentRequirements = lazy(() => import("./pages/AdminSpecialSacramentRequirements"));
const AdminPriestManagement = lazy(() => import("./pages/AdminPriestManagement"));
const AdminSpecialProgramsPage = lazy(() => import("./pages/AdminSpecialProgramsPage"));
const AdminCertificateRequests = lazy(() => import("./pages/AdminCertificateRequests"));
const AdminCertificateTypes = lazy(() => import("./pages/AdminCertificateTypes"));
const AdminCertificateTypeArchive = lazy(() => import("./pages/AdminCertificateTypeArchive"));
const AdminHistoryPage = lazy(() => import("./pages/AdminHistoryPage"));
const AdminReportsPage = lazy(() => import("./pages/AdminReportsPage"));
const AdminAdHocPage = lazy(() => import("./pages/AdminAdHocPage"));
const PriestDashboard = lazy(() => import("./pages/PriestDashboard"));
const PriestAssignedAppointments = lazy(() => import("./pages/PriestAssignedAppointments"));
const PriestHistoryPage = lazy(() => import("./pages/PriestHistoryPage"));
const Profile = lazy(() => import("./pages/Profile"));
const UserSectionPage = lazy(() => import("./pages/UserSectionPage"));
const UserHistoryPage = lazy(() => import("./pages/UserHistoryPage"));
const UserStatusPage = lazy(() => import("./pages/UserStatusPage"));
const UserProgressDetails = lazy(() => import("./pages/UserProgressDetails"));
const UserCancelledAppointmentsPage = lazy(() => import("./pages/UserCancelledAppointmentsPage"));
const AdminCancellationRequestsPage = lazy(() => import("./pages/AdminCancellationRequestsPage"));
const UserSettingsPage = lazy(() => import("./pages/UserSettingsPage"));
const FaqPage = lazy(() => import("./pages/FaqPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));

enableGlobalTitleCaseInputs();
installSessionLogoutBridge();
const bootstrapAppSettings = async () => {
  const localSettings = parseStoredSettings();
  let globalTheme = getStoredGlobalThemeSettings();
  try {
    globalTheme = await fetchGlobalThemeSettings();
    setStoredGlobalThemeSettings(globalTheme);
  } catch (error) {
    console.warn("Unable to sync global theme settings. Using cached theme.", error);
  }
  const mergedSettings = withThemeSettings(localSettings, globalTheme);
  const textStyleAccount = readSignedInTextStyleAccount();
  if (textStyleAccount) {
    try {
      mergedSettings.textStyle = await fetchAccountTextStyle(textStyleAccount);
    } catch (error) {
      console.warn("Unable to load this account's text style.", error);
    }
  } else {
    mergedSettings.textStyle = "poppins";
  }
  saveAppSettings(mergedSettings);
};
bootstrapAppSettings();
initializeSystemThemeSync();

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/about" replace />} />
        <Route path="/about" element={<App initialPage="about" />} />
        <Route path="/faqs" element={<FaqPage role="user" isPublic />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/login" element={<App initialPage="login" />} />
        <Route path="/dashboard" element={<UserParishDashboard />} />
        <Route path="/dashboard/parish/:parishId" element={<UserParishDashboard />} />
        <Route
          path="/dashboard/request-certificate"
          element={
            <UserSectionPage
              title="Request Certificate"
              description="Submit a certificate request for your selected parish."
            />
          }
        />
        <Route path="/dashboard/status" element={<UserStatusPage />} />
        <Route path="/dashboard/status/cancelled" element={<UserCancelledAppointmentsPage />} />
        <Route path="/dashboard/status/:appointmentId" element={<UserProgressDetails />} />
        <Route path="/dashboard/history" element={<UserHistoryPage />} />
        <Route path="/dashboard/settings" element={<UserSettingsPage />} />
        <Route path="/dashboard/faqs" element={<FaqPage role="user" />} />
        <Route path="/priest/faqs" element={<FaqPage role="priest" />} />
        <Route path="/admin/faqs" element={<FaqPage role="admin" />} />
        <Route path="/priest/dashboard" element={<PriestDashboard />} />
        <Route path="/priest/assigned-appointments" element={<PriestAssignedAppointments />} />
        <Route path="/priest/history" element={<PriestHistoryPage />} />
        <Route path="/priest/settings" element={<UserSettingsPage />} />
        <Route path="/admin/settings" element={<UserSettingsPage />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route
          path="/admin/appointment-requests"
          element={<AdminAppointmentRequests />}
        />
        <Route path="/admin/appointment_requests" element={<Navigate to="/admin/appointment-requests" replace />} />
        <Route path="/admin/declined-appointments" element={<AdminDeclinedAppointments />} />
        <Route path="/admin/declined-certificates" element={<AdminDeclinedCertificates />} />
        <Route path="/admin/appointment-trash" element={<Navigate to="/admin/declined-appointments" replace />} />
        <Route
          path="/admin/approved-appointments"
          element={
            <AdminSectionPage
              title="Approved Appointments"
              description="View all approved appointments and monitor upcoming schedules."
            />
          }
        />
        <Route
          path="/admin/history"
          element={<AdminHistoryPage />}
        />
        <Route path="/admin/reports" element={<AdminReportsPage />} />
        <Route path="/admin/reports/ad-hoc" element={<AdminAdHocPage />} />
        <Route
          path="/admin/priest-management"
          element={<AdminPriestManagement />}
        />
        <Route path="/admin/special-programs" element={<AdminSpecialProgramsPage />} />
        <Route
          path="/admin/progress-tracker"
          element={<AdminProgressTracker />}
        />
        <Route path="/admin/progress-tracker/cancellation-requests" element={<AdminCancellationRequestsPage />} />
        <Route
          path="/admin/progress-tracker/program/:sSacramentId"
          element={<AdminSpecialProgramProgress />}
        />
        <Route
          path="/admin/progress-tracker/:appointmentId"
          element={<AdminProgressDetails />}
        />
        <Route
          path="/admin/progress-templates"
          element={<AdminProgressTemplates />}
        />
        <Route
          path="/admin/sacrament-form-schemas"
          element={<AdminSacramentRequirements />}
        />
        <Route
          path="/admin/sacrament-form-schemas/archive"
          element={<AdminSacramentArchive />}
        />
        <Route
          path="/admin/special-sacrament-form-schemas"
          element={<AdminSpecialSacramentRequirements />}
        />
        <Route
          path="/admin/certificate-requests"
          element={<AdminCertificateRequests />}
        />
        <Route
          path="/admin/certificate-types"
          element={<AdminCertificateTypes />}
        />
        <Route
          path="/admin/certificate-types/archive"
          element={<AdminCertificateTypeArchive />}
        />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </Suspense>
  );
}

startParishClock();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </React.StrictMode>
);
