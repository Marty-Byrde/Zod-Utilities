import { describe } from '@jest/globals'
import { z } from 'zod'
import schemaDefaults, { DEFAULT_ARRAY_SIZE } from '@/src/schemaDefaults'

describe('#schemaDefaults ', () => {
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

  test('check that optional properties are set to undefined when includeOptional_PrimitiveProperties is set to false', () => {
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

  test('check that not-implemeted ZodTypes throw an Error', () => {
    const schema = z.object({
      notImplemented: z.lazy(() => z.string()),
    })

    expect(() => schemaDefaults(schema)).toThrow(Error)
    expect(() => schemaDefaults(schema)).toThrow('[SchemaDefaults]: Unsupported type lazy')
  })
})
