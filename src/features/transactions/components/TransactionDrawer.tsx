import { useTranslation } from 'react-i18next'
import type { Account } from '@/features/accounts'
import type { Category } from '@/features/categories'
import { Drawer } from '@/shared/components/Drawer'
import type { Transaction } from '../api/transactions'
import type { DrawerFor } from '../hooks/useTransactionDrawer'
import { EditTransaction } from './EditTransaction'
import { AddTransfer, OpenTransfer } from './TransferDrawer'

type Props = {
  drawer: DrawerFor
  /** The transaction being edited, as `useTransactionDrawer` follows it. */
  editing: Transaction | undefined
  /** Every account and category, archived ones too; nothing opens until both are loaded. */
  accounts: Account[] | undefined
  categories: Category[] | undefined
  onClose: () => void
}

/** The drawer itself: the transaction form, a new transfer, or a transfer opened from one of its legs. */
export function TransactionDrawer({ drawer, editing, accounts, categories, onClose }: Props) {
  const { t } = useTranslation()
  const title =
    drawer && 'transferId' in drawer ? t('transfers.editTitle') : drawer && 'transferring' in drawer ? t('transfers.new') : t('transactions.editTitle')
  const loaded = accounts !== undefined && categories !== undefined

  return (
    <Drawer open={drawer !== null} onOpenChange={(open) => !open && onClose()} title={title}>
      {loaded && editing && <EditTransaction transaction={editing} accounts={accounts} categories={categories} onClose={onClose} />}
      {loaded && drawer && 'transferring' in drawer && <AddTransfer accounts={accounts} onClose={onClose} />}
      {loaded && drawer && 'transferId' in drawer && <OpenTransfer id={drawer.transferId} accounts={accounts} categories={categories} onClose={onClose} />}
    </Drawer>
  )
}
