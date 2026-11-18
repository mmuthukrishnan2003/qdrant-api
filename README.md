# Advanced Qdrant Vector DB & AI Knowledge Base API

A production-grade, local-first Vector Database CRUD, Hybrid Search, and RAG API built with Node.js and Express.

---

## Local Architecture Topology

- **Node.js REST API**: `http://127.0.0.1:8003`
- **Qdrant Vector Database**: `http://127.0.0.1:6333`
- **Python Embedding API**: `http://127.0.0.1:8002` (1024-dim vectors)
- **Local vLLM / LLM Server**: `http://127.0.0.1:8000/v1`

---

## Complete API Reference (7 Categories, 41 Endpoints)

### 1. Collection Management APIs
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/collections/create` | Create a new Qdrant vector collection |
| `GET` | `/api/collections` | List all collections |
| `GET` | `/api/collections/:name` | Retrieve collection details and configuration |
| `PUT` | `/api/collections/:name` | Update collection parameters (optimizers, HNSW) |
| `DELETE` | `/api/collections/:name` | Delete a collection |
| `POST` | `/api/collections/:name/optimize` | Trigger background optimization cycle |

### 2. Point Management APIs
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/points/insert` | Insert single point (auto-embeds text if vector omitted) |
| `PUT` | `/api/points/update` | Update point vector and/or payload |
| `GET` | `/api/points/:id` | Retrieve point by ID |
| `POST` | `/api/points/batch` | Batch insert points with max 32 items per embedding call |
| `DELETE` | `/api/points/delete` | Delete point(s) by ID or array of IDs |
| `POST` | `/api/points/upsert` | Insert or replace points |
| `POST` | `/api/points/count` | Count points with optional payload filter |
| `POST` | `/api/points/scroll` | Paginate / browse stored points |

### 3. Vector Search APIs
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/points/search` | Semantic vector search |
| `POST` | `/api/points/search/hybrid` | Hybrid search (dense vector + keyword payload match) |
| `POST` | `/api/points/search/filter` | Search with structured metadata filters |
| `POST` | `/api/points/search/multi` | Execute multiple search queries in a single batch |
| `POST` | `/api/points/recommend` | Recommend similar records using positive/negative point IDs |
| `POST` | `/api/points/discover` | Discover related points using target & context constraints |
| `POST` | `/api/points/search/advanced` | Advanced search with score threshold, exact flags, & params |

### 4. Payload / Metadata APIs
| Method | Endpoint | Description |
|---|---|---|
| `PUT` | `/api/points/payload` | Set or update payload metadata on points |
| `PATCH` | `/api/points/payload` | Partial update / merge selected payload fields |
| `DELETE` | `/api/points/payload` | Remove specific payload keys from points |
| `POST` | `/api/points/payload/filter` | Query points solely matching payload filter criteria |
| `POST` | `/api/points/payload/index` | Create payload field index (keyword, integer, float, text) |

### 5. Import and Export APIs
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/import/json` | Import JSON dataset with validation & batching |
| `POST` | `/api/import/csv` | Import RFC 4180 CSV dataset |
| `POST` | `/api/import/bulk` | High-throughput bulk import |
| `POST` | `/api/import/preview` | Dry-run validation and summary report without inserting |
| `GET` | `/api/export/json` | Export collection points as JSON |
| `GET` | `/api/export/csv` | Export collection points as downloadable CSV |
| `GET` | `/api/export/:collection` | Export specific collection data as JSON |

### 6. Advanced AI / RAG APIs
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/embeddings/generate` | Generate 1024-d embeddings via local port 8002 |
| `POST` | `/api/rag/query` | Retrieve grounded context blocks for a query |
| `POST` | `/api/rag/answer` | Generate grounded answers via local vLLM (port 8000) |
| `POST` | `/api/rag/chat` | Multi-turn conversational RAG with context injection |
| `POST` | `/api/rag/stream` | Server-Sent Events (SSE) streaming answer from local vLLM |
| `POST` | `/api/rag/ingest` | Chunk document, generate embeddings, and insert |
| `POST` | `/api/rag/reindex` | Recompute embeddings for a document or collection |
| `POST` | `/api/rag/delete-document` | Delete document and all associated chunk points |

### 7. Monitoring and Administration APIs
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check for API, Qdrant, Embedding, and vLLM |
| `GET` | `/api/status` | Uptime, system memory, and request metrics |
| `GET` | `/api/stats` | Global database statistics |
| `GET` | `/api/collections/:name/stats` | Detailed statistics and segment information for collection |
| `GET` | `/api/points/:id/history` | Point change audit history |
| `GET` | `/api/logs` | Real-time API request and error logs |
| `GET` | `/api/config` | Active configuration and local port bindings |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the API server
npm start
# Server starts on http://127.0.0.1:8003

# 3. Dry-run import sample dataset
npm run import:preview -- data/sample_chunks.json

# 4. Import your Sendbasket chunks dataset
npm run import -- data/sendbasket_qdrant_chunks_v4\ 100\ -\ 133\(1\).json
```
