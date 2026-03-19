// https://nuxt.com/docs/api/configuration/nuxt-config
// @ts-expect-error -- nuxt.config runs in Node; @types/node not in devDeps
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: true },
  modules: ['@pinia/nuxt', '@nuxthub/core', '@nuxtjs/i18n'],
  i18n: {
    locales: [
      { code: 'pl', name: 'Polski', file: 'pl.json' },
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'uk', name: 'Українська', file: 'uk.json' },
      { code: 'ru', name: 'Русский', file: 'ru.json' },
    ],
    defaultLocale: 'pl',
    lazy: true,
    langDir: 'locales/',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'slava_lang',
      fallbackLocale: 'pl',
    },
  },
  alias: {
    '~': fileURLToPath(new URL('./', import.meta.url)),
    '@': fileURLToPath(new URL('./', import.meta.url)),
  },
  components: [
    { path: fileURLToPath(new URL('./components', import.meta.url)), pathPrefix: false },
  ],
  hub: {
    database: true,
    kv: true,
  },
  nitro: {
    experimental: {
      websocket: true,
    },
  },
  typescript: {
    strict: true,
  },
  app: {
    head: {
      title: 'Sława Vol.2',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
})
