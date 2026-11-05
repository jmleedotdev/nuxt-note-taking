<script setup lang="ts">
import type { Note } from '#shared/types/note'

const props = defineProps<{ archived: boolean, query: string, tag: string, confirmDiscard: () => Promise<boolean> }>()
const { query, tag } = toRefs(props)
const route = useRoute()
const notes = useNotes()
const dirty = useState('note-dirty', () => false)
const creating = computed(() => !props.archived && route.query.draft === '1')
const noteId = computed(() => typeof route.query.note === 'string'
  ? route.query.note
  : '')
const contextQuery = computed(() => ({
  ...(props.archived
    ? { view: 'archived' }
    : {}),
  ...(query.value
    ? { q: query.value }
    : {}),
  ...(tag.value
    ? { tag: tag.value }
    : {}),
  ...(route.query.panel === 'search'
    ? { panel: 'search' }
    : {}),
}))
const { data, status, error, refresh } = await useAsyncData(
  () => props.archived ? 'archived-notes' : 'active-notes',
  () => notes.list(props.archived, query.value, tag.value),
  {
    watch: [query, tag],
  },
)
const { data: selected, status: readStatus, error: readError, refresh: reread } = await useAsyncData(
  () => `note-${noteId.value}`,
  () => noteId.value
    ? notes.read(noteId.value)
    : Promise.resolve(null),
)
const detail = computed(() => creating.value || !!noteId.value)
const noteList = useTemplateRef('noteList')
const createButton = useTemplateRef('createButton')
const archiveOpen = ref(false)
const deleteOpen = ref(false)
const pending = useState('note-save-pending', () => false)
const transitionError = ref('')
const toast = useToast()

function focusList() {
  const list = noteList.value
  const target = Array.from(list?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])
    .find(button => button.getClientRects().length > 0)
    ?? createButton.value?.$el
    ?? list

  target?.focus()
}

// Back/Discard can remove the opener without a persistence transition. The
// workspace owns the replacement destination, including an empty archived list.
watch(detail, (showingDetail, wasShowingDetail) => {
  if (wasShowingDetail && !showingDetail)
    focusList()
}, { flush: 'post' })

let conflictToastId: string | number | undefined

function dismissConflict() {
  if (conflictToastId !== undefined)
    toast.remove(conflictToastId)
  conflictToastId = undefined
}

onBeforeUnmount(dismissConflict)

watch(noteId, () => {
  transitionError.value = ''
  dismissConflict()
})

async function transition(action: 'archive' | 'delete' = 'archive') {
  archiveOpen.value = false
  deleteOpen.value = false

  const note = selected.value

  if (!note || !await props.confirmDiscard())
    return

  pending.value = true
  transitionError.value = ''

  try {
    if (action === 'delete') {
      await notes.delete(note.id, note.version)
      selected.value = null
      clearNuxtData(`note-${note.id}`)
    } else {
      selected.value = note.isArchived
        ? await notes.restore(note.id, note.version)
        : await notes.archive(note.id, note.version)
    }

    dirty.value = false
    dismissConflict()
    toast.add({
      title: action === 'delete'
        ? 'Note permanently deleted.'
        : selected.value?.isArchived ? 'Note archived.' : 'Note restored to active notes.',
      color: 'success',
    })
    pending.value = false
    await navigateTo({ path: '/', query: contextQuery.value })
    await refreshNuxtData(['active-notes', 'archived-notes', 'note-tags'])
    await nextTick()

    focusList()
  } catch (error) {
    const code = (error as { data?: { error?: { code?: string } } }).data?.error?.code

    if (['NOTE_VERSION_CONFLICT', 'NOTE_NOT_FOUND'].includes(code ?? '')) {
      dismissConflict()
      conflictToastId = toast.add({
        title: code === 'NOTE_NOT_FOUND'
          ? 'This note was removed.'
          : 'A newer version of this note exists.',
        description: 'Reload for the latest state.',
        color: 'warning',
        duration: 0,
        actions: [
          { label: 'Reload note', closeOnClick: false, onClick: reloadTransition },
        ],
      }).id
    } else {
      transitionError.value = 'We could not change this note. Please try again.'
    }
  } finally {
    pending.value = false
  }
}

async function reloadTransition() {
  if (!selected.value || !await props.confirmDiscard())
    return

  pending.value = true

  try {
    const latest = await notes.read(selected.value.id)

    dirty.value = false
    selected.value = latest
    dismissConflict()
    await refresh()
  } catch (error) {
    const code = (error as { data?: { error?: { code?: string } } }).data?.error?.code

    if (code === 'NOTE_NOT_FOUND') {
      dirty.value = false
      pending.value = false
      dismissConflict()
      await navigateTo({ path: '/', query: contextQuery.value })
      await refresh()
    } else {
      transitionError.value = 'We could not reload your note. Your text is still here. Please try again.'
    }
  } finally {
    pending.value = false
  }
}

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
  await navigateTo({ path: '/', query: contextQuery.value })
}

async function removed() {
  dirty.value = false
  await Promise.all([
    refresh(),
    refreshNuxtData('note-tags'),
  ])
  await navigateTo({ path: '/', query: contextQuery.value })
}

async function saved(note: Note) {
  dirty.value = false
  selected.value = note

  if (creating.value) {
    await navigateTo({
      path: '/',
      query: { note: note.id },
    })
  }

  await Promise.all([
    refresh(),
    refreshNuxtData('note-tags'),
  ])
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
    <section ref="noteList" tabindex="-1" aria-label="Note list" class="xl:w-72.5 xl:shrink-0 xl:border-r xl:border-neutral-200 xl:px-4 xl:py-5 dark:xl:border-neutral-800" :class="detail ? 'hidden xl:block' : ''">
      <UButton v-if="!archived" icon="i-app-plus" block class="mb-4 hidden justify-center xl:flex" @click="create">
        Create New Note
      </UButton>

      <div>
        <p v-if="tag" class="mb-4 text-sm text-neutral-700 wrap-anywhere dark:text-neutral-300">
          All active notes with the “{{ tag }}” tag are shown here.
        </p>

        <p v-else-if="query" class="mb-4 text-sm text-neutral-700 wrap-anywhere dark:text-neutral-300">
          {{ archived ? 'Archived' : 'Active' }} notes matching “{{ query }}” are displayed below.
        </p>

        <p v-else-if="route.query.panel === 'search'" class="mb-4 text-sm text-neutral-700 dark:text-neutral-300">
          Enter a search and press Enter to search your saved {{ archived ? 'archived' : 'active' }} notes.
        </p>

        <p v-else-if="archived" class="mb-4 text-sm text-neutral-700 dark:text-neutral-300">
          All your archived notes are stored here. Restore a note to edit it again.
        </p>

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
          {{ query ? 'No notes match your search. Try a different keyword.' : tag ? 'No active notes have this tag.' : archived ? 'No notes have been archived yet.' : 'You don’t have any notes yet. Start a new note to capture your thoughts and ideas.' }}
        </p>

        <ul v-else class="divide-y divide-neutral-200 dark:divide-neutral-800">
          <li v-for="note in data.notes" :key="note.id" class="py-1">
            <button type="button" :aria-label="note.title" :aria-current="noteId === note.id ? 'true' : undefined" class="w-full rounded-md p-3 text-left hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-neutral-800" :class="noteId === note.id && 'bg-neutral-100 dark:bg-neutral-800'" @click="navigateTo({ path: '/', query: { ...contextQuery, note: note.id } })">
              <span class="block text-base font-semibold wrap-anywhere">{{ note.title }}</span>

              <span v-if="note.tags.length" class="mt-3 flex flex-wrap gap-1">
                <span v-for="noteTag in note.tags" :key="noteTag" class="rounded bg-neutral-200 px-1.5 py-0.5 text-xs wrap-anywhere dark:bg-neutral-700">{{ noteTag }}</span>
              </span>

              <time :datetime="note.lastEdited" class="mt-3 block text-xs text-neutral-700 dark:text-neutral-300">{{ date(note.lastEdited) }}</time>
            </button>
          </li>
        </ul>
      </div>
    </section>

    <section v-if="detail" aria-label="Note" class="min-w-0 flex-1 xl:flex xl:flex-col xl:p-6">
      <NoteEditor v-if="creating" :confirm-discard="confirmDiscard" @dirty="dirty = $event" @cancel="back" @back="navigateTo({ path: '/', query: contextQuery })" @saved="saved" />

      <template v-else>
        <UButton v-if="!selected || selected.isArchived" icon="i-app-arrow-left" color="neutral" variant="ghost" aria-label="Back to notes" class="mb-4 xl:hidden" @click="navigateTo({ path: '/', query: contextQuery })">
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

        <NoteEditor v-else-if="selected && !selected.isArchived" :key="`${selected.id}-${selected.version}`" :note="selected" :confirm-discard="confirmDiscard" @dirty="dirty = $event" @back="navigateTo({ path: '/', query: contextQuery })" @saved="saved" @removed="removed">
          <template #actions>
            <UButton icon="i-app-delete" color="neutral" variant="ghost" aria-label="Delete Note" class="size-8 justify-center" :disabled="pending" @click="deleteOpen = true" />

            <UButton icon="i-app-archive" color="neutral" variant="ghost" aria-label="Archive Note" class="size-8 justify-center" :disabled="pending" @click="archiveOpen = true" />
          </template>
        </NoteEditor>

        <article v-else-if="selected" class="space-y-4">
          <h2 class="text-2xl font-bold tracking-tight wrap-anywhere">
            {{ selected.title }}
          </h2>

          <div class="flex gap-4 text-sm">
            <span class="flex items-center gap-2"><UIcon name="i-app-tag" class="size-4" />Tags</span>

            <div aria-label="Saved note tags" class="flex flex-wrap gap-1">
              <span v-for="noteTag in selected.tags" :key="noteTag" class="rounded bg-neutral-200 px-1.5 py-0.5 wrap-anywhere dark:bg-neutral-700">{{ noteTag }}</span>

              <span v-if="!selected.tags.length">No tags</span>
            </div>
          </div>

          <div class="flex gap-4 text-sm">
            <span class="flex w-28.75 items-center gap-2"><UIcon name="i-app-status" class="size-4" />Status</span>

            <span>Archived</span>
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

      <p v-if="transitionError" role="alert" class="mt-4 text-sm text-red-600 dark:text-red-400">
        {{ transitionError }}
      </p>
    </section>

    <aside v-if="selected && detail && !creating" aria-label="Note actions" :class="selected.isArchived ? 'flex' : 'hidden xl:flex'" class="mb-4 flex-col gap-3 border-neutral-200 pt-4 xl:order-last xl:mb-0 xl:w-64 xl:shrink-0 xl:border-l xl:p-5 dark:border-neutral-800">
      <UButton v-if="selected.isArchived" icon="i-app-restore" color="neutral" variant="outline" :loading="pending" @click="transition()">
        Restore Note
      </UButton>

      <UButton v-if="!selected.isArchived" icon="i-app-archive" color="neutral" variant="outline" :disabled="pending" @click="archiveOpen = true">
        Archive Note
      </UButton>

      <UButton icon="i-app-delete" color="neutral" variant="outline" :disabled="pending" @click="deleteOpen = true">
        Delete Note
      </UButton>
    </aside>

    <template v-if="selected && detail && !creating">
      <ConfirmationDialog v-if="!selected.isArchived" v-model:open="archiveOpen" title="Archive Note" description="Are you sure you want to archive this note? You can find it in the Archived Notes section and restore it anytime." icon="i-app-archive" confirm-label="Archive Note" @confirm="transition()" />

      <ConfirmationDialog v-model:open="deleteOpen" title="Delete Note" description="Are you sure you want to permanently delete this note? This action cannot be undone." icon="i-app-delete" confirm-label="Delete Note" destructive @confirm="transition('delete')" />
    </template>

    <UButton v-if="!archived && !detail" ref="createButton" icon="i-app-plus" aria-label="Create New Note" class="fixed right-4 bottom-24 size-12 justify-center rounded-full shadow-lg sm:right-8 sm:size-16 xl:hidden" @click="create" />
  </div>
</template>
