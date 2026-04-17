import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, FileText } from 'lucide-react';
import { Message } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatProps {
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  isGenerating: boolean;
}

export function Chat({ messages, onSendMessage, isGenerating }: ChatProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isGenerating) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-8 space-y-10 scroll-smooth custom-scrollbar"
      >
        <AnimatePresence initial={false}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none">
              <FileText className="w-16 h-16 mb-6 text-brand-text-sub" />
              <p className="text-sm font-semibold tracking-tight uppercase">决策引擎就绪</p>
              <p className="text-[11px] font-mono mt-2 uppercase tracking-widest text-brand-text-sub">等待神经元输入...</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "max-w-[90%]",
                  m.role === 'user' ? "ml-auto text-right" : "mr-auto text-left"
                )}
              >
                <div className="space-y-4">
                  {m.role === 'user' ? (
                    <div className="text-[18px] font-semibold text-brand-text tracking-tight leading-snug">
                      {m.content}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-[14px] leading-[1.6] text-brand-text prose prose-sm max-w-none custom-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                      {m.sources && m.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {m.sources.map((s, si) => (
                            <div key={si} className="inline-flex items-center bg-brand-bg px-2 py-0.5 rounded border border-brand-border text-[11px] font-medium text-brand-accent cursor-pointer hover:bg-brand-highlight transition-colors">
                              参考源 #{si + 1}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
        {isGenerating && (
          <div className="mr-auto animate-pulse flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-brand-text-sub">
            <Bot size={14} /> 正在合成知识...
          </div>
        )}
      </div>

      <div className="p-8 border-t border-brand-border">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="bg-brand-bg border border-brand-border rounded-xl p-3 flex items-center gap-3 shadow-inner">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="就文档内容向 AI 提问..."
              disabled={isGenerating}
              className="flex-1 bg-transparent border-none outline-none text-sm text-brand-text placeholder:text-brand-text-sub"
            />
            <button
              type="submit"
              disabled={!input.trim() || isGenerating}
              className="text-brand-accent p-1 disabled:opacity-30 transition-transform active:scale-90"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
