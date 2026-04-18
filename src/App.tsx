import React, { useState, useEffect } from 'react';
import { Plus, MessageSquare, History, Settings, FileText, ChevronRight, Search, Sparkles, Zap, LayoutDashboard, BookOpen, Hash, Loader2 } from 'lucide-react';
import { Dropzone } from './components/Dropzone';
import { Chat } from './components/Chat';
import { AnalysisPanel } from './components/AnalysisPanel';
import { DocumentRef, Chunk, Message } from './types';
import { embedText, generateAnswer, cosineSimilarity, analyzeDocument, generateLibrarySummary } from './services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Access globally loaded libraries from index.html CDN
declare global {
  interface Window {
    pdfjsLib: any;
    mammoth: any;
  }
}

async function extractTextFromFile(file: File): Promise<string> {
  const mimeType = file.type;
  
  if (mimeType === 'application/pdf') {
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) throw new Error("PDF.js library failed to load from CDN. Please check your internet connection.");
    
    const arrayBuffer = await file.arrayBuffer();
    
    // Set worker source to CDN matching the library version
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    }

    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      // Use standard CMaps from CDN
      cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/`,
    });
    
    const pdf = await loadingTask.promise;
    let fullText = '';
    
    const pageCount = Math.min(pdf.numPages, 100);
    
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => 'str' in item ? item.str : '');
      fullText += strings.join(' ') + '\n';
    }
    return fullText;
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = window.mammoth;
    if (!mammoth) throw new Error("Mammoth library failed to load from CDN.");
    
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
  } else if (mimeType === 'text/plain') {
    return await file.text();
  }
  
  throw new Error(`Unsupported file type: ${mimeType}`);
}

export default function App() {
  const [documents, setDocuments] = useState<DocumentRef[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'analysis'>('chat');
  const [currentTask, setCurrentTask] = useState<'home' | 'doc' | 'search' | 'reports' | 'entities' | 'chat'>('home');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<{docName: string, text: string, score: number}[]>([]);
  const [activeModal, setActiveModal] = useState<'history' | 'settings' | null>(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('DOCMIND_API_KEY') || '');
  const [libraryReport, setLibraryReport] = useState<string | null>(null);
  const [reportLength, setReportLength] = useState<'short' | 'medium' | 'long'>('medium');

  const handleSaveSettings = () => {
    localStorage.setItem('DOCMIND_API_KEY', apiKey);
    setActiveModal(null);
    window.location.reload(); // Reload to re-initialize AI instance with new key
  };

  const selectedDoc = documents.find(d => d.id === selectedDocId) || null;

  const handleDeleteDoc = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDocuments(prev => prev.filter(d => d.id !== id));
    if (selectedDocId === id) {
      setSelectedDocId(null);
      setCurrentTask('home');
    }
  };

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const handleFilesUpload = async (files: File[]) => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    setUploadError(null);
    console.log("[Client] Starting upload process for", files.length, "files");
    
    try {
      for (const file of files) {
        console.log(`[Client] Processing: ${file.name} (${file.type})`);
        
        let text = "";
        try {
          text = await extractTextFromFile(file);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[Client] Parsing failed for ${file.name}:`, err);
          setUploadError(`文件解析失败 (${file.name}): ${errMsg}`);
          continue;
        }

        if (!text || text.trim().length === 0) {
          console.warn(`[Client] No content extracted from ${file.name}`);
          setUploadError(`文件内容为空或解析失败 (${file.name})`);
          continue;
        }

        console.log(`[Client] Successfully extracted ${text.length} chars from ${file.name}`);
        const filename = file.name;

        // Chunking
        const chunkSize = 1000;
        const overlap = 200;
        const chunks: Chunk[] = [];
        const docId = generateId();

        for (let i = 0; i < text.length; i += chunkSize - overlap) {
          const chunkText = text.slice(i, i + chunkSize);
          chunks.push({ id: generateId(), text: chunkText, docId });
          if (i + chunkSize >= text.length) break;
        }

        console.log(`[Client] Generated ${chunks.length} chunks. Starting embedding...`);

        // Batch embedding to avoid quota/concurrency issues
        const chunksWithEmbeddings: any[] = [];
        const batchSize = 3;
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          const embeddedBatch = await Promise.all(
            batch.map(async (c) => ({
              ...c,
              embedding: await embedText(c.text),
            }))
          );
          chunksWithEmbeddings.push(...embeddedBatch);
        }

        console.log(`[Client] Embedding complete. Starting AI analysis...`);
        const analysis = await analyzeDocument(text);

        const newDoc: DocumentRef = {
          id: docId,
          name: filename,
          chunks: chunksWithEmbeddings,
          analysis,
        };

        setDocuments(prev => [newDoc, ...prev]);
        setSelectedDocId(docId);
        setCurrentTask('doc');
        console.log(`[Client] Successfully added document: ${filename}`);
      }
    } catch (error) {
      console.error('Processing error:', error);
      setUploadError(`系统处理错误: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGlobalSearch = async () => {
    if (!globalSearchQuery.trim()) return;
    setIsGenerating(true);
    try {
      const queryEmbedding = await embedText(globalSearchQuery);
      const allChunks = documents.flatMap(d => d.chunks);
      
      const scored = allChunks.map(c => ({
        chunk: c,
        score: cosineSimilarity(queryEmbedding, c.embedding || []),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

      const results = scored.map(s => ({
        docName: documents.find(d => d.id === s.chunk.docId)?.name || 'Unknown',
        text: s.chunk.text,
        score: s.score
      }));

      setGlobalSearchResults(results);
    } catch (error) {
      console.error('Global search error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateReport = async () => {
    if (documents.length === 0) return;
    setIsGenerating(true);
    try {
      const docsData = documents.map(d => ({
        name: d.name,
        text: d.chunks.map(c => c.text).slice(0, 10).join(' ') // Summary sample
      }));
      const report = await generateLibrarySummary(docsData, reportLength);
      setLibraryReport(report || "Could not generate report.");
    } catch (error) {
      console.error('Report error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    const userMsg: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setIsGenerating(true);

    try {
      // 1. Embed user question
      const questionEmbedding = await embedText(content);

      // 2. Retrieve top chunks from all documents (or selected one)
      const allChunks = selectedDocId 
        ? (documents.find(d => d.id === selectedDocId)?.chunks || [])
        : documents.flatMap(d => d.chunks);

      const scoredChunks = allChunks.map(c => ({
        chunk: c,
        score: cosineSimilarity(questionEmbedding, c.embedding || []),
      })).sort((a, b) => b.score - a.score).slice(0, 5);

      const context = scoredChunks.map(sc => sc.chunk.text).join('\n---\n');
      const sources = scoredChunks.map(sc => ({
        docName: documents.find(d => d.id === sc.chunk.docId)?.name || 'Unknown',
        text: sc.chunk.text.slice(0, 100) + '...'
      }));

      // 3. Generate answer
      const answer = await generateAnswer(content, context);

      const assistantMsg: Message = { 
        role: 'assistant', 
        content: answer || "I couldn't generate an answer.",
        sources
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Generation error:', error);
    } finally {
      setIsGenerating(true); // Small delay feel
      setTimeout(() => setIsGenerating(false), 500);
    }
  };

  return (
    <div className="flex h-screen bg-brand-bg font-sans text-brand-text overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[220px] bg-brand-sidebar border-r border-brand-border flex flex-col shrink-0 p-6">
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-6 h-6 bg-brand-accent rounded-md flex items-center justify-center">
            <BookOpen size={14} className="text-white" />
          </div>
          <h1 className="text-[18px] font-bold tracking-[-0.5px]">PaperMind</h1>
        </div>

        <nav className="space-y-8">
          <button 
            onClick={() => setCurrentTask('home')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all mb-4",
              currentTask === 'home' ? "bg-brand-highlight text-brand-accent shadow-sm" : "text-brand-text hover:bg-brand-bg"
            )}
          >
            <LayoutDashboard size={18} />
            项目工作台
          </button>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-text-sub flex justify-between items-center group">
              文献库
              <span className="text-[9px] bg-brand-bg px-1.5 py-0.5 rounded border border-brand-border">{documents.length}</span>
            </p>
            <div className="space-y-1">
              {documents.map(doc => (
                <div 
                  key={doc.id}
                  onClick={() => {
                    setSelectedDocId(doc.id);
                    setCurrentTask('doc');
                  }}
                  className={cn(
                    "group w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-all cursor-pointer",
                    (selectedDocId === doc.id && currentTask === 'doc') ? "bg-brand-highlight text-brand-accent font-bold" : "text-brand-text hover:bg-brand-bg"
                  )}
                >
                  <span className="truncate flex-1">{doc.name}</span>
                  <button 
                    onClick={(e) => handleDeleteDoc(doc.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                  >
                    <Plus className="rotate-45" size={14} />
                  </button>
                </div>
              ))}
              {documents.length === 0 && (
                <p className="px-3 text-[11px] text-brand-text-sub italic">请上传 PDF 文献</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-text-sub">研究辅助</p>
            <div className="space-y-2">
              <button 
                onClick={() => {
                  setSelectedDocId(null);
                  setCurrentTask('chat');
                }}
                className={cn(
                  "w-full text-left text-[13px] transition-colors",
                  currentTask === 'chat' ? "text-brand-accent font-semibold" : "text-brand-text hover:text-brand-accent"
                )}
              >
                智能对话检索
              </button>
              <button 
                onClick={() => {
                  setSelectedDocId(null);
                  setCurrentTask('reports');
                }}
                className={cn(
                  "w-full text-left text-[13px] transition-colors",
                  currentTask === 'reports' ? "text-brand-accent font-semibold" : "text-brand-text hover:text-brand-accent"
                )}
              >
                自动文献综述
              </button>
              <button 
                onClick={() => {
                  setSelectedDocId(null);
                  setCurrentTask('search');
                }}
                className={cn(
                  "w-full text-left text-[13px] transition-colors",
                  currentTask === 'search' ? "text-brand-accent font-semibold" : "text-brand-text hover:text-brand-accent"
                )}
              >
                全文库搜索
              </button>
            </div>
          </div>
        </nav>

        <div className="mt-auto space-y-4">
          <Dropzone onFilesUploaded={handleFilesUpload} isUploading={isUploading} />
          <div className="pt-6 border-t border-brand-border flex gap-4 text-[11px] text-brand-text-sub font-semibold uppercase tracking-wider">
            <button onClick={() => setActiveModal('history')} className="hover:text-brand-text transition-colors">历史</button>
            <button onClick={() => setActiveModal('settings')} className="hover:text-brand-text transition-colors">设置</button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        <header className="h-16 bg-brand-sidebar border-b border-brand-border flex items-center justify-between px-8 shrink-0">
          <div className="flex gap-6 text-[12px] text-brand-text-sub">
            <div className="flex gap-1.5 items-center">
              已载入文档: <b className="text-brand-text font-bold">{documents.length}</b>
            </div>
            <div className="flex gap-1.5 items-center">
              存储空间: <b className="text-brand-text font-bold">{(documents.length * 0.4).toFixed(1)}MB / 5GB</b>
            </div>
            <div className="flex gap-1.5 items-center">
              AI 就绪: <b className="text-brand-text font-bold">100%</b>
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Central Workspace */}
          <div className="flex-1 overflow-y-auto bg-brand-bg relative">
            {uploadError && (
              <div className="mx-12 mt-8 mb-4 bg-rose-50 border border-rose-100 rounded-xl p-4 flex items-start gap-3 text-rose-700 animate-in fade-in slide-in-from-top-2 z-50">
                <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold">!</span>
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-medium">{uploadError}</p>
                  <button 
                    onClick={() => setUploadError(null)}
                    className="text-[11px] font-bold uppercase tracking-widest mt-2 hover:underline opacity-60"
                  >
                    关闭提示
                  </button>
                </div>
              </div>
            )}

            {isUploading && (
              <div className="mx-12 mt-8 mb-4 bg-brand-highlight border border-brand-accent/20 rounded-xl p-4 flex items-center gap-3 text-brand-accent animate-pulse z-50">
                <Loader2 className="w-5 h-5 animate-spin" />
                <p className="text-[13px] font-medium">正在深度解析解析文档并构建智能索引 (约需 10-20 秒)...</p>
              </div>
            )}
            
            {currentTask === 'home' && (
              <div className="h-full overflow-y-auto p-12 space-y-12">
                <header className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-highlight border border-brand-accent/20 text-brand-accent text-[11px] font-bold uppercase tracking-wider">
                    <Sparkles size={12} />
                    自动化文献综述工具
                  </div>
                  <h2 className="text-[32px] font-bold text-brand-text tracking-tight">PaperMind - 让研究更聚焦</h2>
                  <p className="text-brand-text-sub text-[15px] max-w-2xl leading-relaxed">
                    专为学生与研究人员设计。上传多篇论文，自动完成<b>结构化解析</b>与<b>综述初稿自动生成</b>。
                  </p>
                </header>

                <div className="grid grid-cols-2 gap-8">
                  <div className="bg-white border border-brand-border rounded-3xl p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-6 hover:shadow-md transition-shadow">
                     <div className="w-16 h-16 bg-brand-highlight rounded-2xl flex items-center justify-center">
                        <Plus className="text-brand-accent" size={32} />
                     </div>
                     <div className="space-y-2">
                        <h3 className="text-[16px] font-bold">上传新内容</h3>
                        <p className="text-sm text-brand-text-sub px-6">支持 PDF, Word, TXT 格式，智能自动解析与分块</p>
                     </div>
                     <div className="w-full max-w-[240px]">
                        <Dropzone onFilesUploaded={handleFilesUpload} isUploading={isUploading} />
                     </div>
                  </div>

                  <div className="bg-brand-highlight/30 border border-brand-border rounded-3xl p-8 shadow-sm space-y-6">
                     <h3 className="text-[14px] font-bold text-brand-text uppercase tracking-wider">库状态概略</h3>
                     <div className="space-y-4">
                        {[
                          { label: '总文档数', value: documents.length, icon: FileText },
                          { label: '提取知识点', value: documents.reduce((acc, d) => acc + (d.analysis?.takeaways.length || 0), 0), icon: Sparkles },
                          { label: '实体总数', value: documents.reduce((acc, d) => acc + (d.analysis?.entities.length || 0), 0), icon: Zap },
                        ].map((stat, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-brand-border">
                             <div className="flex items-center gap-3">
                                <stat.icon size={18} className="text-brand-accent" />
                                <span className="text-sm font-medium">{stat.label}</span>
                             </div>
                             <span className="text-[18px] font-bold">{stat.value}</span>
                          </div>
                        ))}
                     </div>
                  </div>
                </div>

                {documents.length > 0 && (
                  <div className="space-y-6">
                    <h3 className="text-[14px] font-bold text-brand-text uppercase tracking-wider">最近更新项目</h3>
                    <div className="grid grid-cols-3 gap-4">
                      {documents.slice(0, 3).map(doc => (
                        <div 
                          key={doc.id}
                          onClick={() => { setSelectedDocId(doc.id); setCurrentTask('doc'); }}
                          className="bg-white border border-brand-border rounded-2xl p-6 shadow-sm hover:border-brand-accent transition-all cursor-pointer group"
                        >
                           <FileText size={24} className="text-brand-text-sub group-hover:text-brand-accent mb-4 transition-colors" />
                           <h4 className="text-sm font-bold truncate mb-1">{doc.name}</h4>
                           <p className="text-[10px] text-brand-text-sub uppercase font-mono">{doc.analysis?.themes[0] || '一般类'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentTask === 'doc' && (
              <AnalysisPanel 
                document={selectedDoc} 
                messages={messages} 
                onSendMessage={handleSendMessage}
                isGenerating={isGenerating}
                libraryReport={libraryReport}
              />
            )}

            {currentTask === 'search' && (
              <div className="h-full overflow-y-auto p-12 space-y-8 bg-white">
                <header className="space-y-1">
                  <h3 className="text-[24px] font-bold text-brand-text tracking-tight">全局搜索检索</h3>
                  <p className="text-[14px] text-brand-text-sub">在整个知识库中执行向量语义搜索</p>
                </header>

                <div className="relative group max-w-2xl">
                   <input 
                    type="text" 
                    value={globalSearchQuery}
                    onChange={(e) => setGlobalSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGlobalSearch()}
                    placeholder="输入问题或关键词，按回车搜索..."
                    className="w-full bg-brand-bg border border-brand-border rounded-2xl px-6 py-4 text-[16px] focus:outline-none focus:ring-4 focus:ring-brand-accent/10 focus:border-brand-accent transition-all pl-14"
                  />
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-brand-text-sub group-focus-within:text-brand-accent" />
                </div>

                <div className="grid grid-cols-1 gap-6 max-w-4xl">
                  {isGenerating ? (
                    <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                        <Zap className="w-8 h-8 text-brand-accent mb-4" />
                        <span className="text-[12px] font-mono uppercase tracking-widest">正在检索向量空间，请稍候...</span>
                    </div>
                  ) : globalSearchResults.length > 0 ? (
                    globalSearchResults.map((res, i) => (
                      <div key={i} className="bg-brand-bg border border-brand-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-2">
                             <FileText size={14} className="text-brand-accent" />
                             <span className="text-[11px] font-bold text-brand-accent uppercase tracking-wider">{res.docName}</span>
                          </div>
                          <span className="text-[10px] text-brand-text-sub font-mono bg-white px-2 py-0.5 rounded-full border border-brand-border">相关性: {(res.score * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-[14px] text-brand-text leading-relaxed italic border-l-2 border-brand-border pl-4">
                          "{res.text}"
                        </p>
                      </div>
                    ))
                  ) : globalSearchQuery && (
                    <div className="text-center py-20 opacity-30 select-none">
                       <LayoutDashboard size={48} className="mx-auto mb-4" />
                       <p className="text-xs uppercase font-bold tracking-widest">未找到匹配内容</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentTask === 'chat' && (
              <div className="h-full flex flex-col p-12 bg-white overflow-hidden">
                <header className="space-y-1 mb-8">
                  <h3 className="text-[24px] font-bold text-brand-text tracking-tight">全局问答检索</h3>
                  <p className="text-[14px] text-brand-text-sub">基于整个知识库（{documents.length} 个文档）进行智能问答</p>
                </header>
                <div className="flex-1 min-h-0 bg-brand-bg border border-brand-border rounded-[32px] overflow-hidden flex flex-col">
                   <Chat messages={messages} onSendMessage={handleSendMessage} isGenerating={isGenerating} />
                </div>
              </div>
            )}

            {currentTask === 'reports' && (
              <div className="h-full overflow-y-auto p-12 space-y-8 bg-white pb-32">
                 <header className="space-y-4">
                  <h3 className="text-[24px] font-bold text-brand-text tracking-tight">自动化文献综述</h3>
                  <div className="flex items-center gap-6">
                    <p className="text-[14px] text-brand-text-sub flex-1">AI 自动审阅知识库中的所有文献，为您生成一份结构严谨的综述报告初稿。</p>
                    {libraryReport && (
                      <button 
                        onClick={() => setLibraryReport(null)}
                        className="text-[12px] font-bold text-brand-accent border border-brand-accent px-4 py-2 rounded-xl hover:bg-brand-highlight transition-all"
                      >
                        重新生成
                      </button>
                    )}
                  </div>
                </header>
                
                {libraryReport ? (
                  <div className="bg-brand-bg border border-brand-border rounded-3xl p-10 text-[15px] leading-[1.8] text-brand-text shadow-inner prose prose-slate max-w-4xl custom-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{libraryReport}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-brand-border rounded-3xl bg-brand-highlight/30 max-w-4xl">
                     <Sparkles className="w-12 h-12 text-brand-accent mb-6" />
                     <h4 className="text-[18px] font-bold mb-2">生成全库综述报告</h4>
                     <p className="text-sm text-brand-text-sub mb-8 text-center px-12">点击下方按钮，系统将提取所有已上传文献的核心观点并进行深度对比合成</p>
                     
                     <div className="flex flex-col items-center gap-6 w-full max-w-sm">
                        <div className="w-full space-y-2 text-center">
                          <label className="text-[11px] font-bold text-brand-text-sub uppercase tracking-wider">选择综述深度</label>
                          <div className="flex bg-white rounded-xl p-1 border border-brand-border">
                            {(['short', 'medium', 'long'] as const).map((l) => (
                              <button
                                key={l}
                                onClick={() => setReportLength(l)}
                                className={cn(
                                  "flex-1 py-2 text-[12px] font-bold rounded-lg transition-all",
                                  reportLength === l ? "bg-brand-accent text-white shadow-md" : "text-brand-text-sub hover:text-brand-text"
                                )}
                              >
                                {l === 'short' ? '精简版' : l === 'medium' ? '标准版' : '深度版'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button 
                            onClick={handleGenerateReport}
                            disabled={isGenerating || documents.length === 0}
                            className="w-full bg-brand-accent text-white px-10 py-4 rounded-2xl text-[14px] font-bold uppercase tracking-wider shadow-lg hover:shadow-brand-accent/20 hover:scale-105 transition-all disabled:opacity-50"
                        >
                          {isGenerating ? '正在深度研读并撰写中...' : '开始生成报告'}
                        </button>
                     </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {activeModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-brand-text/20 backdrop-blur-sm p-4"
            onClick={() => setActiveModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-brand-border p-8 max-h-[90vh] overflow-y-auto custom-scrollbar"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-col h-full max-h-[85vh]">
                <div className="flex justify-between items-center mb-6 shrink-0">
                  <h2 className="text-[18px] font-bold text-brand-text uppercase tracking-tight">
                    {activeModal === 'history' ? '历史记录' : '系统设置'}
                  </h2>
                  <button onClick={() => setActiveModal(null)} className="text-brand-text-sub hover:text-brand-text transition-colors">
                    <Plus className="rotate-45" size={24} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8">
                  {activeModal === 'history' ? (
                    <div className="space-y-6">
                      <div className="flex gap-4 items-center p-4 bg-brand-bg rounded-xl border border-brand-border">
                        <div className="w-10 h-10 bg-brand-highlight rounded-lg flex items-center justify-center">
                          <History className="text-brand-accent" size={20} />
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold">会话描述</p>
                          <p className="text-[11px] text-brand-text-sub">最后同步: {new Date().toLocaleTimeString()}</p>
                        </div>
                      </div>
                      <div className="text-center py-20 opacity-30 select-none">
                        <p className="text-xs uppercase font-mono tracking-widest">历史日志已存储在本地</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 pb-6">
                      <div className="space-y-4">
                          <div className="p-4 bg-brand-highlight/30 rounded-xl border border-brand-accent/20">
                            <h3 className="text-[13px] font-bold text-brand-accent mb-2 flex items-center gap-2">
                              <Sparkles size={16} />
                              连接您的 Gemini API
                            </h3>
                            <p className="text-[11px] text-brand-text-sub leading-relaxed mb-4">
                              输入您的 API Key 以激活 AI 助手。您的 Key 将**仅保存在本地**，不会发送到我们的服务器。
                            </p>
                            <input 
                              type="password"
                              placeholder="粘贴 AIza... 开头的 Key"
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              className="w-full bg-white border border-brand-border rounded-lg p-2.5 text-xs outline-none focus:border-brand-accent transition-colors font-mono"
                            />
                            <div className="mt-4 flex gap-2">
                               <a 
                                 href="https://aistudio.google.com/app/apikey" 
                                 target="_blank" 
                                 rel="noopener noreferrer"
                                 className="text-[10px] text-brand-accent hover:underline font-bold"
                               >
                                 + 获取免费 API Key
                               </a>
                            </div>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-brand-text-sub uppercase tracking-wider mb-2 block">AI 模型偏好</label>
                            <select className="w-full bg-brand-bg border border-brand-border rounded-lg p-2 text-sm outline-none focus:border-brand-accent transition-colors">
                              <option>Gemini 3 Flash (默认)</option>
                            </select>
                          </div>
                      </div>
                      <button 
                        onClick={handleSaveSettings}
                        className="w-full py-3 bg-brand-accent text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-opacity active:scale-[0.98] transition-transform"
                      >
                        应用并连接 AI
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
