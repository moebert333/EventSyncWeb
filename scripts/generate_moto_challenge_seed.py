#!/usr/bin/env python3
"""Generate a large Moto Challenge 2027 sample dataset for Supabase/Postgres.

Usage:
  py -3 scripts/generate_moto_challenge_seed.py
  py -3 scripts/generate_moto_challenge_seed.py --out supabase/seed_moto_challenge_2027.sql

Each run uses a fresh random seed so names, places, and lap times differ.
Wipes only the organization with org_key = mx-racing-inc (cascade), then inserts.
"""

from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

ORG_KEY = "mx-racing-inc"
ORG_NAME = "MX Racing Inc"
SERIES_NAME = "Moto Challenge 2027"
ADMIN_EMAIL = "crawl.have.fit@cloak.id"

# Reserved ID block so this seed does not collide with small demo IDs.
ORG_ID = 970001
SERIES_ID = 970001
EVENT_ID_BASE = 970010
CLASS_ID_BASE = 970100
RACE_ID_BASE = 970300
PARTICIPANT_ID_BASE = 970500

CLASS_SPECS: list[tuple[str, int]] = [
    ("50cc Open", 8),
    ("65cc Open", 9),
    ("85cc Open", 10),
    ("Super Mini", 11),
    ("Schoolboy 1", 12),
    ("250 C", 13),
    ("250 B", 16),
    ("250 A", 20),
    ("450 B", 24),
    ("450 A", 27),
]

# Five combined Moto-1 races (smaller classes paired). Remaining classes race alone in Moto 1.
# Combined races use smaller classes only (5 total across the day).
COMBINED_MOTO1: list[tuple[str, str]] = [
    ("50cc Open", "65cc Open"),
    ("85cc Open", "Super Mini"),
    ("Schoolboy 1", "250 C"),
]
COMBINED_MOTO2: list[tuple[str, str]] = [
    ("50cc Open", "65cc Open"),
    ("85cc Open", "Super Mini"),
]
SOLO_MOTO1: list[str] = ["250 B", "250 A", "450 B", "450 A"]
SOLO_MOTO2_EXTRA: list[str] = ["Schoolboy 1", "250 C", "250 B", "250 A", "450 B", "450 A"]

MAKES = ["Honda", "Yamaha", "Kawasaki", "KTM", "GasGas", "Husqvarna", "Suzuki"]
CO_CITIES = [
    "Denver",
    "Colorado Springs",
    "Aurora",
    "Fort Collins",
    "Lakewood",
    "Thornton",
    "Arvada",
    "Westminster",
    "Pueblo",
    "Centennial",
    "Boulder",
    "Greeley",
    "Longmont",
    "Loveland",
    "Grand Junction",
    "Broomfield",
    "Castle Rock",
    "Commerce City",
    "Parker",
    "Littleton",
    "Brighton",
    "Englewood",
    "Wheat Ridge",
    "Northglenn",
    "Fountain",
]
OTHER_CITIES = [
    ("Albuquerque", "NM"),
    ("Cheyenne", "WY"),
    ("Salt Lake City", "UT"),
    ("Phoenix", "AZ"),
    ("Omaha", "NE"),
]

MALE_FIRST = [
    "Liam", "Noah", "Oliver", "James", "Elijah", "William", "Henry", "Lucas", "Benjamin", "Theodore",
    "Jack", "Levi", "Alexander", "Jackson", "Mateo", "Daniel", "Michael", "Mason", "Sebastian", "Ethan",
    "Logan", "Owen", "Samuel", "Jacob", "Aiden", "John", "David", "Wyatt", "Carter", "Julian",
    "Luke", "Grayson", "Isaac", "Jayden", "Theodore", "Caleb", "Ryan", "Asher", "Nathan", "Thomas",
    "Leo", "Isaiah", "Charles", "Josiah", "Hudson", "Dylan", "Ezra", "Colton", "Hunter", "Jordan",
    "Cooper", "Parker", "Blake", "Tyler", "Chase", "Brody", "Gavin", "Nolan", "Cameron", "Austin",
]
FEMALE_FIRST = [
    "Olivia", "Emma", "Charlotte", "Amelia", "Sophia", "Isabella", "Mia", "Evelyn", "Harper", "Luna",
    "Camila", "Gianna", "Elizabeth", "Eleanor", "Ella", "Abigail", "Sofia", "Avery", "Scarlett", "Emily",
    "Aria", "Penelope", "Chloe", "Layla", "Mila", "Nora", "Hazel", "Madison", "Ellie", "Grace",
]
LAST_NAMES = [
    "Anderson", "Baker", "Barnes", "Bennett", "Brooks", "Butler", "Campbell", "Carson", "Clark", "Coleman",
    "Collins", "Cook", "Cooper", "Cox", "Cruz", "Davis", "Diaz", "Edwards", "Evans", "Flores",
    "Foster", "Garcia", "Gonzalez", "Gray", "Green", "Gutierrez", "Hall", "Harris", "Hayes", "Henderson",
    "Hernandez", "Hill", "Howard", "Hughes", "Jackson", "James", "Jenkins", "Johnson", "Jones", "Kelly",
    "Kennedy", "King", "Lee", "Lewis", "Long", "Lopez", "Martin", "Martinez", "Miller", "Mitchell",
    "Moore", "Morales", "Morgan", "Morris", "Murphy", "Myers", "Nelson", "Nguyen", "Ortiz", "Parker",
    "Patterson", "Perez", "Peterson", "Phillips", "Powell", "Price", "Ramirez", "Reed", "Reyes", "Richardson",
    "Rivera", "Roberts", "Robinson", "Rodriguez", "Rogers", "Ross", "Russell", "Sanchez", "Sanders", "Scott",
    "Smith", "Stewart", "Sullivan", "Taylor", "Thomas", "Thompson", "Torres", "Turner", "Walker", "Ward",
    "Watson", "White", "Williams", "Wilson", "Wood", "Wright", "Young", "Adams", "Allen", "Bailey",
]

TRACKS = [
    ("Red Mesa MX", "Pueblo, CO", "March", date(2027, 3, 14)),
    ("High Plains Raceway", "Byers, CO", "April", date(2027, 4, 18)),
    ("Thunder Ridge MX", "Colorado Springs, CO", "May", date(2027, 5, 16)),
    ("Front Range MX Park", "Fort Collins, CO", "June", date(2027, 6, 20)),
    ("Summit Valley MX", "Eagle, CO", "July", date(2027, 7, 18)),
]

# AMA-ish points for places 1..40; DNS marker at 80.
POINTS_BY_PLACE = {
    1: 25, 2: 22, 3: 20, 4: 18, 5: 16, 6: 15, 7: 14, 8: 13, 9: 12, 10: 11,
    11: 10, 12: 9, 13: 8, 14: 7, 15: 6, 16: 5, 17: 4, 18: 3, 19: 2, 20: 1,
}
for _p in range(21, 41):
    POINTS_BY_PLACE[_p] = 0


def sql_str(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def sql_bool(value: bool) -> str:
    return "true" if value else "false"


def sql_time_from_seconds(total: float) -> str:
    total = max(0.0, total)
    minutes = int(total // 60)
    seconds = total - minutes * 60
    hours = minutes // 60
    minutes = minutes % 60
    # Postgres time accepts fractional seconds.
    return f"'{hours:02d}:{minutes:02d}:{seconds:06.3f}'"


def points_for(place: int | None) -> int | None:
    if place is None:
        return None
    return POINTS_BY_PLACE.get(place, 0)


# Compatible class bands for multi-class entries (avoid 50cc kids in 450A, etc.).
CLASS_BANDS: list[list[str]] = [
    ["50cc Open", "65cc Open"],
    ["85cc Open", "Super Mini", "Schoolboy 1"],
    ["250 C", "250 B", "250 A", "450 B", "450 A"],
]


@dataclass
class Rider:
    participant_id: int
    first_name: str
    last_name: str
    plate: str
    city: str
    state: str
    sex: str
    age: str
    make: str
    class_names: list[str]  # primary first; 1–3 classes
    skill: float  # lower is faster

    @property
    def primary_class(self) -> str:
        return self.class_names[0]


@dataclass
class RaceSlot:
    race_num: int
    race_name: str
    session_name: str
    moto: int
    class_names: list[str]
    start_hour: int
    start_minute: int


@dataclass
class EventPlan:
    index: int  # 1..5
    event_id: int
    name: str
    track: str
    location: str
    event_date: date
    code: str
    class_ids: dict[str, int] = field(default_factory=dict)
    race_ids: dict[int, int] = field(default_factory=dict)  # race_num -> race_id


def build_race_slots() -> list[RaceSlot]:
    """15 races: 5 combined (small classes) + 10 singles. Each class appears in exactly 2 motos."""
    slots: list[RaceSlot] = []
    race_num = 1
    hour, minute = 9, 0

    def bump_time() -> tuple[int, int]:
        nonlocal hour, minute
        minute += 25
        if minute >= 60:
            hour += minute // 60
            minute = minute % 60
        return hour, minute

    def add_slot(race_name: str, session: str, moto: int, class_names: list[str]) -> None:
        nonlocal race_num
        h, m = bump_time()
        slots.append(
            RaceSlot(
                race_num=race_num,
                race_name=race_name,
                session_name=session,
                moto=moto,
                class_names=class_names,
                start_hour=h,
                start_minute=m,
            )
        )
        race_num += 1

    for a, b in COMBINED_MOTO1:
        add_slot(f"{a} / {b}", "DIV::1::MOTO 1", 1, [a, b])
    for class_name in SOLO_MOTO1:
        add_slot(class_name, "DIV::1::MOTO 1", 1, [class_name])
    for a, b in COMBINED_MOTO2:
        add_slot(f"{a} / {b}", "DIV::1::MOTO 2", 2, [a, b])
    for class_name in SOLO_MOTO2_EXTRA:
        add_slot(class_name, "DIV::1::MOTO 2", 2, [class_name])

    # Sanity: 15 races, 5 combined, each class twice.
    assert len(slots) == 15, len(slots)
    assert sum(1 for s in slots if len(s.class_names) == 2) == 5
    appearances: dict[str, int] = {name: 0 for name, _ in CLASS_SPECS}
    for slot in slots:
        for name in slot.class_names:
            appearances[name] += 1
    assert all(count == 2 for count in appearances.values()), appearances
    return slots


def compatible_classes(primary: str) -> list[str]:
    for band in CLASS_BANDS:
        if primary in band:
            return list(band)
    return [name for name, _ in CLASS_SPECS]


def make_riders(rng: random.Random) -> list[Rider]:
    riders: list[Rider] = []
    used_plates: set[str] = set()
    pid = PARTICIPANT_ID_BASE

    for class_name, count in CLASS_SPECS:
        for _ in range(count):
            sex = "F" if rng.random() < 0.14 else "M"
            first = rng.choice(FEMALE_FIRST if sex == "F" else MALE_FIRST)
            last = rng.choice(LAST_NAMES)
            # Prefer unique-ish plates; allow rare collision retry.
            plate = str(rng.randint(1, 999))
            while plate in used_plates:
                plate = str(rng.randint(1, 999))
            used_plates.add(plate)

            if rng.random() < 0.88:
                city, state = rng.choice(CO_CITIES), "CO"
            else:
                city, state = rng.choice(OTHER_CITIES)

            # Rough ages by class.
            if "50cc" in class_name:
                age = str(rng.randint(4, 8))
            elif "65cc" in class_name:
                age = str(rng.randint(7, 11))
            elif "85cc" in class_name or "Mini" in class_name:
                age = str(rng.randint(9, 15))
            elif "Schoolboy" in class_name:
                age = str(rng.randint(12, 17))
            else:
                age = str(rng.randint(16, 42))

            riders.append(
                Rider(
                    participant_id=pid,
                    first_name=first,
                    last_name=last,
                    plate=plate,
                    city=city,
                    state=state,
                    sex=sex,
                    age=age,
                    make=rng.choice(MAKES),
                    class_names=[class_name],
                    skill=rng.uniform(0.88, 1.18),
                )
            )
            pid += 1

    assign_extra_classes(riders, rng)
    return riders


def assign_extra_classes(riders: list[Rider], rng: random.Random) -> None:
    """About 1 in 5 riders also enter 1–2 more classes (max 3 total), same band only."""
    for rider in riders:
        if rng.random() >= 0.20:
            continue
        extras = rng.randint(1, 2)  # total classes become 2 or 3
        pool = [name for name in compatible_classes(rider.primary_class) if name not in rider.class_names]
        rng.shuffle(pool)
        for name in pool[:extras]:
            if len(rider.class_names) >= 3:
                break
            rider.class_names.append(name)


def race_finish_order(riders_in_class: list[Rider], rng: random.Random) -> list[Rider]:
    """Order riders for one moto with wide variance so places move around event to event."""
    n = len(riders_in_class)
    if n <= 1:
        return list(riders_in_class)

    # Occasional chaos moto: nearly ignore skill.
    if rng.random() < 0.18:
        order = list(riders_in_class)
        rng.shuffle(order)
        return order

    scored: list[tuple[float, float, Rider]] = []
    for rider in riders_in_class:
        # Wide multiplicative noise + additive noise → frequent place swings.
        noise = rider.skill * rng.uniform(0.72, 1.40) + rng.uniform(-0.22, 0.22)
        scored.append((noise, rng.random(), rider))
    scored.sort(key=lambda item: (item[0], item[1]))
    order = [item[2] for item in scored]

    # A few random bubble swaps to break clumps.
    swaps = max(1, n // 4)
    for _ in range(swaps):
        i = rng.randrange(n - 1)
        if rng.random() < 0.55:
            order[i], order[i + 1] = order[i + 1], order[i]
    return order


def assign_moto_finishes(riders_in_class: list[Rider], rng: random.Random) -> dict[int, tuple[int, int]]:
    """participant_id -> (moto1_place, moto2_place)."""
    order1 = race_finish_order(riders_in_class, rng)
    order2 = race_finish_order(riders_in_class, rng)
    m1 = {r.participant_id: i + 1 for i, r in enumerate(order1)}
    m2 = {r.participant_id: i + 1 for i, r in enumerate(order2)}
    return {r.participant_id: (m1[r.participant_id], m2[r.participant_id]) for r in riders_in_class}


def rank_overall(finishes: dict[int, tuple[int, int]]) -> dict[int, int]:
    ranked = sorted(finishes.items(), key=lambda item: (item[1][0] + item[1][1], item[1][1], item[1][0]))
    return {pid: i + 1 for i, (pid, _) in enumerate(ranked)}


def simulate_active_laps(
    riders: list[Rider],
    laps: int,
    rng: random.Random,
) -> list[tuple[Rider, int, int, float, float, float, float, float]]:
    """Return rows: rider, lap, place, lap_time, best_lap, best_num, elapsed, leader_gap, next_gap."""
    states = []
    for rider in riders:
        base = 95.0 * rider.skill  # seconds
        states.append(
            {
                "rider": rider,
                "elapsed": 0.0,
                "best": None,
                "best_num": 0,
                "laps": [],
            }
        )

    for lap in range(1, laps + 1):
        for state in states:
            lap_time = max(70.0, state["rider"].skill * 95.0 * rng.uniform(0.88, 1.16))
            state["elapsed"] += lap_time
            if state["best"] is None or lap_time < state["best"]:
                state["best"] = lap_time
                state["best_num"] = lap
            state["laps"].append(lap_time)

    rows = []
    for lap in range(1, laps + 1):
        # Recompute places at this lap from elapsed after that lap.
        elapsed_at = []
        for state in states:
            elapsed = sum(state["laps"][:lap])
            best = min(state["laps"][:lap])
            best_num = state["laps"][:lap].index(best) + 1
            elapsed_at.append((elapsed, state, best, best_num, state["laps"][lap - 1]))
        elapsed_at.sort(key=lambda item: item[0])
        for place, (elapsed, state, best, best_num, lap_time) in enumerate(elapsed_at, start=1):
            leader_elapsed = elapsed_at[0][0]
            leader_gap = elapsed - leader_elapsed
            next_gap = 0.0 if place == 1 else elapsed - elapsed_at[place - 2][0]
            rows.append((state["rider"], lap, place, lap_time, best, best_num, elapsed, leader_gap, next_gap))
    return rows


def generate_sql(rng: random.Random) -> str:
    riders = make_riders(rng)
    by_class: dict[str, list[Rider]] = {name: [] for name, _ in CLASS_SPECS}
    for rider in riders:
        for class_name in rider.class_names:
            by_class[class_name].append(rider)

    race_slots = build_race_slots()
    assert len(race_slots) == 15, len(race_slots)
    assert sum(size for _, size in CLASS_SPECS) == len(riders)
    multi_class = sum(1 for rider in riders if len(rider.class_names) > 1)
    assert all(1 <= len(rider.class_names) <= 3 for rider in riders)

    events: list[EventPlan] = []
    class_id = CLASS_ID_BASE
    race_id = RACE_ID_BASE
    for i, (track, location, month, event_date) in enumerate(TRACKS, start=1):
        plan = EventPlan(
            index=i,
            event_id=EVENT_ID_BASE + i,
            name=f"{track}-{month} Event",
            track=track,
            location=location,
            event_date=event_date,
            code=f"MX-2027-{i}",
        )
        for class_name, _ in CLASS_SPECS:
            plan.class_ids[class_name] = class_id
            class_id += 1
        for slot in race_slots:
            plan.race_ids[slot.race_num] = race_id
            race_id += 1
        events.append(plan)

    lines: list[str] = []
    lines.append("-- Moto Challenge 2027 sample seed")
    lines.append(f"-- Generated with random seed marker: {rng.randrange(1_000_000_000)}")
    lines.append("-- Wipes ONLY org_key = mx-racing-inc, then reloads sample data.")
    lines.append("-- Run in Supabase SQL editor (role that can write public tables).")
    lines.append("begin;")
    lines.append("")
    lines.append("-- Remove previous sample org (cascades series/events/races/entries/results/timing).")
    lines.append(
        "delete from public.admin_allowlist "
        f"where lower(email) = lower({sql_str(ADMIN_EMAIL)});"
    )
    lines.append(f"delete from public.organizations where org_key = {sql_str(ORG_KEY)};")
    lines.append("")

    lines.append(
        "insert into public.organizations (organization_id, name, description, org_key, claim_code) values "
        f"({ORG_ID}, {sql_str(ORG_NAME)}, {sql_str('Sample organization for EventSync testing')}, "
        f"{sql_str(ORG_KEY)}, {sql_str('MXCLAIM27')});"
    )
    lines.append(
        "insert into public.series (series_id, organization_id, name, description) values "
        f"({SERIES_ID}, {ORG_ID}, {sql_str(SERIES_NAME)}, "
        f"{sql_str('Colorado outdoor motocross challenge series')});"
    )
    lines.append("")

    # Events
    event_values = []
    for ev in events:
        event_values.append(
            f"({ev.event_id}, {SERIES_ID}, {sql_str(ev.name)}, "
            f"{sql_str(f'{SERIES_NAME} round {ev.index}')}, "
            f"{sql_str(ev.event_date.isoformat())}, {sql_str(ev.track)}, {sql_str(ev.location)}, NULL)"
        )
    lines.append(
        "insert into public.events "
        "(event_id, series_id, name, description, date, track, location, active_race_id) values"
    )
    lines.append(",\n".join(event_values) + ";")
    lines.append("")

    code_values = [f"({ev.event_id}, {sql_str(ev.code)})" for ev in events]
    lines.append("insert into public.event_codes (event_id, code) values")
    lines.append(",\n".join(code_values) + ";")
    lines.append("")

    # event_points for every event
    point_rows = []
    for ev in events:
        for place, pts in POINTS_BY_PLACE.items():
            point_rows.append(f"({ev.event_id}, {place}, {pts}, 'valid')")
        point_rows.append(f"({ev.event_id}, 80, 0, 'DNS')")
    lines.append("insert into public.event_points (event_id, position, points, status) values")
    lines.append(",\n".join(point_rows) + ";")
    lines.append("")

    # Classes
    class_rows = []
    for ev in events:
        for class_name, _ in CLASS_SPECS:
            class_rows.append(
                f"({ev.class_ids[class_name]}, {ev.event_id}, {sql_str(class_name)}, NULL)"
            )
    lines.append("insert into public.classes (class_id, event_id, class_name, description) values")
    lines.append(",\n".join(class_rows) + ";")
    lines.append("")

    # Participants
    part_rows = []
    for rider in riders:
        part_rows.append(
            f"({rider.participant_id}, {ORG_ID}, {sql_str(rider.first_name)}, {sql_str(rider.last_name)}, "
            f"{sql_str(rider.plate)}, {sql_str(rider.city)}, {sql_str(rider.state)}, "
            f"{sql_str(rider.sex)}, {sql_str(rider.age)}, NULL)"
        )
    lines.append(
        "insert into public.participants "
        "(participant_id, organization_id, first_name, last_name, participant_plate, city, state, sex, age, transponder_id) values"
    )
    lines.append(",\n".join(part_rows) + ";")
    lines.append("")

    # event_entry for all events (multi-class riders get one row per class)
    entry_rows = []
    for ev in events:
        for rider in riders:
            for class_name in rider.class_names:
                cid = ev.class_ids[class_name]
                entry_rows.append(
                    f"({ev.event_id}, {cid}, {rider.participant_id}, {sql_str(rider.plate)}, "
                    f"{sql_str(rider.make)}, NULL, NULL)"
                )
    lines.append(
        "insert into public.event_entry "
        "(event_id, class_id, participant_id, participant_plate, make, model, division) values"
    )
    lines.append(",\n".join(entry_rows) + ";")
    lines.append("")

    # Races + race_class + status
    race_rows = []
    race_class_rows = []
    status_rows = []
    live_event = events[3]  # event 4
    live_race_num = 11

    for ev in events:
        for slot in race_slots:
            rid = ev.race_ids[slot.race_num]
            if ev.index <= 3:
                completed, active = True, False
                status = "Finished"
            elif ev.index == 4:
                if slot.race_num <= 10:
                    completed, active = True, False
                    status = "Finished"
                elif slot.race_num == live_race_num:
                    completed, active = False, True
                    status = "Active"
                else:
                    completed, active = False, False
                    status = "Waiting"
            else:
                completed, active = False, False
                status = "Waiting"

            start = f"{slot.start_hour:02d}:{slot.start_minute:02d}:00"
            race_rows.append(
                f"({rid}, {ev.event_id}, {slot.race_num}, false, {sql_str(slot.race_name)}, NULL, "
                f"{sql_str(start)}, {sql_str(ev.event_date.isoformat())}, {sql_str(slot.session_name)}, "
                f"{sql_bool(completed)}, {sql_bool(active)})"
            )
            for class_name in slot.class_names:
                race_class_rows.append(f"({ev.class_ids[class_name]}, {rid})")

            # Status for finished/active; skip pure waiting to keep table smaller (optional rows for waiting).
            if status != "Waiting":
                laps_to_go = 3 if status == "Active" else 0
                elapsed = "00:12:40" if status == "Active" else "00:18:00"
                status_rows.append(
                    f"({rid}, {laps_to_go}, '00:00:00', {sql_str(elapsed)}, {sql_str(elapsed)}, "
                    f"'{status}'::public.race_status)"
                )

    lines.append(
        "insert into public.races "
        "(race_id, event_id, race_num, is_practice, race_name, description, race_start, race_date, "
        "session_name, completed, active) values"
    )
    lines.append(",\n".join(race_rows) + ";")
    lines.append("")
    lines.append("insert into public.race_class (class_id, race_id) values")
    lines.append(",\n".join(race_class_rows) + ";")
    lines.append("")
    lines.append(
        "insert into public.status "
        "(race_id, laps_to_go, time_to_go, current_race_time, elapsed_race_time, status) values"
    )
    lines.append(",\n".join(status_rows) + ";")
    lines.append("")

    # Point live event active_race_id
    live_race_id = live_event.race_ids[live_race_num]
    lines.append(
        f"update public.events set active_race_id = {live_race_id} where event_id = {live_event.event_id};"
    )
    lines.append("")

    # event_results for events 1-3 (full) and event 4 (classes with both motos completed)
    result_rows = []
    for ev in events:
        if ev.index == 5:
            continue
        for class_name, class_riders in by_class.items():
            finishes = assign_moto_finishes(class_riders, rng)
            # Event 4: only write full overall when both motos are in races 1-10.
            moto2_race_num = next(
                slot.race_num
                for slot in race_slots
                if slot.moto == 2 and class_name in slot.class_names
            )
            both_done = ev.index <= 3 or moto2_race_num <= 10
            if ev.index == 4 and not both_done:
                # Moto 1 only for classes still racing / not started moto 2.
                for rider in class_riders:
                    m1, _m2 = finishes[rider.participant_id]
                    result_rows.append(
                        f"({ev.event_id}, {ev.class_ids[class_name]}, {rider.participant_id}, NULL, "
                        f"{sql_str(rider.make)}, {sql_str(rider.plate)}, NULL, 0, 0, "
                        f"{m1}, {points_for(m1)}, NULL, NULL, NULL, NULL, NULL, NULL, "
                        f"NULL, NULL, NULL, NULL, NULL)"
                    )
                continue

            overall = rank_overall(finishes)
            for rider in class_riders:
                m1, m2 = finishes[rider.participant_id]
                ov = overall[rider.participant_id]
                m1p, m2p, ovp = points_for(m1), points_for(m2), points_for(ov)
                motos_pts = (m1p or 0) + (m2p or 0)
                result_rows.append(
                    f"({ev.event_id}, {ev.class_ids[class_name]}, {rider.participant_id}, NULL, "
                    f"{sql_str(rider.make)}, {sql_str(rider.plate)}, {motos_pts}, {ov}, {ovp}, "
                    f"{m1}, {m1p}, {m2}, {m2p}, NULL, NULL, NULL, NULL, "
                    f"NULL, NULL, NULL, NULL, NULL)"
                )

    lines.append(
        "insert into public.event_results ("
        "event_id, class_id, participant_id, transponder_id, make, participant_plate, "
        "motos_points, overall_position, overall_points, "
        "race1_finish, race1_points, race2_finish, race2_points, race3_finish, race3_points, "
        "race4_finish, race4_points, semi1_finish, semi2_finish, lcq_finish, lcq_points, finals_finish"
        ") values"
    )
    lines.append(",\n".join(result_rows) + ";")
    lines.append("")

    # active_timing for event 4 race 11 (5 laps); places simulated per class
    live_slot = next(slot for slot in race_slots if slot.race_num == live_race_num)
    timing_rows = []
    for class_name in live_slot.class_names:
        cid = live_event.class_ids[class_name]
        for rider, lap, place, lap_time, best, best_num, elapsed, leader_gap, next_gap in simulate_active_laps(
            by_class[class_name], laps=5, rng=rng
        ):
            timing_rows.append(
                f"({live_race_id}, {cid}, {rider.participant_id}, {lap}, 'valid', {place}, "
                f"{sql_str(rider.plate)}, {sql_time_from_seconds(lap_time)}, {best_num}, "
                f"{sql_time_from_seconds(best)}, {sql_time_from_seconds(elapsed)}, "
                f"{sql_time_from_seconds(leader_gap)}, {sql_time_from_seconds(next_gap)})"
            )
    lines.append(
        "insert into public.active_timing ("
        "race_id, class_id, participant_id, current_lap_num, status, place_num, participant_plate, "
        "current_lap_time, best_lap_num, best_lap_time, race_elapsed_time, leader_gap_time, next_gap_time"
        ") values"
    )
    lines.append(",\n".join(timing_rows) + ";")
    lines.append("")

    lines.append(
        "insert into public.admin_allowlist (email, organization_id, is_active) values "
        f"({sql_str(ADMIN_EMAIL)}, {ORG_ID}, true);"
    )
    lines.append("")

    # Bump identity sequences above our reserved IDs.
    lines.append(
        "select setval(pg_get_serial_sequence('public.organizations', 'organization_id'), "
        "greatest(970001, (select coalesce(max(organization_id), 1) from public.organizations)));"
    )
    lines.append(
        "select setval(pg_get_serial_sequence('public.series', 'series_id'), "
        "greatest(970001, (select coalesce(max(series_id), 1) from public.series)));"
    )
    lines.append(
        "select setval(pg_get_serial_sequence('public.events', 'event_id'), "
        "greatest(970015, (select coalesce(max(event_id), 1) from public.events)));"
    )
    lines.append(
        "select setval(pg_get_serial_sequence('public.classes', 'class_id'), "
        "greatest(970200, (select coalesce(max(class_id), 1) from public.classes)));"
    )
    lines.append(
        "select setval(pg_get_serial_sequence('public.races', 'race_id'), "
        "greatest(970500, (select coalesce(max(race_id), 1) from public.races)));"
    )
    lines.append(
        "select setval(pg_get_serial_sequence('public.event_points', 'event_points_id'), "
        "greatest(1, (select coalesce(max(event_points_id), 1) from public.event_points)));"
    )
    lines.append("")
    lines.append("commit;")
    lines.append("")
    lines.append("-- Quick reference:")
    for ev in events:
        lines.append(f"--   {ev.code}  {ev.name}  ({ev.event_date.isoformat()})  {ev.track}")
    lines.append(f"-- Live timing: {live_event.code} race_num={live_race_num} race_id={live_race_id}")
    lines.append(
        f"-- Riders={len(riders)} multi_class={multi_class} "
        f"classes={len(CLASS_SPECS)} races_per_event={len(race_slots)}"
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Moto Challenge 2027 Supabase seed SQL")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("supabase/seed_moto_challenge_2027.sql"),
        help="Output SQL path",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Optional RNG seed for reproducible output (default: fresh random each run)",
    )
    args = parser.parse_args()

    seed = args.seed if args.seed is not None else random.SystemRandom().randint(1, 2_000_000_000)
    rng = random.Random(seed)
    sql = generate_sql(rng)

    out_path: Path = args.out
    if not out_path.is_absolute():
        out_path = Path.cwd() / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(sql, encoding="utf-8")
    print(f"Wrote {out_path} (rng_seed={seed}, bytes={out_path.stat().st_size})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
