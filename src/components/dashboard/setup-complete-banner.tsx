import { Callout } from '@/components/ui/callout';
import { Text } from '@/components/ui/text';

// One-time success callout shown right after onboarding (?setup=complete).
export function SetupCompleteBanner() {
  return (
    <Callout kind="success">
      <Text className="text-sm">
        <Text className="text-sm font-medium">You&rsquo;re all set. </Text>
        Your medications are ready to track.
      </Text>
    </Callout>
  );
}
