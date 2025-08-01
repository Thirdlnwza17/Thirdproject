'use client';

import React from 'react';

export default function OcrModal({ show, onClose, previewImage, ocrText, ocrLoading, saveLoading, saveSuccess, handleSaveOcrEntry }: {
  show: boolean,
  onClose: () => void,
  previewImage: string | null,
  ocrText: string,
  ocrLoading: boolean,
  saveLoading: boolean,
  saveSuccess: string,
  handleSaveOcrEntry: () => void
}) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg relative max-h-[80vh] flex flex-col p-4">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-2xl"
          onClick={onClose}
          aria-label="ปิด"
        >
          ×
        </button>
        <h2 className="text-xl font-bold mb-2 text-blue-900">Preview & OCR</h2>
        {previewImage && (
          <img src={previewImage} alt="Preview" className="max-w-full max-h-60 mx-auto mb-4 rounded shadow" />
        )}
        <div className="mb-2">
          <span className="font-bold">ข้อความที่ตรวจพบ:</span>
          {ocrLoading ? (
            <div className="text-blue-500 mt-2">กำลังประมวลผล...</div>
          ) : (
            <textarea className="w-full border rounded p-2 mt-2 text-black" rows={5} value={ocrText} readOnly />
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 rounded transition-all">ปิด</button>
          <button onClick={handleSaveOcrEntry} disabled={ocrLoading || saveLoading} className={`flex-1 bg-blue-500 text-white font-bold py-2 rounded transition-all ${ocrLoading || saveLoading ? 'opacity-60 cursor-not-allowed' : ''}`}>{saveLoading ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        </div>
        {saveSuccess && <div className="text-green-600 mt-2 text-center">{saveSuccess}</div>}
      </div>
    </div>
  );
} 