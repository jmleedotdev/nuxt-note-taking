<script setup lang="ts">
defineProps<{ compact?: boolean }>()

const emit = defineEmits<{ reselect: [] }>()
const route = useRoute()
const router = useRouter()

function activate(tag: string) {
  // Same-URL links do not trigger the page's route watcher. No editor is left here.
  if (route.fullPath === router.resolve({
    path: '/',
    query: { tag },
  }).fullPath) {
    emit('reselect')
  }
}

const notes = useNotes()
const { data, status, error, refresh } = await useAsyncData('note-tags', () => notes.tags())
</script>

<template>
  <nav aria-label="Saved tags">
    <p v-if="status === 'pending'" role="status" class="p-3 text-sm">
      Loading tags…
    </p>

    <div v-else-if="error" role="alert" class="space-y-2 p-3 text-sm">
      <p>We could not load your tags.</p>

      <UButton color="neutral" variant="outline" @click="refresh()">
        Try again
      </UButton>
    </div>

    <p v-else-if="!data?.tags.length" class="p-3 text-sm text-neutral-600 dark:text-neutral-400">
      Tags from your saved notes will appear here.
    </p>

    <ul v-else :class="compact ? 'space-y-1' : 'divide-y divide-neutral-200 dark:divide-neutral-800'">
      <li v-for="tag in data.tags" :key="tag">
        <UButton :to="{ path: '/', query: { tag } }" :aria-label="`Tag: ${tag}`" :aria-current="route.query.tag === tag ? 'page' : undefined" icon="i-app-tag" color="neutral" variant="ghost" block class="justify-start text-left" :class="[compact ? 'px-3 py-2.5' : 'px-0 py-4', route.query.tag === tag && 'bg-neutral-100 dark:bg-neutral-800']" @click="activate(tag)">
          <span class="min-w-0 flex-1 wrap-anywhere">{{ tag }}</span>

          <UIcon v-if="route.query.tag === tag" name="i-app-chevron-right" class="size-4 shrink-0" />
        </UButton>
      </li>
    </ul>
  </nav>
</template>
