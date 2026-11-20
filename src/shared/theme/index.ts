import { useEffect, useSyncExternalStore } from 'react'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'

/** What the viewer picked: follow the system, or always light or dark. */
export const themeChoices = ['system', 'light', 'dark'] as const
export type ThemeChoice = (typeof themeChoices)[number]

/** Also read by the script in index.html that sets the theme before the app loads. */
const storageKey = 'pfm.theme'
const darkQuery = '(prefers-color-scheme: dark)'
/** The browser bar's colour in each theme; index.html starts with the same two, one per system theme. */
const barColor = { light: '#ffffff', dark: '#0a0a0a' }

const listeners = new Set<() => void>()
/** The choice when storage refuses to hold it. */
let fallbackChoice: ThemeChoice | undefined

function subscribeToChoice(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(storageKey)
    return themeChoices.includes(stored as ThemeChoice) ? (stored as ThemeChoice) : 'system'
  } catch {
    return 'system'
  }
}

/** Remembers the viewer's choice in their browser; following the system stores nothing. */
export function chooseTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, choice)
    fallbackChoice = undefined
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the choice then lasts until a reload.
    fallbackChoice = choice
  }
  for (const listener of listeners) listener()
}

/** The viewer's theme choice. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribeToChoice, () => fallbackChoice ?? readChoice())
}

/**
 * Keeps the page's theme in step with the viewer's choice and, while they follow the system, with
 * the system's setting; the browser bar's colour goes with it. Mount once, near the root.
 */
export function useApplyTheme() {
  const choice = useThemeChoice()
  const systemDark = useMediaQuery(darkQuery)
  const dark = choice === 'system' ? systemDark : choice === 'dark'

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    // Each theme-color in index.html answers to one system theme; a choice of light or dark takes over both.
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      const forDark = choice === 'system' ? (meta.getAttribute('media') ?? '').includes('dark') : dark
      meta.setAttribute('content', forDark ? barColor.dark : barColor.light)
    }
  }, [choice, dark])
}
