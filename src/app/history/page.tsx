'use client';

import { useEffect, useState, useRef } from "react";
import Image from 'next/image';
import { useRouter } from "next/navigation";
import { 
  logAuditAction, 
  getUserRole, 
  collection, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp,
  Timestamp,
  FirebaseUser,
  firebaseAuthStateChanged,
  signOutUser,
  auth,
  db
} from "@/dbService";


import Link from "next/link";
import Swal from 'sweetalert2';

import SterilizerLoadsCardView from './SterilizerLoadsCardView';
import ImageModal from './ImageModal';
import HistoryFormModal from './HistoryFormModal';
import EditLoadModal from './EditLoadModal';
import DuplicateModal from './DuplicateModal';
import { FormData } from './HistoryFormModal';
import BubbleBackground from "@/components/BubbleBackground";

type AppUser = FirebaseUser & {
  role?: string;
};

const UserDropdown = ({ user, role, onLogout }: { user: AppUser | null, role: string, onLogout: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
        className="flex items-center gap-3 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-full px-4 py-1.5 font-medium shadow transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden border-2 border-purple-300">
          <Image 
            src="/Instigator.jpg" 
            alt="User" 
            width={32} 
            height={32}
            className="w-full h-full object-cover"
            unoptimized
          />
        </div>
        <div className="flex flex-col items-start min-w-0">
          <span className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px] md:max-w-[200px] lg:max-w-[260px] xl:max-w-[340px] 2xl:max-w-[440px] text-sm font-medium">
            {user?.displayName || user?.email?.split('@')[0]}
          </span>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            Role: {role === 'admin' ? 'Admin' : 'Operator'}
          </span>
        </div>
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
            <p className="text-sm font-medium text-gray-900 whitespace-normal break-words">{user?.displayName || user?.email}</p>
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
  
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>('');
  const [entries, setEntries] = useState<SterilizerEntry[]>([]);
  const [edit, setEdit] = useState<SterilizerEntry | null>(null);
  const [editForm, setEditForm] = useState<Partial<SterilizerEntry>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const router = useRouter();
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0, distance: 0 });
  const [lastTap, setLastTap] = useState(0);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateEntries] = useState<SterilizerEntry[]>([]);
  const [duplicateType] = useState<'image' | 'text' | 'both'>('image');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");



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
      setDragging(true);
      const touch = e.touches[0];
      dragStart.current = { x: touch.clientX, y: touch.clientY };
      offsetStart.current = { ...offset };
    } else if (e.touches.length === 2) {
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
    if (e.touches.length === 1 && dragging) {
      const touch = e.touches[0];
      setOffset({
        x: offsetStart.current.x + (touch.clientX - dragStart.current.x),
        y: offsetStart.current.y + (touch.clientY - dragStart.current.y),
      });
    } else if (e.touches.length === 2) {
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

  useEffect(() => {
    const unsubscribe = firebaseAuthStateChanged(auth, 
      (user: FirebaseUser | null) => {
        if (user) {
          setUser(user as AppUser);
          (async () => {
            try {
              const userRole = await getUserRole(user.email || user.uid);
              setRole(userRole);
              setLoading(false);
            } catch (error) {
              console.error('Error getting user role:', error);
              setRole('operator');
              setLoading(false);
            }
          })();
        } else {
          setUser(null);
          setLoading(false);
          router.replace("/login");
        }
      },
      (error: Error) => {
        console.error('Auth state error:', error);
        setLoading(false);
      },
      () => {
    
      }
    );
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [router]);

 

  

  const handleEditSave = async (formData: Partial<SterilizerEntry>) => {
    setEditLoading(true);
    setEditError("");
    
    try {
      if (!edit) return;
      
      const updateData = {
        ...formData,
        sterilizer: formData.sterilizer || '',
        updated_at: serverTimestamp()
      };
      
      await updateDoc(doc(db, 'sterilizer_loads', edit.id), updateData);
      if (user) {
        await logAuditAction(
          'UPDATE',
          'sterilizer_loads',
          edit.id,
          user.uid,
          user.email || 'unknown',
          role || 'operator',
          {
            field: 'all',
            oldValue: JSON.stringify(edit),
            newValue: JSON.stringify(updateData)
          }
        );
      }
      
      setEdit(null);
      setEditForm({});
      
      Swal.fire({
        title: 'บันทึกสำเร็จ',
        text: 'อัปเดตข้อมูลเรียบร้อยแล้ว',
        icon: 'success',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#3b82f6',
      });
    } catch (error) {
      console.error('Error updating document: ', error);
      setEditError('เกิดข้อผิดพลาดในการอัปเดตข้อมูล');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
  };

  const handleLogout = async () => {
    try {
      await signOutUser(user?.uid || '', user?.email || 'unknown', role || 'unknown');
      router.replace("/login");
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

 


  const handleProceedWithSave = async () => {
    setShowDuplicateModal(false);
  };

  const handleSubmit = async (formData: FormData) => {
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    if (role !== "admin" && role !== "operator") {
      setErrorMsg("คุณไม่มีสิทธิ์เพิ่มข้อมูล");
      setSubmitting(false);
      return;
    }
    try {
      const formWithoutDeviceId = { ...formData };
      if ('device_id' in formWithoutDeviceId) delete formWithoutDeviceId.device_id;
      const filteredItems = Array.isArray(formWithoutDeviceId.items)
        ? formWithoutDeviceId.items.filter((item: { name?: string; quantity?: string | number }) => Boolean(item.name) || Boolean(item.quantity))
        : [];
      const docRef = await addDoc(collection(db, "sterilizer_loads"), {
        ...formWithoutDeviceId,
        items: filteredItems,
        created_by: user?.email,
        created_at: Timestamp.now(),
      });
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
            program: formData.program || 'ไม่ระบุโปรแกรม',
            sterilizer: formData.sterilizer || 'ไม่ระบุเครื่องนึ่ง',
            items_count: filteredItems.length
          }
        );
      }
      setSuccessMsg("บันทึกข้อมูลรอบการทำงานสำเร็จ!");
      setForm(initialForm);
      setShowForm(false);
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  };


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
      <div className="w-full max-w-6xl bg-white/90 rounded-3xl shadow-2xl mt-4 p-6 flex flex-col items-center border border-white/30 backdrop-blur-xl relative z-10 min-h-[75vh]">
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
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            role={role}
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
        &copy; {new Date().getFullYear()} Sterilizer Data System | For Ram Hospital | Chitiwat Turmcher
      </div>
    </div>
  );
} 