import { GoogleGenAI, Type } from "@google/genai";
import { Chunk } from "../types";

let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (aiInstance) return aiInstance;
  
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "undefined") {
    throw new Error("检测到 API Key 缺失。请在部署环境（如 Netlify）的 Environment Variables 中配置 GEMINI_API_KEY，并重新部署项目。");
  }
  
  aiInstance = new GoogleGenAI({ apiKey: key });
  return aiInstance;
};

export async function embedText(text: string): Promise<number[]> {
  const ai = getAI();
  const model = "gemini-embedding-2-preview";
  const result = await ai.models.embedContent({
    model,
    contents: [{ parts: [{ text }] }],
  });
  return result.embeddings[0].values;
}

export async function generateAnswer(question: string, context: string) {
  const ai = getAI();
  const model = "gemini-3-flash-preview";
  const response = await ai.models.generateContent({
    model,
// ... rest of the content remains the same via following edit logic ...
    contents: `You are DocMind, an expert academic document assistant. Use the following context to answer the user's question accurately. 
    
    ### 要求 (Requirements):
    1. 使用标准的 Markdown 格式进行回复（使用标题、加粗、列表、表格、代码块等）。
    2. 如果回答涉及多个维度的对比，请务必使用 Markdown 表格。
    3. 语言必须严谨、专业，且与用户的提问语言保持一致（如用户用中文提问，则用中文回答）。
    4. 始终引用 identifiable 来源。
    5. 不要提供乱糟糟的纯文本回复，要保持排版美观。

    Context:
    ${context}

    Question: ${question}`,
  });
  return response.text;
}

export async function analyzeDocument(text: string, template: 'research' | 'business' | 'general' = 'research') {
  const ai = getAI();
  const model = "gemini-3-flash-preview";
  const response = await ai.models.generateContent({
    model,
    contents: `Analyze this academic paper. 
    1. Extract Research Problem (研究问题), Methodology (方法), Data Sources (数据来源), Conclusions (结论), and Limitations (局限性).
    2. Extract themes and entities.
    3. Provide a summary and key takeaways.
    
    RESPOND IN CHINESE.
    
    Document Text:
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
              problem: { type: Type.STRING, description: "研究问题" },
              methodology: { type: Type.STRING, description: "研究方法" },
              dataSources: { type: Type.STRING, description: "数据来源" },
              conclusions: { type: Type.STRING, description: "主要结论" },
              limitations: { type: Type.STRING, description: "局限性与不足" }
            },
            required: ["problem", "methodology", "dataSources", "conclusions", "limitations"]
          },
          tableData: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              additionalProperties: { type: Type.STRING }
            }
          }
        },
        required: ["summary", "takeaways", "entities", "themes", "keywords", "researchData"]
      }
    }
  });
  
  try {
    const data = JSON.parse(response.text || "{}");
    return { ...data, template };
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
  const ai = getAI();
  const model = "gemini-3-flash-preview";
  const lengthMap = {
    short: "约 500 字左右，精炼提取最核心观点",
    medium: "约 1500 字左右，详细综述研究现状",
    long: "约 3000 字以上，深度分析、方法对比及未来展望"
  };

  const context = docs.map(d => `Document: ${d.name}\nContent: ${d.text.slice(0, 5000)}`).join('\n\n');
  
  const response = await ai.models.generateContent({
    model,
    contents: `You are an expert academic researcher. Generate a comprehensive "Automated Literature Review" (自动化文献综述) based on these ${docs.length} papers.
    
    ### 目标字数: ${lengthMap[length]}

    ### 要求 (Requirements):
    1. 使用标准的学术论文综述格式。
    2. 使用 Markdown 语法（标题、列表、粗体、分割线）使内容层次分明。
    3. **关键要求**：在“方法论对比分析”或适当位置，必须包含一个 **Markdown 表格**，横向对比这 ${docs.length} 篇文献的关键维度（如：数据模态、核心模型、创新点、局限性等）。参考如下格式：
       | 维度 | 文献A标题 | 文献B标题 | 文献C标题 |
       | :--- | :--- | :--- | :--- |
       | 数据类型 | ... | ... | ... |
    4. 语言必须是专业、严谨的中文学术语言。
    5. 必须通过引述文档名称（例如：[基于多模态分析...]）来保证内容的准确性。

    ### 综述结构 (Structure):
    # 自动化文献综述报告
    ## 1. 研究背景与范围 (Introduction)
    简要概述研究领域的背景和本次综述涵盖的范围。
    
    ## 2. 文献分类与研究现状 (Current Status)
    对提供的 ${docs.length} 篇文献进行分类，归纳当前的研究热点。
    
    ## 3. 方法论对比分析 (Methodology Comparison & Table)
    对比不同研究采用的技术路线、模型、数据来源等。**此处必须包含文献对比表格**。
    
    ## 4. 核心洞察与发现 (Core Insights):
    - **共识 (Consensus)**：多篇文献一致认可的观点或发现。
    - **分歧/争议 (Conflicts/Variations)**：研究结果中的不一致之处或不同的侧重点。
    - **互补 (Supplements)**：不同研究如何从不同维度拼凑成完整的知识拼图。
    
    ## 5. 局限性与研究空白 (Research Gaps)
    指出当前研究的不足之处以及未来的研究方向。
    
    ## 6. 结论 (Conclusion)
    总结性陈述。

    Documents:
    ${context}`,
  });
  return response.text;
}
