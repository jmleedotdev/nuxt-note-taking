export default defineNuxtPlugin(() => {
  // Only the mode is serialized; database and authentication settings stay private.
  useDemo().value = process.env.APP_ENV === 'demo'
})
