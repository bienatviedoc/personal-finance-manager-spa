/** How far spending by category is drilled down, kept in the address next to the filters, so Back goes up a step. */
export const drillNames = { parentId: 'parentId', transactionsOf: 'transactionsOf' } as const

/** The names in the address the drill-down is kept in, for the frame to start it again. */
export const spendingDrillDown = Object.values(drillNames)

/** A step of the drill-down: a top-level category's subcategories, or the transactions of a category. Neither is the top. */
export type DrillStep = { parentId?: string; transactionsOf?: string }
