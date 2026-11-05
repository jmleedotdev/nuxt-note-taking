<script setup lang="ts">
const appConfig = useAppConfig()
const demo = useDemo()

useHead({
  titleTemplate: title => title
    ? `${title} | ${appConfig.name}`
    : appConfig.name,
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />

    <UApp>
      <DemoNotice v-if="demo" />

      <NuxtPage />
    </UApp>
  </div>
</template>
