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

export type AnalyzePanelDef = {
  id: AnalyzePanelId
  title: string
  description: string
}

export const ANALYZE_PANEL_CATALOG: AnalyzePanelDef[] = [
  {
    id: 'placeOverTime',
    title: 'Overall place over time',
    description: 'Your finish place across each round vs class average.',
  },
  {
    id: 'finishDistribution',
    title: 'Finish distribution',
    description: 'Wins, podiums, and finishes outside the top 3.',
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

export const DEFAULT_ANALYZE_PANEL_IDS: AnalyzePanelId[] = [
  'placeOverTime',
  'finishDistribution',
  'seriesStandings',
  'pointsAccumulation',
  'motoConsistency',
  'recentMomentum',
]

const LAYOUT_KEY = 'eventsync.analyzePanelLayout'

export type AnalyzePanelLayout = {
  order: AnalyzePanelId[]
  collapsed: AnalyzePanelId[]
}

function isPanelId(value: unknown): value is AnalyzePanelId {
  return typeof value === 'string' && ANALYZE_PANEL_CATALOG.some((panel) => panel.id === value)
}

export function panelDef(id: AnalyzePanelId): AnalyzePanelDef {
  return ANALYZE_PANEL_CATALOG.find((panel) => panel.id === id)!
}

export function loadAnalyzePanelLayout(): AnalyzePanelLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return { order: [...DEFAULT_ANALYZE_PANEL_IDS], collapsed: [] }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return { order: [...DEFAULT_ANALYZE_PANEL_IDS], collapsed: [] }
    }
    const row = parsed as Record<string, unknown>
    const order = Array.isArray(row.order)
      ? row.order.filter(isPanelId).slice(0, 6)
      : [...DEFAULT_ANALYZE_PANEL_IDS]
    while (order.length < 6) {
      const next = DEFAULT_ANALYZE_PANEL_IDS.find((id) => !order.includes(id))
      if (!next) break
      order.push(next)
    }
    const collapsed = Array.isArray(row.collapsed) ? row.collapsed.filter(isPanelId) : []
    return { order: order.slice(0, 6), collapsed }
  } catch {
    return { order: [...DEFAULT_ANALYZE_PANEL_IDS], collapsed: [] }
  }
}

export function saveAnalyzePanelLayout(layout: AnalyzePanelLayout) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
}

export function unusedPanelIds(order: AnalyzePanelId[]): AnalyzePanelId[] {
  return ANALYZE_PANEL_CATALOG.map((panel) => panel.id).filter((id) => !order.includes(id))
}
