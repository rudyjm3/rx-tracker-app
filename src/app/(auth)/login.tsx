import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/auth-shell';
import { LegalLinks } from '@/components/legal-links';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/supabase/AuthProvider';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) setError(signInError);
    // On success, the (auth) layout's session check redirects to (tabs).
  }

  return (
    <AuthShell>
      <Text className="text-center text-[26.4px] font-extrabold text-brand-navy dark:text-white">Welcome back!</Text>
      <Text muted className="mb-8 mt-2 text-center text-sm">
        Sign in to continue tracking your medications.
      </Text>

      {error ? <Callout kind="error" className="mb-4">{error}</Callout> : null}

      <View className="gap-4">
        <Field
          size="auth"
          label="Email"
          icon="mail-outline"
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          size="auth"
          label="Password"
          icon="lock-closed-outline"
          placeholder="Enter your password"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
        />
        <Button
          label={submitting ? 'Signing in…' : 'Sign in'}
          loading={submitting}
          disabled={!email || !password}
          onPress={handleSubmit}
          className="mt-2 w-full"
        />
      </View>

      <Text muted className="mt-6 text-center text-sm">
        Don&apos;t have an account?{' '}
        <Link href="/(auth)/signup" className="font-bold text-brand-blue">
          Sign up
        </Link>
      </Text>
      <LegalLinks />
    </AuthShell>
  );
}
