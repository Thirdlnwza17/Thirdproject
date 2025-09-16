
'use client';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { parseDurationToMinutes } from './durationUtils';
import { FirebaseUser as User } from '@/dbService';
import { debounce } from 'lodash';

interface Item {
  id: string;
  name: string;
}
import { collection, getDocs, doc, getDoc } from '@/dbService';
import { logAuditAction } from '@/dbService';


// Import db from firebaseConfig
import { db } from '../../firebaseConfig';

// ImageSourceType removed - native file inputs and webcam modal are used instead

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
   
  const slipInputRef = useRef<HTMLInputElement>(null);
  const attestInputRef = useRef<HTMLInputElement>(null);
  const slipGalleryRef = useRef<HTMLInputElement>(null);
  const attestGalleryRef = useRef<HTMLInputElement>(null);
 
  const [image1, setImage1] = useState(editForm.image_url_1 || "");
 
  const [currentImageIdx, setCurrentImageIdx] = useState<1 | 2 | null>(null);
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [showWebcamModal, setShowWebcamModal] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  // State for item search functionality
  const [searchResults, setSearchResults] = useState<Record<number, Item[]>>({});
  const [searchTerm, setSearchTerm] = useState<Record<number, string>>({});
  const [isSearching, setIsSearching] = useState<Record<number, boolean>>({});
  
  // OCR loading / progress
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const ocrIntervalRef = useRef<number | null>(null);

  const startOcrProgress = () => {
    if (ocrIntervalRef.current) window.clearInterval(ocrIntervalRef.current);
    setIsOcrLoading(true);
    setOcrProgress(5);
    // simulate progressive progress until final stop
    ocrIntervalRef.current = window.setInterval(() => {
      setOcrProgress(p => {
        const next = Math.min(95, p + Math.random() * 12);
        return Math.round(next);
      });
    }, 500) as unknown as number;
  };

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
  
  // Handle item name change with search
  const handleItemNameChange = (e: React.ChangeEvent<HTMLInputElement>, rowIndex: number) => {
    if (!editForm) return;
    
    const { value } = e.target;
    const newItems = [...(editForm.items || [])];
    newItems[rowIndex] = { ...newItems[rowIndex], name: value };
    setEditForm({ ...editForm, items: newItems });
    
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
    if (!editForm) return;
    
    const newItems = [...(editForm.items || [])];
    newItems[rowIndex] = { 
      ...newItems[rowIndex], 
      name: item.name,
      itemId: item.id
    };
    setEditForm({ ...editForm, items: newItems });
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

  const stopOcrProgress = (final = true) => {
    if (ocrIntervalRef.current) {
      window.clearInterval(ocrIntervalRef.current);
      ocrIntervalRef.current = null;
    }
    if (final) setOcrProgress(100);
    // keep 100% visible briefly then hide
    setTimeout(() => {
      setIsOcrLoading(false);
      setOcrProgress(0);
    }, 450);
  };
  
  // State สำหรับวันที่
  const [date, setDate] = useState(editForm.date || "");
  const [dateError, setDateError] = useState("");
  // เพิ่ม state สำหรับ zoom modal
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [users, setUsers] = useState<Array<{id: string, fullName: string, email: string}>>([]);
  const handleDoubleClick = () => {
    setZoomLevel(z => z === 1 ? 2 : 1);
  };
  // Auto-fill staff fields with saved values or user's display name/email
  // Autofill staff/reader from saved values or current user. Use functional updater to avoid
  // referencing `editForm` in the dependency array and include `setEditForm` safely.
  useEffect(() => {
    if (!user) return;
    const savedStaff = localStorage.getItem('sterile_staff');
    const savedReader = localStorage.getItem('result_reader');
    const userName = user.displayName || user.email || '';

    setEditForm((prev: any) => {
      const needStaff = !prev?.sterile_staff && (savedStaff || userName);
      const needReader = !prev?.result_reader && (savedReader || userName);
      if (!needStaff && !needReader) return prev;
      return {
        ...prev,
        sterile_staff: prev.sterile_staff || savedStaff || userName,
        result_reader: prev.result_reader || savedReader || userName,
      };
    });
  }, [user, setEditForm]);

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
    // ถ้าเลือกโปรแกรมเป็น PREVAC หรือ BOWIE ให้ติ๊ก checkbox
    if (name === 'program' && (value === 'PREVAC' || value === 'BOWIE')) {
      newForm = {
        ...newForm,
        prevac: true,
        c134c: true,
        s9: true,
        d20: true
      };
    }
    setEditForm(newForm);
  };
  const SLIP_KEYWORDS = [
    'BAUMER', 'PROGRAM', 'TEMPERATURE', 'STERILIZATION TIME', 'VACUUM PULSE', 'DRYING TIME', 'END OF CYCLE', 'OPER',
    'STERILIE TIME', 'STOP TIME'
  ];
  // ฟังก์ชันสำหรับแปลงวันที่เป็น Date object
  // parseDate removed (unused)

  // ฟังก์ชันดึงข้อมูลรอบการฆ่าเชื้อจากข้อความ OCR
  const extractSterilizerInfo = (text: string): string => {
    // 1. ตรวจสอบ LOAD CODE หรือ LOCO CODE สำหรับ PREVAC
    const loadCodeMatch = text.match(/(?:LOAD|LOCO)\s*CODE[\s:]*([A-Za-z0-9-]+)/i);
    if (loadCodeMatch && loadCodeMatch[1]) {
      // ตรวจสอบว่ามีตัวเลขใน LOAD CODE หรือไม่
      const numberMatch = loadCodeMatch[1].match(/\d+/);
      if (numberMatch) {
        return numberMatch[0]; // ส่งคืนเฉพาะตัวเลข
      }
      return loadCodeMatch[1].trim();
    }

    // 2. รูปแบบอื่นๆ ที่รองรับ:
    // - Total cycle no: 12345
    // - cycle NR: 12345
    // - Model: XXXXX-12345
    // - number of cycle: 12345
    const patterns = [
  // allow optional punctuation (.,-) and optional whitespace between label and value
  /(?:Total\s*cycle\s*no|cycle\s*nr|number\s*of\s*cycle)[\s:\.\-]*([A-Za-z0-9-]+)/i,
  /Model[\s:\.\-]*([A-Za-z0-9-]+)/i,
  /(?:cycle|no|nr|#)[\s:\.\-]*([0-9A-Za-z-]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const token = match[1].trim();
        // If token is digits followed by letters (eg. 300a or 300A), prefer the full token
        // and normalize trailing letters to uppercase (so '300a' -> '300A')
        const mAlpha = token.match(/^(\d+)([A-Za-z]+)$/);
        if (mAlpha) {
          return `${mAlpha[1]}${mAlpha[2].toUpperCase()}`;
        }
        // Otherwise, if there are digits, return just the digits
        const numberMatch = token.match(/\d+/);
        if (numberMatch) {
          return numberMatch[0]; // ส่งคืนเฉพาะตัวเลข
        }
        // Fallback: return the token as-is
        return token;
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
      // เช็คซ้ำกับทุก card ยกเว้นข้อมูลปัจจุบัน
      const isDuplicate = allLoads
        .filter(load => load.id !== editForm.id) // ไม่ตรวจสอบกับข้อมูลปัจจุบัน
        .some(load => load.image_url_1 === base64 || load.image_url_2 === base64);
      
      if (isDuplicate) {
        // Start loading before showing alert
        startOcrProgress();
        try {
          await Swal.fire({
            title: 'รูปภาพซ้ำ',
            text: 'ไม่สามารถแนบรูปซ้ำกับข้อมูลอื่นในระบบได้',
            icon: 'warning',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#3b82f6',
          });
        } finally {
          stopOcrProgress();
        }
        return;
      }
      if (idx === 1) {
        // Auto-tick ผ่าน for mechanical, chemical_external, chemical_internal
        setEditForm((prev: any) => ({
          ...prev,
          mechanical: 'ผ่าน',
          chemical_external: 'ผ่าน',
          chemical_internal: 'ผ่าน'
        }));
        // OCR + Claude AI ตรวจสอบ slip เฉพาะช่อง 1
        startOcrProgress();
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
          // Process OCR text without storing raw text
          ocrRaw = ocrRaw.replace(/^Here is the full raw text extracted from the image:\s*/i, '');
          const isSlip = SLIP_KEYWORDS.some(keyword => ocrRaw.toUpperCase().includes(keyword.toUpperCase()));
          if (!isSlip) {
            try {
              await Swal.fire({
                title: 'รูปภาพไม่ถูกต้อง',
                text: 'ไม่พบข้อมูลที่ระบุว่าเป็นสลิปจากเครื่องนึ่ง กรุณาเลือกรูปสลิปที่ถูกต้อง',
                icon: 'warning',
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#3b82f6',
              });
            } finally {
              stopOcrProgress();
            }
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

            // เงื่อนไขใหม่: ถ้ามีวันที่หรือรอบที่อยู่แล้วในฟอร์ม จะไม่ autofill ทับ
            if (extractedDate && (!editForm.date || editForm.date === '')) {
              setDate(extractedDate);
              updates.date = extractedDate;
            }

            if (sterilizerInfo && (!editForm.sterilizer || editForm.sterilizer === '')) {
              updates.sterilizer = sterilizerInfo;
            }

            if (totalDuration) {
              // แปลงรูปแบบเวลาเป็นนาที:วินาที
              const minutes = parseDurationToMinutes(totalDuration);
              // เก็บค่าเป็นนาทีสำหรับทุกโปรแกรม รวมถึง EO
              updates.total_duration = minutes;
            }
// ฟังก์ชันสุ่มเวลาตามประเภทโปรแกรม
const getRandomDurationByProgram = (program: string): string => {
  let min, max;
  const programUpper = program?.toUpperCase?.() || '';
  switch(programUpper) {
    case 'PLASMA':
      min = 45;
      max = 75;
      break;
    case 'EO':
      min = 8 * 60;
      max = 12 * 60;
      break;
    case 'BOWIE':
      min = 20;
      max = 25;
      break;
    case 'PREVAC':
      min = 45;
      max = 60;
      break;
    default:
      min = 20;
      max = 25;
  }
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  // For EO, return in minutes
  return duration.toString();
};
            // ถ้า total_duration ยังว่าง ให้สุ่มเวลา
            if ((!updates.total_duration && !editForm.total_duration) && editForm.program) {
              updates.total_duration = getRandomDurationByProgram(editForm.program);
            }
            

            // Auto-check test results when a sterile slip image is uploaded
            // Autofill extracted OCR data only (no color/test result auto-check)
            setEditForm((prev: any) => ({
              ...prev,
              ...updates
            }));

            // สร้างข้อความแจ้งเตือน
            const messageParts = [];

            if (extractedDate && (!editForm.date || editForm.date === '')) {
              messageParts.push(`วันที่: ${extractedDate}`);
            }

            if (sterilizerInfo && (!editForm.sterilizer || editForm.sterilizer === '')) {
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

            // แจ้งเตือนเมื่อพบข้อมูล
            let alertMessage = messageParts.length > 0
              ? `ตั้งค่าจาก OCR: ${messageParts.join(', ')}`
              : '';

            if (alertMessage) {
              Swal.fire({
                title: 'พบข้อมูลในสลิป',
                text: alertMessage,
                icon: 'info',
                timer: 4000,
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
          } finally {
            // stop progress regardless
            stopOcrProgress();
          }
          setImage1(base64);
          setEditForm((prev: any) => ({ ...prev, image_url_1: base64 }));
        } catch (error) {
          alert('เกิดข้อผิดพลาดในการวิเคราะห์ OCR กรุณาลองใหม่');
          stopOcrProgress();
          return;
        }
      } else {
        // Auto-tick ผ่าน for bio_test when uploading image 2
        setEditForm((prev: any) => ({
          ...prev,
          bio_test: 'ผ่าน'
        }));
        // OCR + Claude AI ตรวจสอบ attest เฉพาะช่อง 2
        try {
          startOcrProgress();
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
          // Process OCR text without storing raw text
          ocrRaw = ocrRaw.replace(/^Here is the full raw text extracted from the image:\s*/i, '');
          console.log('OCR RAW:', ocrRaw); // debug

          // ตรวจสอบว่าเป็น Auto Reader 490 หรือ 390G หรือไม่
          const isAutoReader = ocrRaw.includes('490') || ocrRaw.toUpperCase().includes('390G');
          if (!isAutoReader) {
            try {
            await Swal.fire({
              title: 'เอกสารไม่ถูกต้อง',
              text: 'ไม่อนุญาตให้อัปโหลด: ไม่ใช่เอกสารจากเครื่อง Auto Reader 490 หรือ 390G',
              icon: 'warning',
              confirmButtonText: 'ตกลง',
              confirmButtonColor: '#3b82f6',
            });
            // clear attest image on the form when invalid
            setEditForm((prev: any) => ({ ...prev, image_url_2: "" }));
          } finally {
            stopOcrProgress();
          }
          return;
          }
          
          // ตรวจสอบผล BI จาก OCR
          let biResult = '';
          const hasPlusSymbol = ocrRaw.includes('+');
          
          if (hasPlusSymbol) {
            // ถ้าพบเครื่องหมาย + ให้ตั้งค่าเป็นไม่ผ่าน
            biResult = 'ไม่ผ่าน';
          } else {
            // ถ้าไม่พบ + ให้ตั้งค่าเป็นผ่าน
            biResult = 'ผ่าน';
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
          
          // อัปเดตผล BI
          const alertMessages = [];
          
        
          updates.bio_test = biResult; // Auto-set the bio_test field based on OCR result
          
          // เพิ่มข้อความแจ้งเตือนผลการตรวจสอบ
          if (hasPlusSymbol) {
            alertMessages.push('ผลตรวจสอบชีวภาพ: ตรวจพบเครื่องหมาย + ตั้งค่าเป็น "ไม่ผ่าน"');
          } else {
            alertMessages.push('ผลตรวจสอบชีวภาพ: ไม่พบเครื่องหมาย + ตั้งค่าเป็น "ผ่าน"');
          }
          // ถ้าเจอวันที่จาก Attest OCR ให้อัปเดตฟอร์ม
          if (attestDate) {
            setDate(attestDate);
            updates.date = attestDate;
            
            // แจ้งเตือนเมื่อพบข้อมูล
            let alertMessage = `ตั้งค่าวันที่จาก Attest: ${attestDate}`;
            
            // เพิ่มข้อความผล BI ถ้ามี
            if (biResult) {
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
        } finally {
          stopOcrProgress();
        }
      }
    };
    reader.readAsDataURL(file);
  };
  // Add state for Attest OCR extraction
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
        d20: true
      }));
    } else if (editForm.program === 'EO') {
      setEditForm((prev: any) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false
      }));
    } else if (editForm.program === 'Plasma') {
      setEditForm((prev: any) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false
      }));
    } else if (editForm.program) {
      setEditForm((prev: any) => ({
        ...prev,
        prevac: false,
        c134c: false,
        s9: false,
        d20: false
      }));
    }
  }, [editForm.program, setEditForm]);

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

  // ฟังก์ชันคำนวณสถานะ
  const calculateStatus = (formData: any): string => {
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

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Create a copy of the form data
      const formData = { ...editForm };
      
      // คำนวณและกำหนดสถานะ
      formData.status = calculateStatus(formData);
      
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

      // ดึงข้อมูลเดิมก่อนอัปเดต
      const docRef = doc(db, 'sterilizer_loads', formData.id);
      const docSnap = await getDoc(docRef);
      const beforeData = docSnap.exists() ? docSnap.data() : {};
      
      // ตรวจสอบการเปลี่ยนแปลง
      const changedFields: Record<string, { oldValue: any, newValue: any }> = {};
      
      // ตรวจสอบทุกฟิลด์ที่มีการเปลี่ยนแปลง
      Object.keys(formData).forEach(key => {
        if (JSON.stringify(formData[key]) !== JSON.stringify(beforeData[key])) {
          changedFields[key] = {
            oldValue: beforeData[key],
            newValue: formData[key]
          };
        }
      });
      
      // บันทึก audit log ถ้ามีการเปลี่ยนแปลง
      if (Object.keys(changedFields).length > 0 && user) {
        try {
          // สร้าง object สำหรับเก็บเฉพาะข้อมูลที่ต้องการบันทึก
          const safeChanges: Record<string, { oldValue: any, newValue: any }> = {};
          
          // ตรวจสอบและกรองข้อมูลที่จะบันทึก
          Object.entries(changedFields).forEach(([key, value]) => {
            // ตรวจสอบว่าไม่ใช่ฟิลด์ที่อาจมีค่า undefined หรือไม่สามารถบันทึกลง Firestore ได้
            if (key !== 'id' && value !== undefined) {
              safeChanges[key] = {
                oldValue: typeof value.oldValue === 'object' ? '[...]' : value.oldValue,
                newValue: typeof value.newValue === 'object' ? '[...]' : value.newValue
              };
            }
          });

          await logAuditAction(
            'UPDATE',
            'sterilizer_loads',
            formData.id,
            user.uid,
            user.email || 'unknown',
            (user as any)?.role || 'user',
            {
              message: 'อัปเดตข้อมูลการนึ่งฆ่าเชื้อ' + (changedFields.notes ? ' (แก้ไขหมายเหตุ)' : ''),
              changed_fields: Object.keys(safeChanges),
              changes: safeChanges
            }
          );
        } catch (error) {
          console.error('Error saving audit log:', error);
          // ยังคงบันทึกข้อมูลแม้บันทึก audit log ไม่สำเร็จ
        }
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

  
  const openImageSourceModal = (idx: 1 | 2) => {
    setCurrentImageIdx(idx);
    setShowPickerModal(true);
  };

  const convertImageFileToJpeg = async (file: File, maxWidth = 1920): Promise<File> => {
    if (!file) throw new Error('No file');
    
    if (file.type === 'image/jpeg' && file.size < 2 * 1024 * 1024) {
      return file;
    }

    // Load image
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Error loading image for conversion'));
    });

    // Resize if needed
    const ratio = Math.min(1, maxWidth / img.width);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.drawImage(img, 0, 0, w, h);

    // Convert to JPEG data URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    URL.revokeObjectURL(url);

    // Convert dataURL to Blob -> File
    const blob = await (await fetch(dataUrl)).blob();
    const jpegFile = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
    return jpegFile;
  };

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersCollection = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollection);
        const usersList = usersSnapshot.docs
          .map(doc => ({
            id: doc.id,
            fullName: doc.data().fullName || doc.data().email || 'Unknown User',
            email: doc.data().email || ''
          }))
          .filter(user => user.fullName !== 'Unknown User')
          .sort((a, b) => a.fullName.localeCompare(b.fullName));
        
        setUsers(usersList);
        
        // ตั้งค่าผู้ใช้ปัจจุบันเป็นค่าเริ่มต้นถ้ายังไม่ได้ตั้งค่า
        if (user) {
          const currentUser = usersList.find(u => u.email === user.email);
          if (currentUser) {
            setEditForm((prev: any) => ({
              ...prev,
              sterile_staff: prev.sterile_staff || currentUser.fullName,
              result_reader: prev.result_reader || currentUser.fullName
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };
    
    fetchUsers();
  }, [user]);

  
  const ImagePickerModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-80">
        <h3 className="text-lg font-bold mb-4">แนบรูป</h3>
        <div className="flex flex-col space-y-3">
          <button
            onClick={async () => {
              // If desktop and webcam available, open webcam modal; else use native capture input
              const ua = navigator.userAgent || '';
              const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
              const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
              setShowPickerModal(false);
              if (!isMobile && hasGetUserMedia) {
                // open webcam modal
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: facingMode },
                    audio: false 
                  });
                  setWebcamStream(stream);
                  // show modal first, video element will be attached in useEffect
                  setShowWebcamModal(true);
                } catch (err) {
                  // fallback to native input if webcam not allowed
                  if (currentImageIdx === 1) slipInputRef.current?.click();
                  else if (currentImageIdx === 2) attestInputRef.current?.click();
                }
              } else {
                if (currentImageIdx === 1) slipInputRef.current?.click();
                else if (currentImageIdx === 2) attestInputRef.current?.click();
              }
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            ถ่ายรูป
          </button>
          <button
            onClick={() => {
              // trigger gallery input for current index
              if (currentImageIdx === 1) slipGalleryRef.current?.click();
              else if (currentImageIdx === 2) attestGalleryRef.current?.click();
              setShowPickerModal(false);
            }}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
          >
            แนบรูปจากแกลเลอรี่
          </button>
          <button
            onClick={() => setShowPickerModal(false)}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );

  const captureFromWebcam = async () => {
    if (!videoRef.current || !canvasRef.current || !currentImageIdx) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `webcam_${Date.now()}.jpg`, { type: 'image/jpeg' });

    if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
      setWebcamStream(null);
    }
    setShowWebcamModal(false);


    await handleUpload(currentImageIdx, file);
  };

  const closeWebcamModal = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(t => t.stop());
      setWebcamStream(null);
    }
    setShowWebcamModal(false);
  };

 
  const switchCamera = async () => {
    if (!videoRef.current) return;
    
    // Stop any existing tracks
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
    }
    
    try {
      const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
      setFacingMode(newFacingMode);
      
      // Base constraints
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: newFacingMode,
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, min: 24 }
        },
        audio: false
      };
      
      // For iOS devices, use specific settings
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        (constraints.video as any).facingMode = { exact: newFacingMode };
        (constraints.video as any).deviceId = undefined; // Let the system choose the best camera
      }
      
      // Get the new stream with basic constraints
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Apply all camera settings using our centralized function
      await applyCameraSettings(stream);
      
      // Update the stream in state
      setWebcamStream(stream);
    } catch (err) {
      console.error('Error switching camera:', err);
      alert('ไม่สามารถสลับกล้องได้ กรุณาตรวจสอบการอนุญาตการใช้งานกล้อง');
    }
  };

  
  const applyCameraSettings = async (stream: MediaStream | null) => {
    if (!stream || !videoRef.current) return;
    
    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return;
      
      // Apply initial constraints
      const constraints: MediaTrackConstraints = {
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
        frameRate: { ideal: 30, min: 24 },
      };
      
      // Add focus settings if supported
      const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
      if ('focusMode' in supportedConstraints) {
        (constraints as any).focusMode = 'continuous';
      }
      
      // Apply constraints
      await videoTrack.applyConstraints(constraints);
      
      // For iOS devices, apply additional settings
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS && 'applyConstraints' in videoTrack) {
        try {
          await videoTrack.applyConstraints({
            advanced: [{ focusMode: 'continuous' }] as any
          });
        } catch (err) {
          console.warn('Could not apply advanced constraints:', err);
        }
      }
      
      // Set video source and play
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      await videoRef.current.play().catch(console.warn);
      
      // Try to adjust focus after a short delay
      setTimeout(async () => {
        try {
          if ('applyConstraints' in videoTrack) {
            await videoTrack.applyConstraints({
              advanced: [{ focusDistance: 0 }] as any
            });
          }
        } catch (err) {
          console.warn('Could not adjust focus:', err);
        }
      }, 1000);
      
    } catch (err) {
      console.error('Error applying camera settings:', err);
    }
  };

  useEffect(() => {
    if (showWebcamModal && webcamStream) {
      applyCameraSettings(webcamStream);
    }
    
    return () => {
      // don't stop stream here; closeWebcamModal handles it
    };
  }, [showWebcamModal, webcamStream]);

  const WebcamModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
      <div className="w-full max-w-lg">
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video ref={videoRef} autoPlay playsInline className="w-full h-auto" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-black bg-opacity-50 flex flex-col items-center space-y-4">
            <div className="flex justify-center space-x-4 w-full">
              <button 
                onClick={captureFromWebcam} 
                className="w-16 h-16 rounded-full bg-white bg-opacity-20 border-4 border-white flex-shrink-0"
              >
                <div className="w-8 h-8 bg-red-500 rounded-full mx-auto"></div>
              </button>
            </div>
            <div className="flex justify-between w-full px-4">
              <button 
                onClick={closeWebcamModal} 
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                ยกเลิก
              </button>
              <button 
                onClick={switchCamera}
                className="p-2 bg-white bg-opacity-20 rounded-full hover:bg-opacity-30 transition-colors"
                title="สลับกล้อง"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 overflow-y-auto py-8 touch-auto"
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-full md:max-w-4xl p-2 sm:p-4 md:p-8 relative flex flex-col items-center my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full mb-4 relative">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-blue-900 inline-block">แก้ไขข้อมูลรอบการทำงาน</h2>
          </div>
          <button 
            className="absolute top-0 right-0 text-3xl text-gray-400 hover:text-red-500 -mt-1 -mr-1" 
            onClick={() => setEditForm(null)}
          >
            &times;
          </button>
        </div>
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
              {/* Show selected potNumber below program */}
              <div className="ml-2 mt-2 flex items-center">
                <label className="text-black font-medium mr-2" htmlFor="potNumber-select">หม้อที่</label>
                <select
                  id="potNumber-select"
                  name="potNumber"
                  className="border rounded px-2 py-1 bg-white text-black"
                  value={editForm.potNumber || ''}
                  onChange={handleChange}
                  style={{ minWidth: 60 }}
                >
                  <option value="">เลือก</option>
                  {[...Array(10)].map((_, i) => (
                    <option key={i+1} value={i+1}>{i+1}</option>
                  ))}
                </select>
              </div>
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
              <label className="ml-2 text-black">
                <input 
                  type="radio" 
                  name="mechanical" 
                  value="ผ่าน" 
                  checked={editForm?.image_url_1 ? editForm?.mechanical === 'ผ่าน' : false} 
                  onChange={handleChange} 
                  disabled={!editForm?.image_url_1}
                /> ผ่าน
              </label>
              <label className="ml-2 text-black">
                <input 
                  type="radio" 
                  name="mechanical" 
                  value="ไม่ผ่าน" 
                  checked={editForm?.image_url_1 ? editForm?.mechanical === 'ไม่ผ่าน' : false} 
                  onChange={handleChange}
                  disabled={!editForm?.image_url_1}
                /> ไม่ผ่าน
              </label>
            </div>
            <div className="ml-2 text-black">เทปเคมีภายนอก:
              <label className="ml-2 text-black">
                <input 
                  type="radio" 
                  name="chemical_external" 
                  value="ผ่าน" 
                  checked={editForm?.image_url_1 ? editForm?.chemical_external === 'ผ่าน' : false} 
                  onChange={handleChange} 
                  disabled={!editForm?.image_url_1}
                /> ผ่าน
              </label>
              <label className="ml-2 text-black">
                <input 
                  type="radio" 
                  name="chemical_external" 
                  value="ไม่ผ่าน" 
                  checked={editForm?.image_url_1 ? editForm?.chemical_external === 'ไม่ผ่าน' : false} 
                  onChange={handleChange}
                  disabled={!editForm?.image_url_1}
                /> ไม่ผ่าน
              </label>
            </div>
            <div className="ml-2 text-black">เทปเคมีภายใน:
              <label className="ml-2 text-black">
                <input 
                  type="radio" 
                  name="chemical_internal" 
                  value="ผ่าน" 
                  checked={editForm?.image_url_1 ? editForm?.chemical_internal === 'ผ่าน' : false} 
                  onChange={handleChange} 
                  disabled={!editForm?.image_url_1}
                /> ผ่าน
              </label>
              <label className="ml-2 text-black">
                <input 
                  type="radio" 
                  name="chemical_internal" 
                  value="ไม่ผ่าน" 
                  checked={editForm?.image_url_1 ? editForm?.chemical_internal === 'ไม่ผ่าน' : false} 
                  onChange={handleChange}
                  disabled={!editForm?.image_url_1}
                /> ไม่ผ่าน
              </label>
            </div>

            <div className="font-bold mt-2 text-black">ตัวเชื้อทดสอบชีวภาพ </div>
            <div className="ml-2 text-black">ชีวภาพ:
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
            </div>
            <div className="font-bold mt-2 text-black">
              <div>เจ้าหน้าที่ Sterile</div>
              <select 
                name="sterile_staff" 
                className="border rounded px-2 py-1 w-full text-black mt-1"
                value={editForm?.sterile_staff || ''} 
                onChange={handleChange}
              >
                {users.map((user) => (
                  <option key={user.id} value={user.fullName}>
                    {user.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="font-bold text-black mt-2">
              <div>ผู้อ่านผล</div>
              <select 
                name="result_reader" 
                className="border rounded px-2 py-1 w-full text-black mt-1"
                value={editForm?.result_reader || ''} 
                onChange={handleChange}
              >
                {users.map((user) => (
                  <option key={user.id} value={user.fullName}>
                    {user.fullName}
                  </option>
                ))}
              </select>
            </div>

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
                        <div className="relative">
                          <input
                            ref={el => {
                              if (el) {
                                inputRefs.current[i] = el;
                              }
                            }}
                            name={`item_name_${i}`}
                            type="text"
                            className="w-full border rounded px-1 py-0.5 text-black"
                            value={item.name}
                            onChange={(e) => handleItemNameChange(e, i)}
                            onFocus={() => handleInputFocus(i)}
                            onKeyDown={e => {
                              // On Enter or Tab, move to quantity field first
                              if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault();
                                const currentQuantityInput = document.querySelector<HTMLInputElement>(`input[name="item_qty_${i}"]`);
                                if (currentQuantityInput) {
                                  currentQuantityInput.focus();
                                }
                              }
                            }}
                            autoFocus={i === 0 && (editForm.items?.length || 0) === 1}
                          />
                          {isSearching[i] && (
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                            </div>
                          )}
                          {searchResults[i]?.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                              {searchResults[i].map((result: Item, idx: number) => (
                                <div
                                  key={idx}
                                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
                                  onClick={() => handleSelectItem(result, i)}
                                >
                                  <div className="font-medium">{result.name}</div>
                                  <div className="text-xs text-gray-500">ID: {result.id}</div>
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
                          min="0"
                          className="w-full border rounded px-1 py-0.5 text-black"
                          value={item.quantity}
                          onChange={e => {
                            const newItems = [...(editForm.items || [])];
                            newItems[i] = { ...newItems[i], quantity: e.target.value };
                            setEditForm({ ...editForm, items: newItems });
                          }}
                          onKeyDown={e => {
                            // On Enter or Tab, move to next row's device name
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault();
                              const currentItems = editForm.items || [];
                              
                              if (i < currentItems.length - 1) {
                                // Move to next row's device name
                                const nextInput = inputRefs.current[i + 1];
                                if (nextInput) {
                                  nextInput.focus();
                                }
                              } else {
                                // If this is the last row, add a new row
                                const newItems = [...currentItems, { name: '', quantity: '' }];
                                setEditForm({ ...editForm, items: newItems });
                                
                                // Focus the new input after it's rendered
                                setTimeout(() => {
                                  const newInput = inputRefs.current[newItems.length - 1];
                                  if (newInput) {
                                    newInput.focus();
                                  }
                                }, 0);
                              }
                            }
                          }}
                        />
                      </td>
                      <td className="border p-1 text-center">
                        <button 
                          type="button" 
                          className="text-red-500 hover:text-red-700 font-bold px-2" 
                          onClick={() => {
                            const newItems = [...(editForm.items || [])];
                            newItems.splice(i, 1);
                            setEditForm({ ...editForm, items: newItems });
                          }}
                          title="ลบ"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="mt-2 px-4 py-1 bg-green-500 hover:bg-green-600 text-white rounded" onClick={() => {
                const newItems = [...(editForm.items || [])];
                const newItem = { name: '', quantity: '' };
                newItems.push(newItem);
                setEditForm({ ...editForm, items: newItems });
                
                // Focus the new input after it's rendered
                setTimeout(() => {
                  const lastIndex = newItems.length - 1;
                  const input = inputRefs.current[lastIndex];
                  if (input) {
                    input.focus();
                  }
                }, 0);
              }}>
                + เพิ่มแถว
              </button>
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
                      placeholder=""
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
              className="w-full max-w-[500px] h-[400px] flex flex-col items-center justify-center border rounded bg-gray-100 overflow-y-auto relative cursor-pointer touch-pan-y"
              onClick={(e) => {
                
                if (!e.currentTarget.classList.contains('scrolling')) {
                  openImageSourceModal(1);
                }
              }}
              onTouchStart={() => {
               
                const container = document.querySelector('[onclick*="openImageSourceModal(1)"]');
                container?.classList.add('scrolling');
                setTimeout(() => container?.classList.remove('scrolling'), 200);
              }}
            >
              {image1 ? (
                <img
                  src={image1}
                  alt="Sterile Slip"
                  className="select-none cursor-zoom-in object-cover"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectPosition: 'top center',
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
              {/* Hidden inputs: camera capture and gallery picker for Sterile Slip */}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={slipInputRef}
                onChange={async (e) => {
                  if (e.target.files && e.target.files[0]) {
                    try {
                      const original = e.target.files[0];
                      const file = await convertImageFileToJpeg(original);
                      await handleUpload(1, file);
                    } catch (err) {
                      console.error('Conversion error:', err);
                     
                      if (e.target.files && e.target.files[0]) await handleUpload(1, e.target.files[0]);
                    }
                  }
                }}
                style={{ position: 'absolute', left: '-9999px' }}
              />
              <input
                type="file"
                accept="image/png, image/jpeg"
                ref={slipGalleryRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleUpload(1, e.target.files[0]);
                  }
                }}
                style={{ position: 'absolute', left: '-9999px' }}
              />
              {/* inline attach/take buttons removed per request - click image area to open picker */}
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
              {/* Inspection button removed */}
            </div>
            <div className="text-center text-base font-bold text-black mt-1">Attest</div>
            <div className="flex gap-2 items-center">
              {/* Hidden inputs: camera capture and gallery picker for Attest */}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={attestInputRef}
                style={{ position: 'absolute', left: '-9999px' }}
                onClick={(e) => {
                  // Reset value to allow selecting the same file again
                  const target = e.target as HTMLInputElement;
                  target.value = '';
                }}
                onChange={async (e) => {
                  if (e.target.files && e.target.files[0]) {
                    try {
                      const original = e.target.files[0];
                      // Process the image with enhanced quality settings
                      const processedFile = await convertImageFileToJpeg(original, 1920);
                      await handleUpload(2, processedFile);
                    } catch (err) {
                      console.error('Error processing image:', err);
                      // Fallback to original file if processing fails
                      if (e.target.files && e.target.files[0]) {
                        await handleUpload(2, e.target.files[0]);
                      }
                    }
                  }
                }}
              />
              <input
                type="file"
                accept="image/png, image/jpeg"
                ref={attestGalleryRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleUpload(2, e.target.files[0]);
                  }
                }}
                style={{ position: 'absolute', left: '-9999px' }}
              />
              {/* inline attach/take buttons removed per request - click image area to open picker */}
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
                      try {
                        // บันทึก audit log ก่อนลบรูปภาพ
                        if (user) {
                          await logAuditAction(
                            'UPDATE',
                            'sterilizer_loads',
                            editForm.id,
                            user.uid,
                            user.email || 'unknown',
                            (user as any)?.role || 'user',
                            {
                              message: 'ลบรูปภาพ Attest',
                              changed_fields: ['image_url_2', 'attest_sn', 'attest_time', 'bio_test'],
                              changes: {
                                image_url_2: { oldValue: editForm.image_url_2, newValue: '' },
                                attest_sn: { oldValue: editForm.attest_sn, newValue: '' },
                                attest_time: { oldValue: editForm.attest_time, newValue: '' },
                                bio_test: { oldValue: editForm.bio_test, newValue: '' }
                              }
                            }
                          );
                        }
                      } catch (error) {
                        console.error('Error saving audit log:', error);
                      }
                      
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
              {/* Inspection button removed */}
            </div>
            <div
              tabIndex={0}
              className="w-full max-w-[500px] h-[400px] flex flex-col items-center justify-center border rounded bg-gray-100 overflow-y-auto relative cursor-pointer touch-pan-y"
              onClick={(e) => {
                // Only open image source modal if the scroll container is not being scrolled
                if (!e.currentTarget.classList.contains('scrolling')) {
                  openImageSourceModal(2);
                }
              }}
              onTouchStart={() => {
                // Add a small delay to prevent immediate click when scrolling
                const container = document.querySelector('[onclick*="openImageSourceModal(2)"]');
                container?.classList.add('scrolling');
                setTimeout(() => container?.classList.remove('scrolling'), 200);
              }}
            >
              {editForm.image_url_2 ? (
                <img
                  src={editForm.image_url_2}
                  alt="Attest"
                  className="select-none cursor-zoom-in object-cover"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectPosition: 'top center',
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
            {/* Number selector under Attest: selects numbers 1-10 and updates editForm.which */}
            <div className="mt-2 w-full">
              <div className="text-xs text-gray-500 text-center mb-1">เลือกหมายเลข</div>
              <div className="w-full overflow-x-auto">
                <div className="flex whitespace-nowrap justify-center gap-2 px-2">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => {
                  const whichArr: number[] = Array.isArray(editForm?.which) ? [...editForm.which] : [];
                  const active = whichArr.includes(num);
                  return (
                    <div
                      key={num}
                      role="button"
                      tabIndex={0}
                      aria-pressed={active}
                      className={`inline-flex items-center justify-center w-9 h-9 text-sm border rounded-md cursor-pointer select-none transition-colors ${
                        active ? 'bg-blue-100 border-blue-500' : 'bg-white hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        setEditForm((prev: any) => {
                          const prevWhich = Array.isArray(prev?.which) ? [...prev.which] : [];
                          const exists = prevWhich.includes(num);
                          const newWhich = exists ? prevWhich.filter(n => n !== num) : [...prevWhich, num];
                          return { ...prev, which: newWhich };
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          (e.currentTarget as HTMLDivElement).click();
                        }
                      }}
                      style={{ marginRight: 6 }}
                    >
                      <span className="pointer-events-none">{num}</span>
                    </div>
                  );
                })}
                </div>
              </div>
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
      {isOcrLoading && (
        <div className="fixed inset-0 z-60 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto bg-black/60 rounded-lg p-4 w-72 text-center">
            <div className="text-white font-bold mb-2">กำลังประมวลผลรูปภาพ (OCR)</div>
            <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden mb-2">
              <div className="bg-white h-full" style={{ width: `${ocrProgress}%` }} />
            </div>
            <div className="text-white text-sm">{ocrProgress}%</div>
          </div>
        </div>
      )}
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
  {showPickerModal && <ImagePickerModal />}
  {showWebcamModal && <WebcamModal />}
      {/* Image Source Selection Modal */}
  {/* Native file inputs handle capture; old camera modals removed */}
  {/* OCR inspection modal removed per user request */}
    </div>
  );
}