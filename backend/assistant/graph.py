import os
import json
from typing import Annotated, Sequence, TypedDict, Literal
from langchain_core.messages import BaseMessage, ToolMessage, AIMessage, SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.errors import NodeInterrupt

from .tools import (
    plan_trip,
    geocode_location,
    get_trip_logs,
    export_logs_pdf,
    get_compliance_report,
    hos_quick_calc,
    search_hos_docs,
    web_search,
)

# 1. State Definition
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    confirmed_trip: bool

# Map tool names to tool functions for manual execution
TOOLS_MAP = {
    "plan_trip": plan_trip,
    "geocode_location": geocode_location,
    "get_trip_logs": get_trip_logs,
    "export_logs_pdf": export_logs_pdf,
    "get_compliance_report": get_compliance_report,
    "hos_quick_calc": hos_quick_calc,
    "search_hos_docs": search_hos_docs,
    "web_search": web_search,
}

# 2. Initialize Model
gemini_key = os.environ.get("GEMINI_API_KEY")
model_main = None

if gemini_key:
    model_main = ChatGoogleGenerativeAI(
        model=os.environ.get("GEMINI_CHAT_MODEL", "models/gemini-2.5-flash"),
        google_api_key=gemini_key,
        temperature=0.2,
        max_output_tokens=1024,
    )

# Single system prompt: one tool-calling agent. This replaces the old
# router -> grader -> {retriever|agent|direct_response} chain, which dropped
# trip requests (misrouted to un-grounded free chat) and, when routed right,
# narrated the plan in prose without ever calling the tool.
AGENT_SYSTEM_PROMPT = """You are "Rig", a seasoned trucking dispatcher inside the HAULR app.
Speak briefly and helpfully with a light CB-radio tone ("10-4", "driver", "copy that"), but never at the expense of accuracy.

You have tools. Follow these rules exactly:

PLANNING A TRIP
- To plan a trip you need FOUR things: current_location, pickup_location, dropoff_location, and cycle_used_hrs (hours already used on the 70-hour cycle).
- The MOMENT you have all four, call `plan_trip` immediately. Do NOT describe or summarize the plan in prose without calling the tool — describing a plan you did not actually compute is a failure.
- If one or more of the four are missing, ask only for the missing pieces. Do not guess or invent locations or hours.
- Never claim a trip is planned, logs are ready, or a PDF is exported unless the matching tool returned status "success".

RULES & REGULATIONS (source of truth)
- For ANY question about Hours of Service, driving/on-duty limits, breaks, the 70-hour cycle, 34-hour restart, daily log requirements, or how to use HAULR: call `search_hos_docs` FIRST.
- Answer ONLY from the chunks it returns, and add inline citations: [Page X] for the FMCSA guide, [App FAQ] for the app FAQ.
- If `search_hos_docs` returns nothing useful, say so plainly. You may then use `web_search` for outside context, but make clear it is not from the official FMCSA guide.

LIVE / WEB INFO
- For things NOT in the FMCSA guide (current fuel prices, weather, road/weigh-station closures, state idling or chain laws, recent regulation changes, general trucking questions): use `web_search`.
- When you answer from `web_search`, tell the driver the info came from the web and may need verifying. The FMCSA guide always outranks the web on HOS rules.

OTHER TOOLS
- Use `get_trip_logs`, `get_compliance_report`, `export_logs_pdf`, `geocode_location`, and `hos_quick_calc` as needed for their described purpose.

GENERAL
- Stay on trucking, HOS, routing, and HAULR topics. Do not invent rules, numbers, prices, or facts. If you don't know and can't look it up, say so.
"""

# 3. Graph Node Implementations
def agent_node(state: AgentState):
    """The single agent: binds all tools and decides whether to call one."""
    if not model_main:
        return {"messages": [AIMessage(content="Rig is offline — no Gemini key configured, driver.")]}

    model_with_tools = model_main.bind_tools(list(TOOLS_MAP.values()))

    response = model_with_tools.invoke([
        SystemMessage(content=AGENT_SYSTEM_PROMPT),
        *state["messages"],
    ])

    return {"messages": [response]}

def execute_tools_node(state: AgentState):
    """Executes tool calls, with a human-in-the-loop confirm before planning."""
    messages = state["messages"]
    last_msg = messages[-1]

    tool_messages = []

    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        for tool_call in last_msg.tool_calls:
            name = tool_call["name"]
            args = tool_call["args"]
            tool_id = tool_call["id"]

            # Human-in-the-loop: confirm before actually planning a trip.
            if name == "plan_trip" and not state.get("confirmed_trip", False):
                pending = {
                    "current_location": args.get("current_location"),
                    "pickup_location": args.get("pickup_location"),
                    "dropoff_location": args.get("dropoff_location"),
                    "cycle_used_hrs": args.get("cycle_used_hrs"),
                }
                # Suspend execution until the user approves in the UI.
                raise NodeInterrupt(json.dumps({
                    "type": "TRIP_CONFIRMATION_REQUIRED",
                    "payload": pending,
                    "tool_call_id": tool_id,
                }))

            tool_func = TOOLS_MAP.get(name)
            if tool_func:
                try:
                    tool_result = tool_func.invoke(args)
                except Exception as e:
                    tool_result = json.dumps({"status": "error", "message": str(e)})
            else:
                tool_result = json.dumps({"status": "error", "message": f"Tool '{name}' not found."})

            tool_messages.append(ToolMessage(
                content=tool_result,
                tool_call_id=tool_id,
                name=name,
            ))

    # Clear the confirm flag once the plan (or any tool batch) has run.
    return {"messages": tool_messages, "confirmed_trip": False}

# 4. Route Decider
def route_tools(state: AgentState) -> Literal["execute_tools", "__end__"]:
    last_msg = state["messages"][-1]
    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        return "execute_tools"
    return "__end__"

# 5. Build StateGraph
workflow = StateGraph(AgentState)

workflow.add_node("agent", agent_node)
workflow.add_node("execute_tools", execute_tools_node)

workflow.add_edge(START, "agent")
workflow.add_conditional_edges(
    "agent",
    route_tools,
    {
        "execute_tools": "execute_tools",
        "__end__": END,
    },
)
# Loop back to the agent after tools so it can explain/cite the results.
workflow.add_edge("execute_tools", "agent")

# Compiled without a checkpointer for import-time safety; views.py compiles
# the same workflow with the Postgres checkpointer for thread memory + HITL.
compiled_graph = workflow.compile()
