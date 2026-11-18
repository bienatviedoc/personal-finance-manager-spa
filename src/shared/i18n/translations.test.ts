import { describe, expect, it } from 'vitest'
import { resources, supportedLanguages } from '.'

type Tree = { [key: string]: string | Tree }

/** Every leaf key as a dotted path, with its value. */
function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  )
}

const english = new Map(leaves(resources.en.translation))

describe.each(supportedLanguages.filter((language) => language !== 'en'))('%s translations', (language) => {
  const translated = new Map(leaves(resources[language].translation))

  it('have every English key', () => {
    const missing = [...english.keys()].filter((key) => !translated.has(key))
    expect(missing).toEqual([])
  })

  it('have no keys that English lacks', () => {
    const extra = [...translated.keys()].filter((key) => !english.has(key))
    expect(extra).toEqual([])
  })

  it('have no empty strings', () => {
    const empty = [...translated].filter(([, value]) => value.trim() === '').map(([key]) => key)
    expect(empty).toEqual([])
  })
})
