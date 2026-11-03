import { z } from 'zod'
import { stripZodDefault } from '@/src/stripZodDefaultValues'
import { instantiateSchema, SchemaOptionalProps } from '@/src/instantiateSchema'

type SchemaUtils<Type, ValidatedType = Type> = {
  /** Parses with `.default()` wrappers removed; throws a ZodError on validation failure. */
  validate: (object: unknown) => ValidatedType
  /** Parses with `.default()` wrappers removed; returns a success/error result. */
  safeValidate: (object: unknown) => z.ZodSafeParseResult<ValidatedType>
  /** Parses with the original schema, including defaults; throws a ZodError on validation failure. */
  parse: (object: unknown) => Type
  /** Parses with the original schema, including defaults; returns a success/error result. */
  safeParse: (object: unknown) => z.ZodSafeParseResult<Type>
  instantiate: (options?: SchemaOptionalProps) => Type
}

type InferredSchemaUtils<Schema extends z.ZodType> = SchemaUtils<z.output<Schema>, z.output<ReturnType<typeof stripZodDefault<Schema>>>>

type NamedUtils<Utilities, Name extends string> = {
  [Method in keyof Utilities & string as `${Method}${Name}`]: Utilities[Method]
}

type NamedSchemaUtils<Schema extends z.ZodType, Name extends string> = NamedUtils<InferredSchemaUtils<Schema>, Name>

type SchemaName<Name extends string> = Name extends `${infer Prefix}Schema` ? Prefix : Name

function appendSchemaName<Utilities extends Record<string, unknown>, Name extends string>(utilities: Utilities, name: Name): NamedUtils<Utilities, Name> {
  // Object.fromEntries loses the relationship between each computed key and its
  // value. Every own utility is copied unchanged under its suffixed name.
  return Object.fromEntries(Object.entries(utilities).map(([method, utility]) => [`${method}${name}`, utility])) as NamedUtils<Utilities, Name>
}

/**
 * Provides schema-bound validation, parsing, and dummy object creation.
 * Pass an object containing exactly one schema to infer method names from its key.
 * A trailing `Schema` is removed: `{ ProductSchema }` returns `validateProduct`,
 * `safeValidateProduct`, `parseProduct`, `safeParseProduct`, and `instantiateProduct`.
 * Validation removes only `.default()` wrappers: transforms, coercion, prefaults,
 * catch fallbacks and object key policies still apply. Parsing uses the original
 * schema with defaults intact. All methods are synchronous.
 */
export function createSchemaUtils<Schema extends z.ZodType, const Name extends string>(schemas: Record<Name, Schema>): NamedSchemaUtils<Schema, SchemaName<Name>>

/** Infers output types from a schema and returns unnamed methods. */
export function createSchemaUtils<Schema extends z.ZodType>(schema: Schema): InferredSchemaUtils<Schema>

/** Retains support for an explicit output type argument. */
export function createSchemaUtils<Type>(schema: z.ZodType): SchemaUtils<Type>

export function createSchemaUtils(schemaOrSchemas: z.ZodType | Record<string, z.ZodType>): InferredSchemaUtils<z.ZodType> | NamedSchemaUtils<z.ZodType, string> {
  let schema: z.ZodType
  let name: string | undefined

  if (schemaOrSchemas instanceof z.ZodType) {
    schema = schemaOrSchemas
  } else {
    const keys = Object.keys(schemaOrSchemas)
    if (keys.length !== 1) {
      throw new Error('createSchemaUtils expects an object containing exactly one schema')
    }

    const key = keys[0]
    schema = schemaOrSchemas[key]
    name = key.replace(/Schema$/, '')
  }

  const strippedSchema = stripZodDefault(schema)

  const validate = (object: unknown) => strippedSchema.parse(object)
  const safeValidate = (object: unknown) => strippedSchema.safeParse(object)
  const parse = (object: unknown) => schema.parse(object)
  const safeParse = (object: unknown) => schema.safeParse(object)

  function instantiate(options?: SchemaOptionalProps) {
    return instantiateSchema(schema, options)
  }

  // Check completeness once for both APIs. New required utilities must be
  // implemented here and automatically receive a name in the named API.
  const utilities = { instantiate, validate, safeValidate, parse, safeParse } satisfies InferredSchemaUtils<typeof schema>

  if (name === undefined) {
    return utilities
  }

  return appendSchemaName(utilities, name) satisfies NamedSchemaUtils<typeof schema, typeof name>
}
