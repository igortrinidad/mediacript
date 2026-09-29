import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js'

/**
 * models: https://platform.openai.com/docs/models
 * pricing: https://openai.com/api/pricing
 */
export class OpenAIProvider extends OpenAICompatibleProvider {
  protected get baseURL(): string {
    return 'https://api.openai.com/v1'
  }

  /**
   * Reasoning-era models (everything after the gpt-4 family: gpt-5+, gpt-6-*, o-series) reject
   * `max_tokens` in favor of `max_completion_tokens` and only accept the default temperature,
   * so both are adapted here. The gpt-4 family keeps the classic parameters.
   */
  protected buildRequestBody(): Record<string, unknown> {
    if (/^gpt-4/.test(this.model)) return super.buildRequestBody()

    return {
      model: this.model,
      max_completion_tokens: this.maxTokens,
      messages: this.messages.map((message) => ({ role: message.role, content: message.content }))
    }
  }

  protected get authHeaders(): Record<string, string> {
    return { 'Authorization': `Bearer ${this.apiKey}` }
  }
}
