import { z } from 'zod'
import { stripZodDefault } from '@/src/stripZodDefaultValues'
import { instantiateSchema, SchemaOptionalProps } from '@/src/instantiateSchema'

type SchemaUtils<Type> = {
  validate: (object: unknown) => Type
  safeParse: (object: unknown) => z.ZodSafeParseResult<Type>
  instantiate: (options?: SchemaOptionalProps) => Type
}

type NamedSchemaUtils<Type, Name extends string> = {
  [Key in `validate${Name}`]: SchemaUtils<Type>['validate']
} & {
  [Key in `safeParse${Name}`]: SchemaUtils<Type>['safeParse']
} & {
  [Key in `instantiate${Name}`]: SchemaUtils<Type>['instantiate']
}

type SchemaName<Name extends string> = Name extends `${infer Prefix}Schema` ? Prefix : Name

/**
 * Provides schema-bound validation, safe parsing, and dummy object creation.
 * Pass an object containing exactly one schema to infer method names from its key.
 * A trailing `Schema` is removed: `{ ProductSchema }` returns `validateProduct`,
 * `safeParseProduct`, and `instantiateProduct`.
 */
export function useSchema<Schema extends z.ZodType, const Name extends string>(schemas: Record<Name, Schema>): NamedSchemaUtils<z.infer<Schema>, SchemaName<Name>>

/** Retains the original API, including explicit type arguments. */
export function useSchema<Type>(schema: z.ZodType): SchemaUtils<Type>

export function useSchema(schemaOrSchemas: z.ZodType | Record<string, z.ZodType>) {
  let schema: z.ZodType
  let name: string | undefined

  if (schemaOrSchemas instanceof z.ZodType) {
    schema = schemaOrSchemas
  } else {
    const keys = Object.keys(schemaOrSchemas)
    if (keys.length !== 1) {
      throw new Error('useSchema expects an object containing exactly one schema')
    }

    const key = keys[0]
    schema = schemaOrSchemas[key]
    name = key.replace(/Schema$/, '')
  }

  const strippedSchema = stripZodDefault(schema)

  const validate = (object: unknown) => strippedSchema.parse(object)

  function instantiate(options?: SchemaOptionalProps) {
    return instantiateSchema(schema, options)
  }

  const safeParse = (object: unknown) => strippedSchema.safeParse(object)

  if (name === undefined) {
    return { instantiate, validate, safeParse } satisfies SchemaUtils<z.infer<typeof schema>>
  }

  return {
    [`validate${name}`]: validate,
    [`safeParse${name}`]: safeParse,
    [`instantiate${name}`]: instantiate,
  }
}
