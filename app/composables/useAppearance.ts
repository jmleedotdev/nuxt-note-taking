import type { Appearance } from '#shared/schemas/preferences'
import { appearanceSchema, defaultAppearance } from '#shared/schemas/preferences'

export function useAppearance() {
  // Only appearance is remembered here; no account identity, secrets or drafts.
  const remembered = useCookie<Appearance | null>('notes-appearance', { maxAge: 31536000, sameSite: 'lax', path: '/' })
  const initial = appearanceSchema.safeParse(remembered.value)
  const applied = useState<Appearance>('appearance-applied', () => initial.success
    ? initial.data
    : { ...defaultAppearance })
  const owner = useState<string | null>('appearance-owner', () => null)
  const status = useState<'idle' | 'loading' | 'ready' | 'error'>('appearance-status', () => 'idle')
  const revision = useState('appearance-revision', () => 0)
  const saving = useState('appearance-saving', () => false)
  const request = useRequestFetch()

  function remember(value: Appearance) {
    applied.value = { ...value }
    remembered.value = { ...value }
  }

  async function load(ownerId: string, force = false) {
    if (!force && owner.value === ownerId && status.value !== 'idle')
      return

    if (owner.value !== ownerId) {
      // Another account's remembered choice is never treated as this account's save.
      applied.value = { ...defaultAppearance }
      saving.value = false
    }

    owner.value = ownerId

    const current = ++revision.value

    status.value = 'loading'

    try {
      const value = appearanceSchema.parse(await request('/api/preferences'))

      if (revision.value !== current)
        return

      remember(value)
      status.value = 'ready'
    } catch {
      if (revision.value === current)
        status.value = 'error'
    }
  }

  function leaveAccount() {
    revision.value++
    owner.value = null
    status.value = 'idle'
    saving.value = false

    const local = appearanceSchema.safeParse(remembered.value)

    applied.value = local.success
      ? local.data
      : { ...defaultAppearance }
  }

  async function save(input: Appearance) {
    if (!owner.value || status.value !== 'ready' || saving.value)
      throw new Error('Account appearance is not ready.')

    const value = appearanceSchema.parse(input)
    const current = revision.value

    saving.value = true

    try {
      const saved = appearanceSchema.parse(await $fetch('/api/preferences', { method: 'PUT', body: value }))

      // Ignore responses belonging to a session that has since been left/replaced.
      if (revision.value !== current)
        throw new Error('Account changed while saving.')

      remember(saved)
    } finally {
      if (revision.value === current)
        saving.value = false
    }
  }

  return {
    applied,
    remembered,
    status,
    saving,
    load,
    save,
    leaveAccount,
  }
}
