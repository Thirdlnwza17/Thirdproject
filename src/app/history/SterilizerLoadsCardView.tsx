'use client';
import React, { useState, useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import { saveAs } from 'file-saver';
import { getFirestore, collection, query, orderBy, onSnapshot, updateDoc, deleteDoc, doc, getDocs, getDoc } from 'firebase/firestore';
import { logAuditAction } from '@/dbService';
import EditLoadModal from './EditLoadModal';
import SterilizerLoadsCompactView from './SterilizerLoadsCompactView';

// Helper function to determine statuses
export const getStatuses = (load: any) => {
  // Check if it's a test run (no items or all quantities are 0/empty)
  const isTestRun = !load.items || 
                   load.items.length === 0 || 
                   load.items.every((item: any) => !item.quantity || item.quantity === '0' || item.quantity === 0);
  
  // Check for any failed tests
  const hasFailed = 
    load.mechanical === 'ไม่ผ่าน' || 
    load.chemical_external === 'ไม่ผ่าน' || 
    load.chemical_internal === 'ไม่ผ่าน' || 
    load.bio_test === 'ไม่ผ่าน';
  
  // Return statuses based on conditions
  if (isTestRun) {
    const testResultStatus = hasFailed 
      ? { status: 'Fail', color: 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-100' }
      : { status: 'Pass', color: 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-100' };
      
    return [
      { status: 'Test Run', color: 'bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-100' },
      testResultStatus
    ];
  } else if (hasFailed) {
    return [{ status: 'Fail', color: 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-100' }];
  } else {
    return [{ status: 'Pass', color: 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-100' }];
  }
};

interface SterilizerLoadsCardViewProps {
  user: any;
  clearAllFiltersTrigger?: number;
  onDateRangeChange?: (range: { startDate: string; endDate: string }) => void;
}

// Helper to ensure ISO date strings (YYYY-MM-DD)
const ensureIso = (v: string) => v ? v.slice(0,10) : '';

export default function SterilizerLoadsCardView({ 
  user, 
  clearAllFiltersTrigger,
  onDateRangeChange
}: SterilizerLoadsCardViewProps) {
  // Date range state
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  
  // Set date range based on filter type (today, week, month, year)
  const setDateRangeFilter = (type: 'today' | 'week' | 'month' | 'year') => {
    const today = new Date();
    const startDate = new Date();
    
    switch (type) {
      case 'today':
        // Set to today
        break;
      case 'week':
        // Set to start of week (Sunday)
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 0); // Adjust for Sunday
        startDate.setDate(diff);
        break;
      case 'month':
        // Set to first day of month
        startDate.setDate(1);
        break;
      case 'year':
        // Set to first day of year
        startDate.setMonth(0, 1);
        break;
    }

    // Format dates
    const formatDatePart = (date: Date) => ({
      year: date.getFullYear().toString(),
      month: (date.getMonth() + 1).toString().padStart(2, '0'),
      day: date.getDate().toString().padStart(2, '0')
    });

    const start = formatDatePart(startDate);
    const end = formatDatePart(today);

    const newRange = {
      startDate: `${start.year}-${start.month}-${start.day}`,
      endDate: `${end.year}-${end.month}-${end.day}`
    };
    
    setDateRange(newRange);
    if (onDateRangeChange) {
      onDateRangeChange(newRange);
    }
  };

  const handleStartDateChange = (value: string) => {
    const newRange = { ...dateRange, startDate: ensureIso(value) };
    setDateRange(newRange);
    if (onDateRangeChange) {
      onDateRangeChange(newRange);
    }
  };

  const handleEndDateChange = (value: string) => {
    const newRange = { ...dateRange, endDate: ensureIso(value) };
    setDateRange(newRange);
    if (onDateRangeChange) {
      onDateRangeChange(newRange);
    }
  };
  
  // Refs for native date inputs
  const startDateInputRef = useRef<HTMLInputElement | null>(null);
  const endDateInputRef = useRef<HTMLInputElement | null>(null);
  
  // Format ISO (YYYY-MM-DD) to yyyy/mm/dd for display
  const formatToYyMmDd = (iso: string) => {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [yyyy, mm, dd] = parts;
    return `${yyyy}/${mm}/${dd}`;
  };
  
  const handleClearAllFilters = () => {
    setDateRange({ startDate: '', endDate: '' });
    setFilter('All');
    setAutoclaveSub('All');
    setSelectedStaff('');
    setSnFilter('');
    setSearchText('');
    setMechanicalFilter('');
    setChemicalExternalFilter('');
    setChemicalInternalFilter('');
    setBioTestFilter('');
    setShowAdvancedFilters(false);
    
    if (onDateRangeChange) {
      onDateRangeChange({ startDate: '', endDate: '' });
    }
  };
  // State for Card View
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');
  const [selectedLoad, setSelectedLoad] = useState<any>(null);
  const [loads, setLoads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const role = user?.role || 'user';
  const [filter, setFilter] = useState('All');
  const [autoclaveSub, setAutoclaveSub] = useState('All');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = viewMode === 'compact' ? 15 : 6;
  const [lastUpdatedId, setLastUpdatedId] = useState<string | null>(null);
  const cardRefs = useRef<{[key: string]: HTMLDivElement | null}>({});
  // State for edit modal
  const [editForm, setEditForm] = useState<any | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editError, setEditError] = useState("");
  
  // State for filters
  const [staffList, setStaffList] = useState<{id: string, fullName: string}[]>([]);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [snFilter, setSnFilter] = useState('');
  const [searchText, setSearchText] = useState("");
  const [mechanicalFilter, setMechanicalFilter] = useState("");
  const [chemicalExternalFilter, setChemicalExternalFilter] = useState("");
  const [chemicalInternalFilter, setChemicalInternalFilter] = useState("");
  const [bioTestFilter, setBioTestFilter] = useState("");

  // Fetch staff list from Firestore
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const db = getFirestore();
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = usersSnapshot.docs
          .map(doc => ({
            id: doc.id,
            fullName: doc.data().fullName || doc.data().email || 'Unknown'
          }))
          .filter(user => user.fullName && user.fullName !== 'Unknown');
        
        // Remove duplicates and sort alphabetically
        const uniqueUsers = Array.from(new Map(users.map(user => [user.fullName, user])).values())
          .sort((a, b) => a.fullName.localeCompare(b.fullName));
        
        setStaffList(uniqueUsers);
      } catch (error) {
        console.error('Error fetching staff list:', error);
      }
    };

    fetchStaff();
  }, []);

  useEffect(() => {
    setLoading(true);
    const db = getFirestore();
    const q = query(collection(db, 'sterilizer_loads'), orderBy('created_at', 'desc'));
    // Use a ref to ignore the initial snapshot when deciding if a new document was added
    const initialSnapshot = { current: true } as { current: boolean };
    const unsub = onSnapshot(q, (snapshot) => {
      const updatedLoads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLoads(updatedLoads);

      // ตรวจสอบว่ามีการเพิ่มข้อมูลใหม่หรือไม่ (ใช้ docChanges เพื่อหาการเพิ่ม)
      if (!initialSnapshot.current) {
        const added = snapshot.docChanges().some(change => change.type === 'added');
        if (added && updatedLoads.length > 0) {
          setLastUpdatedId(updatedLoads[0].id);
          setCurrentPage(1); // กลับไปที่หน้าแรกเมื่อมีการเพิ่มข้อมูลใหม่
        }
      }

      initialSnapshot.current = false;
      setLoading(false);
    });
    return () => unsub();
  }, []);
  
  // Effect สำหรับ scroll ไปที่การ์ดที่เพิ่งอัปเดต
  useEffect(() => {
    if (lastUpdatedId && cardRefs.current[lastUpdatedId]) {
      // เพิ่มคลาสไฮไลต์
      const card = cardRefs.current[lastUpdatedId];
      if (card) {
        // ใช้ requestAnimationFrame เพื่อให้แน่ใจว่า DOM ได้อัปเดตแล้ว
        requestAnimationFrame(() => {
          card.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          });
          
          // เพิ่มคลาสไฮไลต์
          card.classList.add('ring-4', 'ring-green-500', 'ring-opacity-75');
          
          // ลบไฮไลต์หลังจาก 3 วินาที
          const timer = setTimeout(() => {
            card.classList.remove('ring-4', 'ring-green-500', 'ring-opacity-75');
            setLastUpdatedId(null);
          }, 3000);
          
          return () => clearTimeout(timer);
        });
      }
    }
  }, [lastUpdatedId, currentPage]);

  // Reset all filters when clearAllFiltersTrigger changes
  useEffect(() => {
    setFilter('All');
    setAutoclaveSub('All');
    setSnFilter('');
    setSelectedStaff('');
    setMechanicalFilter('');
    setChemicalExternalFilter('');
    setChemicalInternalFilter('');
    setBioTestFilter('');
    setSearchText('');
    setCurrentPage(1);
  }, [clearAllFiltersTrigger]);
  
  // Filter loads by staff (both sterile staff and result readers)
  const filterByStaff = (load: any) => {
    if (!selectedStaff) return true;
    
    const staffName = selectedStaff.toLowerCase();
    const sterileStaff = (load.sterile_staff || '').toLowerCase();
    const resultReader = (load.result_reader || '').toLowerCase();
    
    return sterileStaff.includes(staffName) || resultReader.includes(staffName);
  };

  // ฟังก์ชัน filter, pagination
  const filteredLoads = loads.filter(load => {
    // Date range filter
    if (dateRange?.startDate || dateRange?.endDate) {
      const loadDate = load.date || load.test_date;
      if (!loadDate) return false;
      
      const entryDate = new Date(loadDate);
      entryDate.setHours(0, 0, 0, 0);
      
      if (dateRange.startDate) {
        const startDate = new Date(dateRange.startDate);
        startDate.setHours(0, 0, 0, 0);
        if (entryDate < startDate) return false;
      }
      
      if (dateRange.endDate) {
        const endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (entryDate > endDate) return false;
      }
    }
    
    // SN Filter (ใช้ attest_sn)
    if (snFilter && load.attest_sn !== snFilter) return false;
    // กรองประเภท
    if (filter !== 'All') {
      const prog = (load.program || '').toUpperCase();
      if (filter === 'Gas' && prog !== 'EO') return false;
      if (filter === 'Plasma' && prog !== 'PLASMA') return false;
      if (filter === 'Autoclave') {
        if (autoclaveSub === 'All') {
          if (!(prog === 'BOWIE' || prog === 'PREVAC')) return false;
        } else {
          if (prog !== autoclaveSub) return false;
        }
      }
    }
    // Multi-filters
    if (mechanicalFilter && (load.mechanical || '').toLowerCase() !== mechanicalFilter) return false;
    if (chemicalExternalFilter && (load.chemical_external || '').toLowerCase() !== chemicalExternalFilter) return false;
    if (chemicalInternalFilter && (load.chemical_internal || '').toLowerCase() !== chemicalInternalFilter) return false;
    if (bioTestFilter && (load.bio_test || '').toLowerCase() !== bioTestFilter) return false;
    
    // Staff filter
    if (!filterByStaff(load)) return false;

    // Search only: operator, items, sterilizer
    if (searchText && searchText.trim()) {
      const lower = searchText.trim().toLowerCase();
      // Operator fields
      const operator = (load.operator || '').toLowerCase();
      const sterileStaff = (load.sterile_staff || '').toLowerCase();
      const resultReader = (load.result_reader || '').toLowerCase();
      // Equipment names
      const items = Array.isArray(load.items)
        ? load.items.map((item: any) => (typeof item === 'string' ? item : (item.name || ''))).join(' ').toLowerCase()
        : (typeof load.items === 'string' ? load.items.toLowerCase() : '');
      // Sterilizer
      const sterilizer = (load.sterilizer || '').toLowerCase();
      if (!(
        operator.includes(lower) ||
        sterileStaff.includes(lower) ||
        resultReader.includes(lower) ||
        items.includes(lower) ||
        sterilizer.includes(lower)
      )) return false;
    }

    return true;
  });
  const totalPages = Math.ceil(filteredLoads.length / itemsPerPage);
  const paginatedLoads = filteredLoads.slice(
    (currentPage - 1) * itemsPerPage, 
    currentPage * itemsPerPage
  );
  
  // Update page when view mode changes
  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode]);

  // ฟังก์ชัน modal edit, modal image, zoom, drag (เหมือนเดิม)
  // ... (handleEdit, handleEditSave, handleDelete, modal image, zoom, drag, etc.)

  // ฟังก์ชัน handleEditSave (logic อัปเดตข้อมูล)
  const handleEditSave = async (formData: any) => {
    setEditLoading(true);
    setEditError("");
    try {
      const db = getFirestore();
      const updateData = {
        ...formData,
        attest_sn: formData.attest_sn || '',
        attest_time: formData.attest_time || '',
        total_duration: formData.total_duration || '',
        updated_at: new Date(),
      };
      
      await updateDoc(doc(db, 'sterilizer_loads', formData.id), updateData);
      
      // Set the last updated ID for highlighting
      setLastUpdatedId(formData.id);
      
      // Reset form and refresh data
      setEditForm(null);
      setLoading(true);
      
      // Refresh loads
      const q = query(collection(db, 'sterilizer_loads'), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      const updatedLoads = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLoads(updatedLoads);
      
      // Find the page with the updated card
      const updatedIndex = updatedLoads.findIndex(load => load.id === formData.id);
      if (updatedIndex >= 0) {
        const page = Math.floor(updatedIndex / itemsPerPage) + 1;
        setCurrentPage(page);
      }
      
      setLoading(false);
    } catch (err: any) {
      setEditError(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setEditLoading(false);
    }
  };

  // ฟังก์ชัน handleDelete (logic ลบข้อมูล)
  const handleDelete = async (id: string) => {
    setDeleteLoading(true);
    setEditError("");
    try {
      const db = getFirestore();
      const docRef = doc(db, 'sterilizer_loads', id);
      
      // ดึงข้อมูลก่อนลบเพื่อบันทึกลง audit log
      const docSnap = await getDoc(docRef);
      const deletedData = docSnap.exists() ? docSnap.data() : null;
      
      // บันทึก audit log ก่อนลบ
      if (deletedData && user) {
        await logAuditAction(
          'DELETE',
          'sterilizer_loads',
          id,
          user.uid,
          user.email || 'unknown',
          role,
          {
            message: 'ลบข้อมูลการนึ่งฆ่าเชื้อ',
            deleted_data: deletedData
          }
        );
      }
      
      // ลบข้อมูลจริง
      await deleteDoc(docRef);
      
      setEditForm(null);
      setLastUpdatedId(null);
      setLoading(true);
      // Refresh loads
      const q = query(collection(db, 'sterilizer_loads'), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      setLoads(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    } catch (err: any) {
      setEditError(err.message || "เกิดข้อผิดพลาดในการลบข้อมูล");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <div className="text-center text-gray-500 py-8">กำลังโหลดข้อมูล...</div>;
  if (loads.length === 0) return <div className="text-center text-gray-400 py-12 text-lg">ยังไม่มีข้อมูลรอบการทำงาน</div>;

  // --- Export CSV ---
  async function handleExportCsv() {
    if (!filteredLoads || filteredLoads.length === 0) {
      await Swal.fire({
        title: 'ไม่พบข้อมูล',
        text: 'ไม่มีข้อมูลให้ export',
        icon: 'info',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }
    // Define CSV headers
    const headers = [
      "ID",
      "TestDate",
      "SerialNumber",
      "Program",
      "Items",
      "ChemicalResult",
      "BiologicalResult",
      "SterilizationTime",
      "Temperature",
      "Operator"
    ];
    // Map Firestore fields correctly
    const rows = filteredLoads.map(e => [
      e.id ?? "",
      (
        e.date &&
        typeof e.date === 'object' &&
        typeof (e.date as any).toDate === 'function'
      )
        ? (e.date as any).toDate().toISOString().slice(0, 10)
        : (typeof e.date === 'string' ? e.date : (e.date ?? "")),
      e.attest_sn ?? e.serial_number ?? "",
      e.program ?? "",
      Array.isArray(e.items)
        ? e.items.map((i: any) => (typeof i === 'string' ? i : (i.name || '')).replace(/"/g, '""')).join(';')
        : (typeof e.items === 'string' ? e.items.replace(/"/g, '""') : ''),
      e.chemical_external ?? "",
      e.bio_test ?? "",
      e.attest_time ?? "",
      e.temperature ?? "",
      e.created_by ?? ""
    ]);
    // Convert to CSV string
    const csvContent = '\uFEFF' + [headers, ...rows]
      .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    // Download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `sterilizer-history-visible-${new Date().toISOString().slice(0,10)}.csv`);
  }

  return (
    <div className="w-full">
      {/* Date Filter Controls */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => setDateRangeFilter('today')}
            className="px-2.5 py-1 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md transition-colors border border-blue-100"
          >
            วันนี้
          </button>
          <button
            type="button"
            onClick={() => setDateRangeFilter('week')}
            className="px-2.5 py-1 text-xs font-medium bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md transition-colors border border-purple-100"
          >
            สัปดาห์นี้
          </button>
          <button
            type="button"
            onClick={() => setDateRangeFilter('month')}
            className="px-2.5 py-1 text-xs font-medium bg-green-50 hover:bg-green-100 text-green-700 rounded-md transition-colors border border-green-100"
          >
            เดือนนี้
          </button>
          <button
            type="button"
            onClick={() => setDateRangeFilter('year')}
            className="px-2.5 py-1 text-xs font-medium bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-md transition-colors border border-yellow-100"
          >
            ปีนี้
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">จากวันที่</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => startDateInputRef.current?.showPicker?.() || startDateInputRef.current?.click()}
                className="w-full text-left rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm shadow-sm hover:bg-gray-50 transition-colors"
              >
                {formatToYyMmDd(dateRange.startDate) || 'yyyy/mm/dd'}
              </button>
              <input
                ref={startDateInputRef}
                type="date"
                value={dateRange.startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="absolute inset-0 w-0 h-0 opacity-0 pointer-events-none"
                aria-hidden="true"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ถึงวันที่</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => endDateInputRef.current?.showPicker?.() || endDateInputRef.current?.click()}
                className="w-full text-left rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm shadow-sm hover:bg-gray-50 transition-colors"
              >
                {formatToYyMmDd(dateRange.endDate) || 'yyyy/mm/dd'}
              </button>
              <input
                ref={endDateInputRef}
                type="date"
                value={dateRange.endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="absolute inset-0 w-0 h-0 opacity-0 pointer-events-none"
                aria-hidden="true"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleClearAllFilters}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-md px-2.5 py-1 text-sm shadow-sm hover:shadow transition-colors w-full h-[30px] flex items-center justify-center"
              type="button"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        </div>
      </div>
      {/* Main Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          className="border rounded px-2 py-1 text-sm text-black bg-white w-48 min-w-[120px] h-[30px]"
          type="text"
          placeholder="ค้นหา อุปกรณ์, รอบการฆ่าเชื้อ"
          value={searchText}
          onChange={e => { setSearchText(e.target.value); setCurrentPage(1); }}
        />
        
        {/* Staff Filter */}
        <div className="flex items-center h-[30px]">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap mr-1">เจ้าหน้าที่:</label>
          <select
            className="border rounded px-2 py-1 text-sm text-black bg-white min-w-[120px] h-full"
            value={selectedStaff}
            onChange={e => { setSelectedStaff(e.target.value); setCurrentPage(1); }}
          >
            <option value="">ทั้งหมด</option>
            {staffList.map(staff => (
              <option key={staff.id} value={staff.fullName}>
                {staff.fullName}
              </option>
            ))}
          </select>
        </div>

        {/* Program Type */}
        <div className="flex items-center h-[30px]">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap mr-1">โปรแกรม:</label>
          <select
            className="border rounded px-2 py-1 text-sm text-black bg-white min-w-[100px] h-full"
            value={filter}
            onChange={e => {
              setFilter(e.target.value);
              setCurrentPage(1);
              if (e.target.value !== 'Autoclave') setAutoclaveSub('All');
            }}
          >
            <option value="All">ทั้งหมด</option>
            <option value="Plasma">Plasma</option>
            <option value="Autoclave">Autoclave</option>
            <option value="Gas">Gas</option>
          </select>
        </div>

        {/* Autoclave Sub-filter */}
        {filter === 'Autoclave' && (
          <div className="flex items-center h-[30px]">
            <label className="text-xs font-medium text-gray-700 whitespace-nowrap mr-1">Autoclave:</label>
            <select
              className="border rounded px-2 py-1 text-sm text-black bg-white min-w-[100px] h-full"
              value={autoclaveSub}
              onChange={e => { setAutoclaveSub(e.target.value); setCurrentPage(1); }}
            >
              <option value="All">ทั้งหมด</option>
              <option value="PREVAC">PREVAC</option>
              <option value="BOWIE">BOWIE</option>
            </select>
          </div>
        )}

        {/* Advanced Filters Toggle */}
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className="flex items-center gap-1 px-2 py-1 text-xs border rounded text-blue-600 hover:bg-blue-50 h-[30px]"
        >
         
          ตัวกรองขั้นสูง
          {showAdvancedFilters ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>

        <button
          className="px-2 py-1 text-xs rounded bg-green-500 hover:bg-green-600 text-white font-medium shadow h-[30px] flex items-center"
          onClick={handleExportCsv}
        >
          ⬇️ Export
        </button>
      </div>

      {/* Advanced Filters */}
      {showAdvancedFilters && (
        <div className="bg-gray-50 p-3 rounded-lg mb-4 border border-gray-200 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {/* SN Filter */}
            <div className="flex items-center h-[30px]">
              <label className="text-xs font-medium text-gray-700 whitespace-nowrap mr-1">SN:</label>
              <select
                className="border rounded px-2 py-1 text-sm text-black bg-white h-full min-w-[100px]"
                value={snFilter}
                onChange={e => { setSnFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="">ทั้งหมด</option>
                <option value="431930">431930</option>
                <option value="101715">101715</option>
              </select>
            </div>

            {/* Test Result Filters */}
            <div className="flex items-center h-[30px]">
              <label className="text-xs font-medium text-gray-700 whitespace-nowrap mr-1">กลไก:</label>
              <select
                className="border rounded px-2 py-1 text-sm text-black bg-white h-full min-w-[80px]"
                value={mechanicalFilter}
                onChange={e => { setMechanicalFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="">ทั้งหมด</option>
                <option value="ผ่าน">ผ่าน</option>
                <option value="ไม่ผ่าน">ไม่ผ่าน</option>
              </select>
            </div>

            <div className="flex items-center h-[30px]">
              <label className="text-xs font-medium text-gray-700 whitespace-nowrap mr-1">เทปภายนอก:</label>
              <select
                className="border rounded px-2 py-1 text-sm text-black bg-white h-full min-w-[80px]"
                value={chemicalExternalFilter}
                onChange={e => { setChemicalExternalFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="">ทั้งหมด</option>
                <option value="ผ่าน">ผ่าน</option>
                <option value="ไม่ผ่าน">ไม่ผ่าน</option>
              </select>
            </div>

            <div className="flex items-center h-[30px]">
              <label className="text-xs font-medium text-gray-700 whitespace-nowrap mr-1">เทปภายใน:</label>
              <select
                className="border rounded px-2 py-1 text-sm text-black bg-white h-full min-w-[80px]"
                value={chemicalInternalFilter}
                onChange={e => { setChemicalInternalFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="">ทั้งหมด</option>
                <option value="ผ่าน">ผ่าน</option>
                <option value="ไม่ผ่าน">ไม่ผ่าน</option>
              </select>
            </div>

            <div className="flex items-center h-[30px]">
              <label className="text-xs font-medium text-gray-700 whitespace-nowrap mr-1">ชีวภาพ:</label>
              <select
                className="border rounded px-2 py-1 text-sm text-black bg-white h-full min-w-[80px]"
                value={bioTestFilter}
                onChange={e => { setBioTestFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="">ทั้งหมด</option>
                <option value="ผ่าน">ผ่าน</option>
                <option value="ไม่ผ่าน">ไม่ผ่าน</option>
              </select>
            </div>
          </div>
        </div>
      )}
      {/* View Toggle and Count */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-gray-700 font-semibold">แสดง {filteredLoads.length} รายการ</div>
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('compact')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'compact' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 hover:border-blue-300'
            }`}
          >
            แสดงแบบตาราง
          </button>
          <button
            onClick={() => setViewMode('detailed')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'detailed' 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'bg-white text-purple-700 border border-purple-200 hover:bg-purple-50 hover:border-purple-300'
            }`}
          >
            แสดงแบบการ์ด
          </button>
        </div>
      </div>

      {viewMode === 'compact' ? (
        <SterilizerLoadsCompactView 
          loads={paginatedLoads} 
          onViewDetail={(load) => setSelectedLoad(load)}
          user={user}
          onEditSave={handleEditSave}
          onDelete={handleDelete}
          allLoads={loads}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {paginatedLoads.map(load => {
            // Create a ref callback that handles the element assignment
            const setCardRef = (el: HTMLDivElement | null) => {
            if (el) {
              cardRefs.current[load.id] = el;
            } else {
              delete cardRefs.current[load.id];
            }
          };
          
          return (
            <div 
              key={load.id}
              ref={setCardRef}
              className={`bg-white rounded-2xl shadow-lg p-6 mb-6 border border-blue-200 flex flex-col gap-4 cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all ${
                lastUpdatedId === load.id ? 'ring-4 ring-green-500 ring-opacity-75' : ''
              }`}
              onClick={e => {
                if ((e.target as HTMLElement).tagName === 'IMG' || (e.target as HTMLElement).closest('button,input,label')) return;
                setEditForm(load);
              }}
          >
            {/* Header - Blue row on top */}
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-lg text-blue-700">
                {load.date || "-"} | {load.sterilizer || "-"}
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const statuses = getStatuses(load);
                  return (
                    <>
                      {statuses.map((status, index) => (
                        <span 
                          key={index}
                          className={`${status.color} text-xs px-2.5 py-1 rounded-md font-medium transition-colors`}
                        >
                          {status.status}
                        </span>
                      ))}
                    </>
                  );
                })()}
                <span className="text-base font-bold text-black">{load.program || "-"}</span>
              </div>
            </div>
            {/* SN, เวลา, Duration Display - Black row below */}
            {(load.attest_sn || load.attest_time || load.total_duration) && (
              <div className="text-sm text-black font-semibold flex flex-wrap gap-6 items-center">
                {load.attest_sn && <span>SN: <span className="font-bold">{load.attest_sn}</span></span>}
                {load.attest_time && <span>เวลา: <span className="font-bold">{load.attest_time}</span></span>}
                {load.total_duration && <span>เวลารวม: <span className="font-bold">{load.total_duration}</span> นาที</span>}
              </div>
            )}

            {/* ข้อมูลหลัก */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-black">
              <div><span className="font-semibold">ผลกลไก:</span> {load.mechanical || "-"}</div>
              <div><span className="font-semibold">ผลเคมีภายนอก:</span> {load.chemical_external || "-"}</div>
              <div><span className="font-semibold">ผลเคมีภายใน:</span> {load.chemical_internal || "-"}</div>
              <div><span className="font-semibold">ผลชีวภาพ:</span> {load.bio_test || "-"}</div>
              <div><span className="font-semibold">เจ้าหน้าที่:</span> {load.sterile_staff || "-"}</div>
              <div><span className="font-semibold">ผู้อ่านผล:</span> {load.result_reader || "-"}</div>
            </div>
            {/* ชุดอุปกรณ์ */}
            {load.items && load.items.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <div className="font-bold text-black mb-1">ชุดอุปกรณ์ ({load.items.length} รายการ)</div>
                <table className="w-full text-xs border border-black mb-2 bg-white min-w-[400px]">
                  <thead>
                    <tr>
                      <th className="border border-black p-1 text-black">NO</th>
                      <th className="border border-black p-1 text-black">ชื่อ/กลุ่มอุปกรณ์</th>
                      <th className="border border-black p-1 text-black">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {load.items.slice(0, 5).map((item: any, idx: number) => (
                      <tr key={idx} className="text-black">
                        <td className="border border-black p-1 text-center text-black">{idx + 1}</td>
                        <td className="border border-black p-1 text-black">{item.name}</td>
                        <td className="border border-black p-1 text-center text-black text-[11px]">{item.quantity}</td>
                      </tr>
                    ))}
                    {load.items.length > 5 && (
                      <tr>
                        <td colSpan={3} className="text-center text-gray-500 border border-black">
                          ...และอีก {load.items.length - 5} รายการ
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {/* รูป */}
            <div className="flex gap-4 mt-2 flex-wrap">
              {[1,2].map(idx => (
                <div key={`image-${load.id}-${idx}`} className="flex flex-col items-center">
                  {load[`image_url_${idx}`] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={load[`image_url_${idx}`]} alt={`Sterile ${idx}`} className="w-32 h-32 object-contain border rounded mb-1 bg-gray-50" />
                  ) : (
                    <div className="w-32 h-32 flex items-center justify-center border rounded bg-gray-100 text-gray-400 mb-1">ไม่มีรูป</div>
                  )}
                  <div className="text-xs text-gray-500">{idx === 1 ? 'Sterile Slip' : 'Attest'}</div>
                </div>
              ))}
            </div>
            </div>
          );
        })}
          </div>
        )}
      {/* Detail Modal */}
      {selectedLoad && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">รายละเอียดการทำงาน</h3>
                <button 
                  onClick={() => setSelectedLoad(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Render the detailed card view here */}
              <div className="bg-white rounded-lg shadow-md p-6 mb-4 border border-gray-200">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-lg text-blue-700">
                    {selectedLoad.date || "-"} | {selectedLoad.sterilizer || "-"}
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatuses(selectedLoad).map((status, index) => (
                      <span 
                        key={index}
                        className={`${status.color} text-white text-xs px-2 py-0.5 rounded-full font-semibold`}
                      >
                        {status.status}
                      </span>
                    ))}
                    <span className="text-base font-bold text-black">{selectedLoad.program || "-"}</span>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-black mt-4">
                  <div><span className="font-semibold">ผลกลไก:</span> {selectedLoad.mechanical || "-"}</div>
                  <div><span className="font-semibold">ผลเคมีภายนอก:</span> {selectedLoad.chemical_external || "-"}</div>
                  <div><span className="font-semibold">ผลเคมีภายใน:</span> {selectedLoad.chemical_internal || "-"}</div>
                  <div><span className="font-semibold">ผลชีวภาพ:</span> {selectedLoad.bio_test || "-"}</div>
                  <div><span className="font-semibold">เจ้าหน้าที่:</span> {selectedLoad.sterile_staff || "-"}</div>
                  <div><span className="font-semibold">ผู้อ่านผล:</span> {selectedLoad.result_reader || "-"}</div>
                </div>

                {/* Items */}
                {selectedLoad.items?.length > 0 && (
                  <div className="mt-4">
                    <div className="font-semibold mb-2">รายการอุปกรณ์ ({selectedLoad.items.length} รายการ)</div>
                    <div className="max-h-40 overflow-y-auto border rounded">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="p-2 text-left">ลำดับ</th>
                            <th className="p-2 text-left">ชื่ออุปกรณ์</th>
                            <th className="p-2 text-right">จำนวน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedLoad.items.map((item: any, idx: number) => (
                            <tr key={idx} className="border-t">
                              <td className="p-2">{idx + 1}</td>
                              <td className="p-2">{item.name}</td>
                              <td className="p-2 text-right">{item.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Images */}
                <div className="flex gap-4 mt-4 flex-wrap">
                  {[1, 2].map((idx) => (
                    <div key={`image-${selectedLoad.id}-${idx}`} className="flex flex-col items-center">
                      {selectedLoad[`image_url_${idx}`] ? (
                        <img
                          src={selectedLoad[`image_url_${idx}`]}
                          alt={`Sterile ${idx}`}
                          className="w-48 h-48 object-contain border rounded mb-1 bg-gray-50"
                        />
                      ) : (
                        <div className="w-48 h-48 flex items-center justify-center border rounded bg-gray-100 text-gray-400">
                          ไม่มีรูป
                        </div>
                      )}
                      <div className="text-xs text-gray-500">
                        {idx === 1 ? 'Sterile Slip' : 'Attest'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Pagination Controls */}
      <div className="flex justify-between items-center mt-4 px-4 py-2 bg-gray-50 rounded">
        <div className="text-sm text-gray-600">
          {filteredLoads.length > 0 
            ? `${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, filteredLoads.length)} of ${filteredLoads.length} items`
            : 'No items found'}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded bg-white border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              &lt;
            </button>
            <span className="text-sm text-gray-700">
              {currentPage} / {totalPages}
            </span>
            <button
              className="px-3 py-1 rounded bg-white border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              &gt;
            </button>
          </div>
        )}
      </div>
      {/* Modal edit, modal image, ... (สามารถแยกเป็น component เพิ่มเติมได้) */}
      {editForm && (
        <EditLoadModal
          editForm={editForm}
          setEditForm={setEditForm}
          onSave={handleEditSave}
          onDelete={handleDelete}
          loading={editLoading}
          deleteLoading={deleteLoading}
          error={editError}
          allLoads={loads}
          user={user}
        />
      )}
    </div>
  );
} 