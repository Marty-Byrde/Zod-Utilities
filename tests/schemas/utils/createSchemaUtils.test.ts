import { z } from 'zod'
import { createSchemaUtils } from '@/src/createSchemaUtils'

type Equal<Left, Right> = (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false

describe('createSchemaUtils', () => {
  const ProductSchema = z.object({
    name: z.string().default('Product'),
    price: z.number(),
  })

  test('infers method names and output types from the schema entry', () => {
    const utilities = createSchemaUtils({ ProductSchema })

    expect(Object.keys(utilities).sort()).toEqual(['instantiateProduct', 'parseProduct', 'safeParseProduct', 'safeValidateProduct', 'validateProduct'])
    expect(utilities.instantiateProduct({ generateRandomNumbers: false })).toEqual({ name: 'Product', price: 0 })

    const product = { name: 'Book', price: 12 }
    expect(utilities.validateProduct(product)).toEqual(product)
    expect(utilities.safeValidateProduct(product)).toEqual({ success: true, data: product })
    expect(utilities.parseProduct(product)).toEqual(product)
    expect(utilities.safeParseProduct(product)).toEqual({ success: true, data: product })

    const inferredTypes: [
      Equal<keyof typeof utilities, 'validateProduct' | 'safeValidateProduct' | 'parseProduct' | 'safeParseProduct' | 'instantiateProduct'>,
      Equal<ReturnType<typeof utilities.validateProduct>, z.infer<typeof ProductSchema>>,
      Equal<ReturnType<typeof utilities.safeValidateProduct>, z.ZodSafeParseResult<z.infer<typeof ProductSchema>>>,
      Equal<ReturnType<typeof utilities.parseProduct>, z.infer<typeof ProductSchema>>,
      Equal<ReturnType<typeof utilities.instantiateProduct>, z.infer<typeof ProductSchema>>,
      Equal<ReturnType<typeof utilities.safeParseProduct>, z.ZodSafeParseResult<z.infer<typeof ProductSchema>>>,
    ] = [true, true, true, true, true, true]
    expect(inferredTypes).toEqual([true, true, true, true, true, true])
  })

  describe.each(['named', 'unnamed'] as const)('%s methods', (api) => {
    function bind<Schema extends z.ZodType>(schema: Schema) {
      if (api === 'unnamed') return createSchemaUtils(schema)
      const utilities = createSchemaUtils({ TestSchema: schema })
      return {
        validate: utilities.validateTest,
        safeValidate: utilities.safeValidateTest,
        parse: utilities.parseTest,
        safeParse: utilities.safeParseTest,
        instantiate: utilities.instantiateTest,
      }
    }

    test('removes defaults for validation and retains them for parsing', () => {
      const utilities = bind(ProductSchema)
      const input = { price: 12 }
      const expected = { name: 'Product', price: 12 }

      expect(() => utilities.validate(input)).toThrow(z.ZodError)
      expect(utilities.safeValidate(input)).toEqual({ success: false, error: expect.any(z.ZodError) })
      expect(utilities.parse(input)).toEqual(expected)
      expect(utilities.safeParse(input)).toEqual({ success: true, data: expected })
      expect(input).toEqual({ price: 12 })
      expect(ProductSchema.parse(input)).toEqual(expected)
    })

    test('reports invalid supplied values with and without defaults', () => {
      const utilities = bind(ProductSchema)
      const invalid = { name: 'Book', price: 'invalid' }

      expect(() => utilities.validate(invalid)).toThrow(z.ZodError)
      expect(() => utilities.parse(invalid)).toThrow(z.ZodError)
      expect(utilities.safeValidate(invalid)).toEqual({ success: false, error: expect.any(z.ZodError) })
      expect(utilities.safeParse(invalid)).toEqual({ success: false, error: expect.any(z.ZodError) })
    })

    test('distinguishes root and nested defaults', () => {
      const root = bind(z.string().default('fallback'))
      expect(() => root.validate(undefined)).toThrow(z.ZodError)
      expect(root.safeValidate(undefined).success).toBe(false)
      expect(root.parse(undefined)).toBe('fallback')
      expect(root.safeParse(undefined)).toEqual({ success: true, data: 'fallback' })

      const nested = bind(z.object({ products: z.array(ProductSchema) }))
      const input = { products: [{ price: 12 }] }
      const expected = { products: [{ name: 'Product', price: 12 }] }
      expect(() => nested.validate(input)).toThrow(z.ZodError)
      expect(nested.safeValidate(input).success).toBe(false)
      expect(nested.parse(input)).toEqual(expected)
      expect(nested.safeParse(input)).toEqual({ success: true, data: expected })
    })

    test('retains transforms, coercion, checks, and object key policies for validation', () => {
      const schema = z
        .object({
          name: z
            .string()
            .trim()
            .min(1)
            .transform((value) => value.toUpperCase())
            .default('DEFAULT'),
          price: z.coerce.number().positive(),
        })
        .refine(({ name }) => name !== 'BLOCKED')
      const utilities = bind(schema)
      const input = { name: ' book ', price: '12', extra: true }
      const expected = { name: 'BOOK', price: 12 }

      expect(utilities.validate(input)).toEqual(expected)
      expect(utilities.safeValidate(input)).toEqual({ success: true, data: expected })
      expect(utilities.parse(input)).toEqual(expected)
      expect(utilities.safeParse(input)).toEqual({ success: true, data: expected })
      expect(utilities.safeValidate({ name: ' ', price: 12 }).success).toBe(false)
      expect(utilities.safeValidate({ name: 'blocked', price: 12 }).success).toBe(false)
      expect(utilities.safeValidate({ name: 'Book', price: -1 }).success).toBe(false)
      expect(input).toEqual({ name: ' book ', price: '12', extra: true })
    })

    test('retains explicit optionality, prefaults, and catch fallbacks for validation', () => {
      const utilities = bind(
        z.object({
          optional: z.string().optional().default('default'),
          prefault: z.string().prefault('prefault'),
          caught: z.number().catch(0),
        }),
      )

      expect(utilities.validate({})).toEqual({ prefault: 'prefault', caught: 0 })
      expect(utilities.safeValidate({})).toEqual({ success: true, data: { prefault: 'prefault', caught: 0 } })
      expect(utilities.parse({})).toEqual({ optional: 'default', prefault: 'prefault', caught: 0 })
      expect(utilities.safeParse({})).toEqual({ success: true, data: { optional: 'default', prefault: 'prefault', caught: 0 } })
    })
  })

  test('uses the object key and removes only a trailing Schema suffix', () => {
    const aliased = createSchemaUtils({ OrderSchema: ProductSchema })
    expect(aliased.validateOrder({ name: 'Book', price: 12 })).toEqual({ name: 'Book', price: 12 })

    const withoutSuffix = createSchemaUtils({ Product: ProductSchema })
    expect(withoutSuffix.instantiateProduct({ generateRandomNumbers: false })).toEqual({ name: 'Product', price: 0 })

    const withInternalSuffix = createSchemaUtils({ SchemaProductSchema: ProductSchema })
    expect(withInternalSuffix.safeParseSchemaProduct({ name: 'Book', price: 12 }).success).toBe(true)
    expect(withInternalSuffix.safeValidateSchemaProduct({ price: 12 }).success).toBe(false)
    expect(withInternalSuffix.parseSchemaProduct({ price: 12 })).toEqual({ name: 'Product', price: 12 })
  })

  test('retains the unnamed API and explicit output type argument', () => {
    const utilities = createSchemaUtils<z.infer<typeof ProductSchema>>(ProductSchema)
    const { instantiate, validate: validate, safeValidate: safeValidate, parse, safeParse } = utilities

    expect(Object.keys(utilities).sort()).toEqual(['instantiate', 'parse', 'safeParse', 'safeValidate', 'validate'])
    expect(instantiate({ generateRandomNumbers: false })).toEqual({ name: 'Product', price: 0 })
    expect(validate({ name: 'Book', price: 12 })).toEqual({ name: 'Book', price: 12 })
    expect(safeValidate({ price: 12 }).success).toBe(false)
    expect(parse({ price: 12 })).toEqual({ name: 'Product', price: 12 })
    expect(safeParse({ price: 12 })).toEqual({ success: true, data: { name: 'Product', price: 12 } })

    const inferredTypes: [
      Equal<ReturnType<typeof validate>, z.infer<typeof ProductSchema>>,
      Equal<ReturnType<typeof safeValidate>, z.ZodSafeParseResult<z.infer<typeof ProductSchema>>>,
      Equal<ReturnType<typeof parse>, z.infer<typeof ProductSchema>>,
      Equal<ReturnType<typeof safeParse>, z.ZodSafeParseResult<z.infer<typeof ProductSchema>>>,
    ] = [true, true, true, true]
    expect(inferredTypes).toEqual([true, true, true, true])
  })

  test('infers separate validation output types when defaults wrap optional schemas', () => {
    const OptionalSchema = z.string().optional().default('fallback')
    const named = createSchemaUtils({ OptionalSchema })
    const unnamed = createSchemaUtils(OptionalSchema)
    const object = createSchemaUtils(z.object({ value: z.string().optional().default('fallback') }))

    const inferredTypes: [
      Equal<ReturnType<typeof named.validateOptional>, string | undefined>,
      Equal<ReturnType<typeof named.safeValidateOptional>, z.ZodSafeParseResult<string | undefined>>,
      Equal<ReturnType<typeof named.parseOptional>, string>,
      Equal<ReturnType<typeof unnamed.validate>, string | undefined>,
      Equal<ReturnType<typeof unnamed.safeValidate>, z.ZodSafeParseResult<string | undefined>>,
      Equal<ReturnType<typeof unnamed.safeParse>, z.ZodSafeParseResult<string>>,
      Equal<ReturnType<typeof object.validate>, { value?: string | undefined }>,
      Equal<ReturnType<typeof object.parse>, { value: string }>,
    ] = [true, true, true, true, true, true, true, true]
    expect(inferredTypes).toEqual([true, true, true, true, true, true, true, true])
    expect(named.validateOptional(undefined)).toBeUndefined()
    expect(unnamed.parse(undefined)).toBe('fallback')
    expect(object.validate({})).toEqual({})
    expect(object.parse({})).toEqual({ value: 'fallback' })
  })

  test('rejects empty objects and multiple schema entries', () => {
    expect(() => createSchemaUtils({})).toThrow('exactly one schema')
    expect(() => createSchemaUtils({ ProductSchema, OrderSchema: ProductSchema })).toThrow('exactly one schema')
  })
})
