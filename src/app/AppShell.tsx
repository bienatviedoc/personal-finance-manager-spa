import { Ellipsis, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { matchPath, NavLink, Outlet, useLocation } from 'react-router'
import { DeletionCancelledNotice, UserMenu } from '@/features/auth'
import { useProfileLocale, useSaveLocale } from '@/features/settings'
import { cn, focusRing } from '@/shared/lib/utils'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/shared/ui/sheet'
import { LanguageSwitch } from './LanguageSwitch'
import { navigation, sidebarQuery, tabs, underMore, type NavigationItem } from './navigation'
import { ThemeSwitch } from './ThemeSwitch'

/** The signed-in layout: a sidebar on wide screens, a bottom tab bar on phones. */
export function AppShell() {
  useProfileLocale()
  const wide = useMediaQuery(sidebarQuery)

  // The screen stays the same child whichever navigation shows, so turning a phone does not reset
  // what the user was in the middle of.
  return (
    <div className={cn('flex min-h-svh bg-background text-foreground', !wide && 'flex-col')}>
      {wide && <Sidebar />}
      <main
        className={cn(
          'min-w-0 flex-1',
          // Room at the bottom so the tab bar never covers the end of a screen.
          wide ? 'p-6' : 'p-4 pb-[calc(5rem+env(safe-area-inset-bottom))]',
        )}
      >
        <DeletionCancelledNotice />
        <Outlet />
      </main>
      {!wide && <TabBar />}
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
              <NavigationLink item={item} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto space-y-4 px-2">
        <UserControls />
      </div>
    </aside>
  )
}

function TabBar() {
  const { t } = useTranslation()
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const onScreenUnderMore = underMore.some((item) => matchPath({ path: item.to, end: false }, pathname))

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground"
    >
      {/* One equal column per tab, and one for More. */}
      <ul className="grid auto-cols-fr grid-flow-col">
        {tabs.map(({ to, label, tabIcon: Icon }) => (
          <li key={to}>
            <NavLink to={to} end={isHome(to)} className={({ isActive }) => cn(tabClass, isActive && activeTabClass)}>
              <Icon aria-hidden className="size-5" />
              <span className="max-w-full text-center leading-tight break-words">{t(label)}</span>
            </NavLink>
          </li>
        ))}
        <li>
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger
              aria-current={onScreenUnderMore || undefined}
              className={cn(tabClass, 'w-full', onScreenUnderMore && activeTabClass)}
            >
              <Ellipsis aria-hidden className="size-5" />
              <span>{t('nav.more')}</span>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              // The sheet's own close button has no translated name; ours does.
              showCloseButton={false}
              aria-describedby={undefined}
              className="max-h-[85svh] gap-6 overflow-y-auto rounded-t-xl bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-foreground"
            >
              <div className="flex items-center justify-between">
                <SheetTitle className="font-semibold">{t('nav.more')}</SheetTitle>
                <SheetClose className={cn('rounded-md p-2 hover:bg-muted', focusRing)} aria-label={t('nav.close')}>
                  <X aria-hidden className="size-5" />
                </SheetClose>
              </div>
              <ul className="space-y-1">
                {underMore.map((item) => (
                  <li key={item.to}>
                    <NavigationLink item={item} onNavigate={() => setMoreOpen(false)} />
                  </li>
                ))}
              </ul>
              <div className="space-y-4 border-t pt-4">
                <UserControls />
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  )
}

/** A tab: icon over label, 56 px tall at least so it is easy to hit with a thumb. */
const tabClass = cn(
  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-[11px] text-muted-foreground hover:text-sidebar-foreground',
  focusRing,
)
const activeTabClass = 'font-medium text-sidebar-accent-foreground'

/** The Dashboard's link is current only on the Dashboard itself, not on every screen beneath `/`. */
const isHome = (to: string) => to === '/'

/** A row in a list of screens: the sidebar, or the list under More. */
function NavigationLink({ item, onNavigate }: { item: NavigationItem; onNavigate?: () => void }) {
  const { t } = useTranslation()

  return (
    <NavLink
      to={item.to}
      end={isHome(item.to)}
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

/** Who is signed in and how to sign out, then the language and theme switches. */
function UserControls() {
  const saveLocale = useSaveLocale()

  return (
    <>
      <UserMenu />
      <LanguageSwitch onChoose={saveLocale} />
      <ThemeSwitch />
    </>
  )
}
