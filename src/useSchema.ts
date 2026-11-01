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

/**
 * Provides schema-bound validation, safe parsing, and dummy object creation.
 * When a name is provided, returns methods with schema-specific property names.
 */
export function useSchema<Schema extends z.ZodType, const Name extends string>(schema: Schema, name: Name): NamedSchemaUtils<z.infer<Schema>, Name>

/** Retains the original API, including explicit type arguments. */
export function useSchema<Type>(schema: z.ZodType): SchemaUtils<Type>

export function useSchema(schema: z.ZodType, name?: string) {
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
