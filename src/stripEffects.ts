import { z } from 'zod'

type StripOptions = {
  /** Remove effects only (default), or also remove built-in validation checks. */
  strip?: 'effects-only' | 'all'
  /** Omit these declared keys from every nested object shape. Unknown-key policies still apply. */
  omitKeys?: readonly string[]
}

type MapSchemas<T extends readonly z.core.SomeType[], Options extends StripOptions> = { [K in keyof T]: T[K] extends z.core.$ZodType ? StripEffects<T[K], Options> : T[K] }
type OmittedKeys<Options extends StripOptions> = Options extends { omitKeys: readonly (infer Key extends string)[] } ? (string extends Key ? never : Key) : never
// Object config types retain catchall input/output types, but erase the schema
// needed to strip them. Avoid claiming its original transformed output survives.
type StripObjectConfig<Config extends z.core.$ZodObjectConfig> = string extends keyof Config['out'] ? z.core.$catchall<z.ZodUnknown> : Config

// Defaults and catches return output values directly, which may have a different
// type from the input schema that remains after removing a transform.
type WithFallback<Original extends z.core.$ZodType, Stripped extends z.ZodType> =
  z.output<Original> extends z.output<Stripped> ? Stripped : Omit<Stripped, keyof z.ZodType> & z.ZodType<z.output<Original> | z.output<Stripped>, z.input<Stripped>>

export type StripEffects<T extends z.core.$ZodType, Options extends StripOptions = {}> =
  T extends z.ZodPipe<infer In extends z.core.$ZodType, infer Out extends z.core.$ZodType>
    ? StripEffects<In extends z.core.$ZodTransform ? Out : In, Options>
    : T extends z.core.$ZodTransform | z.core.$ZodCustom
      ? z.ZodUnknown
      : T extends z.ZodObject<infer Shape, infer Config>
        ? z.ZodObject<{ [K in keyof Shape as K extends OmittedKeys<Options> ? never : K]: StripEffects<Shape[K], Options> }, StripObjectConfig<Config>>
        : T extends z.ZodArray<infer Inner extends z.core.$ZodType>
          ? z.ZodArray<StripEffects<Inner, Options>>
          : T extends z.ZodDefault<infer Inner extends z.core.$ZodType>
            ? WithFallback<T, z.ZodDefault<StripEffects<Inner, Options>>>
            : T extends z.ZodCatch<infer Inner extends z.core.$ZodType>
              ? WithFallback<T, z.ZodCatch<StripEffects<Inner, Options>>>
              : T extends z.ZodOptional<infer Inner extends z.core.$ZodType>
                ? z.ZodOptional<StripEffects<Inner, Options>>
                : T extends z.ZodNullable<infer Inner extends z.core.$ZodType>
                  ? z.ZodNullable<StripEffects<Inner, Options>>
                  : T extends z.ZodPrefault<infer Inner extends z.core.$ZodType>
                    ? z.ZodPrefault<StripEffects<Inner, Options>>
                    : T extends z.ZodReadonly<infer Inner extends z.core.$ZodType>
                      ? z.ZodReadonly<StripEffects<Inner, Options>>
                      : T extends z.ZodNonOptional<infer Inner extends z.core.$ZodType>
                        ? z.ZodNonOptional<StripEffects<Inner, Options>>
                        : T extends z.ZodSuccess<infer Inner extends z.core.$ZodType>
                          ? z.ZodSuccess<StripEffects<Inner, Options>>
                          : T extends z.ZodDiscriminatedUnion<infer Members, infer Discriminator>
                            ? Discriminator extends OmittedKeys<Options>
                              ? z.ZodUnion<MapSchemas<Members, Options>>
                              : z.ZodDiscriminatedUnion<MapSchemas<Members, Options>, Discriminator>
                            : T extends z.ZodUnion<infer Members>
                              ? z.ZodUnion<MapSchemas<Members, Options>>
                              : T extends z.ZodTuple<infer Items, infer Rest>
                                ? z.ZodTuple<MapSchemas<Items, Options>, Rest extends z.core.$ZodType ? StripEffects<Rest, Options> : null>
                                : T extends z.ZodIntersection<infer Left extends z.core.$ZodType, infer Right extends z.core.$ZodType>
                                  ? z.ZodIntersection<StripEffects<Left, Options>, StripEffects<Right, Options>>
                                  : T extends z.ZodRecord<infer Key extends z.core.$ZodRecordKey, infer Value extends z.core.$ZodType>
                                    ? z.ZodRecord<Extract<StripEffects<Key, Options>, z.core.$ZodRecordKey>, StripEffects<Value, Options>>
                                    : T extends z.ZodMap<infer Key extends z.core.$ZodType, infer Value extends z.core.$ZodType>
                                      ? z.ZodMap<StripEffects<Key, Options>, StripEffects<Value, Options>>
                                      : T extends z.ZodSet<infer Inner extends z.core.$ZodType>
                                        ? z.ZodSet<StripEffects<Inner, Options>>
                                        : T extends z.ZodLazy<infer Inner extends z.core.$ZodType>
                                          ? z.ZodLazy<StripEffects<Inner, Options>>
                                          : T extends z.ZodPromise<infer Inner extends z.core.$ZodType>
                                            ? z.ZodPromise<StripEffects<Inner, Options>>
                                            : T extends z.ZodFunction<infer In extends z.core.$ZodFunctionIn, infer Out extends z.core.$ZodType>
                                              ? z.ZodFunction<StripEffects<In, Options>, StripEffects<Out, Options>>
                                              : Options extends { strip: 'all' }
                                                ? T extends z.ZodStringFormat
                                                  ? z.ZodString
                                                  : T extends z.ZodNumberFormat
                                                    ? z.ZodNumber
                                                    : T extends z.ZodBigIntFormat
                                                      ? z.ZodBigInt
                                                      : T
                                                : T

/**
 * Recursively removes refinements, transforms and overwrite checks without mutating
 * the source. Built-in checks remain unless `strip: 'all'` is selected. Coercion,
 * defaults, prefaults, catch fallbacks, readonly and object key policies are retained.
 *
 * Pipes (including codecs) reduce to their input schema; preprocessors reduce to
 * their output schema. Standalone transforms/custom predicates become `z.unknown()`
 * because they have no underlying schema. Tuple rest elements and recursive schemas
 * are traversed too. Omitted keys are removed from shapes, not from input values.
 */
export function stripEffects<T extends z.ZodType, const Options extends StripOptions = {}>(schema: T, opts: Options = {} as Options): StripEffects<T, Options> {
  const omitSet = new Set(opts.omitKeys ?? [])
  const memo = new WeakMap<z.core.$ZodType, z.core.$ZodType>()

  const cloneWith = (source: z.core.$ZodType, overrides: object, base = source): z.core.$ZodType => {
    // Preserve descriptors so default/prefault factories aren't evaluated here.
    const definition = Object.create(Object.getPrototypeOf(source._zod.def), {
      ...Object.getOwnPropertyDescriptors(source._zod.def),
      ...Object.getOwnPropertyDescriptors(overrides),
    })
    const result = z.core.clone(base, definition, { parent: true })
    result._zod.parent = source
    return result
  }

  const visit = (source: z.core.$ZodType): z.core.$ZodType => {
    const cached = memo.get(source)
    if (cached) return cached

    const def = (source as z.core.$ZodTypes)._zod.def
    const checks =
      opts.strip === 'all'
        ? []
        : (def.checks ?? [])
            .filter((check) => !['custom', 'overwrite'].includes(check._zod.def.check))
            .map((check) => {
              if (check._zod.def.check !== 'property') return check
              const property = (check as z.core.$ZodCheckProperty)._zod.def
              return new z.core.$ZodCheckProperty({ ...property, schema: visit(property.schema) })
            })
    const clone = (overrides: object = {}) => cloneWith(source, { checks, ...overrides })
    let result: z.core.$ZodType

    switch (def.type) {
      case 'transform':
      case 'custom':
        result = cloneWith(source, { type: 'unknown', checks: [] }, z.unknown())
        break
      case 'pipe':
        // .transform() puts the transform on the right; preprocess puts it on the left.
        result = visit(def.in._zod.def.type === 'transform' ? def.out : def.in)
        break
      case 'object': {
        const shape: Record<PropertyKey, z.core.$ZodType> = Object.create(null)
        const originalShape = def.shape
        for (const key of Reflect.ownKeys(originalShape)) {
          if (typeof key === 'string' && omitSet.has(key)) continue
          Object.defineProperty(shape, key, {
            enumerable: true,
            configurable: true,
            // Recursive object getters must be visited after memoizing this object.
            get: () => visit(originalShape[key as keyof typeof originalShape]!),
          })
        }
        result = clone({ shape, catchall: def.catchall ? visit(def.catchall) : undefined })
        break
      }
      case 'array':
        result = clone({ element: visit(def.element) })
        break
      case 'optional':
      case 'nullable':
      case 'default':
      case 'prefault':
      case 'catch':
      case 'readonly':
      case 'nonoptional':
      case 'success':
      case 'promise':
        result = clone({ innerType: visit(def.innerType) })
        break
      case 'tuple':
        result = clone({ items: def.items.map(visit), rest: def.rest ? visit(def.rest) : null })
        break
      case 'union': {
        // Discriminated unions also have type "union" in Zod 4.
        const options = def.options.map(visit)
        const discriminator = 'discriminator' in def ? def.discriminator : undefined
        // Once its discriminator is omitted, the alternatives form an ordinary union.
        result = typeof discriminator === 'string' && omitSet.has(discriminator) ? cloneWith(source, { checks, options, discriminator: undefined }, z.union([])) : clone({ options })
        break
      }
      case 'intersection':
        result = clone({ left: visit(def.left), right: visit(def.right) })
        break
      case 'record':
      case 'map':
        result = clone({ keyType: visit(def.keyType), valueType: visit(def.valueType) })
        break
      case 'set':
        result = clone({ valueType: visit(def.valueType) })
        break
      case 'lazy':
        result = clone({ getter: () => visit(def.getter()), _cachedInner: undefined })
        break
      case 'function':
        result = clone({ input: visit(def.input), output: visit(def.output) })
        break
      case 'template_literal':
        result = clone({ parts: def.parts.map((part) => (typeof part === 'object' && part !== null ? visit(part) : part)) })
        break
      default: {
        // Format schemas (e.g. z.email(), z.int()) run an intrinsic check that
        // isn't in def.checks. Use the base constructor when dropping all checks.
        const base = opts.strip === 'all' ? { string: z.string, number: z.number, bigint: z.bigint }[def.type as 'string' | 'number' | 'bigint']?.() : undefined
        result = base ? cloneWith(source, { checks, format: undefined }, base) : clone()
      }
    }

    memo.set(source, result)
    return result
  }

  return visit(schema) as StripEffects<T, Options>
}
