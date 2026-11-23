import { hashKey, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { signedInUserQuery } from '@/features/auth'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import type { components } from '@/shared/api/schema'
import { chooseLanguage, type Language } from '@/shared/i18n'

export type Profile = components['schemas']['ProfileResponse']
export type ProfileChange = components['schemas']['UpdateProfileRequest']

/** Fields the API can refuse, which the form shows its own translated message for. */
const profileFields = ['baseCurrency', 'timeZone', 'locale', 'budgetWarningPercent'] as const
export type ProfileField = (typeof profileFields)[number]

export type SaveOutcome = { saved: true; profile: Profile } | { saved: false; fields: ProfileField[] }

/** Changes the signed-in user's profile settings; any left out stay as they were. */
export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (change: ProfileChange): Promise<SaveOutcome> => {
      const { data, error, response } = await api.PATCH('/api/v1/me', { body: change })
      if (data) return { saved: true, profile: data }
      const fields = refusedFields(response, error, profileFields)
      if (fields) return { saved: false, fields }
      throw new Error(`Could not save the profile: ${response.status}`)
    },
    onSuccess: (outcome) => {
      if (!outcome.saved) return
      const before = queryClient.getQueryData(signedInUserQuery.queryKey)
      queryClient.setQueryData(signedInUserQuery.queryKey, outcome.profile)
      // Totals the API converted into the old base currency are no longer what it would answer.
      // Everything but the profile itself, which the save just answered. Keys are compared by what they hold:
      // the cache need not keep the very array a query was made with.
      if (before?.baseCurrency !== outcome.profile.baseCurrency) {
        const profileKey = hashKey(signedInUserQuery.queryKey)
        return queryClient.invalidateQueries({ predicate: (query) => query.queryHash !== profileKey })
      }
    },
  })
}

/**
 * Loads the profile again, for a change made elsewhere that it reports: the first budget locks the base
 * currency, and removing the last one unlocks it.
 */
export function refreshProfile(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: signedInUserQuery.queryKey, exact: true })
}

/**
 * The signed-in user's settings, for screens inside the shell (whose loader has already loaded the user):
 * their base currency and whether it is locked, time zone, locale and budget warning threshold.
 */
export function useUserSettings() {
  const { data: user } = useQuery(signedInUserQuery)
  if (!user) throw new Error('useUserSettings needs a signed-in user.')
  return {
    baseCurrency: user.baseCurrency,
    baseCurrencyLocked: user.baseCurrencyLocked,
    timeZone: user.timeZone,
    locale: user.locale,
    budgetWarningPercent: Number(user.budgetWarningPercent),
  }
}

/**
 * Shows the interface in the locale saved in the user's profile, whenever that locale is loaded or
 * changes. Until they choose one (null) the interface keeps following their browser.
 */
export function useProfileLocale() {
  const { i18n } = useTranslation()
  const { data: user } = useQuery(signedInUserQuery)
  const locale = user?.locale

  useEffect(() => {
    if (locale && locale !== i18n.resolvedLanguage) void chooseLanguage(i18n, locale)
    // Only a change of the saved locale switches the language, never a change of language itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])
}

/** Saves a locale the user picked outside the profile screen (the sidebar's switch) to their profile. */
export function useSaveLocale(): (locale: Language) => void {
  const update = useUpdateProfile()
  return (locale) => update.mutate({ locale })
}
