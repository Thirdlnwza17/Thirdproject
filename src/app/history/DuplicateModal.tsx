'use client';

import React from 'react';
import { SterilizerEntry } from '@/dbService';

export default function DuplicateModal({ show, onClose, duplicateType, duplicateEntries, onProceedWithSave }: {
  show: boolean,
  onClose: () => void,
  duplicateType: 'image' | 'text' | 'both',
  duplicateEntries: SterilizerEntry[],
  onProceedWithSave: () => void
}) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg relative">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-2xl"
          onClick={onClose}
          aria-label="ปิด"
        >
          ×
        </button>
        <h2 className="text-xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-cyan-400 bg-clip-text text-transparent">⚠️ พบข้อมูลซ้ำ</h2>
        <div className="mb-4">
          {duplicateType === 'both' && (
            <p className="text-gray-700">พบข้อมูลซ้ำทั้งรูปภาพและข้อความที่ถอดได้</p>
          )}
          {duplicateType === 'image' && (
            <p className="text-gray-700">พบรูปภาพซ้ำในระบบ</p>
          )}
          {duplicateType === 'text' && (
            <p className="text-gray-700">พบข้อความที่ถอดได้ซ้ำในระบบ</p>
          )}
          <div className="mt-3 text-sm text-gray-600">
            <p>ข้อมูลที่ซ้ำ:</p>
            <ul className="list-disc list-inside mt-2">
              {duplicateEntries.slice(0, 3).map((entry) => (
                <li key={entry.id}>
                  {entry.created_at && entry.created_at.toDate ? 
                    entry.created_at.toDate().toLocaleString() : "-"} 
                  โดย {entry.created_by}
                </li>
              ))}
              {duplicateEntries.length > 3 && (
                <li>และอีก {duplicateEntries.length - 3} รายการ</li>
              )}
            </ul>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={onClose} 
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 rounded transition-all"
          >
            ยกเลิก
          </button>
          <button 
            onClick={onProceedWithSave}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded transition-all"
          >
            บันทึกต่อไป
          </button>
        </div>
      </div>
    </div>
  );
} 