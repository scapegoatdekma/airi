import type { ModelInfo, VoiceInfo } from '../../../../stores/providers'

import { z } from 'zod'

import { getAuthToken } from '../../../../libs/auth'
import { SERVER_URL } from '../../../../libs/server'
import { defineProvider } from '../registry'
import { createOfficialOpenAIProvider, OFFICIAL_ICON, withCredentials } from './shared'

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
  id: 'official-provider-speech',
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
        return [{ id: 'auto', name: 'Auto', provider: 'official-provider-speech', description: 'Automatically routed by AI Gateway' }]

      const data = await res.json() as { models?: { id: string, name: string }[] }
      if (!Array.isArray(data.models) || data.models.length === 0)
        return [{ id: 'auto', name: 'Auto', provider: 'official-provider-speech', description: 'Automatically routed by AI Gateway' }]

      return data.models.map(m => ({
        id: m.id,
        name: m.name,
        provider: 'official-provider-speech',
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
        provider: 'official-provider-speech',
        gender: v.gender?.toLowerCase() || undefined,
        languages: v.locale
          ? [{ code: v.locale, title: v.locale }]
          : [],
      }))
    },
  },
})
