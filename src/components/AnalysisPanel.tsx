import React from 'react';
import { 
  FileText, 
  ChevronRight, 
  Hash, 
  BookOpen, 
  MessageSquare, 
  LayoutDashboard, 
  Zap, 
  Sparkles 
} from 'lucide-react';
import { DocumentRef, Message } from '../types';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Chat } from './Chat';

interface AnalysisPanelProps {
  document: DocumentRef | null;
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  isGenerating: boolean;
  libraryReport: string | null;
}

export function AnalysisPanel({ 
  document, 
  messages, 
  onSendMessage, 
  isGenerating,
}: AnalysisPanelProps) {
  const [activeTab, setActiveTab] = React.useState<'chat' | 'structure'>('chat');

  if (!document) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-30 select-none bg-brand-bg">
        <BookOpen className="w-12 h-12 mb-4" />
        <p className="text-sm font-medium">选择一个文档以查看 AI 分析结果</p>
      </div>
    );
  }

  const analysis = document.analysis;
  const researchData = analysis?.researchData;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-brand-bg">
      <header className="px-8 pt-8 pb-4 shrink-0">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <h2 className="text-[20px] font-bold text-brand-text truncate max-w-xl">{document.name}</h2>
            <div className="flex gap-4 text-[12px] text-brand-text-sub font-medium">
               <span>已提取 {document.chunks.length} 个分块</span>
               <span>•</span>
               <span>最近分析</span>
               <span>•</span>
               <span className="text-brand-accent">智能就绪</span>
            </div>
          </div>
        </div>

        <div className="flex border-b border-brand-border gap-8">
           {[
             { id: 'chat', label: '问答检索', icon: MessageSquare },
             { id: 'structure', label: '结构化提取', icon: Hash },
           ].map((tab) => (
             <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 pb-3 text-[13px] font-semibold transition-all relative",
                  activeTab === tab.id ? "text-brand-accent" : "text-brand-text-sub hover:text-brand-text"
                )}
             >
                <tab.icon size={16} />
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-accent" />
                )}
             </button>
           ))}
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
         {activeTab === 'chat' && (
           <Chat messages={messages} onSendMessage={onSendMessage} isGenerating={isGenerating} />
         )}

         {activeTab === 'structure' && (
           <div className="h-full p-8 overflow-y-auto custom-scrollbar space-y-8 bg-white pb-24">
              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {[
                   { id: 'problem', label: '研究问题', value: researchData?.problem, color: 'bg-blue-50 text-blue-700 border-blue-100' },
                   { id: 'method', label: '研究方法', value: researchData?.methodology, color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
                   { id: 'data', label: '数据来源', value: researchData?.dataSources, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                   { id: 'conclusion', label: '主要结论', value: researchData?.conclusions, color: 'bg-amber-50 text-amber-700 border-amber-100' },
                   { id: 'limit', label: '局限性', value: researchData?.limitations, color: 'bg-rose-50 text-rose-700 border-rose-100' },
                 ].map((card) => (
                   <div key={card.id} className={cn("p-5 rounded-2xl border flex flex-col gap-2 transition-all hover:shadow-md", card.color)}>
                      <h4 className="text-[11px] font-bold uppercase tracking-widest opacity-70">{card.label}</h4>
                      <p className="text-[13px] leading-relaxed font-medium">
                        {card.value || '未提取到相关信息'}
                      </p>
                   </div>
                 ))}
              </section>

              <section className="space-y-4 pt-4 border-t border-brand-border">
                <h3 className="text-[14px] font-bold text-brand-text-sub uppercase tracking-wider">执行摘要</h3>
                <div className="text-[14px] leading-relaxed text-brand-text bg-brand-bg p-6 rounded-2xl border border-brand-border prose prose-sm max-w-none custom-markdown">
                   <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis?.summary || ''}</ReactMarkdown>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-[14px] font-bold text-brand-text-sub uppercase tracking-wider">结构化数据提取</h3>
                <div className="overflow-x-auto border border-brand-border rounded-xl">
                  {analysis?.tableData && analysis.tableData.length > 0 ? (
                    <table className="w-full text-left text-[12px]">
                      <thead className="bg-brand-bg text-brand-text-sub border-b border-brand-border">
                        <tr>
                          {Object.keys(analysis.tableData[0]).map(k => (
                            <th key={k} className="px-4 py-3 font-bold uppercase">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border bg-white">
                        {analysis.tableData.map((row, i) => (
                          <tr key={i} className="hover:bg-brand-highlight/30 transition-colors">
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="px-4 py-3 text-brand-text">{v}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-brand-text-sub italic">
                       未检测到显著的结构化表格数据
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-[14px] font-bold text-brand-text-sub uppercase tracking-wider">核心知识点</h3>
                <div className="grid grid-cols-1 gap-3">
                  {analysis?.takeaways.map((t, i) => (
                    <div key={i} className="flex gap-3 p-4 bg-brand-bg rounded-xl border border-brand-border">
                       <div className="w-5 h-5 bg-brand-accent/10 rounded flex items-center justify-center shrink-0">
                          <ChevronRight size={14} className="text-brand-accent" />
                       </div>
                       <span className="text-[13px] text-brand-text">{t}</span>
                    </div>
                  ))}
                </div>
              </section>
           </div>
         )}
      </div>
    </div>
  );
}
