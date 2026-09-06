/**
 * HYDRAX Mobile — EN / AR switch.
 *
 * Two buttons rather than a menu: there are exactly two languages, and a
 * farmer holding a phone in one hand should not have to open a picker to read
 * the screen in their own language. The switch takes effect immediately —
 * no app restart, because direction is handled in our layout layer rather than
 * through `I18nManager` (see src/i18n/I18nProvider.tsx).
 *
 * "EN" and "AR" are never translated: each label is written in the language it
 * selects, which is what makes the control usable from either language.
 */

import { Pressable, View } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { LANGUAGES, type Language } from '../i18n/strings';
import { colors, radius } from '../theme/tokens';
import { Text } from './Text';

const LABELS: Record<Language, string> = { en: 'EN', ar: 'ع' };

export function LanguageToggle(): React.JSX.Element {
  const { lang, setLanguage, t } = useI18n();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('common.language')}
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 3,
      }}
    >
      {LANGUAGES.map((code) => {
        const selected = code === lang;
        return (
          <Pressable
            key={code}
            onPress={() => setLanguage(code)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={code === 'en' ? 'English' : 'العربية'}
            testID={`lang-${code}`}
            hitSlop={8}
            style={{
              minWidth: 38,
              minHeight: 32,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.pill,
              backgroundColor: selected ? colors.surface3 : 'transparent',
            }}
          >
            <Text variant="label" color={selected ? 'ink' : 'dim'} numeric>
              {LABELS[code]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
