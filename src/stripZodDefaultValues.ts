import { z } from 'zod'

/** Recursively removes default wrappers while retaining the surrounding schema types. */
type StripZodDefault<T extends z.core.$ZodType> =
  T extends z.ZodDefault<infer Inner extends z.core.$ZodType>
    ? StripZodDefault<Inner>
    : T extends z.ZodObject<infer Shape, infer Config>
      ? z.ZodObject<{ [K in keyof Shape]: StripZodDefault<Shape[K]> }, Config>
      : T extends z.ZodArray<infer Element extends z.core.$ZodType>
        ? z.ZodArray<StripZodDefault<Element>>
        : T extends z.ZodOptional<infer Inner extends z.core.$ZodType>
          ? z.ZodOptional<StripZodDefault<Inner>>
          : T extends z.ZodNullable<infer Inner extends z.core.$ZodType>
            ? z.ZodNullable<StripZodDefault<Inner>>
            : T extends z.ZodCatch<infer Inner extends z.core.$ZodType>
              ? z.ZodCatch<StripZodDefault<Inner>>
              : T extends z.ZodPrefault<infer Inner extends z.core.$ZodType>
                ? z.ZodPrefault<StripZodDefault<Inner>>
                : T extends z.ZodReadonly<infer Inner extends z.core.$ZodType>
                  ? z.ZodReadonly<StripZodDefault<Inner>>
                  : T extends z.ZodNonOptional<infer Inner extends z.core.$ZodType>
                    ? z.ZodNonOptional<StripZodDefault<Inner>>
                    : T extends z.ZodSuccess<infer Inner extends z.core.$ZodType>
                      ? z.ZodSuccess<StripZodDefault<Inner>>
                      : T extends z.ZodDiscriminatedUnion<infer Options, infer Discriminator>
                        ? z.ZodDiscriminatedUnion<MapSchemas<Options>, Discriminator>
                        : T extends z.ZodUnion<infer Options>
                          ? z.ZodUnion<MapSchemas<Options>>
                          : T extends z.ZodTuple<infer Items, infer Rest>
                            ? z.ZodTuple<MapSchemas<Items>, Rest extends z.core.$ZodType ? StripZodDefault<Rest> : null>
                            : T extends z.ZodIntersection<infer Left extends z.core.$ZodType, infer Right extends z.core.$ZodType>
                              ? z.ZodIntersection<StripZodDefault<Left>, StripZodDefault<Right>>
                              : T extends z.ZodCodec<infer In extends z.core.$ZodType, infer Out extends z.core.$ZodType>
                                ? z.ZodCodec<StripZodDefault<In>, StripZodDefault<Out>>
                                : T extends z.ZodPipe<infer In extends z.core.$ZodType, infer Out extends z.core.$ZodType>
                                  ? z.ZodPipe<StripZodDefault<In>, StripZodDefault<Out>>
                                  : T extends z.ZodRecord<infer Key extends z.core.$ZodRecordKey, infer Value extends z.core.$ZodType>
                                    ? z.ZodRecord<Extract<StripZodDefault<Key>, z.core.$ZodRecordKey>, StripZodDefault<Value>>
                                    : T extends z.ZodMap<infer Key extends z.core.$ZodType, infer Value extends z.core.$ZodType>
                                      ? z.ZodMap<StripZodDefault<Key>, StripZodDefault<Value>>
                                      : T extends z.ZodSet<infer Value extends z.core.$ZodType>
                                        ? z.ZodSet<StripZodDefault<Value>>
                                        : T extends z.ZodLazy<infer Inner extends z.core.$ZodType>
                                          ? z.ZodLazy<StripZodDefault<Inner>>
                                          : T extends z.ZodPromise<infer Inner extends z.core.$ZodType>
                                            ? z.ZodPromise<StripZodDefault<Inner>>
                                            : T extends z.ZodFunction<infer In extends z.core.$ZodFunctionIn, infer Out extends z.core.$ZodType>
                                              ? z.ZodFunction<StripZodDefault<In>, StripZodDefault<Out>>
                                              : T

type MapSchemas<T extends readonly z.core.SomeType[]> = { [K in keyof T]: T[K] extends z.core.$ZodType ? StripZodDefault<T[K]> : T[K] }

/**
 * Recursively removes `.default()` wrappers without mutating the original schema.
 * Preserves checks, object key policies, tuple rest schemas, transforms and codecs.
 * Explicit optionality, `.prefault()` values and `.catch()` fallbacks remain active.
 *
 * @internal
 */
export function stripZodDefault<Schema extends z.ZodType>(schema: Schema): StripZodDefault<Schema> {
  const memo = new WeakMap<z.core.$ZodType, z.core.$ZodType>()

  // Copy descriptors so getters such as prefault factories aren't evaluated here.
  // Retaining the constructor and definition also preserves specialized unions/codecs.
  const cloneWith = (source: z.core.$ZodType, overrides: object): z.core.$ZodType =>
    z.core.clone(
      source,
      Object.create(Object.getPrototypeOf(source._zod.def), {
        ...Object.getOwnPropertyDescriptors(source._zod.def),
        ...Object.getOwnPropertyDescriptors(overrides),
      }),
      { parent: true },
    )

  const visit = (source: z.core.$ZodType): z.core.$ZodType => {
    const cached = memo.get(source)
    if (cached) return cached

    const def = (source as z.core.$ZodTypes)._zod.def
    let result: z.core.$ZodType

    switch (def.type) {
      case 'default': {
        const inner = visit(def.innerType)
        // Refinements can be attached to the default wrapper itself in Zod 4.
        result = def.checks?.length ? cloneWith(inner, { checks: [...(inner._zod.def.checks ?? []), ...def.checks] }) : inner
        break
      }
      case 'object': {
        const shape: Record<PropertyKey, z.core.$ZodType> = Object.create(null)
        const originalShape = def.shape
        for (const key of Reflect.ownKeys(originalShape)) {
          Object.defineProperty(shape, key, {
            enumerable: true,
            configurable: true,
            // Defer traversal until after memoization to support recursive getters.
            get: () => visit(originalShape[key as keyof typeof originalShape]!),
          })
        }
        result = cloneWith(source, { shape, catchall: def.catchall ? visit(def.catchall) : undefined })
        break
      }
      case 'array':
        result = cloneWith(source, { element: visit(def.element) })
        break
      case 'optional':
      case 'nullable':
      case 'catch':
      case 'prefault':
      case 'readonly':
      case 'nonoptional':
      case 'success':
      case 'promise':
        result = cloneWith(source, { innerType: visit(def.innerType) })
        break
      case 'union':
        // Discriminated unions also use type "union", with a discriminator field.
        result = cloneWith(source, { options: def.options.map(visit) })
        break
      case 'tuple':
        result = cloneWith(source, { items: def.items.map(visit), rest: def.rest ? visit(def.rest) : null })
        break
      case 'intersection':
        result = cloneWith(source, { left: visit(def.left), right: visit(def.right) })
        break
      case 'pipe':
        result = cloneWith(source, { in: visit(def.in), out: visit(def.out) })
        break
      case 'record':
      case 'map':
        result = cloneWith(source, { keyType: visit(def.keyType), valueType: visit(def.valueType) })
        break
      case 'set':
        result = cloneWith(source, { valueType: visit(def.valueType) })
        break
      case 'lazy':
        // Recent Zod 4 versions cache the getter result on the definition.
        result = cloneWith(source, { getter: () => visit(def.getter()), _cachedInner: undefined })
        break
      case 'function':
        result = cloneWith(source, { input: visit(def.input), output: visit(def.output) })
        break
      default:
        // ZodTransform is a leaf containing a callback, not an effects wrapper.
        result = source
    }

    memo.set(source, result)
    return result
  }

  return visit(schema) as StripZodDefault<Schema>
}
