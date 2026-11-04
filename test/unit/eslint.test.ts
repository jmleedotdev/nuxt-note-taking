import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function lint(path: string, source: string) {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('bin/eslint.js', import.meta.resolve('eslint/package.json'))),
    '--stdin',
    '--stdin-filename',
    path,
    '--format',
    'json',
  ], { input: source, encoding: 'utf8' })

  if (result.error || ![0, 1].includes(result.status!)) {
    throw new Error(result.stderr || 'ESLint failed to run', { cause: result.error })
  }

  const [report] = JSON.parse(result.stdout) as { messages: { ruleId: string, message: string }[] }[]

  return { status: result.status, messages: report!.messages }
}

describe('eslint conventions through the CLI', () => {
  it.each([
    ['app/composables/lint-example.ts', 'import { ref } from \'vue\'\n\nexport const count = ref(0)\n'],
    ['app/components/LintExample.vue', '<script setup lang="ts">\nimport { computed } from \'vue\'\n\nconst count = computed(() => 0)\n</script>\n\n<template>\n  <div>{{ count }}</div>\n</template>\n'],
    ['app/composables/lint-example.ts', 'import { useRoute } from \'#app\'\n\nexport const route = useRoute\n'],
    ['app/composables/lint-example.ts', 'import { useLink } from \'vue-router\'\n\nexport const link = useLink\n'],
    ['server/api/lint-example.ts', 'import { defineEventHandler } from \'h3\'\n\nexport default defineEventHandler(() => \'ok\')\n'],
    ['server/registration/lint-example.ts', 'import { readBody as read } from \'h3\'\n\nexport const body = read\n'],
    ['server/plugins/lint-example.ts', 'import { defineNitroPlugin } from \'nitropack/runtime\'\n\nexport default defineNitroPlugin(() => {})\n'],
  ])('rejects redundant runtime imports in %s', (path, source) => {
    const result = lint(path, source)

    expect(result.status).toBe(1)
    expect(result.messages).toEqual([
      expect.objectContaining({ ruleId: 'ts/no-restricted-imports' }),
    ])
  })

  it.each([
    'import { z } from \'zod\'\n\nexport const password = z.string()\n',
    'import { z } from \'zod\'\n\nexport const email = z.email().max(254).transform(value => value.toLowerCase())\n',
    'import { passwordSchema } from \'./registration\'\n\nexport const password = passwordSchema.optional()\n',
  ])('requires Schema on exported Zod schema variables (%s)', (source) => {
    const result = lint('shared/schemas/lint-example.ts', source)

    expect(result.status).toBe(1)
    expect(result.messages).toEqual([
      expect.objectContaining({ ruleId: 'no-restricted-syntax' }),
    ])
  })

  it.each([
    ['shared/schemas/lint-example.ts', 'import { z } from \'zod\'\n\nexport const passwordSchema = z.string()\n'],
    ['shared/schemas/lint-example.ts', 'import { z } from \'zod\'\n\nexport const registrationSchema = z.object({\n  email: z.email(),\n  password: z.string(),\n})\n\nexport type Registration = z.infer<typeof registrationSchema>\n'],
    ['shared/schemas/lint-example.ts', 'export const email = \'\'\n\nexport const fields = { password: \'\', email: \'\' }\n\nexport interface Registration { email: string }\n'],
    ['shared/schemas/lint-example.ts', 'import { z } from \'zod\'\n\nexport const email = z.email().parse(\'person@example.com\')\n'],
    ['shared/schemas/lint-example.ts', 'import { registrationSchema } from \'./registration\'\n\nexport const result = registrationSchema.safeParse({})\n'],
    ['app/composables/lint-example.ts', 'import type { Ref } from \'vue\'\n\nexport type Count = Ref<number>\n'],
    ['server/api/lint-example.ts', 'import type { H3Event } from \'h3\'\n\nexport type Event = H3Event\n'],
    ['app/composables/lint-example.ts', 'import { z } from \'zod\'\n\nexport const value = z.string()\n'],
    ['app/composables/lint-example.ts', 'import { createRenderer } from \'vue\'\n\nexport const renderer = createRenderer\n'],
    ['server/api/lint-example.ts', 'import { use } from \'h3\'\n\nexport const middleware = use\n'],
    ['app/composables/lint-example.ts', 'import { readBody } from \'h3\'\n\nexport const read = readBody\n'],
    ['server/api/lint-example.ts', 'import { ref } from \'vue\'\n\nexport const count = ref(0)\n'],
    ['scripts/lint-example.ts', 'import { ref } from \'vue\'\n\nexport const count = ref(0)\n'],
    ['test/fixtures/lint-example.ts', 'import { defineEventHandler } from \'h3\'\n\nexport default defineEventHandler(() => \'ok\')\n'],
    ['server/registration/password.ts', 'import { readBody } from \'h3\'\n\nexport const read = readBody\n'],
    ['app/components/lint-example.test.ts', 'import { ref } from \'vue\'\n\nexport const count = ref(0)\n'],
  ])('accepts valid code in %s', (path, source) => {
    expect(lint(path, source)).toEqual({ status: 0, messages: [] })
  })
})
