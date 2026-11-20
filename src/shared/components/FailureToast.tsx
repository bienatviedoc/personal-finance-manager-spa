import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn, focusRing } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Toast, ToastAction, ToastClose, ToastProvider, ToastTitle, ToastViewport } from '@/shared/ui/toast'

type Props = {
  /** Whether the change failed. The toast stays until the user tries again or dismisses it: nothing times out. */
  failed: boolean
  /** Already translated: what was not done. */
  message: string
  /**
   * How to try again: a function that makes the change again, or the id of the form whose submitting does
   * (the toast's button then submits it, so the form's own checks and what follows a save run as usual).
   */
  retry: (() => void) | { form: string }
  /** Forgets the failure, such as a mutation's `reset`. Called before trying again, too. */
  onDismiss: () => void
}

/**
 * A toast saying that a change the user made failed, with a button to try again (spec section 12). Render it
 * next to what failed. Inside a dialog that keeps it within the dialog's focus, where a toast portalled to the
 * page would be out of reach.
 */
export function FailureToast({ failed, message, retry, onDismiss }: Props) {
  const { t } = useTranslation()
  const retryLabel = t('toast.retry')
  // Nothing while all is well: the toast's region is a landmark, and one per row of a list would only be noise.
  if (!failed) return null

  return (
    <ToastProvider label={t('toast.label')} duration={Infinity}>
      <Toast open onOpenChange={(open) => !open && onDismiss()}>
        <ToastTitle>{message}</ToastTitle>
        <ToastAction asChild altText={retryLabel}>
          {typeof retry === 'function' ? (
            <Button
              size="sm"
              onClick={(event) => {
                // Forget the failure first, and keep the toast from forgetting the new attempt as it closes.
                event.preventDefault()
                onDismiss()
                retry()
              }}
            >
              {retryLabel}
            </Button>
          ) : (
            <Button size="sm" type="submit" form={retry.form}>
              {retryLabel}
            </Button>
          )}
        </ToastAction>
        <ToastClose className={cn('rounded-md p-1 hover:bg-muted', focusRing)} aria-label={t('toast.dismiss')}>
          <X aria-hidden className="size-4" />
        </ToastClose>
      </Toast>
      <ToastViewport label={t('toast.viewport')} />
    </ToastProvider>
  )
}
