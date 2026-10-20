import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInstance } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import i18n, { i18nOptions, resources } from './i18n'
import { normalizeLanguage } from './lib/language'

// The browser detector caches localStorage availability during initialization.
// Install a browser surface before importing the application's i18n singleton.
vi.hoisted(() => {
  vi.stubGlobal('window', {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  })
})

afterEach(() => vi.unstubAllGlobals())

function leaves(value: unknown, path = ''): Record<string, string> {
  if (typeof value === 'string') return { [path]: value }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      Object.entries(leaves(child, path ? `${path}.${key}` : key)),
    ),
  )
}

function placeholders(value: string) {
  return [...value.matchAll(/{{\s*([^}]+?)\s*}}/g)].map((match) => match[1]).sort()
}

function browser(language: string, savedLanguage?: string) {
  const values = new Map<string, string>()
  if (savedLanguage) values.set('i18nextLng', savedLanguage)
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  vi.stubGlobal('window', { localStorage })
  vi.stubGlobal('navigator', { language, languages: [language] })
  return localStorage
}

async function detectedInstance() {
  const instance = createInstance().use(LanguageDetector)
  await instance.init(i18nOptions)
  return instance
}

describe('translation completeness', () => {
  const english = leaves(resources.en.translation)
  for (const language of ['ja', 'zh-CN'] as const) {
    it(`${language} has the same keys and interpolation variables as English`, () => {
      const translated = leaves(resources[language].translation)
      expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort())
      for (const [key, value] of Object.entries(translated)) {
        expect(value.trim(), key).not.toBe('')
        expect(placeholders(value), key).toEqual(placeholders(english[key]))
      }
    })
    it(`${language} keeps error hints as nonempty string arrays`, () => {
      for (const error of Object.values(resources[language].translation.errors)) {
        expect(Array.isArray(error.hints)).toBe(true)
        expect(error.hints.length).toBeGreaterThan(0)
        expect(error.hints.every((hint) => typeof hint === 'string' && hint.trim())).toBe(true)
      }
    })
  }
})

describe('language detection and persistence', () => {
  it.each([
    ['zh', 'zh-CN'],
    ['zh-CN', 'zh-CN'],
    ['zh-SG', 'zh-CN'],
    ['zh-TW', 'zh-CN'],
    ['zh-HK', 'zh-CN'],
    ['zh-Hant-HK', 'zh-CN'],
    ['zh_Hans_CN', 'zh-CN'],
    ['en-US', 'en'],
    ['ja-JP', 'ja'],
    ['fr-FR', 'en'],
  ])('resolves %s to %s on first launch', async (input, expected) => {
    browser(input)
    expect(normalizeLanguage(input)).toBe(expected)
    const instance = await detectedInstance()
    expect(instance.language).toBe(expected)
    expect(instance.resolvedLanguage).toBe(expected)
  })

  it('prioritizes and normalizes a previously saved language', async () => {
    const storage = browser('zh-CN', 'ja-JP')
    const instance = await detectedInstance()
    expect(instance.language).toBe('ja')
    expect(storage.getItem('i18nextLng')).toBe('ja')
  })

  it('switches between all three languages and restores each after restart', async () => {
    const storage = browser('zh-TW')
    const instance = await detectedInstance()
    for (const language of ['en', 'ja', 'zh-CN']) {
      await instance.changeLanguage(language)
      expect(instance.resolvedLanguage).toBe(language)
      expect(instance.t('settings_title')).toBe(
        resources[language as keyof typeof resources].translation.settings_title,
      )
      expect(storage.getItem('i18nextLng')).toBe(language)
      expect((await detectedInstance()).language).toBe(language)
    }
  })

  it('updates the document language and interpolates Chinese text', async () => {
    browser('en')
    const documentElement = { lang: 'en' }
    vi.stubGlobal('document', { documentElement })
    await i18n.changeLanguage('zh-CN')
    expect(documentElement.lang).toBe('zh-CN')
    expect(i18n.t('operate_running_desc', { interval: 3 })).toBe('每 3 秒发送一次唤醒信号')
    expect(i18n.t('errors.usb_unauthorized.hints', { returnObjects: true })).toBeInstanceOf(Array)
    await i18n.changeLanguage('en')
    expect(documentElement.lang).toBe('en')
  })
})
