<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAdProjects } from './composables/useAdProjects'

const emit = defineEmits<{
  open: [id: string]
}>()

const { state, load, create, remove } = useAdProjects()

const creating = ref(false)
const name = ref('')
const description = ref('')
const confirmingId = ref<string | null>(null)
const error = ref('')

onMounted(() => void load())

async function submit(): Promise<void> {
  error.value = ''
  try {
    const id = await create(name.value, description.value)
    name.value = ''
    description.value = ''
    creating.value = false
    emit('open', id)
  } catch (err: any) {
    error.value = err?.message || 'Não foi possível criar o projeto'
  }
}

async function confirmRemove(id: string): Promise<void> {
  confirmingId.value = null
  await remove(id)
}
</script>

<template>
  <div class="projects">
    <header class="head">
      <h2>🏆 Analisador de ads vencedores</h2>
      <p class="hint">
        Crie um projeto, salve os anúncios da Meta Ad Library que você gostou e rode a análise de hook, consciência,
        oferta e CTA em cada um.
      </p>
    </header>

    <form v-if="creating" class="card create-form" @submit.prevent="submit">
      <label for="project-name">Nome do projeto</label>
      <input id="project-name" v-model="name" type="text" placeholder="Ex.: Ads de infoproduto — concorrentes" autofocus />
      <label for="project-desc">Descrição (opcional)</label>
      <input id="project-desc" v-model="description" type="text" placeholder="Nicho, objetivo, o que você procura" />
      <div class="row">
        <button class="btn btn-primary" type="submit" :disabled="!name.trim()">Criar projeto</button>
        <button class="btn btn-ghost" type="button" @click="creating = false">Cancelar</button>
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
    </form>
    <button v-else class="btn btn-primary new-btn" type="button" @click="creating = true">+ Novo projeto</button>

    <p v-if="state.loaded && !state.projects.length && !creating" class="hint center">Nenhum projeto ainda.</p>

    <ul class="list">
      <li v-for="project in state.projects" :key="project.id" class="item">
        <button class="item-main" type="button" @click="emit('open', project.id)">
          <span class="item-title">{{ project.name }}</span>
          <span v-if="project.description" class="item-meta">{{ project.description }}</span>
          <span class="item-meta">
            {{ project.adsCount }} anúncio(s) · {{ project.analyzedCount }} analisado(s) · atualizado em
            {{ new Date(project.updatedAt).toLocaleDateString('pt-BR') }}
          </span>
        </button>

        <template v-if="confirmingId === project.id">
          <button class="btn btn-danger small" type="button" @click="confirmRemove(project.id)">Excluir tudo</button>
          <button class="btn btn-ghost small" type="button" @click="confirmingId = null">Voltar</button>
        </template>
        <button v-else class="btn btn-ghost small" type="button" @click="confirmingId = project.id">✕</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.projects {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head h2 {
  font-size: 18px;
  margin: 0 0 4px;
}

.hint {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.center {
  text-align: center;
}

.new-btn {
  align-self: flex-start;
}

.create-form {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 10px;
  padding: 4px 8px 4px 4px;
}

.item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  border: none;
  background: none;
  color: var(--text);
  padding: 8px 10px;
}

.item-title {
  font-weight: 600;
  font-size: 13px;
}

.item-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.small {
  font-size: 11px;
  padding: 5px 8px;
}

.btn-danger {
  border: 1px solid var(--danger);
  background: var(--danger);
  color: white;
}

.error-text {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
}
</style>
