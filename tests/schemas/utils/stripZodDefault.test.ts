import { stripZodDefault } from '@/src/stripZodDefaultValues'
import { describe } from '@jest/globals'
import { z } from 'zod'

describe('stripZodDefault - preserving array checks', () => {
  const cases = [
    {
      schema: z.array(z.string()).min(2),
      invalid: ['one'],
      valid: ['one', 'two'],
    },
    {
      schema: z.array(z.string()).max(2),
      invalid: ['one', 'two', 'three'],
      valid: ['one', 'two'],
    },
    {
      schema: z.array(z.string()).length(2),
      invalid: ['one'],
      valid: ['one', 'two'],
    },
    {
      schema: z.array(z.string()).nonempty(),
      invalid: [],
      valid: ['one'],
    },
  ]

  it.each(cases)('preserves array length validations: %#', ({ schema, invalid, valid }) => {
    const stripped = stripZodDefault(schema)

    expect(stripped.safeParse(invalid).success).toBe(false)
    expect(stripped.safeParse(valid).success).toBe(true)
  })

  it('removes element defaults while preserving array constraints', () => {
    const schema = z.array(z.string().default('example')).min(2)

    const stripped = stripZodDefault(schema)

    expect(stripped.safeParse(['one']).success).toBe(false)
    expect(stripped.safeParse(['one', 'two']).success).toBe(true)
    expect(stripped.safeParse([undefined, 'two']).success).toBe(false)
  })
})
