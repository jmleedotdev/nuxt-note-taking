<script setup lang="ts">
definePageMeta({ middleware: 'authenticated' })

const route = useRoute()
const archived = computed(() => route.query.view === 'archived')
const title = computed(() => archived.value ? 'Archived Notes' : 'All Notes')

useHead({ title })

const authentication = useAuthentication()
const pending = ref(false)
const message = ref('')

async function logout() {
  pending.value = true
  message.value = ''

  try {
    await authentication.logout()
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
          <UInput icon="i-app-search" placeholder="Search by title, content, or tags…" aria-label="Search notes (not available yet)" disabled class="w-75" />

          <UButton icon="i-app-settings" color="neutral" variant="ghost" aria-label="Settings (not available yet)" disabled />
        </div>

        <UButton icon="i-app-logout" color="neutral" variant="ghost" class="xl:hidden" :loading="pending" @click="logout">
          Log out
        </UButton>
      </header>

      <main class="min-h-[calc(100dvh-4.5rem)] rounded-t-xl bg-neutral-0 px-4 pt-6 pb-24 sm:px-8 xl:min-h-[calc(100dvh-5rem)] xl:rounded-none xl:p-0 dark:bg-neutral-950">
        <h1 class="mb-4 text-2xl font-bold tracking-tight xl:hidden">
          {{ title }}
        </h1>

        <p v-if="message" role="alert" class="mb-4 text-sm text-red-500 xl:hidden">
          {{ message }}
        </p>

        <section :aria-label="title" class="xl:min-h-[calc(100dvh-5rem)] xl:w-72.5 xl:border-r xl:border-neutral-200 xl:px-4 xl:py-5 dark:xl:border-neutral-800">
          <UButton v-if="!archived" icon="i-app-plus" block disabled class="mb-4 hidden justify-center bg-blue-500 text-neutral-0 xl:flex">
            Create New Note
          </UButton>

          <p class="rounded-lg border border-neutral-200 bg-neutral-100 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
            {{ archived ? 'No notes have been archived yet.' : 'You don’t have any notes yet. Start a new note to capture your thoughts and ideas.' }}
          </p>

          <p v-if="!archived" class="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
            Note creation is coming next.
          </p>
        </section>
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
