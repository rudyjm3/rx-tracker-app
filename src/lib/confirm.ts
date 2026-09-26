import { Alert, Platform } from 'react-native';

// Alert.alert's buttons are a no-op on web (react-native-web's Alert.alert
// is an empty stub), which would make onConfirm unreachable there — fall
// back to window.confirm on that platform so this confirmation actually
// works cross-platform, matching AGENTS.md's cross-platform-compatibility
// priority for this app.
export function confirmDestructive(
  title: string,
  message: string | undefined,
  confirmLabel: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
