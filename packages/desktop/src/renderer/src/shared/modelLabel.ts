import type { AIProviderOption } from '@shared/types'

function formatUsd(value: number): string {
  // 0.075 stays "0.075"; 10 becomes "10.00" — always at least two decimals so columns of prices line up.
  const text = String(value)
  return text.includes('.') && text.split('.')[1].length >= 2 ? text : value.toFixed(2)
}

/**
 * Text for a model `<option>`: the id followed by its list price per 1M tokens,
 * e.g. `gpt-6-luna — $0.10 in · $0.50 out /1M`. Models without a published
 * price (custom ids, "contact sales" tiers) show the bare id.
 */
export function modelOptionLabel(model: string, pricing?: AIProviderOption['pricing'] | Readonly<AIProviderOption['pricing']>): string {
  const price = pricing?.[model]
  if (!price) return model

  const note = price.note ? ` (${price.note})` : ''
  return `${model} — $${formatUsd(price.input)} in · $${formatUsd(price.output)} out /1M${note}`
}
