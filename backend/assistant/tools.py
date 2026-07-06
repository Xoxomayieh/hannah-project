import os
import json
from langchain_core.tools import tool
from trips.services import run_trip_planning
from trips.models import Trip, DutyEvent
from core.services import geocode
from supabase import create_client, Client

from .rag import search_documents

# Initialize Supabase client
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = None
if supabase_url and supabase_key:
    supabase = create_client(supabase_url, supabase_key)

# Lazy Gemini (google-genai) client for web-search grounding. Reuses the same
# GEMINI_API_KEY — no extra provider/key required.
_genai_client = None


def _get_genai_client():
    global _genai_client
    if _genai_client is None:
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            return None
        try:
            from google import genai
            _genai_client = genai.Client(api_key=key)
        except Exception:
            return None
    return _genai_client

@tool
def plan_trip(current_location: str, pickup_location: str, dropoff_location: str, cycle_used_hrs: float) -> str:
    """
    Plan a compliant trucking route and generate daily logs based on Hours of Service (HOS) rules.
    
    Args:
        current_location: Starting location (e.g. "Dallas, TX").
        pickup_location: Pickup location (e.g. "Tulsa, OK").
        dropoff_location: Dropoff destination (e.g. "Chicago, IL").
        cycle_used_hrs: Accumulated hours used on the 70-hour rolling cycle (0-70).
    """
    try:
        plan = run_trip_planning(current_location, pickup_location, dropoff_location, float(cycle_used_hrs))
        return json.dumps({
            "status": "success",
            "message": f"Successfully planned trip from {current_location} to {dropoff_location} via {pickup_location}.",
            "trip_id": plan["trip_id"],
            "totals": plan["totals"],
            "compliance_summary": {
                "all_passed": plan["compliance"]["all_passed"] if plan["compliance"] else True,
                "has_34hr_restart": plan["compliance"]["has_34hr_restart"] if plan["compliance"] else False,
            },
            # Return raw planning data so the SSE stream can parse it for RENDER_TRIP
            "raw_plan": plan
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": str(e)
        })

@tool
def geocode_location(query: str) -> str:
    """
    Geocode a location query to its latitude and longitude coordinates.
    
    Args:
        query: The place name (e.g. "Chicago, IL").
    """
    coords = geocode(query)
    if coords:
        return json.dumps({"status": "success", "lat": coords["lat"], "lng": coords["lng"], "name": coords["name"]})
    return json.dumps({"status": "error", "message": f"Could not geocode location: '{query}'"})

@tool
def get_trip_logs(trip_id: int, day: int = None) -> str:
    """
    Fetch the duty-status logs, daily hours totals, and remarks for a planned trip.
    
    Args:
        trip_id: The ID of the planned trip.
        day: Optional 1-indexed calendar day to fetch logs for (e.g. day=1 is the first day).
    """
    try:
        trip = Trip.objects.get(id=int(trip_id))
        events = trip.events.all().order_by("start_time")
        
        # Format events
        serialized_events = []
        for e in events:
            serialized_events.append({
                "status": e.status,
                "start": e.start_time.isoformat(),
                "end": e.end_time.isoformat(),
                "location": e.location,
                "note": e.note,
                "lat": e.lat,
                "lng": e.lng
            })
            
        return json.dumps({
            "status": "success",
            "trip_id": trip_id,
            "locations": {
                "current": trip.current_location,
                "pickup": trip.pickup_location,
                "dropoff": trip.dropoff_location
            },
            "events": serialized_events,
            "day_requested": day
        })
    except Trip.DoesNotExist:
        return json.dumps({"status": "error", "message": f"Trip with ID {trip_id} not found."})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})

@tool
def export_logs_pdf(trip_id: int) -> str:
    """
    Export the ELD daily logs for a planned trip to a PDF and return a signed, short-TTL download link.
    
    Args:
        trip_id: The ID of the planned trip.
    """
    if not supabase:
        return json.dumps({"status": "error", "message": "Supabase storage is not configured."})
        
    try:
        trip_id_int = int(trip_id)
        filepath = f"trip_{trip_id_int}_logs.pdf"
        
        # Check if the PDF exists or generate a signed URL
        # We try to create a signed URL with 15 minutes (900 seconds) expiration
        response = supabase.storage.from_("log-pdfs").create_signed_url(filepath, 900)
        
        if "signedURL" in response:
            return json.dumps({
                "status": "success",
                "message": "Logs PDF exported successfully.",
                "download_url": response["signedURL"]
            })
        else:
            # If the file hasn't been uploaded yet, let the front-end know it should trigger client-side upload
            return json.dumps({
                "status": "pending_upload",
                "message": "PDF is not uploaded yet. Generating signed URL placeholder.",
                "trip_id": trip_id_int,
                "filepath": filepath
            })
    except Exception as e:
        # Fallback: if it fails, return error or construct expected URL format
        return json.dumps({"status": "error", "message": str(e)})

@tool
def get_compliance_report(trip_id: int) -> str:
    """
    Get the Hours of Service (HOS) compliance checks (11-hour, 14-hour, 30-min break, 70-hour rules) for a trip.
    
    Args:
        trip_id: The ID of the planned trip.
    """
    # Since compliance report is generated dynamically, we can re-plan the trip parameters to get the report
    try:
        trip = Trip.objects.get(id=int(trip_id))
        plan = run_trip_planning(trip.current_location, trip.pickup_location, trip.dropoff_location, trip.cycle_used_hrs)
        return json.dumps({
            "status": "success",
            "trip_id": trip_id,
            "compliance": plan["compliance"]
        })
    except Trip.DoesNotExist:
        return json.dumps({"status": "error", "message": f"Trip with ID {trip_id} not found."})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})

@tool
def hos_quick_calc(cycle_used_hrs: float, drive_today_hrs: float = 0.0, hours_since_break: float = 0.0) -> str:
    """
    Perform a quick Hours of Service (HOS) calculation based on current clock values.
    
    Args:
        cycle_used_hrs: Accumulated hours on the 70-hour rolling cycle (0-70).
        drive_today_hrs: Driving hours spent today so far (0-11).
        hours_since_break: Hours of driving since the last 30-minute break (0-8).
    """
    cycle_limit = 70.0
    drive_limit = 11.0
    break_limit = 8.0
    
    cycle_remain = max(0.0, cycle_limit - float(cycle_used_hrs))
    drive_remain = max(0.0, drive_limit - float(drive_today_hrs))
    break_remain = max(0.0, break_limit - float(hours_since_break))
    
    return json.dumps({
        "status": "success",
        "limits": {
            "cycle_used": cycle_used_hrs,
            "cycle_remaining": cycle_remain,
            "drive_used": drive_today_hrs,
            "drive_remaining": drive_remain,
            "hours_since_break": hours_since_break,
            "hours_to_break": break_remain
        },
        "guidance": (
            f"You have {drive_remain:.2f} driving hours left today, and must take a 30-minute break in "
            f"{break_remain:.2f} hours. You have {cycle_remain:.2f} hours remaining on your 70-hour cycle."
        )
    })


@tool
def search_hos_docs(query: str) -> str:
    """
    Search the FMCSA Hours-of-Service guide and the HAULR app FAQ. This is the
    PRIMARY SOURCE OF TRUTH and MUST be consulted first for any question about
    HOS rules, driving/on-duty limits, breaks, the 70-hour cycle, 34-hour restart,
    daily log requirements, or how to use the HAULR application.

    Returns passages with page/source metadata so you can cite them as [Page X]
    or [App FAQ]. Answer ONLY from the returned chunks; do not invent rules.

    Args:
        query: A focused natural-language question about HOS rules or the app.
    """
    try:
        docs = search_documents(query)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e), "chunks": [], "citations": []})

    if not docs:
        return json.dumps({
            "status": "empty",
            "message": "No matching passages found in the FMCSA guide or app FAQ.",
            "chunks": [],
            "citations": [],
        })

    chunks = []
    citations = []
    for d in docs:
        src = d.metadata.get("source", "fmcsa-hos-guide")
        page_range = d.metadata.get("page_range", "N/A")
        title = d.metadata.get("title", "")
        chunks.append({
            "source": src,
            "page_range": page_range,
            "title": title,
            "content": d.page_content,
        })
        citations.append({
            "source": src,
            "page_range": page_range,
            "title": title,
            "snippet": d.page_content[:200] + "...",
        })

    return json.dumps({"status": "success", "chunks": chunks, "citations": citations})


@tool
def web_search(query: str) -> str:
    """
    Search the live public web for current, real-world info that is NOT in the
    FMCSA guide — e.g. current fuel/diesel prices, weather, road/weigh-station
    closures, state-specific idling or chain laws, recent regulation changes, or
    general trucking questions the guide doesn't cover.

    IMPORTANT: The FMCSA guide (search_hos_docs) is the source of truth for HOS
    rules — only use web_search for things outside it, or to fill a gap after
    search_hos_docs returned nothing. Always tell the driver when an answer comes
    from the web rather than the official guide.

    Args:
        query: A focused, self-contained web search question.
    """
    client = _get_genai_client()
    if not client:
        return json.dumps({"status": "error", "message": "Web search is unavailable right now.", "citations": []})

    try:
        from google.genai import types
        model = os.environ.get("GEMINI_CHAT_MODEL", "gemini-2.5-flash").replace("models/", "")
        resp = client.models.generate_content(
            model=model,
            contents=(
                "You are helping a truck driver. Answer this concisely and factually "
                f"using up-to-date web results. Question: {query}"
            ),
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.2,
            ),
        )

        text = (getattr(resp, "text", None) or "").strip()

        citations = []
        seen = set()
        candidates = getattr(resp, "candidates", None) or []
        if candidates:
            gm = getattr(candidates[0], "grounding_metadata", None)
            for ch in (getattr(gm, "grounding_chunks", None) or []):
                web = getattr(ch, "web", None)
                if not web:
                    continue
                uri = getattr(web, "uri", None)
                if not uri or uri in seen:
                    continue
                seen.add(uri)
                citations.append({
                    "source": uri,
                    "page_range": "web",
                    "title": getattr(web, "title", "") or uri,
                    "snippet": getattr(web, "title", "") or uri,
                })

        if not text:
            return json.dumps({"status": "empty", "message": "No useful web results found.", "citations": []})

        return json.dumps({"status": "success", "answer": text, "citations": citations})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e), "citations": []})
