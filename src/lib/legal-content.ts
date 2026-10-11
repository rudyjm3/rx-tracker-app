// Terms of Use and Privacy Policy text, ported verbatim from the original
// RxTracker build (routes/terms.php, routes/privacy.php). Keep identical to
// rx-tracker-web's lib/legal-content.ts.
//
// Inline markup: **bold** and [label](href). A paragraph that follows a list
// is rendered with extra top spacing.

export type LegalBlock = { p: string } | { ul: string[] };
export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

export const LEGAL_EFFECTIVE_DATE = "June 1, 2025";

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "1. Acceptance of Terms",
    blocks: [
      {
        p: 'By accessing or using RxTracker ("the App"), you agree to be bound by these Terms of Use. If you do not agree to these terms, do not use the App.',
      },
    ],
  },
  {
    title: "2. Not Medical Advice",
    blocks: [
      {
        p: "RxTracker is a personal medication tracking tool and is provided for informational and organizational purposes only. **The App does not provide medical advice, diagnosis, or treatment.** Nothing in the App should be construed as a substitute for professional medical advice from a qualified healthcare provider. Always consult your doctor, pharmacist, or other qualified health professional before making any decisions about your medications or health.",
      },
    ],
  },
  {
    title: "3. Your Account",
    blocks: [
      {
        p: "You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us immediately if you believe your account has been compromised. You must provide accurate information when creating your account.",
      },
    ],
  },
  {
    title: "4. Acceptable Use",
    blocks: [
      { p: "You agree not to:" },
      {
        ul: [
          "Use the App for any unlawful purpose",
          "Attempt to gain unauthorized access to any part of the App or its infrastructure",
          "Transmit any harmful, offensive, or disruptive content",
          "Reverse-engineer or attempt to extract the App's source code",
        ],
      },
    ],
  },
  {
    title: "5. Data and Privacy",
    blocks: [
      {
        p: "Your use of the App is also governed by our [Privacy Policy](/privacy), which is incorporated into these Terms by reference. Please review it carefully.",
      },
    ],
  },
  {
    title: "6. Disclaimer of Warranties",
    blocks: [
      {
        p: 'The App is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the App will be uninterrupted, error-free, or that medication reminders will be delivered at any particular time. You are solely responsible for managing your medications.',
      },
    ],
  },
  {
    title: "7. Limitation of Liability",
    blocks: [
      {
        p: "To the fullest extent permitted by law, RxTracker and its developers shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the App, including but not limited to missed doses, medication errors, or reliance on information displayed in the App.",
      },
    ],
  },
  {
    title: "8. Modifications",
    blocks: [
      {
        p: "We may update these Terms from time to time. Continued use of the App after changes are posted constitutes acceptance of the updated Terms. We encourage you to review this page periodically.",
      },
    ],
  },
  {
    title: "9. Governing Law",
    blocks: [
      {
        p: "These Terms are governed by applicable law. Any disputes arising from these Terms or your use of the App shall be resolved in accordance with applicable law.",
      },
    ],
  },
  {
    title: "10. Contact",
    blocks: [
      {
        p: "If you have questions about these Terms, please contact us through the App's profile or help section.",
      },
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "1. Information We Collect",
    blocks: [
      { p: "When you use RxTracker, we collect information you provide directly:" },
      {
        ul: [
          "**Account information:** email address, display name, and a securely hashed password",
          "**Medication data:** medication names, dosage details, schedules, dose logs, refill records, and side effect notes you enter",
          "**Usage data:** timestamps of logged doses, settings preferences, and family profile data you create",
          "**Device data:** browser push notification subscription tokens if you enable reminders (stored per-device)",
        ],
      },
    ],
  },
  {
    title: "2. How We Use Your Information",
    blocks: [
      { p: "We use the information we collect solely to:" },
      {
        ul: [
          "Operate and provide the RxTracker service",
          "Send medication dose reminders and push notifications you have enabled",
          "Generate adherence reports and summaries you request",
          "Respond to account requests such as password resets",
          "Improve the reliability and functionality of the App",
        ],
      },
      {
        p: "**We do not sell, rent, or share your personal or health data with third parties for advertising or marketing purposes.**",
      },
    ],
  },
  {
    title: "3. Health Information",
    blocks: [
      { p: "Medication and health data you enter is sensitive. We take this seriously:" },
      {
        ul: [
          "Your data is stored in a private database accessible only to your account",
          "Passwords are stored using bcrypt hashing — we cannot read your password",
          "Family profiles are scoped to your account and are not visible to other users",
        ],
      },
      {
        p: "RxTracker is not a HIPAA-covered entity. Do not enter information that requires HIPAA-level protections.",
      },
    ],
  },
  {
    title: "4. Data Retention",
    blocks: [
      {
        p: "Your data is retained as long as your account is active. You may delete your account at any time from the profile page, which will permanently remove your account and all associated data from our systems.",
      },
    ],
  },
  {
    title: "5. Push Notifications",
    blocks: [
      {
        p: "If you enable browser push notifications, your browser generates a push subscription endpoint that is stored on our server to deliver reminders. You can disable notifications at any time from the Settings page or your browser's notification settings, which will remove your subscription.",
      },
    ],
  },
  {
    title: "6. Cookies and Sessions",
    blocks: [
      {
        p: 'We use session cookies to keep you signed in. If you choose "Remember me," a long-lived session token is stored in a cookie for up to 30 days. We do not use tracking cookies or third-party analytics cookies.',
      },
    ],
  },
  {
    title: "7. Third-Party Services",
    blocks: [
      { p: "RxTracker may use the following third-party services:" },
      {
        ul: [
          "**Font Awesome (CDN):** used to deliver icons — subject to its own privacy policy",
          "**Email provider (password resets):** your email address is passed to an email delivery service solely to send password reset messages",
        ],
      },
    ],
  },
  {
    title: "8. Your Rights",
    blocks: [
      { p: "You have the right to:" },
      {
        ul: [
          "Access all data in your account by viewing it within the App",
          "Correct inaccurate data by editing it within the App",
          "Delete your account and all associated data from the profile page",
        ],
      },
    ],
  },
  {
    title: "9. Children's Privacy",
    blocks: [
      {
        p: "RxTracker is not directed at children under 13. We do not knowingly collect personal information from children under 13. The family profiles feature is intended for use by adults managing medications for minor dependents under their care.",
      },
    ],
  },
  {
    title: "10. Changes to This Policy",
    blocks: [
      {
        p: "We may update this Privacy Policy periodically. Continued use of the App after changes are posted constitutes your acceptance of the updated policy.",
      },
    ],
  },
  {
    title: "11. Contact",
    blocks: [
      {
        p: "If you have questions or concerns about this Privacy Policy or your data, please contact us through the App's profile or help section.",
      },
    ],
  },
];
