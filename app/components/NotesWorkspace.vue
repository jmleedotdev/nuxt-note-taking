<script setup lang="ts">
import type { Note } from '#shared/types/note'

const props = defineProps<{ archived: boolean, confirmDiscard: () => Promise<boolean> }>()
const route = useRoute()
const notes = useNotes()
const dirty = useState('new-note-dirty', () => false)
const creating = computed(() => !props.archived && route.query.draft === '1')
const noteId = computed(() => !props.archived && typeof route.query.note === 'string'
  ? route.query.note
  : '')
const { data, status, error, refresh } = await useAsyncData('active-notes', notes.list)
const { data: selected, status: readStatus, error: readError, refresh: reread } = await useAsyncData(
  () => `note-${noteId.value}`,
  () => noteId.value
    ? notes.read(noteId.value)
    : Promise.resolve(null),
)
const detail = computed(() => creating.value || !!noteId.value)

onBeforeRouteUpdate(async () => {
  if (!await props.confirmDiscard())
    return false
  dirty.value = false
})
onBeforeRouteLeave(async () => {
  if (!await props.confirmDiscard())
    return false
  dirty.value = false
})

function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  dirty.value = false
})

async function create() {
  await navigateTo({
    path: '/',
    query: { draft: '1' },
  })
}

async function back() {
  dirty.value = false // Cancel is an explicit discard.
  await navigateTo('/')
}

async function saved(note: Note) {
  dirty.value = false
  await navigateTo({
    path: '/',
    query: { note: note.id },
  })
  await refresh()
}

function date(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
</script>

<template>
  <div class="xl:flex xl:min-h-[calc(100dvh-5rem)]">
    <section aria-label="Note list" class="xl:w-72.5 xl:shrink-0 xl:border-r xl:border-neutral-200 xl:px-4 xl:py-5 dark:xl:border-neutral-800" :class="detail ? 'hidden xl:block' : ''">
      <UButton v-if="!archived" icon="i-app-plus" block class="mb-4 hidden justify-center xl:flex" @click="create">
        Create New Note
      </UButton>

      <template v-if="!archived">
        <p v-if="status === 'pending'" role="status" class="text-sm">
          Loading notes…
        </p>

        <div v-else-if="error" role="alert" class="space-y-3 text-sm">
          <p>We could not load your notes.</p>

          <UButton color="neutral" variant="outline" @click="refresh()">
            Try again
          </UButton>
        </div>

        <p v-else-if="!data?.notes.length" class="rounded-lg border border-neutral-200 bg-neutral-100 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
          You don’t have any notes yet. Start a new note to capture your thoughts and ideas.
        </p>

        <ul v-else class="divide-y divide-neutral-200 dark:divide-neutral-800">
          <li v-for="note in data.notes" :key="note.id" class="py-1">
            <button type="button" :aria-label="note.title" :aria-current="noteId === note.id ? 'true' : undefined" class="w-full rounded-md p-3 text-left hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-neutral-800" :class="noteId === note.id && 'bg-neutral-100 dark:bg-neutral-800'" @click="navigateTo({ path: '/', query: { note: note.id } })">
              <span class="block text-base font-semibold wrap-anywhere">{{ note.title }}</span>

              <span v-if="note.tags.length" class="mt-3 flex flex-wrap gap-1">
                <span v-for="tag in note.tags" :key="tag" class="rounded bg-neutral-200 px-1.5 py-0.5 text-xs wrap-anywhere dark:bg-neutral-700">{{ tag }}</span>
              </span>

              <time :datetime="note.lastEdited" class="mt-3 block text-xs text-neutral-700 dark:text-neutral-300">{{ date(note.lastEdited) }}</time>
            </button>
          </li>
        </ul>
      </template>

      <p v-else class="rounded-lg border border-neutral-200 bg-neutral-100 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
        No notes have been archived yet.
      </p>
    </section>

    <section v-if="detail" aria-label="Note" class="min-w-0 flex-1 xl:p-6">
      <NewNoteEditor v-if="creating" @dirty="dirty = $event" @cancel="back" @back="navigateTo('/')" @saved="saved" />

      <template v-else>
        <UButton icon="i-app-arrow-left" color="neutral" variant="ghost" aria-label="Back to notes" class="mb-4" @click="back">
          Go Back
        </UButton>

        <p v-if="readStatus === 'pending'" role="status">
          Loading note…
        </p>

        <div v-else-if="readError" role="alert" class="space-y-3">
          <p>We could not load this note. It may no longer be available.</p>

          <UButton color="neutral" variant="outline" @click="reread()">
            Try again
          </UButton>
        </div>

        <article v-else-if="selected" class="space-y-4">
          <h2 class="text-2xl font-bold tracking-tight wrap-anywhere">
            {{ selected.title }}
          </h2>

          <div class="flex gap-4 text-sm">
            <span class="flex items-center gap-2"><UIcon name="i-app-tag" class="size-4" />Tags</span>

            <div aria-label="Saved note tags" class="flex flex-wrap gap-1">
              <span v-for="tag in selected.tags" :key="tag" class="rounded bg-neutral-200 px-1.5 py-0.5 wrap-anywhere dark:bg-neutral-700">{{ tag }}</span>

              <span v-if="!selected.tags.length">No tags</span>
            </div>
          </div>

          <div class="flex gap-4 text-sm">
            <span class="flex items-center gap-2"><UIcon name="i-app-clock" class="size-4" />Last edited</span>

            <time :datetime="selected.lastEdited">{{ date(selected.lastEdited) }}</time>
          </div>

          <p aria-label="Saved note content" class="border-t border-neutral-200 pt-4 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere dark:border-neutral-800">
            {{ selected.content }}
          </p>
        </article>
      </template>
    </section>

    <UButton v-if="!archived && !detail" icon="i-app-plus" aria-label="Create New Note" class="fixed right-4 bottom-24 size-12 justify-center rounded-full shadow-lg sm:right-8 sm:size-16 xl:hidden" @click="create" />
  </div>
</template>
