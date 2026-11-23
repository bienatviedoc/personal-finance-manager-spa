import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn, focusRing } from '@/shared/lib/utils'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/shared/ui/sheet'
import { escapeClosesPickerFirst } from './escapeClosesPickerFirst'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Already translated; names the drawer for screen readers too. */
  title: string
  children: ReactNode
}

/**
 * A side drawer for a form (spec section 12), with its title and a close button named in the interface's
 * language. Escape closes the list of a type-ahead picker in it before the drawer itself.
 */
export function Drawer({ open, onOpenChange, title, children }: Props) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        // The sheet's own close button has no translated name; ours does.
        showCloseButton={false}
        aria-describedby={undefined}
        onEscapeKeyDown={escapeClosesPickerFirst}
        className="w-full gap-4 overflow-y-auto bg-background p-4 text-foreground sm:max-w-md"
      >
        <div className="flex items-center justify-between">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          <SheetClose className={cn('rounded-md p-2 hover:bg-muted', focusRing)} aria-label={t('nav.close')}>
            <X aria-hidden className="size-5" />
          </SheetClose>
        </div>
        {children}
      </SheetContent>
    </Sheet>
  )
}
