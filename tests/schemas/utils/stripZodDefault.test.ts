import { stripZodDefaults } from '@/index'
import { stripZodDefault } from '@/src/stripZodDefaultValues'
import { useSchema } from '@/src/useSchema'
import { z } from 'zod'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
function expectType<T extends true>() {}

describe('stripZodDefault: default semantics', () => {
  test.each([
    { name: 'string', schema: z.string().default('fallback'), valid: 'value' },
    { name: 'number', schema: z.number().default(0), valid: 42 },
    { name: 'boolean', schema: z.boolean().default(false), valid: true },
    { name: 'bigint', schema: z.bigint().default(BigInt(0)), valid: BigInt(1) },
    { name: 'date', schema: z.date().default(new Date(0)), valid: new Date(1) },
    { name: 'literal', schema: z.literal('value').default('value'), valid: 'value' },
    { name: 'enum', schema: z.enum(['value', 'other']).default('value'), valid: 'value' },
  ])('removes a root $name default', ({ schema, valid }) => {
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse(undefined).success).toBe(false)
    expect(stripped.parse(valid)).toEqual(valid)
    expect(schema.safeParse(undefined).success).toBe(true)
  })

  test('removes stacked defaults without evaluating their factories', () => {
    const factory = jest.fn(() => 'fallback')
    const schema = z.string().default(factory).default(factory)
    const stripped = stripZodDefault(schema)

    expect(stripped.safeParse(undefined).success).toBe(false)
    expect(stripped.parse('value')).toBe('value')
    expect(factory).not.toHaveBeenCalled()
    expect(schema.parse(undefined)).toBe('fallback')
    expect(factory).toHaveBeenCalledTimes(1)
  })

  test.each([z.string().optional().default('fallback'), z.string().default('fallback').optional(), z.string().nullish().default('fallback'), z.string().default('fallback').nullish()])(
    'preserves explicit optionality: %#',
    (schema) => {
      expect(stripZodDefault(schema).parse(undefined)).toBeUndefined()
    },
  )

  test.each([z.string().nullable().default('fallback'), z.string().default('fallback').nullable()])('preserves nullable wrappers: %#', (schema) => {
    const stripped = stripZodDefault(schema)
    expect(stripped.parse(null)).toBeNull()
    expect(stripped.safeParse(undefined).success).toBe(false)
    expect(stripped.parse('value')).toBe('value')
  })

  test('does not make required object properties optional', () => {
    const schema = z.object({ required: z.string().default('fallback'), optional: z.string().default('fallback').optional() })
    const stripped = stripZodDefault(schema)

    expect(schema.parse({})).toEqual({ required: 'fallback', optional: 'fallback' })
    expect(stripped.safeParse({}).success).toBe(false)
    expect(stripped.parse({ required: 'value' })).toEqual({ required: 'value' })
    expect(stripped.parse({ required: 'value', optional: undefined })).toEqual({ required: 'value', optional: undefined })
  })

  test('retains refinements attached to removed default wrappers', () => {
    const schema = z
      .string()
      .min(2)
      .default('fallback')
      .refine((value) => value.startsWith('a'), 'Must start with a')
    const stripped = stripZodDefault(schema)

    expect(stripped.safeParse('a').success).toBe(false)
    expect(stripped.safeParse('bb').error?.issues[0].message).toBe('Must start with a')
    expect(stripped.parse('ab')).toBe('ab')
  })

  test('retains explicit prefaults and evaluates their factories only during parsing', () => {
    const factory = jest.fn(() => ' tuna ')
    const schema = z.string().trim().toUpperCase().default('fallback').prefault(factory)
    const stripped = stripZodDefault(schema)

    expect(factory).not.toHaveBeenCalled()
    expect(stripped.parse(undefined)).toBe('TUNA')
    expect(stripped.parse(undefined)).toBe('TUNA')
    expect(factory).toHaveBeenCalledTimes(2)
    expect(stripped.unwrap().safeParse(undefined).success).toBe(false)
  })

  test('removes defaults inside prefaulted objects', () => {
    const schema = z.object({ name: z.string().default('fallback') }).prefault({})
    expect(schema.parse(undefined)).toEqual({ name: 'fallback' })
    expect(stripZodDefault(schema).safeParse(undefined).success).toBe(false)
    expect(stripZodDefault(schema).parse({ name: 'value' })).toEqual({ name: 'value' })
  })

  test('preserves catch fallbacks, including the error context', () => {
    const fallback = jest.fn((ctx: z.core.$ZodCatchCtx) => `caught ${ctx.error.issues[0].code}`)
    const schema = z.string().default('default').catch(fallback)
    const stripped = stripZodDefault(schema)

    expect(fallback).not.toHaveBeenCalled()
    expect(stripped.parse(undefined)).toBe('caught invalid_type')
    expect(stripped.parse(123)).toBe('caught invalid_type')
    expect(stripped.parse('valid')).toBe('valid')
    expect(fallback).toHaveBeenCalledTimes(2)
    expect(schema.parse(undefined)).toBe('default')
  })

  test('preserves readonly freezing and strips defaults inside it', () => {
    const stripped = stripZodDefault(z.object({ name: z.string().default('fallback') }).readonly())
    expect(stripped.safeParse({}).success).toBe(false)
    const parsed = stripped.parse({ name: 'value' })
    expect(parsed).toEqual({ name: 'value' })
    expect(Object.isFrozen(parsed)).toBe(true)
  })

  test('preserves nonoptional checks and custom errors', () => {
    const stripped = stripZodDefault(z.string().optional().default('fallback').nonoptional({ error: 'Required value' }))
    expect(stripped.safeParse(undefined).error?.issues[0].message).toBe('Required value')
    expect(stripped.parse('value')).toBe('value')
  })
})

describe('stripZodDefault: objects and checks', () => {
  test('strips defaults through deeply nested objects and arrays', () => {
    const schema = z.object({ users: z.array(z.object({ profile: z.object({ name: z.string().default('fallback') }).default({ name: 'fallback' }) })) })
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse({ users: [{}] }).success).toBe(false)
    expect(stripped.safeParse({ users: [{ profile: {} }] }).success).toBe(false)
    expect(stripped.parse({ users: [{ profile: { name: 'value' } }] })).toEqual({ users: [{ profile: { name: 'value' } }] })
    expect(schema.parse({ users: [{}] })).toEqual({ users: [{ profile: { name: 'fallback' } }] })
  })

  test.each([
    { name: 'stripping', schema: z.object({ name: z.string().default('fallback') }), succeeds: true, keepsExtra: false },
    { name: 'strict', schema: z.strictObject({ name: z.string().default('fallback') }), succeeds: false, keepsExtra: false },
    { name: 'loose', schema: z.looseObject({ name: z.string().default('fallback') }), succeeds: true, keepsExtra: true },
  ])('preserves $name object key policy', ({ schema, succeeds, keepsExtra }) => {
    const stripped = stripZodDefault(schema)
    const result = stripped.safeParse({ name: 'value', extra: 1 })
    expect(result.success).toBe(succeeds)
    if (result.success) expect(result.data).toEqual(keepsExtra ? { name: 'value', extra: 1 } : { name: 'value' })
    expect(stripped.safeParse({}).success).toBe(false)
  })

  test('preserves catchall validation and strips catchall defaults', () => {
    const schema = z.object({}).catchall(z.object({ count: z.number().default(1) }).default({ count: 1 }))
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse({ extra: undefined }).success).toBe(false)
    expect(stripped.safeParse({ extra: {} }).success).toBe(false)
    expect(stripped.safeParse({ extra: 'wrong' }).success).toBe(false)
    expect(stripped.parse({ extra: { count: 2 } })).toEqual({ extra: { count: 2 } })
    expect(schema.parse({ extra: {} })).toEqual({ extra: { count: 1 } })
  })

  test('preserves object refinements and issue paths', () => {
    const schema = z.object({ start: z.number().default(0), end: z.number().default(1) }).superRefine(({ start, end }, ctx) => {
      if (end <= start) ctx.addIssue({ code: 'custom', message: 'End must follow start', path: ['end'] })
    })
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse({ start: 2, end: 1 }).error?.issues).toEqual([expect.objectContaining({ message: 'End must follow start', path: ['end'] })])
    expect(stripped.parse({ start: 1, end: 2 })).toEqual({ start: 1, end: 2 })
    expect(stripped.safeParse({}).success).toBe(false)
  })

  test('preserves object error customization and metadata', () => {
    const schema = z
      .object({ name: z.string().default('fallback') }, { error: 'Expected object' })
      .describe('User')
      .meta({ title: 'A user' })
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse(null).error?.issues[0].message).toBe('Expected object')
    expect(stripped.description).toBe('User')
    expect(stripped.meta()).toEqual(expect.objectContaining({ title: 'A user' }))
  })

  test('handles special property names without changing the shape prototype', () => {
    const schema = z.object({ ['__proto__']: z.string().default('fallback'), constructor: z.string().default('fallback') })
    const stripped = stripZodDefault(schema)
    expect(stripped.shape.__proto__).toBeInstanceOf(z.ZodString)
    expect(stripped.shape.constructor).toBeInstanceOf(z.ZodString)
    expect(stripped.safeParse({}).success).toBe(false)
  })

  test.each([
    { schema: z.array(z.string().default('fallback')).min(2), invalid: ['one'], valid: ['one', 'two'] },
    { schema: z.array(z.string().default('fallback')).max(2), invalid: ['one', 'two', 'three'], valid: ['one', 'two'] },
    { schema: z.array(z.string().default('fallback')).length(2), invalid: ['one'], valid: ['one', 'two'] },
    { schema: z.array(z.string().default('fallback')).nonempty(), invalid: [], valid: ['one'] },
  ])('preserves array length checks: %#', ({ schema, invalid, valid }) => {
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse(invalid).success).toBe(false)
    expect(stripped.parse(valid)).toEqual(valid)
    expect(stripped.safeParse(valid.map(() => undefined)).success).toBe(false)
  })

  test('preserves array refinements and element checks', () => {
    const schema = z.array(z.string().min(2).default('fallback')).refine((values) => new Set(values).size === values.length, 'Duplicate values')
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse(['aa', 'aa']).error?.issues[0].message).toBe('Duplicate values')
    expect(stripped.safeParse(['a']).success).toBe(false)
    expect(stripped.parse(['aa', 'bb'])).toEqual(['aa', 'bb'])
  })
})

describe('stripZodDefault: composite schemas', () => {
  test('strips defaults from every union option and preserves union refinements', () => {
    const schema = z.union([z.string().default('fallback'), z.number().default(1)]).refine((value) => value !== 'blocked', 'Blocked')
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse(undefined).success).toBe(false)
    expect(stripped.safeParse('blocked').error?.issues[0].message).toBe('Blocked')
    expect(stripped.parse('value')).toBe('value')
    expect(stripped.parse(2)).toBe(2)
  })

  test('retains discriminated unions, nested options and discriminator errors', () => {
    const schema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('a'), value: z.string().default('fallback') }), z.object({ kind: z.literal('b'), count: z.number().default(1) })])
    const stripped = stripZodDefault(schema)
    expect(stripped).toBeInstanceOf(z.ZodDiscriminatedUnion)
    expect(stripped.def.discriminator).toBe('kind')
    expect(stripped.safeParse({ kind: 'a' }).success).toBe(false)
    expect(stripped.safeParse({ kind: 'b' }).success).toBe(false)
    expect(stripped.safeParse({ kind: 'c' }).error?.issues[0].path).toEqual(['kind'])
    expect(stripped.parse({ kind: 'a', value: 'value' })).toEqual({ kind: 'a', value: 'value' })
    expect(stripped.parse({ kind: 'b', count: 2 })).toEqual({ kind: 'b', count: 2 })
  })

  test('supports nested discriminated unions', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('a'), name: z.string().default('fallback') }),
      z.discriminatedUnion('code', [z.object({ kind: z.literal('b'), code: z.literal(1), value: z.number().default(0) })]),
    ])
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse({ kind: 'b', code: 1 }).success).toBe(false)
    expect(stripped.parse({ kind: 'b', code: 1, value: 2 })).toEqual({ kind: 'b', code: 1, value: 2 })
  })

  test('preserves tuple items, rest elements and refinements', () => {
    const schema = z.tuple([z.string().default('fallback')], z.number().default(1)).refine((values) => values[0] !== 'blocked', 'Blocked')
    const stripped = stripZodDefault(schema)
    expect(stripped.parse(['value', 1, 2])).toEqual(['value', 1, 2])
    expect(stripped.safeParse([undefined]).success).toBe(false)
    expect(stripped.safeParse(['value', undefined]).success).toBe(false)
    expect(stripped.safeParse(['blocked']).error?.issues[0].message).toBe('Blocked')
  })

  test('supports empty tuples, rest-only tuples and tuples without rest', () => {
    expect(stripZodDefault(z.tuple([])).parse([])).toEqual([])
    const rest = stripZodDefault(z.tuple([]).rest(z.string().default('fallback')))
    expect(rest.parse(['a', 'b'])).toEqual(['a', 'b'])
    expect(rest.safeParse([undefined]).success).toBe(false)
    expect(stripZodDefault(z.tuple([z.string().default('fallback')])).safeParse(['a', 'b']).success).toBe(false)
  })

  test('strips both sides of intersections while preserving their checks', () => {
    const schema = z.intersection(z.object({ name: z.string().default('fallback') }), z.object({ count: z.number().default(1) })).refine((value) => value.count > 0)
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse({ name: 'value' }).success).toBe(false)
    expect(stripped.safeParse({ count: 2 }).success).toBe(false)
    expect(stripped.safeParse({ name: 'value', count: -1 }).success).toBe(false)
    expect(stripped.parse({ name: 'value', count: 2 })).toEqual({ name: 'value', count: 2 })
  })

  test('strips defaults from record values and preserves key validation', () => {
    const stripped = stripZodDefault(z.record(z.string().regex(/^key/), z.string().default('fallback')))
    expect(stripped.safeParse({ key1: undefined }).success).toBe(false)
    expect(stripped.safeParse({ other: 'value' }).success).toBe(false)
    expect(stripped.parse({ key1: 'value' })).toEqual({ key1: 'value' })
  })

  test('preserves exhaustive enum records and partial records', () => {
    const keys = z.enum(['a', 'b'])
    const exhaustive = stripZodDefault(z.record(keys, z.string().default('fallback')))
    const partial = stripZodDefault(z.partialRecord(keys, z.string().default('fallback')))
    expect(exhaustive.safeParse({ a: 'value' }).success).toBe(false)
    expect(exhaustive.parse({ a: 'value', b: 'value' })).toEqual({ a: 'value', b: 'value' })
    expect(partial.parse({ a: 'value' })).toEqual({ a: 'value' })
    expect(partial.safeParse({ a: undefined }).success).toBe(false)
    expect(partial.safeParse({ c: 'value' }).success).toBe(false)
  })

  test('strips map keys and values and preserves refinements', () => {
    const schema = z.map(z.string().default('key'), z.number().default(1)).refine((value) => value.size > 0, 'Empty map')
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse(new Map([[undefined, 1]])).success).toBe(false)
    expect(stripped.safeParse(new Map([['key', undefined]])).success).toBe(false)
    expect(stripped.safeParse(new Map()).error?.issues[0].message).toBe('Empty map')
    expect(stripped.parse(new Map([['key', 2]]))).toEqual(new Map([['key', 2]]))
  })

  test('strips set elements and preserves size constraints', () => {
    const stripped = stripZodDefault(z.set(z.string().default('fallback')).min(1).max(2))
    expect(stripped.safeParse(new Set()).success).toBe(false)
    expect(stripped.safeParse(new Set(['a', 'b', 'c'])).success).toBe(false)
    expect(stripped.safeParse(new Set([undefined])).success).toBe(false)
    expect(stripped.parse(new Set(['a']))).toEqual(new Set(['a']))
  })

  test('strips promise values without changing async parsing', async () => {
    const schema = z.promise(z.object({ name: z.string().default('fallback') }))
    const stripped = stripZodDefault(schema)
    await expect(stripped.parseAsync(Promise.resolve({}))).rejects.toBeInstanceOf(z.ZodError)
    await expect(stripped.parseAsync(Promise.resolve({ name: 'value' }))).resolves.toEqual({ name: 'value' })
    await expect(schema.parseAsync(Promise.resolve({}))).resolves.toEqual({ name: 'fallback' })
  })

  test('strips success-wrapper inner defaults', () => {
    const stripped = stripZodDefault(z.success(z.string().default('fallback')))
    expect(stripped.safeParse(undefined).success).toBe(false)
    expect(stripped.parse('value')).toBe(true)
  })

  test('strips function argument and return schemas', () => {
    const schema = z.function({ input: [z.string().default('fallback')], output: z.string().default('fallback') })
    const stripped = stripZodDefault(schema)
    const fn = stripped.parse((value: string) => value)
    expect(fn('value')).toBe('value')
    expect(() => fn(undefined as unknown as string)).toThrow(z.core.$ZodError)
    const invalidReturn = stripped.parse(() => undefined)
    expect(() => invalidReturn('value')).toThrow(z.core.$ZodError)
  })
})

describe('stripZodDefault: effects and pipes', () => {
  test('preserves standalone transform schemas', () => {
    const transform = z.transform((value: unknown) => String(value).toUpperCase())
    expect(stripZodDefault(transform)).toBe(transform)
    expect(stripZodDefault(transform).parse('tuna')).toBe('TUNA')
  })

  test('preserves transforms with different input and output types', () => {
    const schema = z
      .string()
      .default('fallback')
      .transform((value) => value.length)
      .default(0)
    const stripped = stripZodDefault(schema)
    expect(stripped.parse('tuna')).toBe(4)
    expect(stripped.safeParse(undefined).success).toBe(false)
    expect(schema.parse(undefined)).toBe(0)
  })

  test('preserves preprocessing and removes defaults from the output schema', () => {
    const preprocess = jest.fn((value: unknown) => (typeof value === 'string' ? value.trim() : value))
    const stripped = stripZodDefault(z.preprocess(preprocess, z.string().min(2).default('fallback')))
    expect(preprocess).not.toHaveBeenCalled()
    expect(stripped.parse('  tuna  ')).toBe('tuna')
    expect(stripped.safeParse(' x ').success).toBe(false)
    expect(stripped.safeParse(undefined).success).toBe(false)
  })

  test('preserves preprocessing that explicitly supplies an input', () => {
    const stripped = stripZodDefault(z.preprocess((value) => value ?? 'provided', z.string().default('fallback')))
    expect(stripped.parse(undefined)).toBe('provided')
  })

  test('strips defaults from both sides of a pipe and keeps pipe checks', () => {
    const schema = z
      .pipe(
        z.object({ name: z.string().default('fallback') }).transform((value): { name?: string } => value),
        z.object({ name: z.string().default('fallback') }),
      )
      .refine((value) => value.name !== 'blocked', 'Blocked')
    const stripped = stripZodDefault(schema)
    expect(stripped.in.safeParse({}).success).toBe(false)
    expect(stripped.out.safeParse({}).success).toBe(false)
    expect(stripped.safeParse({ name: 'blocked' }).error?.issues[0].message).toBe('Blocked')
    expect(stripped.parse({ name: 'value' })).toEqual({ name: 'value' })
  })

  test('removes an output default that would replace undefined produced by a transform', () => {
    const schema = z.pipe(
      z.string().transform((): string | undefined => undefined),
      z.string().default('fallback'),
    )
    expect(schema.parse('value')).toBe('fallback')
    expect(stripZodDefault(schema).safeParse('value').success).toBe(false)
  })

  test('retains codecs and their decode/encode functions', () => {
    const schema = z.codec(z.string().default('1'), z.number().default(1), { decode: Number, encode: String })
    const stripped = stripZodDefault(schema)
    expect(stripped).toBeInstanceOf(z.ZodCodec)
    expect(stripped.decode('42')).toBe(42)
    expect(stripped.encode(42)).toBe('42')
    expect(stripped.in.safeParse(undefined).success).toBe(false)
    expect(stripped.out.safeParse(undefined).success).toBe(false)
    expect(stripped.safeParse(undefined).success).toBe(false)
  })

  test('preserves async transforms and refinements', async () => {
    const schema = z
      .object({ name: z.string().default('fallback') })
      .refine(async ({ name }) => name !== 'blocked', 'Blocked')
      .transform(async ({ name }) => name.toUpperCase())
    const stripped = stripZodDefault(schema)
    await expect(stripped.parseAsync({ name: 'value' })).resolves.toBe('VALUE')
    expect((await stripped.safeParseAsync({})).success).toBe(false)
    expect((await stripped.safeParseAsync({ name: 'blocked' })).error?.issues[0].message).toBe('Blocked')
  })
})

describe('stripZodDefault: schema graphs and compatibility', () => {
  test('supports recursive object getters', () => {
    const Node = z.object({
      name: z.string().default('fallback'),
      get children() {
        return z.array(Node)
      },
    })
    const stripped = stripZodDefault(Node)
    const valid = { name: 'parent', children: [{ name: 'child', children: [] }] }
    expect(stripped.parse(valid)).toEqual(valid)
    expect(stripped.safeParse({ name: 'parent', children: [{ children: [] }] }).success).toBe(false)
    expect(Node.parse({ children: [{ children: [] }] })).toEqual({ name: 'fallback', children: [{ name: 'fallback', children: [] }] })
  })

  test('supports recursive lazies without eagerly invoking the getter', () => {
    type Node = { name: string; children: Node[] }
    const getter = jest.fn(() => z.object({ name: z.string().default('fallback'), children: z.array(Node) }))
    const Node: z.ZodType<Node> = z.lazy(getter)
    const stripped = stripZodDefault(Node)
    expect(getter).not.toHaveBeenCalled()
    expect(stripped.parse({ name: 'parent', children: [{ name: 'child', children: [] }] })).toEqual({ name: 'parent', children: [{ name: 'child', children: [] }] })
    expect(stripped.safeParse({ name: 'parent', children: [{ children: [] }] }).success).toBe(false)
  })

  test('strips previously resolved lazy schemas', () => {
    const schema = z.lazy(() => z.object({ name: z.string().default('fallback') }))
    expect(schema.parse({})).toEqual({ name: 'fallback' })
    const stripped = stripZodDefault(schema)
    expect(stripped.safeParse({}).success).toBe(false)
    expect(stripped.parse({ name: 'value' })).toEqual({ name: 'value' })
    expect(schema.parse({})).toEqual({ name: 'fallback' })
  })

  test('memoizes shared schemas and keeps calls independent', () => {
    const shared = z.object({ name: z.string().default('fallback') })
    const schema = z.object({ first: shared, second: shared })
    const stripped = stripZodDefault(schema)
    expect(stripped.shape.first).toBe(stripped.shape.second)
    expect(stripped.shape.first).not.toBe(shared)
    expect(stripZodDefault(schema)).not.toBe(stripped)
    expect(shared.parse({})).toEqual({ name: 'fallback' })
    expect(stripZodDefault(stripped).safeParse({ first: {}, second: {} }).success).toBe(false)
  })

  test.each([z.string().min(2), z.number().positive(), z.boolean(), z.literal('value'), z.enum(['a', 'b']), z.unknown(), z.any(), z.undefined(), z.null(), z.never(), z.custom<string>()])(
    'leaves schemas without child schemas unchanged: %#',
    (schema) => {
      expect(stripZodDefault(schema)).toBe(schema)
    },
  )

  test('keeps valid undefined values accepted by the underlying schema', () => {
    expect(stripZodDefault(z.unknown().default('fallback')).parse(undefined)).toBeUndefined()
    expect(stripZodDefault(z.any().default('fallback')).parse(undefined)).toBeUndefined()
    expect(stripZodDefault(z.coerce.string().default('fallback')).parse(undefined)).toBe('undefined')
  })

  test('exposes the helper through the public alias and useSchema validation', () => {
    expect(stripZodDefaults).toBe(stripZodDefault)
    const UserSchema = z.strictObject({ name: z.string().default('fallback') }).refine(({ name }) => name !== 'blocked')
    const utils = useSchema({ UserSchema })
    expect(utils.safeParseUser({}).success).toBe(false)
    expect(utils.safeParseUser({ name: 'blocked' }).success).toBe(false)
    expect(utils.safeParseUser({ name: 'value', extra: 1 }).success).toBe(false)
    expect(utils.validateUser({ name: 'value' })).toEqual({ name: 'value' })
  })
})

describe('stripZodDefault: inferred schema types', () => {
  test('updates input and output types through nested wrappers', () => {
    const stripped = stripZodDefault(
      z.object({
        required: z.string().default('fallback'),
        optional: z.string().optional().default('fallback'),
        nullable: z.number().default(1).nullable(),
        caught: z.string().optional().default('fallback').catch('caught'),
        readonly: z.object({ name: z.string().default('fallback') }).readonly(),
        nonoptional: z.string().default('fallback').nonoptional(),
        prefault: z.string().optional().default('fallback').prefault('prefault'),
      }),
    )
    type Expected = { required: string; optional?: string; nullable: number | null; caught?: string; readonly: Readonly<{ name: string }>; nonoptional: string; prefault?: string }
    expectType<
      Equal<
        z.output<typeof stripped>,
        { required: string; optional?: string; nullable: number | null; caught?: string; readonly: Readonly<{ name: string }>; nonoptional: string; prefault: string | undefined }
      >
    >()
    expectType<Equal<z.input<typeof stripped>, Expected>>()
    expect(stripped.shape.required).toBeInstanceOf(z.ZodString)
  })

  test('retains empty tuples, tuple rest types and general option arrays', () => {
    const empty = stripZodDefault(z.tuple([]))
    const tuple = stripZodDefault(z.tuple([z.string().default('fallback')], z.number().default(1)))
    const options: z.ZodDefault<z.ZodString>[] = [z.string().default('fallback')]
    const union = stripZodDefault(z.union(options))
    expectType<Equal<z.input<typeof empty>, []>>()
    expectType<Equal<z.input<typeof tuple>, [string, ...number[]]>>()
    expectType<Equal<z.output<typeof tuple>, [string, ...number[]]>>()
    expectType<Equal<z.input<typeof union>, string>>()
    expect(tuple.parse(['value', 1])).toEqual(['value', 1])
  })

  test('preserves specialized schema classes and transformed types', () => {
    const union = stripZodDefault(z.discriminatedUnion('kind', [z.object({ kind: z.literal('a'), value: z.string().default('fallback') })]))
    const codec = stripZodDefault(z.codec(z.string().default('1'), z.number().default(1), { decode: Number, encode: String }))
    const transform = stripZodDefault(
      z
        .string()
        .default('fallback')
        .transform((value) => value.length),
    )
    expectType<Equal<typeof union.def.discriminator, 'kind'>>()
    expectType<Equal<z.input<typeof union>, { kind: 'a'; value: string }>>()
    expectType<Equal<z.input<typeof codec>, string>>()
    expectType<Equal<z.output<typeof codec>, number>>()
    expectType<Equal<z.input<typeof transform>, string>>()
    expectType<Equal<z.output<typeof transform>, number>>()
    expect(codec.encode(2)).toBe('2')
  })

  test('updates container element types', () => {
    const array = stripZodDefault(z.array(z.string().default('fallback')))
    const record = stripZodDefault(z.record(z.string(), z.number().default(1)))
    const map = stripZodDefault(z.map(z.string().default('key'), z.number().default(1)))
    const set = stripZodDefault(z.set(z.string().default('fallback')))
    const lazy = stripZodDefault(z.lazy(() => z.string().optional().default('fallback')))
    const promise = stripZodDefault(z.promise(z.string().optional().default('fallback')))
    expectType<Equal<z.input<typeof array>, string[]>>()
    expectType<Equal<z.input<typeof record>, Record<string, number>>>()
    expectType<Equal<z.input<typeof map>, Map<string, number>>>()
    expectType<Equal<z.input<typeof set>, Set<string>>>()
    expectType<Equal<z.output<typeof lazy>, string | undefined>>()
    expectType<Equal<z.output<typeof promise>, Promise<string | undefined>>>()
    expect(array.parse(['value'])).toEqual(['value'])
  })
})
