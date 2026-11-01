# Zod Utilities

TypeScript utilities for working with Zod 4 schemas: generate dummy data, validate objects, and simplify schemas.

## Features

- `useSchema`: bind validation, safe parsing, and dummy data generation to a schema.
- `schemaDefaults`: generate default values for a schema.
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
import { schemaDefaults, stripEffects, stripZodDefaults, useSchema } from '@marty-byrde/zod-utilities'
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

type User = z.infer<typeof UserSchema>
const { instantiate, validate, safeParse } = useSchema<User>(UserSchema)

const user = instantiate({ generateRandomNumbers: false })
// { name: 'Anonymous', age: 0, active: true }

validate({ name: 'Alex', age: 25, active: true }) // Returns the parsed object; throws on failure.

const result = safeParse({ name: 'Alex', age: 'invalid', active: true })
console.log(result.success) // false
```

`validate` and `safeParse` remove schema defaults before parsing, so defaulted fields still need to be supplied unless they are optional.

Dummy data generation supports options such as `overrideArraySize`, `generateRandomNumbers`, and whether to instantiate optional or nullable values. Generated values are placeholders and may need adjustment to satisfy schema constraints.

## Development

```sh
pnpm test   # Run Jest tests with coverage
pnpm build  # Compile TypeScript and resolve import aliases
pnpm docs   # Generate API documentation with TypeDoc
```

## License

ISC
