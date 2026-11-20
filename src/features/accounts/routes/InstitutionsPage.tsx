import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { institutionsQuery, useArchiveInstitution, useCreateInstitution, useEditInstitution, type Institution } from '../api/institutions'
import { InstitutionForm } from '../components/InstitutionForm'
import { InstitutionLogo } from '../components/InstitutionLogo'
import { ErrorMessage } from '@/shared/components/ErrorMessage'

/** The banks and wallet providers the user holds money with: add, edit and archive them. */
export function InstitutionsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.institutions'))
  const institutions = useQuery(institutionsQuery)
  const create = useCreateInstitution()
  const [adding, setAdding] = useState(false)

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link className="text-sm underline" to="/accounts">
          {t('institutions.backToAccounts')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('screens.institutions')}</h1>
        <p className="text-muted-foreground">{t('institutions.intro')}</p>
      </div>

      {adding ? (
        <InstitutionForm onSave={create.mutateAsync} onDone={() => setAdding(false)} />
      ) : (
        <Button onClick={() => setAdding(true)}>{t('institutions.add')}</Button>
      )}
      {create.isError && <ErrorMessage>{t('institutions.errors.generic')}</ErrorMessage>}

      {institutions.isError && <ErrorMessage>{t('institutions.errors.generic')}</ErrorMessage>}
      {institutions.data?.length === 0 && !adding && <p className="text-muted-foreground">{t('institutions.empty')}</p>}
      {institutions.data && institutions.data.length > 0 && (
        <ul aria-label={t('screens.institutions')} className="divide-y rounded-lg border">
          {institutions.data.map((institution) => (
            <InstitutionRow key={institution.id} institution={institution} />
          ))}
        </ul>
      )}
    </section>
  )
}

function InstitutionRow({ institution }: { institution: Institution }) {
  const { t } = useTranslation()
  const edit = useEditInstitution(institution.id)
  const archive = useArchiveInstitution()
  const [mode, setMode] = useState<'view' | 'edit' | 'confirmArchive'>('view')
  const toView = () => setMode('view')
  const toEdit = () => setMode('edit')
  const toConfirmArchive = () => setMode('confirmArchive')

  if (mode === 'edit') {
    return (
      <li className="p-3">
        <h2 className="sr-only">{institution.name}</h2>
        <InstitutionForm institution={institution} onSave={edit.mutateAsync} onDone={toView} />
        {edit.isError && <ErrorMessage>{t('institutions.errors.generic')}</ErrorMessage>}
      </li>
    )
  }

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <InstitutionLogo logoKey={institution.logoKey} color={institution.color} />
        <h2 className="min-w-24 flex-1 font-medium break-words">{institution.name}</h2>
        {mode === 'view' && (
          <>
            <Button variant="outline" size="sm" aria-label={t('institutions.editNamed', { name: institution.name })} onClick={toEdit}>
              {t('institutions.edit')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('institutions.archiveNamed', { name: institution.name })}
              onClick={toConfirmArchive}
            >
              {t('institutions.archive')}
            </Button>
          </>
        )}
      </div>
      {mode === 'confirmArchive' && (
        <div role="group" aria-label={t('institutions.archiveNamed', { name: institution.name })} className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm">{t('institutions.archiveExplained', { name: institution.name })}</p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" disabled={archive.isPending} onClick={() => archive.mutate(institution.id)}>
              {t('institutions.archiveConfirm')}
            </Button>
            <Button variant="outline" size="sm" onClick={toView}>
              {t('institutions.cancel')}
            </Button>
          </div>
          {archive.isError && <ErrorMessage>{t('institutions.errors.generic')}</ErrorMessage>}
        </div>
      )}
    </li>
  )
}
