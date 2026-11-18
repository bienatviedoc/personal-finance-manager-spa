# Personal Finance Manager SPA

The React single-page app for the Personal Finance Manager. It talks only to the
[API](https://github.com/bienatviedoc/personal-finance-manager-api), where the
[specification](https://github.com/bienatviedoc/personal-finance-manager-api/blob/main/docs/specification.md) and
[glossary](https://github.com/bienatviedoc/personal-finance-manager-api/blob/main/GLOSSARY.md) live. Use the glossary's
terms in code, tests and the interface.

## Run it

Requires Node 24.

```bash
npm install
npm run dev
```

| Script | What |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run lint` | ESLint, failing on any warning |
| `npm run typecheck` | `tsc` with no output |
| `npm test` | Unit and component tests (Vitest) |
| `npm run build` | Typecheck and production build into `dist/` |

CI runs lint, typecheck, tests and the build on every pull request.

## Layout

```
src/
  app/        the shell: routes, layout, providers, error and not-found pages
  features/   one folder per feature, with an index.ts and routes/; api/, components/ and
              hooks/ are added as a feature needs them
  shared/     UI primitives (shared/ui), shared components, i18n, utilities
  test/       test setup and helpers
```

- **Features are used through their index.** Other features and the app import only `@/features/<name>`;
  each feature's `index.ts` is its public interface. Reaching into another feature's folders fails lint
  (`eslint-rules/no-cross-feature-internals.js`). Inside a feature, import freely.
- **Screens** are added to the route tree in `src/app/routes.tsx` by listing the feature's routes, and to the
  sidebar in `src/app/navigation.ts`. Every screen gets its own error boundary, so a failing screen leaves the
  shell and the other screens working.
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
  their browser. Once profiles exist, the user's saved locale will take over.

## Accessibility

The target is WCAG 2.1 AA (spec section 8).

- Lint runs `jsx-a11y-x`, the ESLint 10 compatible fork of `eslint-plugin-jsx-a11y`.
- Every screen names itself in the browser tab with `useDocumentTitle`.
- Controls styled by hand take the `focusRing` class from `src/shared/lib/utils.ts`, so keyboard focus is
  always visible. shadcn primitives bring their own.
