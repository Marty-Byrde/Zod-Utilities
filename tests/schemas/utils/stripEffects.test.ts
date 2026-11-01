import { stripEffects } from '@/index'
import type { StripEffects } from '@/src/stripEffects'
import { File } from 'node:buffer'
import { z } from 'zod'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
function expectType<T extends true>() {}

const reject = () => false
const effectfulString = () =>
  z
    .string()
    .refine(reject)
    .transform((value) => value.length)

describe('stripEffects: refinements and built-in checks', () => {
  test.each([
    { name: 'string', schema: z.string().min(2).max(4).regex(/^a/).refine(reject), valid: 'abc', invalid: ['a', 'abcde', 'bbb', 1] },
    { name: 'number', schema: z.number().min(2).max(4).multipleOf(2).refine(reject), valid: 2, invalid: [0, 6, 3, '2'] },
    { name: 'bigint', schema: z.bigint().min(BigInt(2)).max(BigInt(4)).refine(reject), valid: BigInt(3), invalid: [BigInt(1), BigInt(5), 3] },
    { name: 'date', schema: z.date().min(new Date(1)).max(new Date(3)).refine(reject), valid: new Date(2), invalid: [new Date(0), new Date(4), 'date'] },
    { name: 'boolean', schema: z.boolean().refine(reject), valid: false, invalid: [0, 'false'] },
    { name: 'symbol', schema: z.symbol().refine(reject), valid: Symbol.for('value'), invalid: ['value'] },
    { name: 'literal', schema: z.literal(['a', 'b']).refine(reject), valid: 'a', invalid: ['c', 1] },
    { name: 'enum', schema: z.enum(['a', 'b']).refine(reject), valid: 'a', invalid: ['c', 1] },
    { name: 'nan', schema: z.nan().refine(reject), valid: NaN, invalid: [0, 'NaN'] },
  ])('removes $name refinements and preserves built-in validation', ({ schema, valid, invalid }) => {
    const stripped = stripEffects(schema)
    expect(stripped.parse(valid)).toEqual(valid)
    for (const value of invalid) expect(stripped.safeParse(value).success).toBe(false)
    expect(schema.safeParse(valid).success).toBe(false)
  })

  test.each([
    { name: 'any', schema: z.any(), valid: 1 },
    { name: 'unknown', schema: z.unknown(), valid: { value: 1 } },
    { name: 'null', schema: z.null(), valid: null },
    { name: 'undefined', schema: z.undefined(), valid: undefined },
    { name: 'void', schema: z.void(), valid: undefined },
  ])('removes refinements on $name', ({ schema, valid }) => {
    expect(stripEffects((schema as z.ZodType).refine(reject)).parse(valid)).toEqual(valid)
  })

  test('preserves never in both modes', () => {
    for (const strip of ['effects-only', 'all'] as const) {
      const stripped = stripEffects(z.never(), { strip })
      for (const value of [undefined, null, '', 1, {}]) expect(stripped.safeParse(value).success).toBe(false)
    }
  })

  test('removes refine, superRefine, check and overwrite callbacks without calling them', () => {
    const refine = jest.fn(reject)
    const superRefine = jest.fn((_value: string, ctx: z.RefinementCtx) => ctx.addIssue({ code: 'custom', message: 'Rejected' }))
    const check = jest.fn((ctx: z.core.ParsePayload<string>) => {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: 'Rejected' })
    })
    const overwrite = jest.fn((value: string) => value.toUpperCase())
    const schema = z.string().refine(refine).superRefine(superRefine).check(check).overwrite(overwrite)
    expect(stripEffects(schema).parse('value')).toBe('value')
    for (const callback of [refine, superRefine, check, overwrite]) expect(callback).not.toHaveBeenCalled()
  })

  test('removes built-in string mutations while retaining length checks', () => {
    const schema = z.string().trim().toUpperCase().toLowerCase().normalize().min(2)
    const stripped = stripEffects(schema)
    expect(stripped.parse(' e\u0301x ')).toBe(' e\u0301x ')
    expect(stripped.safeParse('a').success).toBe(false)
    expect(schema.parse(' e\u0301x ')).toBe('éx')
  })

  test('removes async refinements and transformations for synchronous parsing', async () => {
    const refinement = jest.fn(async () => false)
    const transform = jest.fn(async (value: string) => value.length)
    const stripped = stripEffects(z.string().refine(refinement).transform(transform))
    expect(stripped.parse('value')).toBe('value')
    await expect(stripped.parseAsync('value')).resolves.toBe('value')
    expect(refinement).not.toHaveBeenCalled()
    expect(transform).not.toHaveBeenCalled()
  })

  test.each([
    { schema: z.string().min(3).max(5).regex(/^a/), valid: '' },
    { schema: z.number().int().positive().multipleOf(2), valid: -1.5 },
    { schema: z.bigint().min(BigInt(2)), valid: BigInt(-1) },
    { schema: z.date().min(new Date(10)), valid: new Date(0) },
    { schema: z.email(), valid: 'invalid' },
    { schema: z.uuid(), valid: 'invalid' },
    { schema: z.url(), valid: 'invalid' },
    { schema: z.int(), valid: 1.5 },
    { schema: z.int32(), valid: 1e20 },
    { schema: z.int64(), valid: BigInt('9223372036854775808') },
  ])('all removes both attached and intrinsic checks: %#', ({ schema, valid }) => {
    expect(schema.safeParse(valid).success).toBe(false)
    expect(stripEffects(schema, { strip: 'all' }).parse(valid)).toEqual(valid)
    expect(stripEffects(schema).safeParse(valid).success).toBe(false)
  })

  test.each(['effects-only', 'all'] as const)('%s preserves base type validation', (strip) => {
    expect(stripEffects(z.string().min(2), { strip }).safeParse(1).success).toBe(false)
    expect(stripEffects(z.number().min(2), { strip }).safeParse('1').success).toBe(false)
    expect(stripEffects(z.number(), { strip }).safeParse(Infinity).success).toBe(false)
    expect(stripEffects(z.date(), { strip }).safeParse(new Date(NaN)).success).toBe(false)
    expect(stripEffects(z.literal('a'), { strip }).safeParse('b').success).toBe(false)
    expect(stripEffects(z.enum(['a', 'b']), { strip }).safeParse('c').success).toBe(false)
  })

  test.each(['effects-only', 'all'] as const)('%s preserves coercion', (strip) => {
    expect(stripEffects(z.coerce.string().refine(reject), { strip }).parse(42)).toBe('42')
    expect(stripEffects(z.coerce.number().refine(reject), { strip }).parse('42')).toBe(42)
    expect(stripEffects(z.coerce.boolean().refine(reject), { strip }).parse(1)).toBe(true)
    expect(stripEffects(z.coerce.bigint().refine(reject), { strip }).parse('42')).toBe(BigInt(42))
    expect(stripEffects(z.coerce.date().refine(reject), { strip }).parse(0)).toEqual(new Date(0))
  })

  test('strips effects inside property checks while retaining their built-in validation', () => {
    const schema = z.string().check(z.property('length', z.number().min(2).refine(reject)))
    expect(stripEffects(schema).parse('ab')).toBe('ab')
    expect(stripEffects(schema).safeParse('a').error?.issues[0].path).toEqual(['length'])
    expect(stripEffects(schema, { strip: 'all' }).parse('a')).toBe('a')
    expect(schema.safeParse('ab').success).toBe(false)
  })

  test('preserves file size and MIME checks unless all is selected', () => {
    const schema = z.file().min(2).max(4).mime('text/plain').refine(reject)
    const valid = new File(['abc'], 'file.txt', { type: 'text/plain' })
    const invalid = new File(['a'], 'file.json', { type: 'application/json' })
    expect(stripEffects(schema).parse(valid)).toBe(valid)
    expect(stripEffects(schema).safeParse(invalid).success).toBe(false)
    expect(stripEffects(schema, { strip: 'all' }).parse(invalid)).toBe(invalid)
    expect(stripEffects(schema, { strip: 'all' }).safeParse('file').success).toBe(false)
  })
})

describe('stripEffects: transforms, pipes and codecs', () => {
  test('reduces chained transforms and pipes to the original input schema', () => {
    const transform = jest.fn((value: string) => value.length)
    const schema = z.string().min(2).transform(transform).pipe(z.number().min(10)).transform(String).refine(reject)
    const stripped = stripEffects(schema)
    expect(stripped).toBeInstanceOf(z.ZodString)
    expect(stripped.parse('ab')).toBe('ab')
    expect(stripped.safeParse('a').success).toBe(false)
    expect(transform).not.toHaveBeenCalled()
  })

  test('removes a validation-only pipe output', () => {
    const stripped = stripEffects(z.string().pipe(z.string().min(10)))
    expect(stripped.parse('a')).toBe('a')
  })

  test('reduces preprocessors to their stripped output schema', () => {
    const preprocess = jest.fn(Number)
    const stripped = stripEffects(z.preprocess(preprocess, z.number().min(2).refine(reject)))
    expect(stripped).toBeInstanceOf(z.ZodNumber)
    expect(stripped.parse(3)).toBe(3)
    expect(stripped.safeParse('3').success).toBe(false)
    expect(stripped.safeParse(1).success).toBe(false)
    expect(preprocess).not.toHaveBeenCalled()
  })

  test('handles nested preprocessors and transforms', () => {
    const schema = z.preprocess(String, z.preprocess(String, effectfulString())).transform(Boolean)
    const stripped = stripEffects(schema)
    expect(stripped.parse('value')).toBe('value')
    expect(stripped.safeParse(1).success).toBe(false)
  })

  test('removes standalone transforms and custom predicates without inventing an underlying schema', () => {
    const transform = jest.fn(String)
    const predicate = jest.fn(reject)
    for (const schema of [z.transform(transform), z.custom<string>(predicate), z.instanceof(Date)]) {
      const stripped = stripEffects(schema)
      expect(stripped).toBeInstanceOf(z.ZodUnknown)
      expect(stripped.parse(123)).toBe(123)
      expect(stripped.parse(undefined)).toBeUndefined()
    }
    expect(transform).not.toHaveBeenCalled()
    expect(predicate).not.toHaveBeenCalled()
  })

  test('removes codec conversions and keeps input validation', () => {
    const decode = jest.fn(Number)
    const encode = jest.fn(String)
    const schema = z.codec(z.string().min(2).refine(reject), z.number(), { decode, encode })
    const stripped = stripEffects(schema)
    expect(stripped.parse('42')).toBe('42')
    expect(stripped.safeParse('1').success).toBe(false)
    expect(stripped.safeParse(42).success).toBe(false)
    expect(decode).not.toHaveBeenCalled()
    expect(encode).not.toHaveBeenCalled()
  })
})

describe('stripEffects: wrappers and fallbacks', () => {
  test('preserves optional, nullable, nullish and nonoptional wrappers', () => {
    const stripped = stripEffects(effectfulString().optional().nullable())
    expect(stripped.parse(undefined)).toBeUndefined()
    expect(stripped.parse(null)).toBeNull()
    expect(stripped.parse('value')).toBe('value')
    expect(stripEffects(effectfulString().nullish()).parse(null)).toBeNull()
    const required = stripEffects(effectfulString().optional().nonoptional({ error: 'Required' }).refine(reject))
    expect(required.safeParse(undefined).error?.issues[0].message).toBe('Required')
    expect(required.parse('value')).toBe('value')
  })

  test('removes refinements attached to wrappers', () => {
    for (const schema of [z.string().optional(), z.string().nullable(), z.string().default('fallback'), z.string().catch('fallback'), z.string().readonly(), z.string().prefault('fallback')]) {
      expect(stripEffects((schema as z.ZodType).refine(reject)).parse('value')).toBe('value')
    }
  })

  test('preserves falsy defaults and catch values', () => {
    expect(stripEffects(z.number().refine(reject).default(0)).parse(undefined)).toBe(0)
    expect(stripEffects(z.boolean().refine(reject).default(false)).parse(undefined)).toBe(false)
    expect(stripEffects(z.string().refine(reject).default('')).parse(undefined)).toBe('')
    expect(stripEffects(z.number().refine(reject).catch(0)).parse('invalid')).toBe(0)
    expect(stripEffects(z.boolean().refine(reject).catch(false)).parse('invalid')).toBe(false)
    expect(stripEffects(z.string().refine(reject).catch('')).parse(1)).toBe('')
  })

  test('preserves default factories and runs them only when parsing undefined', () => {
    let counter = 0
    const factory = jest.fn(() => `fallback-${++counter}`)
    const schema = z.string().refine(reject).default(factory)
    const stripped = stripEffects(schema)
    expect(factory).not.toHaveBeenCalled()
    expect(stripped.parse('value')).toBe('value')
    expect(factory).not.toHaveBeenCalled()
    expect(stripped.parse(undefined)).toBe('fallback-1')
    expect(stripped.parse(undefined)).toBe('fallback-2')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  test('keeps output defaults after removing type-changing transforms', () => {
    const stripped = stripEffects(
      z
        .string()
        .transform((value) => value.length)
        .default(0),
    )
    expect(stripped.parse(undefined)).toBe(0)
    expect(stripped.parse('value')).toBe('value')
    expectType<Equal<z.output<typeof stripped>, string | number>>()
    expect(stripped.unwrap()).toBeInstanceOf(z.ZodString)
  })

  test('preserves prefault factories and parses prefaults through the stripped inner schema', () => {
    const factory = jest.fn(() => ' value ')
    const stripped = stripEffects(z.string().trim().min(2).refine(reject).prefault(factory))
    expect(factory).not.toHaveBeenCalled()
    expect(stripped.parse(undefined)).toBe(' value ')
    expect(stripped.parse(undefined)).toBe(' value ')
    expect(factory).toHaveBeenCalledTimes(2)
    expect(stripped.safeParse('a').success).toBe(false)
  })

  test('preserves catch factories and their error context', () => {
    const fallback = jest.fn((ctx: z.core.$ZodCatchCtx) => ctx.error.issues[0].code.length)
    const stripped = stripEffects(effectfulString().catch(fallback))
    expect(fallback).not.toHaveBeenCalled()
    expect(stripped.parse('value')).toBe('value')
    expect(fallback).not.toHaveBeenCalled()
    expect(stripped.parse(null)).toBe('invalid_type'.length)
    expect(fallback).toHaveBeenCalledTimes(1)
    expectType<Equal<z.output<typeof stripped>, string | number>>()
  })

  test('retains defaults inside optional object properties', () => {
    const stripped = stripEffects(z.object({ name: z.string().refine(reject).default('fallback').optional() }))
    expect(stripped.parse({})).toEqual({ name: 'fallback' })
  })

  test('preserves readonly freezing after stripping nested effects', () => {
    const stripped = stripEffects(z.object({ name: effectfulString() }).readonly().refine(reject))
    const value = stripped.parse({ name: 'value' })
    expect(value).toEqual({ name: 'value' })
    expect(Object.isFrozen(value)).toBe(true)
  })

  test('traverses success wrappers', () => {
    const stripped = stripEffects(z.success(effectfulString()).refine(reject))
    expect(stripped.parse('value')).toBe(true)
    expect(stripped.safeParse(1).success).toBe(false)
  })
})

describe('stripEffects: objects and omission', () => {
  test('strips effects through deeply nested objects and arrays', () => {
    const stripped = stripEffects(z.object({ users: z.array(z.object({ profile: z.object({ name: effectfulString() }).refine(reject) })).refine(reject) }).refine(reject))
    const value = { users: [{ profile: { name: 'value' } }] }
    expect(stripped.parse(value)).toEqual(value)
    expect(stripped.safeParse({ users: [{ profile: { name: 1 } }] }).success).toBe(false)
  })

  test.each([
    { name: 'strip', schema: z.object({ name: effectfulString() }), succeeds: true, keepsExtra: false },
    { name: 'strict', schema: z.strictObject({ name: effectfulString() }), succeeds: false, keepsExtra: false },
    { name: 'loose', schema: z.looseObject({ name: effectfulString() }), succeeds: true, keepsExtra: true },
  ])('preserves $name object key policy', ({ schema, succeeds, keepsExtra }) => {
    for (const strip of ['effects-only', 'all'] as const) {
      const result = stripEffects(schema, { strip }).safeParse({ name: 'value', extra: 1 })
      expect(result.success).toBe(succeeds)
      if (result.success) expect(result.data).toEqual(keepsExtra ? { name: 'value', extra: 1 } : { name: 'value' })
    }
  })

  test('strips effects from catchalls while preserving their built-in checks', () => {
    const schema = z.object({ name: effectfulString() }).catchall(
      z
        .string()
        .min(2)
        .refine(reject)
        .transform((value) => value.length),
    )
    const stripped = stripEffects(schema)
    expect(stripped.parse({ name: 'value', extra: 'ab' })).toEqual({ name: 'value', extra: 'ab' })
    expect(stripped.safeParse({ name: 'value', extra: 'a' }).success).toBe(false)
    expect(stripEffects(schema, { strip: 'all' }).parse({ name: 'value', extra: '' })).toEqual({ name: 'value', extra: '' })
  })

  test('omits keys from every nested shape, including catchalls and collection values', () => {
    const inner = z.object({ correctness: effectfulString(), value: effectfulString() })
    const schema = z.object({ correctness: z.string(), nested: inner, list: z.array(inner), record: z.record(z.string(), inner) }).catchall(inner)
    const stripped = stripEffects(schema, { omitKeys: ['correctness', 'missing'] })
    const input = { correctness: { value: 'extra' }, nested: { value: 'nested' }, list: [{ value: 'list' }], record: { key: { value: 'record' } } }
    expect(stripped.parse(input)).toEqual(input)
    expect(stripped.shape).not.toHaveProperty('correctness')
    expect(stripped.shape.nested.shape).not.toHaveProperty('correctness')
    expect(schema.shape).toHaveProperty('correctness')
  })

  test('omitting a shape key still respects unknown-key policies', () => {
    const shape = { remove: z.string(), keep: z.string() }
    const options = { omitKeys: ['remove'] } as const
    expect(stripEffects(z.object(shape), options).parse({ remove: 'x', keep: 'y' })).toEqual({ keep: 'y' })
    expect(stripEffects(z.looseObject(shape), options).parse({ remove: 'x', keep: 'y' })).toEqual({ remove: 'x', keep: 'y' })
    expect(stripEffects(z.strictObject(shape), options).safeParse({ remove: 'x', keep: 'y' }).success).toBe(false)
    expect(stripEffects(z.strictObject(shape), options).parse({ keep: 'y' })).toEqual({ keep: 'y' })
  })

  test('combines omission and all mode', () => {
    const stripped = stripEffects(z.object({ remove: z.string(), nested: z.object({ remove: z.string(), value: z.string().min(3).refine(reject) }) }), {
      strip: 'all',
      omitKeys: ['remove'],
    })
    expect(stripped.parse({ nested: { value: '' } })).toEqual({ nested: { value: '' } })
  })

  test('preserves error customization and metadata', () => {
    const schema = z.object({ name: effectfulString() }, { error: 'Expected an object' }).describe('User').meta({ title: 'A user' })
    const stripped = stripEffects(schema)
    expect(stripped.safeParse(null).error?.issues[0].message).toBe('Expected an object')
    expect(stripped.description).toBe('User')
    expect(stripped.meta()).toEqual(expect.objectContaining({ title: 'A user' }))
    expect(stripEffects(z.string({ error: 'Expected a string' }).refine(reject), { strip: 'all' }).safeParse(1).error?.issues[0].message).toBe('Expected a string')
  })

  test('handles special property names safely', () => {
    const schema = z.object({ ['__proto__']: effectfulString(), constructor: effectfulString() })
    const stripped = stripEffects(schema)
    expect(Object.prototype.hasOwnProperty.call(stripped.shape, '__proto__')).toBe(true)
    expect(stripped.shape.__proto__).toBeInstanceOf(z.ZodString)
    expect(stripped.shape.constructor).toBeInstanceOf(z.ZodString)
    expect(schema.shape.__proto__).toBeInstanceOf(z.ZodPipe)
    expect(Object.prototype.hasOwnProperty.call(stripEffects(schema, { omitKeys: ['__proto__'] }).shape, '__proto__')).toBe(false)
  })
})

describe('stripEffects: collections and composite schemas', () => {
  test.each([
    { schema: z.array(effectfulString()).min(2), invalid: ['one'], valid: ['one', 'two'] },
    { schema: z.array(effectfulString()).max(2), invalid: ['one', 'two', 'three'], valid: ['one', 'two'] },
    { schema: z.array(effectfulString()).length(2), invalid: ['one'], valid: ['one', 'two'] },
    { schema: z.array(effectfulString()).nonempty(), invalid: [], valid: ['one'] },
  ])('preserves array size constraints unless all is selected: %#', ({ schema, valid, invalid }) => {
    expect(stripEffects(schema.refine(reject)).parse(valid)).toEqual(valid)
    expect(stripEffects(schema).safeParse(invalid).success).toBe(false)
    expect(stripEffects(schema, { strip: 'all' }).parse(invalid)).toEqual(invalid)
  })

  test('preserves tuple rest schemas and removes their effects', () => {
    const stripped = stripEffects(z.tuple([effectfulString()], z.number().min(2).refine(reject).transform(String)).refine(reject))
    expect(stripped.parse(['value', 2, 3])).toEqual(['value', 2, 3])
    expect(stripped.safeParse(['value', 1]).success).toBe(false)
    expect(stripped.safeParse(['value', '2']).success).toBe(false)
    expect(stripped.safeParse([]).success).toBe(false)
  })

  test('handles empty, fixed and rest-only tuples', () => {
    expect(stripEffects(z.tuple([])).parse([])).toEqual([])
    expect(stripEffects(z.tuple([]).rest(effectfulString())).parse(['a', 'b'])).toEqual(['a', 'b'])
    expect(stripEffects(z.tuple([effectfulString()])).safeParse(['a', 'b']).success).toBe(false)
  })

  test('strips each union option and refinements on the union itself', () => {
    const stripped = stripEffects(z.union([effectfulString(), z.number().refine(reject).transform(String)]).refine(reject))
    expect(stripped.parse('value')).toBe('value')
    expect(stripped.parse(2)).toBe(2)
    expect(stripped.safeParse(true).success).toBe(false)
  })

  test('preserves discriminated unions and discriminator errors', () => {
    const schema = z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('a').transform((value) => value.toUpperCase()), value: effectfulString() }),
        z.object({ kind: z.literal('b'), value: z.number().refine(reject) }),
      ])
      .refine(reject)
    const stripped = stripEffects(schema)
    expect(stripped).toBeInstanceOf(z.ZodDiscriminatedUnion)
    expect(stripped.def.discriminator).toBe('kind')
    expect(stripped.parse({ kind: 'a', value: 'value' })).toEqual({ kind: 'a', value: 'value' })
    expect(stripped.parse({ kind: 'b', value: 1 })).toEqual({ kind: 'b', value: 1 })
    expect(stripped.safeParse({ kind: 'other', value: 1 }).error?.issues[0].path).toEqual(['kind'])
  })

  test('handles nested discriminated unions', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('a'), value: effectfulString() }),
      z.discriminatedUnion('code', [z.object({ kind: z.literal('b'), code: z.literal(1), value: effectfulString() })]),
    ])
    expect(stripEffects(schema).parse({ kind: 'b', code: 1, value: 'value' })).toEqual({ kind: 'b', code: 1, value: 'value' })
  })

  test.each(['kind', ''])('uses an ordinary union when discriminator %j is omitted', (key) => {
    const schema = z.discriminatedUnion(key, [z.object({ [key]: z.literal('a'), name: effectfulString() }), z.object({ [key]: z.literal('b'), count: z.number().refine(reject) })])
    const stripped = stripEffects(schema, { omitKeys: [key] })
    expect(stripped).toBeInstanceOf(z.ZodUnion)
    expect(stripped).not.toBeInstanceOf(z.ZodDiscriminatedUnion)
    expect(stripped.parse({ name: 'value' })).toEqual({ name: 'value' })
    expect(stripped.parse({ count: 1 })).toEqual({ count: 1 })
    expect(stripped.safeParse({}).success).toBe(false)
  })

  test('strips both intersection sides and checks on the intersection', () => {
    const stripped = stripEffects(z.intersection(z.object({ left: effectfulString() }), z.object({ right: z.number().min(2).refine(reject) })).refine(reject))
    expect(stripped.parse({ left: 'value', right: 2 })).toEqual({ left: 'value', right: 2 })
    expect(stripped.safeParse({ left: 'value', right: 1 }).success).toBe(false)
  })

  test('traverses record keys and values', () => {
    const schema = z.record(z.string().regex(/^key/).refine(reject), effectfulString()).refine(reject)
    expect(stripEffects(schema).parse({ key1: 'value' })).toEqual({ key1: 'value' })
    expect(stripEffects(schema).safeParse({ other: 'value' }).success).toBe(false)
    expect(stripEffects(schema, { strip: 'all' }).parse({ other: 'value' })).toEqual({ other: 'value' })
  })

  test('preserves exhaustive and partial enum records', () => {
    const keys = z.enum(['a', 'b'])
    const exhaustive = stripEffects(z.record(keys, effectfulString()))
    const partial = stripEffects(z.partialRecord(keys, effectfulString()))
    expect(exhaustive.safeParse({ a: 'value' }).success).toBe(false)
    expect(exhaustive.parse({ a: 'value', b: 'value' })).toEqual({ a: 'value', b: 'value' })
    expect(partial.parse({ a: 'value' })).toEqual({ a: 'value' })
    expect(partial.safeParse({ c: 'value' }).success).toBe(false)
  })

  test('traverses map keys and values', () => {
    const schema = z.map(effectfulString(), z.number().min(2).refine(reject).transform(String)).refine(reject)
    const value = new Map([['key', 2]])
    expect(stripEffects(schema).parse(value)).toEqual(value)
    expect(stripEffects(schema).safeParse(new Map([['key', 1]])).success).toBe(false)
  })

  test.each([
    { schema: z.set(effectfulString()).min(2), invalid: new Set(['a']), valid: new Set(['a', 'b']) },
    { schema: z.set(effectfulString()).max(1), invalid: new Set(['a', 'b']), valid: new Set(['a']) },
    { schema: z.set(effectfulString()).size(1), invalid: new Set<string>(), valid: new Set(['a']) },
  ])('preserves set size constraints unless all is selected: %#', ({ schema, invalid, valid }) => {
    expect(stripEffects(schema.refine(reject)).parse(valid)).toEqual(valid)
    expect(stripEffects(schema).safeParse(invalid).success).toBe(false)
    expect(stripEffects(schema, { strip: 'all' }).parse(invalid)).toEqual(invalid)
  })

  test('preserves template structure while stripping checks from its schema parts', () => {
    const schema = z.templateLiteral(['prefix-', z.string().min(3)]).refine(reject)
    expect(stripEffects(schema).parse('prefix-abc')).toBe('prefix-abc')
    expect(stripEffects(schema).safeParse('prefix-a').success).toBe(false)
    expect(stripEffects(schema, { strip: 'all' }).parse('prefix-a')).toBe('prefix-a')
    expect(stripEffects(schema, { strip: 'all' }).safeParse('other-a').success).toBe(false)
  })

  test('traverses promise innerType using asynchronous parsing', async () => {
    const stripped = stripEffects(z.promise(effectfulString()))
    await expect(stripped.parseAsync(Promise.resolve('value'))).resolves.toBe('value')
    await expect(stripped.parseAsync(Promise.resolve(1))).rejects.toBeInstanceOf(z.ZodError)
  })

  test('strips function argument and return schema effects', () => {
    const stripped = stripEffects(z.function({ input: [effectfulString()], output: effectfulString() }))
    const fn = stripped.implement((value) => value)
    expect(fn('value')).toBe('value')
    expect(() => fn(1 as unknown as string)).toThrow(z.core.$ZodError)
  })
})

describe('stripEffects: recursion, sharing and types', () => {
  test('supports self-recursive object getters', () => {
    const schema = z
      .object({
        name: effectfulString(),
        remove: z.string(),
        get children(): z.ZodArray<z.ZodType> {
          return z.array(schema)
        },
      })
      .refine(reject)
    const stripped = stripEffects(schema, { omitKeys: ['remove'] })
    const value = { name: 'root', children: [{ name: 'child', children: [] }] }
    expect(stripped.parse(value)).toEqual(value)
    expect(stripped.shape.children.element).toBe(stripped)
  })

  test('supports mutually recursive object getters', () => {
    const left = z.object({
      name: effectfulString(),
      get right() {
        return right.optional()
      },
    })
    const right = z.object({
      count: z.number().refine(reject),
      get left() {
        return left.optional()
      },
    })
    expect(stripEffects(left).parse({ name: 'left', right: { count: 1, left: { name: 'nested' } } })).toEqual({ name: 'left', right: { count: 1, left: { name: 'nested' } } })
  })

  test('supports lazy recursion and already parsed lazy schemas', () => {
    type Node = { name: string; children: Node[] }
    const schema: z.ZodType<Node> = z.lazy(() =>
      z.object({
        name: z
          .string()
          .min(1)
          .refine((value) => value !== 'blocked'),
        children: z.array(schema),
      }),
    )
    expect(schema.parse({ name: 'root', children: [] })).toEqual({ name: 'root', children: [] })
    const stripped = stripEffects(schema)
    expect(stripped.parse({ name: 'blocked', children: [{ name: 'blocked', children: [] }] })).toEqual({ name: 'blocked', children: [{ name: 'blocked', children: [] }] })
    expect(stripped.safeParse({ name: '', children: [] }).success).toBe(false)
    expect(schema.safeParse({ name: 'blocked', children: [] }).success).toBe(false)
  })

  test('defers lazy getters until the inner schema is needed', () => {
    const getter = jest.fn(effectfulString)
    const stripped = stripEffects(z.lazy(getter))
    expect(getter).not.toHaveBeenCalled()
    expect(stripped.parse('value')).toBe('value')
    expect(getter).toHaveBeenCalledTimes(1)
  })

  test('memoizes shared schemas and keeps options isolated between calls', () => {
    const shared = z.object({ name: effectfulString(), remove: z.string() })
    const schema = z.object({ first: shared, second: shared })
    const omitted = stripEffects(schema, { omitKeys: ['remove'] })
    const retained = stripEffects(schema)
    expect(omitted.shape.first).toBe(omitted.shape.second)
    expect(omitted.shape.first.shape).not.toHaveProperty('remove')
    expect(retained.shape.first.shape).toHaveProperty('remove')
    expect(schema.shape.first).toBe(shared)
    expect(schema.shape.first.shape.name).toBeInstanceOf(z.ZodPipe)
  })

  test('does not mutate source definitions, checks or parsing behavior', () => {
    const inner = z.string().min(2).refine(reject)
    const schema = z.array(inner).min(2)
    const originalChecks = schema.def.checks
    const innerChecks = inner.def.checks
    expect(stripEffects(schema, { strip: 'all' }).parse(['a'])).toEqual(['a'])
    expect(schema.def.checks).toBe(originalChecks)
    expect(inner.def.checks).toBe(innerChecks)
    expect(schema.safeParse(['ab', 'cd']).success).toBe(false)
    expect(inner.safeParse('ab').success).toBe(false)
  })

  test('infers stripped types for every supported container and omitted key', () => {
    const string = effectfulString()
    const object = stripEffects(z.object({ remove: z.string(), nested: z.object({ remove: z.string(), value: string }) }), { omitKeys: ['remove'] })
    expectType<Equal<z.output<typeof object>, { nested: { value: string } }>>()
    const tuple = stripEffects(z.tuple([string], string))
    expectType<Equal<z.output<typeof tuple>, [string, ...string[]]>>()
    const union = stripEffects(z.union([string, z.number().transform(String)]))
    expectType<Equal<z.output<typeof union>, string | number>>()
    const record = stripEffects(z.record(z.string(), string))
    expectType<Equal<z.output<typeof record>, Record<string, string>>>()
    const map = stripEffects(z.map(string, string))
    expectType<Equal<z.output<typeof map>, Map<string, string>>>()
    const set = stripEffects(z.set(string))
    expectType<Equal<z.output<typeof set>, Set<string>>>()
    const lazy = stripEffects(z.lazy(() => string))
    expectType<Equal<z.output<typeof lazy>, string>>()
    const promise = stripEffects(z.promise(string))
    expectType<Equal<z.output<typeof promise>, Promise<string>>>()
    const preprocess = stripEffects(z.preprocess(String, z.number().transform(String)))
    expectType<Equal<z.output<typeof preprocess>, number>>()
    const standalone = stripEffects(z.transform(String))
    expectType<Equal<z.output<typeof standalone>, unknown>>()
    const optional = stripEffects(string.optional().nullable())
    expectType<Equal<z.output<typeof optional>, string | null | undefined>>()
    const prefault = stripEffects(string.prefault('value'))
    expectType<Equal<z.output<typeof prefault>, string>>()
    expectType<Equal<StripEffects<typeof string>, z.ZodString>>()
    const email = stripEffects(z.email(), { strip: 'all' })
    expectType<Equal<typeof email, z.ZodString>>()
    const catchall = stripEffects(z.object({ name: string }).catchall(string))
    expectType<Equal<z.output<typeof catchall>['extra'], unknown>>()
    expect(catchall.parse({ name: 'name', extra: 'extra' })).toEqual({ name: 'name', extra: 'extra' })
    expect(object.parse({ nested: { value: 'value' } })).toEqual({ nested: { value: 'value' } })
  })
})
