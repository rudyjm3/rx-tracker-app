// Terms of Use and Privacy Policy text. Originally ported from the original
// RxTracker build (routes/terms.php, routes/privacy.php), then updated for
// the current web and mobile apps (Supabase, Google sign-in, profile photos,
// DailyMed/openFDA lookups, on-device reminders). Keep identical to
// rx-tracker-web's lib/legal-content.ts.
//
// Inline markup: **bold** and [label](href). A paragraph that follows a list
// is rendered with extra top spacing.

export type LegalBlock = { p: string } | { ul: string[] };
export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

export const LEGAL_EFFECTIVE_DATE = "October 12, 2026";

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "1. Acceptance of Terms",
    blocks: [
      {
        p: 'By accessing or using RxTracker, including its website and its mobile app (together, "the App"), you agree to be bound by these Terms of Use. If you do not agree to these terms, do not use the App.',
      },
    ],
  },
  {
    title: "2. Not Medical Advice",
    blocks: [
      {
        p: "RxTracker is a personal medication tracking tool and is provided for informational and organizational purposes only. **The App does not provide medical advice, diagnosis, or treatment.** Nothing in the App should be construed as a substitute for professional medical advice from a qualified healthcare provider. Always consult your doctor, pharmacist, or other qualified health professional before making any decisions about your medications or health.",
      },
      {
        p: "Medication information shown in the App, including label details from DailyMed and openFDA, is for general reference only and may be incomplete or out of date. Pain, mood, and side effect tracking and the adherence figures and Doctor Visit Reports the App produces are summaries of what you enter; they are not clinical assessments, and you are responsible for checking that the information is accurate before sharing it.",
      },
    ],
  },
  {
    title: "3. Your Account",
    blocks: [
      {
        p: "You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us immediately if you believe your account has been compromised. You must provide accurate information when creating your account. You may sign up with an email address and password or sign in with Google.",
      },
      {
        p: "If you add a family member to your account, you confirm that you are authorized to manage their medication information, for example as a parent, guardian, or caregiver.",
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
        p: 'The App is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the App will be uninterrupted, error-free, or that medication reminders will be delivered at any particular time. Alarms in the website only sound while RxTracker is open in your browser, and reminders in the mobile app depend on the notification settings and permissions on your device. You are solely responsible for managing your medications.',
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
          "**Account information:** email address, name or display name, and a securely hashed password. If you sign in with Google, we receive your name and email address from Google; we do not receive your Google password",
          "**Profile information:** birth date, height, weight, allergies and intolerances, and an optional profile photo, for you and for any family members you add. Profile photos are kept in cloud storage and served from a web address; anyone who has that exact address can open the photo",
          "**Medication and health data:** medication names, dosages, instructions, schedules, supply and refill records, dose logs, side effects, notes, and the pain and mood levels and tags you record",
          "**Usage data:** timestamps of logged doses, settings preferences, and family profile data you create",
          "**Device data:** if you register a mobile device for push notifications, its device name and notification token (stored per device). Reminders that the mobile app schedules on your device are not sent to us",
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
          "Your data is stored in a private database with access rules that limit each record to your account",
          "Passwords are stored in hashed form by our authentication provider — we cannot read your password",
          "Data is sent between the App and our servers over encrypted (HTTPS) connections",
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
        p: "Your data is retained as long as your account is active. You may delete your account at any time from the Profile page of the website, which will permanently remove your account and all associated data from our systems. You can also remove a family member at any time, which permanently deletes that person's medications, dose history, and logs. Account deletion is available in the website; the mobile app uses the same account.",
      },
    ],
  },
  {
    title: "5. Reminders and Push Notifications",
    blocks: [
      {
        p: "The mobile app schedules medication reminders locally on your device, using the notification permission you grant it; those reminders can be turned off in the app's settings or your device's notification settings. If you register a device for push notifications, we store its device name and notification token to deliver reminders, and you can remove registered devices from the Settings page of the website. The website's dose alarm (sound and vibration) only runs while RxTracker is open in your browser and is controlled by on-device settings.",
      },
    ],
  },
  {
    title: "6. Cookies, Sessions and Local Storage",
    blocks: [
      {
        p: "On the website we use cookies to keep you signed in, and the mobile app stores your sign-in session on your device. Both the website and the app also keep a few preferences on your device, such as which profile you are viewing and your alarm sound and vibration settings. We do not use tracking cookies, advertising cookies, or third-party analytics.",
      },
    ],
  },
  {
    title: "7. Third-Party Services",
    blocks: [
      { p: "RxTracker may use the following third-party services:" },
      {
        ul: [
          "**Supabase:** provides our sign-in, database, and file storage. Your account, medication data, and profile photos are stored with Supabase on our behalf",
          "**Google (optional):** if you choose \"Continue with Google,\" Google signs you in and shares your name and email address with us, subject to Google's privacy policy",
          "**DailyMed and openFDA (U.S. National Library of Medicine and FDA):** when you search for a medication or open its details, the medication name or identifier you searched is sent to these public drug databases to look up label information. The website sends these requests through our server; the mobile app sends them directly from your device. We do not send your account details with them",
          "**Email delivery:** your email address is passed to an email delivery service solely to send sign-up confirmation and password reset messages",
          "**Font Awesome (CDN):** the website loads icons from this service, which may receive standard request information such as your IP address — subject to its own privacy policy",
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
          "Export your medication, adherence, and tracking history as a Doctor Visit Report (PDF) from the Export page",
          "Delete your account and all associated data from the Profile page of the website",
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
