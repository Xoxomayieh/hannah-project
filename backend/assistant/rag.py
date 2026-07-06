import os
import json
from django.db import connection
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from dotenv import load_dotenv

load_dotenv()

# Global embeddings model
gemini_key = os.environ.get("GEMINI_API_KEY")
embeddings = None
if gemini_key:
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=gemini_key,
        output_dimensionality=768
    )

def search_documents(query: str) -> list[Document]:
    """
    Perform a hybrid RAG search combining:
    1. Cosine similarity using pgvector (top 8)
    2. Postgres Full Text Search (FTS) using plainto_tsquery (top 8)
    Combined using Reciprocal Rank Fusion (RRF) to output the top 4 docs.
    """
    if not embeddings:
        return []

    vector_results = []
    fts_results = []

    # 1. Vector Search
    try:
        query_vector = embeddings.embed_query(query)
        vector_str = "[" + ",".join(str(val) for val in query_vector) + "]"
        
        with connection.cursor() as cur:
            # Query pgvector directly using the cosine distance operator (<=>)
            cur.execute("""
                SELECT id, content, metadata, 1 - (embedding <=> %s::vector) as similarity
                FROM documents
                ORDER BY embedding <=> %s::vector
                LIMIT 8;
            """, [vector_str, vector_str])
            vector_results = cur.fetchall()
    except Exception as e:
        # Graceful fallback: log and proceed
        print(f"RAG: Vector similarity search failed: {e}")

    # 2. Postgres Full Text Search
    try:
        with connection.cursor() as cur:
            cur.execute("""
                SELECT id, content, metadata, ts_rank_cd(to_tsvector('english', content), query) as rank
                FROM documents, plainto_tsquery('english', %s) query
                WHERE to_tsvector('english', content) @@ query
                ORDER BY rank DESC
                LIMIT 8;
            """, [query])
            fts_results = cur.fetchall()
    except Exception as e:
        # Graceful fallback: log and proceed
        print(f"RAG: Full text search failed: {e}")

    # 3. Reciprocal Rank Fusion (RRF)
    scores = {}
    doc_map = {}

    # Process vector ranks (1-based index)
    for rank, row in enumerate(vector_results):
        doc_id = row[0]
        content = row[1]
        # Handle metadata which might be string or dict
        metadata = row[2] if isinstance(row[2], dict) else json.loads(row[2] or '{}')
        doc_map[doc_id] = (content, metadata)
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (60.0 + (rank + 1))

    # Process FTS ranks (1-based index)
    for rank, row in enumerate(fts_results):
        doc_id = row[0]
        content = row[1]
        metadata = row[2] if isinstance(row[2], dict) else json.loads(row[2] or '{}')
        doc_map[doc_id] = (content, metadata)
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (60.0 + (rank + 1))

    # Sort documents by RRF score descending
    sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)

    # 4. Construct LangChain Documents for top 4
    top_documents = []
    for doc_id in sorted_ids[:4]:
        content, metadata = doc_map[doc_id]
        # Store computed RRF score in metadata
        metadata["rrf_score"] = scores[doc_id]
        top_documents.append(Document(page_content=content, metadata=metadata))

    return top_documents
