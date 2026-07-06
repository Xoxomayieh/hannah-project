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
    city = props.get('city') or props.get('town') or props.get('village') or props.get('county')
    state = props.get('state')
    country = props.get('country')
    state_abbr = _US_STATES.get(state, state) if state else None

    primary = None
    if housenumber and street:
        primary = f"{housenumber} {street}"
    elif street:
        primary = street
    elif name and name != city:
        primary = name

    tail = state_abbr or (country if country and country != 'United States' else None)
    parts = [p for p in [primary, city, tail] if p]
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
    """
    query = (query or "").strip()
    if len(query) < 2:
        return []

    url = "https://photon.komoot.io/api/"
    params = {"q": query, "limit": limit, "lang": "en"}
    headers = {"User-Agent": "HAULR-TripPlanner/1.0"}
    try:
        response = httpx.get(url, params=params, headers=headers, timeout=5.0)
        response.raise_for_status()
        data = response.json()
        results = []
        for feature in data.get('features', []):
            props = feature.get('properties', {})
            coords = feature['geometry']['coordinates']
            label = _photon_label(props)
            if label:
                results.append({"label": label, "lat": coords[1], "lng": coords[0]})
        return results
    except Exception:
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
