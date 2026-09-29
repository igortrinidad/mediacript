import type { DeepReadonly } from 'vue'
import type { AdItem, SavedAd } from '@shared/types'
import { AWARENESS_LABELS, HOOK_LABELS, OFFER_LABELS } from './labels'

const MEDIA_LABELS: Record<AdItem['mediaType'], string> = { video: 'Vídeo', image: 'Imagem', other: 'Outro formato' }

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/d' : `${Math.round(value * 100)}%`
}

/**
 * Plain-text dump of one ad for pasting into another prompt: KPIs, the ad copy
 * and — for saved ads — the analysis and the full transcript (speech for
 * videos, on-screen text for images). Not truncated, unlike the card.
 */
export function formatAdDetails(ad: DeepReadonly<AdItem | SavedAd>, index?: number): string {
  const saved = ad as DeepReadonly<SavedAd>
  const { kpis } = ad
  const isSaved = 'savedAt' in ad

  const facts = [
    kpis.isActive ? 'ativo' : 'inativo',
    kpis.daysRunning !== undefined ? `${kpis.daysRunning} dias no ar` : '',
    kpis.variations ? `${kpis.variations} variações` : '',
    kpis.platforms.length ? `plataformas: ${kpis.platforms.join(', ')}` : '',
    kpis.impressions ? `impressões: ${kpis.impressions}` : '',
    kpis.reach ? `alcance: ${kpis.reach.toLocaleString('pt-BR')}` : '',
    kpis.spend ? `gasto: ${kpis.spend}` : ''
  ].filter(Boolean)

  const analysis = saved.analysis
  const transcriptTitle = ad.mediaType === 'image' ? 'Texto extraído da imagem' : 'Transcrição do vídeo'

  return [
    `${index !== undefined ? `Anúncio ${index + 1}` : 'Anúncio'} — ${ad.pageName} (${MEDIA_LABELS[ad.mediaType]})`,
    `Ad Library: ${ad.libraryUrl}`,
    ad.linkUrl ? `Link de destino: ${ad.linkUrl}` : '',
    `Métricas: ${facts.join(' · ')}`,
    ad.title ? `Título: ${ad.title}` : '',
    ad.ctaText ? `Botão (CTA): ${ad.ctaText}` : '',
    '',
    'Legenda / texto do anúncio:',
    ad.body.trim() || '(sem texto)',
    ...(analysis
      ? [
          '',
          'Análise:',
          `- Hook: ${HOOK_LABELS[analysis.hook]}`,
          `- Consciência: ${Number(analysis.awareness.toFixed(1))} (${AWARENESS_LABELS[Math.min(4, Math.max(0, Math.round(analysis.awareness)))]})`,
          `- Oferta: ${OFFER_LABELS[analysis.offer_type]}`,
          `- CTA claro: ${percent(analysis.clear_cta)}`,
          `- Baixa fricção: ${percent(analysis.friction_low)}`
        ]
      : []),
    ...(ad.mediaType !== 'other' && isSaved
      ? ['', `${transcriptTitle}:`, saved.transcript?.trim() || '(ainda não transcrito)']
      : [])
  ]
    .filter((line, position, all) => line !== '' || all[position - 1] !== '')
    .join('\n')
}

/** Every ad separated by a rule, ready to paste as one block of context. */
export function formatAllAds(ads: DeepReadonly<SavedAd[]>): string {
  return ads.map((ad, index) => formatAdDetails(ad, index)).join('\n\n---\n\n')
}
