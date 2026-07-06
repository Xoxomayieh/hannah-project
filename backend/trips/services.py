from core.services import geocode, get_route, reverse_geocode
from hos_engine.engine import HOSEngine, RouteLeg as EngineRouteLeg
from django.utils import timezone
from .models import Trip

def run_trip_planning(current: str, pickup: str, dropoff: str, cycle_used: float) -> dict:
    """
    Core HOS trip planning service.
    Returns serialized planning dictionary or raises ValueError.
    """
    if not all([current, pickup, dropoff]):
        raise ValueError("Missing locations")

    # Geocode all three locations
    loc_c = geocode(current)
    loc_p = geocode(pickup)
    loc_d = geocode(dropoff)

    if not all([loc_c, loc_p, loc_d]):
        raise ValueError("Could not geocode one or more locations")

    # Get routes from OSRM
    route1 = get_route(
        loc_c['lat'], loc_c['lng'],
        loc_p['lat'], loc_p['lng']
    )
    route2 = get_route(
        loc_p['lat'], loc_p['lng'],
        loc_d['lat'], loc_d['lng']
    )

    if not route1 or not route2:
        raise ValueError("Could not calculate route")

    # Build the HOS engine with reverse geocoder injected
    engine = HOSEngine(
        timezone.now(),
        cycle_used,
        geocoder=reverse_geocode,
    )

    # Set initial position
    engine.set_position(
        loc_c['lat'], loc_c['lng'],
        loc_c.get('name', current)
    )

    # Build and process leg 1 (current → pickup)
    leg1 = EngineRouteLeg(
        distance_miles=route1['distance_miles'],
        duration_hours=route1['duration_hours'],
        start_location=current,
        end_location=pickup,
        start_lat=loc_c['lat'],
        start_lng=loc_c['lng'],
        end_lat=loc_p['lat'],
        end_lng=loc_p['lng'],
        geometry=route1['geometry'],
    )
    engine.process_leg(leg1, is_pickup=True, is_dropoff=False)

    # Build and process leg 2 (pickup → dropoff)
    leg2 = EngineRouteLeg(
        distance_miles=route2['distance_miles'],
        duration_hours=route2['duration_hours'],
        start_location=pickup,
        end_location=dropoff,
        start_lat=loc_p['lat'],
        start_lng=loc_p['lng'],
        end_lat=loc_d['lat'],
        end_lng=loc_d['lng'],
        geometry=route2['geometry'],
    )
    engine.process_leg(leg2, is_pickup=False, is_dropoff=True)

    # Generate the plan
    plan = engine.generate_plan()

    # Persist the trip
    trip_id = None
    try:
        trip = Trip.objects.create(
            current_location=current,
            pickup_location=pickup,
            dropoff_location=dropoff,
            cycle_used_hrs=cycle_used,
        )
        trip_id = trip.id
    except Exception:
        pass  # DB fallback

    # Serialize events
    events = []
    for e in plan.events:
        events.append({
            "status": e.status,
            "start": e.start.isoformat(),
            "end": e.end.isoformat(),
            "duration_hours": round(e.duration_hours, 4),
            "location": e.location,
            "note": e.note,
            "lat": e.lat,
            "lng": e.lng,
            "miles_start": e.miles_start,
            "miles_end": e.miles_end,
        })

    # Serialize per-day rollups
    per_day = []
    for day in plan.per_day:
        per_day.append({
            "date": day.date,
            "off_duty_hours": round(day.off_duty_hours, 2),
            "sleeper_berth_hours": round(day.sleeper_berth_hours, 2),
            "driving_hours": round(day.driving_hours, 2),
            "on_duty_hours": round(day.on_duty_hours, 2),
            "total_hours": round(day.total_hours, 2),
            "total_miles": round(day.total_miles, 2),
        })

    # Serialize compliance report
    compliance = None
    if plan.compliance:
        compliance = {
            "all_passed": plan.compliance.all_passed,
            "has_34hr_restart": plan.compliance.has_34hr_restart,
            "checks": [
                {
                    "rule": c.rule,
                    "cfr_section": c.cfr_section,
                    "limit_hours": c.limit_hours,
                    "used_hours": c.used_hours,
                    "remaining_hours": c.remaining_hours,
                    "passed": c.passed,
                    "note": c.note,
                }
                for c in plan.compliance.checks
            ],
        }

    return {
        "trip_id": trip_id,
        "route_geometry": [route1['geometry'], route2['geometry']],
        "events": events,
        "per_day": per_day,
        "compliance": compliance,
        "totals": {
            "driving_hours": plan.total_driving_hours,
            "on_duty_hours": plan.total_on_duty_hours,
            "distance_miles": plan.total_distance_miles,
            "days": plan.total_days,
        },
    }
