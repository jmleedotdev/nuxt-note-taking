// @ts-check
import antfu from '@antfu/eslint-config'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: ['docs/**', 'drizzle/**'],
  },
  antfu({
    stylistic: {
      braceStyle: '1tbs',
    },
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
)
