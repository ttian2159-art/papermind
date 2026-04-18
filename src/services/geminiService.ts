import { Chunk } from "../types";

const handleProxyError = async (res: Response) => {
  const data = await res.json();
  const errorMessage = data.error || "未知服务器错误";
  
  if (errorMessage.includes("403") || errorMessage.includes("PERMISSION_DENIED")) {
    throw new Error("后端代理 403: Google 依然拒绝了请求。请确保您在 Netlify 设置的是最新的、在 'New Project' 中生成的 API Key。");
  }
  
  throw new Error(errorMessage);
};

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch("/api/ai/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  
  if (!res.ok) return handleProxyError(res);
  const data = await res.json();
  return data.embedding;
}

export async function generateAnswer(question: string, context: string) {
  const prompt = `You are DocMind, an expert academic document assistant. Use the following context to answer the user's question accurately. 
  
  ### 要求 (Requirements):
  1. 使用标准的 Markdown 格式进行回复（使用标题、加粗、列表、表格、代码块等）。
  2. 如果回答涉及多个维度的对比，请务必使用 Markdown 表格。
  3. 语言必须严谨、专业，且与用户的提问语言保持一致（如用户用中文提问，则用中文回答）。
  4. 始终引用 identifiable 来源。

  Context:
  ${context}

  Question: ${question}`;

  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  
  if (!res.ok) return handleProxyError(res);
  const data = await res.json();
  return data.text;
}

export async function analyzeDocument(text: string, template: 'research' | 'business' | 'general' = 'research') {
  const prompt = `Analyze this academic paper. 
  1. Extract Research Problem (研究问题), Methodology (方法), Data Sources (数据来源), Conclusions (结论), and Limitations (局限性).
  2. Extract themes and entities.
  3. Provide a summary and key takeaways.
  
  RESPOND IN CHINESE.
  
  Document Text:
  ${text.slice(0, 30000)}`;

  // Use the same schema as before
  const config = {
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING" },
        takeaways: { type: "ARRAY", items: { type: "STRING" } },
        entities: { type: "ARRAY", items: { type: "STRING" } },
        themes: { type: "ARRAY", items: { type: "STRING" } },
        keywords: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              text: { type: "STRING" },
              value: { type: "NUMBER" }
            },
            required: ["text", "value"]
          }
        },
        researchData: {
          type: "OBJECT",
          properties: {
            problem: { type: "STRING", description: "研究问题" },
            methodology: { type: "STRING", description: "研究方法" },
            dataSources: { type: "STRING", description: "数据来源" },
            conclusions: { type: "STRING", description: "主要结论" },
            limitations: { type: "STRING", description: "局限性与不足" }
          },
          required: ["problem", "methodology", "dataSources", "conclusions", "limitations"]
        },
        tableData: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            additionalProperties: { type: "STRING" }
          }
        }
      },
      required: ["summary", "takeaways", "entities", "themes", "keywords", "researchData"]
    }
  };

  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, config })
  });
  
  if (!res.ok) return handleProxyError(res);
  const data = await res.json();
  
  try {
    return { ...JSON.parse(data.text || "{}"), template };
  } catch (e) {
    console.error("Failed to parse analysis:", e);
    return null;
  }
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }
  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);
  return dotProduct / (mA * mB);
}

export async function generateLibrarySummary(docs: {name: string, text: string}[], length: 'short' | 'medium' | 'long' = 'medium') {
  const lengthMap = {
    short: "约 500 字左右，精炼提取最核心观点",
    medium: "约 1500 字左右，详细综述研究现状",
    long: "约 3000 字以上，深度分析、方法对比及未来展望"
  };

  const context = docs.map(d => `Document: ${d.name}\nContent: ${d.text.slice(0, 5000)}`).join('\n\n');
  const prompt = `You are an expert academic researcher. Generate a comprehensive "Automated Literature Review" (自动化文献综述) based on these ${docs.length} papers.
  
  ### 目标字数: ${lengthMap[length]}

  ### 要求 (Requirements):
  1. 使用标准的学术论文综述格式。
  2. 使用 Markdown 语法（标题、列表、粗体、分割线）使内容层次分明。
  3. **关键要求**：在“方法论对比分析”或适当位置，必须包含一个 **Markdown 表格**，横向对比这 ${docs.length} 篇文献的关键维度（如：数据模态、核心模型、创新点、局限性等）。
  4. 语言必须是专业、严谨的中文学术语言。

  Documents:
  ${context}`;

  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  
  if (!res.ok) return handleProxyError(res);
  const data = await res.json();
  return data.text;
}
