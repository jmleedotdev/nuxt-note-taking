<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { NoteInput } from '#shared/schemas/note'
import type { Note } from '#shared/types/note'
import { noteFormSchema } from '#shared/schemas/note'

const emit = defineEmits<{
  saved: [note: Note]
  cancel: []
  back: []
  dirty: [value: boolean]
}>()
const state = reactive({ title: '', tags: '', content: '' })
const pending = ref(false)
const message = ref('')
const form = useTemplateRef('form')
const notes = useNotes()

watch(state, () => emit('dirty', !!(state.title || state.tags || state.content)))

async function save(event: FormSubmitEvent<NoteInput>) {
  pending.value = true
  message.value = ''

  try {
    const note = await notes.create(event.data)

    emit('dirty', false)
    emit('saved', note)
  } catch (error) {
    const failure = error as { data?: { error?: { fields?: Record<string, string> } } }
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
        <UButton color="neutral" variant="ghost" :disabled="pending" @click="emit('cancel')">
          Cancel
        </UButton>

        <UButton type="submit" variant="ghost" :loading="pending">
          Save Note
        </UButton>
      </div>
    </div>

    <UFormField name="title" label="Title" :ui="{ label: 'sr-only' }">
      <UInput v-model="state.title" placeholder="Enter a title…" class="w-full" variant="none" :ui="{ base: 'px-0 text-xl sm:text-2xl font-bold tracking-tight' }" :disabled="pending" autofocus />
    </UFormField>

    <UFormField name="tags" label="Tags" :error-pattern="/^tags\./" help="Separate tags with commas (e.g. Work, Planning)." :ui="{ label: 'flex items-center gap-2' }">
      <template #label>
        <UIcon name="i-app-tag" class="size-4" />Tags
      </template>

      <UInput v-model="state.tags" placeholder="Add tags separated by commas" class="w-full" variant="none" :ui="{ base: 'px-0' }" :disabled="pending" />
    </UFormField>

    <div class="flex gap-4 text-sm text-neutral-600 dark:text-neutral-300">
      <span class="flex items-center gap-2"><UIcon name="i-app-clock" class="size-4" />Last edited</span>

      <span>Not yet saved</span>
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

      <UButton color="neutral" variant="soft" :disabled="pending" @click="emit('cancel')">
        Cancel
      </UButton>
    </div>
  </UForm>
</template>
