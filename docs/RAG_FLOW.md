# How uploaded files are saved for RAG

Important: a PDF is **not saved inside the LLM model itself**. LLMs do not update their weights when you upload a file. This app uses RAG:

1. Upload a file.
2. Extract text from the file.
3. Split the text into chunks.
4. Convert each chunk into an embedding vector.
5. Save those vectors in the local vector store at `data/rag-store.json`.
6. When you ask a question, search the saved vectors, build context from the best chunks, and send that context to the selected LLM.

## Code flow

### 1. Upload file endpoint

Change upload behavior in `rag/router.js`:

```js
router.post('/upload', upload.single('file'), async (req, res) => {
  const result = await ingestFile(
    {
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      documentId: req.body?.documentId,
    },
    { ...req.body, collection: req.body?.collection },
  );

  res.json({ ok: true, ...result });
});
```

Call it with multipart form data using field name `file`:

```bash
curl -X POST http://localhost:3000/api/rag/upload \
  -F "file=@/path/to/document.pdf" \
  -F "collection=my_docs"
```

### 2. Extract text from PDF/file

Change extraction behavior in `utils/extractor.js`:

```js
export async function extractPages(buffer, fileName = 'uploaded.file') {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.pdf') return extractPdfPages(buffer);
  if (TEXT_EXTENSIONS.has(extension)) return extractTextPages(buffer);

  throw new Error(`Unsupported file type "${extension || 'unknown'}"`);
}
```

### 3. Convert text to vector and save it

The actual vector save happens in `rag/ingest.js`:

```js
async function addVectorDocuments(collection, docs, options = {}) {
  const vectorDocs = [];

  for (const doc of docs) {
    const vector = await createVector(doc.text, options);
    vectorDocs.push({ ...doc, vector });
  }

  await queueStoreWrite(async () => {
    const store = await readStore();
    store.collections[collection] ||= { documents: [] };
    store.collections[collection].documents.push(...vectorDocs);
    await writeStore(store);
  });
}
```

If you want to save vectors somewhere else, such as ChromaDB, Pinecone, Weaviate, Postgres/pgvector, or MongoDB Atlas Vector Search, replace this function with that database client's insert/upsert code.

### 4. Ask questions from uploaded data

Question answering starts in `rag/query.js`:

```js
const matches = await similaritySearch(question, {
  collection,
  topK,
  filter: options.filter,
  embeddingProvider: options.embeddingProvider,
});
```

Then the best matching chunks are sent as context to the LLM. The LLM answers from uploaded data, but the uploaded data remains in the vector store, not in the LLM weights.

Call it like this:

```bash
curl -X POST http://localhost:3000/api/rag/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What is this document about?","collection":"my_docs"}'
```

## Environment variables

Use these in `.env`:

```env
OPENAI_API_KEY=your_key_here
DEFAULT_MODEL=openai
EMBEDDINGS_PROVIDER=openai
OPENAI_MODEL=gpt-4o
OPENAI_EMBED_MODEL=text-embedding-3-small
```

The embedding model controls the vector form saved for each uploaded chunk. The chat model controls the final answer.

To avoid saving local vectors in `data/rag-store.json`, switch to OpenAI-hosted vector storage:

```env
RAG_STORE_PROVIDER=openai
OPENAI_VECTOR_STORE_ID=vs_your_vector_store_id
```

## Can I save the uploaded PDF into the LLM model itself?

No. There is no function in this repository, or normal LLM API call, where you can push a PDF and permanently write it into the model's learned weights. For document Q&A, use one of these two approaches instead:

### Recommended: keep using RAG vectors

Your current code already saves uploaded document chunks as vectors in `data/rag-store.json`. The exact code location is `addVectorDocuments()` in `rag/ingest.js`. If you want a production database, change only the write/read store layer or `addVectorDocuments()` to use a vector database.

### Alternative: save files in an OpenAI-hosted vector store

If you want OpenAI to host the vector store instead of saving vectors in `data/rag-store.json`, use the service in `rag/openaiVectorStore.js`:

```js
import OpenAI, { toFile } from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function uploadFileToOpenAIVectorStore(buffer, fileName) {
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;

  if (!vectorStoreId) {
    throw new Error('OPENAI_VECTOR_STORE_ID is required');
  }

  const file = await toFile(buffer, fileName);
  return client.vectorStores.files.uploadAndPoll(vectorStoreId, file);
}
```

Then ask questions with OpenAI file search instead of your local `similaritySearch()`:

```js
const response = await client.responses.create({
  model: process.env.OPENAI_MODEL || 'gpt-4o',
  input: 'Answer from my uploaded file: What is this document about?',
  tools: [
    {
      type: 'file_search',
      vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID],
    },
  ],
});
```

That still does **not** save the PDF into the LLM model weights. It saves the file in a hosted vector store that the model can search at answer time.

With `RAG_STORE_PROVIDER=openai`, the existing API routes use this hosted flow:

```bash
curl -X POST http://localhost:3000/api/rag/upload \
  -F "file=@/path/to/document.pdf"

curl -X POST http://localhost:3000/api/rag/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What is this document about?"}'
```

### Fine-tuning is different

Fine-tuning trains a model for behavior, style, classification, or repeated examples. It is not the right way to upload arbitrary PDFs for question answering. For PDF Q&A, keep data in a vector store and retrieve it when the user asks a question.
