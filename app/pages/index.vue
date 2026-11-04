<script setup lang="ts">
definePageMeta({ middleware: 'authenticated' })

const route = useRoute()
const archived = computed(() => route.query.view === 'archived')
// Shared with the later search UI; context switches must never carry a query.
const search = useState('note-search', () => '')

watch(archived, () => {
  search.value = ''
}, { flush: 'sync' })

const title = computed(() => archived.value ? 'Archived Notes' : 'All Notes')

useHead({ title })

const authentication = useAuthentication()
const pending = ref(false)
const message = ref('')
const dirty = useState('note-dirty', () => false)
const discardOpen = ref(false)
const savingNote = useState('note-save-pending', () => false)

let resolveDiscard: ((discard: boolean) => void) | undefined

function confirmDiscard(): Promise<boolean> {
  if (savingNote.value)
    return Promise.resolve(false)

  if (!dirty.value)
    return Promise.resolve(true)

  discardOpen.value = true

  return new Promise((resolve) => {
    resolveDiscard = resolve
  })
}

function settleDiscard(discard: boolean) {
  resolveDiscard?.(discard)
  resolveDiscard = undefined
  discardOpen.value = false
}

async function logout() {
  if (!await confirmDiscard())
    return

  pending.value = true
  message.value = ''

  try {
    await authentication.logout()
    dirty.value = false
    await navigateTo('/login', { replace: true })
  } catch {
    message.value = 'We could not log you out. Please try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh bg-neutral-100 font-sans text-neutral-950 xl:flex dark:bg-neutral-950 dark:text-neutral-0">
    <UModal :open="discardOpen" title="Discard unsaved note?" description="Your note has not been saved. Leaving will discard your text." @update:open="!$event && settleDiscard(false)">
      <template #footer>
        <UButton color="neutral" variant="outline" @click="settleDiscard(false)">
          Keep writing
        </UButton>

        <UButton color="error" @click="settleDiscard(true)">
          Discard note
        </UButton>
      </template>
    </UModal>

    <aside class="hidden min-h-dvh w-68 shrink-0 flex-col border-r border-neutral-200 bg-neutral-0 px-4 py-6 xl:flex dark:border-neutral-800 dark:bg-neutral-950">
      <AppLogo role="img" aria-label="notes" class="mb-8 ml-3 shrink-0" />

      <nav aria-label="Notes" class="space-y-1 border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <UButton to="/" icon="i-app-home" color="neutral" variant="ghost" block class="justify-start" :class="!archived && 'bg-neutral-100 dark:bg-neutral-800'" :aria-current="!archived ? 'page' : undefined">
          All Notes
        </UButton>

        <UButton to="/?view=archived" icon="i-app-archive" color="neutral" variant="ghost" block class="justify-start" :class="archived && 'bg-neutral-100 dark:bg-neutral-800'" :aria-current="archived ? 'page' : undefined">
          Archived Notes
        </UButton>
      </nav>

      <div class="mt-auto space-y-3 pt-8">
        <p class="break-all px-3 text-xs text-neutral-600 dark:text-neutral-400">
          {{ authentication.session.value?.user.email }}
        </p>

        <UButton icon="i-app-logout" color="neutral" variant="ghost" :loading="pending" @click="logout">
          Log out
        </UButton>

        <p v-if="message" role="alert" class="text-sm text-red-500">
          {{ message }}
        </p>
      </div>
    </aside>

    <div class="min-w-0 flex-1">
      <header class="flex h-18 items-center justify-between gap-4 px-4 sm:px-8 xl:h-20 xl:border-b xl:border-neutral-200 xl:bg-neutral-0 dark:xl:border-neutral-800 dark:xl:bg-neutral-950">
        <AppLogo role="img" aria-label="notes" class="shrink-0 xl:hidden" />

        <h1 class="hidden text-2xl font-bold tracking-tight xl:block">
          {{ title }}
        </h1>

        <div class="hidden items-center gap-5 xl:flex">
          <UInput v-model="search" icon="i-app-search" placeholder="Search by title, content, or tags…" aria-label="Search notes (not available yet)" disabled class="w-75" />

          <UButton icon="i-app-settings" color="neutral" variant="ghost" aria-label="Settings (not available yet)" disabled />
        </div>

        <UButton icon="i-app-logout" color="neutral" variant="ghost" class="xl:hidden" :loading="pending" @click="logout">
          Log out
        </UButton>
      </header>

      <main class="min-h-[calc(100dvh-4.5rem)] rounded-t-xl bg-neutral-0 px-4 pt-6 pb-24 sm:px-8 xl:min-h-[calc(100dvh-5rem)] xl:rounded-none xl:p-0 dark:bg-neutral-950">
        <h1 class="mb-4 text-2xl font-bold tracking-tight xl:hidden" :class="(route.query.draft || route.query.note) && 'sr-only'">
          {{ title }}
        </h1>

        <p v-if="message" role="alert" class="mb-4 text-sm text-red-500 xl:hidden">
          {{ message }}
        </p>

        <NotesWorkspace :archived="archived" :confirm-discard="confirmDiscard" />
      </main>
    </div>

    <nav aria-label="Notes" class="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-neutral-200 bg-neutral-0 px-4 py-3 xl:hidden dark:border-neutral-800 dark:bg-neutral-950">
      <UButton to="/" icon="i-app-home" color="neutral" variant="ghost" aria-label="All Notes" :aria-current="!archived ? 'page' : undefined" :class="!archived && 'bg-blue-50 text-blue-500 dark:bg-neutral-800'">
        <span class="hidden sm:inline">Home</span>
      </UButton>

      <UButton icon="i-app-search" color="neutral" variant="ghost" aria-label="Search (not available yet)" disabled>
        <span class="hidden sm:inline">Search</span>
      </UButton>

      <UButton to="/?view=archived" icon="i-app-archive" color="neutral" variant="ghost" aria-label="Archived Notes" :aria-current="archived ? 'page' : undefined" :class="archived && 'bg-blue-50 text-blue-500 dark:bg-neutral-800'">
        <span class="hidden sm:inline">Archived</span>
      </UButton>

      <UButton icon="i-app-tag" color="neutral" variant="ghost" aria-label="Tags (not available yet)" disabled>
        <span class="hidden sm:inline">Tags</span>
      </UButton>

      <UButton icon="i-app-settings" color="neutral" variant="ghost" aria-label="Settings (not available yet)" disabled>
        <span class="hidden sm:inline">Settings</span>
      </UButton>
    </nav>
  </div>
</template>
