# Zod Utilities

TypeScript utilities for working with Zod 4 schemas: generate dummy data, validate objects, and simplify schemas.

## Features

- `createSchemaUtils`: bind validation without defaults, parsing with defaults, and dummy data generation to a schema.
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
import { instantiateSchema, stripEffects, stripZodDefaults, createSchemaUtils } from '@marty-byrde/zod-utilities'
```

For example:

```ts
import { z } from 'zod'
import { createSchemaUtils } from '@marty-byrde/zod-utilities'

const UserSchema = z.object({
  name: z.string().default('Anonymous'),
  age: z.number().min(0),
  active: z.boolean().default(true),
})

const { instantiateUser, validateUser, safeValidateUser, parseUser, safeParseUser } = createSchemaUtils({ UserSchema })

const user = instantiateUser({ generateRandomNumbers: false })
// { name: 'Anonymous', age: 0, active: true }

validateUser({ name: 'Alex', age: 25, active: true }) // Returns the parsed object; throws on failure.

const result = safeValidateUser({ age: 25 })
console.log(result.success) // false

parseUser({ age: 25 }) // { name: 'Anonymous', age: 25, active: true }
safeParseUser({ age: 25 }) // { success: true, data: { name: 'Anonymous', age: 25, active: true } }
```

Pass an object containing exactly one schema. Method names are inferred from the object's key, with a trailing `Schema` removed; return types are inferred from the schema. Keys without that suffix are used as-is. An explicit name argument is no longer needed.

| Method             | Schema used                   | On success                | On validation failure       |
| ------------------ | ----------------------------- | ------------------------- | --------------------------- |
| `validateUser`     | `.default()` wrappers removed | Parsed output             | Throws `ZodError`           |
| `safeValidateUser` | `.default()` wrappers removed | `{ success: true, data }` | `{ success: false, error }` |
| `parseUser`        | Original, including defaults  | Parsed output             | Throws `ZodError`           |
| `safeParseUser`    | Original, including defaults  | `{ success: true, data }` | `{ success: false, error }` |

Validation removes only `.default()` wrappers. It still parses data: transforms, coercion, refinements, object key policies, `.prefault()`, and `.catch()` remain active. Consequently, validation can return changed values, and removing defaults does not guarantee that omitted values are rejected. The original schema and input are not modified by these utilities; user callbacks retain their own behavior.

`validate` / `safeValidate` distinguish validation without defaults from ordinary parsing in this package. These are project-specific names: [Zod 4.6's `validate`](https://zod.dev/blog/zod-4-6#validate) returns a boolean type guard, whereas this utility's `validate` returns parsed output and throws on validation failure. `parseWithoutDefaults` / `safeParseWithoutDefaults` would be alternative names that describe the current behavior more precisely and avoid that naming overlap, yet would make the utility function names too long. Removing `.default()` wrappers does not disable parsing or other fallback mechanisms. All methods are synchronous; safe methods return validation errors as results, while exceptions from user callbacks or unsupported async effects can still propagate.

The unnamed API returns `instantiate`, `validate`, `safeValidate`, `parse`, and `safeParse`. `createSchemaUtils(UserSchema)` infers return types automatically, including optional validation outputs after defaults are removed. The explicit output type form `createSchemaUtils<User>(UserSchema)` remains available, where `User` is `z.infer<typeof UserSchema>`; that form uses the supplied type for all outputs.

**Migration:** `useSchema` has been renamed to `createSchemaUtils`; update imports and calls to use the new name. Its overloads and behavior are unchanged by the rename.

Calls that previously used `safeParseUser` (or unnamed `safeParse`) to reject missing defaulted values must use `safeValidateUser` (or `safeValidate`). `safeParse` now follows the original schema and applies its defaults.

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
