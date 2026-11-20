import { Ellipsis, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { UserMenu } from '@/features/auth'
import { useProfileLocale, useSaveLocale } from '@/features/settings'
import { cn, focusRing } from '@/shared/lib/utils'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { LanguageSwitch } from './LanguageSwitch'
import { navigation, sidebarQuery, type NavigationItem } from './navigation'
import { ThemeSwitch } from './ThemeSwitch'

/** The signed-in layout: a sidebar on wide screens, a bottom tab bar on phones. */
export function AppShell() {
  useProfileLocale()
  const wide = useMediaQuery(sidebarQuery)

  return wide ? (
    <div className="flex min-h-svh bg-background text-foreground">
      <Sidebar />
      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  ) : (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      {/* Room at the bottom so the tab bar never covers the end of a screen. */}
      <main className="min-w-0 flex-1 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}

function Sidebar() {
  const { t } = useTranslation()

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 text-sidebar-foreground">
      <p className="px-2 font-semibold">{t('app.name')}</p>
      <nav aria-label={t('nav.label')}>
        <ul className="space-y-1">
          {navigation.map((item) => (
            <li key={item.to}>
              <ListLink item={item} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto space-y-4 px-2">
        <ViewerSettings />
      </div>
    </aside>
  )
}

function TabBar() {
  const { t } = useTranslation()
  const [moreOpen, setMoreOpen] = useState(false)
  const tabs = navigation.filter((item) => item.tabIcon)
  const rest = navigation.filter((item) => !item.tabIcon)

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground"
    >
      <ul className="grid grid-cols-5">
        {tabs.map(({ to, label, tabIcon: Icon }) => (
          <li key={to}>
            <NavLink to={to} end={to === '/'} className={({ isActive }) => cn(tabClass, isActive && activeTabClass)}>
              {Icon && <Icon aria-hidden className="size-5" />}
              <span className="max-w-full text-center leading-tight break-words">{t(label)}</span>
            </NavLink>
          </li>
        ))}
        <li>
          <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
            <Dialog.Trigger className={cn(tabClass, 'w-full')}>
              <Ellipsis aria-hidden className="size-5" />
              <span>{t('nav.more')}</span>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
              <Dialog.Content
                aria-describedby={undefined}
                className="fixed inset-x-0 bottom-0 z-50 max-h-[85svh] space-y-6 overflow-y-auto rounded-t-xl border-t bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-foreground"
              >
                <div className="flex items-center justify-between">
                  <Dialog.Title className="font-semibold">{t('nav.more')}</Dialog.Title>
                  <Dialog.Close className={cn('rounded-md p-2 hover:bg-muted', focusRing)} aria-label={t('nav.close')}>
                    <X aria-hidden className="size-5" />
                  </Dialog.Close>
                </div>
                <ul className="space-y-1">
                  {rest.map((item) => (
                    <li key={item.to}>
                      <ListLink item={item} onNavigate={() => setMoreOpen(false)} />
                    </li>
                  ))}
                </ul>
                <div className="space-y-4 border-t pt-4">
                  <ViewerSettings />
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </li>
      </ul>
    </nav>
  )
}

/** A tab: icon over label, at least 44 px tall so it is easy to hit with a thumb. */
const tabClass = cn(
  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-[11px] text-muted-foreground hover:text-sidebar-foreground',
  focusRing,
)
const activeTabClass = 'font-medium text-sidebar-accent-foreground'

function ListLink({ item, onNavigate }: { item: NavigationItem; onNavigate?: () => void }) {
  const { t } = useTranslation()

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'block rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent',
          focusRing,
          isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
        )
      }
    >
      {t(item.label)}
    </NavLink>
  )
}

/** Who is signed in, and the settings that belong to this browser. */
function ViewerSettings() {
  const saveLocale = useSaveLocale()

  return (
    <>
      <UserMenu />
      <LanguageSwitch onChoose={saveLocale} />
      <ThemeSwitch />
    </>
  )
}
