import { describe, expect, it } from 'vitest'
import { refusedFields } from './refusedFields'

const known = ['name', 'color'] as const
const answer = (status: number) => new Response(null, { status })

describe('refusedFields', () => {
  it('names the known fields a 400 validation problem lists', () => {
    expect(refusedFields(answer(400), { errors: { color: ['x'], other: ['y'] } }, known)).toEqual(['color'])
  })

  it('is null for a 400 that names none of them, or without errors', () => {
    expect(refusedFields(answer(400), { errors: { other: ['y'] } }, known)).toBeNull()
    expect(refusedFields(answer(400), { title: 'Bad request' }, known)).toBeNull()
  })

  it('is null for any other answer', () => {
    expect(refusedFields(answer(404), { errors: { name: ['x'] } }, known)).toBeNull()
  })
})
