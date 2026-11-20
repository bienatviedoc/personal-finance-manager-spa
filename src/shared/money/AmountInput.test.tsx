import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { createI18n, type Language } from '@/shared/i18n'
import { AmountInput, type AmountValue } from './AmountInput'
import type { Currency } from './currencies'

/** An amount input in a form-like owner that shows the value it holds. */
function renderAmountInput({ locale, currency = 'USD', initial = '' }: { locale: Language; currency?: Currency; initial?: AmountValue }) {
  function Owner() {
    const [value, setValue] = useState<AmountValue>(initial)
    return (
      <>
        <label htmlFor="amount">Amount</label>
        <AmountInput id="amount" value={value} onChange={setValue} currency={currency} />
        <output data-testid="value">{value === null ? 'invalid' : JSON.stringify(value)}</output>
        <button type="button" onClick={() => setValue('42.5')}>
          reset
        </button>
      </>
    )
  }

  render(
    <I18nextProvider i18n={createI18n({ language: locale })}>
      <Owner />
    </I18nextProvider>,
  )
  return { user: userEvent.setup(), input: screen.getByLabelText('Amount'), value: () => screen.getByTestId('value').textContent }
}

describe('amount input', () => {
  it.each([
    ['vi', 'VND', '125000.00', '125.000', '"125000"'],
    ['en', 'USD', '12.5000', '12.50', '"12.50"'],
  ] as const)('in %s shows a %s amount the API sent as %s, and reads it back when the user touches it', async (locale, currency, initial, shown, held) => {
    const { user, input, value } = renderAmountInput({ locale, currency, initial })

    expect(input).toHaveValue(shown)
    await user.type(input, '0{Backspace}')
    await user.tab()

    expect(value()).toBe(held)
    expect(input).toHaveValue(shown)
  })

  it.each([
    ['vi', '1.200.000,5', '1.200.000,5'],
    ['en', '1200000.5', '1,200,000.5'],
  ] as const)('in %s holds what the user types as a decimal string, and rewrites it in the locale’s format on blur', async (locale, typed, shown) => {
    const { user, input, value } = renderAmountInput({ locale })

    await user.type(input, typed)
    expect(value()).toBe('"1200000.5"')

    await user.tab()
    expect(input).toHaveValue(shown)
  })

  it('holds null for text that is not an amount, and keeps the text for the user to fix', async () => {
    const { user, input, value } = renderAmountInput({ locale: 'en', currency: 'VND' })

    await user.type(input, '12.5')
    await user.tab()

    expect(value()).toBe('invalid')
    expect(input).toHaveValue('12.5')
  })

  it('holds an empty string when empty', async () => {
    const { user, input, value } = renderAmountInput({ locale: 'en', initial: '10' })
    expect(input).toHaveValue('10')

    await user.clear(input)

    expect(value()).toBe('""')
  })

  it('shows a value set by its owner in the locale’s format', async () => {
    const { user, input } = renderAmountInput({ locale: 'vi' })

    await user.click(screen.getByRole('button', { name: 'reset' }))

    expect(input).toHaveValue('42,5')
  })
})
