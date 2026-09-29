<script setup lang="ts">
import { ref } from 'vue'
import AdsProjectsList from './AdsProjectsList.vue'
import AdsProjectView from './AdsProjectView.vue'

const projectId = ref<string | null>(null)
</script>

<template>
  <div class="ads-flow">
    <AdsProjectView v-if="projectId" :key="projectId" :project-id="projectId" @back="projectId = null" />
    <AdsProjectsList v-else @open="projectId = $event" />
  </div>
</template>
