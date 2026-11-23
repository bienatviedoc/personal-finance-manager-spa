import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { deletionCancelledQuery } from '../api/deletion'

/** Tells a user who had asked to be deleted that signing in cancelled it, until they dismiss it. */
export function DeletionCancelledNotice() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: cancelled } = useQuery(deletionCancelledQuery)

  if (!cancelled) return null

  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
      <p>{t('auth.deletion.cancelled')}</p>
      <Button type="button" size="sm" variant="outline" onClick={() => queryClient.setQueryData(deletionCancelledQuery.queryKey, false)}>
        {t('auth.deletion.dismiss')}
      </Button>
    </div>
  )
}
