/** Panel catalog + layout persistence for the Analyze page. */

export type AnalyzePanelId =
  | 'placeOverTime'
  | 'finishDistribution'
  | 'seriesStandings'
  | 'pointsAccumulation'
  | 'motoConsistency'
  | 'recentMomentum'
  | 'reliability'
  | 'bikeMake'
  | 'headToHead'
  | 'lastRaceBreakdown'
  | 'gapToNeighbors'
  | 'motoSpread'
  | 'pointsLeftOnTable'
  | 'roundCompare'

export type AnalyzePanelDef = {
  id: AnalyzePanelId
  title: string
  description: string
}

export const ANALYZE_PANEL_CATALOG: AnalyzePanelDef[] = [
  {
    id: 'lastRaceBreakdown',
    title: 'Last race breakdown',
    description: 'Place, points, motos, and field size from your most recent round.',
  },
  {
    id: 'gapToNeighbors',
    title: 'Gap to neighbors',
    description: 'You plus up to two riders ahead and two behind in the standings.',
  },
  {
    id: 'motoSpread',
    title: 'Moto spread',
    description: 'Moto places from your latest race and the spread between them.',
  },
  {
    id: 'pointsLeftOnTable',
    title: 'Points left on table',
    description: 'Your points vs the class winner in the latest round.',
  },
  {
    id: 'roundCompare',
    title: 'Round comparison',
    description: 'Side-by-side place and points for your first two rounds.',
  },
  {
    id: 'placeOverTime',
    title: 'Overall place over time',
    description: 'Your finish place across each round vs class average.',
  },
  {
    id: 'finishDistribution',
    title: 'Finish distribution',
    description: 'How finishes break down across the series for this class.',
  },
  {
    id: 'seriesStandings',
    title: 'Series standings',
    description: 'Class championship table for the selected series.',
  },
  {
    id: 'pointsAccumulation',
    title: 'Points accumulation',
    description: 'Cumulative points vs the class leader.',
  },
  {
    id: 'motoConsistency',
    title: 'Moto consistency',
    description: 'Average moto places across the series.',
  },
  {
    id: 'recentMomentum',
    title: 'Recent Momentum',
    description: 'Form over the last few rounds.',
  },
  {
    id: 'reliability',
    title: 'Reliability / status',
    description: 'DNS, DNF, DSQ counts and finish rate.',
  },
  {
    id: 'bikeMake',
    title: 'Bike make vs class',
    description: 'Your make and podium share by manufacturer.',
  },
  {
    id: 'headToHead',
    title: 'Head-to-head',
    description: 'Round-by-round places vs a rival in class.',
  },
]

/** Default six when the series already has 3+ scored events. */
export const DEFAULT_ANALYZE_PANEL_IDS: AnalyzePanelId[] = [
  'placeOverTime',
  'recentMomentum',
  'headToHead',
  'seriesStandings',
  'pointsAccumulation',
  'motoConsistency',
]

/** Default six when ≤2 events have results — early-series panels first. */
export const EARLY_DEFAULT_ANALYZE_PANEL_IDS: AnalyzePanelId[] = [
  'lastRaceBreakdown',
  'gapToNeighbors',
  'headToHead',
  'pointsLeftOnTable',
  'seriesStandings',
  'roundCompare',
]

const LAYOUT_KEY = 'eventsync.analyzePanelLayout'

export type AnalyzeLayoutBand = 'early' | 'full'

export type AnalyzePanelLayout = {
  order: AnalyzePanelId[]
  collapsed: AnalyzePanelId[]
  /** When true, auto defaults no longer replace the saved order. */
  custom?: boolean
}

type BandedAnalyzePanelLayouts = {
  early?: AnalyzePanelLayout
  full?: AnalyzePanelLayout
}

function isPanelId(value: unknown): value is AnalyzePanelId {
  return typeof value === 'string' && ANALYZE_PANEL_CATALOG.some((panel) => panel.id === value)
}

function sameOrder(a: AnalyzePanelId[], b: AnalyzePanelId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function panelDef(id: AnalyzePanelId): AnalyzePanelDef {
  return ANALYZE_PANEL_CATALOG.find((panel) => panel.id === id)!
}

export function analyzeLayoutBand(eventsRun: number): AnalyzeLayoutBand {
  return eventsRun <= 2 ? 'early' : 'full'
}

export function defaultPanelIdsForEventsRun(eventsRun: number): AnalyzePanelId[] {
  return analyzeLayoutBand(eventsRun) === 'early'
    ? [...EARLY_DEFAULT_ANALYZE_PANEL_IDS]
    : [...DEFAULT_ANALYZE_PANEL_IDS]
}

function normalizeLayout(
  row: Partial<AnalyzePanelLayout> | Record<string, unknown>,
  fallback: AnalyzePanelId[],
): AnalyzePanelLayout {
  const custom = row.custom === true
  let order = Array.isArray(row.order) ? row.order.filter(isPanelId).slice(0, 6) : [...fallback]
  while (order.length < 6) {
    const pool = [...EARLY_DEFAULT_ANALYZE_PANEL_IDS, ...DEFAULT_ANALYZE_PANEL_IDS]
    const next = pool.find((id) => !order.includes(id))
    if (!next) break
    order.push(next)
  }
  order = order.slice(0, 6)
  if (!custom) {
    const looksLikeStock =
      sameOrder(order, DEFAULT_ANALYZE_PANEL_IDS) ||
      sameOrder(order, EARLY_DEFAULT_ANALYZE_PANEL_IDS)
    if (looksLikeStock || order.length === 0) {
      order = fallback
    }
  }
  const collapsed = Array.isArray(row.collapsed) ? row.collapsed.filter(isPanelId) : []
  return { order, collapsed, custom }
}

function readStoredLayouts(): BandedAnalyzePanelLayouts {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const row = parsed as Record<string, unknown>

    // Legacy flat { order, collapsed, custom } → keep under `full` (prior default set).
    if (Array.isArray(row.order) && row.early == null && row.full == null) {
      const legacy = normalizeLayout(row, [...DEFAULT_ANALYZE_PANEL_IDS])
      const migrated: BandedAnalyzePanelLayouts = {
        early: {
          order: [...EARLY_DEFAULT_ANALYZE_PANEL_IDS],
          collapsed: [],
          custom: false,
        },
        full: legacy,
      }
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(migrated))
      return migrated
    }

    const out: BandedAnalyzePanelLayouts = {}
    if (row.early && typeof row.early === 'object') {
      out.early = row.early as AnalyzePanelLayout
    }
    if (row.full && typeof row.full === 'object') {
      out.full = row.full as AnalyzePanelLayout
    }
    return out
  } catch {
    return {}
  }
}

export function loadAnalyzePanelLayout(
  eventsRun = Number.POSITIVE_INFINITY,
): AnalyzePanelLayout {
  const band = analyzeLayoutBand(eventsRun)
  const fallback = defaultPanelIdsForEventsRun(eventsRun)
  const stored = readStoredLayouts()[band]
  if (!stored) return { order: fallback, collapsed: [], custom: false }
  return normalizeLayout(stored, fallback)
}

export function saveAnalyzePanelLayout(layout: AnalyzePanelLayout, eventsRun: number) {
  const band = analyzeLayoutBand(eventsRun)
  const existing = readStoredLayouts()
  const next: BandedAnalyzePanelLayouts = {
    early: existing.early,
    full: existing.full,
    [band]: layout,
  }
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(next))
}

export function unusedPanelIds(order: AnalyzePanelId[]): AnalyzePanelId[] {
  return ANALYZE_PANEL_CATALOG.map((panel) => panel.id).filter((id) => !order.includes(id))
}
