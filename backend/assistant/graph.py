import os
import json
from typing import Annotated, Sequence, TypedDict, Literal
from langchain_core.messages import BaseMessage, ToolMessage, AIMessage, SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.errors import NodeInterrupt
from langgraph.checkpoint.postgres import PostgresSaver

from .rag import search_documents
from .tools import (
    plan_trip,
    geocode_location,
    get_trip_logs,
    export_logs_pdf,
    get_compliance_report,
    hos_quick_calc
)

# 1. State Definition
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    confirmed_trip: bool
    pending_trip: dict  # Holds arguments for plan_trip before user confirms

# Map tool names to tool functions for manual execution
TOOLS_MAP = {
    "plan_trip": plan_trip,
    "geocode_location": geocode_location,
    "get_trip_logs": get_trip_logs,
    "export_logs_pdf": export_logs_pdf,
    "get_compliance_report": get_compliance_report,
    "hos_quick_calc": hos_quick_calc
}

# 2. Initialize Models
gemini_key = os.environ.get("GEMINI_API_KEY")
model_main = None
model_lite = None

if gemini_key:
    # Capped output tokens and temperature for deterministic and safe chatbot replies
    model_main = ChatGoogleGenerativeAI(
        model=os.environ.get("GEMINI_CHAT_MODEL", "models/gemini-2.5-flash"),
        google_api_key=gemini_key,
        temperature=0.2,
        max_output_tokens=1024,
        streaming=True
    )
    model_lite = ChatGoogleGenerativeAI(
        model=os.environ.get("GEMINI_LITE_MODEL", "models/gemini-2.5-flash-lite"),
        google_api_key=gemini_key,
        temperature=0.0
    )

# System prompts
ROUTER_SYSTEM_PROMPT = """You are a routing system for a trucking dispatch AI assistant ("Rig").
Classify the user's latest query into one of three intents:
1. "rag": Questions about FMCSA Hours of Service (HOS) rules, trucking regulations, daily log requirements, and FAQ about using the HAULR application.
2. "tools": Direct actions like planning a trip, geocoding a location, viewing trip logs, calculations of remaining HOS limits, and downloading or exporting PDF logs.
3. "chat": Small talk, greetings, general CB radio slang, or requests for assistant help/capabilities.

Respond ONLY with a JSON object in this format: {"intent": "rag" | "tools" | "chat"}"""

RAG_GRADER_SYSTEM_PROMPT = """Evaluate if the provided document chunk is relevant to the user query.
Respond ONLY with {"relevant": true} or {"relevant": false}."""

RAG_ANSWER_SYSTEM_PROMPT = """You are "Rig", a seasoned trucking dispatcher with a helpful, direct, and concise CB-radio flavor.
Answer the user's query using ONLY the provided document context. 
You MUST provide inline citation links using format: [Page X] or [App FAQ] if citing the app's FAQ.
Format citation names clearly to match the source metadata.
If the answer cannot be found in the context, state that you don't know based on the guide, and offer the official FMCSA website link. Do NOT hallucinate rules or regulations.

Context:
{context}"""

AGENT_SYSTEM_PROMPT = """You are "Rig", a seasoned trucking dispatcher.
You help drivers plan routes, check logs, export PDFs, and calculate Hours of Service constraints.
You can call tools to perform actions like plan_trip, geocode_location, get_trip_logs, export_logs_pdf, and hos_quick_calc.
Be brief, helpful, and speak with a light CB radio dispatch tone ("10-4", "driver", "copy that").
Always explain what you are doing before you call a tool."""

# 3. Graph Node Implementations
def router_node(state: AgentState):
    """Classifies user intent and routes to RAG, Tools, or Chat."""
    if not model_lite:
        return {"messages": []}
    
    last_message = state["messages"][-1].content
    
    response = model_lite.invoke([
        SystemMessage(content=ROUTER_SYSTEM_PROMPT),
        state["messages"][-1]
    ])
    
    try:
        data = json.loads(response.content.strip().replace("```json", "").replace("```", ""))
        intent = data.get("intent", "chat")
    except Exception:
        intent = "chat"
        
    # Inject routing decision in intermediate state
    return {"pending_trip": {"intent": intent}}

def retriever_node(state: AgentState):
    """Fetches documents, grades relevance, and generates cited response."""
    last_query = state["messages"][-1].content
    docs = search_documents(last_query)
    
    relevant_docs = []
    # Grade docs for relevance
    for doc in docs:
        if model_lite:
            grade_resp = model_lite.invoke([
                SystemMessage(content=RAG_GRADER_SYSTEM_PROMPT),
                HumanMessage(content=f"Doc: {doc.page_content}\n\nQuery: {last_query}")
            ])
            try:
                data = json.loads(grade_resp.content.strip().replace("```json", "").replace("```", ""))
                if data.get("relevant", False):
                    relevant_docs.append(doc)
            except Exception:
                relevant_docs.append(doc)
        else:
            relevant_docs.append(doc)
            
    if not relevant_docs:
        answer = "I checked the FMCSA HOS regulations and application FAQs, but couldn't find a direct answer to that, driver. You might want to double check the official FMCSA site at https://www.fmcsa.dot.gov/regulations/hours-of-service."
        return {"messages": [AIMessage(content=answer)]}
        
    # Format context for answer generation
    context_str = ""
    for idx, doc in enumerate(relevant_docs):
        src = doc.metadata.get("source", "fmcsa-hos-guide")
        page_range = doc.metadata.get("page_range", "N/A")
        title = doc.metadata.get("title", "")
        
        doc_header = f"--- Source {idx+1}: {src}"
        if src == "fmcsa-hos-guide":
            doc_header += f", Page(s) {page_range}"
        else:
            doc_header += f" ({title})"
        
        context_str += f"{doc_header} ---\n{doc.page_content}\n\n"
        
    response = model_main.invoke([
        SystemMessage(content=RAG_ANSWER_SYSTEM_PROMPT.format(context=context_str)),
        *state["messages"]
    ])
    
    # Inject citation metadata so the SSE view can pass it to the frontend
    citations = []
    for doc in relevant_docs:
        citations.append({
            "source": doc.metadata.get("source"),
            "page_range": doc.metadata.get("page_range"),
            "title": doc.metadata.get("title"),
            "snippet": doc.page_content[:200] + "..."
        })
        
    ai_msg = AIMessage(content=response.content)
    ai_msg.additional_kwargs["citations"] = citations
    
    return {"messages": [ai_msg]}

def direct_response_node(state: AgentState):
    """Simple conversational responses."""
    response = model_main.invoke([
        SystemMessage(content="You are Rig, a friendly trucking dispatcher. Greet the driver and help them with their questions about planning or logs."),
        *state["messages"]
    ])
    return {"messages": [AIMessage(content=response.content)]}

def agent_node(state: AgentState):
    """The main agent loop which binds tools and decides to execute them."""
    if not model_main:
        return {"messages": []}
        
    model_with_tools = model_main.bind_tools(list(TOOLS_MAP.values()))
    
    response = model_with_tools.invoke([
        SystemMessage(content=AGENT_SYSTEM_PROMPT),
        *state["messages"]
    ])
    
    return {"messages": [response]}

def execute_tools_node(state: AgentState):
    """Manages manual execution of tools and implements human-in-the-loop interrupts."""
    messages = state["messages"]
    last_msg = messages[-1]
    
    tool_messages = []
    updated_pending_trip = state.get("pending_trip") or {}
    
    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        for tool_call in last_msg.tool_calls:
            name = tool_call["name"]
            args = tool_call["args"]
            tool_id = tool_call["id"]
            
            # Implementation of human-in-the-loop confirm before planning
            if name == "plan_trip" and not state.get("confirmed_trip", False):
                # Save planning arguments in state and raise NodeInterrupt
                # This suspends execution until the user approves
                pending = {
                    "current_location": args.get("current_location"),
                    "pickup_location": args.get("pickup_location"),
                    "dropoff_location": args.get("dropoff_location"),
                    "cycle_used_hrs": args.get("cycle_used_hrs")
                }
                # Raise NodeInterrupt to pause flow
                raise NodeInterrupt(json.dumps({
                    "type": "TRIP_CONFIRMATION_REQUIRED",
                    "payload": pending,
                    "tool_call_id": tool_id
                }))
            
            # Execute the tool
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
                name=name
            ))
            
    # Reset pending trip and confirmed_trip flags once executed
    return {
        "messages": tool_messages,
        "confirmed_trip": False,
        "pending_trip": {}
    }

# 4. Route Deciders
def route_intent(state: AgentState) -> Literal["retriever", "agent", "direct_response"]:
    intent = state.get("pending_trip", {}).get("intent", "chat")
    if intent == "rag":
        return "retriever"
    elif intent == "tools":
        return "agent"
    return "direct_response"

def route_tools(state: AgentState) -> Literal["execute_tools", "__end__"]:
    last_msg = state["messages"][-1]
    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        return "execute_tools"
    return "__end__"

# 5. Build StateGraph
workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("router", router_node)
workflow.add_node("retriever", retriever_node)
workflow.add_node("direct_response", direct_response_node)
workflow.add_node("agent", agent_node)
workflow.add_node("execute_tools", execute_tools_node)

# Add Edges
workflow.add_edge(START, "router")

# Route conditional from router
workflow.add_conditional_edges(
    "router",
    route_intent,
    {
        "retriever": "retriever",
        "agent": "agent",
        "direct_response": "direct_response"
    }
)

workflow.add_edge("retriever", END)
workflow.add_edge("direct_response", END)

# Route conditional from agent
workflow.add_conditional_edges(
    "agent",
    route_tools,
    {
        "execute_tools": "execute_tools",
        "__end__": END
    }
)

# Loop back to agent after tool execution to explain results
workflow.add_edge("execute_tools", "agent")

# Compile with postgres checkpointer saver context manager
# In views, we'll compile or run using a Postgres connection
# The compiled graph object is exported below
compiled_graph = workflow.compile()
