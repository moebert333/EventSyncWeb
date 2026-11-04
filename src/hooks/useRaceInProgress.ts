import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ActiveRaceTiming, RaceClassName, RaceInProgress, RaceStatus } from '../types/database'

/** Statuses that still poll for live updates. */
const LIVE: RaceStatus[] = ['Staging', 'Active', 'Paused']
const RACE_COLUMNS =
  'race_num, race_id, event_id, series_id, event_name, session_name, race_date, race_start, description, elapsed_race_time, status'
const TIMING_COLUMNS =
  'event_id, event_name, race_id, race_num, session_name, class_id, class_name, place_num, current_lap_num, status, participant_id, participant_plate, first_name, last_name, current_lap_time, best_lap_num, best_lap_time, race_elapsed_time, leader_gap_time, next_gap_time'

function isLive(status: RaceStatus | null | undefined): boolean {
  return status != null && LIVE.includes(status)
}

export function useRaceInProgress(eventId: number | null) {
  return useQuery({
    queryKey: ['race-in-progress', eventId],
    enabled: eventId != null,
    queryFn: async (): Promise<RaceInProgress | null> => {
      const { data, error } = await supabase
        .from('race_in_progress')
        .select(RACE_COLUMNS)
        .eq('event_id', eventId!)
        .limit(1)
      if (error) throw error
      return (data?.[0] ?? null) as RaceInProgress | null
    },
    // Always poll while an event is selected: empty → pick up a newly active race;
    // Finished → pick up the next Staging/Active race; live → keep header/status fresh.
    refetchInterval: 2500,
  })
}

export function useLiveTiming(race: RaceInProgress | null | undefined) {
  const live = isLive(race?.status)
  return useQuery({
    queryKey: ['active-race-timing', race?.race_id],
    // Fetch whenever the race is shown, including Finished (timing rows remain).
    enabled: race != null,
    queryFn: async (): Promise<ActiveRaceTiming[]> => {
      const { data, error } = await supabase
        .from('active_race_timing')
        .select(TIMING_COLUMNS)
        .eq('race_id', race!.race_id)
        .eq('event_id', race!.event_id)
      if (error) throw error
      return (data ?? []) as ActiveRaceTiming[]
    },
    refetchInterval: live ? 2500 : false,
  })
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
