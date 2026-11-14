# Faithflow Data Dictionary

This dictionary documents the tables created by backend bootstrap scripts in `server.js` (main app database) and `admin-server.js` (admin/auth database).

## Main App Database (`faithflow`)

### `app_migrations`
Stores one row per executed application migration so seed-cleanup and one-time schema tasks do not run repeatedly.
- `migration_key`: unique migration identifier.
- `metadata`: JSON payload with migration result details.
- `executedAt`: when the migration was recorded.

### `app_settings`
Stores application-wide JSON settings, including the global UI theme.
- `key`: setting identifier such as `global_theme_settings_v1`.
- `value`: JSON payload with theme colors (`primaryColor`, `secondaryColor`, `thirdColor`, `backgroundColor`, `containerColor`) and style options.

### `users`
Stores parish app user accounts and profile information.
- `userID`: primary key.
- `fullName`, `address`, `contactNumber`, `birthdate`, `gender`: user profile fields.
- `email`: optional, unique email login address. At least one of `email` or `contactNumber` is required to create an account.
- `contactNumber`: optional phone login number; when provided, it must be unique.
- `password`: hashed password. `POST /forgot-password` generates a new password and emails it to the account's email address, then stores the bcrypt hash. Accounts without an email address cannot use email-based password recovery.
- `photo`: filepath to the parishioner profile picture, stored as `/uploads/user-photos/{filename}`.
- `createdAt`, `updatedAt`: audit timestamps.

### `user_notifications`
Stores notifications delivered to users (system messages, reminders, status updates).
- `id`: primary key.
- `userID`: owner user reference.
- `type`, `title`, `body`, `severity`: notification content and category.
- `metadata`: structured extra details in JSON.
- `isRead`, `readAt`: read-state tracking.
- `createdAt`: creation timestamp.
- Common `type` values include `appointment_approved`, `appointment_declined`, `progress_schedule_updated`, `user_schedule_remark_reviewed`, and `progress_task_unchecked` (sent when a parish secretary unchecks a progress checklist task; `metadata` includes `appointmentID`, `taskLabel`, `stepTitle`, and `reason`).

### Progress checklist uncheck audit fields
When a secretary unchecks a task via `PATCH /appointments/:id/progress` with `taskUncheck`, the affected task object inside `progress_tracker.checklist_data` may store:
- `lastUncheckReason`: secretary-provided explanation shown to the requester.
- `lastUncheckedAt`: ISO timestamp of the uncheck action.

### `announcements`
Stores simple parish announcements shown in the app.
- `id`: primary key.
- `title`: announcement text/title.
- `date`: announcement date.

### `activities`
Stores parish activity/event posts.
- `id`: primary key.
- `title`: event title.
- `location`: event venue.
- `time`: human-readable event time text.
- `event_date`: activity date.

### `appointments`
Stores user-submitted sacrament and certificate requests and their processing status.
- `appointmentID`: primary key.
- `userID`: optional requester account reference.
- `sacramentID`, `s_sacramentID`: standard or special sacrament linkage.
- `progressID`: related progress tracker reference.
- `status`: appointment lifecycle state (`PENDING`, `CONFIRMED`, `CANCELLED`). Progress Tracker and Report Generation can cancel a confirmed appointment. The secretary confirms, then enters a reason stored in `note`. `finishedAt` is set, the linked priest calendar entry is removed, and the requester receives a notification. Progress Tracker lists those cancelled appointments and can restore them to `CONFIRMED` (`finishedAt` and `note` cleared, calendar recreated when a schedule still exists). The requester is notified when an appointment is restored.
- `cancelledFrom`: previous status at cancel time (`PENDING` or `CONFIRMED`). Progress Tracker cancelled list shows `CONFIRMED` cancellations. Declined Appointment Requests shows `PENDING` cancellations. Cleared on restore.
- `adminID`: admin owner/reviewer ID.
- `priestID`: single assigned priest for this appointment, used for Marriage, Funeral Mass, Baptism, Blessing, and any later sacrament type. User Status, user History, and Progress APIs return `priestName` from `priests.fullName`. Secretaries change the assignment only through Set / Change Date & Time.
- `requesterFullName`: snapshot of requester name.
- `requestType`: request category (`Appointment` or `Certificate`).
- `credentials`: dynamic request payload in JSON. Progress Tracker and appointment APIs read conducted-person fields from this payload: `groomName`/`brideName` (Marriage), `childFullName` (Baptism/Christening/Binyagan), `deceasedName` (Funeral Mass), and `blessingType`/`blessingTarget` (Blessing: home, car, or business). Marriage appointments store separate `brideAddress` and `groomAddress` values. Funeral Mass appointments store `deceasedAddress` for the deceased person (legacy records may still include a shared `address`). The final event schedule is also stored here as `scheduledEventDateTime` (ISO timestamp) when the secretary assigns a priest and date/time. Calendar rows are created only when `appointments.priestID` and this credential schedule are both present.
- `note`: free-form admin/request note. For cancelled appointments this stores the cancellation reason shown to the requester.
- `createdAt`, `finishedAt`: submission and completion timestamps. Admin dashboard Ongoing Appointments uses the same rule as Progress Tracker: `status = CONFIRMED`, `finishedAt` is null, not archived, and not a certificate (`GET /dashboard/stats`). Checklist `eventDone` does not remove an appointment from Ongoing. Index: `idx_appointments_admin_status_finished`.
- Report Generation (`GET /reports/records`) returns one appointment-records list. Appointment status is Ongoing (still in checklist / not fully paid and scheduled), Completed (final step saved, paid, and scheduled, including appointments still waiting for the event time), or Cancelled (`appointments.status` = `CANCELLED`). Filters also include date range, appointment type, payment status, and newest/oldest sort.

### `appointment_review_states`
Stores per-admin review markers for each appointment (viewed/under-review flags by timestamp).
- `appointmentID`, `adminID`: composite primary key.
- `viewedAt`: first/last viewed timestamp.
- `underReviewAt`: when marked as under review.
- `updatedAt`: last state update time.

### `admin_notifications` (main DB)
Stores notifications addressed to admin users inside the main app data domain.
- `id`: primary key.
- `adminID`: target admin ID.
- `type`, `title`, `body`, `severity`: notification content and urgency.
- `isRead`, `readAt`: read-state tracking.
- `createdAt`: creation timestamp.

### `admin_directory`
Stores lightweight admin registry data needed by the main database (without auth secrets).
- `adminID`: primary key.
- `createdAt`: row creation timestamp.
- `religiousOrderOptions`: JSON configuration for religious order options shown in priest management.

### `cert_request`
Stores certificate request envelopes and links to the specific marriage/baptism certificate detail rows.
- `certID`: primary key.
- `userID`: requesting user (nullable).
- `adminID`: handling admin (nullable).
- `marr_certID`, `bapt_certID`: optional pointers to detail tables (mutually exclusive).
- `status`: certificate workflow state (`Pending`, `Approved`, `Completed`, `Cancelled`).
- `pickupDate`, `pickupTime`: pickup scheduling fields. `pickupDate` cannot fall on the parish office day off from `recurring_day_offs` (weekly weekday, 0-6) or `day_off_dates` (specific closed dates).
- `created_at`, `updatedAt`: audit timestamps.

### `marriage_cert`
Stores detailed data required for marriage certificate processing.
- `marr_certID`: primary key.
- `certRequestID`: unique certificate request reference.
- `groomFullName`, `brideFullName`: principal names.
- `groomAge`, `brideAge`: age fields with positive checks.
- `groomPhoneNumber`, `bridePhoneNumber`: contact numbers.
- `dateOfMarriage`, `address`: marriage date and address.

### `baptismal_cert`
Stores detailed data required for baptismal certificate processing.
- `bapt_certID`: primary key.
- `certRequestID`: unique certificate request reference.
- `childFullName`, `dateOfBaptism`: child identity and sacrament date.
- `fatherName`, `motherName`: parent names.
- `phoneNumber`, `address`: contact/address fields.

### `sacraments`
Stores the canonical list of sacrament types and optional dynamic form definitions.
- `sacramentID`: primary key.
- `sacramentName`: unique sacrament label.
- `form_schema`: JSON schema-like field definition.
- `requirements`: JSON requirements metadata.
- `schema_aliases`: JSON aliases/synonym metadata.
- `residentFee`: optional `NUMERIC(10,2)` fee in pesos for Villanueva residents, shown as a payment preview on the appointment requirements step (defaults: Marriage 5000, Baptism 3000, Funeral Mass 3000).
- `nonResidentFee`: optional `NUMERIC(10,2)` fee in pesos for non-residents (defaults: Marriage 5000, Baptism 5000, Funeral Mass 3000).

### `certificate_type` (fee)
- `fee`: optional `NUMERIC(10,2)` certificate request fee in pesos, shown as a payment preview on the certificate request form (defaults: Baptismal Certificate 100, Confirmation Certificate 100).

### `special_sacraments`
Stores schedule-bound special sacramental program offerings.
- `s_sacramentID`: primary key.
- `s_sacramentName`: program name.
- `maxSlots`: slot capacity.
- `timeDate`: scheduled datetime for the shared program event. The parish calendar uses this as the event date and start time for the linked `calendar_entries` pointer row. Progress Tracker inherits this as `scheduledEventDateTime` for every applicant.
- Calendar color is defined in frontend code (`SPECIAL_SACRAMENT_CALENDAR_COLOR` / `.is-special`), not stored here.
- `priestID`: optional foreign key to `priests.priestID` for the priest assigned to the program. Constraint: `fk_special_sacrament_priest` (`ON DELETE SET NULL`). The calendar resolves the priest from this column, not from `calendar_entries.priestID`.
- `currentAppliedCount`: current number of applicants.

### `priests`
Stores clergy records assignable to appointments and calendar schedules.
- `priestID`: primary key.
- `fullName`: priest full name.
- `adminID`: admin owner/tenant ID.
- `password`: priest credential hash (when priest login is enabled). `POST /forgot-password` emails a generated password to this Gmail and updates the hash.
- `clergyType`: priest type (`DIOCESAN` or `RELIGIOUS`).
- `religiousOrderCode`: required only for `RELIGIOUS` clergy type.
- `photo`: filepath to the priest profile picture, stored as `/uploads/priest-photos/{filename}`.
- `isActive`: priest account availability. `true` shows that priest's calendar entries. `false` hides them from live calendar queries without deleting the rows. Activating the priest shows those entries again and recreates any missing confirmed appointment schedules. Inactive priests cannot log in or receive new calendar assignments.

### `priest_notifications`
Stores bell notifications for priest accounts.
- `priestNotifID`: primary key (renamed from `id`).
- `priestID`, `type`, `title`, `body`, `severity`, `metadata`, `isRead`, `createdAt`, `readAt`.
- `priest_schedule_hold`: sent when the parish office reverses payment on a scheduled appointment. The calendar row is removed. The message explains that the parish office temporarily withdrew the schedule from the priest calendar; it does not say the appointment is unpaid. `metadata.path` is `/priest/dashboard`.
- `priest_schedule_restored`: sent when payment is recorded again and the appointment is placed back on the priest calendar. `metadata.path` is `/priest/dashboard`.
- `user_schedule_remark`: sent when a requester submits a preferred schedule. The currently assigned priest is notified. If a different priest was chosen, that preferred priest is also notified. This is a request for parish review, not a confirmed assignment.

### `priest_mailer_settings`
Stores the parish Gmail that sends priest welcome/password emails. Updated when the parish secretary changes Email on Profile.
- `settings_key`: single-row key (`default`).
- `sender_email`, `smtp_user`: live Gmail sender address.
- `smtp_pass`: Gmail App Password for that sender.
- `createdAt`, `updatedAt`: audit timestamps.

### `progress_templates`
Stores reusable checklist templates for either standard sacraments or special sacrament programs.
- `templateID`: primary key.
- `scope`: template scope (`sacrament` or `special_sacrament`).
- `sacramentID`: target sacrament when scope is `sacrament`.
- `specialTemplateKey`: target key when scope is `special_sacrament`.
- `templateName`: display name.
- `isActive`: active/inactive flag.
- `createdAt`, `updatedAt`: audit timestamps.

### `progress_template_steps`
Stores ordered checklist steps under a progress template.
- `stepID`: primary key.
- `templateID`: parent template reference.
- `stepOrder`: sequence order inside template.
- `title`: step label.
- `tasks`: JSON array of task items.
- `isActive`: active/inactive flag.
- `createdAt`, `updatedAt`: audit timestamps.

### `progress_tracker`
Stores appointment-specific checklist execution state derived from templates.
- `progressID`: primary key.
- `appointmentID`: unique appointment reference.
- `templateID`: template used to initialize checklist (nullable).
- `checklist_data`: JSON array of step/task completion state.
- `eventDone`: set automatically when a paid, fully checked, scheduled appointment is promoted to history after the event date and time have passed. There is no Final Step button. Until that time the appointment stays on Progress Tracker / User Status.
- Progress APIs expose `finalDetails.conductedPriestID` and `finalDetails.priestName` from `appointments.priestID` and `priests.fullName`. There is no separate conducted-priest column.
- `giftAmount`: legacy payment total. New payment records mark the appointment paid with an invoice number and do not require an amount.
- `paymentRecords`: JSON array of secretary-recorded payment entries (`invoiceNumber`, `receiptFileUrl`, `receiptFileName`, `recordedAt`, `recordedAtStep`, `recordedByAdminID`). Populated via `POST /appointments/:id/progress/payment-records`. Invoice number and receipt stay in this office record only. Progress Tracker and user Status show Paid or Unpaid, not the invoice number. Receipt upload is optional. Older records may still include `amount` and `notes`.
- `paymentStatus`: `paid`, `unpaid`, or `free`. Special sacrament program applicants are stored as `free` because those programs do not collect a fee. Regular appointments become `paid` when a payment is recorded through Progress Tracker. Report Generation can filter by Paid, Unpaid, or Free.
- `createdAt`, `updated_at`: audit timestamps.

### `appointment_schedule_remarks`
Stores requester remarks after the parish office sets a date, time, and priest on a paid, fully checked Progress Tracker appointment.
- `remarkID`: primary key.
- `appointmentID`, `userID`: appointment and requester.
- `decision`: `accepted` (I'm okay with that scheduled) or `preferred` (requester chose another open priest slot).
- `message`: requester note. Default accept text is `I'm okay with that scheduled.`
- `preferredDate`, `preferredTime`, `preferredPriestID`: optional preferred slot. The API only accepts a 1-hour parish slot that does not overlap another calendar entry for that priest.
- `currentScheduledEventDateTime`, `currentPriestID`: the parish schedule at the time the remark was sent.
- `status`: `pending` or `reviewed`. One pending remark per appointment (partial unique index).
- `reviewedByAdminID`, `reviewedAt`, `adminDecision`: secretary review (`kept` or `updated` when the preferred slot is applied).
- APIs: `GET/POST /appointments/:id/schedule-remarks`, `PATCH /appointments/:id/schedule-remarks/:remarkID/review`, `GET /appointments/:id/preferred-slots` (`date=YYYY-MM-DD` for slots, `month=YYYY-MM` for the color-coded priest calendar with 5-day lock, day offs, and existing events).
- Notifications: admin `user_schedule_remark` opens the Progress Tracker appointment; user `user_schedule_remark_reviewed` opens Status details.

### `calendar_entries`
Stores parish calendar events and priest schedule entries.
- `id`: primary key.
- `title`: event title.
- `schedule_type`: entry type (`parish_event` or `priest_schedule`).
- `event_date`, `start_time`, `end_time`: schedule timing fields. Parish events and priest schedules use the same 1-hour parish slots (8-9 AM through 4-5 PM, lunch 12-1) and the same priest calendar / 5-day lock as Progress Tracker.
- `location`: required for `priest_schedule` because those events are held outside the parish. Always stored as null for `parish_event` because those are held at the current parish. Appointment-generated priest schedules keep a service label such as `Parish Schedule`.
- `notes`: contextual details.
- `s_sacramentID`: optional linked special sacrament. When set and `appointmentID` is null, the entry is a pointer to that program. Title, event_date, start_time, end_time, location, notes, and priestID stay null on this row. The calendar reads name, date, time, and priest from `special_sacraments` (`s_sacramentName`, `timeDate`, `priestID`). The calendar paints special programs with the code-only lavender class (`#C4B5FD`).
- `priestID`: required for parish events and priest schedules. The assigned priest's existing calendar entries (appointments and parish events) block overlapping 1-hour slots.
- `priestName`: resolved from `priests.fullName` when the calendar API returns an entry.
- `adminID`: admin owner/tenant ID.
- `appointmentID`: optional foreign key to `appointments.appointmentID`. An appointment is copied onto `calendar_entries` only when it is paid (or a free special program), has an assigned `priestID`, and has a final schedule in `appointments.credentials` (`scheduledEventDateTime` or `finalSchedule`). Title, date, time, priest, location, and this FK are written from that appointment. Clearing the priest, clearing the credential schedule, marking the appointment unpaid, or cancelling it removes the calendar row. Null for regular parish events and priest schedules. Constraint: `fk_calendar_entry_appointment` (`ON DELETE SET NULL`). Unique index: `calendar_entries_appointment_unique`.
- `created_at`, `updated_at`: audit timestamps. Priest Assigned Appointments filters by `schedule_type` (`parish_event` or `priest_schedule`) and sorts by `created_at` latest-to-oldest or oldest-to-latest (`GET /priest/me/assigned-schedules?type=&sort=`). Indexes: `idx_calendar_entries_priest_created_at`, `idx_calendar_entries_priest_type_created_at`. The API returns `assignedAt`, raw `scheduleType`, and `typeLabel` (`Parish Event` or `Priest Schedule`).
- Priest remarks (`priest_schedule_remarks`) attach to a calendar entry. The Priest Management remarks API returns the remark plus linked appointment requester and sacrament name when `calendar_entries.appointmentID` matches `appointments.appointmentID`. Unreviewed remarks are listed first.

### `recurring_day_offs`
Stores weekly recurring day-off rules per admin (for scheduling blackout logic and certificate pickup dates).
- `id`: primary key.
- `weekday`: day index (0-6).
- `adminID`: admin owner/tenant ID.
- `created_at`: creation timestamp.

### `recurring_half_days`
Stores one weekly half-day rule per admin (the parish is open only part of that day). Defaults to Sunday 08:00-12:00.
- `adminID`: primary key, admin owner/tenant ID.
- `weekday`: day of week (0 = Sunday ... 6 = Saturday). Cannot be the same as the `recurring_day_offs` weekday.
- `startTime`, `endTime`: open hours. Appointment slots outside this window are unavailable on that weekday, and office status shows closed outside it.
- `isEnabled`: `FALSE` when the admin removes the half day (kept so the default is not re-seeded on restart).
- `updatedAt`: last change timestamp.

### `day_off_dates`
Stores one-off date-specific blackout days per admin.
- `dayOffID`: primary key.
- `dayOffDate`: specific blocked date.
- `adminID`: admin owner/tenant ID.
- `createdAt`: creation timestamp.

## Admin/Auth Database (`faithflow_admin`)

### `admin_account`
Stores the single fixed admin identity profile and credential hash.
- `adminID`: constrained to one fixed admin row (`1`).
- `userName`, `email`: login identifiers. `email` is also the live Gmail sender for priest password emails.
- `fullName`, `address`, `contactNumber`, `parishName`, `photo`: admin profile.
- `password`: bcrypt password hash.
- `createdAt`, `updatedAt`: audit timestamps.
- Local developer recovery: run `npm run reset-admin-password` from `backend/`. The command prompts for a new password without echoing it, refuses production mode, and only allows remote database hosts when `ADMIN_RESET_ALLOW_REMOTE=true`.

### `admin_sessions`
Stores admin login sessions/tokens and lifecycle metadata.
- `id`: UUID primary key.
- `adminID`: fixed admin reference.
- `sessionToken`: unique auth token.
- `ipAddress`, `userAgent`: request fingerprint data.
- `createdAt`, `expiresAt`, `revokedAt`, `lastSeenAt`: session lifecycle timestamps.

### `admin_audit_logs`
Stores security/audit events for privileged admin actions.
- `id`: primary key.
- `adminID`: admin actor ID.
- `action`: action name.
- `targetType`, `targetID`: optional target entity descriptor.
- `metadata`: structured details in JSON.
- `ipAddress`, `userAgent`: request fingerprint fields.
- `createdAt`: event timestamp.

### `admin_login_attempts`
Stores login attempt traces used for monitoring and troubleshooting auth behavior.
- `id`: primary key.
- `credential`: attempted username/email value.
- `wasSuccessful`: success/failure marker.
- `failureReason`: optional reason for failed attempts.
- `ipAddress`, `userAgent`: request fingerprint fields.
- `createdAt`: event timestamp.

### `admin_settings`
Stores key-value JSON settings managed by admin controls.
- `key`: primary key setting name.
- `value`: JSON setting payload.
- `updatedAt`: last update timestamp.
- `updatedByAdminID`: admin ID that last updated setting.

### `admin_notifications` (admin DB)
Stores admin-facing notifications in the admin/auth service domain.
- `id`: primary key.
- `type`, `title`, `body`, `severity`: notification content. Common types include `appointment_request` and `certificate_request`.
- `metadata`: JSON click-through data. Certificate request notices store `path` (`/admin/certificate-requests?certID=`) and `certID`.
- `isRead`, `readAt`: read-state tracking.
- `createdAt`: creation timestamp.

### `admin_api_keys`
Stores API key metadata and revocation state for admin integrations.
- `id`: primary key.
- `adminID`: fixed admin reference.
- `name`: key label.
- `keyPrefix`: visible key prefix for identification.
- `keyHash`: full hashed key material.
- `isActive`: active/revoked status flag.
- `createdAt`, `lastUsedAt`, `revokedAt`: key lifecycle timestamps.

## Legacy/Compatibility Tables (may exist depending on environment history)

The admin bootstrap also contains compatibility schema for older appointment flows. If present, these tables usually sit beside the newer normalized structures:

### `marriage_appointments`
Stores legacy marriage appointment form details attached to one appointment row.
- `id`: primary key.
- `appointmentID`: unique parent appointment reference.
- `brideName`, `groomName`: principal names.
- `brideAge`, `groomAge`: positive age fields.
- `bridePhoneNumber`, `groomPhoneNumber`, `phoneNumber`: contact fields.
- `brideBirthCertificateFileUrl`, `brideBirthCertificateFileName`: bride file metadata.
- `groomBirthCertificateFileUrl`, `groomBirthCertificateFileName`: groom file metadata.
- `address`: requester address.
- `createdAt`, `updatedAt`: audit timestamps.

### `baptism_appointments`
Stores legacy baptism appointment form details attached to one appointment row.
- `id`: primary key.
- `appointmentID`: unique parent appointment reference.
- `childFullName`, `childBirthDate`: child details.
- `fatherName`, `motherName`: parent names.
- `address`, `phoneNumber`: contact fields.
- `createdAt`, `updatedAt`: audit timestamps.

### `death_mass_appointments`
Stores legacy death mass appointment form details attached to one appointment row.
- `id`: primary key.
- `appointmentID`: unique parent appointment reference.
- `deceasedName`, `dateOfDeath`: deceased details.
- `familyContactName`, `relationToDeceased`: requester family contact details.
- `address`, `phoneNumber`: contact fields.
- `createdAt`, `updatedAt`: audit timestamps.

### `blessing_appointments`
Stores legacy blessing appointment form details attached to one appointment row.
- `id`: primary key.
- `appointmentID`: unique parent appointment reference.
- `blessingType`, `blessingTarget`: blessing classification and target.
- `address`, `phoneNumber`: contact fields.
- `createdAt`, `updatedAt`: audit timestamps.

### `steps`
Stores legacy checklist steps tied to a progress tracker (pre-template model).
- `stepID`: primary key.
- `stepName`: step label.
- `progressID`: parent progress tracker reference.
- `isDone`: completion status.
- `stepOrder`: order in checklist sequence.
- `completedAt`: completion timestamp.
