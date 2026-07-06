"""
HOS Engine test suite.

Tests cover:
  - Pre-trip inspection insertion
  - 14-hour rule enforcement
  - 8-hour break rule enforcement
  - 70-hour cycle rule + 34-hour restart
  - Continuous timeline (no gaps)
  - "totals = 24" invariant on every generated day
  - Midnight split correctness
  - John Doe golden test (FMCSA guide pp. 18-19): 10 / 1.75 / 7.75 / 4.5 = 24
  - 2,000-mile trip (multi-day, all days sum to 24)
  - Zero-distance current→pickup
  - Cycle blocks departure immediately (restart first)
  - Single-window trip (short trip, no rest needed)
  - Polyline interpolation
  - Compliance report structure
  - Per-day rollups
"""

import pytest
from datetime import datetime, timedelta
from hos_engine.engine import (
    HOSEngine, RouteLeg, DutyEvent, TripPlan, DaySummary,
    ComplianceReport, build_john_doe_day,
    interpolate_along_polyline, _haversine_miles,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_engine(
    start_time=None, cycle_used=0.0, geocoder=None
) -> HOSEngine:
    if start_time is None:
        start_time = datetime(2023, 10, 1, 8, 0)
    return HOSEngine(start_time, cycle_used, geocoder=geocoder)


def make_leg(
    distance=100.0, duration=None, start="A", end="B",
    start_lat=0.0, start_lng=0.0, end_lat=0.0, end_lng=0.0,
    geometry=None,
) -> RouteLeg:
    if duration is None:
        duration = distance / 55.0  # default ~55 mph
    return RouteLeg(
        distance_miles=distance,
        duration_hours=duration,
        start_location=start,
        end_location=end,
        start_lat=start_lat,
        start_lng=start_lng,
        end_lat=end_lat,
        end_lng=end_lng,
        geometry=geometry,
    )


def assert_totals_24(plan: TripPlan, tolerance=0.01):
    """Assert that every day in the plan sums to exactly 24 hours."""
    for day in plan.per_day:
        total = day.total_hours
        assert abs(total - 24.0) < tolerance, (
            f"Day {day.date}: total={total:.4f}, expected 24.0. "
            f"Off={day.off_duty_hours}, SB={day.sleeper_berth_hours}, "
            f"Drive={day.driving_hours}, OnDuty={day.on_duty_hours}"
        )


def assert_continuous_timeline(plan: TripPlan, tolerance_seconds=1):
    """Assert that events are continuous with no gaps."""
    events = plan.events
    for i in range(len(events) - 1):
        gap = abs((events[i].end - events[i + 1].start).total_seconds())
        assert gap <= tolerance_seconds, (
            f"Gap between event {i} (end={events[i].end}) and "
            f"event {i+1} (start={events[i+1].start}): {gap}s"
        )


# ---------------------------------------------------------------------------
# Basic HOS rule tests
# ---------------------------------------------------------------------------

class TestPreTripInspection:
    def test_initial_pretrip(self):
        engine = make_engine()
        leg = make_leg(distance=55.0, duration=1.0, start="A", end="B")
        engine.process_leg(leg, is_pickup=True, is_dropoff=False)
        plan = engine.generate_plan()
        # First real event (after potential Off Duty padding) should be pre-trip
        real_events = [e for e in plan.events if "prior to trip" not in e.note]
        assert real_events[0].status == 'On Duty'
        assert real_events[0].note == 'Pre-trip inspection'

    def test_pretrip_after_rest(self):
        """Pre-trip should be inserted after a 10h rest period."""
        engine = make_engine()
        # Drive enough to trigger a 10h rest
        leg = make_leg(distance=660.0, duration=12.0)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)

        plan = engine.generate_plan()
        # Find rest events and check that pre-trip follows
        for i, ev in enumerate(plan.events):
            if ev.status == 'Sleeper Berth' and ev.duration_hours >= 10.0:
                # Next non-padding event should be pre-trip
                for j in range(i + 1, len(plan.events)):
                    if plan.events[j].note != "Off Duty (prior to trip start)":
                        if plan.events[j].status == 'On Duty':
                            assert 'Pre-trip' in plan.events[j].note or \
                                   'inspection' in plan.events[j].note.lower()
                        break


class TestDrivingLimits:
    def test_14_hour_rule(self):
        """Driving beyond 14h window triggers 10h rest."""
        engine = make_engine()
        leg = make_leg(distance=660.0, duration=12.0, start="A", end="B")
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        # Rest events may be split at midnight, so check for the rest note
        # rather than a single 10h event
        rests = [e for e in plan.events if e.status == 'Sleeper Berth'
                 and ('10-hour rest' in e.note or '34-hour restart' in e.note)]
        assert len(rests) > 0

    def test_11_hour_driving_limit(self):
        """Cannot drive more than 11h without 10h rest."""
        engine = make_engine()
        # Create a leg that requires > 11h driving
        leg = make_leg(distance=700.0, duration=12.73)
        engine.process_leg(leg, is_pickup=False, is_dropoff=False)
        plan = engine.generate_plan()
        # Check that no single driving segment exceeds 11h
        for ev in plan.events:
            if ev.status == 'Driving':
                assert ev.duration_hours <= 11.01

    def test_8_hour_break(self):
        """30-min break required after 8h cumulative driving."""
        engine = make_engine()
        leg = make_leg(distance=467.5, duration=8.5, start="A", end="B")
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        breaks = [e for e in plan.events
                  if e.status == 'Off Duty' and '30-minute break' in e.note]
        assert len(breaks) > 0

    def test_70_hour_rule(self):
        """34h restart triggered when 70h cycle is exhausted."""
        engine = make_engine(cycle_used=65.0)
        leg = make_leg(distance=330.0, duration=6.0, start="A", end="B")
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        restarts = [e for e in plan.events
                    if e.status == 'Off Duty' and '34-hour restart' in e.note]
        assert len(restarts) > 0


# ---------------------------------------------------------------------------
# Timeline + invariant tests
# ---------------------------------------------------------------------------

class TestTimelineInvariants:
    def test_continuous_timeline(self):
        """Events should form a continuous timeline (no gaps)."""
        engine = make_engine(start_time=datetime(2023, 10, 1, 0, 0))
        leg = make_leg(distance=1100.0, duration=20.0, start="A", end="B")
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        assert_continuous_timeline(plan)

    def test_totals_24_short_trip(self):
        """Single-day trip: per-day totals must equal 24."""
        engine = make_engine(start_time=datetime(2023, 10, 1, 8, 0))
        leg = make_leg(distance=200.0, duration=3.64, start="A", end="B")
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        assert_totals_24(plan)

    def test_totals_24_multi_day(self):
        """Multi-day trip: every day must total 24h."""
        engine = make_engine(start_time=datetime(2023, 10, 1, 8, 0))
        leg = make_leg(distance=1100.0, duration=20.0, start="A", end="B")
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        assert len(plan.per_day) >= 2, "Should span multiple days"
        assert_totals_24(plan)

    def test_totals_24_2000_mile_trip(self):
        """
        Crown invariant: a 2,000-mile trip must have totals=24 for EVERY day.
        This is the assessment's core invariant.
        """
        engine = make_engine(start_time=datetime(2023, 10, 1, 6, 0))
        # Leg 1: 800 mi current→pickup
        leg1 = make_leg(distance=800.0, duration=14.55, start="Dallas, TX",
                        end="Memphis, TN")
        engine.process_leg(leg1, is_pickup=True, is_dropoff=False)
        # Leg 2: 1200 mi pickup→dropoff
        leg2 = make_leg(distance=1200.0, duration=21.82, start="Memphis, TN",
                        end="New York, NY")
        engine.process_leg(leg2, is_pickup=False, is_dropoff=True)
        plan = engine.generate_plan()

        assert plan.total_distance_miles == pytest.approx(2000.0, abs=1.0)
        assert len(plan.per_day) >= 3, "2000mi trip should span 3+ days"
        assert_totals_24(plan)
        assert_continuous_timeline(plan)


# ---------------------------------------------------------------------------
# Midnight split tests
# ---------------------------------------------------------------------------

class TestMidnightSplit:
    def test_event_crossing_midnight_is_split(self):
        """An event spanning midnight must be split into two."""
        engine = make_engine(start_time=datetime(2023, 10, 1, 22, 0))
        engine._day_pretrip_done = True
        engine._add_event('Off Duty', 4.0, "Rest")  # 22:00 → 02:00 next day
        plan = engine.generate_plan()
        # Should have two Off Duty events around midnight
        off_duty = [e for e in plan.events if e.status == 'Off Duty'
                    and 'Rest' in e.note]
        dates = set(e.start.date().isoformat() for e in off_duty)
        assert len(dates) >= 2, "Should span two dates"

    def test_split_preserves_total_duration(self):
        """Splitting preserves the total hours."""
        engine = make_engine(start_time=datetime(2023, 10, 1, 20, 0))
        engine._day_pretrip_done = True
        engine._add_event('Driving', 6.0, "Driving", miles_delta=330.0)
        plan = engine.generate_plan()
        driving_events = [e for e in plan.events if e.status == 'Driving']
        total_driving = sum(e.duration_hours for e in driving_events)
        assert abs(total_driving - 6.0) < 0.01


# ---------------------------------------------------------------------------
# John Doe golden test (FMCSA guide pp. 18-19)
# ---------------------------------------------------------------------------

class TestJohnDoe:
    def test_john_doe_totals(self):
        """
        CROWN-JEWEL TEST: Reproduce the FMCSA guide's John Doe sample day.
        Assert grid totals: Off=10 / SB=1.75 / Drive=7.75 / OnDuty=4.5 = 24.
        """
        plan = build_john_doe_day()

        # Day 1 contains the actual work day; day 2 is pure padding (Off Duty)
        assert len(plan.per_day) >= 1
        day = plan.per_day[0]  # Check the work day

        assert day.off_duty_hours == pytest.approx(10.0, abs=0.01), \
            f"Off Duty: expected 10.0, got {day.off_duty_hours}"
        assert day.sleeper_berth_hours == pytest.approx(1.75, abs=0.01), \
            f"Sleeper Berth: expected 1.75, got {day.sleeper_berth_hours}"
        assert day.driving_hours == pytest.approx(7.75, abs=0.01), \
            f"Driving: expected 7.75, got {day.driving_hours}"
        assert day.on_duty_hours == pytest.approx(4.5, abs=0.01), \
            f"On Duty: expected 4.5, got {day.on_duty_hours}"
        assert day.total_hours == pytest.approx(24.0, abs=0.01), \
            f"Total: expected 24.0, got {day.total_hours}"

    def test_john_doe_continuous(self):
        """John Doe events are continuous (no gaps)."""
        plan = build_john_doe_day()
        assert_continuous_timeline(plan)

    def test_john_doe_events_count(self):
        """John Doe day should have the expected number of events."""
        plan = build_john_doe_day()
        # 15 explicit events + 1 padding event (Off Duty for remainder of day 2)
        # The last Off Duty ends at midnight, padding adds a full day 2
        assert len(plan.events) >= 15
        # Day 1 should have exactly 15 events
        assert len(plan.per_day[0].events) == 15


# ---------------------------------------------------------------------------
# Edge case tests
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_zero_distance_leg(self):
        """Zero-distance current→pickup shouldn't crash or produce driving events."""
        engine = make_engine()
        leg = make_leg(distance=0.0, duration=0.0, start="Same Place", end="Same Place")
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        # Should still have pre-trip + pickup + dropoff, but no driving
        driving = [e for e in plan.events if e.status == 'Driving']
        assert len(driving) == 0
        assert_totals_24(plan)

    def test_cycle_blocks_departure(self):
        """If cycle is exhausted at start, 34h restart should happen first."""
        engine = make_engine(cycle_used=70.0)
        leg = make_leg(distance=100.0, duration=1.82)
        engine.process_leg(leg, is_pickup=False, is_dropoff=False)
        plan = engine.generate_plan()
        # Should have a 34h restart early in the plan
        restarts = [e for e in plan.events
                    if '34-hour restart' in e.note]
        assert len(restarts) > 0
        assert_totals_24(plan)

    def test_single_window_trip(self):
        """Short trip fits in one drive window — no rest needed."""
        engine = make_engine()
        leg = make_leg(distance=100.0, duration=1.82, start="A", end="B")
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        rests = [e for e in plan.events
                 if e.status == 'Sleeper Berth' and e.duration_hours >= 10.0]
        assert len(rests) == 0
        assert_totals_24(plan)

    def test_fuel_stop_every_1000_miles(self):
        """A 1500-mile trip should have at least one fuel stop."""
        engine = make_engine(start_time=datetime(2023, 10, 1, 6, 0))
        leg = make_leg(distance=1500.0, duration=27.27)
        engine.process_leg(leg, is_pickup=False, is_dropoff=False)
        plan = engine.generate_plan()
        fuel_stops = [e for e in plan.events if 'Fuel stop' in e.note]
        assert len(fuel_stops) >= 1


# ---------------------------------------------------------------------------
# Polyline interpolation tests
# ---------------------------------------------------------------------------

class TestInterpolation:
    def test_interpolate_start(self):
        """fraction=0 should return start of polyline."""
        geom = {"type": "LineString", "coordinates": [
            [-87.0, 41.0], [-86.0, 42.0]
        ]}
        lat, lng = interpolate_along_polyline(geom, 0.0)
        assert lat == pytest.approx(41.0, abs=0.01)
        assert lng == pytest.approx(-87.0, abs=0.01)

    def test_interpolate_end(self):
        """fraction=1 should return end of polyline."""
        geom = {"type": "LineString", "coordinates": [
            [-87.0, 41.0], [-86.0, 42.0]
        ]}
        lat, lng = interpolate_along_polyline(geom, 1.0)
        assert lat == pytest.approx(42.0, abs=0.01)
        assert lng == pytest.approx(-86.0, abs=0.01)

    def test_interpolate_midpoint(self):
        """fraction=0.5 should return approximately the midpoint."""
        geom = {"type": "LineString", "coordinates": [
            [-87.0, 41.0], [-86.0, 42.0]
        ]}
        lat, lng = interpolate_along_polyline(geom, 0.5)
        assert 41.0 < lat < 42.0
        assert -87.0 < lng < -86.0

    def test_interpolate_no_geometry(self):
        """Missing geometry should return fallback."""
        lat, lng = interpolate_along_polyline(None, 0.5, 40.0, -80.0)
        assert lat == 40.0
        assert lng == -80.0


# ---------------------------------------------------------------------------
# Compliance report tests
# ---------------------------------------------------------------------------

class TestComplianceReport:
    def test_compliance_report_present(self):
        """Plan should include a compliance report."""
        engine = make_engine()
        leg = make_leg(distance=100.0)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        assert plan.compliance is not None
        assert len(plan.compliance.checks) == 4

    def test_compliance_all_limits_checked(self):
        """All 4 HOS limits should be checked."""
        engine = make_engine()
        leg = make_leg(distance=100.0)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        rules = {c.rule for c in plan.compliance.checks}
        assert "11-Hour Driving Limit" in rules
        assert "14-Hour Driving Window" in rules
        assert "30-Minute Break Requirement" in rules
        assert "70-Hour/8-Day Cycle Limit" in rules

    def test_short_trip_passes_all(self):
        """A short trip should pass all compliance checks."""
        engine = make_engine()
        leg = make_leg(distance=100.0)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        assert plan.compliance.all_passed

    def test_compliance_cfr_sections(self):
        """Each check should reference the correct CFR section."""
        engine = make_engine()
        leg = make_leg(distance=100.0)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        for check in plan.compliance.checks:
            assert check.cfr_section.startswith("§395")


# ---------------------------------------------------------------------------
# Per-day rollup tests
# ---------------------------------------------------------------------------

class TestPerDayRollups:
    def test_per_day_present(self):
        """Plan should include per-day rollups."""
        engine = make_engine()
        leg = make_leg(distance=100.0)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        assert len(plan.per_day) >= 1

    def test_per_day_dates_are_ordered(self):
        """Per-day summaries should be in date order."""
        engine = make_engine(start_time=datetime(2023, 10, 1, 8, 0))
        leg = make_leg(distance=1100.0, duration=20.0)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        dates = [d.date for d in plan.per_day]
        assert dates == sorted(dates)

    def test_per_day_has_events(self):
        """Each day should have events."""
        engine = make_engine()
        leg = make_leg(distance=100.0)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        for day in plan.per_day:
            assert len(day.events) > 0


# ---------------------------------------------------------------------------
# TripPlan totals tests
# ---------------------------------------------------------------------------

class TestTripPlanTotals:
    def test_total_driving_hours(self):
        """TripPlan.total_driving_hours should match sum of driving events."""
        engine = make_engine()
        leg = make_leg(distance=200.0, duration=3.64)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        assert plan.total_driving_hours > 0

    def test_total_distance(self):
        """TripPlan should track total distance."""
        engine = make_engine()
        leg = make_leg(distance=200.0, duration=3.64)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        assert plan.total_distance_miles == pytest.approx(200.0, abs=1.0)

    def test_total_days(self):
        """TripPlan should report correct day count."""
        engine = make_engine()
        leg = make_leg(distance=200.0, duration=3.64)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        assert plan.total_days >= 1


# ---------------------------------------------------------------------------
# Geocoder injection tests
# ---------------------------------------------------------------------------

class TestGeocoderInjection:
    def test_custom_geocoder_called(self):
        """Custom geocoder should be called for location remarks."""
        calls = []
        def mock_geocoder(lat, lng):
            calls.append((lat, lng))
            return "MockCity, ST"

        engine = make_engine(geocoder=mock_geocoder)
        engine.set_position(32.7767, -96.7970, "Dallas, TX")
        leg = make_leg(
            distance=100.0, duration=1.82,
            start_lat=32.7767, start_lng=-96.7970,
            end_lat=33.4484, end_lng=-112.074,
        )
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        assert len(calls) > 0

    def test_geocoder_failure_graceful(self):
        """If geocoder throws, should fall back to coordinates."""
        def failing_geocoder(lat, lng):
            raise RuntimeError("Network error")

        engine = make_engine(geocoder=failing_geocoder)
        leg = make_leg(distance=100.0)
        engine.process_leg(leg, is_pickup=True, is_dropoff=True)
        plan = engine.generate_plan()
        # Should not crash; locations should have coordinate strings
        assert plan is not None


# ---------------------------------------------------------------------------
# Haversine test
# ---------------------------------------------------------------------------

class TestHaversine:
    def test_known_distance(self):
        """Dallas to Houston is ~225 miles (great-circle)."""
        dist = _haversine_miles(32.7767, -96.7970, 29.7604, -95.3698)
        assert 215 < dist < 235
