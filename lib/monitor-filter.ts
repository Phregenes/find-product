import type { Product } from '@/lib/product'

/** How strictly listing titles must match the monitor query. */
export type MonitorFilterMode = 'default' | 'all_words' | 'phrase' | 'smart'

export interface MonitorFilterConfig {
  filter_mode: MonitorFilterMode
  exclude_terms: string[]
}

export const FILTER_MODE_OPTIONS: Array<{
  id: MonitorFilterMode
  label: string
  description: string
  hint: string
}> = [
  {
    id: 'default',
    label: 'Padrão',
    description: 'Igual ao Mercado Livre — máximo de resultados.',
    hint: 'Sem pós-filtro. Use quando quiser ver tudo que o ML retorna.',
  },
  {
    id: 'all_words',
    label: 'Todas as palavras',
    description: 'Cada termo da busca precisa aparecer no título.',
    hint: 'Estilo eBay AND: "camera contax" exige "camera" e "contax" no título.',
  },
  {
    id: 'phrase',
    label: 'Frase exata',
    description: 'A busca inteira aparece no título, em sequência.',
    hint: 'Estilo eBay com aspas: só passa se o título tiver a frase completa.',
  },
  {
    id: 'smart',
    label: 'Inteligente',
    description: 'Sinônimos + bloqueio de acessórios comuns.',
    hint: '"camera contax" aceita "máquina fotográfica contax" e remove bolsas/cases.',
  },
]

const STOPWORDS = new Set([
  'a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'um', 'uma', 'para', 'com', 'por', 'ao', 'aos', 'à', 'às',
])

const CONCEPT_GROUPS: string[][] = [
  ['camera', 'cameras', 'maquina fotografica', 'maquinas fotograficas', 'maquina foto', 'maq fotografica'],
  ['celular', 'celulares', 'smartphone', 'smartphones', 'telefone celular'],
  ['notebook', 'laptops', 'laptop', 'computador portatil'],
  ['fone', 'fones', 'headphone', 'headphones', 'earbud', 'earbuds', 'fone de ouvido'],
  ['tenis', 'tenis esportivo', 'sneaker', 'sneakers'],
  ['bike', 'bicicleta', 'bicicletas', 'bicycle'],
  ['relogio', 'relogios', 'smartwatch', 'smart watch'],
]

const DEFAULT_ACCESSORY_TERMS = [
  'bolsa', 'case', 'capa', 'alça', 'alca', 'strap', 'pulseira', 'cinto',
  'estojo', 'maleta', 'mochila', 'suporte', 'tripé', 'tripe', 'tripod',
  'adaptador', 'cabo', 'carregador', 'película', 'pelicula', 'protetor',
  'tampa', 'tampinha', 'parafuso', 'parafusos', 'kit', 'acessório', 'acessorio',
  'acessorios', 'acessórios', 'refil', 'reposição', 'reposicao',
]

export function normalizeFilterText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeText(value: string): string {
  return normalizeFilterText(value)
}

export function parseQueryTerms(query: string): string[] {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean)
  const seen = new Set<string>()
  const terms: string[] = []

  for (const token of tokens) {
    if (token.length < 2 || STOPWORDS.has(token) || seen.has(token)) continue
    seen.add(token)
    terms.push(token)
  }
  return terms
}

export function parseExcludeTermsInput(input: string): string[] {
  return [...new Set(
    input
      .split(/[,;\n]+/)
      .map((t) => normalizeText(t.trim()))
      .filter((t) => t.length >= 2),
  )]
}

export function parseFilterMode(value: unknown): MonitorFilterMode {
  if (value === 'all_words' || value === 'phrase' || value === 'smart') return value
  return 'default'
}

export function filterModeLabel(mode: MonitorFilterMode): string {
  return FILTER_MODE_OPTIONS.find((o) => o.id === mode)?.label ?? 'Padrão'
}

function findConceptGroupForTerm(term: string): string[] | null {
  const norm = normalizeText(term)
  for (const group of CONCEPT_GROUPS) {
    if (group.includes(norm)) return group
  }
  return null
}

function parseQueryRequirements(query: string): string[][] {
  let remaining = ` ${normalizeText(query)} `
  const requirements: string[][] = []

  const phrases = CONCEPT_GROUPS.flat()
    .filter((p) => p.includes(' '))
    .sort((a, b) => b.length - a.length)

  for (const phrase of phrases) {
    if (!remaining.includes(phrase)) continue
    const group = CONCEPT_GROUPS.find((g) => g.includes(phrase))
    if (!group) continue
    requirements.push(group)
    remaining = remaining.split(phrase).join(' ')
  }

  for (const token of remaining.split(/\s+/).filter(Boolean)) {
    if (token.length < 2 || STOPWORDS.has(token)) continue
    const group = findConceptGroupForTerm(token)
    const alts = group ?? [token]
    const alreadyCovered = requirements.some(
      (req) => req === group || req.includes(token),
    )
    if (!alreadyCovered) requirements.push(alts)
  }

  return requirements
}

function titleContainsTerm(titleNorm: string, term: string): boolean {
  if (titleNorm.includes(term)) return true
  if (term.length >= 4 && titleNorm.includes(term.slice(0, -1))) return true
  return false
}

function titleMatchesAlternative(titleNorm: string, alternative: string): boolean {
  if (alternative.includes(' ')) return titleNorm.includes(alternative)
  return titleContainsTerm(titleNorm, alternative)
}

function titleMatchesRequirement(titleNorm: string, alternatives: string[]): boolean {
  return alternatives.some((alt) => titleMatchesAlternative(titleNorm, alt))
}

function buildBlocklist(queryNorm: string, excludeTerms: string[], smartAccessories: boolean): string[] {
  const userExcludes = excludeTerms.map((t) => normalizeText(t)).filter(Boolean)
  if (!smartAccessories) return [...new Set(userExcludes)]
  const accessoryTerms = DEFAULT_ACCESSORY_TERMS.filter((term) => !queryNorm.includes(term))
  return [...new Set([...accessoryTerms, ...userExcludes])]
}

function passesBlocklist(titleNorm: string, blocklist: string[]): boolean {
  for (const term of blocklist) {
    if (titleMatchesAlternative(titleNorm, term)) return false
  }
  return true
}

function matchesAllWords(titleNorm: string, query: string): boolean {
  const terms = parseQueryTerms(query)
  if (terms.length === 0) return true
  return terms.every((term) => titleContainsTerm(titleNorm, term))
}

function matchesPhrase(titleNorm: string, query: string): boolean {
  const phrase = normalizeText(query)
  if (phrase.length < 2) return true
  return titleNorm.includes(phrase)
}

function matchesSmart(titleNorm: string, query: string): boolean {
  const requirements = parseQueryRequirements(query)
  if (requirements.length === 0) return true
  return requirements.every((alts) => titleMatchesRequirement(titleNorm, alts))
}

export function productMatchesMonitorFilter(
  product: Product,
  query: string,
  config: MonitorFilterConfig,
): boolean {
  const mode = config.filter_mode
  const titleNorm = normalizeText(product.title)
  const queryNorm = normalizeText(query)
  const blocklist = buildBlocklist(
    queryNorm,
    config.exclude_terms,
    mode === 'smart',
  )

  if (!passesBlocklist(titleNorm, blocklist)) return false
  if (mode === 'default') return true
  if (mode === 'all_words') return matchesAllWords(titleNorm, query)
  if (mode === 'phrase') return matchesPhrase(titleNorm, query)
  return matchesSmart(titleNorm, query)
}

export function filterProductsByMonitor(
  products: Product[],
  query: string,
  config: MonitorFilterConfig,
): Product[] {
  if (config.filter_mode === 'default' && config.exclude_terms.length === 0) {
    return products
  }
  return products.filter((p) => productMatchesMonitorFilter(p, query, config))
}

/** @deprecated use productMatchesMonitorFilter */
export function productMatchesStrictFilter(
  product: Product,
  query: string,
  config: MonitorFilterConfig,
): boolean {
  return productMatchesMonitorFilter(product, query, config)
}
