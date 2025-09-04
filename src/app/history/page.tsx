'use client';

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from 'next/image';
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import { logAuditAction } from "@/dbService";
import { getFirestore, collection, query, orderBy, onSnapshot, Timestamp, doc, updateDoc, deleteDoc, getDoc, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import Swal from 'sweetalert2';

import SterilizerLoadsCardView from './SterilizerLoadsCardView';
import OcrModal from './OcrModal';
import ImageModal from './ImageModal';
import HistoryFormModal from './HistoryFormModal';
import EditLoadModal from './EditLoadModal';
import DuplicateModal from './DuplicateModal';

type TestResult = 'ผ่าน' | 'ไม่ผ่าน';

interface CheckboxResults {
  mechanical?: TestResult;
  chemical_external?: TestResult;
  chemical_internal?: TestResult;
  bio_test?: TestResult;
}


interface DuplicateEntry {
  image_url: string;
  extracted_text: string;
}


// User dropdown component
const UserDropdown = ({ user, role, onLogout }: { user: User | null, role: string, onLogout: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-full px-4 py-2 font-semibold shadow transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-purple-300">
          <Image 
            src="/Instigator.jpg" 
            alt="User" 
            width={32} 
            height={32}
            className="w-full h-full object-cover"
          />
        </div>
        <span className="truncate max-w-[120px]">{user?.displayName || user?.email?.split('@')[0]}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg py-2 z-50">
          <div className="px-4 py-2 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.displayName || user?.email}</p>
            <p className="text-xs text-gray-500">Role: {role === 'admin' ? 'Admin' : 'Operator'}</p>
          </div>
          {role === 'admin' && (
            <Link 
              href="/audit-log" 
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => setIsOpen(false)}
            >
              Audit Log
            </Link>
          )}
          <button
            onClick={() => {
              onLogout();
              setIsOpen(false);
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors duration-300 transform hover:-translate-y-0.5"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};


import { FormData } from './HistoryFormModal';
import BubbleBackground from "@/components/BubbleBackground";

// Initialize form with default values that match the FormData type
const initialForm: FormData = {
  status: "PASS",
  program: "",
  sterilizer: "",
  prevac: false,
  c134c: false,
  s9: false,
  d20: false,
  mechanical: "",
  chemical_external: "",
  chemical_internal: "",
  bio_test: "",
  sterile_staff: "",
  result_reader: "",
  items: Array(45).fill(null).map(() => ({ name: '', quantity: '' }))
};

const SLIP_KEYWORDS = [
  'BAUMER', 'PROGRAM', 'TEMPERATURE', 'STERILIZATION TIME', 'VACUUM PULSE', 'DRYING TIME', 'END OF CYCLE', 'OPER'
];

import { SterilizerEntry } from "@/dbService";

export default function HistoryPage() {
  // ...
  const [clearAllFiltersTrigger, setClearAllFiltersTrigger] = useState(0);
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  
  const handleDateRangeChange = (range: { startDate: string; endDate: string }) => {
    setDateRange(range);
  };
  
  const handleClearAllFilters = () => {
    setClearAllFiltersTrigger(t => t + 1);
    setDateRange({ startDate: '', endDate: '' });
  };
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<SterilizerEntry[]>([]); // main entry state
  const [edit, setEdit] = useState<SterilizerEntry | null>(null);
  const [editForm, setEditForm] = useState<Partial<SterilizerEntry>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [role, setRole] = useState<string>("");
  const router = useRouter();
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0, distance: 0 });
  const [lastTap, setLastTap] = useState(0);
  const [editOcr, setEditOcr] = useState<Partial<SterilizerEntry> | null>(null);
  const [editOcrForm, setEditOcrForm] = useState<Partial<SterilizerEntry>>({});
  const [editOcrLoading, setEditOcrLoading] = useState(false);
  const [editOcrError, setEditOcrError] = useState("");
  // State for form and UI
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>("");
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateEntries, setDuplicateEntries] = useState<SterilizerEntry[]>([]);
  const [duplicateType, setDuplicateType] = useState<'image' | 'text' | 'both'>('image');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // OCR state

  // เพิ่ม state สำหรับเก็บผลลัพธ์ล่าสุดจาก OCR API
  const [lastOcrApiResult, setLastOcrApiResult] = useState<Record<string, unknown> | null>(null);

  // Image zoom/pan state for edit modal
  const [zoom2, setZoom2] = useState(1);
  const [offset2, setOffset2] = useState({ x: 0, y: 0 });
  const [dragging2, setDragging2] = useState(false);
  const dragStart2 = useRef({ x: 0, y: 0 });
  const offsetStart2 = useRef({ x: 0, y: 0 });

  // --- เพิ่ม state สำหรับ overlay รูปใหญ่ ---
  const [showBigImage1, setShowBigImage1] = useState(false);
  const [showBigImage2, setShowBigImage2] = useState(false);

  // --- เพิ่ม state zoom/offset/dragging สำหรับ overlay modal รูปใหญ่ ---
  const [zoomBig1, setZoomBig1] = useState(1);
  const [offsetBig1, setOffsetBig1] = useState({ x: 0, y: 0 });
  const [draggingBig1, setDraggingBig1] = useState(false);
  const dragStartBig1 = useRef({ x: 0, y: 0 });
  const offsetStartBig1 = useRef({ x: 0, y: 0 });
  const [zoomBig2, setZoomBig2] = useState(1);
  const [offsetBig2, setOffsetBig2] = useState({ x: 0, y: 0 });
  const [draggingBig2, setDraggingBig2] = useState(false);
  const dragStartBig2 = useRef({ x: 0, y: 0 });
  const offsetStartBig2 = useRef({ x: 0, y: 0 });

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.2, 5));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.2, 1));
  const handleResetZoom = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

  const handleMouseDown = (e: React.MouseEvent) => {
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
  const handleWheel = (e: React.WheelEvent) => {
    // Remove preventDefault to fix passive event listener error
    if (e.deltaY < 0) handleZoomIn();
    else handleZoomOut();
  };
  const handleImageClick = () => handleZoomIn();
  const handleImageDoubleClick = () => handleResetZoom();

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Single touch - start panning
      setDragging(true);
      const touch = e.touches[0];
      dragStart.current = { x: touch.clientX, y: touch.clientY };
      offsetStart.current = { ...offset };
    } else if (e.touches.length === 2) {
      // Two touches - start pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      setTouchStart({ x: 0, y: 0, distance });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Remove preventDefault to fix passive event listener error
    if (e.touches.length === 1 && dragging) {
      // Single touch - panning
      const touch = e.touches[0];
      setOffset({
        x: offsetStart.current.x + (touch.clientX - dragStart.current.x),
        y: offsetStart.current.y + (touch.clientY - dragStart.current.y),
      });
    } else if (e.touches.length === 2) {
      // Two touches - pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      if (touchStart.distance > 0) {
        const scale = distance / touchStart.distance;
        setZoom(z => Math.max(1, Math.min(5, z * scale)));
      }
      setTouchStart(prev => ({ ...prev, distance }));
    }
  };

  const handleTouchEnd = () => {
    setDragging(false);
    setTouchStart({ x: 0, y: 0, distance: 0 });
  };

  const handleImageTouch = (e: React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTap < DOUBLE_TAP_DELAY) {
      // Double tap detected
      handleResetZoom();
      setLastTap(0);
    } else {
      setLastTap(now);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.type === 'application/pdf') {
      await Swal.fire({
        title: 'ไม่รองรับไฟล์ PDF',
        text: 'ระบบไม่รองรับการอัปโหลดไฟล์ PDF กรุณาอัปโหลดไฟล์รูปภาพแทน',
        icon: 'error',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#3b82f6',
      });
      return;
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageUrl = event.target?.result as string;
        // OCR ก่อน แล้วตรวจสอบ keyword
        try {
          const base64Data = imageUrl.split(',')[1];
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
          // ตรวจสอบ keyword
          const isSlip = SLIP_KEYWORDS.some(keyword => ocrRaw.toUpperCase().includes(keyword));
          if (!isSlip) {
            await Swal.fire({
              title: 'รูปภาพไม่ถูกต้อง',
              text: 'ไม่พบข้อมูลที่ระบุว่าเป็นสลิปจากเครื่องนึ่ง กรุณาเลือกรูปสลิปที่ถูกต้อง',
              icon: 'warning',
              confirmButtonText: 'ตกลง',
              confirmButtonColor: '#3b82f6',
            });
            return;
          }
          // ถ้าใช่ slip จริง ค่อยเปิด modal OCR ต่อ
          setPreviewImage(imageUrl);
          setShowOcrModal(true);
          setOcrLoading(false);
          setOcrText(ocrRaw);
          setLastOcrApiResult(data);
        } catch (error) {
          console.error('OCR Error:', error);
          setOcrText('เกิดข้อผิดพลาดในการอ่านข้อความจากรูปภาพ');
          setOcrLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } else {
      await Swal.fire({
        title: 'รูปแบบไฟล์ไม่รองรับ',
        text: 'ระบบรองรับเฉพาะไฟล์รูปภาพเท่านั้น',
        icon: 'error',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#3b82f6',
      });
    }
  };

  const handleCloseOcrModal = () => {
    setShowOcrModal(false);
    setPreviewImage(null);
    setOcrText("");
    setOcrLoading(false);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (!firebaseUser) {
        router.replace("/login");
      } else {
        // ดึง role จาก Firestore
        const db = getFirestore();
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        const userRole = userSnap.exists() && userSnap.data().role ? userSnap.data().role : "operator";
        setRole(userRole);
        // Redirect operator to /history if not already there
        if (userRole !== "admin" && router && typeof window !== 'undefined' && window.location.pathname !== "/history") {
          router.replace("/history");
        }
      }
    });
    const db = getFirestore();
    
    // Subscribe to manual entries
    const q = query(collection(db, "sterilizer_entries"), orderBy("test_date", "desc"));
    const unsubEntries = onSnapshot(q, (snapshot) => {
      setEntries(snapshot.docs.map(doc => {
  const data = doc.data() as Partial<SterilizerEntry>;
  return {
    id: doc.id,
    test_date: data.test_date || '',
    serial_number: data.serial_number || '',
    program: data.program || '',
    items: data.items || '',
    chemical_result: data.chemical_result || '',
    biological_result: data.biological_result || '',
    sterilization_time: data.sterilization_time || '',
    temperature: data.temperature || '',
    operator: data.operator || '',
    ...data
  };
}));
    });
    
    return () => {
      unsubscribe();
      unsubEntries();
    };
  }, [router]);

 

  

  // handle edit form change
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  // save edit
  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditLoading(true);
    setEditError("");
    try {
      if (!editForm.id) {
        throw new Error("ไม่พบรหัสข้อมูลที่จะแก้ไข");
      }
      
      const db = getFirestore();
      const docRef = doc(db, "sterilizer_entries", editForm.id);
      
      // ดึงข้อมูลก่อนแก้ไข
      const beforeSnap = await getDoc(docRef);
      const beforeData = beforeSnap.exists() ? beforeSnap.data() : {};
      
      // ข้อมูลที่อัปเดต
      const updatedData = {
        test_date: editForm.test_date ? Timestamp.fromDate(new Date(String(editForm.test_date))) : Timestamp.now(),
        serial_number: editForm.serial_number || "",
        program: editForm.program || "",
        items: editForm.items || "",
        chemical_result: editForm.chemical_result || "",
        biological_result: editForm.biological_result || "",
        sterilization_time: editForm.sterilization_time || "",
        temperature: editForm.temperature || "",
        operator: editForm.operator || "",
      };
      
      // อัปเดตข้อมูลจริง
      await updateDoc(docRef, updatedData);
      
      // Log to audit log
      if (user) {
        await logAuditAction(
          'UPDATE',
          'sterilizer_entries',
          editForm.id,
          user.uid,
          user.email || 'unknown',
          role,
          {
            message: 'แก้ไขข้อมูลการนึ่งฆ่าเชื้อ',
            changed_fields: Object.keys(updatedData).filter(key => 
              JSON.stringify(updatedData[key as keyof typeof updatedData]) !== JSON.stringify(beforeData[key])
            ),
            old_values: Object.fromEntries(
              Object.entries(updatedData)
                .filter(([key]) => 
                  JSON.stringify(updatedData[key as keyof typeof updatedData]) !== JSON.stringify(beforeData[key])
                )
                .map(([key]) => [key, beforeData[key]])
            ),
            new_values: Object.fromEntries(
              Object.entries(updatedData)
                .filter(([key]) => 
                  JSON.stringify(updatedData[key as keyof typeof updatedData]) !== JSON.stringify(beforeData[key])
                )
            )
          }
        );
      }
      
      // บันทึก log การแก้ไข (action log)
      await addDoc(collection(db, "sterilizer_action_logs"), {
        action: "edit",
        entry_id: editForm.id,
        by: user?.email,
        role,
        at: Timestamp.now(),
        before: beforeData,
        after: updatedData,
      });
      setEdit(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setEditError(err.message || "เกิดข้อผิดพลาด");
      } else {
        setEditError("เกิดข้อผิดพลาด");
      }
    } finally {
      setEditLoading(false);
    }
    
  };

  // delete entry
  const handleDelete = async () => {
    if (!editForm.id) return;
    setEditLoading(true);
    setEditError("");
    if (role !== "admin") {
      setEditError("คุณไม่มีสิทธิ์ลบข้อมูล");
      setEditLoading(false);
      return;
    }
    try {
      const db = getFirestore();
      // ดึงข้อมูลก่อนลบ
      const beforeSnap = await getDoc(doc(db, "sterilizer_entries", editForm.id));
      const beforeData = beforeSnap.exists() ? beforeSnap.data() : {};
      
      // Log to audit log before deleting
      if (user) {
        await logAuditAction(
          'DELETE',
          'sterilizer_entries',
          editForm.id,
          user.uid,
          user.email || 'unknown',
          role,
          {
            message: 'ลบข้อมูลการนึ่งฆ่าเชื้อ',
            deleted_data: beforeData
          }
        );
      }
      
      // ลบข้อมูลจริง
      await deleteDoc(doc(db, "sterilizer_entries", editForm.id));
      
      // log การลบ
      await addDoc(collection(db, "sterilizer_action_logs"), {
        action: "delete",
        entry_id: editForm.id,
        by: user?.email,
        role,
        at: Timestamp.now(),
        before: beforeData,
      });
      setEdit(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setEditError(err.message || "เกิดข้อผิดพลาด");
      } else {
        setEditError("เกิดข้อผิดพลาด");
      }
    } finally {
      setEditLoading(false);
    }
    
  };

  const handleLogout = async () => {
    await auth.signOut();
    router.replace("/login");
  };

 
  // handle edit OCR form change
  const handleEditOcrChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setEditOcrForm({ ...editOcrForm, [e.target.name]: e.target.value });
  };
  // save edit OCR
  const handleEditOcrSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditOcrLoading(true);
    setEditOcrError("");
    try {
      if (!editOcrForm.id) {
        throw new Error("ไม่พบรหัสข้อมูล OCR ที่จะแก้ไข");
      }
      
      const db = getFirestore();
      const docRef = doc(db, "sterilizer_ocr_entries", editOcrForm.id);
      
      // ดึงข้อมูลก่อนแก้ไข
      const beforeSnap = await getDoc(docRef);
      const beforeData = beforeSnap.exists() ? beforeSnap.data() : {};
      
      // ข้อมูลที่อัปเดต
      const updatedData = {
        serial_number: editOcrForm.serial_number || "",
        program: editOcrForm.program || "",
        chemical_result: editOcrForm.chemical_result || "",
        biological_result: editOcrForm.biological_result || "",
        sterilization_time: editOcrForm.sterilization_time || "",
        temperature: editOcrForm.temperature || "",
        operator: editOcrForm.operator || "",
        extracted_text: editOcrForm.extracted_text || "",
      };
      
      // อัปเดตข้อมูลจริง
      await updateDoc(docRef, updatedData);
      
      // Log to audit log
      if (user) {
        await logAuditAction(
          'UPDATE',
          'sterilizer_ocr_entries',
          editOcrForm.id,
          user.uid,
          user.email || 'unknown',
          role,
          {
            message: 'แก้ไขข้อมูลการนึ่งฆ่าเชื้อ (OCR)',
            changed_fields: Object.keys(updatedData).filter(key => 
              JSON.stringify(updatedData[key as keyof typeof updatedData]) !== JSON.stringify(beforeData[key])
            ),
            old_values: Object.fromEntries(
              Object.entries(updatedData)
                .filter(([key]) => 
                  JSON.stringify(updatedData[key as keyof typeof updatedData]) !== JSON.stringify(beforeData[key])
                )
                .map(([key]) => [key, beforeData[key]])
            ),
            new_values: Object.fromEntries(
              Object.entries(updatedData)
                .filter(([key]) => 
                  JSON.stringify(updatedData[key as keyof typeof updatedData]) !== JSON.stringify(beforeData[key])
                )
            )
          }
        );
      }
      
      setEditOcr(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setEditOcrError(err.message || "เกิดข้อผิดพลาด");
      } else {
        setEditOcrError("เกิดข้อผิดพลาด");
      }
    } finally {
      setEditOcrLoading(false);
    }
    
  };
  // delete OCR entry
  const handleDeleteOcr = async () => {
    if (!editOcrForm.id) return;
    setEditOcrLoading(true);
    setEditOcrError("");
    if (role !== "admin") {
      setEditOcrError("คุณไม่มีสิทธิ์ลบข้อมูล");
      setEditOcrLoading(false);
      return;
    }
    try {
      const db = getFirestore();
      
      // ดึงข้อมูลก่อนลบ
      const beforeSnap = await getDoc(doc(db, "sterilizer_ocr_entries", editOcrForm.id));
      const beforeData = beforeSnap.exists() ? beforeSnap.data() : {};
      
      // Log to audit log before deleting
      if (user) {
        await logAuditAction(
          'DELETE',
          'sterilizer_ocr_entries',
          editOcrForm.id,
          user.uid,
          user.email || 'unknown',
          role,
          {
            message: 'ลบข้อมูลการนึ่งฆ่าเชื้อ (OCR)',
            deleted_data: beforeData
          }
        );
      }
      
      // ลบข้อมูลจริง
      await deleteDoc(doc(db, "sterilizer_ocr_entries", editOcrForm.id));
      setEditOcr(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setEditOcrError(err.message || "เกิดข้อผิดพลาด");
      } else {
        setEditOcrError("เกิดข้อผิดพลาด");
      }
    } finally {
      setEditOcrLoading(false);
    }
    
  };

  const checkForDuplicates = async (imageUrl: string, extractedText: string) => {
    const db = getFirestore();
    const q = query(collection(db, "sterilizer_ocr_entries"), orderBy("created_at", "desc"));
    const snapshot = await getDocs(q);
    const existingEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
    const duplicates = existingEntries.filter(entry => {
      const imageMatch = entry.image_url === imageUrl;
      const textMatch = entry.extracted_text === extractedText;
      return imageMatch || textMatch;
    });
    return duplicates;
  };

  const handleSaveOcrEntry = async () => {
    if (!previewImage || !ocrText || !user) return;
    // Check for duplicates first
    const duplicates = await checkForDuplicates(previewImage, ocrText);
    if (duplicates.length > 0) {
      setDuplicateEntries(duplicates);
    
      if (
        duplicates.some((d: DuplicateEntry) => d.image_url === previewImage) &&
        duplicates.some((d: DuplicateEntry) => d.extracted_text === ocrText)
      ) {
        setDuplicateType('both');
      } else if (duplicates.some((d: DuplicateEntry) => d.image_url === previewImage)) {
        setDuplicateType('image');
      } else {
        setDuplicateType('text');
      }
    
      setShowDuplicateModal(true);
      return;
    }
    
    // No duplicates, proceed with save
    await saveOcrEntry();
  };

  const saveOcrEntry = async () => {
    if (!user) return;
    setSaveLoading(true);
    setSaveSuccess("");
    try {
      const db = getFirestore();
      const checkboxResults = lastOcrApiResult?.checkboxResults;
      
      // ฟังก์ชันคำนวณสถานะ
      const calculateStatus = (checkboxResults: any): string => {
        // ตรวจสอบว่ามีการเลือกผลการทดสอบหรือไม่
        const hasTestResults = 
          checkboxResults?.mechanical === 'ผ่าน' || checkboxResults?.mechanical === 'ไม่ผ่าน' ||
          checkboxResults?.chemical_external === 'ผ่าน' || checkboxResults?.chemical_external === 'ไม่ผ่าน' ||
          checkboxResults?.chemical_internal === 'ผ่าน' || checkboxResults?.chemical_internal === 'ไม่ผ่าน' ||
          checkboxResults?.bio_test === 'ผ่าน' || checkboxResults?.bio_test === 'ไม่ผ่าน';
        
        // ถ้าไม่มีการเลือกผลการทดสอบเลย ให้คืนค่า NONE
        if (!hasTestResults) {
          return 'NONE';
        }
        
        // ถ้ามีการเลือกผลการทดสอบ ให้ตรวจสอบว่ามีการ "ไม่ผ่าน" หรือไม่
        if (
          checkboxResults?.mechanical === 'ไม่ผ่าน' ||
          checkboxResults?.chemical_external === 'ไม่ผ่าน' ||
          checkboxResults?.chemical_internal === 'ไม่ผ่าน' ||
          checkboxResults?.bio_test === 'ไม่ผ่าน'
        ) {
          return 'FAIL';
        }
        
        // ถ้าทุกอย่างผ่าน ให้คืนค่า PASS
        return 'PASS';
      };
      
      const docRef = await addDoc(collection(db, "sterilizer_ocr_entries"), {
        image_url: previewImage,
        extracted_text: ocrText,
        status: calculateStatus(checkboxResults), // คำนวณและกำหนดสถานะ
        created_by: user.email,
        created_at: Timestamp.now(),
        ...(checkboxResults ? { checkboxResults } : {}),
      });
      setSaveSuccess("บันทึกสำเร็จ!");
      setSaveSuccess("บันทึกข้อมูลสำเร็จ");
      setPreviewImage(null);
      setOcrText("");
      setShowOcrModal(false);
      
      // Log the audit action
      if (user) {
        await logAuditAction(
          'CREATE',
          'sterilizer_ocr_entries',
          docRef.id,
          user.uid,
          user.email || 'unknown',
          role,
          {
            message: 'สร้างรายการบันทึกข้อมูลการนึ่งฆ่าเชื้อ',
            extracted_text: ocrText.substring(0, 100) + (ocrText.length > 100 ? '...' : '')
          }
        );
      }
    } catch {
        setSaveSuccess("เกิดข้อผิดพลาดในการบันทึก");
      } finally {
      setSaveLoading(false);
    }
  };

  const handleProceedWithSave = async () => {
    setShowDuplicateModal(false);
    await saveOcrEntry();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    if (role !== "admin" && role !== "operator") {
      setErrorMsg("คุณไม่มีสิทธิ์เพิ่มข้อมูล");
      setSubmitting(false);
      return;
    }
    try {
      const db = getFirestore();
      const filteredItems = Array.isArray((form as any).items) ? (form as any).items.filter((item: any) => item.name || item.quantity) : [];
      // กรอง device_id ออกจาก form ก่อนบันทึก (เฉพาะถ้ามี)
      const formWithoutDeviceId = { ...form };
      if ('device_id' in formWithoutDeviceId) delete formWithoutDeviceId.device_id;
      
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

      // Add the new document
      const docRef = await addDoc(collection(db, "sterilizer_loads"), {
        ...formWithoutDeviceId,
        items: filteredItems,
        status: calculateStatus(formWithoutDeviceId), // คำนวณและกำหนดสถานะ
        created_by: user?.email,
        created_at: Timestamp.now(),
      });
      
      // Log the audit action
      if (user) {
        await logAuditAction(
          'CREATE',
          'sterilizer_loads',
          docRef.id,
          user.uid,
          user.email || 'unknown',
          role,
          {
            message: 'สร้างรายการบันทึกข้อมูลการนึ่งฆ่าเชื้อ (เพิ่มด้วยมือ)',
            program: form.program || 'ไม่ระบุโปรแกรม',
            sterilizer: form.sterilizer || 'ไม่ระบุเครื่องนึ่ง',
            items_count: filteredItems.length
          }
        );
      }
      // sync ไป collection เฉพาะทาง
      // const newCol = getColByProgram(form.program_name); // Removed
      // if (newCol) { // Removed
      //   await setDoc(doc(db, newCol, docRef.id), { // Removed
      //     ...form, // Removed
      //     program_name: fullProgramName, // Removed
      //     start_time: form.start_time ? Timestamp.fromDate(new Date(form.start_time)) : Timestamp.now(), // Removed
      //     end_time: form.end_time ? Timestamp.fromDate(new Date(form.end_time)) : Timestamp.now(), // Removed
      //     created_by: user?.email, // Removed
      //     created_at: Timestamp.now(), // Removed
      //   }); // Removed
      // } // Removed
      setSuccessMsg("บันทึกข้อมูลรอบการทำงานสำเร็จ!");
      setForm(initialForm);
      setShowForm(false);
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  };

  // Mouse events
  // OCR drag/zoom handlers removed (not used in current UI)

  // Reset zoom/offset when modal opens/closes
  useEffect(() => {
    if (editOcr) {
      // OCR zoom/offset reset removed as it wasn't being used
    }
  }, [editOcr]);

  useEffect(() => {
    if (showBigImage1 || showBigImage2) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = original; };
    }
  }, [showBigImage1, showBigImage2]);

  const overlayRef1 = useRef<HTMLDivElement>(null);
  const overlayRef2 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showBigImage1) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoomBig1(z => Math.max(0.5, Math.min(5, z + (e.deltaY < 0 ? 0.1 : -0.1))));
    };
    const el = overlayRef1.current;
    if (el) el.addEventListener('wheel', handler, { passive: false });
    return () => { if (el) el.removeEventListener('wheel', handler); };
  }, [showBigImage1]);

  useEffect(() => {
    if (!showBigImage2) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoomBig2(z => Math.max(0.5, Math.min(5, z + (e.deltaY < 0 ? 0.1 : -0.1))));
    };
    const el = overlayRef2.current;
    if (el) el.addEventListener('wheel', handler, { passive: false });
    return () => { if (el) el.removeEventListener('wheel', handler); };
  }, [showBigImage2]);

  useEffect(() => {
    if (showForm) {
      setSuccessMsg("");
      setErrorMsg("");
    }
  }, [showForm]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-transparent">
        <BubbleBackground />
        <div className="text-blue-900 text-xl font-semibold animate-pulse relative z-10">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-4 relative overflow-hidden bg-transparent">
      <BubbleBackground />
      <div className="w-full max-w-6xl bg-white/90 rounded-3xl shadow-2xl mt-4 p-6 flex flex-col items-center border border-white/30 backdrop-blur-xl relative z-10">
        <div className="w-full flex flex-col sm:flex-row gap-3 items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <img 
                src="/ram-logo.jpg" 
                alt="RAM Hospital" 
                className="w-40 h-30 object-contain hover:opacity-90 transition-opacity cursor-pointer"
              />
            </Link>
            <h1 className="text-2xl font-extrabold text-center drop-shadow">
              <span className="text-sky-400">ประวัติการบันทึก</span>{' '}
              <span className="text-blue-700">Sterilizer</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <button
              className="flex items-center bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full px-6 py-2.5 text-base font-semibold shadow-md transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg min-w-[180px] justify-center"
              onClick={() => setShowForm(true)}
            >
              <img src="/Save-as_37111.png" alt="บันทึก" className="w-5 h-5 mr-2" /> บันทึกรอบการทำงาน
            </button>

            {role === 'admin' && (
              <Link href="/dashboard" className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-full px-6 py-2.5 text-base font-semibold shadow-md transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 hover:shadow-lg min-w-[140px] flex items-center justify-center">
                Dashboard
              </Link>
            )}
            
            {user && (
              <UserDropdown user={user} role={role} onLogout={handleLogout} />
            )}
          </div>
        </div>
        
        <div className="w-full mt-1">
          <SterilizerLoadsCardView 
            user={user} 
            clearAllFiltersTrigger={clearAllFiltersTrigger}
            onDateRangeChange={handleDateRangeChange}
          />
          
          {edit && (
            <EditLoadModal
              editForm={editForm}
              setEditForm={setEditForm}
              onSave={handleEditSave}
              onDelete={handleDelete}
              loading={editLoading}
              deleteLoading={false}
              error={editError}
              allLoads={entries}
              user={user}
            />
          )}
          
          {editOcr && (
            <EditLoadModal
              editForm={editOcrForm}
              setEditForm={setEditOcrForm}
              onSave={handleEditOcrSave}
              onDelete={handleDeleteOcr}
              loading={editOcrLoading}
              deleteLoading={false}
              error={editOcrError}
              allLoads={entries}
              user={user}
            />
          )}
        </div>
        <HistoryFormModal
          show={showForm}
          onClose={() => setShowForm(false)}
          onSubmit={handleSubmit}
          form={form}
          setForm={setForm}
          submitting={submitting}
          errorMsg={errorMsg}
          successMsg={successMsg}
          user={user}
        />
        <OcrModal
          show={showOcrModal}
          onClose={handleCloseOcrModal}
          previewImage={previewImage}
          ocrText={ocrText}
          ocrLoading={ocrLoading}
          saveLoading={saveLoading}
          saveSuccess={saveSuccess}
          handleSaveOcrEntry={handleSaveOcrEntry}
        />
        <DuplicateModal
          show={showDuplicateModal}
          onClose={() => setShowDuplicateModal(false)}
          duplicateType={duplicateType}
          duplicateEntries={duplicateEntries}
          onProceedWithSave={handleProceedWithSave}
        />
        <ImageModal
          show={!!imageModalUrl}
          imageUrl={imageModalUrl}
          zoom={zoom}
          offset={offset}
          dragging={dragging}
          onClose={() => { setImageModalUrl(null); setZoom(1); setOffset({ x: 0, y: 0 }); }}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onImageClick={handleImageClick}
          onImageDoubleClick={handleImageDoubleClick}
        />
      </div>
      <div className="mt-8 text-black text-center text-sm">
        &copy; {new Date().getFullYear()} Sterilizer Data System | For Hospital Use | Thirdlnwza
      </div>
    </div>
  );
} 