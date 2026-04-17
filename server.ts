import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import mammoth from "mammoth";
import { fileURLToPath } from "url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// PDF extraction helper using pdfjs-dist (more stable on serverless)
async function extractPdfText(buffer: Buffer) {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ 
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdfDoc = await loadingTask.promise;
  let fullText = "";
  
  // Limiting to first 100 pages to avoid serverless timeouts
  const pageCount = Math.min(pdfDoc.numPages, 100);
  
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    fullText += strings.join(" ") + "\n";
  }
  
  return fullText;
}

// Configure multer for file uploads with clear limits
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 100 * 1024 * 1024, // 100MB limit for PDFs
    fieldSize: 10 * 1024 * 1024
  }
});

app.use((req, res, next) => {
  console.log(`[Server] ${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: '100mb' }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// API Routes
app.post("/api/parse", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error("[Multer Error]", err);
      return res.status(400).json({ error: "File upload error", details: err.message });
    } else if (err) {
      console.error("[Upload Error]", err);
      return res.status(500).json({ error: "Unknown upload error", details: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log(`[API] Processing: ${req.file.originalname}`);
    const { buffer, originalname, mimetype } = req.file;
    const filename = Buffer.from(originalname, 'latin1').toString('utf8');
    let text = "";

    if (mimetype === "application/pdf") {
      try {
        console.log(`[API] Starting PDF parse for: ${filename} using pdfjs-dist`);
        text = await extractPdfText(buffer);
        console.log(`[API] Successfully parsed PDF: ${filename} (${text.length} chars)`);
      } catch (pdfError) {
        console.error("[API] PDF parse error details:", pdfError);
        const errorMsg = pdfError instanceof Error ? pdfError.message : String(pdfError);
        throw new Error(`PDF parsing failed (pdfjs): ${errorMsg}`);
      }
    } else if (
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
      console.log(`[API] Successfully parsed DOCX: ${filename}`);
    } else if (mimetype === "text/plain") {
      text = buffer.toString("utf8");
      console.log(`[API] Successfully read TXT: ${filename}`);
    } else {
      console.warn(`[API] Unsupported file type: ${mimetype}`);
      return res.status(400).json({ error: "Unsupported file type" });
    }

    if (!text || text.trim().length === 0) {
      console.warn(`[API] No text extracted from: ${filename}`);
    }

    res.json({ text, filename });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[API] General Parse error:", errorMessage);
    res.status(500).json({ 
      error: "Failed to parse document", 
      details: errorMessage,
      suggestion: "If the PDF is too complex or encrypted, try converting it to a simpler format or a different PDF version."
    });
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
