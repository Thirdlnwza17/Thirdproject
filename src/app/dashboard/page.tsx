'use client';

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut, onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import Link from "next/link";
import Image from 'next/image';
import { getUserRole, subscribeToSterilizerLoads } from "@/dbService";

import { STATUS_OPTIONS, MAIN_PROGRAMS, AUTOCLAVE_SUBPROGRAMS, PROGRAM_FILTERS, ALL_FILTERS, INDICATOR_FILTERS } from "./constants";
import ProgramAnalyticsChart, { ProgramAnalyticsData } from "./ProgramAnalyticsChart";
import { calculateProgramAnalytics, SterilizerEntry as AnalyticsSterilizerEntry } from "./analyticsService";

// สำหรับ type ของ checkboxResults
interface CheckboxResults {
  chemical_external?: boolean;
  chemical_internal?: boolean;
  mechanical?: boolean;
  biological?: boolean;
  [key: string]: any;
}

const initialForm = {
  status: STATUS_OPTIONS[0],
  phases: []
};


function normalizeStatus(status: any): "PASS" | "FAIL" | "CANCEL" {
  if (status === "PASS" || status === "ผ่าน" || status === true || status === 1) return "PASS";
  if (status === "FAIL" || status === "ไม่ผ่าน" || status === false || status === 0) return "FAIL";
  if (status === "CANCEL" || status === "ยกเลิก") return "CANCEL";
  return "FAIL"; // fallback
}

// ถ้า indicator ตัวใด "ไม่ผ่าน" ให้ถือว่า FAIL
function getEntryStatus(data: any): "PASS" | "FAIL" | "CANCEL" {
  if (
    data.bio_test === "ไม่ผ่าน" ||
    data.mechanical === "ไม่ผ่าน" ||
    data.chemical_external === "ไม่ผ่าน" ||
    data.chemical_internal === "ไม่ผ่าน"
  ) {
    return "FAIL";
  }
  return normalizeStatus(data.status);
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  // กำหนด interface สำหรับผลการตรวจสอบแต่ละตัว (Indicator)
  interface CheckboxResults {
    chemical_external?: string | boolean;
    chemical_internal?: string | boolean;
    mechanical?: string | boolean;
    biological?: string | boolean;
  }

  // Import SterilizerEntry type from dbService
  type SterilizerEntry = import('@/dbService').SterilizerEntry;
  
  // Extend the type to include our computed fields
  interface DashboardEntry extends Omit<SterilizerEntry, 'status' | 'created_at' | 'toDate'> {
    id: string;
    status: "PASS" | "FAIL" | "CANCEL";
    program_name: string;
    created_at: { toDate: () => Date } | undefined;
    checkboxResults: CheckboxResults;
    attest_table: any[];
    created_by: string;
    attest_sn: string;
    [key: string]: unknown; // Allow additional properties
  }
  
  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [role, setRole] = useState<string>("");
  const router = useRouter();
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<SterilizerEntry | null>(null);
  const unsubEntriesRef = useRef<null | (() => void)>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage] = useState(10);
  const [selectedProgram, setSelectedProgram] = useState<string>("ALL");
  const [selectedIndicators, setSelectedIndicators] = useState<(keyof CheckboxResults)[]>([]);
  const [expandedPrograms, setExpandedPrograms] = useState<Record<string, boolean>>({});
  const [isAttestTableExpanded, setIsAttestTableExpanded] = useState(true);
  const [isProgramDetailsExpanded, setIsProgramDetailsExpanded] = useState(true);

  // Toggle program expansion
  const toggleProgram = (programLabel: string) => {
    setExpandedPrograms(prev => ({
      ...prev,
      [programLabel]: !prev[programLabel]
    }));
  };

  const toggleAttestTable = () => {
    setIsAttestTableExpanded(!isAttestTableExpanded);
  };
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Refs for native date inputs so we can trigger the native picker while showing formatted value
  const dashboardStartDateRef = useRef<HTMLInputElement | null>(null);
  const dashboardEndDateRef = useRef<HTMLInputElement | null>(null);

  const formatToYyMmDd = (iso: string) => {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [yyyy, mm, dd] = parts;
    return `${yyyy}/${mm}/${dd}`;
  };
  // State for checkbox demo
  type CheckboxType = 'mechanical' | 'chemical_external' | 'chemical_internal';
  const [checkboxDemo] = useState<Record<CheckboxType, string>>({
    mechanical: 'unknown',
    chemical_external: 'unknown',
    chemical_internal: 'unknown',
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (!firebaseUser) {
        setTimeout(() => router.replace("/login"), 100);
      } else {
        // Get user role using dbService
        const userRole = await getUserRole(firebaseUser.uid);
        setRole(userRole);
      }
    });
    
    // Subscribe to sterilizer loads using dbService
    const unsubscribeFromSterilizerLoads = subscribeToSterilizerLoads(
      (entries) => {
        // Process entries to ensure they match our expected format
        const processedEntries: DashboardEntry[] = entries
          .filter((entry): entry is SterilizerEntry => !!entry.id) // Ensure we have valid entries with IDs
          .map(entry => {
            // Get the status first to ensure it's valid
            const status = getEntryStatus(entry);
            
            // Format program name
            const programName = typeof entry.program_name === 'string' && entry.program_name
              ? entry.program_name
              : (typeof entry.program === 'string' ? entry.program : '');
            
            // Create the processed entry with proper typing
            const processedEntry: DashboardEntry = {
              ...entry,
              status,
              program_name: programName,
              created_at: entry.created_at || { toDate: () => new Date() }, // กำหนดค่าเริ่มต้นถ้าไม่มี
              checkboxResults: {
                chemical_external: entry.chemical_external ?? '',
                chemical_internal: entry.chemical_internal ?? '',
                mechanical: entry.mechanical ?? '',
                biological: entry.bio_test ?? ''
              },
              attest_table: Array.isArray(entry.attest_table) ? entry.attest_table : [],
              // Ensure these fields are always defined
              created_by: entry.created_by || '',
              attest_sn: entry.attest_sn || ''
            };
            
            return processedEntry;
          });
        
        console.log('Processed entries:', processedEntries.length);
        setEntries(processedEntries);
      },
      (error) => {
        console.error('Error in sterilizer loads subscription:', error);
        setErrorMsg('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      }
    );
    
    // Store unsubscribe function for cleanup
    unsubEntriesRef.current = unsubscribeFromSterilizerLoads;
    
    return () => {
      if (unsubEntriesRef.current) {
        unsubEntriesRef.current();
      }
      unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!loading && role && role !== 'admin' && typeof window !== 'undefined' && window.location.pathname !== '/history') {
      router.replace('/history');
    }
  }, [role, loading, router]);

  // คำนวณข้อมูล 1 เดือนล่าสุด
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  
  const recentEntries = entries.filter(entry => {
    if (entry.created_at && entry.created_at.toDate) {
      return entry.created_at.toDate() >= oneMonthAgo;
    }
    return false;
  });

  // คำนวณ pagination
  const indexOfLastEntry = currentPage * entriesPerPage;
  const indexOfFirstEntry = indexOfLastEntry - entriesPerPage;
  const currentEntries = recentEntries.slice(indexOfFirstEntry, indexOfLastEntry);
  const totalPages = Math.ceil(recentEntries.length / entriesPerPage);

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToPage = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const handleLogout = async () => {
    if (unsubEntriesRef.current) unsubEntriesRef.current();
    await signOut(auth);
    router.replace("/login");
  };

  // showDetail removed (unused)

  // ฟังก์ชันช่วยตรวจสอบค่าที่ถือว่า "ผ่าน"
  function isPass(val: any) {
    // For attest table, '-' means pass and '+' means fail
    if (val === '-') return true;
    if (val === '+') return false;
    
    // For other cases, use the original logic
    return (
      val === 'ผ่าน' ||
      val === 'PASS' ||
      val === 'checked' ||
      val === 'success' ||
      val === true ||
      val === 'true' ||
      val === 1
    );
  }

    // Custom date range filter (if selected)
  let filteredByDate = entries;
  if (startDate || endDate) {
    filteredByDate = entries.filter(e => {
      if (!e.created_at) return false;
      try {
        const d = e.created_at.toDate();
        const start = startDate ? new Date(startDate + 'T00:00:00') : null;
        const end = endDate ? new Date(endDate + 'T23:59:59') : null;
        if (start && end) return d >= start && d <= end;
        if (start) return d >= start;
        if (end) return d <= end;
        return true;
      } catch (error) {
        console.error('Error processing date:', e.created_at, error);
        return false;
      }
    });
  }

  // Filter entries based on selected program/indicator (ยังไม่ filter สถานะ)
  let filteredEntriesNoStatus = filteredByDate;
  if (selectedProgram !== "ALL") {
    filteredEntriesNoStatus = filteredEntriesNoStatus.filter(e => {
      if (selectedProgram === "Autoclave") {
        return e.program_name === "Autoclave" || e.program_name === "BOWIE" || e.program_name === "PREVAC";
      }
      return e.program_name === selectedProgram;
    });
  }
  if (selectedIndicators.length > 0) {
    filteredEntriesNoStatus = filteredEntriesNoStatus.filter(e => {
      const results: CheckboxResults = e.checkboxResults || {};
      return selectedIndicators.every(indicator => {
        const indicatorMap = {
          'CHEMICAL_EXTERNAL': 'chemical_external',
          'CHEMICAL_INTERNAL': 'chemical_internal',
          'MECHANICAL': 'mechanical',
          'BIOLOGICAL': 'biological'
        } as const;
        const indicatorKey = indicatorMap[indicator as keyof typeof indicatorMap];
        return isPass(results[indicatorKey]);
      });
    });
  }

  // คำนวณจำนวน pass/fail/total จาก filteredEntriesNoStatus (local unused counters removed)

  // Calculate analytics for each program
  const programAnalytics = MAIN_PROGRAMS.concat(AUTOCLAVE_SUBPROGRAMS).map(prog => 
    calculateProgramAnalytics(filteredEntriesNoStatus as AnalyticsSterilizerEntry[], prog.key)
  );

  // Calculate status counts for widgets
  const totalCount = filteredEntriesNoStatus.length;
  const passedCount = filteredEntriesNoStatus.filter(e => e.status === 'PASS').length;
  const failedCount = filteredEntriesNoStatus.filter(e => e.status === 'FAIL').length;
  const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

  // Calculate weekday usage (Monday-Sunday)
  const weekdays = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]; // Monday to Sunday
  
  filteredEntriesNoStatus.forEach(entry => {
    if (!entry.created_at) return;
    
    try {
      // Handle Firestore Timestamp
      const date = entry.created_at.toDate ? entry.created_at.toDate() : 
                 (entry.created_at instanceof Date ? entry.created_at : new Date(String(entry.created_at)));
      
      // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      const dayOfWeek = date.getDay();
      
      // Convert day of week to array index (0=Monday, 1=Tuesday, ..., 6=Sunday)
      const index = (dayOfWeek + 6) % 7; // Convert Sunday (0) to 6, Monday (1) to 0, etc.
      weekdayCounts[index]++;
    } catch (error) {
      console.error('Error processing entry date:', entry.created_at, error);
    }
  });

  // Prepare chart data
  const chartData: ProgramAnalyticsData = {
    labels: programAnalytics.map(p => p.label),
    successRates: programAnalytics.map(p => p.successRate),
    avgDurations: programAnalytics.map(p => p.avgTime),
    totalCounts: programAnalytics.map(p => p.total),
    weekdays: {
      labels: weekdays,
      counts: weekdayCounts
    }
  };

  // --- สรุป attest_table ---
  // AttestSummary type removed (unused)
  // Calculate attest table summaries with date filtering
  const calculateAttestSummary = (allEntries: DashboardEntry[], sn: string) => {
    const summary = Array(10).fill(0).map(() => ({
      used: 0,
      pass: 0,
      fail: 0,
      passRate: 0
    }));

    // Filter entries by date range first
    const filteredEntries = allEntries.filter(entry => {
      if (!entry.created_at) return false;
      try {
        const entryDate = entry.created_at.toDate();
        const start = startDate ? new Date(startDate + 'T00:00:00') : null;
        const end = endDate ? new Date(endDate + 'T23:59:59') : null;
        if (start && end) return entryDate >= start && entryDate <= end;
        if (start) return entryDate >= start;
        if (end) return entryDate <= end;
        return true;
      } catch (error) {
        console.error('Error processing date:', entry.created_at, error);
        return false;
      }
    });

    // Process only the date-filtered entries
    filteredEntries.forEach(entry => {
      if (entry.attest_sn === sn && Array.isArray(entry.attest_table)) {
        entry.attest_table.forEach((item, idx) => {
          if (idx < 10) { // Only process first 10 slots
            if (item) {
              summary[idx].used++;
              if (isPass(item)) {
                summary[idx].pass++;
              } else {
                summary[idx].fail++;
              }
              summary[idx].passRate = summary[idx].used > 0 
                ? (summary[idx].pass / summary[idx].used) * 100 
                : 0;
            }
          }
        });
      }
    });

    return summary;
  };

  // attest summary calculations removed (unused)

  if (loading || (role && role !== 'admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-blue-300 to-blue-500">
        <div className="text-blue-900 text-xl font-semibold animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 via-blue-300 to-blue-500 p-4">
      <div className="w-full max-w-6xl bg-white/90 rounded-3xl shadow-2xl mt-10 p-8 flex flex-col items-center border border-white/30 backdrop-blur-xl relative">
        <div className="w-full flex justify-end mb-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-end sm:items-center">
            <div className="bg-blue-100 text-blue-800 rounded-full px-4 sm:px-6 py-2 font-semibold shadow flex items-center justify-center gap-2 text-sm sm:text-base">
              <span className="text-lg sm:text-xl">👤</span>
              <span className="truncate max-w-[180px] sm:max-w-xs">{user?.displayName || user?.email}</span>
            </div>
            <div className="flex flex-row gap-2 sm:gap-3 w-full sm:w-auto">
              <Link 
                href="/history" 
                className="px-4 sm:px-6 py-2 rounded-full bg-blue-500 hover:bg-blue-700 text-white font-semibold shadow transition-all text-center text-sm sm:text-base whitespace-nowrap"
              >
                History
              </Link>
              <button
                onClick={handleLogout}
                className="px-4 sm:px-6 py-2 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold shadow hover:from-red-700 hover:to-pink-600 transition-all text-sm sm:text-base whitespace-nowrap"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
        {/* Header section: logo left, title right */}
        <div className="w-full flex flex-row items-center mb-4">
          <div className="w-40 h-40 relative mr-4">
            <Image src="/ram-logo.jpg" alt="Sterilizer Logo" fill className="object-contain drop-shadow-xl bg-white rounded-2xl p-2" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 drop-shadow text-center">
              <span className="text-sky-400">Central Supply Sterile Quality</span>{' '}
              <span className="text-blue-700">information system</span>
            </h1>
            <p className="text-lg md:text-xl text-cyan-600 mb-4 text-center">ระบบข้อมูลการติดตามคุณภาพการทำฆ่าเชื้ออุปกรณ์เวชภัณฑ์ทางการแพทย์</p>
          </div>
        </div>
        {/* Status Widgets - Enhanced */}
        <div className="w-full mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Total Rounds Widget */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl shadow-xl p-8 flex flex-col items-center w-full border border-blue-100">
              <div className="text-5xl font-extrabold text-blue-600 mb-2">{totalCount}</div>
              <div className="text-xl font-medium text-blue-700 mb-5">Total Rounds</div>
              <div className="w-4/5 bg-white/50 rounded-full h-3.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full" 
                  style={{ width: '100%' }}
                ></div>
              </div>
              <div className="mt-4 text-sm font-medium text-blue-700/80">All sterilization cycles</div>
            </div>

            {/* Passed Widget */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl shadow-xl p-8 flex flex-col items-center w-full border border-green-100">
              <div className="text-5xl font-extrabold text-green-600 mb-2">{passedCount}</div>
              <div className="text-xl font-medium text-green-700 mb-5">Passed</div>
              <div className="w-4/5 bg-white/50 rounded-full h-3.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-green-400 to-green-500 h-full rounded-full" 
                  style={{ width: `${passRate}%` }}
                ></div>
              </div>
              <div className="mt-4 text-base font-medium text-green-700/80">
                {passRate}% Success Rate
              </div>
            </div>

            {/* Failed Widget */}
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-2xl shadow-xl p-8 flex flex-col items-center w-full border border-red-100">
              <div className="text-5xl font-extrabold text-red-600 mb-2">{failedCount}</div>
              <div className="text-xl font-medium text-red-700 mb-5">Failed</div>
              <div className="w-4/5 bg-white/50 rounded-full h-3.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-red-400 to-red-500 h-full rounded-full" 
                  style={{ width: totalCount > 0 ? `${(failedCount / totalCount) * 100}%` : '0%' }}
                ></div>
              </div>
              <div className="mt-4 text-base font-medium text-red-700/80">
                {totalCount > 0 ? Math.round((failedCount / totalCount) * 100) : 0}% Failure Rate
              </div>
            </div>
          </div>

          {/* Date Filter */}
          <div className="w-full mb-10">
            <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col gap-4 md:gap-6 border border-blue-100">
              <h3 className="text-xl md:text-2xl font-bold text-blue-800 mb-2 flex items-center gap-2">
                <span className="inline-block text-2xl">📅</span> กรองข้อมูลตามช่วงวันที่
              </h3>
              
              {/* Quick Date Filter Buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setStartDate(today);
                    setEndDate(today);
                  }}
                  className="px-3 py-1.5 text-sm font-medium bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                >
                  วันนี้
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    const firstDayOfWeek = new Date(today);
                    firstDayOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)); // Monday
                    setStartDate(firstDayOfWeek.toISOString().split('T')[0]);
                    setEndDate(today.toISOString().split('T')[0]);
                  }}
                  className="px-3 py-1.5 text-sm font-medium bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg transition-colors"
                >
                  สัปดาห์นี้
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    setStartDate(firstDayOfMonth.toISOString().split('T')[0]);
                    setEndDate(today.toISOString().split('T')[0]);
                  }}
                  className="px-3 py-1.5 text-sm font-medium bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                >
                  เดือนนี้
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
                    setStartDate(firstDayOfYear.toISOString().split('T')[0]);
                    setEndDate(today.toISOString().split('T')[0]);
                  }}
                  className="px-3 py-1.5 text-sm font-medium bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded-lg transition-colors"
                >
                  ปีนี้
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 w-full">
                <div className="flex items-center gap-2 w-full">
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={() => dashboardStartDateRef.current?.showPicker ? dashboardStartDateRef.current.showPicker() : dashboardStartDateRef.current?.click()}
                      className="w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-xl border border-gray-300 bg-white text-sm sm:text-base text-black shadow-sm"
                    >
                      {formatToYyMmDd(startDate) || 'yyyy/mm/dd'}
                    </button>
                    <input
                      ref={dashboardStartDateRef}
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      max={endDate || undefined}
                      className="absolute inset-0 w-0 h-0 opacity-0 pointer-events-none"
                      aria-hidden="true"
                    />
                  </div>
                  <span className="text-gray-500 text-base font-bold hidden sm:inline">-</span>
                </div>
                <div className="flex items-center gap-2 w-full">
                  <span className="text-gray-500 text-base font-bold sm:hidden">ถึง</span>
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={() => dashboardEndDateRef.current?.showPicker ? dashboardEndDateRef.current.showPicker() : dashboardEndDateRef.current?.click()}
                      className="w-full text-left px-3 sm:px-4 py-2 sm:py-3 rounded-xl border border-gray-300 bg-white text-sm sm:text-base text-black shadow-sm"
                    >
                      {formatToYyMmDd(endDate) || 'yyyy/mm/dd'}
                    </button>
                    <input
                      ref={dashboardEndDateRef}
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      min={startDate || undefined}
                      className="absolute inset-0 w-0 h-0 opacity-0 pointer-events-none"
                      aria-hidden="true"
                    />
                  </div>
                  {(startDate || endDate) && (
                    <button
                      className="px-3 sm:px-4 py-2 bg-gray-100 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl text-sm sm:text-base shadow transition-all duration-150 whitespace-nowrap"
                      onClick={() => { setStartDate(''); setEndDate(''); }}
                    >
                      ล้าง
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Analytics Chart */}
          <div className="w-full mb-8">
            <ProgramAnalyticsChart data={chartData} />
          </div>
        </div>

        {/* Average Time Card (show only when a single program is selected) */}
        {selectedProgram !== 'ALL' && (() => {
          // DEBUG LOG: ดู entries, selectedProgram, และ avgTime
          const filteredEntries = entries.filter(e => {
            // ใช้ getProgramGroup logic เดียวกับ calculateProgramAnalytics
            if (selectedProgram === 'Autoclave') {
              return ['Autoclave', 'BOWIE', 'PREVAC'].includes((e.program_name || '').toUpperCase());
            }
            return (e.program_name || '').toUpperCase() === selectedProgram.toUpperCase();
          });
          console.log('[DEBUG] selectedProgram:', selectedProgram);
          console.log('[DEBUG] entries for avgTime:', filteredEntries);
          if (filteredEntries.length > 0) {
            console.log('[DEBUG] entries[0] full:', filteredEntries[0]);
          }
          filteredEntries.forEach((e, i) => {
            console.log(`[DEBUG] entry[${i}] duration_min:`, e.duration_min, 'sterilization_time:', e.sterilization_time);
          });
          const prog = programAnalytics.find(p => p.label === selectedProgram || p.label.startsWith(selectedProgram));
          console.log('[DEBUG] avgTime for program:', prog?.avgTime);
          return prog ? (
            <div className="w-full mb-8 flex justify-center">
              <div className="bg-yellow-400 text-white rounded-xl shadow-lg p-6 flex flex-col items-center min-w-[180px]">
                <div className="text-3xl font-bold">{prog.avgTime}</div>
                <div className="text-sm mt-2">เวลาเฉลี่ย (นาที)</div>
              </div>
            </div>
          ) : null;
        })()}

        {/* Collapsible Program Details Table */}
        <div className="w-full mb-12">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
            {/* Table Header */}
            <button 
              onClick={() => setIsProgramDetailsExpanded(!isProgramDetailsExpanded)}
              className="w-full px-6 py-4 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors flex justify-between items-center bg-gradient-to-r from-sky-100 to-blue-100 border-b border-blue-100"
              aria-expanded={isProgramDetailsExpanded}
            >
              <h3 className="text-xl font-bold text-sky-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                รายละเอียดตามโปรแกรม
              </h3>
              <svg 
                className={`w-5 h-5 text-sky-800 transform transition-transform ${isProgramDetailsExpanded ? 'rotate-180' : ''}`}
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* Program List */}
            <div className={`divide-y divide-gray-200 transition-all duration-300 ease-in-out ${isProgramDetailsExpanded ? 'block' : 'hidden'}`}>
              {programAnalytics.map((prog, index) => {
                const isExpanded = expandedPrograms[prog.label] || false;
                
                return (
                  <div key={index} className="border-b border-gray-200 last:border-b-0">
                    {/* Program Summary Row */}
                    <button 
                      onClick={() => toggleProgram(prog.label)}
                      className="w-full px-6 py-4 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors flex justify-between items-center"
                      aria-expanded={isExpanded}
                      aria-controls={`program-details-${index}`}
                    >
                      <div className="flex items-center">
                        <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-3"></span>
                        <span className="font-medium text-gray-900">{prog.label}</span>
                      </div>
                      
                      <div className="flex items-center space-x-6">
                        <div className="flex flex-col items-center">
                          <span className="text-sm text-gray-500">จำนวนรอบ</span>
                          <span className="font-medium text-gray-900">{prog.total}</span>
                        </div>
                        
                        <div className="flex flex-col items-center">
                          <span className="text-sm text-gray-500">อัตราความสำเร็จ</span>
                          <span className={`font-medium ${
                            prog.successRate >= 90 ? 'text-green-600' :
                            prog.successRate >= 70 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {prog.successRate}%
                          </span>
                        </div>
                        
                        <svg 
                          className={`w-5 h-5 text-gray-500 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    
                    {/* Collapsible Details */}
                    <div 
                      id={`program-details-${index}`}
                      className={`px-6 pb-4 pt-2 bg-gray-50 transition-all duration-300 ease-in-out ${isExpanded ? 'block' : 'hidden'}`}
                      aria-hidden={!isExpanded}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
                        {/* Success Rate */}
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                          <h4 className="font-medium text-gray-700 mb-2">อัตราความสำเร็จ</h4>
                          <div className={`flex items-center justify-center w-16 h-16 rounded-full mx-auto ${
                            prog.successRate >= 90 ? 'bg-green-100 text-green-800' :
                            prog.successRate >= 70 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            <span className="text-xl font-bold">{prog.successRate}%</span>
                          </div>
                        </div>
                        
                        {/* Total Rounds */}
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                          <h4 className="font-medium text-gray-700 mb-2">จำนวนรอบ</h4>
                          <div className="text-3xl font-bold text-blue-600 text-center">
                            {prog.total}
                          </div>
                        </div>
                        
                        {/* Indicators */}
                        {[
                          { key: 'mechanical', label: 'กลไก' },
                          { key: 'biological', label: 'ชีวภาพ' },
                          { key: 'chemical_external', label: 'เทปเคมีภายนอก' },
                          { key: 'chemical_internal', label: 'เทปเคมีภายใน' }
                        ].map(({ key, label }) => (
                          <div key={key} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                            <h4 className="font-medium text-gray-700 mb-2">{label}</h4>
                            <div className="flex justify-center items-center space-x-2">
                              <div className="text-center">
                                <div className="text-green-600 font-medium">
                                  {prog.indicatorStats?.[key]?.pass ?? 0}
                                </div>
                                <div className="text-xs text-gray-500">ผ่าน</div>
                              </div>
                              <div className="text-gray-300">/</div>
                              <div className="text-center">
                                <div className="text-red-600 font-medium">
                                  {prog.indicatorStats?.[key]?.fail ?? 0}
                                </div>
                                <div className="text-xs text-gray-500">ไม่ผ่าน</div>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* Average Time */}
                        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                          <h4 className="font-medium text-gray-700 mb-2">เวลาเฉลี่ย</h4>
                          <div className="text-3xl font-bold text-purple-600 text-center">
                            {prog.avgTime}
                          </div>
                          <div className="text-xs text-gray-500 text-center mt-1">นาที</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        
                  
      </div>
      <div className="mt-8 text-white/80 text-center text-sm">
        &copy; {new Date().getFullYear()} Sterilizer Data System | For Hospital Use
      </div>
    </div>
  );
}