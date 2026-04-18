import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use((req, res, next) => {
  console.log(`[Server] ${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: '100mb' }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
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
