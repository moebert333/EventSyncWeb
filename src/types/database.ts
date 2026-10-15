export type RaceStatus =
  | 'Waiting'
  | 'Staging'
  | 'Active'
  | 'Paused'
  | 'Finished'
  | 'Cancelled'

export type Organization = {
  organization_id: number
  name: string
  description: string | null
}

export type Series = {
  series_id: number
  organization_id: number
  name: string
  description: string | null
}

export type EventRow = {
  event_id: number
  series_id: number
  name: string
  description: string | null
  date: string | null
  track: string | null
  location: string | null
}

export type EventCodeRow = {
  event_id: number
  code: string
}

export type AllowlistRow = {
  allowlist_id: number
  email: string
  organization_id: number | null
  is_active: boolean
  claimed_at: string | null
}

export type RaceInProgress = {
  race_num: number
  race_id: number
  event_id: number
  series_id: number
  event_name: string
  session_name: string
  race_date: string | null
  race_start: string | null
  description: string | null
  status: RaceStatus | null
}

export type ActiveRaceTiming = {
  event_id: number
  event_name: string
  race_id: number
  race_num: number
  session_name: string
  class_id: number
  class_name: string
  place_num: string | null
  current_lap_num: number | null
  status: string | null
  participant_id: number
  participant_plate: string | null
  first_name: string
  last_name: string
  current_lap_time: string | null
  best_lap_num: number | null
  best_lap_time: string | null
  race_elapsed_time: string | null
  leader_gap_time: string | null
  next_gap_time: string | null
}

export type RaceClassName = {
  class_id: number
  class_name: string
  race_id: number
}

export type EventClassResult = {
  event_id: number
  event_name: string
  class_id: number
  class_name: string
  overall_place: string | null
  participant_id: number
  first_name: string
  last_name: string
  participant_plate: string | null
  make: string | null
  overall_points: number | null
  race1_place: string | null
  race2_place: string | null
  race3_place: string | null
  semi1_place: string | null
  semi2_place: string | null
  lcq_place: string | null
  finals_place: string | null
}

export type ClassRow = {
  class_id: number
  class_name: string
  event_id: number
}

export type EntryParticipant = {
  participant_id: number
  first_name: string
  last_name: string
  participant_plate: string | null
}
