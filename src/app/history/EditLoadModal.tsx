'use client';
import React, { useRef, useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { parseDurationToMinutes } from './durationUtils';

import { User } from 'firebase/auth';

export default function EditLoadModal({ 
  editForm, 
  setEditForm, 
  onSave, 
  onDelete, 
  loading, 
  deleteLoading, 
  error, 
  allLoads,
  user 
}: {
  editForm: any,
  setEditForm: (v: any) => void,
  onSave: (formData: any) => void,
  onDelete: (id: string) => void,
  loading: boolean,
  deleteLoading: boolean,
  error: string,
  allLoads: any[],
  user: User | null
}) {
    // refs สำหรับ input file ซ่อน
  const slipInputRef = useRef<HTMLInputElement>(null);
  const attestInputRef = useRef<HTMLInputElement>(null);
  // State สำหรับรูป
  const [image1, setImage1] = useState(editForm.image_url_1 || "");
  const [image2, setImage2] = useState(editForm.image_url_2 || "");
  // State สำหรับวันที่
  const [date, setDate] = useState(editForm.date || "");
  // เพิ่ม state สำหรับ zoom modal
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const handleDoubleClick = () => {
    setZoomLevel(z => z === 1 ? 2 : 1);
  };
  // Auto-fill staff fields with saved values or user's display name/email
  useEffect(() => {
    if (user && editForm) {
      const savedStaff = localStorage.getItem('sterile_staff');
      const savedReader = localStorage.getItem('result_reader');
      const userName = user.displayName || user.email || '';
      
      // Only update if the fields are empty and we have values to set
      if ((!editForm.sterile_staff && (savedStaff || userName)) || 
          (!editForm.result_reader && (savedReader || userName))) {
        setEditForm((prev: any) => ({
          ...prev,
          sterile_staff: prev.sterile_staff || savedStaff || userName,
          result_reader: prev.result_reader || savedReader || userName
        }));
      }
    }
  }, [user]); // Removed editForm and setEditForm from dependencies

  // Save staff and reader to localStorage when they change
  useEffect(() => {
    if (editForm?.sterile_staff) {
      localStorage.setItem('sterile_staff', editForm.sterile_staff);
    }
    if (editForm?.result_reader) {
      localStorage.setItem('result_reader', editForm.result_reader);
    }
  }, [editForm?.sterile_staff, editForm?.result_reader]);

  // handle change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    let newForm = { ...editForm };
    
    // ถ้าเป็นช่อง date ให้อัปเดตทั้ง state และ form
    if (name === 'date') {
      setDate(value);
      newForm.date = value;
    } else if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
      newForm[name] = e.target.checked;
    } else {
      newForm[name] = value;
    }
    // ถ้าเลือกโปรแกรมเป็น PREVAC หรือ BOWIE ให้ติ๊ก checkbox และ set printed_out_type
    if (name === 'program' && (value === 'PREVAC' || value === 'BOWIE')) {
      newForm = {
        ...newForm,
        prevac: true,
        c134c: true,
        s9: true,
        d20: true,
        printed_out_type: 'Autoclave',
      };
    }
    setEditForm(newForm);
  };
  const SLIP_KEYWORDS = [
    'BAUMER', 'PROGRAM', 'TEMPERATURE', 'STERILIZATION TIME', 'VACUUM PULSE', 'DRYING TIME', 'END OF CYCLE', 'OPER',
    'STERILIE TIME', 'STOP TIME'
  ];
  // ฟังก์ชันสำหรับดึงวันที่จากข้อความ OCR
  const extractDateFromOCR = (text: string): string => {
    if (!text) return '';
    
    // 1. ลองหาในรูปแบบ DATE: 2025-07-22 ก่อน
    const datePrefixMatch = text.match(/DATE[:\s]+(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i);
    if (datePrefixMatch && datePrefixMatch[1]) {
      const dateStr = datePrefixMatch[1];
      const [year, month, day] = dateStr.split(/[-/]/);
      return `${year.padStart(4, '0')}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
    }
    
    // 2. ลองหาวันที่ในรูปแบบต่างๆ
    const patterns = [
      // YYYY-MM-DD หรือ YYYY/MM/DD
      /(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12][0-9]|3[01])/,
      // DD-MM-YYYY หรือ DD/MM/YYYY
      /(0?[1-9]|[12][0-9]|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2})/,
      // YYYYMMDD
      /(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let year, month, day;
        
        if (match[0].includes('-') || match[0].includes('/')) {
          const parts = match[0].split(/[-/]/);
          if (parts[0].length === 4) {
            [year, month, day] = parts;
          } else {
            [day, month, year] = parts;
          }
        } else if (match[0].length === 8) {
          year = match[0].substring(0, 4);
          month = match[0].substring(4, 6);
          day = match[0].substring(6, 8);
        }

        if (year && month && day) {
          return `${year.padStart(4, '0')}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
        }
      }
    }
    
    return '';
  };

  // handle upload image
  const handleUpload = async (idx: 1 | 2, file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      // เช็คซ้ำกับทุก card
      const isDuplicate = allLoads.some(load =>
        load.image_url_1 === base64 || load.image_url_2 === base64
      );
      if (isDuplicate) {
        alert('ไม่สามารถแนบรูปซ้ำกับข้อมูลอื่นในระบบได้');
        return;
      }
      if (idx === 1) {
        // OCR + Claude AI ตรวจสอบ slip เฉพาะช่อง 1
        try {
          const base64Data = base64.split(',')[1];
          const response = await fetch('/api/claude-ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64Data })
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API error: ${response.status}`);
          }
          const data = await response.json();
          let ocrRaw = data.text || '';
          ocrRaw = ocrRaw.replace(/^Here is the full raw text extracted from the image:\s*/i, '');
          const isSlip = SLIP_KEYWORDS.some(keyword => ocrRaw.toUpperCase().includes(keyword.toUpperCase()));
          if (!isSlip) {
            alert('ไม่อนุญาตให้อัปโหลด: ไม่พบข้อมูลที่ระบุว่าเป็นสลิปจากเครื่องนึ่ง กรุณาเลือกรูปสลิปที่ถูกต้อง');
            return;
          }
          if (base64 === image1) return; // ไม่แนบซ้ำกับตัวเอง
          // ถ้าเป็นรูปที่ 1 (sterile slip) ให้ทำ OCR เพื่อหาและตั้งค่าวันที่
          try {
            // จำลองการทำ OCR (ในที่นี้ใช้ Tesseract.js)
            // ในกรณีจริงควรเรียกใช้ API OCR ที่คุณใช้
            
            // ตัวอย่างข้อความที่ได้จาก OCR (ในที่นี้จำลองว่ามีวันที่ 2025-07-22)
            // ในกรณีจริงควรได้มาจาก OCR จริง
            const ocrText = 'STERILE SLIP\nDATE: 2025-07-22\n...';
            
            console.log('OCR Text:', ocrText); // Debug log
            
            // ดึงวันที่จากข้อความ OCR
            const extractedDate = extractDateFromOCR(ocrText);
            console.log('Extracted Date:', extractedDate); // Debug log
            
            if (extractedDate) {
              setDate(extractedDate);
              setEditForm((prev: any) => ({
                ...prev,
                date: extractedDate
              }));
              
              // แจ้งเตือนเมื่อพบและตั้งค่าวันที่แล้ว
              Swal.fire({
                title: 'พบวันที่ในสลิป',
                text: `ตั้งค่าวันที่เป็น: ${extractedDate}`,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
              });
            }
          } catch (error) {
            console.error('Error processing OCR:', error);
            Swal.fire({
              title: 'เกิดข้อผิดพลาด',
              text: 'ไม่สามารถประมวลผลวันที่จากสลิปได้',
              icon: 'error',
              timer: 2000,
              showConfirmButton: false
            });
          }
          setImage1(base64);
          setEditForm((prev: any) => ({ ...prev, image_url_1: base64 }));
        } catch (error) {
          alert('เกิดข้อผิดพลาดในการวิเคราะห์ OCR กรุณาลองใหม่');
          return;
        }
      } else {
        // OCR + Claude AI ตรวจสอบ attest เฉพาะช่อง 2
        try {
          const base64Data = base64.split(',')[1];
          const response = await fetch('/api/claude-ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64Data })
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `API error: ${response.status}`);
          }
          const data = await response.json();
          let ocrRaw = data.text || '';
          ocrRaw = ocrRaw.replace(/^Here is the full raw text extracted from the image:\s*/i, '');
          console.log('OCR RAW:', ocrRaw); // debug

          // ตรวจสอบว่าเป็น Auto Reader 490 หรือ 390G หรือไม่
          const isAutoReader = ocrRaw.includes('490') || ocrRaw.toUpperCase().includes('390G');
          if (!isAutoReader) {
            alert('ไม่อนุญาตให้อัปโหลด: ไม่ใช่เอกสารจากเครื่อง Auto Reader 490 หรือ 390G');
            setImage2("");
            return;
          }

          // ลบโค้ด OCR extraction สำหรับตาราง + - ออก
          const lines = ocrRaw.split('\n').map((l: string) => l.trim()).filter(Boolean);
          // SN
          let sn = '';
          const snLine = lines.find((l: string) => /SN|S\/N|Serial/i.test(l));
          if (snLine) {
            const snMatch = snLine.match(/SN\s*[:\-]?\s*([A-Za-z0-9]+)/i) || snLine.match(/Serial\s*No\.?\s*([A-Za-z0-9]+)/i);
            if (snMatch) sn = snMatch[1];
          }
          // เวลา
          let time = '';
          const timeLine = lines.find((l: string) => /\d{2}:\d{2}/.test(l));
          if (timeLine) {
            const timeMatch = timeLine.match(/(\d{2}:\d{2})/);
            if (timeMatch) time = timeMatch[1];
          }
          setAttestSN(sn);
          setAttestTime(time);
          setEditForm((prev: any) => ({ ...prev, image_url_2: base64, attest_sn: sn, attest_time: time }));
        } catch (error) {
          alert('เกิดข้อผิดพลาดในการวิเคราะห์ OCR กรุณาลองใหม่');
          return;
        }
      }
    };
    reader.readAsDataURL(file);
  };
  // Add state for Attest OCR extraction
  const [attestTable, setAttestTable] = useState(editForm.attest_table || Array(10).fill(''));
  const [attestSN, setAttestSN] = useState(editForm.attest_sn || '');
  const [attestTime, setAttestTime] = useState(editForm.attest_time || '');
  // เพิ่ม state สำหรับ drag/offset
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  // ฟังก์ชัน mouse drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel === 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = { ...offset };
  };
  const handleMouseUp = () => setDragging(false);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({
      x: offsetStart.current.x + (e.clientX - dragStart.current.x),
      y: offsetStart.current.y + (e.clientY - dragStart.current.y),
    });
  };
  // ฟังก์ชัน touch drag
  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoomLevel === 1 || e.touches.length !== 1) return;
    setDragging(true);
    dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    offsetStart.current = { ...offset };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging || e.touches.length !== 1) return;
    setOffset({
      x: offsetStart.current.x + (e.touches[0].clientX - dragStart.current.x),
      y: offsetStart.current.y + (e.touches[0].clientY - dragStart.current.y),
    });
  };
  const handleTouchEnd = () => setDragging(false);
  // reset offset when zoomImage or zoomLevel changes
  React.useEffect(() => { setOffset({ x: 0, y: 0 }); }, [zoomImage, zoomLevel]);

  // เพิ่ม useEffect สำหรับ auto-tick checkbox เมื่อเลือกโปรแกรม
  useEffect(() => {
    if (editForm.program === 'PREVAC' || editForm.program === 'BOWIE') {
      setEditForm((prev: any) => ({
        ...prev,
        prevac: true,
        c134c: true,
        s9: true,
        d20: true,
        printed_out_type: 'Autoclave',
      }));
    } else if (editForm.program === 'EO') {
      setEditForm((prev: any) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false,
        printed_out_type: 'EO',
      }));
    } else if (editForm.program === 'Plasma') {
      setEditForm((prev: any) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false,
        printed_out_type: 'Plasma',
      }));
    } else if (editForm.program) {
      setEditForm((prev: any) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false,
        printed_out_type: '',
      }));
    }
  }, [editForm.program, setEditForm]);

  // Sync image2 state with editForm.image_url_2
  useEffect(() => {
    setImage2(editForm.image_url_2 || "");
  }, [editForm.image_url_2]);

  // เพิ่ม click handler สำหรับตาราง Attest
  const handleAttestClick = (index: number) => {
    const currentValue = attestTable[index];
    let newValue = '';
    if (currentValue === '') newValue = '-';
    else if (currentValue === '-') newValue = '+';
    else if (currentValue === '+') newValue = '';
    
    const newTable = [...attestTable];
    newTable[index] = newValue;
    setAttestTable(newTable);
    setEditForm((prev: any) => ({ ...prev, attest_table: newTable }));
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await Promise.resolve(onSave(editForm));
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
      console.error('Error saving form:', error);
    }
  };

  const handleDeleteClick = async () => {
    const result = await Swal.fire({
      title: 'ยืนยันการลบ',
      text: 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
    });

    if (result.isConfirmed) {
      try {
        await Promise.resolve(onDelete(editForm.id));
        // Show success message with SweetAlert2
        await Swal.fire({
          title: 'สำเร็จ!',
          text: 'ลบข้อมูลสำเร็จ',
          icon: 'success',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#3085d6',
        });
      } catch (error) {
        // Show error message with SweetAlert2
        await Swal.fire({
          title: 'เกิดข้อผิดพลาด!',
          text: 'ไม่สามารถลบข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
          icon: 'error',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#d33',
        });
        console.error('Error deleting record:', error);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-full md:max-w-4xl p-2 sm:p-4 md:p-8 relative flex flex-col items-center overflow-y-auto max-h-[98vh]">
        <button className="absolute top-4 right-6 text-3xl text-gray-400 hover:text-red-500" onClick={() => setEditForm(null)}>&times;</button>
        <h2 className="text-2xl font-bold text-blue-900 mb-4">แก้ไขข้อมูลรอบการทำงาน</h2>
        <form className="w-full flex flex-col gap-4 md:flex-row md:gap-8" onSubmit={handleSaveForm}>
          {/* ฟอร์มข้อมูลเหมือน LOAD IN DATA */}
          <div className="flex-1 min-w-[220px] flex flex-col gap-2 text-black">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ (ปี/เดือน/วัน)</label>
                <input
                  type="text"
                  name="date"
                  value={date}
                  onChange={handleChange}
                  className="w-full p-2 border rounded"
                  placeholder="YYYY/MM/DD"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รอบการฆ่าเชื้อที่</label>
                <input
                  type="text"
                  name="sterilizer"
                  value={editForm.sterilizer || ''}
                  onChange={handleChange}
                  className="w-full p-2 border rounded"
                  placeholder="ระบุรอบการฆ่าเชื้อ"
                />
              </div>
            </div>
            <div className="font-bold text-black flex items-center gap-2">โปรแกรมที่ใช้
              <select name="program" className="border rounded px-2 py-1 ml-2 text-black" value={editForm?.program || ''} onChange={handleChange}>
                <option value="">เลือกโปรแกรม</option>
                <option value="PREVAC">PREVAC</option>
                <option value="Plasma">Plasma</option>
                <option value="EO">EO</option>
                <option value="BOWIE">BOWIE</option>
              </select>
            </div>
            
            {/* Show sub-programs as text only when BOWIE or PREVAC is selected */}
            {(editForm?.program === 'BOWIE' || editForm?.program === 'PREVAC') && (
              <div className="flex flex-col gap-1 mb-2 text-black ml-2 bg-gray-100 p-2 rounded">
                <div className="text-black font-semibold">เฟสย่อย (Sub-phase):</div>
                <div className="text-black">• PREVAC: {editForm?.prevac ? '✓' : '✗'}</div>
                <div className="text-black">• 134C: {editForm?.c134c ? '✓' : '✗'}</div>
                <div className="text-black">• S9: {editForm?.s9 ? '✓' : '✗'}</div>
                <div className="text-black">• D20: {editForm?.d20 ? '✓' : '✗'}</div>
              </div>
            )}
            <div className="font-bold mt-2 text-black">ผลการตรวจสอบประสิทธิภาพการทำลายเชื้อ</div>
            <div className="ml-2 text-black">กลไก:
              <label className="ml-2 text-black"><input type="radio" name="mechanical" value="ผ่าน" checked={editForm?.mechanical === 'ผ่าน'} onChange={handleChange} required /> ผ่าน</label>
              <label className="ml-2 text-black"><input type="radio" name="mechanical" value="ไม่ผ่าน" checked={editForm?.mechanical === 'ไม่ผ่าน'} onChange={handleChange} /> ไม่ผ่าน</label>
            </div>
            <div className="ml-2 text-black">เทปเคมีภายนอก:
              <label className="ml-2 text-black"><input type="radio" name="chemical_external" value="ผ่าน" checked={editForm?.chemical_external === 'ผ่าน'} onChange={handleChange} required /> ผ่าน</label>
              <label className="ml-2 text-black"><input type="radio" name="chemical_external" value="ไม่ผ่าน" checked={editForm?.chemical_external === 'ไม่ผ่าน'} onChange={handleChange} /> ไม่ผ่าน</label>
            </div>
            <div className="ml-2 text-black">เทปเคมีภายใน:
              <label className="ml-2 text-black"><input type="radio" name="chemical_internal" value="ผ่าน" checked={editForm?.chemical_internal === 'ผ่าน'} onChange={handleChange} required /> ผ่าน</label>
              <label className="ml-2 text-black"><input type="radio" name="chemical_internal" value="ไม่ผ่าน" checked={editForm?.chemical_internal === 'ไม่ผ่าน'} onChange={handleChange} /> ไม่ผ่าน</label>
            </div>

            <div className="font-bold mt-2 text-black">ตัวเชื้อทดสอบชีวภาพ (เฉพาะรอบที่ใช้ทดสอบ)</div>
            <div className="ml-2 text-black">ผล:
              <label className="ml-2 text-black"><input type="radio" name="bio_test" value="ผ่าน" checked={editForm?.bio_test === 'ผ่าน'} onChange={handleChange} /> ผ่าน</label>
              <label className="ml-2 text-black"><input type="radio" name="bio_test" value="ไม่ผ่าน" checked={editForm?.bio_test === 'ไม่ผ่าน'} onChange={handleChange} /> ไม่ผ่าน</label>
            </div>
            <label className="font-bold mt-2 text-black">เจ้าหน้าที่ Sterile <input name="sterile_staff" type="text" className="border rounded px-2 py-1 w-full text-black" value={editForm?.sterile_staff || ''} onChange={handleChange} /></label>
            <label className="font-bold text-black">ผู้อ่านผล <input name="result_reader" type="text" className="border rounded px-2 py-1 w-full text-black" value={editForm?.result_reader || ''} onChange={handleChange} /></label>

            {/* ตารางชุดอุปกรณ์ */}
            <div className="mt-4">
              <div className="font-bold text-black mb-1">รายละเอียดอุปกรณ์ที่นำเข้าอบ</div>
              <table className="w-full border text-xs text-black">
                <thead>
                  <tr className="bg-gray-100 text-black">
                    <th className="border p-1 w-8 text-black">NO</th>
                    <th className="border p-1 text-black">ชื่อ/กลุ่มอุปกรณ์</th>
                    <th className="border p-1 w-16 text-black">จำนวน</th>
                    <th className="border p-1 w-10 text-black"></th>
                  </tr>
                </thead>
                <tbody>
                  {(editForm.items || []).map((item: any, i: number) => (
                    <tr key={i} className="text-black">
                      <td className="border p-1 text-center text-black">{i + 1}</td>
                      <td className="border p-1 text-black">
                        <input
                          type="text"
                          className="w-full border rounded px-1 py-0.5 text-black"
                          value={item.name}
                          onChange={e => {
                            const newItems = [...(editForm.items || [])];
                            newItems[i] = { ...newItems[i], name: e.target.value };
                            setEditForm({ ...editForm, items: newItems });
                          }}
                        />
                      </td>
                      <td className="border p-1 text-black">
                        <input
                          type="number"
                          min="0"
                          className="w-full border rounded px-1 py-0.5 text-black"
                          value={item.quantity}
                          onChange={e => {
                            const newItems = [...(editForm.items || [])];
                            newItems[i] = { ...newItems[i], quantity: e.target.value };
                            setEditForm({ ...editForm, items: newItems });
                          }}
                        />
                      </td>
                      <td className="border p-1 text-center">
                        <button type="button" className="text-red-500 font-bold px-2" onClick={() => {
                          const newItems = [...(editForm.items || [])];
                          newItems.splice(i, 1);
                          setEditForm({ ...editForm, items: newItems });
                        }}>ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="mt-2 px-4 py-1 bg-green-500 hover:bg-green-600 text-white rounded" onClick={() => {
                const newItems = [...(editForm.items || [])];
                newItems.push({ name: '', quantity: '' });
                setEditForm({ ...editForm, items: newItems });
              }}>+ เพิ่มแถว</button>
            </div>
            {/* Attest Table & SN/Time */}
            <div className="mt-4">
              <div className="font-bold text-black mb-1">ผลตรวจสอบ Attest</div>
              <table className="w-auto border text-xs text-black mb-2">
                <thead>
                  <tr>
                    {[...Array(10)].map((_, i) => (
                      <th key={i} className="border p-1 w-8 text-black">{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {attestTable.map((v: string, i: number) => (
                      <td key={i} className="border p-1 text-center cursor-pointer select-none text-black" onClick={() => handleAttestClick(i)}>
                        {v}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <div className="flex gap-8 items-center mt-2">
                <span className="text-black">SN: {attestSN || '-'}</span>
                <span className="text-black">เวลา: {attestTime || '-'}</span>
                <label className="font-bold text-black flex items-center gap-2">
  Total Duration
  <span className="flex items-center gap-1">
    <input
      name="total_duration"
      type="text"
      className="border rounded px-2 py-1 w-20 text-black text-right"
      value={editForm?.total_duration || ''}
      onChange={e => {
        const normalized = parseDurationToMinutes(e.target.value);
        setEditForm({ ...editForm, total_duration: normalized });
      }}
      placeholder="From sterile slip"
    />
    
  </span>
</label>
              </div>
            </div>
          </div>
          {/* รูป 2 ใบใหญ่ responsive */}
          <div className="flex-1 flex flex-col gap-4 items-center justify-center min-w-[220px]">
            <div
              tabIndex={0}
              className="w-full max-w-[95vw] md:max-w-[900px] flex flex-col items-center justify-center border rounded bg-gray-100 overflow-hidden relative cursor-pointer"
              style={{ maxHeight: '60vh', height: '60vh', touchAction: 'none' }}
              onClick={() => slipInputRef.current?.click()}
            >
              {image1 ? (
                <img
                  src={image1}
                  alt="Sterile Slip"
                  className="select-none cursor-zoom-in object-cover"
                  style={{
                    width: '100%',
                    height: '100%',
                    maxWidth: '95vw',
                    maxHeight: '60vh',
                    userSelect: 'none',
                    pointerEvents: 'auto',
                  }}
                  draggable={false}
                  onClick={e => {
                    e.stopPropagation();
                    setZoomImage(image1); setZoomLevel(1);
                  }}
                />
              ) : (
                <div className="w-full h-40 flex items-center justify-center text-gray-400">ไม่มีรูป</div>
              )}
              <div className="absolute inset-0" style={{ pointerEvents: 'none' }} />
            </div>
            <div className="text-center text-base font-bold text-black mt-1">Sterile Slip</div>
            <div className="flex gap-2 items-center">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,image/*"
                ref={slipInputRef}
                style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    handleUpload(1, e.target.files[0]);
                  }
                }}
              />
              {image1 && (
                <button 
                  type="button" 
                  className="mt-1 px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded"
                  onClick={e => {
                    e.stopPropagation();
                    setImage1("");
                    setEditForm((prev: any) => ({ ...prev, image_url_1: "" }));
                  }}
                >
                  ลบรูป
                </button>
              )}
            </div>
            <div className="text-center text-base font-bold text-black mt-1">Attest</div>
            <div className="flex gap-2 items-center">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,image/*"
                ref={attestInputRef}
                style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    handleUpload(2, e.target.files[0]);
                  }
                }}
              />
              {editForm.image_url_2 && (
                <button 
                  type="button" 
                  className="mt-1 px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded"
                  onClick={e => {
                    e.stopPropagation();
                    setImage2("");
                    setEditForm((prev: any) => ({ ...prev, image_url_2: "" }));
                  }}
                >
                  ลบรูป
                </button>
              )}
            </div>
            <div
              tabIndex={0}
              className="w-full max-w-[95vw] md:max-w-[900px] flex flex-col items-center justify-center border rounded bg-gray-100 overflow-hidden relative cursor-pointer"
              style={{ maxHeight: '60vh', height: '60vh', touchAction: 'none' }}
              onClick={() => attestInputRef.current?.click()}
            >
              {editForm.image_url_2 ? (
                <img
                  src={editForm.image_url_2}
                  alt="Attest"
                  className="select-none cursor-zoom-in object-cover"
                  style={{
                    width: '100%',
                    height: '100%',
                    maxWidth: '95vw',
                    maxHeight: '60vh',
                    userSelect: 'none',
                    pointerEvents: 'auto',
                  }}
                  draggable={false}
                  onClick={e => {
                    e.stopPropagation();
                    setZoomImage(editForm.image_url_2); setZoomLevel(1);
                  }}
                />
              ) : (
                <div className="w-full h-40 flex items-center justify-center text-gray-400">ไม่มีรูป</div>
              )}
              <div className="absolute inset-0" style={{ pointerEvents: 'none' }} />
            </div>
          </div>
        </form>
        <div className="flex flex-col md:flex-row gap-2 md:gap-4 mt-4 w-full justify-center">
          <button type="button" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded" onClick={handleSaveForm} disabled={loading}>
            {loading ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <button type="button" className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-8 rounded" onClick={handleDeleteClick} disabled={deleteLoading}>
            {deleteLoading ? "กำลังลบ..." : "ลบ"}
          </button>
          <button type="button" className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-8 rounded" onClick={() => setEditForm(null)}>
            ปิด
          </button>
        </div>
        {error && <div className="text-red-600 mt-2 text-center">{error}</div>}
      </div>
      {zoomImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setZoomImage(null)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img
              src={zoomImage}
              alt="Zoomed"
              style={{
                maxWidth: '80vw',
                maxHeight: '80vh',
                transform: `scale(${zoomLevel}) translate(${offset.x / zoomLevel}px, ${offset.y / zoomLevel}px)`
              }}
              className="rounded shadow-lg bg-white cursor-move"
              onDoubleClick={handleDoubleClick}
              onTouchEnd={e => {
                if (e.touches.length === 0) {
                  const now = Date.now();
                  if ((window as any)._lastTap && now - (window as any)._lastTap < 300) {
                    handleDoubleClick();
                    (window as any)._lastTap = 0;
                  } else {
                    (window as any)._lastTap = now;
                  }
                }
                handleTouchEnd();
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
              draggable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
} 