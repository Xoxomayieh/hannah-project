const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export interface ChatMessageRequest {
  message: string;
  thread_id: string;
  confirm?: boolean;
}

export type Citation = {
  source: string;
  page_range: string;
  title?: string;
  snippet: string;
};

export type UIEvent =
  | { type: "RENDER_TRIP"; payload: any }
  | { type: "SHOW_LOG_SHEET"; payload: any }
  | { type: "OFFER_DOWNLOAD"; payload: any };

export type TripParams = {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  cycle_used_hrs: number;
};

export interface ChatResponse {
  reply: string;
  citations: Citation[];
  ui_actions: UIEvent[];
  needs_confirmation: TripParams | null;
}

/**
 * Plain request/response chat call (no streaming). Rig runs the LangGraph
 * agent to completion server-side and returns one JSON payload.
 */
export async function sendChat(request: ChatMessageRequest): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/api/assistant/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.error) errorMsg = errJson.error;
    } catch {
      /* keep default */
    }
    throw new Error(errorMsg);
  }

  const data = (await response.json()) as Partial<ChatResponse>;
  return {
    reply: data.reply ?? "",
    citations: data.citations ?? [],
    ui_actions: data.ui_actions ?? [],
    needs_confirmation: data.needs_confirmation ?? null,
  };
}
