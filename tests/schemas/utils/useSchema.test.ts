import { z } from 'zod'
import { useSchema } from '@/src/useSchema'

type Equal<Left, Right> = (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false

describe('useSchema', () => {
  const ProductSchema = z.object({
    name: z.string().default('Product'),
    price: z.number(),
  })

  test('infers method names and output types from the schema entry', () => {
    const utilities = useSchema({ ProductSchema })

    expect(Object.keys(utilities).sort()).toEqual(['instantiateProduct', 'safeParseProduct', 'validateProduct'])
    expect(utilities.instantiateProduct({ generateRandomNumbers: false })).toEqual({ name: 'Product', price: 0 })

    const product = { name: 'Book', price: 12 }
    expect(utilities.validateProduct(product)).toEqual(product)
    expect(utilities.safeParseProduct(product)).toEqual({ success: true, data: product })

    const inferredTypes: [
      Equal<keyof typeof utilities, 'validateProduct' | 'safeParseProduct' | 'instantiateProduct'>,
      Equal<ReturnType<typeof utilities.validateProduct>, z.infer<typeof ProductSchema>>,
      Equal<ReturnType<typeof utilities.instantiateProduct>, z.infer<typeof ProductSchema>>,
      Equal<ReturnType<typeof utilities.safeParseProduct>, z.ZodSafeParseResult<z.infer<typeof ProductSchema>>>,
    ] = [true, true, true, true]
    expect(inferredTypes).toEqual([true, true, true, true])
  })

  test('continues to strip defaults for validation and safe parsing', () => {
    const { validateProduct, safeParseProduct } = useSchema({ ProductSchema })

    expect(() => validateProduct({ price: 12 })).toThrow(z.ZodError)
    expect(safeParseProduct({ price: 12 }).success).toBe(false)
    expect(safeParseProduct({ name: 'Book', price: 'invalid' }).success).toBe(false)
  })

  test('uses the object key and removes only a trailing Schema suffix', () => {
    const aliased = useSchema({ OrderSchema: ProductSchema })
    expect(aliased.validateOrder({ name: 'Book', price: 12 })).toEqual({ name: 'Book', price: 12 })

    const withoutSuffix = useSchema({ Product: ProductSchema })
    expect(withoutSuffix.instantiateProduct({ generateRandomNumbers: false })).toEqual({ name: 'Product', price: 0 })

    const withInternalSuffix = useSchema({ SchemaProductSchema: ProductSchema })
    expect(withInternalSuffix.safeParseSchemaProduct({ name: 'Book', price: 12 }).success).toBe(true)
  })

  test('retains the unnamed API and explicit output type argument', () => {
    const { instantiate, validate, safeParse } = useSchema<z.infer<typeof ProductSchema>>(ProductSchema)

    expect(instantiate({ generateRandomNumbers: false })).toEqual({ name: 'Product', price: 0 })
    expect(validate({ name: 'Book', price: 12 })).toEqual({ name: 'Book', price: 12 })
    expect(safeParse({ price: 12 }).success).toBe(false)
  })

  test('rejects empty objects and multiple schema entries', () => {
    expect(() => useSchema({})).toThrow('exactly one schema')
    expect(() => useSchema({ ProductSchema, OrderSchema: ProductSchema })).toThrow('exactly one schema')
  })
})
