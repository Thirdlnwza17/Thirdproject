'use client';

import React from 'react';

export default function ImageModal({ show, imageUrl, zoom, offset, dragging, onClose, onMouseDown, onMouseUp, onMouseMove, onWheel, onTouchStart, onTouchMove, onTouchEnd, onImageClick, onImageDoubleClick }: {
  show: boolean,
  imageUrl: string | null,
  zoom: number,
  offset: { x: number, y: number },
  dragging: boolean,
  onClose: () => void,
  onMouseDown: (e: React.MouseEvent) => void,
  onMouseUp: () => void,
  onMouseMove: (e: React.MouseEvent) => void,
  onWheel: (e: React.WheelEvent) => void,
  onTouchStart: (e: React.TouchEvent) => void,
  onTouchMove: (e: React.TouchEvent) => void,
  onTouchEnd: () => void,
  onImageClick: () => void,
  onImageDoubleClick: () => void,
}) {
  if (!show || !imageUrl) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-4 max-w-2xl w-full flex flex-col items-center relative" onClick={e => e.stopPropagation()}>
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-2xl"
          onClick={onClose}
          aria-label="ปิด"
        >
          ×
        </button>
        <div
          className="overflow-hidden flex items-center justify-center w-full"
          style={{ maxHeight: '70vh', minHeight: '300px', background: '#f3f4f6', borderRadius: '0.75rem', cursor: dragging ? 'grabbing' : 'grab' }}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <img
            src={imageUrl}
            alt="Full OCR"
            className="select-none"
            style={{
              transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
              transition: dragging ? 'none' : 'transform 0.2s',
              maxWidth: '100%',
              maxHeight: '70vh',
              userSelect: 'none',
              pointerEvents: 'auto',
            }}
            draggable={false}
            onClick={onImageClick}
            onDoubleClick={onImageDoubleClick}
            onTouchEnd={onTouchEnd}
          />
        </div>
        <div className="text-xs text-gray-500 mt-2">คลิกที่รูปเพื่อซูม, ลากเพื่อเลื่อน, ดับเบิลคลิกรีเซ็ต | มือถือ: แตะซูม, ลากเลื่อน, แตะคู่รีเซ็ต</div>
      </div>
    </div>
  );
} 