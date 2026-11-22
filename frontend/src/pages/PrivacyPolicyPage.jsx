import { useEffect } from "react";
import { Link } from "react-router-dom";
import "./PrivacyPolicyPage.css";

const PARISH_NAME = "Our Lady of Guadalupe Parish - Villanueva";
const PARISH_EMAIL = "larsmanayaga@gmail.com";
const EFFECTIVE_DATE = "November 22, 2026";

const SECTIONS = [
  {
    title: "Information we collect",
    paragraphs: ["Depending on how you use Faithflow, we may collect:"],
    items: [
      "Account details, such as your name, email address, mobile number, address, birthdate, gender, and profile photo.",
      "Sacrament and certificate request details, including information about the people named in the request, such as a child, parents, godparents, a couple, or a deceased person.",
      "Documents you upload to support a request, such as birth certificates and other parish requirements.",
      "Schedules, assigned priests, checklist progress, remarks, payment records, and request history.",
      "Priest account details, including contact information, clergy type, religious order, parish role, and schedules.",
    ],
  },
  {
    title: "How we use your information",
    items: [
      "Create and manage your account and sign you in.",
      "Review, schedule, and complete sacrament, special program, and certificate requests.",
      "Send updates about approvals, schedules, checklist changes, cancellations, and passwords.",
      "Keep parish records, record payments, and prepare parish reports.",
      "Maintain, protect, and troubleshoot the system.",
    ],
  },
  {
    title: "Email and Gmail",
    paragraphs: [
      "Faithflow uses the Gmail API with the parish's own Gmail account to send service emails, such as priest welcome messages and temporary passwords. It requests only Google's gmail.send permission.",
      "Faithflow does not use this permission to read, search, change, or delete messages in the parish mailbox, and it does not access the Gmail account of parishioners or priests.",
      "Faithflow's use of information received from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use requirements.",
    ],
  },
  {
    title: "Who we share information with",
    paragraphs: [
      "Authorized parish staff and assigned priests can access information needed to handle your request. We do not sell your personal information.",
      "We use service providers to operate Faithflow:",
    ],
    items: [
      "Vercel hosts the website.",
      "Render hosts the application server.",
      "Supabase hosts the database.",
      "Amazon Web Services and SMS delivery providers process text messages.",
      "Google delivers email sent through the Gmail API.",
    ],
    closing: "We may also disclose information when required by law or by a lawful government order.",
  },
  {
    title: "How we protect and keep information",
    paragraphs: [
      "Passwords are stored in hashed form, and access to parish functions is limited by account role. No online system is completely secure, so please keep your password private and tell the parish office if you suspect unauthorized access.",
      "We keep information for as long as needed to provide parish services, maintain sacramental and administrative records, and meet legal obligations.",
    ],
  },
  {
    title: "Browser storage",
    paragraphs: [
      "Faithflow stores sign-in and display preferences in your browser so the system can keep you signed in and remember your settings. Signing out removes your saved sign-in details from that browser.",
    ],
  },
  {
    title: "Your privacy rights",
    paragraphs: [
      "Under the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), you may ask to be informed about, access, correct, object to the processing of, or request the deletion or blocking of your personal data, subject to the parish's legal and record-keeping obligations. You may also file a complaint with the National Privacy Commission.",
    ],
  },
  {
    title: "Changes to this policy",
    paragraphs: ["We may update this policy when Faithflow changes. The latest version and its effective date will appear on this page."],
  },
];

function PrivacyPolicyPage() {
  useEffect(() => {
    document.title = "Faithflow - Privacy Policy";
  }, []);

  return (
    <main className="privacy-page">
      <article className="privacy-card">
        <header className="privacy-header">
          <Link to="/about" className="privacy-home-link">Faithflow</Link>
          <h1>Privacy Policy</h1>
          <p>Effective {EFFECTIVE_DATE}</p>
        </header>

        <div className="privacy-content">
          <p className="privacy-intro">
            Faithflow is the parish service system of {PARISH_NAME}. This policy explains what personal information we
            collect, how we use it, and the choices available to you.
          </p>

          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.items ? (
                <ul>
                  {section.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
              {section.closing ? <p>{section.closing}</p> : null}
            </section>
          ))}

          <section>
            <h2>Contact us</h2>
            <p>For privacy questions or requests, contact the parish office:</p>
            <address>
              <strong>{PARISH_NAME}</strong>
              <a href={`mailto:${PARISH_EMAIL}`}>{PARISH_EMAIL}</a>
            </address>
          </section>
        </div>
      </article>
    </main>
  );
}

export default PrivacyPolicyPage;
