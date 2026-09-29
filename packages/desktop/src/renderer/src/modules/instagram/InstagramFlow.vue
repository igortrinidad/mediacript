<script setup lang="ts">
import { ref } from 'vue'
import IgProjectsList from './IgProjectsList.vue'
import IgProjectView from './IgProjectView.vue'

const projectId = ref<string | null>(null)
</script>

<template>
  <div class="ig-flow">
    <IgProjectView v-if="projectId" :key="projectId" :project-id="projectId" @back="projectId = null" />
    <IgProjectsList v-else @open="projectId = $event" />
  </div>
</template>
