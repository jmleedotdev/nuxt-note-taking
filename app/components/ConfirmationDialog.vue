<script setup lang="ts">
defineProps<{
  title: string
  description: string
  icon: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  returnFocus?: () => HTMLElement | null
}>()

const emit = defineEmits<{ confirm: [] }>()
const open = defineModel<boolean>('open', { default: false })
const slots = useSlots()
const safeAction = useTemplateRef('safeAction')

let opener: HTMLElement | null = null

function focusSafeAction(event: Event) {
  opener = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
  event.preventDefault()
  safeAction.value?.$el.focus()
}

function restoreFocus(event: Event, fallback?: () => HTMLElement | null) {
  // Trigger-backed dialogs use Nuxt UI's restoration. Programmatic discard
  // prompts have no DialogTrigger, and their opener may be another closed dialog.
  if (slots.default)
    return
  event.preventDefault()

  const target = opener?.isConnected
    ? opener
    : fallback?.()

  target?.focus()
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :close="false"
    :content="{ onOpenAutoFocus: focusSafeAction, onCloseAutoFocus: (event: Event) => restoreFocus(event, returnFocus) }"
    :ui="{
      overlay: 'bg-neutral-950/50 dark:bg-neutral-950/70',
      content: 'max-w-110 rounded-xl bg-white ring-neutral-200 divide-neutral-200 dark:bg-neutral-700 dark:ring-neutral-600 dark:divide-neutral-600',
      header: 'items-start p-5 sm:p-5',
      wrapper: 'relative min-w-0 pl-14',
      title: 'text-base leading-5 font-semibold text-neutral-950 dark:text-white',
      description: 'mt-1.5 text-sm leading-4.5 text-neutral-700 dark:text-neutral-200',
      footer: 'justify-end gap-4 p-4 sm:p-4',
    }"
  >
    <slot v-if="$slots.default" />

    <template #title>
      <span aria-hidden="true" class="absolute top-0 left-0 flex size-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-950 dark:bg-neutral-600 dark:text-white">
        <UIcon :name="icon" class="size-6" />
      </span>
      {{ title }}
    </template>

    <template #footer>
      <UButton ref="safeAction" color="neutral" variant="soft" size="xl" class="bg-neutral-100 font-medium text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-500 dark:text-neutral-200 dark:hover:bg-neutral-600" @click="open = false">
        {{ cancelLabel ?? 'Cancel' }}
      </UButton>

      <UButton :color="destructive ? 'error' : 'primary'" size="xl" class="font-medium" :class="destructive && 'bg-red-500 text-neutral-0 hover:bg-red-600 dark:bg-red-500 dark:text-neutral-0 dark:hover:bg-red-600'" @click="emit('confirm')">
        {{ confirmLabel }}
      </UButton>
    </template>
  </UModal>
</template>
