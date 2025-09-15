'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import Swal from 'sweetalert2';
import { debounce } from 'lodash';
import { FirebaseUser } from '@/dbService';

export interface Item {
  id: string;
  name: string;
  // Add other item properties as needed
}

export interface FormData {
  // Basic fields
  status: string;
  program?: string;
  sterilizer?: string;
  
  // Checkbox fields
  prevac?: boolean;
  c134c?: boolean;
  s9?: boolean; 
  d20?: boolean;
  
  // Test results
  mechanical?: string;
  chemical_external?: string;
  chemical_internal?: string;
  bio_test?: string;
  
   sterile_staff?: string;
  result_reader?: string;
  
  // Items array
  items?: Array<{ 
    name: string; 
    quantity: string | number; 
    itemId?: string;
  }>;
  
  // For type compatibility with the rest of the application
  [key: string]: string | boolean | number | undefined | Array<{ name: string; quantity: string | number }>;
}



interface FormModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => Promise<void> | void;
  form: FormData;
  setForm: (v: React.SetStateAction<FormData>) => void;
  submitting: boolean;
  errorMsg: string;
  successMsg: string;
  user: FirebaseUser | null;
}

export default function HistoryFormModal({ 
  show, 
  onClose, 
  onSubmit, 
  form, 
  setForm, 
  submitting, 
  errorMsg, 
  successMsg, 
  user 
}: FormModalProps) {
  const [rowCount, setRowCount] = useState(1);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [searchResults, setSearchResults] = useState<Record<number, Item[]>>({});
  const [searchTerm, setSearchTerm] = useState<Record<number, string>>({});
  const [isSearching, setIsSearching] = useState<Record<number, boolean>>({});

  // Debounced search function
  const searchItems = useCallback(debounce(async (term: string, rowIndex: number) => {
    if (!term || term.length < 5) {
      setSearchResults(prev => ({ ...prev, [rowIndex]: [] }));
      setIsSearching(prev => ({ ...prev, [rowIndex]: false }));
      return;
    }

    try {
      const response = await fetch(`/api/logs?action=search-items&q=${encodeURIComponent(term)}`);
      const data = await response.json();
      setSearchResults(prev => ({ ...prev, [rowIndex]: data.items || [] }));
    } catch (error) {
      console.error('Error searching items:', error);
      setSearchResults(prev => ({ ...prev, [rowIndex]: [] }));
    } finally {
      setIsSearching(prev => ({ ...prev, [rowIndex]: false }));
    }
  }, 300), []);

  // Handle item name change
  const handleItemNameChange = (e: React.ChangeEvent<HTMLInputElement>, rowIndex: number) => {
    const { value } = e.target;
    const newItems = [...(form.items || [])];
    newItems[rowIndex] = { ...newItems[rowIndex], name: value };
    setForm(prev => ({ ...prev, items: newItems }));
    
    // Update search term and trigger search only if 5+ characters
    setSearchTerm(prev => ({ ...prev, [rowIndex]: value }));
    if (value.length >= 5) {
      setIsSearching(prev => ({ ...prev, [rowIndex]: true }));
      searchItems(value, rowIndex);
    } else {
      setSearchResults(prev => ({ ...prev, [rowIndex]: [] }));
    }
  };

  // Handle item selection from search results
  const handleSelectItem = (item: Item, rowIndex: number) => {
    const newItems = [...(form.items || [])];
    newItems[rowIndex] = { 
      ...newItems[rowIndex], 
      name: item.name,
      itemId: item.id
    };
    setForm(prev => ({ ...prev, items: newItems }));
    setSearchResults(prev => ({ ...prev, [rowIndex]: [] }));
    setSearchTerm(prev => ({ ...prev, [rowIndex]: '' }));
    
    // Focus on quantity field after selection
    const qtyInput = document.querySelector<HTMLInputElement>(`input[name="item_qty_${rowIndex}"]`);
    qtyInput?.focus();
  };

  // Handle input focus to show recent searches or clear results
  const handleInputFocus = (rowIndex: number) => {
    const currentTerm = searchTerm[rowIndex] || '';
    if (currentTerm.length >= 5) {
      searchItems(currentTerm, rowIndex);
    }
  };

  // Handle quantity change and navigation
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>, rowIndex: number) => {
    const { value } = e.target;
    const newItems = [...(form.items || [])];
    newItems[rowIndex] = { ...newItems[rowIndex], quantity: value };
    setForm(prev => ({ ...prev, items: newItems }));
  };

  // Handle keyboard navigation and QR code scan (rapid input)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, field: 'name' | 'quantity') => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      
      // Determine next field to focus
      if (field === 'name') {
        // Focus quantity field in same row
        const qtyInput = document.querySelector<HTMLInputElement>(`input[name="item_qty_${rowIndex}"]`);
        qtyInput?.focus();
      } else if (field === 'quantity') {
        if (rowIndex < rowCount - 1) {
          // Focus name field in next row
          const nextNameInput = document.querySelector<HTMLInputElement>(`input[name="item_name_${rowIndex + 1}"]`);
          nextNameInput?.focus();
        } else {
          // Add new row and focus its name field
          addRow();
          // Small timeout to ensure new row is rendered
          setTimeout(() => {
            const nextNameInput = document.querySelector<HTMLInputElement>(`input[name="item_name_${rowIndex + 1}"]`);
            nextNameInput?.focus();
          }, 0);
        }
      }
    }
  };

  // Handle input changes (for QR code scanning)
  const handleInput = (e: React.FormEvent<HTMLInputElement>, rowIndex: number, field: 'name' | 'quantity') => {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    
    // Check for QR code input (typically ends with Enter or Tab)
    if (field === 'name' && (value.includes('\n') || value.includes('\t'))) {
      e.preventDefault();
      const cleanValue = value.replace(/[\n\t]/g, '').trim();
      
      // Update the input value without the special characters
      const newItems = [...(form.items || [])];
      newItems[rowIndex] = { ...newItems[rowIndex], name: cleanValue };
      setForm(prev => ({ ...prev, items: newItems }));
      
      // Move to quantity field
      const qtyInput = document.querySelector<HTMLInputElement>(`input[name="item_qty_${rowIndex}"]`);
      qtyInput?.focus();
    }
  };


  // ฟังก์ชันคำนวณสถานะ
  const calculateStatus = (formData: FormData): string => {
    // ตรวจสอบว่ามีการเลือกผลการทดสอบหรือไม่
    const hasTestResults = 
      formData.mechanical === 'ผ่าน' || formData.mechanical === 'ไม่ผ่าน' ||
      formData.chemical_external === 'ผ่าน' || formData.chemical_external === 'ไม่ผ่าน' ||
      formData.chemical_internal === 'ผ่าน' || formData.chemical_internal === 'ไม่ผ่าน' ||
      formData.bio_test === 'ผ่าน' || formData.bio_test === 'ไม่ผ่าน';
    
    // ถ้าไม่มีการเลือกผลการทดสอบเลย ให้คืนค่า NONE
    if (!hasTestResults) {
      return 'NONE';
    }
    
    // ถ้ามีการเลือกผลการทดสอบ ให้ตรวจสอบว่ามีการ "ไม่ผ่าน" หรือไม่
    if (
      formData.mechanical === 'ไม่ผ่าน' ||
      formData.chemical_external === 'ไม่ผ่าน' ||
      formData.chemical_internal === 'ไม่ผ่าน' ||
      formData.bio_test === 'ไม่ผ่าน'
    ) {
      return 'FAIL';
    }
    
    // ถ้าทุกอย่างผ่าน ให้คืนค่า PASS
    return 'PASS';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // คำนวณและกำหนดสถานะก่อนส่งข้อมูล
      const formDataWithStatus = {
        ...form,
        status: calculateStatus(form)
      };
      
      await Promise.resolve(onSubmit(e));
      // Show success message with SweetAlert2
      await Swal.fire({
        title: 'สำเร็จ!',
        text: 'บันทึกข้อมูลสำเร็จ',
        icon: 'success',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#3085d6',
      });
    } catch (error) {
      // Show error message with SweetAlert2
      await Swal.fire({
        title: 'เกิดข้อผิดพลาด!',
        text: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
        icon: 'error',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#d33',
      });
      console.error('Error submitting form:', error);
    }
  };

  // Auto-fill staff and reader from user info whenever the modal is shown
  useEffect(() => {
    if (show && user) {
      const userName = user.displayName || user.email || '';
      
      setForm(prev => ({
        ...prev,
        sterile_staff: userName,
        result_reader: userName,
        // Keep existing values for other fields
        ...(prev.sterilizer === undefined && { sterilizer: '' }),
        ...(prev.mechanical === undefined && { mechanical: '' }),
        ...(prev.chemical_external === undefined && { chemical_external: '' }),
        ...(prev.chemical_internal === undefined && { chemical_internal: '' }),
        ...(prev.bio_test === undefined && { bio_test: '' }),
        ...(prev.items === undefined && { items: [] })
      }));
    }
  }, [show, user, setForm]); // Run when modal is shown or user changes

  // Save staff and reader to localStorage when they change
  useEffect(() => {
    if (form.sterile_staff) {
      localStorage.setItem('sterile_staff', form.sterile_staff);
    }
    if (form.result_reader) {
      localStorage.setItem('result_reader', form.result_reader);
    }
  }, [form.sterile_staff, form.result_reader]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    
    setForm((prev: FormData) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle program changes
  useEffect(() => {
    if (form.program === 'PREVAC' || form.program === 'BOWIE') {
      setForm((prev: FormData) => ({
        ...prev,
        prevac: true,
        c134c: true,
        s9: true,
        d20: true
      }));
    } else if (form.program === 'EO') {
      setForm((prev: FormData) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false
      }));
    } else if (form.program === 'Plasma') {
      setForm((prev: FormData) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false
      }));
    } else if (form.program) {
      setForm((prev: FormData) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false
      }));
    }
  }, [form.program, setForm]);

  // Add a new row to the items table
  const addRow = () => {
    setRowCount(prev => prev + 1);
    setForm(prev => ({
      ...prev,
      items: [...(prev.items || []), { name: '', quantity: '' }]
    }));
  };

  // Remove a row from the items table
  const removeRow = (index: number) => {
    if (rowCount <= 1) return; // Don't remove the last row
    
    setRowCount(prev => prev - 1);
    const newItems = [...(form.items || [])];
    newItems.splice(index, 1);
    setForm(prev => ({
      ...prev,
      items: newItems
    }));
  };

  if (!show) return null;
  
  // Initialize items with dynamic length based on rowCount
  const items = Array.from({ length: rowCount }, (_, i) => (form.items && form.items[i]) ? form.items[i] : { name: '', quantity: '' });
  
  return (
    <div 
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl relative max-h-[95vh] flex flex-col p-6 overflow-y-auto text-black"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-red-500 text-2xl"
          onClick={onClose}
          aria-label="ปิด"
        >
          ×  
        </button>
        <h2 className="text-2xl font-bold mb-4 text-blue-900 text-center text-black">LOAD IN DATA - บันทึกรอบการทำงาน</h2>
        <form className="flex flex-col gap-4 text-black" onSubmit={handleSubmit}>
          <div className="flex flex-col md:flex-row gap-6">
            {/* ฝั่งซ้าย: ข้อมูลรอบ/checkbox */}
            <div className="flex-1 min-w-[260px] flex flex-col gap-2">
              <label className="font-medium text-gray-600">รอบการฆ่าเชื้อที่ <input name="sterilizer" type="text" className="border rounded px-2 py-1 w-full bg-gray-100 text-gray-500" value={form.sterilizer || ''} readOnly /></label>
              <div className="font-medium text-gray-600 flex items-center gap-2">โปรแกรมที่ใช้
                <select name="program" className="border rounded px-2 py-1 ml-2 text-black" value={form.program || ''} onChange={handleChange}>
                  <option value="">เลือกโปรแกรม</option>
                  <option value="PREVAC">PREVAC</option>
                  <option value="Plasma">Plasma</option>
                  <option value="EO">EO</option>
                  <option value="BOWIE">BOWIE</option>
                </select>
              </div>
              {/* Show sub-programs as text only when BOWIE or PREVAC is selected */}
              {(form.program === 'BOWIE' || form.program === 'PREVAC') && (
                <div className="flex flex-col gap-1 mb-2 text-black ml-2 bg-gray-100 p-2 rounded">
                  <div className="text-black font-semibold">เฟสย่อย (Sub-phase):</div>
                  <div className="text-black">• PREVAC: {form?.prevac ? '✓' : '✗'}</div>
                  <div className="text-black">• 134C: {form?.c134c ? '✓' : '✗'}</div>
                  <div className="text-black">• S9: {form?.s9 ? '✓' : '✗'}</div>
                  <div className="text-black">• D20: {form?.d20 ? '✓' : '✗'}</div>
                </div>
              )}
              <div className="font-medium mt-2 text-gray-400">ผลการตรวจสอบประสิทธิภาพการทำลายเชื้อ (ปิดใช้งาน)</div>
              <div className="ml-2 text-gray-400">กลไก:
                <label className="ml-2 text-gray-400"><input type="radio" name="mechanical" value="ผ่าน" checked={form.mechanical === 'ผ่าน'} disabled /> ผ่าน</label>
                <label className="ml-2 text-gray-400"><input type="radio" name="mechanical" value="ไม่ผ่าน" checked={form.mechanical === 'ไม่ผ่าน'} disabled /> ไม่ผ่าน</label>
              </div>
              <div className="ml-2 text-gray-400">เทปเคมีภายนอก:
                <label className="ml-2 text-gray-400"><input type="radio" name="chemical_external" value="ผ่าน" checked={form.chemical_external === 'ผ่าน'} disabled /> ผ่าน</label>
                <label className="ml-2 text-gray-400"><input type="radio" name="chemical_external" value="ไม่ผ่าน" checked={form.chemical_external === 'ไม่ผ่าน'} disabled /> ไม่ผ่าน</label>
              </div>
              <div className="ml-2 text-gray-400">เทปเคมีภายใน:
                <label className="ml-2 text-gray-400"><input type="radio" name="chemical_internal" value="ผ่าน" checked={form.chemical_internal === 'ผ่าน'} disabled /> ผ่าน</label>
                <label className="ml-2 text-gray-400"><input type="radio" name="chemical_internal" value="ไม่ผ่าน" checked={form.chemical_internal === 'ไม่ผ่าน'} disabled /> ไม่ผ่าน</label>
              </div>

              <div className="font-medium mt-2 text-gray-400">ตัวเชื้อทดสอบชีวภาพ (ปิดใช้งาน)</div>
              <div className="ml-2 text-gray-400">ชีวภาพ:
                <label className="ml-2 text-gray-400"><input type="radio" name="bio_test" value="ผ่าน" checked={form.bio_test === 'ผ่าน'} disabled /> ผ่าน</label>
                <label className="ml-2 text-gray-400"><input type="radio" name="bio_test" value="ไม่ผ่าน" checked={form.bio_test === 'ไม่ผ่าน'} disabled /> ไม่ผ่าน</label>
              </div>
              <label className="font-medium mt-2 text-gray-600">เจ้าหน้าที่ Sterile <input name="sterile_staff" type="text" className="border rounded px-2 py-1 w-full bg-gray-100 text-gray-700" value={form.sterile_staff || ''} readOnly /></label>
              <label className="font-medium text-gray-600">ผู้อ่านผล <input name="result_reader" type="text" className="border rounded px-2 py-1 w-full bg-gray-100 text-gray-700" value={form.result_reader || ''} readOnly /></label>
            </div>
            {/* ฝั่งขวา: ตารางอุปกรณ์ */}
            <div className="flex-[2] min-w-[320px]">
              <div className="font-medium text-center mb-2 text-gray-600">รายละเอียดอุปกรณ์ที่นำเข้าอบ</div>
              <table className="w-full border text-xs text-black">
                <thead>
                  <tr className="bg-gray-100 text-black">
                    <th className="border p-1 w-8 text-black">NO</th>
                    <th className="border p-1 text-black">ชื่อ/กลุ่มอุปกรณ์</th>
                    <th className="border p-1 w-16 text-black">จำนวน</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="text-black">
                      <td className="border p-1 text-center text-black">{i + 1}</td>
                      <td className="border p-1 text-black">
                        <div className="position-relative">
                          <input
                            type="text"
                            name={`item_name_${i}`}
                            className="w-full p-2 border rounded"
                            value={item.name || ''}
                            onChange={(e) => handleItemNameChange(e, i)}
                            onKeyDown={(e) => handleKeyDown(e, i, 'name')}
                            onInput={(e) => handleInput(e, i, 'name')}
                            onFocus={() => handleInputFocus(i)}
placeholder="พิมพ์อย่างน้อย 5 ตัวอักษร"
                            required
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck="false"
                          />
                          {isSearching[i] && (
                            <div className="position-absolute top-50 end-0 translate-middle-y me-2">
                              <div className="spinner-border spinner-border-sm text-secondary" role="status">
                                <span className="visually-hidden">กำลังค้นหา...</span>
                              </div>
                            </div>
                          )}
                          {searchResults[i]?.length > 0 && (
                            <div className="position-absolute z-3 w-100 bg-white border rounded mt-1 shadow">
                              {searchResults[i].map((result) => (
                                <div 
                                  key={result.id}
                                  className="p-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                                  onClick={() => handleSelectItem(result, i)}
                                >
                                  <span>{result.name}</span>
                                  {result.id && (
                                    <span className="text-xs text-gray-500 ml-2">ID: {result.id}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="border p-1 text-black">
                        <input
                          name={`item_qty_${i}`}
                          type="number"
                          className="border rounded px-2 py-1 w-20"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleQuantityChange(e, i)}
                          onKeyDown={(e) => handleKeyDown(e, i, 'quantity')}
                          onInput={(e) => handleInput(e, i, 'quantity')}
                          autoComplete="off"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button 
                type="button" 
                onClick={addRow}
                className="mt-2 bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-4 rounded text-sm"
              >
                + เพิ่มแถว
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-center">
            <button type="submit" disabled={submitting} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-8 rounded transition-all disabled:opacity-60">
              {submitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </button>
            <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-8 rounded transition-all">
              ยกเลิก
            </button>
          </div>
          {errorMsg && <div className="text-red-600 mt-2 text-center">{errorMsg}</div>}
          {successMsg && <div className="text-green-600 mt-2 text-center">{successMsg}</div>}
        </form>
      </div>
    </div>
  );
} 