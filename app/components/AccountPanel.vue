<script setup lang="ts">
const appConfig = useAppConfig()
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center bg-neutral-100 px-4 py-8 font-sans text-neutral-950 dark:bg-neutral-950 dark:text-neutral-0">
    <section class="w-full max-w-135 rounded-xl border border-neutral-200 bg-neutral-0 px-4 py-12 shadow-sm sm:px-12 dark:border-neutral-700 dark:bg-neutral-800">
      <AppLogo
        role="img"
        :aria-label="appConfig.name"
        class="mx-auto mb-6 text-neutral-950 dark:text-white"
      />

      <slot />
    </section>
  </main>
</template>
