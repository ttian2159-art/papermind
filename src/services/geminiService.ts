import { GoogleGenAI, Type } from "@google/genai";
import { Chunk } from "../types";

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (aiInstance) return aiInstance;
  
  const key = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
  
  if (!key || key === "undefined" || key === "null") {
    throw new Error("API Key 未找到。请在 Netlify 环境变量中设置 VITE_GEMINI_API_KEY 并重新部署项目（需选择 Clear cache）。");
  }
  
  aiInstance = new GoogleGenAI({ apiKey: key });
  return aiInstance;
};

/**
 * 核心错误处理逻辑
 */
const handleApiError = (error: any) => {
  console.error("[AI Service Error]", error);
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes("403") || errorMessage.includes("PERMISSION_DENIED")) {
    // 专门针对 403 错误的深度提示
    throw new Error(`
      权限拒绝 (403): Google 服务器拒绝了访问。
      
      可能的原因与对策：
      1. 项目被禁用：请登录 Google Cloud Console 检查该项目是否因违反服务条款或欠费被挂起。
      2. 地区不支持：如果您在中国内地或香港，请确保您的代理（VPN）已开启且处于支持的地区（如美国、新加坡）。
      3. API 未启用：请检查 Google Cloud Console 中是否启用了 'Generative Language API'。
      4. 建议方案：去 aistudio.google.com 点击 'Create API key in NEW project' 生成一个完全独立的新项目 Key。
    `);
  }
  
  throw error;
};

export async function embedText(text: string): Promise<number[]> {
  try {
    const ai = getAI();
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: [{ parts: [{ text }] }],
    });
    return result.embeddings[0].values;
  } catch (err) {
    return handleApiError(err);
  }
}

export async function generateAnswer(question: string, context: string) {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are DocMind, an expert academic document assistant. Use the following context to answer the user's question accurately. 
      
      Context:
      ${context}

      Question: ${question}`,
    });
    return response.text;
  } catch (err) {
    return handleApiError(err);
  }
}

export async function analyzeDocument(text: string, template: 'research' | 'business' | 'general' = 'research') {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze this academic paper and return a JSON summary in Chinese.
      
      Text:
      ${text.slice(0, 30000)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            takeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
            entities: { type: Type.ARRAY, items: { type: Type.STRING } },
            themes: { type: Type.ARRAY, items: { type: Type.STRING } },
            keywords: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  value: { type: Type.NUMBER }
                },
                required: ["text", "value"]
              }
            },
            researchData: {
              type: Type.OBJECT,
              properties: {
                problem: { type: Type.STRING },
                methodology: { type: Type.STRING },
                dataSources: { type: Type.STRING },
                conclusions: { type: Type.STRING },
                limitations: { type: Type.STRING }
              },
              required: ["problem", "methodology", "dataSources", "conclusions", "limitations"]
            }
          },
          required: ["summary", "takeaways", "entities", "themes", "keywords", "researchData"]
        }
      }
    });

    return { ...JSON.parse(response.text || "{}"), template };
  } catch (err) {
    return handleApiError(err);
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

export async function generateLibrarySummary(docs: {name: string, text: string}[]) {
  try {
    const ai = getAI();
    const context = docs.map(d => `Doc: ${d.name}\n${d.text.slice(0, 3000)}`).join("\n\n");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a comprehensive literature review in Chinese based on these papers:
      ${context}`,
    });
    return response.text;
  } catch (err) {
    return handleApiError(err);
  }
}
