import { describe } from '@jest/globals'
import { z } from 'zod'
import schemaDefaults, { DEFAULT_ARRAY_SIZE } from '@/src/schemaDefaults'

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('schemaDefaults: original behavior', () => {
  test('check that numerical values have their default values or 0', () => {
    const schema = z.object({
      id: z.number().default(1),
      price: z.number(),
    })

    const dummyInstance = schemaDefaults(schema, { generateRandomNumbers: false })

    expect(dummyInstance).toEqual({
      id: 1,
      price: 0,
    })
  })

  test('check that string values have their default values or empty string', () => {
    const schema = z.object({
      name: z.string().default('Article-XY'),
      code: z.string(),
    })

    const dummyInstance = schemaDefaults(schema)

    expect(dummyInstance).toEqual({
      name: 'Article-XY',
      code: '',
    })
  })

  test('check that boolean values have their default values or false', () => {
    const schema = z.object({
      enabled: z.boolean().default(true),
      disabled: z.boolean(),
    })

    const dummyInstance = schemaDefaults(schema)

    expect(dummyInstance).toEqual({
      enabled: true,
      disabled: false,
    })
  })

  test('check that array values have a fixed length of 5', () => {
    const schema = z.object({
      defaultComments: z.array(z.string()).default(['comment1', 'comment2']),
      comments: z.array(z.string()),
    })

    const dummyInstance = schemaDefaults(schema)

    expect(dummyInstance).toEqual({
      defaultComments: ['comment1', 'comment2'],
      comments: Array.from({ length: DEFAULT_ARRAY_SIZE }).map(() => ''),
    })
  })

  test('check that ZodNull and ZodUndefined values are set to null and undefined', () => {
    const schema = z.object({
      nullValue: z.null(),
      undefinedValue: z.undefined(),
    })

    const dummyInstance = schemaDefaults(schema)

    expect(dummyInstance).toEqual({
      nullValue: null,
      undefinedValue: undefined,
    })
  })

  test('check that ZodNullable values are set to null', () => {
    const schema = z.object({
      nullableValue: z.string().nullable(),
    })

    const dummyInstance = schemaDefaults(schema, { instantiate_Nullable_PrimitiveProps: false })

    expect(dummyInstance).toEqual({
      nullableValue: null,
    })
  })

  test('check that ZodUnknown values are set to undefined', () => {
    const schema = z.object({
      unknownValue: z.unknown(),
    })

    const dummyInstance = schemaDefaults(schema, { instantiate_Optional_PrimitiveProps: false })

    expect(dummyInstance).toEqual({
      unknownValue: undefined,
    })
  })

  test('check that ZodCatch values are set to the catchValue', () => {
    const schema = z.object({
      catchValue: z.string().catch('catchValue'),
    })

    const dummyInstance = schemaDefaults(schema)

    expect(dummyInstance).toEqual({
      catchValue: 'catchValue',
    })
  })

  test('check that optional objects are set to undefined', () => {
    const schema = z.object({
      object: z
        .object({
          name: z.string(),
        })
        .optional(),
    })

    const dummyInstance = schemaDefaults(schema, { instantiate_Optional_Objects: false })

    expect(dummyInstance).toEqual({
      object: undefined,
    })
  })

  test('check that optional objects are defined', () => {
    const schema = z.object({
      object: z
        .object({
          name: z.string(),
        })
        .optional(),
    })

    const dummyInstance = schemaDefaults(schema, { instantiate_Optional_Objects: true })

    expect(dummyInstance).toEqual({
      object: {
        name: '',
      },
    })
  })

  test('optional primitive instantiation can be disabled inside nested objects', () => {
    const schema = z.object({
      object: z
        .object({
          name: z.string().optional(),
        })
        .optional(),
      exampleOptional: z.string().optional(),
    })

    const dummyInstance = schemaDefaults(schema, { instantiate_Optional_Objects: true, instantiate_Optional_PrimitiveProps: false })

    expect(dummyInstance).toEqual({
      object: {
        name: undefined,
      },
      exampleOptional: undefined,
    })
  })

  test('check that optional arrays are set to undefined', () => {
    const schema = z.object({
      array: z.array(z.string()).optional(),
    })

    const dummyInstance = schemaDefaults(schema, { instantiate_Optional_Objects: false })

    expect(dummyInstance).toEqual({
      array: undefined,
    })
  })

  test('check that optional arrays are defined when enabled by options', () => {
    const schema = z.object({
      array: z.array(z.string()).optional(),
    })

    const dummyInstance = schemaDefaults(schema, { instantiate_Optional_Objects: true })

    expect(dummyInstance).toEqual({
      array: Array.from({ length: DEFAULT_ARRAY_SIZE }).map(() => ''),
    })
  })

  test('unsupported schema types throw an explicit error', () => {
    const schema = z.object({
      notImplemented: z.lazy(() => z.string()),
    })

    expect(() => schemaDefaults(schema)).toThrow('[SchemaDefaults]: Unsupported type lazy')
  })
})

describe('schemaDefaults: Zod 4 defaults and prefaults', () => {
  test.each([0, false, '', null])('preserves the explicit default %p', (value) => {
    expect(schemaDefaults(z.unknown().default(value))).toBe(value)
  })

  test('evaluates a default factory once for each generated value', () => {
    let counter = 0
    const factory = jest.fn(() => ++counter)
    const schema = z.number().default(factory)
    expect(schemaDefaults(z.array(schema), { overrideArraySize: 2 })).toEqual([1, 2])
    expect(schemaDefaults(schema)).toBe(3)
    expect(factory).toHaveBeenCalledTimes(3)
  })

  test('does not invoke a function returned by a default factory', () => {
    const value = jest.fn(() => 'callable default')
    const schema = z.custom<() => string>().default(() => value)
    expect(schemaDefaults(schema)).toBe(value)
    expect(value).not.toHaveBeenCalled()
  })

  test('defaults short-circuit parsing, whereas prefaults are parsed', () => {
    const transform = jest.fn((value: string) => value.length)
    const base = z.string().transform(transform)
    expect(schemaDefaults(base.default(42))).toBe(42)
    expect(transform).not.toHaveBeenCalled()
    expect(schemaDefaults(base.prefault('tuna'))).toBe(4)
    expect(transform).toHaveBeenCalledTimes(1)
  })

  test('preserves unparsed object defaults and parses partial object prefaults', () => {
    const base = z.object({ name: z.string().default('Tuna'), count: z.number().default(2) })
    expect(schemaDefaults(base.default({ name: 'Salmon', count: 7 }))).toEqual({ name: 'Salmon', count: 7 })
    expect(schemaDefaults(base.prefault({}))).toEqual({ name: 'Tuna', count: 2 })
    expect(schemaDefaults(z.string().trim().toUpperCase().default('  tuna  '))).toBe('  tuna  ')
    expect(schemaDefaults(z.string().trim().toUpperCase().prefault('  tuna  '))).toBe('TUNA')
  })

  test('prefault factories run once per invocation', () => {
    const factory = jest.fn(() => '  tuna  ')
    const schema = z.string().trim().prefault(factory)
    expect(schemaDefaults(schema)).toBe('tuna')
    expect(schemaDefaults(schema)).toBe('tuna')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  test('honors defaults inside optional fields even when instantiation is disabled', () => {
    const schema = z.object({
      innerDefault: z.string().default('inner').optional(),
      outerDefault: z.string().optional().default('outer'),
      prefault: z.string().trim().prefault('  value  ').optional(),
      object: z.object({ name: z.string() }).default({ name: 'default' }).readonly().optional(),
      absent: z.string().optional(),
    })
    expect(schemaDefaults(schema, { instantiate_Optional_PrimitiveProps: false, instantiate_Optional_Objects: false })).toStrictEqual({
      innerDefault: 'inner',
      outerDefault: 'outer',
      prefault: 'value',
      object: { name: 'default' },
      absent: undefined,
    })
  })

  test('uses Zod optional semantics for defaults in union branches', () => {
    const schema = z.union([z.string().default('tuna'), z.number()]).optional()
    expect(schemaDefaults(schema, { instantiate_Optional_PrimitiveProps: false })).toEqual(schema.parse(undefined))
  })

  test('nullable and outer optional wrappers retain their configured absence values', () => {
    expect(schemaDefaults(z.string().default('default').nullable(), { instantiate_Nullable_PrimitiveProps: false })).toBeNull()
    expect(schemaDefaults(z.string().nullable().optional(), { instantiate_Optional_PrimitiveProps: false })).toBeUndefined()
    expect(schemaDefaults(z.string().optional().nullable(), { instantiate_Nullable_PrimitiveProps: false })).toBeNull()
  })

  test('strips defaults and prefaults recursively without evaluating their factories', () => {
    const factory = jest.fn(() => 'explicit')
    const schema = z.object({
      name: z.string().default(factory),
      number: z.number().default(42),
      enabled: z.boolean().default(true),
      list: z.array(z.string().default('item')).default(['explicit']),
      nested: z.object({ name: z.string().default('nested') }).prefault({}),
      optional: z.string().default('optional').optional(),
    })
    expect(schemaDefaults(schema, { stripDefaultValues: true, generateRandomNumbers: false, overrideArraySize: 2 })).toEqual({
      name: '',
      number: 0,
      enabled: false,
      list: ['', ''],
      nested: { name: '' },
      optional: '',
    })
    expect(factory).not.toHaveBeenCalled()
    expect(schema.parse({})).toEqual({ name: 'explicit', number: 42, enabled: true, list: ['explicit'], nested: { name: 'nested' }, optional: 'optional' })
    expect(factory).toHaveBeenCalledTimes(1)
  })

  test('strips defaults in tuples, unions, intersections, readonly values and pipes', () => {
    const schema = z.object({
      tuple: z.tuple([z.string().default('tuple')], z.string().default('rest')),
      union: z.union([z.string().default('one'), z.string().default('two')]),
      intersection: z.intersection(z.object({ a: z.string().default('a') }), z.object({ b: z.string().default('b') })),
      readonly: z.object({ name: z.string().default('readonly') }).readonly(),
      pipe: z
        .string()
        .default('pipe')
        .transform((value) => value.length),
      prefault: z
        .string()
        .prefault('prefault')
        .transform((value) => value.length),
      nonoptional: z.string().default('required').optional().nonoptional(),
    })
    expect(schemaDefaults(schema, { stripDefaultValues: true })).toEqual({
      tuple: [''],
      union: '',
      intersection: { a: '', b: '' },
      readonly: { name: '' },
      pipe: 0,
      prefault: 0,
      nonoptional: '',
    })
  })

  test('preserves catch behavior when defaults are stripped', () => {
    const schema = z.number().default(7).catch(9)
    expect(schemaDefaults(schema)).toBe(7)
    expect(schemaDefaults(schema, { stripDefaultValues: true })).toBe(9)
    expect(schema.parse(undefined)).toBe(7)
  })
})

describe('schemaDefaults: transforms, preprocessors and catches', () => {
  test('returns transformed output rather than the input placeholder', () => {
    const schema = z.string().transform((value) => value.length)
    const result: number = schemaDefaults(schema)
    expect(result).toBe(0)
  })

  test('executes nested transforms exactly once', () => {
    const inner = jest.fn((value: string) => `(${value})`)
    const outer = jest.fn((value: string) => value.length)
    const schema = z.object({ name: z.string().transform(inner) }).transform(({ name }) => outer(name))
    expect(schemaDefaults(schema)).toBe(2)
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).toHaveBeenCalledTimes(1)
    expect(inner).toHaveBeenCalledWith('', expect.anything())
  })

  test('executes every stage of a chained pipe once', () => {
    const schema = z
      .string()
      .default('tuna')
      .transform((value) => value.length)
      .pipe(z.number().transform((value) => value * 2))
    expect(schemaDefaults(schema)).toBe(8)
  })

  test('resolves defaults inside objects parsed by a pipe once', () => {
    const factory = jest.fn(() => 'Tuna')
    const schema = z.object({ name: z.string().default(factory) }).transform(({ name }) => name.length)
    expect(schemaDefaults(schema)).toBe(4)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  test('supports standalone transforms and preprocessing undefined input', () => {
    expect(schemaDefaults(z.transform(() => 'transformed'))).toBe('transformed')
    expect(
      schemaDefaults(
        z.preprocess(
          (value) => value ?? 'prefilled',
          z.string().transform((value) => value.length),
        ),
      ),
    ).toBe(9)
  })

  test('runs codec decoding and validates the output', () => {
    const decode = jest.fn((value: string) => value.length)
    const schema = z.codec(z.string().default('tuna'), z.number(), { decode, encode: String })
    expect(schemaDefaults(schema)).toBe(4)
    expect(decode).toHaveBeenCalledTimes(1)
  })

  test('passes real validation context to catch callbacks', () => {
    const fallback = jest.fn((ctx: z.core.$ZodCatchCtx) => {
      expect(ctx.input).toBeUndefined()
      expect(ctx.error.issues[0]).toMatchObject({ code: 'invalid_type', expected: 'number' })
      return 42
    })
    expect(schemaDefaults(z.number().catch(fallback))).toBe(42)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  test('does not use catch when undefined is accepted or a default succeeds', () => {
    const fallback = jest.fn(() => 42)
    expect(schemaDefaults(z.number().optional().catch(fallback))).toBeUndefined()
    expect(schemaDefaults(z.number().default(7).catch(fallback))).toBe(7)
    expect(fallback).not.toHaveBeenCalled()
  })

  test('regenerates catch fallback values', () => {
    let value = 0
    const schema = z.number().catch(() => ++value)
    expect(schemaDefaults(z.array(schema), { overrideArraySize: 2 })).toEqual([1, 2])
  })

  test('propagates validation issues raised by transforms and pipes', () => {
    const schema = z
      .string()
      .transform((value) => value.length)
      .pipe(z.number().positive())
    expect(() => schemaDefaults(schema)).toThrow()
    expect(() => schemaDefaults(z.string().min(5).prefault('x'))).toThrow()
  })

  test('rejects async transformations through synchronous parsing', () => {
    expect(() => schemaDefaults(z.string().transform(async (value) => value.length))).toThrow(/synchronous|Promise|async/i)
  })
})

describe('schemaDefaults: primitives and schema structure', () => {
  test.each([
    ['string', z.string(), ''],
    ['boolean', z.boolean(), false],
    ['bigint', z.bigint(), BigInt(0)],
    ['null', z.null(), null],
    ['undefined', z.undefined(), undefined],
    ['void', z.void(), undefined],
    ['unknown', z.unknown(), undefined],
    ['any', z.any(), undefined],
    ['custom', z.custom(), undefined],
    ['nan', z.nan(), NaN],
  ])('generates the %s placeholder', (_name, schema, expected) => {
    expect(schemaDefaults(schema)).toBe(expected)
  })

  test('creates symbols and dates', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-02T03:04:05Z'))
    expect(typeof schemaDefaults(z.symbol())).toBe('symbol')
    expect(schemaDefaults(z.date())).toEqual(new Date('2026-01-02T03:04:05Z'))
  })

  test.each([z.uuid(), z.string().uuid()])('recognizes top-level and attached UUID formats', (schema) => {
    const value = schemaDefaults(schema)
    expect(schema.safeParse(value).success).toBe(true)
    expect(schemaDefaults(schema, { stripDefaultValues: true })).toBe('')
  })

  test('does not claim to satisfy arbitrary string constraints', () => {
    const schema = z.string().min(5)
    expect(schemaDefaults(schema)).toBe('')
    expect(schema.safeParse(schemaDefaults(schema)).success).toBe(false)
  })

  test.each([z.object({}), z.strictObject({}), z.looseObject({})])('generates empty object shapes', (schema) => {
    expect(schemaDefaults(schema)).toStrictEqual({})
  })

  test('retains keys explicitly generated as undefined, including special property names', () => {
    const schema = z.object({ ['__proto__']: z.string(), constructor: z.string(), optional: z.string().optional() })
    const result = schemaDefaults(schema, { instantiate_Optional_PrimitiveProps: false })
    expect(Object.prototype.hasOwnProperty.call(result, 'optional')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(result.constructor).toBe('')
  })

  test('generates independent object and array instances', () => {
    const schema = z.array(z.object({ list: z.array(z.string()) }))
    const result = schemaDefaults(schema, { overrideArraySize: 2 })
    result[0].list.push('changed')
    expect(result[1].list).toEqual(['', ''])
    expect(schemaDefaults(schema, { overrideArraySize: 2 })[0].list).toEqual(['', ''])
  })

  test('supports fixed, empty and rest tuples', () => {
    expect(schemaDefaults(z.tuple([]))).toEqual([])
    expect(schemaDefaults(z.tuple([z.string(), z.number().default(7), z.boolean()], z.string()))).toEqual(['', 7, false])
  })

  test('freezes readonly outputs without freezing unwrapped nested objects', () => {
    const schema = z.object({ child: z.object({ name: z.string() }) }).readonly()
    const value = schemaDefaults(schema)
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.child)).toBe(false)
    expect(Object.isFrozen(schemaDefaults(z.array(z.string()).readonly()))).toBe(true)
    expect(schemaDefaults(z.string().readonly())).toBe('')
  })

  test('nonoptional wrappers require a generated value', () => {
    expect(schemaDefaults(z.string().optional().nonoptional(), { instantiate_Optional_PrimitiveProps: false })).toBe('')
    expect(() => schemaDefaults(z.undefined().nonoptional())).toThrow('Cannot generate a nonoptional value')
  })

  test.each([
    ['lazy', z.lazy(() => z.string())],
    ['never', z.never()],
    ['record', z.record(z.string(), z.string())],
    ['map', z.map(z.string(), z.string())],
    ['set', z.set(z.string())],
    ['promise', z.promise(z.string())],
  ])('reports unsupported %s schemas without console output', (type, schema) => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => schemaDefaults(schema)).toThrow(`[SchemaDefaults]: Unsupported type ${type}`)
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('schemaDefaults: options', () => {
  test.each([0, 1, 3, 2.9, -1, NaN, Infinity, -Infinity])('normalizes array size %p', (size) => {
    const expected = Number.isFinite(size) && size >= 0 ? Math.floor(size) : DEFAULT_ARRAY_SIZE
    expect(schemaDefaults(z.array(z.string()), { overrideArraySize: size })).toEqual(Array(expected).fill(''))
  })

  test('passes array size options to every nested array', () => {
    expect(schemaDefaults(z.array(z.array(z.string())), { overrideArraySize: 2 })).toEqual([
      ['', ''],
      ['', ''],
    ])
  })

  test('undefined options retain defaults and options are not mutated', () => {
    const options = Object.freeze({ instantiate_Optional_Objects: undefined, instantiate_Optional_PrimitiveProps: undefined, overrideArraySize: undefined })
    expect(schemaDefaults(z.object({ value: z.string().optional(), list: z.array(z.string()).optional() }), options)).toEqual({ value: '', list: Array(DEFAULT_ARRAY_SIZE).fill('') })
    expect(options.overrideArraySize).toBeUndefined()
  })

  test.each([
    ['primitive', z.string(), 'instantiate_Optional_PrimitiveProps', 'instantiate_Nullable_PrimitiveProps', ''],
    ['object', z.object({ name: z.string() }), 'instantiate_Optional_Objects', 'instantiate_Nullable_Objects', { name: '' }],
    ['array', z.array(z.string()), 'instantiate_Optional_Objects', 'instantiate_Nullable_Objects', ['', '']],
    ['tuple', z.tuple([z.string()]), 'instantiate_Optional_Objects', 'instantiate_Nullable_Objects', ['']],
  ] as const)('applies optional/nullable options independently to a %s', (_name, schema, optionalKey, nullableKey, expected) => {
    expect(schemaDefaults(schema.optional(), { overrideArraySize: 2 })).toEqual(expected)
    expect(schemaDefaults(schema.nullable(), { overrideArraySize: 2 })).toEqual(expected)
    expect(schemaDefaults(schema.optional(), { [optionalKey]: false })).toBeUndefined()
    expect(schemaDefaults(schema.nullable(), { [nullableKey]: false })).toBeNull()
  })

  test.each([
    z.object({ name: z.string() }).readonly().optional(),
    z.object({ name: z.string() }).nullable().optional(),
    z.array(z.string()).readonly().optional(),
    z.object({ name: z.string() }).catch({ name: 'fallback' }).optional(),
    z
      .object({ name: z.string() })
      .pipe(z.object({ name: z.string() }))
      .optional(),
  ])('detects object-like values through composition wrappers', (schema) => {
    expect(schemaDefaults(schema, { instantiate_Optional_Objects: false, instantiate_Optional_PrimitiveProps: true })).toBeUndefined()
  })

  test('nullable object settings survive additional wrappers', () => {
    const schema = z.object({ name: z.string() }).readonly().optional().nullable()
    expect(schemaDefaults(schema, { instantiate_Nullable_Objects: false, instantiate_Nullable_PrimitiveProps: true })).toBeNull()
  })

  test('options do not leak between calls', () => {
    const schema = z.array(z.string().optional())
    expect(schemaDefaults(schema, { overrideArraySize: 0, instantiate_Optional_PrimitiveProps: false })).toEqual([])
    expect(schemaDefaults(schema)).toEqual(Array(DEFAULT_ARRAY_SIZE).fill(''))
  })
})

describe('schemaDefaults: selection and intersections', () => {
  test.each([0, 0.49, 0.99])('selects enum entries correctly with random value %p', (random) => {
    jest.spyOn(Math, 'random').mockReturnValue(random)
    const schema = z.enum(['one', 'two', 'three'])
    expect(schemaDefaults(schema)).toBe(schema.options[Math.floor(random * 3)])
    expect(schemaDefaults(z.enum(['only']))).toBe('only')
  })

  test.each([0, 0.5, 0.99])('excludes numeric TypeScript enum reverse mappings at %p', (random) => {
    enum Status {
      Pending,
      Active,
      Archived,
    }
    jest.spyOn(Math, 'random').mockReturnValue(random)
    const schema = z.enum(Status)
    expect(schemaDefaults(schema)).toBe(Math.floor(random * 3))
    expect(schema.safeParse(schemaDefaults(schema)).success).toBe(true)
  })

  test('supports enum-like objects, string enums, and multi-value literals', () => {
    enum Status {
      Pending = 'pending',
      Active = 'active',
    }
    jest.spyOn(Math, 'random').mockReturnValue(0.99)
    expect(schemaDefaults(z.enum(Status))).toBe('active')
    expect(schemaDefaults(z.enum({ First: 10, Second: 20 }))).toBe(20)
    expect(schemaDefaults(z.literal(['first', 'second']))).toBe('first')
    expect(schemaDefaults(z.literal(false))).toBe(false)
    expect(schemaDefaults(z.literal(0))).toBe(0)
    expect(schemaDefaults(z.literal(null))).toBeNull()
  })

  test.each([0, 0.99])('selects a union branch at %p', (random) => {
    jest.spyOn(Math, 'random').mockReturnValue(random)
    expect(schemaDefaults(z.union([z.literal('left'), z.literal('right')]))).toBe(random === 0 ? 'left' : 'right')
    const schema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('left'), name: z.string() }), z.object({ kind: z.literal('right'), enabled: z.boolean() })])
    const result = schemaDefaults(schema)
    expect(result).toEqual(random === 0 ? { kind: 'left', name: '' } : { kind: 'right', enabled: false })
    expect(schema.safeParse(result).success).toBe(true)
  })

  test('reports empty unions and enums clearly', () => {
    expect(() => schemaDefaults(z.union([]))).toThrow('Cannot select a value from an empty schema')
    expect(() => schemaDefaults(z.enum([]))).toThrow('Cannot select a value from an empty schema')
  })

  test('deeply merges intersected objects and shared arrays', () => {
    const schema = z.intersection(
      z.object({ left: z.string(), shared: z.object({ a: z.string() }), list: z.array(z.object({ a: z.string() })) }),
      z.object({ right: z.boolean(), shared: z.object({ b: z.boolean() }), list: z.array(z.object({ b: z.boolean() })) }),
    )
    const result = schemaDefaults(schema, { overrideArraySize: 1 })
    expect(result).toEqual({ left: '', right: false, shared: { a: '', b: false }, list: [{ a: '', b: false }] })
    expect(schema.safeParse(result).success).toBe(true)
  })

  test('runs intersected transformations and default factories once per side', () => {
    const factory = jest.fn(() => 'tuna')
    const transform = jest.fn((name: string) => name.length)
    const schema = z.intersection(z.object({ name: z.string().default(factory).transform(transform) }), z.object({ active: z.boolean() }))
    expect(schemaDefaults(schema)).toEqual({ name: 4, active: false })
    expect(factory).toHaveBeenCalledTimes(1)
    expect(transform).toHaveBeenCalledTimes(1)
    expect(
      schemaDefaults(
        z.intersection(
          z.string().transform((value) => value.length),
          z.string().transform((value) => value.length),
        ),
      ),
    ).toBe(0)
  })

  test('merges root array intersections and uses their raw inputs inside a pipe', () => {
    const transform = jest.fn((value: string) => value.length)
    const schema = z.intersection(z.array(z.object({ name: z.string().transform(transform) })), z.array(z.object({ active: z.boolean() })))
    expect(schemaDefaults(schema, { overrideArraySize: 1 })).toEqual([{ name: 0, active: false }])
    transform.mockClear()
    expect(
      schemaDefaults(
        schema.transform((rows) => rows[0]),
        { overrideArraySize: 1 },
      ),
    ).toEqual({ name: 0, active: false })
    expect(transform).toHaveBeenCalledTimes(1)
  })

  test('preserves primitive, null and date intersections', () => {
    expect(schemaDefaults(z.intersection(z.string(), z.string()))).toBe('')
    expect(schemaDefaults(z.intersection(z.null(), z.null()))).toBeNull()
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01Z'))
    expect(schemaDefaults(z.intersection(z.date(), z.date()))).toEqual(new Date('2026-01-01Z'))
    jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.5)
    expect(schemaDefaults(z.intersection(z.number(), z.number()))).toBe(0)
  })

  test('rejects incompatible intersection defaults rather than overwriting them', () => {
    expect(() => schemaDefaults(z.intersection(z.object({ shared: z.literal('a') }), z.object({ shared: z.literal('b') })))).toThrow('Cannot merge incompatible intersection defaults')
    expect(() => schemaDefaults(z.intersection(z.literal('a'), z.literal('b')))).toThrow('Cannot merge incompatible intersection defaults')
  })
})

describe('schemaDefaults: number bounds', () => {
  const schemas = [
    z.number(),
    z.number().min(200),
    z.number().max(-5),
    z.number().min(-20).max(-5),
    z.number().min(7).max(7),
    z.number().min(0.2).max(0.4),
    z.number().gt(0).lt(0.5),
    z.number().gt(-1).lt(-0.9),
    z.number().min(10).min(2).max(20).max(30),
    z.number().gt(2).min(2).lt(5).max(5),
    z.number().int().gt(2).lt(5),
    z.number().int().min(1.5).max(3.8),
    z.int(),
    z.int32(),
    z.uint32(),
    z.number().min(1000).max(2000),
    z.number().min(-1e308).max(1e308),
    z
      .number()
      .gt(1)
      .lte(1 + Number.EPSILON),
    z
      .number()
      .gte(-1 + Number.EPSILON / 2)
      .lt(0),
    z.number().gte(-Infinity).lte(Infinity),
  ]

  test.each(schemas.map((schema, index) => [index, schema] as const))('satisfies numeric schema %i at random endpoints and deterministically', (_index, schema) => {
    const random = jest.spyOn(Math, 'random')
    for (const ratio of [0, 0.5, 0.9999999999999999]) {
      random.mockReturnValue(ratio)
      const value = schemaDefaults(schema)
      expect(Number.isFinite(value)).toBe(true)
      expect(schema.safeParse(value).success).toBe(true)
    }
    expect(schema.safeParse(schemaDefaults(schema, { generateRandomNumbers: false })).success).toBe(true)
  })

  test('uses zero for unconstrained deterministic numbers and the tightest minimum otherwise', () => {
    expect(schemaDefaults(z.number(), { generateRandomNumbers: false })).toBe(0)
    expect(schemaDefaults(z.int(), { generateRandomNumbers: false })).toBe(0)
    expect(schemaDefaults(z.number().min(10).min(2), { generateRandomNumbers: false })).toBe(10)
    expect(schemaDefaults(z.number().min(2).min(10), { generateRandomNumbers: false })).toBe(10)
    expect(schemaDefaults(z.number().max(-3), { generateRandomNumbers: false })).toBe(-3)
  })

  test.each([
    ['safe integers', z.int(), 2],
    ['signed 32-bit integers', z.int32(), 2],
    ['unsigned 32-bit integers', z.uint32(), 2],
    ['attached integer checks', z.number().int(), 2],
    ['composed integer and float checks', z.number().int().check(z.float32()), 2],
    ['integer multiples', z.number().multipleOf(2), 2],
    ['plain numbers', z.number(), 1.5],
    ['32-bit floats', z.float32(), 1.5],
    ['64-bit floats', z.float64(), 1.5],
    ['fractional multiples', z.number().multipleOf(0.5), 1.5],
  ] as const)('rounds fractional bounds only when required by %s', (_name, base, expected) => {
    const schema = base.min(1.5).max(2.5)
    const value = schemaDefaults(schema, { generateRandomNumbers: false })
    expect(value).toBe(expected)
    expect(schema.safeParse(value).success).toBe(true)
  })

  test('can select the full numeric interval, including its maximum', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999999)
    expect(schemaDefaults(z.number().min(1000).max(2000))).toBe(2000)
  })

  test('does not use randomness for deterministic numbers', () => {
    const random = jest.spyOn(Math, 'random')
    expect(schemaDefaults(z.number(), { generateRandomNumbers: false })).toBe(0)
    expect(random).not.toHaveBeenCalled()
  })

  test.each([
    z.number().min(5).max(2),
    z
      .number()
      .gt(1)
      .lt(1 + Number.EPSILON),
    z.number().int().min(0.1).max(0.9),
  ])('rejects ranges without a representable value', (schema) => {
    expect(() => schemaDefaults(schema)).toThrow('Cannot generate a number within the schema bounds')
  })
})
