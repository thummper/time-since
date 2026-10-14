<script setup lang="ts">
import { useRoute } from 'vue-router'
import AuthForm from '../components/AuthForm.vue'

const route = useRoute()
</script>

<template>
  <section class="mx-auto max-w-sm space-y-4 pt-6">
    <h1 class="text-2xl font-bold">Sign up</h1>
    <AuthForm mode="register" />
    <p class="text-center text-sm text-muted">
      Already have an account?
      <RouterLink :to="{ name: 'login', query: route.query }">Log in</RouterLink>
    </p>
  </section>
</template>
