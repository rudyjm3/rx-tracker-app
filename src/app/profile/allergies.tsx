import { AllergyPanel } from '@/components/AllergyPanel';
import { Screen } from '@/components/ui/screen';

// The screen header already carries the "Allergies & Intolerances" title.
export default function AllergiesScreen() {
  return (
    <Screen edges={['left', 'right', 'bottom']} contentClassName="pt-4">
      <AllergyPanel profileId={null} showTitle={false} />
    </Screen>
  );
}
