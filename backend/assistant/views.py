"""
Rig AI copilot — plain Django JSON endpoint (no SSE/streaming).

Simplified per the project scope: the chat runs the LangGraph agent to
completion and returns ONE JSON payload. We keep the Supabase-Postgres
LangGraph checkpointer + the human-in-the-loop trip confirmation, but drop the
serverless/SSE machinery, Cloudflare Turnstile, and the daily token budget.

The only abuse guard is a simple per-visitor daily message cap, because the
Gemini key is paid.
"""

import os
import json
from datetime import date

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.cache import cache
from langchain_core.messages import HumanMessage, ToolMessage, AIMessage
from langgraph.errors import GraphInterrupt
from langgraph.checkpoint.postgres import PostgresSaver
import psycopg

from .graph import workflow

DATABASE_URL = os.environ.get("DATABASE_URL")

# Simple abuse guard: N chat messages per visitor per day (paid Gemini key).
DAILY_CHAT_LIMIT = int(os.environ.get("RIG_DAILY_CHAT_LIMIT", "10"))


def get_client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "anon")


def check_daily_limit(ip: str) -> tuple[bool, int]:
    """Allow up to DAILY_CHAT_LIMIT messages per visitor per calendar day."""
    key = f"rig:day:{ip}:{date.today().isoformat()}"
    count = cache.get(key, 0)
    if count >= DAILY_CHAT_LIMIT:
        return False, count
    cache.set(key, count + 1, 86400)
    return True, count + 1


def _tool_ui_action(msg: ToolMessage):
    """Map a successful tool result to a UI action for the frontend, or None."""
    try:
        data = json.loads(msg.content)
    except Exception:
        return None
    if data.get("status") != "success":
        return None
    if msg.name == "plan_trip":
        return {"type": "RENDER_TRIP", "payload": data.get("raw_plan")}
    if msg.name == "get_trip_logs":
        return {"type": "SHOW_LOG_SHEET", "payload": data}
    if msg.name == "export_logs_pdf":
        return {"type": "OFFER_DOWNLOAD", "payload": data}
    return None


@csrf_exempt
def chat_view(request):
    """Plain JSON chat endpoint. POST {message, thread_id, confirm} -> JSON."""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    try:
        body = json.loads(request.body)
    except Exception:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    message = (body.get("message") or "").strip()
    thread_id = (body.get("thread_id") or "default_thread").strip()
    confirm = bool(body.get("confirm", False))

    if not message and not confirm:
        return JsonResponse({"error": "Message content cannot be empty."}, status=400)

    # Simple daily rate limit (paid key protection).
    ip = get_client_ip(request)
    allowed, _ = check_daily_limit(ip)
    if not allowed:
        return JsonResponse(
            {"error": f"That's a wrap for today, driver — Rig takes {DAILY_CHAT_LIMIT} "
                      f"messages per day. Back on the air tomorrow. 10-4."},
            status=429,
        )

    if not DATABASE_URL:
        return JsonResponse(
            {"error": "Rig is offline: no database configured (set DATABASE_URL to Supabase Postgres)."},
            status=503,
        )

    # Open a Postgres connection for the LangGraph checkpointer (thread memory).
    try:
        conn = psycopg.connect(DATABASE_URL, prepare_threshold=None, autocommit=True)
        saver = PostgresSaver(conn)
        saver.setup()
        graph = workflow.compile(checkpointer=saver)
    except Exception as e:
        return JsonResponse({"error": f"Rig couldn't reach its memory store: {e}"}, status=503)

    config = {"configurable": {"thread_id": thread_id}}

    # Resume after a trip confirmation, or start a fresh turn.
    if confirm:
        try:
            graph.update_state(config, {"confirmed_trip": True})
            inputs = None
        except Exception as e:
            conn.close()
            return JsonResponse({"error": f"Failed to resume the trip: {e}"}, status=400)
    else:
        inputs = {"messages": [HumanMessage(content=message)]}

    reply_text = ""
    citations = []
    ui_actions = []
    needs_confirmation = None
    _seen_citations = set()

    def _add_citations(items):
        for c in items or []:
            key = (c.get("source"), c.get("page_range"), c.get("title"))
            if key in _seen_citations:
                continue
            _seen_citations.add(key)
            citations.append(c)

    try:
        # Run the graph to completion, aggregating node updates into one response.
        for chunk in graph.stream(inputs, config, stream_mode="updates"):
            for node_name, updates in chunk.items():
                # Human-in-the-loop: langgraph emits the trip-confirm interrupt as a
                # special "__interrupt__" update (a tuple of Interrupt objects), not a
                # raised exception. Capture it so the UI can show the confirm card.
                if node_name == "__interrupt__":
                    for it in updates:
                        try:
                            payload = json.loads(it.value)
                        except Exception:
                            continue
                        if payload.get("type") == "TRIP_CONFIRMATION_REQUIRED":
                            needs_confirmation = payload.get("payload")
                    continue
                if not isinstance(updates, dict):
                    continue
                for msg in updates.get("messages", []):
                    if isinstance(msg, ToolMessage):
                        action = _tool_ui_action(msg)
                        if action:
                            ui_actions.append(action)
                        # Citations now ride on the search tool results.
                        if msg.name in ("search_hos_docs", "web_search"):
                            try:
                                tdata = json.loads(msg.content)
                                _add_citations(tdata.get("citations"))
                            except Exception:
                                pass
                    elif isinstance(msg, AIMessage):
                        if msg.content:
                            if isinstance(msg.content, list):
                                text_parts = []
                                for block in msg.content:
                                    if isinstance(block, dict) and "text" in block:
                                        text_parts.append(block["text"])
                                    elif isinstance(block, str):
                                        text_parts.append(block)
                                reply_text = "".join(text_parts)
                            else:
                                reply_text = str(msg.content)

    except GraphInterrupt:
        # Human-in-the-loop: the agent wants the user to confirm a trip plan.
        try:
            state = graph.get_state(config)
            for task in state.tasks:
                for interrupt in task.interrupts:
                    try:
                        payload = json.loads(interrupt.value)
                    except Exception:
                        continue
                    if payload.get("type") == "TRIP_CONFIRMATION_REQUIRED":
                        needs_confirmation = payload.get("payload")
        except Exception as e:
            conn.close()
            return JsonResponse({"error": f"Interrupt parsing failed: {e}"}, status=500)

    except Exception as e:
        conn.close()
        return JsonResponse({"error": f"Rig hit a snag: {e}"}, status=500)

    finally:
        try:
            conn.close()
        except Exception:
            pass

    return JsonResponse({
        "reply": reply_text,
        "citations": citations,
        "ui_actions": ui_actions,
        "needs_confirmation": needs_confirmation,
    })
