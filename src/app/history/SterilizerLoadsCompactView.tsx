'use client';
import React, { useState, useCallback } from 'react';
import { getStatuses } from './SterilizerLoadsCardView';
import EditLoadModal from './EditLoadModal';
import { User } from 'firebase/auth';
import { Timestamp } from '@/dbService';

// Extend the Firebase User type with our custom properties
type AppUser = User & {
  role?: 'admin' | 'operator';
};

interface SterilizerItem {
  name: string;
  quantity: number | string;
  [key: string]: string | number | boolean; 
}

interface SterilizerLoad {
  id: string;
  date?: string;
  sterilizer?: string;
  items?: SterilizerItem[];
  program?: string;
  attest_sn?: string;
  serial_number?: string;
  updated_at?: Timestamp | Date | string;
  created_at?: Timestamp | Date | string;
  [key: string]: string | number | boolean | Date | Timestamp | SterilizerItem[] | undefined;
}

interface SterilizerLoadsCompactViewProps {
  loads: SterilizerLoad[];
  onViewDetail: (load: SterilizerLoad) => void;
  user: AppUser;
  onEditSave: (formData: SterilizerLoad) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  allLoads: SterilizerLoad[];
}

export default function SterilizerLoadsCompactView({ 
  loads, 
  onViewDetail, 
  user, 
  onEditSave, 
  onDelete, 
  allLoads 
}: SterilizerLoadsCompactViewProps) {
  const [editForm, setEditForm] = useState<SterilizerLoad | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpand = useCallback((id: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }, []);
  return (
    <div className="w-full">
      {editError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <span className="block sm:inline">{editError}</span>
        </div>
      )}
      {loads.length === 0 ? (
        <div className="border border-gray-400 rounded-lg shadow-sm p-8 text-center text-gray-500">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-700">ไม่พบข้อมูล</h3>
          <p className="mt-1 text-sm text-gray-500">NO DATA HERE</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-400 rounded-lg shadow-sm">
        <table className="min-w-full bg-white divide-y divide-gray-400">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-3 bg-gray-100 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-400 w-24">วันที่</th>
              <th className="py-2 px-3 bg-gray-100 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-400 w-16">รอบที่</th>
              <th className="py-2 px-3 bg-gray-100 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-400 w-1/3">รายการอุปกรณ์</th>
              <th className="py-2 px-3 bg-gray-100 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-400 w-24">โปรแกรม</th>
              <th className="py-2 px-3 bg-gray-100 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-400 w-32">สถานะ</th>
              <th className="py-2 px-3 bg-gray-100 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-400 w-20">SN</th>
              <th className="py-2 px-3 bg-gray-100 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-b border-gray-400 w-36">อัพเดทล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {loads.length === 0 ? (
              // Show 8 empty rows when no data
              Array.from({ length: 8 }).map((_, index) => (
                <tr key={`empty-${index}`} className="border-b border-gray-300 h-12">
                  <td className="py-2 px-3 text-sm text-gray-400 border-r border-gray-300">-</td>
                  <td className="py-2 px-3 text-sm text-gray-400 border-r border-gray-300 text-center">-</td>
                  <td className="py-2 px-3 text-sm text-gray-400 border-r border-gray-300">-</td>
                  <td className="py-2 px-3 text-sm text-gray-400 border-r border-gray-300 text-center">-</td>
                  <td className="py-2 px-3 text-sm text-gray-400 border-r border-gray-300 text-center">-</td>
                  <td className="py-2 px-3 text-sm text-gray-400 border-r border-gray-300">-</td>
                  <td className="py-2 px-3 text-sm text-gray-400 border-r border-gray-300 text-center">-</td>
                  <td className="py-2 px-3 text-sm text-gray-400 text-center">-</td>
                </tr>
              ))
            ) : (
              loads.map((load) => {
              const statuses = getStatuses(load);
              const mainStatus = statuses[statuses.length - 1]; // Get the most important status
              const items = load.items || []; // Ensure items is always an array
              
              return (
                <tr 
                  key={load.id} 
                  className="hover:bg-gray-50 cursor-pointer border-b border-gray-300 last:border-0"
                  onClick={() => setEditForm(load)}
                >
                  <td className="py-2 px-3 text-sm text-gray-800 border-r border-gray-300 whitespace-nowrap"> 
                    {load.date || '-'}
                  </td>
                  <td className="py-2 px-3 text-sm text-gray-800 border-r border-gray-300 text-center"> 
                    {load.sterilizer || '-'}
                  </td>
                  <td className="py-2 px-3 border-r border-gray-300">
                    <div className="text-xs text-gray-800">
                      {items.length > 0 ? (
                        <div className="space-y-1">
                          {items
                            .slice(0, expandedItems[load.id] ? items.length : 3)
                            .map((item: SterilizerItem, idx: number) => (
                              <div key={idx} className="flex items-center justify-between min-h-[24px] gap-2 py-0.5">
                                <span className="whitespace-normal break-words flex-1">
                                  {item.name}
                                </span>
                                <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[11px] min-w-[24px] text-center">
                                  {item.quantity || 0}
                                </span>
                              </div>
                            ))}
                          {items.length > 3 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(load.id);
                              }}
                              className="text-blue-600 hover:text-blue-800 text-xs mt-1 focus:outline-none"
                            >
                              {expandedItems[load.id] ? 'แสดงน้อยลง' : `+ แสดงเพิ่มเติม (${items.length - 3})`}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">ไม่มีรายการ</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-center text-sm text-gray-800 border-r border-gray-300"> 
                    {load.program || '-'}
                  </td>
                  <td className="py-2 px-3 border-r border-gray-300"> 
                    <div className="flex flex-wrap gap-1">
                      {statuses.map((status, idx) => (
                        <span 
                          key={idx}
                          className={`${status.color} text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors`}
                        >
                          {status.status}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-center text-sm text-gray-800 border-r border-gray-300">
                    {load.attest_sn || load.serial_number || '-'}
                  </td>
                  <td className="py-2 px-3 text-center text-sm text-gray-700 border-r border-gray-300 whitespace-nowrap">
                    {(() => {
                      try {
                        // Handle Firestore Timestamp or string/date
                        const timestamp = load.updated_at || load.created_at;
                        if (!timestamp) return <span className="inline-block w-full text-center">-</span>;

                        // If it's a Firestore Timestamp
                        if (typeof timestamp === 'object' && 'toDate' in timestamp) {
                          const date = timestamp.toDate();
                          if (isNaN(date.getTime())) return <span className="inline-block w-full text-center">-</span>;
                          return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}  ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                        }
                        
                        // If it's already a Date object or string
                        const date = new Date(timestamp);
                        if (isNaN(date.getTime())) return <span className="inline-block w-full text-center">-</span>;
                        return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}  ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                        
                      } catch (error) {
                        console.error('Error formatting date:', error);
                        return <span className="inline-block w-full text-center">-</span>;
                      }
                    })()}
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>
      )}
      
      {editForm && (
        <EditLoadModal
          editForm={editForm}
          setEditForm={setEditForm}
          onSave={async (formData) => {
            setEditLoading(true);
            try {
              await onEditSave(formData);
              setEditForm(null);
            } catch (error) {
              setEditError(error instanceof Error ? error.message : 'An error occurred');
            } finally {
              setEditLoading(false);
            }
          }}
          onDelete={async (id) => {
            setDeleteLoading(true);
            try {
              await onDelete(id);
              setEditForm(null);
            } catch (error) {
              setEditError(error instanceof Error ? error.message : 'An error occurred');
            } finally {
              setDeleteLoading(false);
            }
          }}
          loading={editLoading}
          deleteLoading={deleteLoading}
          error={editError}
          allLoads={allLoads}
          user={user}
        />
      )}
    </div>
  );
}