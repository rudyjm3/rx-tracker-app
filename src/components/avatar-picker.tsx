import * as ImagePicker from 'expo-image-picker';
import { Alert, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile-avatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { AvatarChange } from '@/lib/user-profile';

// Photo chooser for the profile forms: shows the current/selected photo with
// "Take photo", "Choose photo" and "Remove photo". It only reports the
// selection; the upload/delete happens when the form is saved, so cancelling
// the form never touches storage.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.7,
};

export function AvatarPicker({
  currentUrl,
  label,
  color,
  value,
  onChange,
}: {
  currentUrl: string | null;
  label: string;
  color?: string | null;
  value: AvatarChange;
  onChange: (next: AvatarChange) => void;
}) {
  const previewUrl = value.asset?.uri ?? (value.remove ? null : currentUrl);

  function select(result: ImagePicker.ImagePickerResult) {
    const asset = result.canceled ? null : result.assets[0];
    if (asset) onChange({ asset: { uri: asset.uri, mimeType: asset.mimeType }, remove: false });
  }

  async function chooseFromLibrary() {
    try {
      select(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
    } catch (e) {
      Alert.alert('Could not open photos', e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  async function takePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera access needed', 'Allow camera access in your device settings to take a photo.');
        return;
      }
      select(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
    } catch (e) {
      Alert.alert('Could not open the camera', e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  return (
    <View className="items-center gap-3">
      <ProfileAvatar label={label} color={color} pictureUrl={previewUrl} size={96} />
      <View className="flex-row flex-wrap justify-center gap-2">
        <Button label="Take photo" variant="secondary" size="compact" onPress={takePhoto} />
        <Button label="Choose photo" variant="secondary" size="compact" onPress={chooseFromLibrary} />
        {previewUrl ? (
          <Button
            label="Remove photo"
            variant="ghost"
            size="compact"
            onPress={() => onChange({ asset: null, remove: true })}
          />
        ) : null}
      </View>
      <Text muted className="text-xs">
        JPEG, PNG or WebP, up to 3MB.
      </Text>
    </View>
  );
}
