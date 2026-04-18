import { GoogleGenAI, Type } from "@google/genai";
import { Chunk } from "../types";

/**
 * 动态 Gemini 服务
 * 支持从 LocalStorage 读取用户输入的 API Key
 */

const getStoredApiKey = () => {
  return localStorage.getItem('DOCMIND_API_KEY') || null;
};

const getAI = () => {
  const key = getStoredApiKey() || process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
  
  if (!key || key === "undefined" || key === "null") {
    return null;
  }
  
  return new GoogleGenAI({ apiKey: key });
};

export const isAiConnected = () => !!getAI();

export async function embedText(text: string): Promise<number[]> {
  const ai = getAI();
  if (!ai) return Array.from({ length: 1536 }, () => Math.random());
  
  try {
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: [{ parts: [{ text }] }],
    });
    return result.embeddings[0].values;
  } catch (err) {
    console.error("Embedding failed, falling back to mock", err);
    return Array.from({ length: 1536 }, () => Math.random());
  }
}

export async function generateAnswer(question: string, context: string) {
  const ai = getAI();
  if (!ai) return "AI 助手未连接。请点击右下角设置图标输入 API Key 以激活实时问答功能。";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are DocMind, an academic assistant.
      Context: ${context}
      Question: ${question}`,
    });
    return response.text;
  } catch (err) {
    return "回复请求失败，请检查您的 API Key 额度或网络环境（建议使用美区/日区节点）。";
  }
}

export async function analyzeDocument(text: string, template: 'research' | 'business' | 'general' = 'research') {
  const ai = getAI();
  if (!ai) {
    // 基础本地分析模拟
    return {
      summary: "文档已导入。连接 AI 后可自动生成深度摘要。",
      takeaways: ["待阅读", "待分析"],
      entities: [],
      themes: [],
      keywords: [{ text: "本地文档", value: 100 }],
      researchData: {
        problem: "未整理", methodology: "未整理", dataSources: "未整理", conclusions: "未整理", limitations: "未整理"
      },
      template
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `分析此文档并返回中文 JSON 格式：\n${text.slice(0, 30000)}`,
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
              items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, value: { type: Type.NUMBER } } }
            },
            researchData: {
              type: Type.OBJECT,
              properties: { 
                problem: { type: Type.STRING }, 
                methodology: { type: Type.STRING }, 
                dataSources: { type: Type.STRING }, 
                conclusions: { type: Type.STRING }, 
                limitations: { type: Type.STRING } 
              }
            }
          }
        }
      }
    });
    return { ...JSON.parse(response.text || "{}"), template };
  } catch (err) {
    console.error("Analysis failed", err);
    return null;
  }
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0, mA = 0, mB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
}

export async function generateLibrarySummary(docs: {name: string, text: string}[], length: 'short' | 'medium' | 'long' = 'medium') {
  const ai = getAI();
  if (!ai) return "请连接 AI 以生成全库文献综述。";
  const context = docs.map(d => `Doc: ${d.name}\n${d.text.slice(0, 2000)}`).join("\n\n");
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `对以下文献群生成中文大纲综述：\n${context}`,
  });
  return response.text;
}
