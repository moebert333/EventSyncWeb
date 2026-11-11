import { useMemo, useState } from 'react'
import { AnalyzeAiSection } from '../components/analyze/AnalyzeAiSection'
import { AnalyzeContextHeader } from '../components/analyze/AnalyzeContextHeader'
import { AnalyzePanelBoard } from '../components/analyze/AnalyzePanelBoard'
import { Skeleton } from '../components/Skeleton'
import { useEventCode } from '../hooks/useEventCode'
import { useOrgSeries } from '../hooks/useEventResults'
import { useSeriesAnalyzeData } from '../hooks/useSeriesAnalyzeData'
import {
  buildAnalyzeSnapshot,
  riderClassNamesFor,
  snapshotForAi,
} from '../lib/analyzeMetrics'
import { riderName } from '../lib/format'

export function AnalyzePage() {
  const { context, selectedParticipant } = useEventCode()
  const seriesQuery = useOrgSeries(context?.organizationId ?? null)
  const [seriesOverride, setSeriesOverride] = useState<number | null>(null)
  const [classOverride, setClassOverride] = useState<string | null>(null)

  const effectiveSeriesId = useMemo(() => {
    const list = seriesQuery.data ?? []
    if (seriesOverride != null && list.some((series) => series.series_id === seriesOverride)) {
      return seriesOverride
    }
    if (context?.seriesId != null && list.some((series) => series.series_id === context.seriesId)) {
      return context.seriesId
    }
    return context?.seriesId ?? list[0]?.series_id ?? null
  }, [seriesOverride, seriesQuery.data, context?.seriesId])

  const analyzeQuery = useSeriesAnalyzeData(effectiveSeriesId)
  const seriesName =
    (seriesQuery.data ?? []).find((series) => series.series_id === effectiveSeriesId)?.name ??
    context?.seriesName ??
    'Series'

  const participantId = selectedParticipant?.participantId ?? null
  const rows = analyzeQuery.data?.rows ?? []
  const riderClassNames = useMemo(
    () => riderClassNamesFor(rows, participantId),
    [rows, participantId],
  )

  const effectiveClassName = useMemo(() => {
    if (classOverride && riderClassNames.includes(classOverride)) return classOverride
    return riderClassNames[0] ?? null
  }, [classOverride, riderClassNames])

  const snapshot = useMemo(() => {
    if (!analyzeQuery.data) {
      return buildAnalyzeSnapshot([], [], participantId, effectiveClassName)
    }
    return buildAnalyzeSnapshot(
      analyzeQuery.data.events,
      analyzeQuery.data.rows,
      participantId,
      effectiveClassName,
    )
  }, [analyzeQuery.data, participantId, effectiveClassName])

  const riderLabel = selectedParticipant
    ? riderName(selectedParticipant.firstName, selectedParticipant.lastName)
    : 'Rider'

  const aiData = useMemo(
    () =>
      snapshotForAi(
        snapshot,
        seriesName,
        riderLabel,
        analyzeQuery.data?.events ?? [],
        analyzeQuery.data?.rows ?? [],
      ),
    [snapshot, seriesName, riderLabel, analyzeQuery.data?.events, analyzeQuery.data?.rows],
  )

  const loading = seriesQuery.isLoading || analyzeQuery.isLoading
  const error = seriesQuery.error ?? analyzeQuery.error

  return (
    <div className="space-y-4">
      <AnalyzeContextHeader
        seriesList={seriesQuery.data ?? []}
        seriesId={effectiveSeriesId}
        onSeriesChange={(id) => {
          setSeriesOverride(id)
          setClassOverride(null)
        }}
        riders={analyzeQuery.data?.riders ?? []}
        riderClassNames={riderClassNames}
        className={effectiveClassName}
        onClassChange={setClassOverride}
        summary={snapshot.summary}
        seriesName={seriesName}
      />

      {error ? (
        <p className="text-sm text-red-400">
          {error instanceof Error ? error.message : 'Failed to load series results'}
        </p>
      ) : null}

      {loading ? (
        <Skeleton rows={8} />
      ) : (
        <>
          <AnalyzeAiSection
            data={aiData}
            enabled={(analyzeQuery.data?.rows.length ?? 0) > 0}
            earlySeries={snapshot.summary.eventsRun <= 2}
          />
          {participantId == null ? (
            <p className="text-sm text-zinc-400">Select a rider to populate analysis panels.</p>
          ) : (
            <AnalyzePanelBoard
              snapshot={snapshot}
              rows={rows}
              focusClassName={effectiveClassName}
            />
          )}
        </>
      )}
    </div>
  )
}
