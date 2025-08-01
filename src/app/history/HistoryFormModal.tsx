'use client';
import React, { useEffect } from 'react';

export default function HistoryFormModal({ show, onClose, onSubmit, form, setForm, submitting, errorMsg, successMsg, user }: {
  show: boolean,
  onClose: () => void,
  onSubmit: (e: React.FormEvent) => void,
  form: any,
  setForm: (v: any) => void,
  submitting: boolean,
  errorMsg: string,
  successMsg: string,
  user: any
}) {
  if (!show) return null;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };
  useEffect(() => {
    if (form.program === 'PREVAC' || form.program === 'BOWIE') {
      setForm((prev: any) => ({
        ...prev,
        prevac: true,
        c134c: true,
        s9: true,
        d20: true,
        printed_out_type: 'Autoclave',
      }));
    } else if (form.program === 'EO') {
      setForm((prev: any) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false,
        printed_out_type: 'EO',
      }));
    } else if (form.program === 'Plasma') {
      setForm((prev: any) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false,
        printed_out_type: 'Plasma',
      }));
    } else if (form.program) {
      setForm((prev: any) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false,
        printed_out_type: '',
      }));
    }
  }, [form.program, setForm]);
  // ก่อน return ให้แน่ใจว่า form.items เป็น array 45 ช่องเสมอ
  const items = Array.from({ length: 45 }, (_, i) => (form.items && form.items[i]) ? form.items[i] : { name: '', quantity: '' });
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
        <form className="flex flex-col gap-4 text-black" onSubmit={onSubmit}>
          <div className="flex flex-col md:flex-row gap-6">
            {/* ฝั่งซ้าย: ข้อมูลรอบ/checkbox */}
            <div className="flex-1 min-w-[260px] flex flex-col gap-2">
              <label className="font-bold text-black">เครื่องอบฆ่าเชื้อที่ <input name="sterilizer" type="text" className="border rounded px-2 py-1 w-full text-black" value={form.sterilizer || ''} onChange={handleChange} required /></label>
              <label className="font-bold text-black">วันที่ <input name="date" type="date" className="border rounded px-2 py-1 w-full text-black" value={form.date || ''} onChange={handleChange} required /></label>
              <div className="font-bold text-black flex items-center gap-2">โปรแกรมที่ใช้
                <select name="program" className="border rounded px-2 py-1 ml-2 text-black" value={form.program || ''} onChange={handleChange}>
                  <option value="">เลือกโปรแกรม</option>
                  <option value="PREVAC">PREVAC</option>
                  <option value="Plasma">Plasma</option>
                  <option value="EO">EO</option>
                  <option value="BOWIE">BOWIE</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 mb-2 text-black ml-2">
                <label className="text-black"><input type="checkbox" name="prevac" checked={!!form.prevac} onChange={e => setForm({ ...form, prevac: e.target.checked })} /> PREVAC</label>
                <label className="text-black"><input type="checkbox" name="c134c" checked={!!form.c134c} onChange={e => setForm({ ...form, c134c: e.target.checked })} /> 134C</label>
                <label className="text-black"><input type="checkbox" name="s9" checked={!!form.s9} onChange={e => setForm({ ...form, s9: e.target.checked })} /> S9</label>
                <label className="text-black"><input type="checkbox" name="d20" checked={!!form.d20} onChange={e => setForm({ ...form, d20: e.target.checked })} /> D20</label>
              </div>
              <div className="font-bold mt-2 text-black">ผลการตรวจสอบประสิทธิภาพการทำลายเชื้อ</div>
              <div className="ml-2 text-black">กลไก:
                <label className="ml-2 text-black"><input type="radio" name="mechanical" value="ผ่าน" checked={form.mechanical === 'ผ่าน'} onChange={handleChange} required /> ผ่าน</label>
                <label className="ml-2 text-black"><input type="radio" name="mechanical" value="ไม่ผ่าน" checked={form.mechanical === 'ไม่ผ่าน'} onChange={handleChange} /> ไม่ผ่าน</label>
              </div>
              <div className="ml-2 text-black">เทปเคมีภายนอก:
                <label className="ml-2 text-black"><input type="radio" name="chemical_external" value="ผ่าน" checked={form.chemical_external === 'ผ่าน'} onChange={handleChange} required /> ผ่าน</label>
                <label className="ml-2 text-black"><input type="radio" name="chemical_external" value="ไม่ผ่าน" checked={form.chemical_external === 'ไม่ผ่าน'} onChange={handleChange} /> ไม่ผ่าน</label>
              </div>
              <div className="ml-2 text-black">เทปเคมีภายใน:
                <label className="ml-2 text-black"><input type="radio" name="chemical_internal" value="ผ่าน" checked={form.chemical_internal === 'ผ่าน'} onChange={handleChange} required /> ผ่าน</label>
                <label className="ml-2 text-black"><input type="radio" name="chemical_internal" value="ไม่ผ่าน" checked={form.chemical_internal === 'ไม่ผ่าน'} onChange={handleChange} /> ไม่ผ่าน</label>
              </div>
              <div className="mt-2 text-black">ติดกระดาษ Printed out จากเครื่อง
                <select name="printed_out_type" className="border rounded px-2 py-1 ml-2 text-black" value={form.printed_out_type || ''} onChange={handleChange}>
                  <option value="Autoclave">Autoclave</option>
                  <option value="EO">EO</option>
                  <option value="Plasma">Plasma</option>
                </select>
              </div>
              <div className="font-bold mt-2 text-black">ตัวเชื้อทดสอบชีวภาพ (เฉพาะรอบที่ใช้ทดสอบ)</div>
              <div className="ml-2 text-black">ผล:
                <label className="ml-2 text-black"><input type="radio" name="bio_test" value="ผ่าน" checked={form.bio_test === 'ผ่าน'} onChange={handleChange} /> ผ่าน</label>
                <label className="ml-2 text-black"><input type="radio" name="bio_test" value="ไม่ผ่าน" checked={form.bio_test === 'ไม่ผ่าน'} onChange={handleChange} /> ไม่ผ่าน</label>
              </div>
              <label className="font-bold mt-2 text-black">เจ้าหน้าที่ Sterile <input name="sterile_staff" type="text" className="border rounded px-2 py-1 w-full text-black" value={form.sterile_staff || ''} onChange={handleChange} /></label>
              <label className="font-bold text-black">ผู้อ่านผล <input name="result_reader" type="text" className="border rounded px-2 py-1 w-full text-black" value={form.result_reader || ''} onChange={handleChange} /></label>
            </div>
            {/* ฝั่งขวา: ตารางอุปกรณ์ */}
            <div className="flex-[2] min-w-[320px]">
              <div className="font-bold text-center mb-2 text-black">รายละเอียดอุปกรณ์ที่นำเข้าอบ</div>
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