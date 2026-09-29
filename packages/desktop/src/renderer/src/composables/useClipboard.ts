import { ref } from 'vue'

/**
 * Copies text to the clipboard and tracks which item was last copied (by an
 * arbitrary caller-supplied key), so a component can show brief "Copiado!"
 * feedback next to the specific element that was copied.
 */
export function useClipboard(feedbackMs = 1500) {
  const copiedKey = ref<string | null>(null)

  async function copy(key: string, text: string): Promise<void> {
    try {
      // Through the main process: the browser clipboard API is blocked by the app's permission handler.
      await window.api.clipboard.writeText(text)
      copiedKey.value = key
      setTimeout(() => {
        if (copiedKey.value === key) copiedKey.value = null
      }, feedbackMs)
    } catch (error) {
      // Never fail silently — a button that does nothing looks broken. The error text is
      // still manually selectable as a fallback (see the `user-select` override on error elements).
      console.error('Falha ao copiar para a área de transferência:', error)
    }
  }

  return { copiedKey, copy }
}
