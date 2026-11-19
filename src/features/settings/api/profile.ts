import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { signedInUserQuery } from '@/features/auth'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import { chooseLanguage, type Language } from '@/shared/i18n'

export type ProfileChange = components['schemas']['UpdateProfileCommand']

/** Changes the signed-in user's profile settings; any left out stay as they were. */
export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (change: ProfileChange) => {
      const { data, response } = await api.PATCH('/api/v1/me', { body: change })
      if (!data) throw new Error(`Could not save the profile: ${response.status}`)
      return data
    },
    onSuccess: (profile) => queryClient.setQueryData(signedInUserQuery.queryKey, profile),
  })
}

/**
 * The signed-in user's base currency and time zone, for screens inside the shell (whose loader has
 * already loaded the user).
 */
export function useUserSettings() {
  const { data: user } = useQuery(signedInUserQuery)
  if (!user) throw new Error('useUserSettings needs a signed-in user.')
  return { baseCurrency: user.baseCurrency, timeZone: user.timeZone, locale: user.locale }
}

/**
 * Shows the interface in the locale saved in the user's profile, whenever that locale is loaded or
 * changes. Until they choose one (null) the interface keeps following their browser.
 */
export function useProfileLanguage() {
  const { i18n } = useTranslation()
  const { data: user } = useQuery(signedInUserQuery)
  const locale = user?.locale

  useEffect(() => {
    if (locale && locale !== i18n.resolvedLanguage) void chooseLanguage(i18n, locale)
    // Only a change of the saved locale switches the language, never a change of language itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])
}

/** Saves a language the user picked outside the profile screen (the sidebar's switch) to their profile. */
export function useSaveLanguage(): (language: Language) => void {
  const update = useUpdateProfile()
  return (language) => update.mutate({ locale: language })
}
