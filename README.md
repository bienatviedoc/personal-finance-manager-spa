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
  infinite query (`transactionsQuery`) that loads the next page when the screen asks for more.
- **Adding and editing a transaction is optimistic**, and nothing else is (spec section 12). The save hooks put
  the transaction in the cached list as soon as it is sent, put the list back if the API refuses it or the
  request fails, and load the list again once the API has answered. One not yet answered is a
  `PendingTransaction`: it has no id or row version, so it offers nothing to edit or delete (`isPending`).
- **A refund is an expense with `isRefund` set** (see the glossary), never a type of its own: the form offers the
  flag to an expense only, and the list marks a refund and shows its amount coming back (`+`), since it raises
  the balance.
- **A change to a transaction moves a balance,** so saving or deleting one also loads the accounts again,
  through `refreshAccountBalances` from `@/features/accounts`. A feature that changes what another shows asks
  that feature to refresh it; it never touches the other's query keys.
- **A transfer is two transactions in the list.** The API lists a transfer as its two legs (`transferOut`,
  `transferIn`), each on its own account and carrying the `transferId` they share; the list marks them as a
  transfer. A leg is never edited or deleted as a transaction: either leg opens the transfer form, which loads
  the transfer by that id (`transferQuery`) and saves both legs through `/transfers` (`features/transactions/api/transfers.ts`).
  Between accounts in different currencies the form asks for both amounts; nothing converts one into the other.
  Recording a transfer is not optimistic; it carries an `Idempotency-Key` like a new transaction.
- **A change that fails says so in a toast with "Try again"** (spec section 12): `<FailureToast>` from
  `@/shared/components`, rendered next to what failed, for a failure no field explains (the request failed, or
  the API answered an error). Trying again submits the form again (`retry={{ form: id }}`) or makes the change
  again; fields the API refused stay under their inputs. The toast is the Radix primitive in
  `src/shared/ui/toast.tsx`, and stays until the user answers it.
- **A new transaction carries an `Idempotency-Key`**, made up once for each request the user means to make
  (`AddTransaction`). Saving the same values again after a failure sends the same key, so the API cannot record
  the transaction twice. Values changed after a failure are a new request with a new key (the API refuses a
  used key that comes with a different body), and so is the next transaction.
- **Signing in** uses an HttpOnly session cookie the SPA never sees. The client adds the anti-forgery token to
  every request that changes something, and forgets it after signing in or out.
- **Two-factor sign-in.** The API answers the email and password of a user with two-factor sign-in by asking
  for a code; the sign-in screen then asks for the code from their authenticator app (or a recovery code) and
  sends all of it again, keeping the email and password in memory until then. Settings > Security turns it on
  (a QR code drawn in the page from the API's `otpauth://` link, confirmed with a code), shows the recovery codes
  the one time the API hands them over, and changes the password. Use the glossary's words: two-factor sign-in,
  recovery code.
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
| `fakeAuthApi` | Registering, verifying, signing in (with two factors, lockout and the rate limit) and out, password reset (`/api/v1/auth/...`) |
| `fakeProfileApi` | `GET` and `PATCH /api/v1/me` |
| `fakeSecurityApi` | Changing the password and two-factor sign-in (`/api/v1/me/password`, `/api/v1/me/two-factor/...`) |
| `fakeInstitutionsApi` | `/api/v1/institutions` |
| `fakeAccountsApi` | `/api/v1/accounts` |
| `fakeCategoriesApi` | `/api/v1/categories` |
| `fakeTransactionsApi` | `/api/v1/transactions`; it moves the balances `fakeAccountsApi` holds, and can hold or fail an answer |

A new feature's endpoints get a `fake<Feature>Api.ts` there too. A request no handler expects fails the test.

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
  (from `useUserSettings()` in `@/features/settings`), not the browser's.
- The user's base currency and time zone come from `useUserSettings()`.
- **Not converted.** An amount the API could not convert, for want of an exchange rate, comes back under
  `notConverted` in its own currency and is left out of the total next to it. Always show that flag with the
  total (`NotConverted` on the accounts screen); never hide it or estimate the amount. Nobody enters a rate: the
  API fetches them.
- **Changing the base currency** loads everything again (`useUpdateProfile`), because what the API converted into
  the old one no longer holds.

## Phones, themes and installing

- **Phones.** From 768 px (`sidebarQuery` in `src/app/navigation.ts`) the shell shows the sidebar; below it, a
  bottom tab bar. Screens with a `tabIcon` get a tab (Dashboard, Transactions, Budgets, Reports); the rest, the
  user menu, language and theme sit under More. Keep it to four tabs so labels fit at 360 px, and keep screens
  free of fixed widths, with rows of actions that wrap, so nothing scrolls sideways at 360 px.
- **Themes.** Light and dark follow the system unless the viewer picks one (Theme, in the sidebar, under More, or on
  the signed-out screens),
  which is remembered in the browser (`src/shared/theme`). Dark mode is the `dark` class on `<html>`; style with
  the colour tokens in `src/index.css` and Tailwind's `dark:` variant. A script in `index.html` sets the class
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
