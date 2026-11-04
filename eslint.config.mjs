// @ts-check
import { readFileSync } from 'node:fs'
import antfu from '@antfu/eslint-config'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['docs/**'],
  },
  antfu({
    stylistic: {
      braceStyle: '1tbs',
    },
  }),
  // Generated registries reflect this installed Nuxt/Nitro setup, rather than
  // assuming that every export from a framework package is auto-imported.
  ...[
    {
      files: ['app/**/*.{ts,js,vue}'],
      registry: './.nuxt/imports.d.ts',
      barrels: ['#app', 'nuxt/app'],
    },
    {
      files: ['server/**/*.{ts,js}'],
      registry: './.nuxt/types/nitro-imports.d.ts',
      barrels: ['nitropack/runtime'],
    },
  ].map(({ files, registry, barrels }) => {
    const imports = [
      ...readFileSync(new URL(registry, import.meta.url), 'utf8')
        .matchAll(/^export \{ (.+) \} from '([^']+)';$/gm),
    ]
      .map(([, names, from]) => ({
        name: from,
        // Aliases with a different global name are not redundant imports.
        importNames: names.split(', ').filter(name => !name.includes(' as ')),
      }))
    const names = imports.flatMap(({ importNames }) => importNames)
    // Nuxt UI registers physical module paths, but exposes these same helpers
    // through public composable entry points (not every UI export is imported).
    const uiImports = imports.filter(({ name }) => name.includes('/node_modules/@nuxt/ui/dist/runtime/composables/'))

    return {
      files,
      // These files run outside Nuxt's import transform, even when colocated.
      ignores: [
        '**/*.{test,spec}.{ts,js}',
        '**/fixtures/**',
        // Also imported transitively by plain Node/Vitest mail and password tests.
        'server/registration/{config,mail,password,service}.ts',
        'server/db/**',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              ...imports,
              ...uiImports.flatMap(({ name, importNames }) => [
                '@nuxt/ui/composables',
                `@nuxt/ui/composables/${name.split('/').at(-1)}`,
                `@nuxt/ui/runtime/composables/${name.split('/').at(-1)}.js`,
              ].map(name => ({ name, importNames }))),
              ...['#imports', ...barrels].map(name => ({ name, importNames: names })),
            ].map(path => ({
              ...path,
              allowTypeImports: true,
              message: 'Use the Nuxt/Nitro auto-imported runtime helper instead.',
            })),
          },
        ],
      },
    }
  }),
  {
    rules: {
      'node/prefer-global/process': 'off',
      'style/padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: ['const', 'let', 'export'],
          next: '*',
        },
        {
          blankLine: 'always',
          prev: '*',
          next: [
            'const',
            'let',
            'export',
            'function',
            'if',
            'for',
            'while',
            'switch',
            'try',
            'return',
          ],
        },
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'never', prev: 'const', next: 'const' },
      ],
      'vue/padding-line-between-tags': [
        'error',
        [
          { blankLine: 'always', prev: '*', next: '*' },
        ],
      ],
    },
  },
).onResolved((configs) => {
  // Retain the existing syntax restrictions rather than replacing their defaults.
  const syntaxRules = configs.find(config => config.name === 'antfu/javascript')?.rules?.['no-restricted-syntax']
  // Schema factories from the installed Zod v4 classic API. Checks, error
  // formatters, configuration, and JSON Schema conversion are not Zod schemas.
  const schemaFactories = [
    'string|email|guid|uuid|uuidv4|uuidv6|uuidv7|url|httpUrl|emoji|nanoid|cuid|cuid2|ulid|xid|ksuid',
    'ipv4|mac|ipv6|cidrv4|cidrv6|base64|base64url|e164|creditCard|iban|jwt|stringFormat|hostname|hex|currencyCode|hash',
    'number|int|float32|float64|int32|uint32|boolean|bigint|int64|uint64|symbol|undefined|null|any|unknown|never|void|date',
    'array|keyof|object|strictObject|looseObject|union|xor|discriminatedUnion|intersection|tuple|record|partialRecord|looseRecord|map|set',
    'enum|nativeEnum|literal|file|transform|optional|exactOptional|nullable|nullish|default|prefault|nonoptional|success|nan|catch',
    'pipe|codec|invertCodec|readonly|templateLiteral|lazy|promise|function|custom|instanceof|stringbool|json|preprocess',
    'fromJSONSchema|deepPartial|input|output|clone',
  ].join('|')

  configs.push({
    files: ['shared/schemas/**/*.{ts,js}'],
    rules: {
      'no-restricted-syntax': [
        ...(Array.isArray(syntaxRules)
          ? syntaxRules
          : ['error']),
        {
          // Include top-level declarations so a later `export { schema }` does
          // not bypass naming. Only follow schema-producing initializer chains;
          // schemas consumed inside call arguments are not the resulting value.
          selector: [
            ':matches(Program, ExportNamedDeclaration) > VariableDeclaration > ',
            'VariableDeclarator[id.type="Identifier"][id.name!=/Schema$/]',
            ':matches(',
            '[init.type="Identifier"][init.name=/Schema$/], ',
            '[init.type="CallExpression"][init.callee.type="MemberExpression"]',
            ':has(CallExpression:matches(',
            `[callee.object.name="z"][callee.property.name=/^(${schemaFactories})$/], `,
            '[callee.object.object.name="z"][callee.object.property.name=/^(coerce|iso)$/], ',
            '[callee.object.name=/Schema$/])',
            ':not(.arguments):not(.arguments *))',
            ':not(:has(CallExpression[callee.property.name=/^(parse|safeParse|parseAsync|safeParseAsync|encode|decode|encodeAsync|decodeAsync|safeEncode|safeDecode|safeEncodeAsync|safeDecodeAsync|toJSONSchema|isOptional|isNullable)$/]',
            ':not(.arguments):not(.arguments *)))',
            ')',
          ].join(''),
          message: 'Top-level Zod schema variables must have a Schema suffix.',
        },
      ],
    },
  })
})
