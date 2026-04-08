"use client";

import { useRef, useState } from "react";

export default function FileUploader({ label, accept, file, onFile }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  const handleChange = (e) => {
    const f = e.target.files[0];
    if (f) onFile(f);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
        dragging
          ? "border-blue-400 bg-blue-50"
          : file
          ? "border-green-400 bg-green-50"
          : "border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
      <div className="flex flex-col items-center gap-2">
        {file ? (
          <>
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-green-700 truncate max-w-full px-2">{file.name}</p>
            <p className="text-xs text-green-500">{(file.size / 1024).toFixed(1)} KB</p>
          </>
        ) : (
          <>
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-semibold text-gray-600">{label}</p>
            <p className="text-xs text-gray-400">클릭하거나 파일을 드래그하세요</p>
            <p className="text-xs text-gray-400">{accept}</p>
          </>
        )}
      </div>
    </div>
  );
}
