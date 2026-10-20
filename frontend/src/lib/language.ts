export const supportedLanguages = ['en', 'ja', 'zh-CN'] as const
export type SupportedLanguage = (typeof supportedLanguages)[number]

// Normalize regional browser and previously saved language codes for both i18next
// and the settings selector. All Chinese variants use the Simplified translation.
export function normalizeLanguage(language: string): SupportedLanguage {
  const base = language.trim().toLowerCase().split(/[-_]/)[0]
  if (base === 'zh') return 'zh-CN'
  if (base === 'ja') return 'ja'
  return 'en'
}
