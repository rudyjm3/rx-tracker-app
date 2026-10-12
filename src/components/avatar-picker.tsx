import { Alert, View } from 'react-native';

import { ProfileAvatar } from '@/components/profile-avatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { AvatarChange } from '@/lib/user-profile';

// Photo chooser for the profile forms: shows the current/selected photo with
// "Take photo", "Choose photo" and "Remove photo". It only reports the
// selection; the upload/delete happens when the form is saved, so cancelling
// the form never touches storage.
type ImagePickerModule = typeof import('expo-image-picker');

// expo-image-picker is a native module, so it's required lazily: an app build
// made before it was added (or any runtime without it) would otherwise fail to
// load every screen that imports this component. Without it, the photo
// buttons are hidden and the avatar still shows.
let imagePickerModule: ImagePickerModule | null | undefined;
function getImagePicker(): ImagePickerModule | null {
  if (imagePickerModule !== undefined) return imagePickerModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    imagePickerModule = require('expo-image-picker') as ImagePickerModule;
  } catch (e) {
    imagePickerModule = null;
    console.warn('expo-image-picker is unavailable in this build', e);
  }
  return imagePickerModule;
}

const PICKER_OPTIONS: import('expo-image-picker').ImagePickerOptions = {
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

  const ImagePicker = getImagePicker();

  function select(result: import('expo-image-picker').ImagePickerResult) {
    const asset = result.canceled ? null : result.assets[0];
    if (asset) onChange({ asset: { uri: asset.uri, mimeType: asset.mimeType }, remove: false });
  }

  async function chooseFromLibrary() {
    if (!ImagePicker) return;
    try {
      select(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
    } catch (e) {
      Alert.alert('Could not open photos', e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  async function takePhoto() {
    if (!ImagePicker) return;
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
        {ImagePicker ? (
          <>
            <Button label="Take photo" variant="secondary" size="compact" onPress={takePhoto} />
            <Button label="Choose photo" variant="secondary" size="compact" onPress={chooseFromLibrary} />
          </>
        ) : null}
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
        {ImagePicker
          ? 'JPEG, PNG or WebP, up to 3MB.'
          : 'Photo upload needs the latest version of the app. Install the newest build to use it.'}
      </Text>
    </View>
  );
}
