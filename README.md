# Personal Finance Manager SPA

The React single-page app for the Personal Finance Manager. It talks only to the
[API](https://github.com/bienatviedoc/personal-finance-manager-api), where the
[specification](https://github.com/bienatviedoc/personal-finance-manager-api/blob/main/docs/specification.md) and
[glossary](https://github.com/bienatviedoc/personal-finance-manager-api/blob/main/GLOSSARY.md) live. Use the glossary's
terms in code, tests and the interface.

## Run it

Requires Node 24, and the API running locally: `docker compose up --build` in the API repository.

```bash
npm install
npm run dev
```

The dev server on http://localhost:5173 proxies `/api` to the API on :8080, so the browser sees one origin and
the session cookie stays first-party. Emails the API sends, such as verification links, land in Mailpit at
http://localhost:8025.

| Script | What |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run lint` | ESLint, failing on any warning |
| `npm run typecheck` | `tsc` with no output |
| `npm test` | Unit and component tests (Vitest) |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serve the production build locally, with the headers the nginx image sends |
| `npm run api:sync` | Copy the API's OpenAPI document and regenerate the client's types |

CI runs lint, typecheck, tests and the build on every pull request, and fails when the generated API client no
longer matches the API, when a dependency has a known vulnerability of high severity, or when the image does.

## Talking to the API

- **The client is generated.** `src/shared/api/schema.d.ts` is generated from the API's OpenAPI document; never
  write request or response types by hand. Call the API through `api` from `src/shared/api/client.ts`.
- **Keeping in step.** `npm run api:sync` copies the document from the API clone next to this one (or the file
  `PFM_OPENAPI` points to) and regenerates the types; commit both. CI copies it from the API's `main` branch
  instead, so merge an API change first, then the SPA change that uses it.
- **One shape per feature** in `features/<feature>/api/`: reads are `queryOptions` named after what they load
  (`institutionsQuery`, `categoriesQuery`), used with `useQuery`; changes are hooks named after the API's use case
  (`useCreateCategory`, `useEditCategory`, `useArchiveCategory`). A save answers `{ saved: true, <entity> }` with
  what the API saved (just `{ saved: true }` when it answers nothing, as registering does), or `{ saved: false, fields }` naming the fields a 400 refused (`refusedFields` in
  `src/shared/api/`), for the form to show its own translated messages; anything else throws. A change that
  can fail in a way no field explains (resetting a password with a used link) names its outcomes instead.
- **An edit names the version it was made from.** Where the API guards a record with a row version (accounts),
  the edit hook takes the record and sends its `rowVersion` as `If-Match` (`useEditAccount(account)`). A 412
  means it changed somewhere else: the outcome is `{ saved: false, stale: true }`, the list is loaded again, and
  the screen shows the latest version for the user to check and save again. Never retry over it.
  `src/shared/api/versionedSave.ts` holds the shape for every such record: the outcome type, the mapping from
  the API's answer (`versionedSaveOutcome`), the header (`ifMatch`) and `isStale` for the screen.
- **Lists come a page at a time** (`limit`, `cursor`, `nextCursor`). A query for something a user has dozens of,
  such as institutions, loads every page. One for something they have thousands of, transactions, is an
  infinite query (`transactionsQuery(filters)`) that loads the next page when the screen asks for more.
- **The transaction list's filters and sort order live in the address** (spec section 12): `from`, `to`,
  `accountId`, `categoryId`, `type`, `min`, `max`, `q`, `sort` and `order`, named as the API's query names them,
  so a view can be bookmarked and opened in another session. `useTransactionFilters` reads them (leaving out
  what the API could not read) and changes them; the list is a query per view. The filter bar applies a choice
  at once and something typed once the typing pauses. Never keep a filter in component state alone.
- **Tags** (spec TXN-5) are names the API keeps trimmed and in lower case, created the first time a transaction is
  given one. `tagsQuery` loads every page of the user's tags, under the transactions' key, so a save that creates
  one loads them again. `TagsField` adds and removes them on the transaction form, suggesting the user's own;
  the list filters by one through `tag` in the address, like the other filters.
- **The total of a filtered list is the API's** (`total` on every page: a count, and income, expenses and net in
  each currency; the legs of a transfer are counted and are in neither). `TransactionTotal` shows it; the SPA never adds up the rows it has loaded. Filtered by a category, `total.spent`
  comes first, as the one figure that is the category's budget's spent; the totals in each currency follow under
  their own caption, as they are not converted and need not match it.
- **The transaction list is virtualised** (spec section 8): `VirtualRows` keeps only the rows near the screen in
  the page, over [TanStack Virtual](https://tanstack.com/virtual), with the page itself scrolling. The next page
  is loaded as the last loaded row comes near the screen; skeletons stand in for a view, or a next page, that
  is loading.
- **Adding and editing a transaction is optimistic**, and nothing else is (spec section 12). The save hooks put
  the transaction in the cached list as soon as it is sent, put the list back if the API refuses it or the
  request fails, and load the list again once the API has answered. That list is the one of everything, newest
  first: only the API knows whether a transaction passes a filter or where another sort order has it, so a
  filtered or re-sorted view shows the change once the API has answered. One not yet answered is a
  `PendingTransaction`: it has no id or row version, so it offers nothing to edit or delete (`isPending`).
- **Quick add** (spec TXN-8 and section 12). `<QuickAdd>` from `@/features/transactions` wraps every screen in
  the shell: pressing N anywhere opens the drawer that records a transaction (not while typing, and not over
  another drawer or dialog), and nothing is loaded until it first opens. The transactions screen's own button
  opens the same drawer through `useQuickAdd()`. The form starts on the account the API says was used last
  (`lastAccountQuery`), and a new transaction takes the category its payee most often had
  (`suggestedCategoryQuery`, asked once the payee has been left alone for a moment) until the user picks one
  themselves. Enter saves and the drawer stays open, cleared, for the next transaction.
- **A type-ahead picker** is `<ComboboxField>` from `@/shared/components`: typing narrows the options, whatever
  the case or accents; the arrows and Enter, a click, or leaving the field choose. Enter with its list closed is
  the form's. In a `Drawer`, Escape closes its list before the drawer (`escapeClosesPickerFirst`). Tests choose from
  one with `choose` and read what it offers with `offeredBy` (`src/test/combobox.ts`).
- **A split transaction sends `lines` in place of `categoryId`** (see the glossary: split transaction, line), and
  every transaction answers its `lines`, one when it is not split (`isSplit`). The form shows what remains of the
  amount to split and sends nothing until that is nothing; the API checks the sum again. What remains is worked
  out by `remainingAmount` in `src/shared/money`, on the digits of the decimal strings: the one place amounts are
  subtracted, and still never through a JavaScript `number`. The API names what it refuses about one line by
  where it is (`lines[1].categoryId`); the form says it once, for all the lines.
- **A refund is an expense with `isRefund` set** (see the glossary), never a type of its own: the form offers the
  flag to an expense only, and the list marks a refund and shows its amount coming back (`+`), since it raises
  the balance.
- **A change to a transaction moves a balance,** so saving or deleting one also loads the accounts again,
  through `refreshAccountBalances` from `@/features/accounts`. A feature that changes what another shows asks
  that feature to refresh it; it never touches the other's query keys. Two features may import each other this
  way: merging a category refreshes transactions and recurring rules, which both name categories. Such a cycle is
  allowed while one side only calls the other's `refresh…` at run time, never at import.
- **A transfer is two transactions in the list.** The API lists a transfer as its two legs (`transferOut`,
  `transferIn`), each on its own account and carrying the `transferId` they share; the list marks them as a
  transfer. A leg is never edited or deleted as a transaction: either leg opens the transfer form, which loads
  the transfer by that id (`transferQuery`) and saves both legs through `/transfers` (`features/transactions/api/transfers.ts`).
  Between accounts in different currencies the form asks for both amounts; nothing converts one into the other.
  Recording a transfer is not optimistic; it carries an `Idempotency-Key` like a new transaction.
- **Selecting transactions.** Every transaction the API has can be selected in the list, one by one, or all
  that pass the filters at once ("Select all N transactions", N being the API's `total.count`), loaded on the
  screen or not. A bulk action takes at most 1,000 (`maxBulkSelection` in `src/shared/api/limits.ts`): a view more
  pass offers no "Select all" and says to narrow the filters, and if more pass by the time the action is sent, the
  API's 422 (`bulk-selection-too-large`) says the same. One by one, they stay selected as they were when a filter hides them; all of them belong to the view
  they were selected in, and unselecting one leaves the others loaded selected one by one.
- **Bulk actions** (spec TXN-7; see the glossary). `BulkActions` acts on what is selected through
  `POST /transactions/bulk` (`useBulkEdit`): set the category, add or remove a tag, move to another account, or
  delete (once confirmed). Selected one by one, it sends their `transactionIds`; all of them, the view's filters as
  `filter`, and the API finds them. All take it or none does: the API decides, never the screen, and when it refuses
  (a 409) the screen names each transaction it refused with why, translated from its `reason`, and keeps the selection.
  Each refused one comes with the transaction as it is (`transaction`), so it is named by its title, date and amount
  whether it is loaded on the screen or not; one the API no longer has is named as the list had it.
  Done, the selection is cleared and the lists, balances, budgets and reports are loaded again, as after any change.
- **Marking as a transfer** (spec IMP-7; see the glossary). Once one or two income and expenses are selected
  (`canBePicked`: not a refund, not a leg), `MarkAsTransfer` is offered; with one expense and one income it sends them to
  `POST /transfers/mark` and both become the legs of one transfer. The screen says why it cannot before asking
  (one account, two dates, two amounts in one currency), and the API checks again; a refusal means one of them
  changed, so the list is loaded again. Nothing is matched automatically. The transfer drawer unmarks any transfer
  (`useUnmarkTransfer`): the user chooses an expense category and an income category, as a leg has none.
- **Recently deleted** (spec section 3, rule 10). A deleted transaction can be restored for 30 days at
  `/transactions/deleted`, linked from the transactions screen (`RecentlyDeletedPage`, `recentlyDeletedQuery`,
  `useRestoreTransaction`). Each shows when it can be restored until, the date the API answers, on the user's calendar.
  Restoring a leg of a transfer restores the whole transfer; the API decides what can still be restored, and its
  worker removes the rest for good. Restoring loads the lists, balances, budgets and reports again, like any change.
- **Merging categories** (spec CAT-3; see the glossary). Each category on the categories screen offers Merge
  (`MergeCategoryForm`): the user picks the category to merge into, of the same kind and not archived, never the
  category itself or one of its own subcategories, and only a top-level one for a category with subcategories, so
  the tree stays two levels deep. Once one is picked, the screen says how many transactions and budgets will move,
  as the API counts them (`categoryMergePreviewQuery`), and merges only when the user confirms
  (`useMergeCategory`). The API checks it all again; a refusal on `targetId` (a budget on the category and its parent
  in the same month) is said in the form. Merged, the categories, lists, balances, budgets and reports load again.
- **Reconciliation** (spec ACC-7, section 3 rule 11; see the glossary). Each account on the accounts screen links to
  `/accounts/:accountId/reconcile` (`features/reconciliations`), which works on the account's latest reconciliation
  (`latestReconciliationQuery`): the user enters the statement date and closing balance, ticks the transactions
  the statement shows (`transactionsToTickQuery`, `useTickTransaction`, `useUntickTransaction`), and completes it once the difference is exactly zero.
  The difference is the API's, as it answers each tick; the SPA adds nothing up and never adds an adjustment.
  Completing locks what is ticked, and reopening the latest one unlocks it; both load the transactions again. A
  reconciled transaction is marked in the list and offers no delete; its edit says what is locked, and the
  API refuses a change to the amount, date, account or type on that field. A transfer either of whose legs is
  reconciled is locked the same way and offers no unmark.
- **A change that fails says so in a toast with "Try again"** (spec section 12): `<FailureToast>` from
  `@/shared/components`, rendered next to what failed, for a failure no field explains (the request failed, or
  the API answered an error). Trying again submits the form again (`retry={{ form: id }}`) or makes the change
  again; fields the API refused stay under their inputs. The toast is the Radix primitive in
  `src/shared/ui/toast.tsx`, and stays until the user answers it.
- **A new transaction carries an `Idempotency-Key`**, made up once for each request the user means to make
  (`useIdempotencyKey` in `src/shared/api`, as a new transfer does). Saving the same values again after a failure sends the same key, so the API cannot record
  the transaction twice. Values changed after a failure are a new request with a new key (the API refuses a
  used key that comes with a different body), and so is the next transaction.
- **Attachments** (receipts) live in the drawer of a transaction the API has recorded (`Attachments` in
  `features/transactions`): attach one, open one, remove one. A file is a JPEG, PNG or PDF of at most 5 MB; the
  screen says so before sending what the browser can already tell is not (`whyNotAttachable`), and the API has
  the last word, reading the file itself. The upload is the one request that is a form, not JSON
  (`useAddAttachment`).
- **An attached file is opened through a signed URL**, which the API hands out for a few minutes and which
  needs no sign-in. Ask for one each time the user opens the file (`useOpenAttachment`, a mutation), put it
  nowhere but the tab it opens in, and never in the query cache, a link or a log. The tab is opened in the click
  itself and sent to the URL once the API answers, or browsers would block it as a pop-up. The file is served
  by the storage, another origin, so nothing in the content security policy changes; showing a file inside the
  app (a thumbnail) would mean adding the storage's address to the policy on purpose.
- **Importing a statement** (spec IMP-1, IMP-3; see the glossary: import batch, statement file, mapping, preview,
  likely duplicate) is `features/imports`, at `/import`. The user picks an account and a CSV file, which is uploaded as
  a form (`useUploadStatement`) and opens `/import/:batchId`; nothing is imported yet. The mapping starts from the
  API's guess at the layout (`suggestedMapping`: the separator, and the header row after any preamble) and every
  choice is the user's: the separator, the rows to skip at the start and end, whether a row names the columns, the
  date, description and amount columns (one signed amount, or a debit and a credit), the date format and the decimal
  separator (`MappingForm`). No bank's layout is built in (spec section 15). Each change asks the API for the
  preview again (`importPreviewQuery`, the mapping in its key, the last answer shown meanwhile); the SPA reads no
  CSV itself. Until the date and amount columns are mapped it shows the first rows cut into cells, named by the
  header row (`RawRows`); then every row (`PreviewTable`): the transactions, each ticked unless the API marks it a
  likely duplicate, the rows that cannot be read with why (translated from the API's `problem`), and the rows
  passed over. A new mapping is a new preview, so the ticks start again from the API's. The screen says how many
  rows will be imported, how many likely duplicates skipped and how many rows cannot be read, counting the rows the
  API answered; it adds up no amount. Committing sends the mapping, the rows ticked and a category for money going
  out and one for money coming in, asked for only when a row ticked moves money that way (`useCommitImport`).
  The API's worker then imports in the background: the batch is asked for every second while it is `committing`
  (`importBatchQuery`), and `ImportProgress` shows how many are imported as a progress bar, then what was imported
  and skipped, or that it stopped, and loads the lists, balances, budgets and reports again
  (`refreshTransactions`). Every imported transaction carries its `importBatchId`. Saving the mapping per account,
  undoing a batch and auto-categorisation are still to come (#23, #24).
- **Recurring rules** (`features/recurring`) are income and expenses that repeat. The SPA only sets them up,
  edits, pauses, resumes and deletes them; the API's worker records each occurrence as a transaction on its due
  date, and works out every date (`nextRunDate`). The SPA never computes a due date. A transaction a rule posted
  carries `recurringRuleId`, and its row links to `/recurring?rule=<id>` (`RecurringRuleLink`), where that rule is
  pointed out. A rule is income or an expense, never a transfer; use the glossary's term, recurring rule.
- **A rule records or reminds** (`mode`): one that reminds records nothing by itself, and each occurrence due by
  today is a reminder (`remindersQuery`) the user confirms, for the rule's amount or another they enter
  (`useConfirmReminder`, which sends `amount` only when it differs), or dismisses (`useDismissReminder`). A
  rule's reminders are answered earliest first; a later one is refused on `dueDate` and the screen says so.
  The upcoming list (`upcomingQuery`, 30 days) is the API's: the SPA never works out a due date, here either.
- **A change to a transaction moves what was spent,** too, so the same hooks load the budgets again through
  `refreshBudgets` from `@/features/budgets`. Setting the first budget locks the base currency and removing the
  last one unlocks it, so the budget hooks load the profile again (`refreshProfile` from `@/features/settings`).
- **Budget notifications** (spec BUD-7; see the glossary) are raised by the API after a change that moves what was
  spent; the SPA only shows them. `BudgetNotifications` from `@/features/budgets`, a bell in the sidebar (atop the
  screen on phones), says how many are unread and opens a drawer listing them the newest first, a page at a time
  (`budgetNotificationsQuery`). Choosing one opens its budget month and marks it read; "Mark all as read" reads
  them all (`useReadBudgetNotification` and `useReadAllBudgetNotifications`, after the API's use cases). Their key is under the budgets', so `refreshBudgets` after any change
  loads them again. Whether they are also emailed is a profile setting (`emailBudgetNotifications`).
- **A budget is set, not created or edited:** `useSetBudget(month)` sends `PUT /budgets/{month}/{categoryId}`
  with the budget's `rowVersion` as `If-Match` when the category already has one that month and without it when
  it has none; `useRemoveBudget(month)` removes it.
- **Last month's budgets are copied in one action** (BUD-4): the budget screen's "Copy budgets from …" button
  calls `useCopyBudgets(month)` with the month before the one shown. The API decides what is copied (never over a
  budget the month has, nor onto an archived category) and answers how many; the screen says that number.
- **The dashboard** (spec RPT-1, `/`) is one request, `GET /api/v1/reports/dashboard` (`dashboardQuery` in
  `features/dashboard`): the total balance, this month's income, expenses and net, budget status, the top five
  categories, the ten latest transactions and what recurring rules will record or remind about in the next 30 days.
  Every figure is the API's, worked out as the accounts screen and the reports work it out; the screen adds nothing
  up, and signs an amount only as the transaction list does. Each card links to what is behind it: the accounts,
  income vs expenses and spending by category for this month (`period=thisMonth`), the budgets, the transactions and
  the recurring rules. The budget card shows this month's overall budget and its pace (`PaceLabel` from
  `@/features/budgets`, as the budget screen shows it) above the category budgets, and the overall budget alone to a
  user with no category budget. Skeletons stand in for the cards while it loads, and a user with no account that is not
  archived (`hasAccounts`) is shown how to add one instead. Nearly anything done elsewhere moves something on it, so
  it is loaded again every time it opens (`staleTime: 0`), and a change to a transaction made on it (quick add) loads it
  again through `refreshDashboard`.
- **Reports share one frame** (spec sections 7 and 12). `ReportFrame` in `features/reports/frame` holds what every
  report has: the period (a preset, or dates the user chooses), the account and category filters, comparing with
  the period before, and the chart or table view, all in the address (`period`, `from`, `to`, `accountId`,
  `categoryId`, `compare`, `view`), read and changed by `useReportFilters`. A preset is kept by name and worked
  out again on the day the view is opened (`periodOf`, in whole calendar months), so a bookmark of "this month"
  always shows the month it is. A report draws what the filters ask for and keeps its own state in the address
  beside them (how far spending by category is drilled down: `parentId`, `transactionsOf`, where Back goes up a
  step; the payee trends follows: `payee`, and `type` when it is followed by what was received from it). A new report is an entry in the list in `ReportsPage`. Every figure, share and the period compared with
  are the API's; the screen adds nothing up. What is not converted is flagged next to the figure it is left out of
  (`NotConverted`). A change to a transaction loads the reports again (`refreshReports`). Income vs expenses
  (`income/IncomeVsExpensesReport`) shows each month's income, expenses, net and savings rate as grouped bars with a
  net line or a table, the whole period beside them, and the period before when compared: its totals, its months
  in a table of their own, and its net as a dashed line in the chart, month by month by place. Net worth
  (`netWorth/NetWorthReport`) shows the assets, the liabilities below zero and net worth as a line over them at each
  month end, and on the period's last day when it ends inside a month, as stacked areas or a table, with the latest
  net worth above; it takes no category filter and is not compared. Budget vs actual
  (`budgetVsActual/BudgetVsActualReport`) sets each category's budget against what was spent as horizontal bars or a
  table with the totals, and lists apart what was spent with no budget. Cash flow (`cashFlow/CashFlowReport`,
  `cashFlowQuery`) shows the running balance at the end of every day, or of every week once Weekly is chosen (kept in
  the address as `interval=week`), as a line or a table: of one account in its own currency with the account filter,
  otherwise of all of them in the base currency. It takes no category filter and is not compared.
- **The account detail page** (`/accounts/:accountId`, spec section 12) lives in `features/transactions`, since it is
  an account's transactions and balance, and the accounts feature depends on neither. Each account's name on the
  accounts screen links to it. It shows the account's balance, its running balance over the last 90 days as a line or
  a table (`AccountBalance` from `@/features/reports`, loaded with the charting library when first shown), its
  transactions newest first, edited in a drawer as on the transactions screen, and links on to reconciling it (not
  when archived), to the transactions screen filtered by it, and to its cash flow report.
- **Every report downloads as CSV** (spec section 7, export), from the answer already on screen, in either view:
  `ExportCsv` in `features/reports/frame` saves the numbers of the report's table view (`saveCsv` from
  `@/shared/lib/csv`, RFC 4180 and UTF-8 with a byte order mark, as the API writes its own), named for the report
  and its period (`net-worth-2026-01-01-2026-03-31.csv`). Columns take the API's names, amounts stay as the API
  answers them, plain decimals beside a `currency` column, and dates are `YYYY-MM-DD`; a report that compares adds
  the period before. No report asks the API for a file.
- **A CSV file is the same in every language.** Nothing in it is translated: a report whose rows are of more than one
  kind starts each with a `row` column, a fixed code in English saying what the row is, and its other columns hold only
  numbers, codes, dates and what the user named. Income vs expenses: `month`, `total`, `previousMonth`,
  `previousTotal`. Budget vs actual: `budget`, `total`, `unbudgeted` (spent in a category with no budget) and
  `unbudgetedTotal`. Spending by category: `category`, and `directly` for what the category drilled into spent in
  none of its subcategories. A total names no category; its `category` is empty.
- **The transaction list downloads as CSV** from the API (`useExportTransactions`, `GET /api/v1/export/transactions.csv`)
  with the filters and sort order in the address: every transaction that passes, not only the pages loaded. A
  failure says so in a toast with a way to try again.
- **The monthly summary** (spec section 7, export) sits under every report on the reports screen
  (`monthlySummary/MonthlySummaryDownload`): a month to choose, this one first and two years back, and a button that
  downloads its PDF from `GET /api/v1/reports/monthly-summary.pdf` (`useDownloadMonthlySummary`) in the language the
  interface is in, saved under the name the API gives it. The API writes the document; the SPA only hands it over.
- **Charts are drawn through wrappers** in `src/shared/charts` (`DonutChart`, `LineChart`, `BarsWithLineChart`, `BarChart`, `StackedAreaChart`), over
  [Recharts](https://recharts.org), so the library can be swapped without touching a feature; ESLint refuses an
  import of `recharts` anywhere else. A chart is a picture of numbers a table or legend beside it also gives, which
  a keyboard can use: a chart's slice is chosen with a pointer only. Amounts become JavaScript numbers there for
  drawing alone, and an axis writes its ticks with `formatAxisAmount` from `@/shared/money` (`1.2M`).
- **Signing in** uses an HttpOnly session cookie the SPA never sees. The client adds the anti-forgery token to
  every request that changes something, and forgets it after signing in or out.
- **Two-factor sign-in.** The API answers the email and password of a user with two-factor sign-in by asking
  for a code; the sign-in screen then asks for the code from their authenticator app (or a recovery code) and
  sends all of it again, keeping the email and password in memory until then. Settings > Security turns it on
  (a QR code drawn in the page from the API's `otpauth://` link, confirmed with a code), shows the recovery codes
  the one time the API hands them over, and changes the password. Use the glossary's words: two-factor sign-in,
  recovery code.
- **Export and deleting the user** are in Settings > Your data. Each asks first. The export is fetched through
  the client and handed to the browser to save (`saveFile`), under the name the API gives it. Deleting takes the
  password (`ConfirmWithPassword`, shared with the two-factor settings), forgets everything of the user the way
  signing out does (`forgetSignedInUser`) and lands on the sign-in screen, which says they have 30 days to
  cancel by signing in again. When a sign-in does cancel a deletion the API says so, and the shell shows a
  notice until the user dismisses it. The interface says "delete your profile", never "account": an account is
  where money sits (see the glossary), and a test checks both languages.
- **Lockout and rate limiting are the API's.** A locked user is answered like a wrong password, so the sign-in
  screen warns about the lock beside that message; a 429 becomes "too many attempts".
- **Screens inside the shell need a signed-in user.** The shell's loader sends anyone else to `/login`, which
  returns them to where they were going.

## Serving and hardening

- **The image.** `docker build -t pfm-spa .` builds the app and puts it behind nginx (running as a non-root
  user), which serves the files, answers every other address with the app's page, and passes `/api` to the API
  at `API_URL`, so the browser sees one origin: `docker run -p 8081:8080 -e API_URL=http://host.docker.internal:8080 pfm-spa`.
  Build with `--build-arg VITE_SENTRY_DSN=…` to report errors. nginx tells the API who is calling
  (`X-Forwarded-For`), which the API's rate limit needs; see "Rate limiting" in the API's README.
- **Security headers and the content security policy** are written once, in `security-headers.ts`, with the
  reason for each exception. The image is built with them (`scripts/nginx-security-headers.ts`) and
  `npm run preview` sends the same; the dev server sends all but the policy, which hot reload cannot run under.
  The policy loads everything from the app's own origin: no inline or third-party script runs, and the app
  cannot be framed. So:
  - an inline script in `index.html` is allowed by the hash of its text, worked out at build time; scripts added
    any other way must be files of the app;
  - calling another origin (a new error tracker, a font or image host) means adding it to the policy there, on
    purpose;
  - whatever else serves the build (a CDN, another web server) must send the same headers.
- **Dependency scanning:** CI runs `npm audit --audit-level=high`, which fails on a known vulnerability of high
  or critical severity in any package, direct or transitive. Fix it with `npm audit fix` or by updating the
  package.
- **Container scanning:** CI builds the image on the newest base and scans it with [Trivy](https://trivy.dev).
  A vulnerability of high or critical severity that has a fix fails the job. The image already takes Alpine's
  current fixes when it is built, so the usual fix is a rebuild. To run the same scan locally:

  ```bash
  docker build --pull -t pfm-spa .
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.76.2 image \
    --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 pfm-spa
  ```

## Observability

- **Every API request starts a trace.** The client sends a W3C `traceparent` header with a new trace id on
  each request; the API's logs, spans and database calls for that request all carry it. Find them in the API's
  local viewer (the Aspire Dashboard, http://localhost:18888, started by the API's `docker compose up`).
- **Unhandled errors are reported** to the error tracker (Sentry) when `VITE_SENTRY_DSN` is set at build
  time; without it nothing is sent. A screen that fails reports from its error boundary (`RouteError`), and
  Sentry catches anything outside one, which the browser console shows either way.
- **No financial content in reports.** A report carries the error and the address without its query string.
  It leaves out the user, cookies, headers, bodies, console output and clicks, and anything thrown that is not
  an `Error`. The one thing it adds is the API calls that failed before the error: method, path, status and
  trace id, which find the API's side of it.
- **An `Error`'s message is sent as it is,** so never put a payee, an amount or anything else the user
  entered in one.
  `src/shared/observability/errorReporting.ts` holds these rules, and `src/app/errorReporting.test.tsx` checks
  them.

## Tests

Tests render the real app and routes. The API is mocked at the network with [MSW](https://mswjs.io)
(`src/test/server.ts`), signed in as a test user unless a test says otherwise. Each feature's endpoints have a fake
in its own file under `src/test/`, keeping state across requests and following the same rules as the real API:

| Fake | Stands in for |
| --- | --- |
| `fakeAuthApi` | Registering, verifying, signing in (with two factors, lockout, the rate limit and a deletion to cancel) and out, password reset (`/api/v1/auth/...`) |
| `fakeProfileApi` | `GET` and `PATCH /api/v1/me` |
| `fakeSecurityApi` | Changing the password and two-factor sign-in (`/api/v1/me/password`, `/api/v1/me/two-factor/...`) |
| `fakeDataApi` | The full export and deleting the user (`/api/v1/export/all.zip`, `/api/v1/me/deletion`) |
| `fakeInstitutionsApi` | `/api/v1/institutions` |
| `fakeAccountsApi` | `/api/v1/accounts` |
| `fakeCategoriesApi` | `/api/v1/categories`, and merging one (`moving` says what each moves, `refuseMergeInto` the targets it refuses) |
| `fakeTransactionsApi` | `/api/v1/transactions` (a test stands in for `/api/v1/export/transactions.csv` itself, in `transactionExport.test.tsx`), bulk actions (`/api/v1/transactions/bulk`, kept in `bulkRequests`), and marking and unmarking a transfer (`/api/v1/transfers/mark`, `/api/v1/transfers/{id}/unmark`); it moves the balances `fakeAccountsApi` holds, and can hold or fail an answer |
| `fakeAttachmentsApi` | `/api/v1/transactions/{id}/attachments` and `/api/v1/attachments/{id}`; it tells a file by its first bytes, as the API does, and hands out a new signed URL each time |
| `fakeRecurringRulesApi` | `/api/v1/recurring-rules`, with pausing and resuming, reminders to confirm or dismiss and the upcoming list (worked out from each rule's dates as the API does, from `today`, the test user's by default); nothing posts there, so a rule's next run date stays its start date until a reminder is answered |
| `fakeReconciliationsApi` | `/api/v1/accounts/{accountId}/reconciliations` and `/api/v1/reconciliations`: starting, ticking, completing, reopening and cancelling, over the accounts and transactions the other fakes hold; completing sets `isReconciled` on what is ticked, which `fakeTransactionsApi` then locks |
| `fakeBudgetsApi` | `/api/v1/budgets` and the month's overall budget (`/api/v1/budgets/{month}/overall`); it works out spent, remaining, state and, in the current month, pace from the spending a test gives it, copies a month as the API does, and locks the base currency `fakeProfileApi` holds |
| `fakeBudgetNotificationsApi` | `/api/v1/budget-notifications` and reading one or all (`/{id}/read`, `/read`): the newest first, a page at a time, with how many are unread; `raise` adds one, as a change that moved spent would on the API, and `reads` counts how often the list was asked for |
| `fakeDashboardApi` | `/api/v1/reports/dashboard`: it answers the dashboard a test gives it, over a new user's empty one (`emptyDashboard`), as the API works it out from what other fakes stand in for; it counts how often it was asked, can fail, and can hold its answer until `release`, to show the skeletons |
| `fakeReportsApi` | `/api/v1/reports/spending-by-category` and its `/transactions`, `/api/v1/reports/trends`, `/api/v1/reports/income-vs-expenses` (from the `income` and `expenses` a test gives it), `/api/v1/reports/budget-vs-actual`, `/api/v1/reports/net-worth` and `/api/v1/reports/cash-flow` (from the `holdings` a test gives it); it groups, ranks, compares, drills down and follows month by month the expenses a test gives it, sets them against the `budgets` it gives, adds up the holdings at each month end, as the API does, keeps each report's queries in a list of its own (`reportsAsked` for spending by category, `incomeVsExpensesAsked`, `netWorthAsked`, `cashFlowAsked`, …), and can fail an answer |
| `fakeImportsApi` | `/api/v1/imports`: uploading a statement (a form, refused when not text), the batch, its preview read with the mapping in the query (rows, problems, likely duplicates against the transactions `fakeTransactionsApi` holds) and committing it (`commitRequests`); nothing imports by itself: `importNext` and `fail` move a batch on as the API's worker would |
| `fakeMonthlySummaryApi` | `/api/v1/reports/monthly-summary.pdf`; it answers a stand-in file named after the month, refuses a month or locale the API would, and keeps every query it was asked with |

A new feature's endpoints get a `fake<Feature>Api.ts` there too. A request no handler expects fails the test.

One kind of test stands apart: a race the real router cannot be made to lose on cue. `useReportFilters.test.ts`
renders the hook alone with `react-router`'s `useSearchParams` mocked, so it can render an older address after a newer
change was asked for, which the router does only under load. Reach for this only when the app-level test cannot
show the bug, and say in the test which race it stands in for.

jsdom lays nothing out, so the virtualised transaction list cannot tell which rows are on screen: every test
starts on a pretend screen tall enough for every row it lists (`src/test/setup.ts`), and a row counts as tall as
its estimate. A test of the virtualisation itself gives the screen and the rows a height and scrolls
(`transactionList.test.tsx`); one that needs a list with a page still to load makes the screen short
(`window.innerHeight = 768`).

To upload in a test, hand `user.upload` a `new File([...])` whose first bytes are a real JPEG, PNG or PDF
signature. `src/test/setup.ts` makes `File` and `FormData` Node's own, because the request leaves through
Node's `fetch`, which cannot read jsdom's. `window.open` is not implemented in jsdom: spy on it and answer a
stand-in tab (see `attachments.test.tsx`).

jsdom has no `matchMedia`, so `src/test/mediaQueries.ts` stands in for it: every test starts on a light-themed
desktop, and `setScreenWidth(360)` or `setSystemTheme('dark')` changes the pretend device mid-test.

## Layout

```
src/
  app/        the shell: routes, layout, providers, error and not-found pages
  features/   one folder per feature, with an index.ts and routes/; api/, components/ and
              hooks/ are added as a feature needs them
  shared/     UI primitives (shared/ui), shared components, the API client (shared/api), i18n,
              money, dates, observability, the theme (shared/theme), utilities (shared/lib)
  test/       test setup and helpers
```

- **Features are used through their index.** Other features and the app import only `@/features/<name>`;
  each feature's `index.ts` is its public interface. Reaching into another feature's folders fails lint
  (`eslint-rules/no-cross-feature-internals.js`). Inside a feature, import freely.
- **Screens** are added to the route tree in `src/app/routes.tsx` by listing the feature's routes, and to the
  navigation in `src/app/navigation.ts`. Every screen gets its own error boundary, so a failing screen leaves the
  shell and the other screens working; so does each section nested in a screen (Settings > Profile).
- **Shared components** (`src/shared/components`): `TextField` and `SelectField` for labelled inputs,
  `ToggleField` for a choice of a few values side by side in a form, `SegmentedControl` for the same held by
  the screen (a report's chart or table), `Drawer` for a form in a side drawer,
  `ErrorMessage` for an alert that something went wrong, `FailureToast` for a change that failed.
- **UI primitives** come from [shadcn/ui](https://ui.shadcn.com) and are owned in `src/shared/ui`. Add one with
  `npx shadcn@latest add <component>`; `components.json` points the CLI at `src/shared`.

## Translations

English and Vietnamese live in `src/shared/i18n/locales/`. English is the source: translation keys are
type-checked against `en.json`, so a mistyped key fails `npm run typecheck`.

- No user-facing text in JSX: lint (`i18next/no-literal-string`) rejects literal text, template literals and
  attributes such as `title` or `aria-label`. Use `t('…')`. Lint only sees JSX, so text built in a variable or
  a `.ts` file is on you: keep translation keys, not text, in data (see `src/app/navigation.ts`).
- Add every new key to both files. A test fails when the two have different keys or a translation is empty.
- Until the viewer picks a language, the app follows their browser. A language they pick is remembered in
  their browser. Once a signed-in user has a locale in their profile (Settings > Profile, or the sidebar's
  switch, which saves to the profile), it takes over whenever they are signed in (`useProfileLocale`).
- The interface's language is also the locale amounts, numbers and dates are written in. Read it with
  `useLocale()` from `src/shared/i18n/useLocale.ts`; never hard-code `'en'` or `'vi'` in formatting.

## Money, numbers and dates

Money is never a float (spec section 3, rule 1). The API sends an amount as a decimal string (`"125000.00"`)
next to a currency code; the SPA keeps it a string from the response to the screen and back.

- **Show an amount with `<Money amount currency />`** from `@/shared/money`. It writes the amount in the
  interface's locale through `formatMoney(amount, currency, locale)`, which hands the string to
  `Intl.NumberFormat` as it is, so no digit is lost. Each currency shows its own decimals: VND none, USD and EUR
  two. These are the only ways an amount reaches the screen; never format one by hand.
- **Take an amount with `<AmountInput value onChange currency />`.** The user types in their locale's
  separators (`1.200.000,5` in Vietnamese, `1,200,000.5` in English, grouping optional); the value it holds is
  a decimal string (`"1200000.5"`), `''` when empty, or `null` when the text is not an amount (misplaced
  separators, a minus sign, or more decimals than the currency has), which the form should report as an error.
  In a form, use `<AmountField control name label currency />`, which labels it and ties its hint and error
  to it, and in its schema `requiredAmount` or `typedAmount` (an amount that may be left empty), which refuse
  what is not an amount with the form's own message. `parseAmount` and `formatAmountForInput` are the pure
  functions underneath. Only the opening balance of an account that holds no amount owed takes a minus sign
  (`allowNegative`), because a current account can open overdrawn; amounts owed and transaction amounts are
  always positive.
- **Never turn an amount into a `number`**, not even to compare or add. Totals, balances and conversions come
  from the API (the accounts list carries each institution's total in each currency, and `baseCurrencyTotal`: the
  totals of each institution and of everything, converted into the base currency). `isZeroAmount` reads
  whether an amount is zero from its digits. `DecimalString` marks a string that holds an amount.
- **Amount owed.** A credit card or loan is asked for the amount owed, as a positive number, instead of an
  opening balance, and the API shows it as a negative balance (`holdsAmountOwed` in `features/accounts`).
- **Available credit.** A credit card with a credit limit shows its available credit, the limit minus the amount
  owed, exactly as the API answers it (`availableCredit`); the SPA never subtracts. Only a credit card is asked
  for a credit limit, statement day and payment due day (`hasCreditCardFields` in `features/accounts`).
- **Last 4 digits.** Any account can be labelled with the last 4 digits of its number. The form takes exactly 4
  digits or nothing, so a full account or card number is refused before anything is sent; never widen it.
- **Currencies** are the API's (`Currency` from the generated schema). `currencies` lists them for pickers, and
  typecheck fails when the API adds one the list lacks.
- **A transaction's amount is positive and its type gives the sign.** The list shows an expense with a minus in
  front of the same digits; that is the only thing the SPA does to an amount. Its currency is its account's, so
  the amount input takes the decimals of the chosen account's currency.
- **Dates:** a calendar date (`YYYY-MM-DD`, no time) is written with `formatDate(date, locale)` from
  `@/shared/dates`, which never shifts it a day. `todayIn(timeZone)` is today's date in the user's time zone
  (from `useUserSettings()` in `@/features/settings`), not the browser's. A month (`2026-11`, such as a budget month) is a
  `CalendarMonth`, made only by `isCalendarMonth`, `monthOf` or `shiftMonth` and written with `formatMonth`.
- The user's base currency and time zone come from `useUserSettings()`.
- **Not converted.** An amount the API could not convert, for want of an exchange rate, comes back under
  `notConverted` in its own currency and is left out of the total next to it. Always show that flag with the
  total (`NotConverted` on the accounts screen); never hide it or estimate the amount. Nobody enters a rate: the
  API fetches them.
- **Changing the base currency** loads everything again (`useUpdateProfile`), because what the API converted into
  the old one no longer holds. Once the user has a budget it is locked (`baseCurrencyLocked` from
  `useUserSettings()`): the profile screen disables it, says why, and no longer sends it.
- **Budgets.** `/budgets/:month?` shows one budget month (`2026-11`; without one, or with something that is not
  a month, the month it is now in the user's time zone). Budgeted, spent, remaining, the percentage spent, the
  state and the totals are the API's (`budgetsQuery(month)`); the SPA adds nothing up. Every expense category
  has a row with its amount edited in place (Enter or Save; an emptied amount removes the budget). A category
  whose parent or subcategory is budgeted that month offers no amount and says whose budget its spending counts
  toward. Expenses that are not converted are left out of spent and counted in a note, on the row and the totals.
- **The overall budget** (BUD-5) caps all of a month's spending, independent of the category budgets. The budget
  screen shows it above the category budgets (`overall` in `budgetsQuery(month)`, null when the month has none),
  set, changed from its row version and removed like a category's (`useSetOverallBudget(month)`,
  `useRemoveOverallBudget(month)`). Its spent counts every expense of the month, as the API works it out; it is
  not in the totals of the category budgets.
- **Pace** (BUD-6): in the current month each budget and the overall budget say whether they are on pace or ahead of
  pace (`pace`), and the screen says how much of the month has passed (`percentOfMonthElapsed`), both the API's.
  A past month shows its final result and no pace; the SPA never works out either.
- **A budget's state is never colour alone** (spec section 8): on track, warning and over budget are each said
  in words beside an icon of their own shape, and the progress bar names its percentage; colour only adds to that.
  The warning threshold is the user's (`budgetWarningPercent`, Settings > Profile).

## Phones, themes and installing

- **Phones.** From 768 px (`sidebarQuery` in `src/app/navigation.ts`) the shell shows the sidebar; below it, a
  bottom tab bar. Screens with a `tabIcon` get a tab (Dashboard, Transactions, Budgets, Reports); the rest, the
  user menu, language and theme sit under More. Keep it to four tabs so labels fit at 360 px, and keep screens
  free of fixed widths, with rows of actions that wrap, so nothing scrolls sideways at 360 px.
- **Themes.** Light and dark follow the system unless the viewer picks one (Theme, in the sidebar, under More, or on
  the signed-out screens),
  which is remembered in the browser (`src/shared/theme`). Dark mode is the `dark` class on `<html>`; style with
  the colour tokens in `src/index.css` and Tailwind's `dark:` variant; `success`, `warning` and `destructive` colour
  a good, a needs-attention and a bad state, never alone: words or an icon say it too. A script in `index.html` sets the class
  before the first paint, so keep its storage key in step with `src/shared/theme`; a test runs the script
  against a stored choice. A chosen theme also recolours the browser bar (`theme-color`); the installed app's
  splash screen comes from the manifest and stays light.
- **Installing.** `public/manifest.webmanifest` and the icons in `public/icons` make the app installable to a
  home screen. There is no service worker: the app does not work offline in v1. The PNG icons are rendered from
  the SVGs next to them; re-render all four sizes if the icon changes.

## Accessibility

The target is WCAG 2.1 AA (spec section 8).

- Lint runs `jsx-a11y-x`, the ESLint 10 compatible fork of `eslint-plugin-jsx-a11y`.
- Every screen names itself in the browser tab with `useDocumentTitle`.
- Controls styled by hand take the `focusRing` class from `src/shared/lib/utils.ts`, so keyboard focus is
  always visible; a label wrapping a visually hidden radio or checkbox takes `focusRingWithin` instead. shadcn primitives bring their own.
- Overlays such as the More sheet use the shadcn primitives built on Radix dialogs (`src/shared/ui/sheet.tsx`),
  which keep focus inside while open, close on Escape and hand focus back to what opened them.
