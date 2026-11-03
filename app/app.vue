<script setup lang="ts">
const appConfig = useAppConfig()

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
      <NuxtPage />
    </UApp>
  </div>
</template>
