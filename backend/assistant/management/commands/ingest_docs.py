import os
import json
import pypdf
from django.core.management.base import BaseCommand
from django.db import connection
from langchain_google_genai import GoogleGenerativeAIEmbeddings

class Command(BaseCommand):
    help = "Ingest FMCSA Hours of Service guide and App FAQ into Supabase pgvector"

    def handle(self, *args, **options):
        # 1. Initialize embeddings model
        gemini_key = os.environ.get("GEMINI_API_KEY")
        if not gemini_key:
            self.stdout.write(self.style.ERROR("GEMINI_API_KEY environment variable is missing"))
            return

        self.stdout.write("Initializing Gemini Embedding model...")
        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=gemini_key,
            output_dimensionality=768
        )

        # 2. Paths
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        pdf_path = os.path.join(base_dir, "docs", "fmcsa-hos-guide.pdf")
        faq_path = os.path.join(base_dir, "docs", "app-faq.md")

        self.stdout.write(f"PDF Path: {pdf_path}")
        self.stdout.write(f"FAQ Path: {faq_path}")

        # 3. Read and Chunk FAQ (Markdown)
        faq_chunks = []
        if os.path.exists(faq_path):
            self.stdout.write("Processing App FAQ markdown...")
            with open(faq_path, "r", encoding="utf-8") as f:
                faq_text = f.read()
            
            # Simple markdown section parser
            sections = faq_text.split("\n## ")
            # First part is title
            faq_title = sections[0].replace("# ", "").strip()
            
            for section in sections[1:]:
                lines = section.split("\n")
                section_title = lines[0].strip()
                section_content = "\n".join(lines[1:]).strip()
                
                content_to_embed = f"{faq_title} > {section_title}\n\n{section_content}"
                faq_chunks.append({
                    "content": content_to_embed,
                    "metadata": {
                        "source": "app-faq",
                        "title": section_title,
                        "category": faq_title
                    }
                })
            self.stdout.write(f"Extracted {len(faq_chunks)} FAQ chunks.")
        else:
            self.stdout.write(self.style.WARNING("app-faq.md not found in docs directory."))

        # 4. Read and Chunk FMCSA PDF Guide
        pdf_chunks = []
        if os.path.exists(pdf_path):
            self.stdout.write("Processing FMCSA HOS guide PDF...")
            reader = pypdf.PdfReader(pdf_path)
            total_pages = len(reader.pages)
            
            # We will group text into chunks of ~3000 characters (~750 tokens) with ~500 chars overlap
            # Let's extract text page-by-page
            page_texts = []
            for i in range(total_pages):
                page_text = reader.pages[i].extract_text()
                page_texts.append((i + 1, page_text))
            
            # Simple text chunking by characters across pages
            chunk_size = 3000
            chunk_overlap = 500
            
            current_chunk_text = ""
            current_chunk_pages = []
            
            for page_num, text in page_texts:
                if not text.strip():
                    continue
                # Split page text into paragraphs
                paragraphs = text.split("\n\n")
                for p in paragraphs:
                    p = p.strip()
                    if not p:
                        continue
                    if len(current_chunk_text) + len(p) > chunk_size and current_chunk_text:
                        pdf_chunks.append({
                            "content": f"FMCSA HOS Guide > Pages {', '.join(map(str, current_chunk_pages))}\n\n{current_chunk_text}",
                            "metadata": {
                                "source": "fmcsa-hos-guide",
                                "pages": current_chunk_pages,
                                "page_range": f"{current_chunk_pages[0]}-{current_chunk_pages[-1]}" if len(current_chunk_pages) > 1 else str(current_chunk_pages[0])
                            }
                        })
                        # Overlap: keep the last chunk_overlap characters
                        overlap_start = max(0, len(current_chunk_text) - chunk_overlap)
                        current_chunk_text = current_chunk_text[overlap_start:]
                        # Reset pages tracking but keep the last page as part of overlap
                        current_chunk_pages = [current_chunk_pages[-1]] if current_chunk_pages else [page_num]
                    
                    current_chunk_text += "\n\n" + p if current_chunk_text else p
                    if page_num not in current_chunk_pages:
                        current_chunk_pages.append(page_num)
            
            if current_chunk_text:
                pdf_chunks.append({
                    "content": f"FMCSA HOS Guide > Pages {', '.join(map(str, current_chunk_pages))}\n\n{current_chunk_text}",
                    "metadata": {
                        "source": "fmcsa-hos-guide",
                        "pages": current_chunk_pages,
                        "page_range": f"{current_chunk_pages[0]}-{current_chunk_pages[-1]}" if len(current_chunk_pages) > 1 else str(current_chunk_pages[0])
                    }
                })
            self.stdout.write(f"Extracted {len(pdf_chunks)} chunks from FMCSA PDF.")
        else:
            self.stdout.write(self.style.WARNING("fmcsa-hos-guide.pdf not found in docs directory."))

        all_chunks = faq_chunks + pdf_chunks
        if not all_chunks:
            self.stdout.write(self.style.ERROR("No chunks to ingest! Check your documents."))
            return

        # 5. Connect and Ingest Chunks
        self.stdout.write(f"Deleting existing records for 'fmcsa-hos-guide' and 'app-faq'...")
        with connection.cursor() as cur:
            cur.execute("DELETE FROM documents WHERE metadata->>'source' IN ('fmcsa-hos-guide', 'app-faq');")
            deleted_count = cur.rowcount
            self.stdout.write(f"Deleted {deleted_count} stale documents.")

        self.stdout.write(f"Generating embeddings and ingesting {len(all_chunks)} chunks...")
        
        success_count = 0
        for idx, chunk in enumerate(all_chunks):
            content = chunk["content"]
            metadata = chunk["metadata"]
            
            try:
                # Generate embedding
                embedding = embeddings.embed_query(content)
                embedding_str = "[" + ",".join(str(val) for val in embedding) + "]"
                
                with connection.cursor() as cur:
                    cur.execute(
                        "INSERT INTO documents (content, metadata, embedding) VALUES (%s, %s, %s::vector)",
                        [content, json.dumps(metadata), embedding_str]
                    )
                success_count += 1
                if success_count % 10 == 0:
                    self.stdout.write(f"Ingested {success_count}/{len(all_chunks)} chunks...")
            except Exception as e:
                self.stderr.write(self.style.ERROR(f"Error ingesting chunk {idx}: {e}"))

        self.stdout.write(self.style.SUCCESS(f"Successfully ingested {success_count} documents!"))
