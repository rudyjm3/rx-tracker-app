import { LegalDocument } from '@/components/legal-document';
import { PRIVACY_SECTIONS } from '@/lib/legal-content';

// Public (no auth redirect): linked from sign-in / sign-up and the More menu.
export default function PrivacyScreen() {
  return <LegalDocument title="Privacy Policy" sections={PRIVACY_SECTIONS} />;
}
