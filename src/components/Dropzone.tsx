import React, { useCallback, useState } from 'react';
import { Upload, File, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface DropzoneProps {
  onFilesUploaded: (files: File[]) => Promise<void>;
  isUploading: boolean;
}

export function Dropzone({ onFilesUploaded, isUploading }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesUploaded(Array.from(e.dataTransfer.files));
    }
  }, [onFilesUploaded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesUploaded(Array.from(e.target.files));
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={cn(
        "relative group flex flex-col items-center justify-center w-full h-32 border border-dashed rounded-xl transition-all duration-300",
        isDragging ? "border-brand-accent bg-brand-highlight" : "border-brand-border hover:border-brand-accent/50",
        isUploading && "opacity-50 pointer-events-none"
      )}
    >
      <input
        type="file"
        multiple
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        accept=".pdf,.docx,.txt"
      />
      
      {isUploading ? (
        <Loader2 className="w-5 h-5 text-brand-accent animate-spin" />
      ) : (
        <>
          <div className="p-2 bg-brand-bg rounded-lg group-hover:scale-110 transition-transform duration-300">
            <Upload className="w-4 h-4 text-brand-text-sub" />
          </div>
          <div className="mt-2 text-center">
            <p className="text-[11px] font-semibold text-brand-text-sub uppercase tracking-wider">Add Document</p>
          </div>
        </>
      )}
    </div>
  );
}
