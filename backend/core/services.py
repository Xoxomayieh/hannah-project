import httpx
import time
from functools import lru_cache

# US state abbreviations for reverse geocoding
_US_STATES = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
    'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
    'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
    'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
    'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
}

# Rate limiting for Nominatim (1 req/s)
_last_nominatim_request = 0.0


def geocode(query: str) -> dict:
    url = "https://photon.komoot.io/api/"
    params = {"q": query, "limit": 1}
    headers = {"User-Agent": "HAULR-TripPlanner/1.0"}
    try:
        response = httpx.get(url, params=params, headers=headers, timeout=10.0)
        response.raise_for_status()
        data = response.json()
        if data['features']:
            coords = data['features'][0]['geometry']['coordinates']
            return {"lat": coords[1], "lng": coords[0], "name": data['features'][0]['properties'].get('name', query)}
    except Exception:
        pass
    return None


def _photon_label(props: dict) -> str:
    """Builds a human-readable "Street, City, ST" style label from a Photon feature's properties."""
    housenumber = props.get('housenumber')
    street = props.get('street')
    name = props.get('name')
    # Enclosing city/town for an address. County is only a last resort and is
    # NOT used for place features (a city result shouldn't read "Chicago, Cook County").
    city = props.get('city') or props.get('town') or props.get('village')
    state = props.get('state')
    country = props.get('country')
    state_abbr = _US_STATES.get(state, state) if state else None

    if housenumber and street:
        primary = f"{housenumber} {street}"
        locality = city or props.get('county')
    elif street:
        primary = street
        locality = city or props.get('county')
    else:
        # The feature IS a place (city/town/village/POI): its name stands alone.
        primary = name
        locality = city if (city and city != name) else None

    tail = state_abbr or (country if country and country != 'United States' else None)
    parts = [p for p in [primary, locality, tail] if p]
    if not parts:
        parts = [p for p in [name, country] if p]
    # Dedupe while preserving order (e.g. name == city)
    seen = set()
    deduped = []
    for p in parts:
        if p not in seen:
            seen.add(p)
            deduped.append(p)
    return ", ".join(deduped)


def geocode_suggest(query: str, limit: int = 5) -> list:
    """
    Returns up to `limit` location suggestions for a partial query, for
    autocomplete-style location fields. Each result is
    {"label": str, "lat": float, "lng": float}.

    Retries once on transient failure (the public Photon instance is
    intermittently slow), keeps US results ahead of foreign ones, and dedupes
    on label. No lat/lon bias — Photon's default importance ranking surfaces
    prominent US cities better than a coordinate bias does.
    """
    query = (query or "").strip()
    if len(query) < 2:
        return []

    url = "https://photon.komoot.io/api/"
    # Over-fetch so the US-first re-rank + dedupe still yields `limit` results.
    params = {"q": query, "limit": max(limit * 2, 8), "lang": "en"}
    headers = {"User-Agent": "HAULR-TripPlanner/1.0"}

    for attempt in range(2):  # one retry on transient failure
        try:
            response = httpx.get(url, params=params, headers=headers, timeout=6.0)
            response.raise_for_status()
            data = response.json()
            # Stable-partition US first, preserving Photon order within each group.
            features = sorted(
                data.get('features', []),
                key=lambda f: 0 if f.get('properties', {}).get('countrycode') == 'US' else 1,
            )
            results = []
            seen = set()
            for feature in features:
                props = feature.get('properties', {})
                coords = feature['geometry']['coordinates']
                label = _photon_label(props)
                if label and label not in seen:
                    seen.add(label)
                    results.append({"label": label, "lat": coords[1], "lng": coords[0]})
                    if len(results) >= limit:
                        break
            return results
        except Exception:
            if attempt == 0:
                time.sleep(0.3)
                continue
            return []
    return []


def get_route(lat1, lng1, lat2, lng2):
    url = f"http://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}"
    params = {"overview": "full", "geometries": "geojson"}
    headers = {"User-Agent": "HAULR-TripPlanner/1.0"}
    try:
        response = httpx.get(url, params=params, headers=headers, timeout=15.0)
        response.raise_for_status()
        data = response.json()
        if data['code'] == 'Ok':
            route = data['routes'][0]
            # Convert distance to miles, duration to hours
            distance_miles = route['distance'] * 0.000621371
            duration_hours = route['duration'] / 3600.0
            return {
                "distance_miles": distance_miles,
                "duration_hours": duration_hours,
                "geometry": route['geometry']
            }
    except Exception:
        pass
    return None


@lru_cache(maxsize=256)
def _reverse_geocode_cached(lat_rounded: float, lng_rounded: float) -> str:
    """
    Cached reverse geocode via Nominatim. Rounds to ~1.1km precision to
    reduce API calls for nearby coordinates.
    Returns "City, ST" or coordinate string on failure.
    """
    global _last_nominatim_request

    # Rate limit: 1 request per second (Nominatim usage policy)
    elapsed = time.time() - _last_nominatim_request
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)

    try:
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            "lat": lat_rounded,
            "lon": lng_rounded,
            "format": "json",
            "zoom": 10,  # city level
            "addressdetails": 1,
        }
        headers = {"User-Agent": "HAULR-TripPlanner/1.0"}
        _last_nominatim_request = time.time()
        response = httpx.get(url, params=params, headers=headers, timeout=10.0)
        response.raise_for_status()
        data = response.json()

        address = data.get('address', {})
        city = (address.get('city') or address.get('town') or
                address.get('village') or address.get('county', ''))
        state = address.get('state', '')
        state_abbr = _US_STATES.get(state, state[:2].upper() if state else '')

        if city and state_abbr:
            return f"{city}, {state_abbr}"
        elif city:
            return city
        elif state_abbr:
            return state_abbr
    except Exception:
        pass

    return f"{lat_rounded:.4f}, {lng_rounded:.4f}"


def reverse_geocode(lat: float, lng: float) -> str:
    """
    Reverse-geocode coordinates to "City, ST" string.
    Rounds coordinates to ~0.01° (~1.1km) for cache efficiency.
    Thread-safe via lru_cache (GIL-protected).
    """
    # Round to 0.01° for cache grouping (~1.1 km precision)
    lat_r = round(lat, 2)
    lng_r = round(lng, 2)
    return _reverse_geocode_cached(lat_r, lng_r)
