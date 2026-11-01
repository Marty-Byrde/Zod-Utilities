import { z } from 'zod'
import { getUUID } from '@/src/lib/Shared/getUUID'

/** The default size of a generated array. @internal */
export const DEFAULT_ARRAY_SIZE = 5

/** @internal */
export interface SchemaOptionalProps {
  instantiate_Optional_PrimitiveProps?: boolean
  instantiate_Nullable_PrimitiveProps?: boolean
  instantiate_Optional_Objects?: boolean
  instantiate_Nullable_Objects?: boolean
  /** Ignore .default() and .prefault() values, and use empty UUID placeholders. */
  stripDefaultValues?: boolean
  generateRandomNumbers?: boolean
  overrideArraySize?: number
}

type ResolvedOptions = Readonly<Required<SchemaOptionalProps>>
type CoreSchema = z.core.$ZodType

const DEFAULT_OPTIONS: ResolvedOptions = {
  instantiate_Optional_PrimitiveProps: true,
  instantiate_Nullable_PrimitiveProps: true,
  instantiate_Optional_Objects: true,
  instantiate_Nullable_Objects: true,
  stripDefaultValues: false,
  generateRandomNumbers: true,
  overrideArraySize: DEFAULT_ARRAY_SIZE,
}

/**
 * Generates schema defaults and placeholders, with the schema's output type.
 * Placeholders are not guaranteed to satisfy every schema check (such as
 * lengths, multiples, string formats, or custom refinements).
 * Transforms, intersections, prefaults and catches use synchronous Zod parsing and may throw;
 * async schemas and unsupported schema types cannot be synthesized here.
 */
export default function schemaDefaults<Schema extends z.ZodType>(schema: Schema, userOptions?: SchemaOptionalProps): z.output<Schema> {
  const options = resolveOptions(userOptions)
  const root = options.stripDefaultValues ? removeDefaults(schema) : schema

  // When constructing pipe inputs, leave defaults for Zod to resolve, and
  // generate raw inputs so nested transforms are executed exactly once.
  const generate = (schema: CoreSchema, input = false, required = false): unknown => {
    const def = (schema as z.core.$ZodTypes)._zod.def

    switch (def.type) {
      case 'default':
      case 'prefault':
      case 'catch':
        return input ? undefined : z.core.parse(schema, undefined)

      case 'object':
        return Object.fromEntries(Object.entries(def.shape).map(([key, value]) => [key, generate(value, input)]))

      case 'string': {
        const checks = def.checks?.map((check) => (check as z.core.$ZodChecks)._zod.def) ?? []
        const format = (schema as z.core.$ZodStringFormatTypes)._zod.def.format
        const uuid = format === 'uuid' || checks.some((check) => check.check === 'string_format' && check.format === 'uuid')
        return uuid && !options.stripDefaultValues ? getUUID() : ''
      }

      case 'number':
        return numberDefault(schema as z.ZodNumber, options.generateRandomNumbers)
      case 'bigint':
        return BigInt(0)
      case 'boolean':
        return false
      case 'null':
        return null
      case 'nan':
        return NaN
      case 'symbol':
        return Symbol()
      case 'undefined':
      case 'void':
      case 'unknown':
      case 'any':
      case 'custom':
        return undefined

      case 'nullable': {
        const instantiate = isObjectLike(def.innerType) ? options.instantiate_Nullable_Objects : options.instantiate_Nullable_PrimitiveProps
        return instantiate ? generate(def.innerType, input, required) : null
      }

      case 'optional': {
        const instantiate = isObjectLike(def.innerType) ? options.instantiate_Optional_Objects : options.instantiate_Optional_PrimitiveProps
        if (instantiate || required) return generate(def.innerType, input, required)
        // Zod 4 applies nested defaults even when the property is optional.
        return input ? undefined : z.core.parse(schema, undefined)
      }

      case 'array':
        return Array.from({ length: options.overrideArraySize }, () => generate(def.element, input))

      case 'transform':
        return input ? undefined : z.core.parse(schema, undefined)
      case 'pipe':
        return input ? generate(def.in, true) : z.core.parse(schema, generate(def.in, true))

      // Discriminated unions also have def.type === 'union' in Zod 4.
      case 'union':
        return generate(pick(def.options), input)
      case 'enum':
        // Unlike Object.values(), this excludes numeric TS enum reverse mappings.
        return pick(z.core.util.getEnumValues(def.entries))
      case 'literal':
        return def.values[0]
      case 'date':
        return new Date()
      case 'tuple':
        // The rest part is optional; generating just the fixed items is valid.
        return def.items.map((item) => generate(item, input))

      case 'intersection': {
        const left = generate(def.left, true)
        const right = generate(def.right, true)
        if (isPlainObject(left) && isPlainObject(right)) {
          const merged = mergeDefaults(left, right)
          return input ? merged : z.core.parse(schema, merged)
        }
        if (Object.is(left, right)) return input ? left : z.core.parse(schema, left)
        if (!input) {
          for (const candidate of [left, right]) {
            const parsed = z.core.safeParse(schema, candidate)
            if (parsed.success) return parsed.data
          }
        }
        const merged = mergeDefaults(left, right)
        return input ? merged : z.core.parse(schema, merged)
      }

      case 'readonly': {
        const value = generate(def.innerType, input, required)
        return input ? value : Object.freeze(value)
      }
      case 'nonoptional': {
        const value = generate(def.innerType, input, true)
        if (!input && value === undefined) throw new Error('[SchemaDefaults]: Cannot generate a nonoptional value from undefined')
        return value
      }

      default:
        throw new Error(`[SchemaDefaults]: Unsupported type ${def.type}`)
    }
  }

  return generate(root) as z.output<Schema>
}

function pick<T>(values: readonly T[]): T {
  if (values.length === 0) throw new Error('[SchemaDefaults]: Cannot select a value from an empty schema')
  return values[Math.floor(Math.random() * values.length)]
}

function isObjectLike(schema: CoreSchema): boolean {
  const def = (schema as z.core.$ZodTypes)._zod.def
  switch (def.type) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'catch':
    case 'readonly':
    case 'nonoptional':
      return isObjectLike(def.innerType)
    case 'pipe':
      return isObjectLike(def.out._zod.def.type === 'transform' ? def.in : def.out)
    default:
      return def.type === 'object' || def.type === 'array' || def.type === 'tuple'
  }
}

/** Clone compositions so parsing a pipe/catch cannot reapply stripped defaults. */
function removeDefaults(schema: CoreSchema): CoreSchema {
  const def = (schema as z.core.$ZodTypes)._zod.def
  const clone = (changes: Record<string, unknown>) => z.core.clone(schema, { ...def, ...changes })
  switch (def.type) {
    case 'default':
    case 'prefault':
      return removeDefaults(def.innerType)
    case 'object':
      return clone({ shape: Object.fromEntries(Object.entries(def.shape).map(([key, value]) => [key, removeDefaults(value)])) })
    case 'array':
      return clone({ element: removeDefaults(def.element) })
    case 'tuple':
      return clone({ items: def.items.map(removeDefaults), rest: def.rest ? removeDefaults(def.rest) : null })
    case 'union':
      return clone({ options: def.options.map(removeDefaults) })
    case 'intersection':
      return clone({ left: removeDefaults(def.left), right: removeDefaults(def.right) })
    case 'pipe':
      return clone({ in: removeDefaults(def.in), out: removeDefaults(def.out) })
    case 'optional':
    case 'nullable':
    case 'catch':
    case 'readonly':
    case 'nonoptional':
      return clone({ innerType: removeDefaults(def.innerType) })
    default:
      return schema
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
}

/** Preserve both sides of nested intersections instead of silently overwriting. */
function mergeDefaults(left: unknown, right: unknown): unknown {
  if (Object.is(left, right)) return left
  if (left instanceof Date && right instanceof Date && +left === +right) return left
  if (isPlainObject(left) && isPlainObject(right)) {
    return Object.fromEntries(
      Array.from(new Set([...Object.keys(left), ...Object.keys(right)]), (key) => [
        key,
        Object.prototype.hasOwnProperty.call(left, key) && Object.prototype.hasOwnProperty.call(right, key)
          ? mergeDefaults(left[key], right[key])
          : Object.prototype.hasOwnProperty.call(left, key)
            ? left[key]
            : right[key],
      ]),
    )
  }
  if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) return left.map((value, index) => mergeDefaults(value, right[index]))
  throw new Error('[SchemaDefaults]: Cannot merge incompatible intersection defaults')
}

/** The adjacent representable number, including for fractional exclusive bounds. */
function nextUp(value: number): number {
  if (value === Infinity) return value
  if (value === 0) return Number.MIN_VALUE
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, value)
  view.setBigUint64(0, view.getBigUint64(0) + BigInt(value > 0 ? 1 : -1))
  return view.getFloat64(0)
}

function numberDefault(schema: z.ZodNumber, random: boolean): number {
  let min = Math.max(schema.minValue ?? -Number.MAX_VALUE, -Number.MAX_VALUE)
  let max = Math.min(schema.maxValue ?? Number.MAX_VALUE, Number.MAX_VALUE)
  let hasMinimum = false
  let hasMaximum = false
  let requiresInteger = schema.format?.includes('int') ?? false
  for (const check of schema._zod.def.checks ?? []) {
    const def = (check as z.core.$ZodChecks)._zod.def
    // Composed formats and integer multiples can require integers even when
    // the schema's reported format is a float format or null.
    if ((def.check === 'number_format' && def.format.includes('int')) || (def.check === 'multiple_of' && Number.isSafeInteger(def.value))) requiresInteger = true
    if (def.check === 'greater_than' && typeof def.value === 'number') {
      hasMinimum = true
      if (!def.inclusive) min = Math.max(min, nextUp(def.value))
    }
    if (def.check === 'less_than' && typeof def.value === 'number') {
      hasMaximum = true
      if (!def.inclusive) max = Math.min(max, -nextUp(-def.value))
    }
  }
  // Use the familiar 0..100 range only for unconstrained ends, adapting to
  // negative-only ranges and lower bounds above 100.
  if (!hasMinimum) min = Math.max(min, Math.min(0, max))
  if (!hasMaximum) max = Math.min(max, Math.max(100, min))

  if (requiresInteger) {
    min = Math.ceil(min)
    max = Math.floor(max)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) throw new Error('[SchemaDefaults]: Cannot generate a number within the schema bounds')
  if (!random || min === max) return min
  const lowInteger = Math.ceil(min)
  const highInteger = Math.floor(max)
  if (lowInteger <= highInteger && Number.isSafeInteger(lowInteger) && Number.isSafeInteger(highInteger)) {
    return Math.min(highInteger, lowInteger + Math.floor(Math.random() * (highInteger - lowInteger + 1)))
  }
  const ratio = Math.random()
  return Math.min(max, Math.max(min, min * (1 - ratio) + max * ratio))
}

function resolveOptions(options: SchemaOptionalProps = {}): ResolvedOptions {
  return {
    instantiate_Optional_PrimitiveProps: options.instantiate_Optional_PrimitiveProps ?? DEFAULT_OPTIONS.instantiate_Optional_PrimitiveProps,
    instantiate_Nullable_PrimitiveProps: options.instantiate_Nullable_PrimitiveProps ?? DEFAULT_OPTIONS.instantiate_Nullable_PrimitiveProps,
    instantiate_Optional_Objects: options.instantiate_Optional_Objects ?? DEFAULT_OPTIONS.instantiate_Optional_Objects,
    instantiate_Nullable_Objects: options.instantiate_Nullable_Objects ?? DEFAULT_OPTIONS.instantiate_Nullable_Objects,
    stripDefaultValues: options.stripDefaultValues ?? DEFAULT_OPTIONS.stripDefaultValues,
    generateRandomNumbers: options.generateRandomNumbers ?? DEFAULT_OPTIONS.generateRandomNumbers,
    overrideArraySize: normalizeArraySize(options.overrideArraySize ?? DEFAULT_OPTIONS.overrideArraySize),
  }
}

function normalizeArraySize(size: number): number {
  if (!Number.isFinite(size) || size < 0) return DEFAULT_ARRAY_SIZE
  return Math.floor(size)
}
