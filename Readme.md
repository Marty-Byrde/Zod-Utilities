# Zod Utilities

TypeScript utilities for working with Zod 4 schemas: generate dummy data, validate objects, and simplify schemas.

## Features

- `useSchema`: bind validation, safe parsing, and dummy data generation to a schema.
- `instantiateSchema`: create values from a schema using explicit defaults and generated placeholders.
- `stripZodDefaults`: recursively remove `.default()` wrappers from supported schema types.
- `stripEffects`: simplify schemas by removing pipes and transforms, with options to remove built-in checks and omit object keys.

## Getting started

Clone the repository and install its dependencies:

```sh
git clone https://github.com/Marty-Byrde/Zod-Utilities.git
cd Zod-Utilities
pnpm install
```

## Usage

Import the public utilities from the package root:

```ts
import { instantiateSchema, stripEffects, stripZodDefaults, useSchema } from '@marty-byrde/zod-utilities'
```

For example:

```ts
import { z } from 'zod'
import { useSchema } from '@marty-byrde/zod-utilities'

const UserSchema = z.object({
  name: z.string().default('Anonymous'),
  age: z.number().min(0),
  active: z.boolean().default(true),
})

const { instantiateUser, validateUser, safeParseUser } = useSchema({ UserSchema })

const user = instantiateUser({ generateRandomNumbers: false })
// { name: 'Anonymous', age: 0, active: true }

validateUser({ name: 'Alex', age: 25, active: true }) // Returns the parsed object; throws on failure.

const result = safeParseUser({ name: 'Alex', age: 'invalid', active: true })
console.log(result.success) // false
```

Pass an object containing exactly one schema. Method names are inferred from the object's key, with a trailing `Schema` removed; return types are inferred from the schema. Keys without that suffix are used as-is. An explicit name argument is no longer needed.

`validateUser` and `safeParseUser` remove schema defaults before parsing, so defaulted fields still need to be supplied unless they are optional.

The unnamed API remains available: `useSchema<User>(UserSchema)` returns `instantiate`, `validate`, and `safeParse`, where `User` is `z.infer<typeof UserSchema>`.

`stripZodDefaults` removes `.default()` wrappers recursively while preserving validations, object key policies, tuple rest elements, transforms, codecs, and recursive schemas. Explicit `.optional()`, `.prefault()`, and `.catch()` behavior remains active; stripping defaults does not necessarily make a schema reject `undefined`. The original schema is preserved.

`stripEffects(schema)` recursively removes custom refinements, transforms, and overwrite operations such as `.trim()`. Built-in validations remain; pass `{ strip: 'all' }` to remove those too, including string formats and collection size checks. Base types, coercion, defaults, prefaults, catch fallbacks, readonly behavior, and object unknown-key policies are preserved. Default and catch factories run only when parsing requires them, and their original output values remain unchanged even when a transform is removed.

Pipes and codecs reduce to their input schema; preprocessors reduce to their output schema. Standalone transforms and custom predicates become `z.unknown()` because they have no underlying schema. `{ omitKeys: ['key'] }` removes declared keys from every nested object shape; unknown-key policies still determine whether supplied keys are stripped, retained, or rejected. Omitting a union's discriminator converts it to an ordinary union. Inferred types reflect stripped containers and literal omitted keys; catchall values infer as `unknown` because Zod's object type parameters erase the catchall schema. Source schemas are preserved.

Dummy data generation supports options such as `overrideArraySize`, `generateRandomNumbers`, and whether to instantiate optional or nullable values. Generated values are placeholders and may need adjustment to satisfy schema constraints.

`instantiateSchema` follows [Zod 4 default and prefault semantics](https://zod.dev/api#defaults): defaults return output values directly, while prefaults are parsed. Explicit defaults still apply inside optional fields when optional instantiation is disabled. Transforms, pipes, codecs, intersections, prefaults, and catches use synchronous parsing; they can throw if generated inputs fail validation. Async effects are unsupported.

Set `stripDefaultValues: true` to ignore `.default()` and `.prefault()` values recursively and generate empty UUID placeholders. Catch fallbacks remain active, and the original schema is preserved. Schema types without a generation strategy, including lazy schemas, records, maps, sets, and promises, throw an explicit unsupported-type error.

## Development

```sh
pnpm test   # Run Jest tests with coverage
pnpm build  # Compile TypeScript and resolve import aliases
pnpm docs   # Generate API documentation with TypeDoc
```

## License

ISC
