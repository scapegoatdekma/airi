import type { Ref, WatchSource } from 'vue'

import type { ModelInfo, VoiceInfo } from '../../../../stores/providers'

import { watch } from 'vue'
import { z } from 'zod'

import { getAuthToken } from '../../../../libs/auth'
import { SERVER_URL } from '../../../../libs/server'
import { defineProvider } from '../registry'
import { createOfficialOpenAIProvider, OFFICIAL_ICON, withCredentials } from './shared'

export const OFFICIAL_SPEECH_PROVIDER_ID = 'official-provider-speech'

const officialConfigSchema = z.object({})

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getAuthToken()
  if (token)
    headers.Authorization = `Bearer ${token}`
  return headers
}

export const providerOfficialChat = defineProvider({
  id: 'official-provider',
  order: -1,
  name: 'Official Provider',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.official.title'),
  description: 'Official AI provider by AIRI.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.official.description'),
  tasks: ['text-generation'],
  icon: OFFICIAL_ICON,
  requiresCredentials: false,

  createProviderConfig: () => officialConfigSchema,
  createProvider(_config) {
    const provider = createOfficialOpenAIProvider()
    const originalChat = provider.chat.bind(provider)
    provider.chat = (model: string) => {
      const result = originalChat(model)
      result.fetch = withCredentials()
      return result
    }
    return provider
  },

  validationRequiredWhen: () => false,

  extraMethods: {
    listModels: async () => [
      {
        id: 'auto',
        name: 'Auto',
        provider: 'official-provider',
        description: 'Automatically routed by AI Gateway',
      },
    ],
  },
})

export const providerOfficialSpeech = defineProvider({
  id: OFFICIAL_SPEECH_PROVIDER_ID,
  order: -1,
  name: 'Official Speech Provider',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.official.speech-title'),
  description: 'Official text-to-speech provider by AIRI.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.official.speech-description'),
  tasks: ['text-to-speech'],
  icon: OFFICIAL_ICON,
  requiresCredentials: false,
  createProviderConfig: () => officialConfigSchema,
  createProvider(_config) {
    const provider = createOfficialOpenAIProvider()
    const originalSpeech = provider.speech.bind(provider)
    provider.speech = (model: string) => {
      const result = originalSpeech(model)
      result.fetch = withCredentials()
      return result
    }
    return provider
  },
  validationRequiredWhen: () => false,
  extraMethods: {
    listModels: async (): Promise<ModelInfo[]> => {
      const res = await globalThis.fetch(`${SERVER_URL}/api/v1/openai/audio/models`, { headers: authHeaders() })
      if (!res.ok)
        return []

      const data = await res.json() as { models?: { id: string, name: string }[] }
      if (!Array.isArray(data.models))
        return []

      return data.models.map(m => ({
        id: m.id,
        name: m.name,
        provider: OFFICIAL_SPEECH_PROVIDER_ID,
      }))
    },
    listVoices: async (): Promise<VoiceInfo[]> => {
      const res = await globalThis.fetch(`${SERVER_URL}/api/v1/openai/audio/voices`, { headers: authHeaders() })
      if (!res.ok)
        return []

      const data = await res.json() as { data?: { id: string, name: string, provider: string, locale?: string, gender?: string }[] }
      if (!Array.isArray(data.data))
        return []

      return data.data.map(v => ({
        id: v.id,
        name: v.name,
        provider: OFFICIAL_SPEECH_PROVIDER_ID,
        gender: v.gender?.toLowerCase() || undefined,
        languages: v.locale
          ? [{ code: v.locale, title: v.locale }]
          : [],
      }))
    },
  },
})

// Pick a locale from available voice locales that best matches the UI locale:
// exact match → language-subtag prefix match → en-US → first available.
function pickLocaleForUi(uiLocale: string, available: string[]): string {
  if (!available.length)
    return ''
  if (available.includes(uiLocale))
    return uiLocale
  const uiPrefix = uiLocale.split(/[-_]/)[0].toLowerCase()
  const prefixMatch = available.find(c => c.split(/[-_]/)[0].toLowerCase() === uiPrefix)
  if (prefixMatch)
    return prefixMatch
  return available.find(c => c === 'en-US') || available.find(c => c.toLowerCase().startsWith('en')) || available[0]
}

// NOTICE: Only the official speech provider auto-configures a default voice
// after login. Third-party providers leave voice selection to the user.
export function setupOfficialSpeechAutoPick(ctx: {
  activeSpeechProvider: Ref<string>
  activeSpeechVoiceId: Ref<string>
  availableVoices: Ref<Record<string, VoiceInfo[]>>
  selectedLanguage: Ref<string>
  uiLocale: WatchSource<string> | Ref<string>
}) {
  watch([ctx.availableVoices, ctx.activeSpeechProvider], ([voices, provider]) => {
    if (provider !== OFFICIAL_SPEECH_PROVIDER_ID)
      return
    if (ctx.activeSpeechVoiceId.value)
      return

    const providerVoices = voices[OFFICIAL_SPEECH_PROVIDER_ID]
    if (!providerVoices?.length)
      return

    const localeCodes = Array.from(new Set(
      providerVoices.flatMap(v => (v.languages || []).map(l => l.code).filter(Boolean)),
    )).sort()

    if (!ctx.selectedLanguage.value || !localeCodes.includes(ctx.selectedLanguage.value)) {
      const uiLocaleValue = typeof ctx.uiLocale === 'function'
        ? (ctx.uiLocale as () => string)()
        : (ctx.uiLocale as Ref<string>).value
      ctx.selectedLanguage.value = pickLocaleForUi(uiLocaleValue, localeCodes)
    }

    const match = providerVoices.find(v => (v.languages || []).some(l => l.code === ctx.selectedLanguage.value))
      || providerVoices[0]
    if (match)
      ctx.activeSpeechVoiceId.value = match.id
  }, { deep: true, immediate: true })
}
