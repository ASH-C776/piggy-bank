<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import { useWsStore } from './stores/ws';
import ToastHost from './components/ToastHost.vue';

const ws = useWsStore();
onMounted(() => ws.connect());
onUnmounted(() => ws.disconnect());
</script>

<template>
  <RouterView />
  <ToastHost />
</template>
