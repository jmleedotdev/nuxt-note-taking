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
        allowTypeImports: true,
        message: 'Use the Nuxt/Nitro auto-imported runtime helper instead.',
      }))
    const names = imports.flatMap(({ importNames }) => importNames)

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
        'ts/no-restricted-imports': [
          'error',
          {
            paths: [
              ...imports,
              ...['#imports', ...barrels].map(name => ({
                name,
                importNames: names,
                allowTypeImports: true,
                message: 'Use the Nuxt/Nitro auto-imported runtime helper instead.',
              })),
            ],
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

  configs.push({
    files: ['shared/schemas/**/*.{ts,js}'],
    rules: {
      'no-restricted-syntax': [
        ...(Array.isArray(syntaxRules)
          ? syntaxRules
          : ['error']),
        {
          selector: 'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.type="Identifier"][id.name!=/Schema$/][init.type="CallExpression"]:not([init.callee.property.name=/^(parse|safeParse|parseAsync|safeParseAsync)$/]):has(CallExpression:matches([callee.object.name="z"], [callee.object.name=/Schema$/]))',
          message: 'Exported Zod schema variables must have a Schema suffix.',
        },
      ],
    },
  })
})
