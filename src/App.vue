<template>
  <PageTransition />
  <MainLayout />
  <ToastNotification />
  <ConfirmDialog />
</template>

<script setup>
import MainLayout from './layouts/MainLayout.vue'
import PageTransition from './components/PageTransition.vue'
import ToastNotification from './components/ToastNotification.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
</script>
