import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { defaultTestCategories, fakeCategoriesApi, type FakeCategory } from '@/test/fakeCategoriesApi'
import { fakeCategorisationRulesApi } from '@/test/fakeCategorisationRulesApi'
import { renderApp } from '@/test/renderApp'

const grab = { id: 'r-grab', matchText: 'grab', matchType: 'contains', categoryId: 'c-transport', priority: 1 } as const
const grabfood = { id: 'r-grabfood', matchText: 'grabfood', matchType: 'startsWith', categoryId: 'c-eating-out', priority: 5 } as const
const acme = { id: 'r-acme', matchText: 'ACME LTD', matchType: 'exactly', categoryId: 'c-salary', priority: 0 } as const

function fakeApis(rules: Parameters<typeof fakeCategorisationRulesApi>[0]['rules'] = [grab, grabfood, acme], categories: FakeCategory[] = defaultTestCategories) {
  const categoriesApi = fakeCategoriesApi({ categories })
  return fakeCategorisationRulesApi({ rules, categories: categoriesApi.categories })
}

const ruleList = () => screen.findByRole('list', { name: 'Rules, in the order they are tried' })
const names = async () => within(await ruleList()).getAllByRole('listitem').map((item) => item.getAttribute('aria-label'))

describe('the categorisation rules screen', () => {
  it('lists the rules in the order they are tried, highest priority first, each with its match and category', async () => {
    fakeApis()
    renderApp('/settings/categorisation-rules')

    expect(await screen.findByRole('heading', { level: 2, name: 'Categorisation rules' })).toBeInTheDocument()
    expect(await names()).toEqual(['Starts with “grabfood”', 'Contains “grab”', 'Is exactly “ACME LTD”'])
    const first = within(await ruleList()).getByRole('listitem', { name: 'Starts with “grabfood”' })
    expect(within(first).getByText('Food & drink › Eating out')).toBeInTheDocument()
    expect(within(first).getByText('Priority 5')).toBeInTheDocument()
  })

  it('is reached from settings', async () => {
    fakeApis()
    const { user } = renderApp('/settings')

    await user.click(await screen.findByRole('link', { name: 'Rules' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Categorisation rules' })).toBeInTheDocument()
  })

  it('says when there are no rules yet', async () => {
    fakeApis([])
    renderApp('/settings/categorisation-rules')

    expect(await screen.findByText('No rules yet. Add one to have imports and quick add pick a category for you.')).toBeInTheDocument()
  })

  it('adds a rule with its match text, match type, category and priority', async () => {
    const api = fakeApis([grab])
    const { user } = renderApp('/settings/categorisation-rules')

    await user.click(await screen.findByRole('button', { name: 'Add rule' }))
    const form = screen.getByRole('form', { name: 'New rule' })
    await user.type(within(form).getByLabelText('Text to look for'), 'Highlands')
    await user.selectOptions(within(form).getByLabelText('Match'), 'Starts with')
    // By the option itself: an option's text is matched as HTML, where & is written &amp;.
    await user.selectOptions(within(form).getByLabelText('Category'), within(form).getByRole('option', { name: 'Food & drink' }))
    await user.clear(within(form).getByLabelText('Priority'))
    await user.type(within(form).getByLabelText('Priority'), '3')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await names()).toEqual(['Starts with “Highlands”', 'Contains “grab”']))
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(api.requests.at(-1)).toEqual({
      method: 'POST',
      path: '/api/v1/category-rules',
      body: { matchText: 'Highlands', matchType: 'startsWith', categoryId: 'c-food', priority: 3 },
    })
  })

  it('puts a new rule left without a priority above every other', async () => {
    const api = fakeApis([grab])
    const { user } = renderApp('/settings/categorisation-rules')

    await user.click(await screen.findByRole('button', { name: 'Add rule' }))
    const form = screen.getByRole('form', { name: 'New rule' })
    await user.type(within(form).getByLabelText('Text to look for'), 'be')
    await user.selectOptions(within(form).getByLabelText('Category'), 'Transport')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await names()).toEqual(['Contains “be”', 'Contains “grab”']))
    expect(api.requests.at(-1)?.body).toEqual({ matchText: 'be', matchType: 'contains', categoryId: 'c-transport', priority: null })
  })

  it('asks for the text to look for and a category before saving', async () => {
    const api = fakeApis([])
    const { user } = renderApp('/settings/categorisation-rules')

    await user.click(await screen.findByRole('button', { name: 'Add rule' }))
    const form = screen.getByRole('form', { name: 'New rule' })
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    expect(within(form).getByLabelText('Text to look for')).toHaveAccessibleDescription('In the payee, or a statement row’s description. Enter the text to look for.')
    expect(within(form).getByLabelText('Category')).toHaveAccessibleDescription('Choose a category.')
    expect(api.requests).toEqual([])
  })

  it('edits a rule', async () => {
    const api = fakeApis()
    const { user } = renderApp('/settings/categorisation-rules')

    await user.click(await screen.findByRole('button', { name: 'Edit Contains “grab”' }))
    const form = screen.getByRole('form', { name: 'Edit rule' })
    expect(within(form).getByLabelText('Text to look for')).toHaveValue('grab')
    expect(within(form).getByLabelText('Priority')).toHaveValue(1)
    await user.selectOptions(within(form).getByLabelText('Match'), 'Is exactly')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await names()).toContain('Is exactly “grab”'))
    expect(api.requests.at(-1)).toEqual({
      method: 'PUT',
      path: '/api/v1/category-rules/r-grab',
      body: { matchText: 'grab', matchType: 'exactly', categoryId: 'c-transport', priority: 1 },
    })
    expect(api.ifMatches).toEqual(['"1"'])
  })

  it('edits a rule changed somewhere else since it was opened from the latest version, saying so', async () => {
    const api = fakeApis([grab])
    const { user } = renderApp('/settings/categorisation-rules')

    await user.click(await screen.findByRole('button', { name: 'Edit Contains “grab”' }))
    // Given new match text in another tab, after this one was opened.
    Object.assign(api.rules[0]!, { matchText: 'grab bike', rowVersion: '2' })
    await user.selectOptions(within(screen.getByRole('form', { name: 'Edit rule' })).getByLabelText('Match'), 'Is exactly')
    await user.click(within(screen.getByRole('form', { name: 'Edit rule' })).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('This rule was changed somewhere else since you opened it. The latest version is shown; check it and save again.')).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole('form', { name: 'Edit rule' })).getByLabelText('Text to look for')).toHaveValue('grab bike'))
    expect(api.rules[0]!.matchType).toBe('contains')

    await user.click(within(screen.getByRole('form', { name: 'Edit rule' })).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.ifMatches).toEqual(['"1"', '"2"']))
    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument())
  })

  it('moves a rule up or down, which reorders them all', async () => {
    const api = fakeApis()
    const { user } = renderApp('/settings/categorisation-rules')

    await user.click(await screen.findByRole('button', { name: 'Move Is exactly “ACME LTD” up' }))

    await waitFor(async () => expect(await names()).toEqual(['Starts with “grabfood”', 'Is exactly “ACME LTD”', 'Contains “grab”']))
    expect(api.requests.at(-1)).toEqual({
      method: 'PUT',
      path: '/api/v1/category-rules/order',
      body: { rules: [{ id: 'r-grabfood', rowVersion: '1' }, { id: 'r-acme', rowVersion: '1' }, { id: 'r-grab', rowVersion: '1' }] },
    })
    expect(screen.getByRole('button', { name: 'Move Starts with “grabfood” up' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Move Starts with “grabfood” down' }))
    await waitFor(async () => expect(await names()).toEqual(['Is exactly “ACME LTD”', 'Starts with “grabfood”', 'Contains “grab”']))
  })

  it('moves nothing when the rules were changed somewhere else since they were shown, saying so and showing them as they are now', async () => {
    const api = fakeApis()
    const { user } = renderApp('/settings/categorisation-rules')
    await ruleList()
    // Given a rule edited in another tab, after this one listed them.
    Object.assign(api.rules.find((rule) => rule.id === 'r-grab')!, { matchText: 'grab bike', rowVersion: '2' })

    await user.click(screen.getByRole('button', { name: 'Move Is exactly “ACME LTD” up' }))

    expect(await screen.findByText('The rules were changed somewhere else. They are shown as they are now; move the rule again.')).toBeInTheDocument()
    await waitFor(async () => expect(await names()).toEqual(['Starts with “grabfood”', 'Contains “grab bike”', 'Is exactly “ACME LTD”']))
  })

  it('deletes a rule once the user confirms', async () => {
    const api = fakeApis()
    const { user } = renderApp('/settings/categorisation-rules')

    await user.click(await screen.findByRole('button', { name: 'Delete Contains “grab”' }))
    await user.click(screen.getByRole('button', { name: 'Delete rule' }))

    await waitFor(async () => expect(await names()).toEqual(['Starts with “grabfood”', 'Is exactly “ACME LTD”']))
    expect(api.requests.at(-1)).toEqual({ method: 'DELETE', path: '/api/v1/category-rules/r-grab', body: null })
  })

  it('says a rule whose category is archived categorises nothing', async () => {
    fakeApis([grab], defaultTestCategories.map((category) => (category.id === 'c-transport' ? { ...category, isArchived: true } : category)))
    renderApp('/settings/categorisation-rules')

    const rule = within(await ruleList()).getByRole('listitem', { name: 'Contains “grab”' })

    expect(within(rule).getByText('Its category is archived: this rule categorises nothing until you choose another.')).toBeInTheDocument()
  })
})
