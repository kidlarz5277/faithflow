const ACCOUNT_HELP_USER = {
  id: "account",
  title: "Account & Settings",
  items: [
    {
      question: "How do I log in?",
      answer: [
        "Create an account with both your Gmail address and phone number. Then log in with either one, plus your password. Tick Remember me if you are on your own device.",
      ],
    },
    {
      question: "I forgot my password. What should I do?",
      answer: [
        "On the login page, choose Forgot password and click Send new password. Admins must enter the registered Gmail address; users and priests can enter their Gmail address or phone number.",
        "A new temporary password is sent to the registered contact method. You can request one password reset in any 24-hour period. Email and SMS requests share the same limit, and each successful request counts once. After logging in, use Change Password on your Profile to set a new one.",
      ],
    },
    {
      question: "How do I update my personal information?",
      answer: [
        "Open the profile icon at the top right and choose Profile. You can edit your full name, email, contact number, gender, birthdate, address, and profile photo.",
      ],
    },
    {
      question: "Can I change the language or text style?",
      answer: [
        "Yes. Open Settings from the profile menu. Under App Preferences you can choose the language (English, Tagalog, or Bisaya), the text style, and the date format, then click Save.",
        "The light or dark theme is set by the parish office for everyone.",
      ],
    },
    {
      question: "Where do I see updates about my requests?",
      answer: [
        "The bell icon at the top right shows your notifications, such as approvals, schedule updates, and declined requests. The red badge shows how many are unread. Use Mark all read to clear them.",
      ],
    },
  ],
};

const userFaq = {
  intro: "Answers to common questions about booking sacraments, tracking your requests, payments, and certificates.",
  footer: "Still need help? Visit or contact the parish office during office hours. The Office Open or Closed label on your dashboard shows if the office is open today.",
  categories: [
    {
      id: "appointments",
      title: "Appointments",
      items: [
        {
          question: "How do I book a sacrament appointment?",
          answer: [
            "On your Dashboard, click Make Appointment. Choose the appointment type, read the sacrament requirements, fill in the details form, review your request, then click Submit.",
            "You can add an optional note (up to 600 characters) for the parish office.",
          ],
        },
        {
          question: "Do I choose the date and priest when I book?",
          answer: [
            "No. You only submit the request. After the parish office approves it, they set the schedule and assign the priest. You will see the schedule on your Status page once it is set.",
          ],
        },
        {
          question: "How far ahead should I book?",
          answer: [
            "Schedules are set at least 5 days ahead. Funeral Mass can be scheduled 1 day ahead.",
            "Appointment times are 1-hour slots from 4:00 AM to 12:00 PM and from 1:00 PM to 5:00 PM. Day offs, half days, and times when the priest is not available cannot be booked.",
          ],
        },
        {
          question: "Do I need to upload documents?",
          answer: [
            "Some forms have file fields where you can attach PDF, DOCX, or image files. For sacraments such as Marriage and Baptism, the requirements screen lists the documents you must bring to the parish office in person.",
          ],
        },
        {
          question: "Can I cancel my appointment?",
          answer: [
            "Yes. Open the appointment from your Status page, click Cancel Appointment at the bottom of its progress tracker, give your reason (required), and confirm. The parish office must approve it first; until then your appointment stays active and you can withdraw the request.",
            "If approved, the appointment is cancelled and saved in your History tagged as Cancelled. If declined, it stays active and you are told why.",
          ],
        },
        {
          question: "Can I bring back a cancelled appointment?",
          answer: [
            "Click Cancelled Appointments on your Status page, then Restore Appointment. This also needs the parish office's approval. Once approved, the appointment returns to your Status page.",
            "An appointment can no longer be restored once its scheduled date has passed.",
          ],
        },
      ],
    },
    {
      id: "status",
      title: "Status & Progress",
      items: [
        {
          question: "What do the statuses mean?",
          answer: [
            "Pending: your request is waiting for the parish office to review it.",
            "Ongoing: your request was approved and is being processed. You can follow the requirement steps.",
            "Completed: the sacrament or request is finished.",
            "Declined: the request was not approved. The reason is shown on the card.",
          ],
        },
        {
          question: "Why was my request declined?",
          answer: [
            "Open the declined card on your Status page to read the reason, such as requirements not met, wrong file attached, incomplete information, or a duplicate request. You can submit a new, corrected request.",
          ],
        },
        {
          question: "How do I follow my requirements?",
          answer: [
            "Go to Status and open an Ongoing card. The checklist shows each requirement step. The parish office marks steps as done after checking them, so the checklist is view-only for you.",
          ],
        },
      ],
    },
    {
      id: "schedule",
      title: "Schedule Requests",
      items: [
        {
          question: "Can I ask for a different date, time, or priest?",
          answer: [
            "Yes, once. When your schedule details are complete, open View Full Schedule Details and choose Request a preferred date, time, and priest. Pick the priest, date, and time slot, then confirm with Yes, send request.",
            "Each appointment allows only one preferred schedule request, so check your choice before sending.",
          ],
        },
        {
          question: "What happens after I send a preferred schedule request?",
          answer: [
            "The parish office reviews it. They either update your schedule to your preferred one or keep the original schedule. You will get a notification either way, and the result appears on the appointment.",
          ],
        },
        {
          question: "Can I request a preferred schedule for a special program?",
          answer: [
            "No. Special sacramental programs have a fixed schedule set by the parish.",
          ],
        },
      ],
    },
    {
      id: "payments",
      title: "Payments",
      items: [
        {
          question: "How much will I pay?",
          answer: [
            "The Payment Preview in the booking form shows the fee for residents of Villanueva and for non-residents. It is for reference only. The parish office confirms the final amount.",
            "Special sacramental programs are free.",
          ],
        },
        {
          question: "Can I pay online?",
          answer: [
            "No. Payments are made at the parish office. The office records your payment with an official receipt number and payment date, and your appointment will then show as Paid.",
          ],
        },
      ],
    },
    {
      id: "certificates",
      title: "Certificates",
      items: [
        {
          question: "How do I request a certificate?",
          answer: [
            "On your Dashboard, click Request Certificate, choose the certificate type (the fee is shown on each type), fill in the form, and submit.",
          ],
        },
        {
          question: "When can I pick up my certificate?",
          answer: [
            "Once the parish office approves your request, they set a pickup date and time. You will see it on your Status page and receive a notification. Bring payment when you claim it.",
          ],
        },
      ],
    },
    {
      id: "programs",
      title: "Special Programs",
      items: [
        {
          question: "What are Special Sacramental Programs?",
          answer: [
            "These are community sacraments organized by the parish, such as a group wedding or mass baptism. They are listed on your Dashboard with the event date, registration deadline, and available slots.",
          ],
        },
        {
          question: "How do I join a special program?",
          answer: [
            "Click the program card on your Dashboard and complete the application form before the deadline. If the program has limited slots, apply early.",
          ],
        },
      ],
    },
    ACCOUNT_HELP_USER,
  ],
};

const priestFaq = {
  intro: "Answers to common questions about your schedule, assigned appointments, and remarks.",
  footer: "For schedule changes, day offs, or account concerns, contact the parish secretary.",
  categories: [
    {
      id: "account",
      title: "Account",
      items: [
        {
          question: "How was my account created?",
          answer: [
            "The parish secretary creates priest accounts through Priest Management. They enter your Gmail, your phone number, or both. If a Gmail is on file, the login password is emailed there; otherwise the secretary shares the password with you.",
          ],
        },
        {
          question: "How do I log in?",
          answer: [
            "Use the Gmail address or phone number on your account, plus the password you received. After logging in, use Change Password on your Profile to set your own password.",
          ],
        },
        {
          question: "I forgot my password.",
          answer: [
            "If a Gmail address is on your account, use Forgot password on the login page. You can request one password reset in any 24-hour period, shared across email and SMS. If your account is phone-only, ask the parish secretary to add a Gmail or share a new password.",
          ],
        },
        {
          question: "Why does it say my priest account is inactive?",
          answer: [
            "The parish secretary has deactivated your account, so your dashboard and schedules are not available. Please contact the parish secretary to activate it again.",
          ],
        },
      ],
    },
    {
      id: "schedule",
      title: "Calendar & Schedule",
      items: [
        {
          question: "What does the calendar on my dashboard show?",
          answer: [
            "It shows your assigned sacrament schedules, parish events, and day offs. Use View By to switch between My Calendar Appointments, All Priests, or a specific priest's schedule.",
          ],
        },
        {
          question: "What do the dashboard numbers mean?",
          answer: [
            "Total Schedules, Upcoming, and Completed count the services assigned to you. Total Records, Completed Records, and Pending Records count the appointment records linked to you.",
          ],
        },
        {
          question: "How do I request a day off or mark myself unavailable?",
          answer: [
            "Day offs, half days, and times when you are not available (for example a seminar, retreat, or sickness) are entered by the parish secretary.",
            "To tell the parish office, click the date on your dashboard calendar, then click Send a note. Pick a reason, select every 1-hour slot you cannot take (they do not need to be next to each other), add an optional message, and click Send to parish office.",
            "Dates with a note show a small number on your calendar. The note says Waiting for parish office until the secretary acts on it, then changes to Marked unavailable or Reviewed, and you get a notification. You can withdraw a note while it is still waiting.",
          ],
        },
        {
          question: "Can I print my schedule?",
          answer: [
            "Yes. Use Print Month on the calendar to print the month you are viewing.",
          ],
        },
      ],
    },
    {
      id: "appointments",
      title: "Assigned Appointments",
      items: [
        {
          question: "Where do I see the appointments assigned to me?",
          answer: [
            "Open Appointments in the sidebar. Each item shows the sacrament, date, time, location, and the person it is for. Open an item to read the submitted details.",
          ],
        },
        {
          question: "What are remarks and how do I send them?",
          answer: [
            "Remarks are your notes to the parish secretary about an assigned schedule. Type your remarks on the appointment and send them. You can edit them later if needed.",
          ],
        },
        {
          question: "What do Needs Remarks, Remarks Sent, and Reviewed mean?",
          answer: [
            "Needs Remarks: you have not sent remarks yet.",
            "Remarks Sent: your remarks were sent to the secretary.",
            "Reviewed: the secretary has read and reviewed your remarks.",
          ],
        },
        {
          question: "Can I approve or change an appointment?",
          answer: [
            "No. Approving requests, setting schedules, and assigning priests are done by the parish secretary. If a schedule does not work for you, send remarks or contact the secretary.",
          ],
        },
      ],
    },
    {
      id: "history",
      title: "History & Settings",
      items: [
        {
          question: "Where do I find past services?",
          answer: [
            "Open History in the sidebar. It keeps your finished and cancelled records. Search or filter to find an older record.",
          ],
        },
        {
          question: "Can I change the language or text style?",
          answer: [
            "Yes. Open Settings from the profile menu and choose your language, text style, and date format, then click Save.",
          ],
        },
      ],
    },
  ],
};

const adminFaq = {
  intro: "A quick reference for the parish secretary on handling requests, schedules, priests, records, and reports.",
  footer: "Tip: most pages also have a ? guide icon next to the page title with step-by-step help for that page.",
  categories: [
    {
      id: "requests",
      title: "Appointment Requests",
      items: [
        {
          question: "How do I approve or decline an appointment request?",
          answer: [
            "Open Appointment Request, click a request to read its details, then choose Approve or Decline.",
            "Declining asks for a reason (requirements not met, wrong file attached, incomplete information, duplicate request, or other). The parishioner sees this reason.",
          ],
        },
        {
          question: "Can I undo a declined request?",
          answer: [
            "Yes. Open Declined Requests from the Appointment Request page and restore the request. It returns to pending.",
          ],
        },
        {
          question: "Where do I set the schedule and the priest?",
          answer: [
            "After approving, open the appointment in Progress Tracker. Set the date, the 1-hour time slot, and the priest there. Schedules must be at least 5 days ahead (1 day for Funeral Mass).",
          ],
        },
        {
          question: "How do I handle a parishioner's preferred schedule request?",
          answer: [
            "Each appointment allows the parishioner one preferred schedule request. Review it on the appointment in Progress Tracker, then either update the schedule to the preferred one or keep the original. The parishioner is notified of your decision.",
          ],
        },
      ],
    },
    {
      id: "progress",
      title: "Progress & Payments",
      items: [
        {
          question: "How do I track requirements?",
          answer: [
            "Open Progress Tracker and click an appointment. Tick each requirement step when it is met. The parishioner sees the same checklist on their Status page.",
            "Use Manage Templates to change the default requirement steps for each sacrament.",
          ],
        },
        {
          question: "How do I record a payment?",
          answer: [
            "On the appointment in Progress Tracker, use Record Payment. Enter the official receipt number and payment date, and attach a copy of the receipt if you have one. The status changes to Paid.",
          ],
        },
        {
          question: "How do I cancel or restore an appointment?",
          answer: [
            "Use Cancel Appointment on the appointment details and give a reason. Cancelled appointments are listed under Cancelled Appointments, where you can restore them.",
          ],
        },
        {
          question: "How do I handle a parishioner's request to cancel or restore?",
          answer: [
            "You get a notification, and the Cancellation Requests button on the Progress Tracker shows how many are waiting. It opens the Cancellation Requests page, which lists each request with the parishioner's reason.",
            "Approve Cancellation cancels the appointment, removes it from the calendar, and moves it to History and Reports tagged as Cancelled. Approve Restore makes it active again. Decline keeps the appointment as it is; you must give a reason.",
            "The parishioner is notified either way, and the assigned priest is notified when an appointment is cancelled or restored.",
          ],
        },
      ],
    },
    {
      id: "calendar",
      title: "Calendar Entries",
      items: [
        {
          question: "What calendar entry types are there?",
          answer: [
            "Parish Event: a church activity shown to everyone.",
            "Priest Schedule: a service assigned to a priest.",
            "Priest Unavailability: marks the hours when a priest cannot take appointments, for a reason such as a seminar, sickness, out of town, personal leave, or a church meeting.",
            "Day Off: closes the office for a weekday every week or for a specific date.",
            "Half Day: the office is open only during set hours (default 8:00 AM to 12:00 PM).",
          ],
        },
        {
          question: "How do I mark a priest unavailable when he is sick or attending a seminar?",
          answer: [
            "On the Dashboard calendar, click + and choose Priest Unavailability. Pick a reason from the list (Seminar, Sick, Out of Town, Personal Leave, Church Meeting), or choose Other and type the reason. Then select the priest, pick the date, and click every 1-hour slot when he is unavailable. The hours do not need to be next to each other.",
            "Those hours can no longer be booked with that priest. Hours that already have a schedule are greyed out.",
          ],
        },
        {
          question: "What does the small number on a calendar date mean?",
          answer: [
            "It shows how many priest notes are waiting on that date. A priest sends a note when he cannot take certain hours, for example because he is sick.",
            "Click the date to read the note under Priest notes. Click Mark as Unavailable to open a Priest Unavailability entry already filled in with the priest, date, reason, and hours; adjust it if needed and save. The note is then marked Marked unavailable and the priest is notified.",
            "If nothing needs to change, click Mark as Reviewed instead. Either way the number disappears from the date.",
          ],
        },
        {
          question: "What decides the Office Open or Closed label?",
          answer: [
            "It follows the Day Off and Half Day entries in Philippine time. On a day off the office shows Closed. On a half day it shows Open only within the set hours.",
          ],
        },
      ],
    },
    {
      id: "priests",
      title: "Priest Management",
      items: [
        {
          question: "How do I add a priest?",
          answer: [
            "Open Priest Management and click Add Priest. Enter the priest's name and a Gmail address, a phone number, or both. The priest can log in with whichever identifier you provide. If you enter a Gmail, the password is emailed from the parish email on your Profile. If you enter only a phone number, the temporary password is shown so you can share it with the priest. For an existing priest, open Edit Priest and use Generate Password to send a new password by email or SMS to a saved contact.",
          ],
        },
        {
          question: "What happens when I deactivate a priest?",
          answer: [
            "A deactivated priest's schedules are hidden from the calendar and the priest can no longer use their dashboard. You can activate them again at any time.",
          ],
        },
      ],
    },
    {
      id: "sacraments",
      title: "Sacraments & Programs",
      items: [
        {
          question: "How do I change a sacrament's form or fees?",
          answer: [
            "Open Sacrament Manager. Edit the form fields the parishioner fills in and set the resident and non-resident fees. The User UI Preview shows how the form and payment preview will look.",
            "Archived forms are kept in the archive and can be restored.",
          ],
        },
        {
          question: "How do I create a special sacramental program?",
          answer: [
            "Open Special Programs and add a program with its event date and time, registration deadline, and slots (or unlimited). It appears on the parishioner dashboard for applications. Special programs are free.",
          ],
        },
      ],
    },
    {
      id: "certificates",
      title: "Certificates",
      items: [
        {
          question: "How do I process a certificate request?",
          answer: [
            "Open Certificate Requests. Accept a pending request and set the pickup date and time, or decline it with a reason.",
            "When the parishioner claims it, use Mark as Done, record the receipt, and confirm the claim.",
          ],
        },
        {
          question: "How do I add or change certificate types and fees?",
          answer: [
            "From Certificate Requests, open Certificate Types. Add a type, set its fee, or archive types you no longer offer.",
          ],
        },
      ],
    },
    {
      id: "reports",
      title: "Reports & Records",
      items: [
        {
          question: "How do I generate a report?",
          answer: [
            "Open Report Generation, choose the date range and records, then print it as PDF or download it as Excel.",
          ],
        },
        {
          question: "What columns can a report include?",
          answer: [
            "User ID, Person Name, Appointment Type, Appointment Status, Payment Status, Receipt No., and Date of Payment. Choose which columns appear and the PDF style in Settings.",
          ],
        },
        {
          question: "Where are finished and declined records?",
          answer: [
            "Open History. It keeps completed and declined parish records. Filter by status and search by name or sacrament.",
          ],
        },
      ],
    },
    {
      id: "settings",
      title: "Settings & Content",
      items: [
        {
          question: "What can I change in Settings?",
          answer: [
            "Language, theme (system, light, or dark), timezone, date format, the website design, the landing page, and the PDF report style. The theme applies to all accounts.",
          ],
        },
        {
          question: "How do I post a Recent Parish Activity?",
          answer: [
            "On the Dashboard, click Add Activity in Recent Parish Activity. Upload a photo (up to 8 MB) or a video (up to 100 MB and 5 minutes), then optionally set an expiration date. The activity remains public through that date and is removed from the public activity list afterward. You can edit older activities to add a deadline.",
          ],
        },
        {
          question: "How do parishioners recover a forgotten password?",
          answer: [
            "They use Forgot password on the login page. They can request one password reset in any 24-hour period, shared across email and SMS.",
          ],
        },
      ],
    },
  ],
};

export const FAQ_CONTENT = {
  user: userFaq,
  priest: priestFaq,
  admin: adminFaq,
};
