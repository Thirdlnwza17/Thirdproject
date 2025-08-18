'use client';
import React, { useEffect } from 'react';
import Swal from 'sweetalert2';

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
  
  // Staff and other info
  sterile_staff?: string;
  result_reader?: string;
  printed_out_type?: string;
  
  // Items array
  items?: Array<{ name: string; quantity: string | number }>;
  
  // For type compatibility with the rest of the application
  [key: string]: any;
}

import { User } from 'firebase/auth';

interface FormModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => Promise<void> | void;
  form: FormData;
  setForm: (v: React.SetStateAction<FormData>) => void;
  submitting: boolean;
  errorMsg: string;
  successMsg: string;
  user: User | null;
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
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
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
        d20: true,
        printed_out_type: 'Autoclave',
      }));
    } else if (form.program === 'EO') {
      setForm((prev: FormData) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false,
        printed_out_type: 'EO',
      }));
    } else if (form.program === 'Plasma') {
      setForm((prev: FormData) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false,
        printed_out_type: 'Plasma',
      }));
    } else if (form.program) {
      setForm((prev: FormData) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false,
        printed_out_type: '',
      }));
    }
  }, [form.program, setForm]);
  
  if (!show) return null;
  // ก่อน return ให้แน่ใจว่า form.items เป็น array 15 ช่องเสมอ
  const items = Array.from({ length: 15 }, (_, i) => (form.items && form.items[i]) ? form.items[i] : { name: '', quantity: '' });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl relative max-h-[95vh] flex flex-col p-6 overflow-y-auto text-black">
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
              <div className="ml-2 text-gray-400">ผล:
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
                        <input
                          name={`item_name_${i}`}
                          type="text"
                          className="w-full border rounded px-1 py-0.5 text-black"
                          value={item.name}
                          onChange={e => {
                            const newItems = [...items];
                            newItems[i] = { ...newItems[i], name: e.target.value };
                            setForm({ ...form, items: newItems });
                          }}
                        />
                      </td>
                      <td className="border p-1 text-black">
                        <input
                          name={`item_qty_${i}`}
                          type="number"
                          min="0"
                          className="w-full border rounded px-1 py-0.5 text-black"
                          value={item.quantity}
                          onChange={e => {
                            const newItems = [...items];
                            newItems[i] = { ...newItems[i], quantity: e.target.value };
                            setForm({ ...form, items: newItems });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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