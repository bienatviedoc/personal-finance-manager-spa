import { describe, expect, it } from 'vitest'
import { ifMatch, isStale, versionedSaveOutcome } from './versionedSave'

const fields = ['name', 'amount'] as const
const answer = (status: number) => new Response(null, { status })

describe('versionedSaveOutcome', () => {
  it('answers the record under its own name when the API saved it', () => {
    expect(versionedSaveOutcome('account', { data: { id: '1' }, response: answer(200) }, fields)).toEqual({ saved: true, account: { id: '1' } })
  })

  it('is stale on a 412, and only then', () => {
    const stale = versionedSaveOutcome('account', { response: answer(412) }, fields)
    expect(stale).toEqual({ saved: false, stale: true })
    expect(isStale(stale)).toBe(true)
    expect(isStale({ saved: false, fields: ['name'] })).toBe(false)
    expect(isStale(undefined)).toBe(false)
  })

  it('names the fields a 400 refused', () => {
    const refused = versionedSaveOutcome('account', { error: { errors: { amount: ['No.'], other: ['No.'] } }, response: answer(400) }, fields)
    expect(refused).toEqual({ saved: false, fields: ['amount'] })
  })

  it('throws on anything else, naming the record and the status only', () => {
    expect(() => versionedSaveOutcome('transaction', { response: answer(500) }, fields)).toThrow('Saving the transaction failed: 500')
  })
})

describe('ifMatch', () => {
  it('quotes the row version, as an entity tag is', () => {
    expect(ifMatch('1234')).toBe('"1234"')
  })
})
