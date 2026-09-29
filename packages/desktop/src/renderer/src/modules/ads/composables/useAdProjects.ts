import { reactive, readonly } from 'vue'
import type { AdProjectSummary } from '@shared/types'

const state = reactive({
  projects: [] as AdProjectSummary[],
  loaded: false
})

async function load(): Promise<void> {
  state.projects = await window.api.ads.listProjects()
  state.loaded = true
}

async function create(name: string, description?: string): Promise<string> {
  const project = await window.api.ads.createProject({ name, description })
  await load()
  return project.id
}

async function remove(id: string): Promise<void> {
  await window.api.ads.deleteProject(id, true)
  await load()
}

export function useAdProjects() {
  return { state: readonly(state), load, create, remove }
}
