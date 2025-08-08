'use client';
import React, { useRef, useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { parseDurationToMinutes } from './durationUtils';
import { User } from 'firebase/auth';

type ImageSourceType = 'camera' | 'file' | null;

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
    // refs สำหรับ input file และ video
  const slipInputRef = useRef<HTMLInputElement>(null);
  const attestInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State สำหรับรูป
  const [image1, setImage1] = useState(editForm.image_url_1 || "");
  const [image2, setImage2] = useState(editForm.image_url_2 || "");
  
  // State สำหรับจัดการ modal และกล้อง
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [currentImageIdx, setCurrentImageIdx] = useState<1 | 2 | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // State สำหรับวันที่
  const [date, setDate] = useState(editForm.date || "");
  const [dateError, setDateError] = useState("");
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

  // ฟังก์ชันตรวจสอบความถูกต้องของวันที่
  const validateDate = (dateStr: string): boolean => {
    if (!dateStr) return true; // Allow empty date for now
    
    // ตรวจสอบรูปแบบ YYYY/MM/DD
    const dateRegex = /^\d{4}\/(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])$/;
    if (!dateRegex.test(dateStr)) {
      setDateError('รูปแบบวันที่ไม่ถูกต้อง ต้องเป็น YYYY/MM/DD');
      return false;
    }
    
    // ตรวจสอบว่าวันที่ถูกต้องหรือไม่
    const [year, month, day] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      setDateError('วันที่ไม่ถูกต้อง');
      return false;
    }
    
    setDateError('');
    return true;
  };
  
  // handle change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    let newForm = { ...editForm };
    
    // ถ้าเป็นช่อง date ให้อัปเดตทั้ง state และ form
    if (name === 'date') {
      // ตรวจสอบและจัดรูปแบบวันที่
      let formattedValue = value;
      
      // ลบอักขระที่ไม่ใช่ตัวเลข
      const numbers = value.replace(/[^0-9]/g, '');
      
      // จัดรูปแบบให้เป็น YYYY/MM/DD
      if (numbers.length <= 4) {
        formattedValue = numbers;
      } else if (numbers.length <= 6) {
        formattedValue = `${numbers.slice(0, 4)}/${numbers.slice(4)}`;
      } else {
        formattedValue = `${numbers.slice(0, 4)}/${numbers.slice(4, 6)}/${numbers.slice(6, 8)}`;
      }
      
      setDate(formattedValue);
      newForm.date = formattedValue;
      
      // ตรวจสอบความถูกต้องของวันที่
      validateDate(formattedValue);
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
  // ฟังก์ชันสำหรับแปลงวันที่เป็น Date object
  const parseDate = (year: string, month: string, day: string): Date | null => {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10) - 1; // เดือนใน JavaScript เริ่มที่ 0
    const d = parseInt(day, 10);
    
    // แปลงปี 2 หลักเป็น 4 หลัก (ถ้า < 50 เป็น 20xx, ถ้า >= 50 เป็น 19xx)
    const fullYear = y < 100 ? (y < 50 ? 2000 + y : 1900 + y) : y;
    
    const date = new Date(fullYear, m, d);
    
    // ตรวจสอบว่าเป็นวันที่ถูกต้อง
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // ตรวจสอบว่าวันที่ตรงกับค่าที่ใส่มาหรือไม่
    if (date.getFullYear() !== fullYear || date.getMonth() !== m || date.getDate() !== d) {
      return null;
    }
    
    return date;
  };

  // ฟังก์ชันดึงข้อมูลรอบการฆ่าเชื้อจากข้อความ OCR
  const extractSterilizerInfo = (text: string): string => {
    // รูปแบบที่รองรับ:
    // - Total cycle no: 12345
    // - cycle NR: 12345
    // - Model: XXXXX-12345
    // - number of cycle: 12345
    const patterns = [
      /(?:Total cycle no|cycle NR|number of cycle)[:\s]*([A-Za-z0-9-]+)/i,
      /Model[:\s]*([A-Za-z0-9-]+)/i,
      /(?:cycle|no|nr|#)[:\s]*(\d+)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return ''; // ถ้าไม่พบข้อมูล
  };

  // ฟังก์ชันดึงเวลารวมจากข้อความ OCR
  const extractTotalDuration = (text: string): string | null => {
    // 1. หาจากรูปแบบ "TOTAL TIME: XX MIN" (รูปแบบจากใบรับรองเครื่อง PREVAC)
    const prevacTimeMatch = text.match(/TOTAL\s*TIME\s*[\:\s]+(\d+)\s*MIN/i);
    if (prevacTimeMatch) {
      return prevacTimeMatch[1]; // Return just the number of minutes
    }
    
    // 2. หาจากรูปแบบ "TOTAL DURATION:26min." (รูปแบบจากใบรับรองเครื่อง BOWIE)
    const bowieTimeMatch = text.match(/TOTAL\s*DURATION\s*[\:\s]*(\d+)\s*min\.?/i);
    if (bowieTimeMatch) {
      return bowieTimeMatch[1]; // Return just the number of minutes
    }
    
    // 3. หาจากรูปแบบต่างๆ ของเวลารวม
    const durationPatterns = [
      /(?:Total duration|Elapsed Time|Total time)[\s:]*([0-9]{1,2}:[0-9]{2})/i, // 1:23 or 01:23
      /(?:Total duration|Elapsed Time|Total time)[\s:]*([0-9]+\s*[mM]\s*[0-9]+\s*[sS]?)/i, // 1m23 or 1 m 23 s
      /(?:Total duration|Elapsed Time|Total time)[\s:]*([0-9]+(?:\.[0-9]+)?)\s*min/i // 1.5 min
    ];

    for (const pattern of durationPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const duration = match[1].trim();
        // แปลงรูปแบบให้เป็นนาที:วินาที
        if (duration.includes('m') || duration.includes('M')) {
          // แปลงจากรูปแบบ 1m23s หรือ 1 m 23 s เป็น 1:23
          const parts = duration.split(/[mM]/).map(p => p.replace(/[^0-9]/g, ''));
          if (parts.length === 2) {
            const minutes = parts[0] === '' ? '0' : parts[0];
            const seconds = parts[1].padStart(2, '0').substring(0, 2);
            return `${minutes}:${seconds}`;
          }
        } else if (duration.includes('min')) {
          // แปลงจากนาที.ทศนิยม เป็น นาที:วินาที
          const minutes = parseFloat(duration);
          if (!isNaN(minutes)) {
            const mins = Math.floor(minutes);
            const secs = Math.round((minutes - mins) * 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
          }
        } else if (duration.includes(':')) {
          // อยู่ในรูปแบบที่ถูกต้องอยู่แล้ว
          return duration;
        }
      }
    }

    // 2. ถ้าไม่เจอเวลารวมโดยตรง ให้ลองหา Start time และ Stop time แล้วคำนวณหาผลต่าง
    const startMatch = text.match(/Start time[\s:]*([0-9]{1,2}:[0-9]{2})/i);
    const stopMatch = text.match(/Stop time[\s:]*([0-9]{1,2}:[0-9]{2})/i);
    
    if (startMatch && stopMatch) {
      try {
        const [startH, startM] = startMatch[1].split(':').map(Number);
        const [stopH, stopM] = stopMatch[1].split(':').map(Number);
        
        let totalMinutes = (stopH * 60 + stopM) - (startH * 60 + startM);
        if (totalMinutes < 0) totalMinutes += 24 * 60; // กรณีข้ามวัน
        
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}` : minutes.toString();
      } catch (e) {
        console.error('Error calculating duration from start/stop times:', e);
      }
    }

    return null;
  };

  // ฟังก์ชันดึงวันที่จากข้อความ OCR
  const extractDateFromOCR = (text: string): string | null => {
    // รองรับรูปแบบวันที่หลายรูปแบบ
    const datePatterns = [
      // รูปแบบ YYYY/MM/DD หรือ YYYY-MM-DD หรือ YYYY.MM.DD
      /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g,
      // รูปแบบ DD/MM/YYYY หรือ DD-MM-YYYY หรือ DD.MM.YYYY
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g,
      // รูปแบบ YY/MM/DD หรือ YY-MM-DD (ปี 2 หลัก)
      /(\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/g,
      // รูปแบบ DATE: DD/MM/YY หรือ DATE:DD/MM/YY
      /DATE\s*[\:\s]\s*(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/gi,
    ];
    
    const dates: Date[] = [];
    
    // ค้นหาวันที่ทั้งหมดที่ตรงกับรูปแบบ
    for (const pattern of datePatterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0; // Reset the regex state
      
      while ((match = pattern.exec(text)) !== null) {
        try {
          let day: number | undefined;
          let month: number | undefined;
          let year: number | undefined;
          
          // ตรวจสอบรูปแบบวันที่
          if (match[0].toUpperCase().startsWith('DATE')) {
            // กรณีที่ขึ้นต้นด้วย DATE:
            day = match[1] ? parseInt(match[1], 10) : undefined;
            month = match[2] ? parseInt(match[2], 10) : undefined;
            year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear() % 100;
          } else if (match[0].includes('/') || match[0].includes('-') || match[0].includes('.')) {
            // กรณีรูปแบบอื่นๆ
            const parts = match[0].split(/[\/\-\.]/);
            if (parts[0].length === 4) {
              // YYYY/MM/DD
              year = parseInt(parts[0], 10);
              month = parts[1] ? parseInt(parts[1], 10) : undefined;
              day = parts[2] ? parseInt(parts[2], 10) : undefined;
            } else if (parts[2] && parts[2].length <= 2) {
              // DD/MM/YY หรือ DD/MM/YYYY
              day = parts[0] ? parseInt(parts[0], 10) : undefined;
              month = parts[1] ? parseInt(parts[1], 10) : undefined;
              year = parts[2] ? parseInt(parts[2], 10) : undefined;
            } else {
              // DD/MM/YYYY
              day = parts[0] ? parseInt(parts[0], 10) : undefined;
              month = parts[1] ? parseInt(parts[1], 10) : undefined;
              year = parts[2] ? parseInt(parts[2], 10) : undefined;
            }
          }
          
          // ตรวจสอบว่ามีข้อมูลวันที่ครบถ้วน
          if (day !== undefined && month !== undefined && year !== undefined) {
            // แปลงปี 2 หลักเป็น 4 หลัก (ถ้าจำเป็น)
            if (year < 100) {
              const currentYear = new Date().getFullYear();
              const currentCentury = Math.floor(currentYear / 100) * 100;
              year += currentCentury;
              if (year > currentYear + 50) year -= 100; // ปรับให้เป็นศตวรรษที่แล้วถ้าปีเกินไป 50 ปี
            }
            
            // ใช้ปีตามที่ได้มาโดยไม่ต้องแปลงเป็น พ.ศ.
            
            // ตรวจสอบความถูกต้องของวัน/เดือน/ปี
            const dateObj = new Date(year, month - 1, day);
            if (
              dateObj.getFullYear() === year &&
              dateObj.getMonth() === month - 1 &&
              dateObj.getDate() === day
            ) {
              dates.push(dateObj);
            }
          }
        } catch (e) {
          console.error('Error parsing date:', e);
        }
      }
    }
    
    // ถ้าไม่พบวันที่
    if (dates.length === 0) {
      // ลองหาเฉพาะตัวเลขที่อาจเป็นวันที่
      const simpleDateMatch = text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.]?(\d{2,4}))?\b/);
      if (simpleDateMatch) {
        try {
          const day = simpleDateMatch[1] ? parseInt(simpleDateMatch[1], 10) : undefined;
          const month = simpleDateMatch[2] ? parseInt(simpleDateMatch[2], 10) : undefined;
          let year = simpleDateMatch[3] ? parseInt(simpleDateMatch[3], 10) : new Date().getFullYear() % 100;
          
          if (day !== undefined && month !== undefined) {
            // แปลงปี 2 หลักเป็น 4 หลัก
            if (year < 100) {
              const currentYear = new Date().getFullYear();
              const currentCentury = Math.floor(currentYear / 100) * 100;
              year += currentCentury;
              if (year > currentYear + 50) year -= 100;
            }
            
            // แปลงเป็น พ.ศ.
            if (year < 2500) {
              year += 543;
            }
            
            const dateObj = new Date(year, month - 1, day);
            if (dateObj.getFullYear() === year && dateObj.getMonth() === month - 1 && dateObj.getDate() === day) {
              dates.push(dateObj);
            }
          }
        } catch (e) {
          console.error('Error parsing simple date:', e);
        }
      }
    }
    
    // ถ้ายังไม่พบวันที่เลย
    if (dates.length === 0) {
      return null;
    }
    
    // เรียงลำดับวันที่จากเก่าสุดไปใหม่สุด
    dates.sort((a, b) => a.getTime() - b.getTime());
    
    // ใช้วันที่ล่าสุด (วันที่มากที่สุด) สำหรับการ autofill
    const latestDate = dates[dates.length - 1];
    
    // แปลงกลับเป็นรูปแบบ YYYY/MM/DD
    const formattedYear = latestDate.getFullYear();
    const formattedMonth = String(latestDate.getMonth() + 1).padStart(2, '0');
    const formattedDay = String(latestDate.getDate()).padStart(2, '0');
    
    return `${formattedYear}/${formattedMonth}/${formattedDay}`;
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
            // ใช้ข้อความ OCR ที่ได้จาก API โดยตรง
            const ocrText = ocrRaw;
            console.log('OCR Text:', ocrText); // Debug log
            
            // ดึงวันที่จากข้อความ OCR
            const extractedDate = extractDateFromOCR(ocrText);
            console.log('Extracted Date:', extractedDate); // Debug log
            
            // ดึงข้อมูลรอบการฆ่าเชื้อจากข้อความ OCR
            const sterilizerInfo = extractSterilizerInfo(ocrText);
            
            // ดึงเวลารวมจากข้อความ OCR
            const totalDuration = extractTotalDuration(ocrText);
            console.log('Extracted Total Duration:', totalDuration); // Debug log
            
            // อัปเดตสถานะฟอร์ม
            const updates: any = {};
            
            if (extractedDate) {
              setDate(extractedDate);
              updates.date = extractedDate;
            }
            
            if (sterilizerInfo) {
              updates.sterilizer = sterilizerInfo;
            }
            
            if (totalDuration) {
              // แปลงรูปแบบเวลาเป็นนาที
              const minutes = parseDurationToMinutes(totalDuration);
              
              // เก็บค่าเป็นนาทีสำหรับทุกโปรแกรม รวมถึง EO
              updates.total_duration = minutes;
            }
            
            setEditForm((prev: any) => ({
              ...prev,
              ...updates
            }));
            
            // สร้างข้อความแจ้งเตือน
            const messageParts = [];
            
            if (extractedDate) {
              messageParts.push(`วันที่: ${extractedDate}`);
            }
            
            if (sterilizerInfo) {
              messageParts.push(`รอบการฆ่าเชื้อ: ${sterilizerInfo}`);
            }
            
            if (totalDuration) {
              if (editForm.program === 'EO') {
                // แปลงนาทีเป็นชั่วโมงสำหรับโปรแกรม EO
                const hours = (parseInt(totalDuration) / 60).toFixed(2);
                messageParts.push(`เวลารวม: ${hours} ชั่วโมง`);
              } else {
                messageParts.push(`เวลารวม: ${totalDuration} นาที`);
              }
            }
            
            // แสดงการแจ้งเตือนข้อความเดียวที่รวมทุกข้อมูล
            if (messageParts.length > 0) {
              Swal.fire({
                title: 'พบข้อมูลในสลิป',
                html: messageParts.join('<br>'),
                icon: 'success',
                timer: 4000,  // เพิ่มเวลาแสดงข้อความเป็น 4 วินาที
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
          
          // ตรวจสอบผล BI จาก OCR และตรวจสอบสติ๊กเกอร์ 3M
          let biResult = '';
          const lowerOcr = ocrRaw.toLowerCase();
          const has3MSticker = ocrRaw.includes('3M') || lowerOcr.includes('3m');
          
          if (has3MSticker) {
            biResult = 'ผ่าน';
          } else if (lowerOcr.includes('accept') || lowerOcr.includes('pass') || lowerOcr.includes('ผ่าน')) {
            biResult = 'ผ่าน';
          } else if (lowerOcr.includes('reject') || lowerOcr.includes('fail') || lowerOcr.includes('ไม่ผ่าน')) {
            biResult = 'ไม่ผ่าน';
          }

          // ดึงข้อมูลจาก OCR
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
          // วันที่จาก Attest OCR
          let attestDate = '';
          // ตรวจสอบรูปแบบวันที่ YYYY-MM-DD
          const dateMatch = ocrRaw.match(/(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            // แปลงรูปแบบจาก YYYY-MM-DD เป็น YYYY/MM/DD
            attestDate = dateMatch[0].replace(/-/g, '/');
          }
          
          setAttestSN(sn);
          setAttestTime(time);
          const updates: any = {
            image_url_2: base64,
            attest_sn: sn,
            attest_time: time
          };
          
          // อัปเดตผล BI และตรวจสอบ 3M sticker
          const alertMessages = [];
          
          if (has3MSticker) {
            // ตรวจพบสติ๊กเกอร์ 3M ให้ติ๊กผ่านทั้งหมด
            updates.bio_test = 'ผ่าน';
            updates.chemical_external = 'ผ่าน';
            updates.chemical_internal = 'ผ่าน';
            updates.mechanical = 'ผ่าน';
            
            alertMessages.push('ตรวจพบสติ๊กเกอร์ 3M: ตั้งค่าผลตรวจสอบทั้งหมดเป็น "ผ่าน"');
          } else if (biResult) {
            // กรณีปกติที่ตรวจพบผล BI
            updates.bio_test = biResult;
          }
          
          // ถ้าเจอวันที่จาก Attest OCR ให้อัปเดตฟอร์ม
          if (attestDate) {
            setDate(attestDate);
            updates.date = attestDate;
            
            // แจ้งเตือนเมื่อพบข้อมูล
            let alertMessage = `ตั้งค่าวันที่จาก Attest: ${attestDate}`;
            
            // เพิ่มข้อความผล BI และ 3M ถ้ามี
            if (has3MSticker) {
              alertMessage += `\n${alertMessages.join('\n')}`;
            } else if (biResult) {
              alertMessage += `\nตรวจพบผลตรวจสอบ BI: ${biResult}`;
            }
            
            Swal.fire({
              title: 'พบข้อมูลใน Attest',
              text: alertMessage,
              icon: 'success',
              timer: 4000,
              showConfirmButton: false
            });
          }
          
          setEditForm((prev: any) => ({ ...prev, ...updates }));
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // ตรวจสอบความถูกต้องของวันที่ก่อนบันทึก
    if (!validateDate(date)) {
      Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: 'กรุณาตรวจสอบรูปแบบวันที่ให้ถูกต้อง (YYYY/MM/DD)',
        icon: 'error',
        confirmButtonText: 'ตกลง'
      });
      return;
    }
    
    onSave(editForm);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Create a copy of the form data
      const formData = { ...editForm };
      
      // Check if attest image is present but no BI test is selected
      if (formData.image_url_2 && !formData.bio_test) {
        await Swal.fire({
          title: 'กรุณาเลือกผลตรวจสอบ BI',
          text: 'กรุณาเลือกผลตรวจสอบตัวเชื้อทดสอบชีวภาพ (ผ่าน/ไม่ผ่าน) เนื่องจากมีรูป Attest อยู่',
          icon: 'warning',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#3085d6',
        });
        return;
      }
      
      // Clear bio_test if no attest image is present
      if (!formData.image_url_2) {
        formData.bio_test = '';
      }
      
      await Promise.resolve(onSave(formData));
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

  // เริ่มต้นกล้อง
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      Swal.fire('ผิดพลาด', 'ไม่สามารถเข้าถึงกล้องได้', 'error');
    }
  };

  // หยุดกล้อง
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  // ถ่ายรูปและประมวลผล OCR
  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current || !currentImageIdx) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    
    // แสดง loading ก่อนเริ่มการประมวลผล
    Swal.fire({
      title: 'กำลังประมวลผลภาพ...',
      text: 'กรุณารอสักครู่',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      // ตั้งค่าขนาด canvas ให้เท่ากับวิดีโอ
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // วาดรูปจากวิดีโอลง canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // ปิดกล้องทันทีหลังจากถ่ายรูปเสร็จ
      stopCamera();
      setShowCameraModal(false);
      
      // แปลง canvas เป็น base64 แบบ JPEG คุณภาพ 0.9 (90%)
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      
      // ตรวจสอบขนาดของรูปภาพ
      if (imageDataUrl.length > 5 * 1024 * 1024) { // 5MB
        throw new Error('ขนาดรูปภาพใหญ่เกินไป กรุณาลองใหม่อีกครั้ง');
      }

      // สร้าง Blob object จาก base64
      const base64Response = await fetch(imageDataUrl);
      const blob = await base64Response.blob();
      
      // สร้าง File object
      const file = new File([blob], `camera_${Date.now()}.jpg`, { 
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      // ตรวจสอบ MIME type
      if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
        throw new Error('รูปแบบไฟล์ไม่รองรับ ต้องเป็น JPG หรือ PNG เท่านั้น');
      }
      
      // ตรวจสอบขนาดไฟล์
      if (file.size > 5 * 1024 * 1024) { // 5MB
        throw new Error('ขนาดไฟล์ใหญ่เกิน 5MB');
      }

      // อัปเดตรูปภาพใน state ก่อนทำ OCR
      if (currentImageIdx === 1) {
        setImage1(imageDataUrl);
        setEditForm((prev: any) => ({ ...prev, image_url_1: imageDataUrl }));
      } else if (currentImageIdx === 2) {
        setImage2(imageDataUrl);
        setEditForm((prev: any) => ({ ...prev, image_url_2: imageDataUrl }));
      }
      
      // เรียกใช้ handleUpload เพื่อประมวลผล OCR
      await handleUpload(currentImageIdx, file);
      
      // ปิด loading
      Swal.close();
      
    } catch (error) {
      console.error('Error capturing and processing image:', error);
      
      // ปิด loading และแสดงข้อความผิดพลาด
      Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: error instanceof Error ? error.message : 'ไม่สามารถประมวลผลรูปภาพได้ กรุณาลองใหม่อีกครั้ง',
        icon: 'error',
        confirmButtonText: 'ตกลง'
      });
      
      // รีเซ็ตสถานะกล้อง
      stopCamera();
      setShowCameraModal(false);
    }
  };

  // เปิด modal เลือกแหล่งที่มาของรูป
  const openImageSourceModal = (idx: 1 | 2) => {
    setCurrentImageIdx(idx);
    setShowCameraModal(true);
  };

  // เมื่อเลือกแหล่งที่มาของรูป
  const handleImageSourceSelect = (source: 'camera' | 'file') => {
    if (source === 'camera') {
      startCamera();
    } else {
      // เปิด file picker
      if (currentImageIdx === 1 && slipInputRef.current) {
        slipInputRef.current.click();
      } else if (currentImageIdx === 2 && attestInputRef.current) {
        attestInputRef.current.click();
      }
      setShowCameraModal(false);
    }
  };

  // เมื่อ component unmount ให้หยุดกล้อง
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Modal เลือกแหล่งที่มาของรูป
  const ImageSourceModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-80">
        <h3 className="text-lg font-bold mb-4">เลือกแหล่งที่มาของรูป</h3>
        <div className="flex flex-col space-y-4">
          <button
            onClick={() => handleImageSourceSelect('camera')}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            ถ่ายรูป
          </button>
          <button
            onClick={() => handleImageSourceSelect('file')}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
          >
            เลือกจากแกลเลอรี่
          </button>
          <button
            onClick={() => setShowCameraModal(false)}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 mt-4"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );

  // Modal กล้องถ่ายรูป
  const CameraModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-50">
      <div className="w-full max-w-md">
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-auto"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-black bg-opacity-50 flex justify-center space-x-4">
            <button
              onClick={captureImage}
              className="w-16 h-16 rounded-full bg-white bg-opacity-20 border-4 border-white"
            >
              <div className="w-8 h-8 bg-red-500 rounded-full mx-auto"></div>
            </button>
          </div>
          <button
            onClick={() => {
              stopCamera();
              setShowCameraModal(false);
            }}
            className="absolute top-4 right-4 text-white text-2xl"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-full md:max-w-4xl p-2 sm:p-4 md:p-8 relative flex flex-col items-center overflow-y-auto max-h-[98vh]">
        <button className="absolute top-4 right-6 text-3xl text-gray-400 hover:text-red-500" onClick={() => setEditForm(null)}>&times;</button>
        <h2 className="text-2xl font-bold text-blue-900 mb-4">แก้ไขข้อมูลรอบการทำงาน</h2>
        <form className="w-full flex flex-col gap-4 md:flex-row md:gap-8" onSubmit={handleSubmit}>
          {/* ฟอร์มข้อมูลเหมือน LOAD IN DATA */}
          <div className="flex-1 min-w-[220px] flex flex-col gap-2 text-black">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ (ปี/เดือน/วัน)</label>
                <div className="w-full">
                  <input
                    type="text"
                    name="date"
                    value={date}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded ${dateError ? 'border-red-500' : ''}`}
                    placeholder="YYYY/MM/DD"
                    required
                    maxLength={10}
                  />
                  {dateError && (
                    <p className="text-red-500 text-xs mt-1">{dateError}</p>
                  )}
                </div>
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
              <label className="ml-2 text-black">
                <input 
                  type="radio" 
                  name="bio_test" 
                  value="ผ่าน" 
                  checked={editForm?.image_url_2 ? editForm?.bio_test === 'ผ่าน' : false} 
                  onChange={handleChange}
                  disabled={!editForm?.image_url_2} // Disable if no attest image
                /> ผ่าน
              </label>
              <label className="ml-2 text-black">
                <input 
                  type="radio" 
                  name="bio_test" 
                  value="ไม่ผ่าน" 
                  checked={editForm?.image_url_2 ? editForm?.bio_test === 'ไม่ผ่าน' : false} 
                  onChange={handleChange}
                  disabled={!editForm?.image_url_2} // Disable if no attest image
                /> ไม่ผ่าน
              </label>
              {!editForm?.image_url_2 && (
                <p className="text-sm text-gray-500 mt-1">กรุณาอัปโหลดรูป Attest เพื่อเปิดใช้งานการบันทึกผล BI</p>
              )}
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
              
              <div className="flex gap-4 items-center mt-2 flex-wrap">
                <span className="text-black">SN: {attestSN || '-'}</span>
                {date && <span className="text-black">วันที่: {date}</span>}
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
                    <span className="text-black">นาที</span>
                  </span>
                </label>
                {/* หมายเหตุ */}
                <div className="w-full mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                  <textarea
                    name="notes"
                    className="w-full border rounded px-2 py-1 text-black"
                    rows={2}
                    value={editForm?.notes || ''}
                    onChange={handleChange}
                    placeholder="บันทึกหมายเหตุเพิ่มเติม"
                  />
                </div>
              </div>
            </div>
          </div>
          {/* รูป 2 ใบใหญ่ responsive */}
          <div className="flex-1 flex flex-col gap-4 items-center justify-center min-w-[220px]">
            <div
              tabIndex={0}
              className="w-full max-w-[95vw] md:max-w-[900px] flex flex-col items-center justify-center border rounded bg-gray-100 overflow-hidden relative cursor-pointer"
              style={{ maxHeight: '60vh', height: '60vh', touchAction: 'none' }}
              onClick={() => openImageSourceModal(1)}
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
                accept="image/*"
                ref={slipInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleUpload(1, e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              {image1 && (
                <button 
                  type="button" 
                  className="mt-1 px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const { isConfirmed } = await Swal.fire({
                      title: 'ยืนยันการลบ',
                      text: 'คุณแน่ใจหรือไม่ที่ต้องการลบรูปภาพ Sterile Slip นี้?',
                      icon: 'warning',
                      showCancelButton: true,
                      confirmButtonColor: '#3085d6',
                      cancelButtonColor: '#d33',
                      confirmButtonText: 'ใช่, ลบเลย',
                      cancelButtonText: 'ยกเลิก'
                    });

                    if (isConfirmed) {
                      setImage1("");
                      setEditForm((prev: any) => ({ 
                        ...prev, 
                        image_url_1: "",
                        // Clear autofilled data from sterile slip
                        sterilizer_number: "",
                        cycle_number: "",
                        total_duration: ""
                      }));
                      Swal.fire({
                        title: 'ลบรูปภาพ',
                        text: 'ลบรูปภาพ Sterile Slip เรียบร้อย',
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false
                      });
                    }
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
                accept="image/*"
                ref={attestInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleUpload(2, e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              {editForm.image_url_2 && (
                <button 
                  type="button" 
                  className="mt-1 px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const { isConfirmed } = await Swal.fire({
                      title: 'ยืนยันการลบ',
                      text: 'คุณแน่ใจหรือไม่ที่ต้องการลบรูปภาพ Attest นี้?',
                      icon: 'warning',
                      showCancelButton: true,
                      confirmButtonColor: '#3085d6',
                      cancelButtonColor: '#d33',
                      confirmButtonText: 'ใช่, ลบเลย',
                      cancelButtonText: 'ยกเลิก'
                    });

                    if (isConfirmed) {
                      setImage2("");
                      setEditForm((prev: any) => ({ 
                        ...prev, 
                        image_url_2: "",
                        // Clear autofilled data from attest
                        attest_sn: "",
                        attest_time: "",
                        bio_test: ""
                      }));
                      setAttestSN("");
                      setAttestTime("");
                      Swal.fire({
                        title: 'ลบรูปภาพ',
                        text: 'ลบรูปภาพ Attest เรียบร้อย',
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false
                      });
                    }
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
              onClick={() => openImageSourceModal(2)}
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
          <button 
            type="button" 
            className={`font-bold py-2 px-8 rounded ${
              loading || dateError || (editForm?.image_url_2 && !editForm?.bio_test)
                ? 'bg-blue-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white`} 
            onClick={handleSaveForm} 
            disabled={loading || !!dateError || (editForm?.image_url_2 && !editForm?.bio_test)}
            title={editForm?.image_url_2 && !editForm?.bio_test ? 'กรุณาเลือกผลตรวจสอบ BI' : ''}
          >
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
      {/* Image Source Selection Modal */}
      {showCameraModal && !stream && <ImageSourceModal />}
      
      {/* Camera Modal */}
      {showCameraModal && stream && <CameraModal />}
    </div>
  );
}