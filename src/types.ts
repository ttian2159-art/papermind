export interface DocumentRef {
  id: string;
  name: string;
  chunks: Chunk[];
  analysis?: AnalysisData;
  metrics?: {
    wordCount: number;
    keywords: { text: string; value: number }[];
    readingTime: number;
  };
}

export interface AnalysisData {
  summary: string;
  takeaways: string[];
  entities: string[];
  themes: string[];
  keywords: { text: string; value: number }[];
  researchData: {
    problem: string;
    methodology: string;
    dataSources: string;
    conclusions: string;
    limitations: string;
  };
  tableData?: Record<string, string>[];
  template?: 'research' | 'business' | 'general';
}

export interface Chunk {
  id: string;
  text: string;
  embedding?: number[];
  docId: string;
  pageNumber?: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { docName: string; text: string }[];
}
