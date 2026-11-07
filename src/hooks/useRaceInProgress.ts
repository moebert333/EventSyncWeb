import { useQuery } from '@tanstack/react-query'
import { useSimulationOptional } from '../lib/simulationContext'
import { supabase } from '../lib/supabase'
import type { ActiveRaceTiming, RaceClassName, RaceInProgress, RaceStatus } from '../types/database'

/** Statuses that still poll for live updates. */
const LIVE: RaceStatus[] = ['Staging', 'Active', 'Paused']
const RACE_COLUMNS =
  'race_num, race_id, event_id, series_id, event_name, session_name, race_name, is_practice, race_date, race_start, description, elapsed_race_time, status'
const TIMING_COLUMNS =
  'event_id, event_name, race_id, race_num, is_practice, race_name, session_name, class_id, class_name, place_num, current_lap_num, status, participant_id, participant_plate, first_name, last_name, current_lap_time, best_lap_num, best_lap_time, race_elapsed_time, leader_gap_time, next_gap_time'

function isLive(status: RaceStatus | null | undefined): boolean {
  return status != null && LIVE.includes(status)
}

export function useRaceInProgress(eventId: number | null) {
  const simulation = useSimulationOptional()
  const simulating = Boolean(simulation?.isActive && simulation.eventId === eventId)

  const query = useQuery({
    queryKey: ['race-in-progress', eventId],
    enabled: eventId != null && !simulating,
    queryFn: async (): Promise<RaceInProgress | null> => {
      const { data, error } = await supabase
        .from('race_in_progress')
        .select(RACE_COLUMNS)
        .eq('event_id', eventId!)
        .limit(1)
      if (error) throw error
      const row = data?.[0] as RaceInProgress | undefined
      if (!row) return null
      return { ...row, is_practice: Boolean(row.is_practice) }
    },
    // Always poll while an event is selected: empty → pick up a newly active race;
    // Finished → pick up the next Staging/Active race; live → keep header/status fresh.
    refetchInterval: simulating ? false : 2500,
  })

  if (simulating && simulation) {
    return {
      ...query,
      data: simulation.raceInProgress,
      error: null,
      isError: false,
      isLoading: false,
      isPending: false,
      isSuccess: true,
      status: 'success' as const,
      isFetching: false,
      isFetched: true,
      fetchStatus: 'idle' as const,
    }
  }
  return query
}

export function useLiveTiming(race: RaceInProgress | null | undefined) {
  const simulation = useSimulationOptional()
  const simulating = Boolean(
    simulation?.isActive &&
      race != null &&
      simulation.eventId === race.event_id &&
      simulation.raceInProgress?.race_id === race.race_id,
  )
  const live = isLive(race?.status)

  const query = useQuery({
    queryKey: ['active-race-timing', race?.race_id],
    // Fetch whenever the race is shown, including Finished (timing rows remain).
    enabled: race != null && !simulating,
    queryFn: async (): Promise<ActiveRaceTiming[]> => {
      const { data, error } = await supabase
        .from('active_race_timing')
        .select(TIMING_COLUMNS)
        .eq('race_id', race!.race_id)
        .eq('event_id', race!.event_id)
      if (error) throw error
      return ((data ?? []) as ActiveRaceTiming[]).map((row) => ({
        ...row,
        is_practice: Boolean(row.is_practice),
      }))
    },
    refetchInterval: simulating ? false : live ? 2500 : false,
  })

  if (simulating && simulation) {
    return {
      ...query,
      data: simulation.timingRows,
      error: null,
      isError: false,
      isLoading: false,
      isPending: false,
      isSuccess: true,
      status: 'success' as const,
      isFetching: false,
      isFetched: true,
      fetchStatus: 'idle' as const,
    }
  }
  return query
}

export function useRaceClassNames(raceId: number | null, live: boolean) {
  return useQuery({
    queryKey: ['race-class-names', raceId],
    enabled: raceId != null,
    queryFn: async (): Promise<RaceClassName[]> => {
      const { data, error } = await supabase
        .from('race_class_names')
        .select('class_id, class_name, race_id')
        .eq('race_id', raceId!)
      if (error) throw error
      return (data ?? []) as RaceClassName[]
    },
    refetchInterval: live ? 2500 : false,
  })
}
