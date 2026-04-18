import { Chunk } from "../types";

/**
 * 这是一个模拟服务 (Mock Service)
 * 已经移除了所有 API Key 需求和联网逻辑
 * 核心功能将通过本地算法和模拟数据实现
 */

export async function embedText(text: string): Promise<number[]> {
  // 模拟向量生成，用于图谱布局
  return Array.from({ length: 1536 }, () => Math.random());
}

export async function generateAnswer(question: string, context: string) {
  return "AI 助手已关闭。您可以在文档详情页中查看手动整理的摘要和笔记。";
}

export async function analyzeDocument(text: string, template: 'research' | 'business' | 'general' = 'research') {
  // 模拟快速处理，不再依赖联网
  return {
    summary: "这是您的本地文档摘要。您可以在详情页中进行编辑和完善。",
    takeaways: [
      "文档已成功导入本地数据库",
      "您可以通过知识图谱查看此文献与其他文献的关系",
      "建议手动添加关键词以优化分类"
    ],
    entities: ["本地文献", "研究报告"],
    themes: ["未分类"],
    keywords: [
      { text: "导入时间", value: 100 },
      { text: "待阅读", value: 80 }
    ],
    researchData: {
      problem: "尚未定义。请手动编辑研究问题。",
      methodology: "尚未定义。",
      dataSources: "见原文内容。",
      conclusions: "尚未定义。",
      limitations: "尚未定义。"
    },
    template
  };
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  return Math.random(); // 模拟关联度
}

export async function generateLibrarySummary(docs: {name: string, text: string}[]) {
  return "这是由本地库生成的综述占位符。核心功能已转为本地管理模式。";
}
