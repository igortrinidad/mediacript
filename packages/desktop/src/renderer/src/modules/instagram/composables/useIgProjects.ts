import { reactive, readonly } from 'vue'
import type { IgProjectSummary } from '@shared/types'

const state = reactive({
  projects: [] as IgProjectSummary[],
  loaded: false
})

async function load(): Promise<void> {
  state.projects = await window.api.instagram.listProjects()
  state.loaded = true
}

async function create(username: string, limit: number, description?: string): Promise<string> {
  const project = await window.api.instagram.createProject({ username, limit, description })
  await load()
  return project.id
}

async function remove(id: string): Promise<void> {
  await window.api.instagram.deleteProject(id, true)
  await load()
}

export function useIgProjects() {
  return { state: readonly(state), load, create, remove }
}
