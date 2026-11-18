import path from 'node:path'
import { RuleTester } from 'eslint'
import { afterAll, describe, it } from 'vitest'
import rule from './no-cross-feature-internals.js'

RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll

const src = path.resolve(import.meta.dirname, '..', 'src')
const file = (relative) => path.join(src, relative)

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
})

const budgetsPage = file('features/budgets/routes/BudgetsPage.tsx')

ruleTester.run('no-cross-feature-internals', rule, {
  valid: [
    {
      name: "another feature's public index, by alias",
      filename: budgetsPage,
      code: "import { transactionsRoutes } from '@/features/transactions'",
    },
    {
      name: "another feature's public index file, by alias",
      filename: budgetsPage,
      code: "import { transactionsRoutes } from '@/features/transactions/index'",
    },
    {
      name: "another feature's public index, by relative path",
      filename: budgetsPage,
      code: "import { transactionsRoutes } from '../../transactions'",
    },
    {
      name: 'its own internals, by relative path',
      filename: budgetsPage,
      code: "import { BudgetRow } from '../components/BudgetRow'",
    },
    {
      name: 'its own internals, by alias',
      filename: budgetsPage,
      code: "import { BudgetRow } from '@/features/budgets/components/BudgetRow'",
    },
    {
      name: 'shared code',
      filename: budgetsPage,
      code: "import { Button } from '@/shared/ui/button'",
    },
    {
      name: 'a package',
      filename: budgetsPage,
      code: "import { useQuery } from '@tanstack/react-query'",
    },
    {
      name: "app code using a feature's public index",
      filename: file('app/router.tsx'),
      code: "import { budgetsRoutes } from '@/features/budgets'",
    },
  ],
  invalid: [
    {
      name: "another feature's internals, by alias",
      filename: budgetsPage,
      code: "import { TransactionRow } from '@/features/transactions/components/TransactionRow'",
      errors: [{ messageId: 'internals', data: { feature: 'transactions' } }],
    },
    {
      name: "another feature's internals, by relative path",
      filename: budgetsPage,
      code: "import { TransactionRow } from '../../transactions/components/TransactionRow'",
      errors: [{ messageId: 'internals', data: { feature: 'transactions' } }],
    },
    {
      name: "app code reaching into a feature's internals",
      filename: file('app/router.tsx'),
      code: "import { BudgetsPage } from '@/features/budgets/routes/BudgetsPage'",
      errors: [{ messageId: 'internals', data: { feature: 'budgets' } }],
    },
    {
      name: 'a re-export of internals',
      filename: budgetsPage,
      code: "export { TransactionRow } from '@/features/transactions/components/TransactionRow'",
      errors: [{ messageId: 'internals', data: { feature: 'transactions' } }],
    },
    {
      name: 'a dynamic import of internals',
      filename: budgetsPage,
      code: "const page = import('@/features/transactions/routes/TransactionsPage')",
      errors: [{ messageId: 'internals', data: { feature: 'transactions' } }],
    },
  ],
})
