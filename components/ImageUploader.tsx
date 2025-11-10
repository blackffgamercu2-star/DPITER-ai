
import React, { useState, useCallback, useRef } from 'react';
import type { ImageFile } from '../types';

const fileToBas64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error('Failed to convert file to base64 string'));
            }
        };
        reader.onerror = (error) => reject(error);
    });
};

// FIX: Define the ImageUploaderProps interface to fix the TypeScript error.
interface ImageUploaderProps {
    onImageUpload: (image: ImageFile | null) => void;
    imagePreviewUrl: string | null;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload, imagePreviewUrl }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(async (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        try {
            const base64 = await fileToBas64(file);
            onImageUpload({
                file: file,
                base64: base64,
                mimeType: file.type,
            });
        } catch (error) {
            console.error("Error converting file:", error);
            onImageUpload(null);
        }
      } else {
        alert("Please select an image file.");
      }
    }
  }, [onImageUpload]);
  
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  }, [handleFileChange]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`relative w-full h-64 border-2 border-dashed rounded-lg flex items-center justify-center text-center p-4 transition-all duration-300 ease-in-out cursor-pointer
        ${isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-100'}
        ${imagePreviewUrl ? 'border-solid border-slate-300' : ''}`}
      onClick={handleClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFileChange(e.target.files)}
        accept="image/*"
        className="hidden"
      />
      {imagePreviewUrl ? (
        <img src={imagePreviewUrl} alt="Preview" className="object-contain max-w-full max-h-full rounded-md" />
      ) : (
        <div className="flex flex-col items-center text-slate-500">
           <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mb-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="font-semibold">Click to upload or drag & drop</p>
          <p className="text-sm">PNG, JPG, GIF, WEBP</p>
        </div>
      )}
    </div>
  );
};