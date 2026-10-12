import { LegalDocument } from '@/components/legal-document';
import { TERMS_SECTIONS } from '@/lib/legal-content';

// Public (no auth redirect): linked from sign-in / sign-up and the More menu.
export default function TermsScreen() {
  return <LegalDocument title="Terms of Use" sections={TERMS_SECTIONS} />;
}
