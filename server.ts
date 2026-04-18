import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Initialize Gemini on Server
let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (aiInstance) return aiInstance;
  const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not found in server environment");
  aiInstance = new GoogleGenAI({ apiKey: key });
  return aiInstance;
};

app.use((req, res, next) => {
  console.log(`[Server] ${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: '100mb' }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

/**
 * AI Proxy Routes
 */
app.post("/api/ai/generate", async (req, res) => {
  try {
    const { prompt, config } = req.body;
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config
    });
    res.json({ text: response.text });
  } catch (err: any) {
    console.error("AI Proxy Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ai/embed", async (req, res) => {
  try {
    const { text } = req.body;
    const ai = getAI();
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: [{ parts: [{ text }] }],
    });
    res.json({ embedding: result.embeddings[0].values });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vite middleware logic
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[Fatal Error]", err);
  if (!res.headersSent) {
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// For local development and our container
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  setupServer().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  });
}

// Export for Vercel
export default app;
