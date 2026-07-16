<template>
  <PageTransition />
  <template v-if="$route.path === '/login' || $route.path === '/change-password'">
    <router-view />
  </template>
  <template v-else>
    <MainLayout />
  </template>
  <ToastNotification />
  <ConfirmDialog />
</template>

<script setup>
import MainLayout from './layouts/MainLayout.vue'
import PageTransition from './components/PageTransition.vue'
import ToastNotification from './components/ToastNotification.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
</script>
