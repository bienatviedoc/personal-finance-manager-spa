import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'

const expenseList = () => screen.getByRole('list', { name: 'Expense categories' })
const incomeList = () => screen.getByRole('list', { name: 'Income categories' })
const row = (list: HTMLElement, name: string) => within(list).getByRole('listitem', { name })

describe('the categories screen', () => {
  it('shows the expense and income categories as a tree', async () => {
    fakeCategoriesApi()
    renderApp('/settings/categories')

    expect(await screen.findByRole('heading', { level: 2, name: 'Categories' })).toBeInTheDocument()
    const food = row(await screen.findByRole('list', { name: 'Expense categories' }), 'Food & drink')
    expect(within(within(food).getByRole('list')).getAllByRole('listitem').map((item) => item.getAttribute('aria-label'))).toEqual([
      'Eating out',
      'Groceries',
    ])
    expect(row(incomeList(), 'Salary')).toBeInTheDocument()
    expect(within(expenseList()).queryByRole('listitem', { name: 'Salary' })).not.toBeInTheDocument()
  })

  it('is reached from settings', async () => {
    fakeCategoriesApi()
    const { user } = renderApp('/settings')

    await user.click(await screen.findByRole('link', { name: 'Categories' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Categories' })).toBeInTheDocument()
  })

  it('adds a category with a name, icon and colour', async () => {
    const api = fakeCategoriesApi()
    const { user } = renderApp('/settings/categories')

    await user.click(await screen.findByRole('button', { name: 'Add expense category' }))
    const form = screen.getByRole('form', { name: 'New expense category' })
    await user.type(within(form).getByLabelText('Name'), 'Pets')
    await user.click(within(form).getByRole('radio', { name: 'Paw print' }))
    await user.click(within(form).getByRole('radio', { name: 'Amber' }))
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    expect(await within(expenseList()).findByRole('listitem', { name: 'Pets' })).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(api.requests.at(-1)).toEqual({ method: 'POST', body: { parentId: null, name: 'Pets', kind: 'expense', icon: 'paw-print', color: '#eab308' } })
  })

  it('adds a subcategory, which always has its parent’s kind', async () => {
    const api = fakeCategoriesApi()
    const { user } = renderApp('/settings/categories')

    await user.click(await screen.findByRole('button', { name: 'Add a subcategory to Food & drink' }))
    const form = screen.getByRole('form', { name: 'New subcategory of Food & drink' })
    expect(within(form).queryByRole('radio', { name: 'Income' })).not.toBeInTheDocument()
    await user.type(within(form).getByLabelText('Name'), 'Coffee')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    const food = row(expenseList(), 'Food & drink')
    expect(await within(food).findByRole('listitem', { name: 'Coffee' })).toBeInTheDocument()
    expect(api.requests.at(-1)?.body).toMatchObject({ parentId: 'c-food', kind: 'expense', icon: 'utensils', color: '#f97316' })
  })

  it('offers no subcategory under a subcategory: categories are two levels deep', async () => {
    fakeCategoriesApi()
    renderApp('/settings/categories')

    const groceries = row(await screen.findByRole('list', { name: 'Expense categories' }), 'Groceries')

    expect(within(groceries).queryByRole('button', { name: /Add a subcategory/ })).not.toBeInTheDocument()
  })

  it('renames, recolours and re-icons a category', async () => {
    const api = fakeCategoriesApi()
    const { user } = renderApp('/settings/categories')

    await user.click(await screen.findByRole('button', { name: 'Edit Transport' }))
    const form = screen.getByRole('form', { name: 'Edit Transport' })
    expect(within(form).getByRole('radio', { name: 'Car' })).toBeChecked()
    await user.clear(within(form).getByLabelText('Name'))
    await user.type(within(form).getByLabelText('Name'), 'Getting around')
    await user.click(within(form).getByRole('radio', { name: 'Bus' }))
    await user.click(within(form).getByRole('radio', { name: 'Teal' }))
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    expect(await within(expenseList()).findByRole('listitem', { name: 'Getting around' })).toBeInTheDocument()
    expect(api.requests.at(-1)).toEqual({ method: 'PUT', body: { name: 'Getting around', kind: 'expense', icon: 'bus', color: '#14b8a6' } })
  })

  it('moves a category, with its subcategories, to the other kind', async () => {
    fakeCategoriesApi()
    const { user } = renderApp('/settings/categories')

    await user.click(await screen.findByRole('button', { name: 'Edit Investments' }))
    await user.click(screen.getByRole('radio', { name: 'Expense' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const investments = await within(expenseList()).findByRole('listitem', { name: 'Investments' })
    expect(within(investments).getByRole('listitem', { name: 'Interest' })).toBeInTheDocument()
    expect(within(incomeList()).queryByRole('listitem', { name: 'Investments' })).not.toBeInTheDocument()
  })

  it('explains that a category’s kind cannot change once it has transactions', async () => {
    fakeCategoriesApi({ withTransactions: ['c-salary'] })
    const { user } = renderApp('/settings/categories')

    await user.click(await screen.findByRole('button', { name: 'Edit Salary' }))
    await user.click(screen.getByRole('radio', { name: 'Expense' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('The kind cannot change once the category has transactions.')).toBeInTheDocument()
    expect(row(incomeList(), 'Salary')).toBeInTheDocument()
  })

  it('points out a missing name before contacting the API', async () => {
    const api = fakeCategoriesApi()
    const { user } = renderApp('/settings/categories')

    await user.click(await screen.findByRole('button', { name: 'Add income category' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(api.requests).toEqual([])
  })

  it('archives a category and its subcategories after asking, hiding them unless archived ones are shown', async () => {
    fakeCategoriesApi()
    const { user } = renderApp('/settings/categories')

    await user.click(await screen.findByRole('button', { name: 'Archive Food & drink' }))
    expect(screen.getByText('Archive Food & drink and its subcategories? They disappear from pickers and stay on existing transactions.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Archive' }))

    await expect.poll(() => within(expenseList()).queryByRole('listitem', { name: 'Food & drink' })).toBeNull()

    await user.click(screen.getByRole('checkbox', { name: 'Show archived categories' }))
    const food = await within(expenseList()).findByRole('listitem', { name: 'Food & drink' })
    expect(within(food).getAllByText('Archived')).toHaveLength(3)
    expect(within(food).queryByRole('button', { name: 'Archive Food & drink' })).not.toBeInTheDocument()
  })

  it('keeps a category when archiving is cancelled', async () => {
    fakeCategoriesApi()
    const { user } = renderApp('/settings/categories')

    await user.click(await screen.findByRole('button', { name: 'Archive Transport' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(row(expenseList(), 'Transport')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  })

  it('is shown in Vietnamese', async () => {
    fakeCategoriesApi()
    renderApp('/settings/categories', { language: 'vi' })

    expect(await screen.findByRole('heading', { level: 2, name: 'Danh mục' })).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Danh mục chi tiêu' })).toBeInTheDocument()
  })
})
