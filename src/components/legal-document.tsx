import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { SafeArea } from '@/components/ui/safe-area';
import { Text } from '@/components/ui/text';
import { LEGAL_EFFECTIVE_DATE, type LegalSection } from '@/lib/legal-content';

// Inline markup in legal copy: **bold** and [label](href).
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/).map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) {
      return (
        <Text key={i} className="font-bold">
          {bold[1]}
        </Text>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      return (
        <Text key={i} className="text-brand-blue dark:text-brand-cyan" onPress={() => router.push(link[2] as Href)}>
          {link[1]}
        </Text>
      );
    }
    return part;
  });
}

// Public screen shared by /terms and /privacy (DESIGN.md 8.16): "Back" link,
// then a card with the brand, title, effective date and sections.
export function LegalDocument({ title, sections }: { title: string; sections: LegalSection[] }) {
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View className="flex-1 bg-brand-bg dark:bg-night-bg">
      <SafeArea className="flex-1">
        <ScrollView contentContainerClassName="px-4 pb-10 pt-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={goBack}
            hitSlop={8}
            className="mb-4 min-h-11 flex-row items-center gap-1.5 self-start"
          >
            <Ionicons name="arrow-back" size={18} color="#0A8AC8" />
            <Text className="text-sm font-medium text-brand-blue dark:text-brand-cyan">Back</Text>
          </Pressable>

          <View className="rounded-card border border-brand-border bg-brand-card p-7 shadow-card dark:border-night-border dark:bg-night-card">
            <View className="mb-6 flex-row items-center gap-3">
              <Image
                source={require('../../assets/images/icon.png')}
                style={{ width: 48, height: 48, borderRadius: 12 }}
                contentFit="cover"
              />
              <Text className="text-xl font-extrabold text-brand-navy dark:text-white">RxTracker</Text>
            </View>

            <Text accessibilityRole="header" className="mb-1 text-[26px] font-extrabold leading-8 text-brand-navy dark:text-white">
              {title}
            </Text>
            <Text muted className="mb-8 text-sm">
              Effective date: {LEGAL_EFFECTIVE_DATE}
            </Text>

            {sections.map((section) => (
              <View key={section.title} className="mb-7">
                <Text accessibilityRole="header" className="mb-2 text-[17px] font-bold text-brand-navy dark:text-white">
                  {section.title}
                </Text>
                {section.blocks.map((block, i) => {
                  const afterList = i > 0 && 'ul' in section.blocks[i - 1];
                  if ('ul' in block) {
                    return (
                      <View key={i} className="gap-1.5">
                        {block.ul.map((item) => (
                          <View key={item} className="flex-row gap-2 pl-1">
                            <Text className="text-base leading-6">{'•'}</Text>
                            <Text className="flex-1 text-base leading-6">{renderInline(item)}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  }
                  return (
                    <Text key={i} className={`text-base leading-6 ${afterList ? 'mt-3' : ''}`}>
                      {renderInline(block.p)}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeArea>
    </View>
  );
}
