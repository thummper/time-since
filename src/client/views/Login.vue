<script setup lang="ts">
import { useRoute } from 'vue-router'
import AuthForm from '../components/AuthForm.vue'

const route = useRoute()
</script>

<template>
  <section class="mx-auto max-w-sm space-y-4 pt-6">
    <h1 class="text-2xl font-bold">Log in</h1>
    <AuthForm mode="login" />
    <p class="text-center text-sm text-muted">
      No account?
      <RouterLink :to="{ name: 'register', query: route.query }">Sign up</RouterLink>
    </p>
  </section>
</template>
