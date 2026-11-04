<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { NoteInput } from '#shared/schemas/note'
import type { Note } from '#shared/types/note'
import { noteFormSchema } from '#shared/schemas/note'

const props = defineProps<{ note?: Note, confirmDiscard: () => Promise<boolean> }>()
const emit = defineEmits<{
  saved: [note: Note]
  cancel: []
  back: []
  dirty: [value: boolean]
  removed: []
}>()
const initial = () => ({ title: props.note?.title ?? '', tags: props.note?.tags.join(', ') ?? '', content: props.note?.content ?? '' })
const state = reactive(initial())
const pending = useState('note-save-pending', () => false)
const message = ref('')
const form = useTemplateRef('form')
const notes = useNotes()
const toast = useToast()
const recovery = ref(false)

onBeforeUnmount(() => toast.remove('note-conflict'))

watch(state, () => emit('dirty', JSON.stringify(state) !== JSON.stringify(initial())), { flush: 'sync' })

function cancel() {
  Object.assign(state, initial())
  form.value?.clear()
  message.value = ''
  emit('dirty', false)

  if (!props.note)
    emit('cancel')
}

function conflict(code?: string) {
  if (!['NOTE_VERSION_CONFLICT', 'NOTE_NOT_FOUND', 'NOTE_NOT_EDITABLE'].includes(code ?? ''))
    return false

  recovery.value = true
  toast.add({
    id: 'note-conflict',
    title: code === 'NOTE_NOT_FOUND'
      ? 'This note was removed.'
      : code === 'NOTE_NOT_EDITABLE'
        ? 'This note was archived.'
        : 'A newer version of this note exists.',
    description: 'Your text is still here. Copy anything you need, then reload for the latest state.',
    color: 'warning',
    duration: 0,
    actions: [
      { label: 'Reload note', onClick: reload },
    ],
  })

  return true
}

async function reload() {
  if (!props.note || !await props.confirmDiscard())
    return

  pending.value = true

  try {
    const note = await notes.read(props.note.id)

    Object.assign(state, {
      title: note.title,
      tags: note.tags.join(', '),
      content: note.content,
    })
    recovery.value = false
    pending.value = false
    emit('dirty', false)
    toast.remove('note-conflict')
    emit('saved', note)
  } catch (error) {
    if ((error as { data?: { error?: { code?: string } } }).data?.error?.code === 'NOTE_NOT_FOUND') {
      pending.value = false
      emit('dirty', false)
      toast.remove('note-conflict')
      emit('removed')
    } else {
      message.value = 'We could not reload your note. Your text is still here. Please try again.'
    }
  } finally {
    pending.value = false
  }
}

async function save(event: FormSubmitEvent<NoteInput>) {
  pending.value = true
  message.value = ''

  try {
    const note = props.note
      ? await notes.update(props.note.id, { ...event.data, version: props.note.version })
      : await notes.create(event.data)

    Object.assign(state, {
      title: note.title,
      tags: note.tags.join(', '),
      content: note.content,
    })
    recovery.value = false
    toast.remove('note-conflict')

    emit('dirty', false)
    emit('saved', note)
  } catch (error) {
    const failure = error as { data?: { error?: { code?: string, fields?: Record<string, string> } } }

    if (conflict(failure.data?.error?.code))
      return

    const fields = failure.data?.error?.fields

    if (fields)
      form.value?.setErrors(Object.entries(fields).map(([name, message]) => ({ name, message })))
    message.value = 'We could not save your note. Your text is still here. Please try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UForm ref="form" :schema="noteFormSchema" :state="state" :validate-on="[]" class="flex min-w-0 flex-1 flex-col gap-4" @submit="save">
    <div class="flex items-center justify-between gap-2 border-b border-neutral-200 pb-3 xl:hidden dark:border-neutral-800">
      <UButton icon="i-app-arrow-left" color="neutral" variant="ghost" aria-label="Back to notes" :disabled="pending" @click="emit('back')">
        Go Back
      </UButton>

      <div class="flex gap-1">
        <UButton color="neutral" variant="ghost" :disabled="pending" @click="cancel">
          Cancel
        </UButton>

        <UButton type="submit" variant="ghost" :loading="pending">
          Save Note
        </UButton>
      </div>
    </div>

    <UButton v-if="recovery" color="neutral" variant="outline" :disabled="pending" class="self-start" @click="reload">
      Reload note
    </UButton>

    <UButton v-if="note" icon="i-app-arrow-left" color="neutral" variant="ghost" aria-label="Back to notes" class="hidden self-start xl:inline-flex" :disabled="pending" @click="emit('back')">
      Go Back
    </UButton>

    <UFormField name="title" label="Title" :ui="{ label: 'sr-only' }">
      <UInput v-model="state.title" placeholder="Enter a title…" class="w-full" variant="none" :ui="{ base: 'px-0 text-2xl font-bold tracking-tight md:text-2xl' }" :disabled="pending" autofocus />
    </UFormField>

    <UFormField name="tags" label="Tags" orientation="horizontal" :error-pattern="/^tags\./" help="Separate tags with commas (e.g. Work, Planning)." :ui="{ wrapper: 'w-28.75 shrink-0', label: 'flex items-center gap-2 font-normal', container: 'min-w-0 flex-1', help: 'sr-only' }">
      <template #label>
        <UIcon name="i-app-tag" class="size-4" />Tags
      </template>

      <UInput v-model="state.tags" placeholder="Add tags separated by commas" class="w-full" variant="none" :ui="{ base: 'px-0' }" :disabled="pending" />
    </UFormField>

    <div class="flex gap-2 text-sm text-neutral-600 dark:text-neutral-300">
      <span class="flex w-28.75 shrink-0 items-center gap-2"><UIcon name="i-app-clock" class="size-4" />Last edited</span>

      <time v-if="note" :datetime="note.lastEdited">{{ new Date(note.lastEdited).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) }}</time>

      <span v-else>Not yet saved</span>
    </div>

    <UFormField name="content" label="Note content" class="flex-1 border-t border-neutral-200 pt-4 dark:border-neutral-800" :ui="{ label: 'sr-only' }">
      <UTextarea v-model="state.content" placeholder="Start typing your note here…" class="w-full" variant="none" :rows="16" :ui="{ base: 'resize-y px-0 text-sm leading-relaxed' }" :disabled="pending" />
    </UFormField>

    <p v-if="message" role="alert" class="text-sm text-red-600 dark:text-red-400">
      {{ message }}
    </p>

    <div class="hidden gap-4 border-t border-neutral-200 pt-4 xl:flex dark:border-neutral-800">
      <UButton type="submit" :loading="pending">
        Save Note
      </UButton>

      <UButton color="neutral" variant="soft" :disabled="pending" @click="cancel">
        Cancel
      </UButton>
    </div>
  </UForm>
</template>
