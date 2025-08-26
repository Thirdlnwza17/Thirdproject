'use client';

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut as firebaseSignOut, onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import Link from "next/link";
import Image from 'next/image';
import { 
  getUserRole, 
  subscribeToSterilizerLoads, 
  logAuditAction,
  deleteLog as deleteLogService,
  updateLog as updateLogService,
  signOutUser
} from "@/dbService";

import { MAIN_PROGRAMS, AUTOCLAVE_SUBPROGRAMS } from "./constants";
import ProgramAnalyticsChart, { ProgramAnalyticsData } from "./ProgramAnalyticsChart";
import { calculateProgramAnalytics, SterilizerEntry as AnalyticsSterilizerEntry } from "./analyticsService";

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
        className="flex items-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-full px-4 py-2 font-semibold shadow transition-colors"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-blue-300">
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
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
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
  const unsubEntriesRef = useRef<null | (() => void)>(null);
  const [entriesPerPage] = useState(10);
  const [selectedProgram] = useState<string>("ALL");
  const [selectedIndicators] = useState<(keyof CheckboxResults)[]>([]);
  const [expandedPrograms, setExpandedPrograms] = useState<Record<string, boolean>>({});
  const [isProgramDetailsExpanded, setIsProgramDetailsExpanded] = useState(true);
  // Toggle program expansion
  const toggleProgram = (programLabel: string) => {
    setExpandedPrograms(prev => ({
      ...prev,
      [programLabel]: !prev[programLabel]
    }));
  };

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

  // Pagination removed as it wasn't being used in the UI

  const handleLogout = async () => {
    try {
      // Get current user before signing out
      const currentUser = auth.currentUser;
      const userId = currentUser?.uid || '';
      const userEmail = currentUser?.email || 'unknown';
      
      // Unsubscribe from any listeners
      if (unsubEntriesRef.current) unsubEntriesRef.current();
      
      // Sign out using the service which will handle audit logging
      await signOutUser(userId, userEmail, role);
      
      // Redirect to login page
      router.replace('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
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
        <div className="w-full flex justify-between items-center mb-4">
          <div className="flex-1">
            {/* Empty div to push user controls to the right */}
          </div>
          <div className="flex items-center gap-3">
            <Link 
              href="/history" 
              className="px-4 sm:px-6 py-2 rounded-full bg-blue-500 hover:bg-blue-700 text-white font-semibold shadow transition-all text-center text-sm sm:text-base whitespace-nowrap"
            >
              History
            </Link>
            <UserDropdown user={user} role={role} onLogout={handleLogout} />
          </div>
        </div>
        {/* Header section: logo left, title right */}
        <div className="w-full flex flex-row items-center mb-4">
          <div className="mr-4">
            <Link href="/history">
              <img 
                src="/ram-logo.jpg" 
                alt="RAM Hospital" 
                className="w-50 h-35 object-contain hover:opacity-90 transition-opacity cursor-pointer"
              />
            </Link>
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 drop-shadow text-center">
              <span className="text-sky-400">Central Supply Sterile Quality</span>{' '}
              <span className="text-blue-700">information system</span>
            </h1>
            <p className="text-lg md:text-xl text-cyan-600 mb-4 text-center">ระบบข้อมูลการติดตามคุณภาพการทำฆ่าเชื้ออุปกรณ์เวชภัณฑ์ทางการแพทย์</p>
          </div>
        </div>
        
          {/* Date Filter */}
          <div className="w-full mb-6">
            <div className="bg-white rounded-xl shadow-lg p-4 md:p-5 flex flex-col gap-3 border border-blue-50">
              <h3 className="text-sm md:text-base font-bold text-blue-700 mb-1.5 flex items-center gap-1.5">
                <span className="inline-block text-base">📅</span> กรองข้อมูลตามช่วงวันที่
              </h3>
              
              {/* Quick Date Filter Buttons */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setStartDate(today);
                    setEndDate(today);
                  }}
                  className="px-2.5 py-1 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md transition-colors border border-blue-100"
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
                  className="px-2.5 py-1 text-xs font-medium bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md transition-colors border border-purple-100"
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
                  className="px-2.5 py-1 text-xs font-medium bg-green-50 hover:bg-green-100 text-green-700 rounded-md transition-colors border border-green-100"
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
                  className="px-2.5 py-1 text-xs font-medium bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-md transition-colors border border-yellow-100"
                >
                  ปีนี้
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <div className="flex items-center gap-1 w-full">
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={() => dashboardStartDateRef.current?.showPicker ? dashboardStartDateRef.current.showPicker() : dashboardStartDateRef.current?.click()}
                      className="w-full text-left px-2 sm:px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs sm:text-sm text-black shadow-sm hover:bg-gray-50 transition-colors"
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
                  <span className="text-gray-500 text-sm font-bold hidden sm:inline">-</span>
                </div>
                <div className="flex items-center gap-1 w-full">
                  <span className="text-gray-500 text-xs font-medium sm:hidden">ถึง</span>
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={() => dashboardEndDateRef.current?.showPicker ? dashboardEndDateRef.current.showPicker() : dashboardEndDateRef.current?.click()}
                      className="w-full text-left px-2 sm:px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs sm:text-sm text-black shadow-sm hover:bg-gray-50 transition-colors"
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
                      className="px-2 sm:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg text-xs sm:text-sm shadow transition-all duration-150 whitespace-nowrap"
                      onClick={() => { setStartDate(''); setEndDate(''); }}
                    >
                      ล้าง
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        {/* Status Widgets - Enhanced */}
        <div className="w-full mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Rounds Widget */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-4 flex flex-col items-center w-full border border-blue-50">
              <div className="text-4xl font-extrabold text-blue-600">{totalCount}</div>
              <div className="text-lg font-medium text-blue-700 mb-3">Total Rounds</div>
              <div className="w-4/5 bg-white/50 rounded-full h-2.5 overflow-hidden mb-2">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full" 
                  style={{ width: '100%' }}
                ></div>
              </div>
              <div className="text-xs text-blue-700/70">All sterilization cycles</div>
            </div>

            {/* Passed Widget */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-lg p-4 flex flex-col items-center w-full border border-green-50">
              <div className="text-4xl font-extrabold text-green-600">{passedCount}</div>
              <div className="text-lg font-medium text-green-700 mb-3">Passed</div>
              <div className="w-4/5 bg-white/50 rounded-full h-2.5 overflow-hidden mb-2">
                <div 
                  className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full" 
                  style={{ width: `${passRate}%` }}
                ></div>
              </div>
              <div className="text-xs text-green-700/70">
                {Math.min(100, passRate)}% Success Rate
              </div>
            </div>

            {/* Failed Widget */}
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl shadow-lg p-4 flex flex-col items-center w-full border border-red-50">
              <div className="text-4xl font-extrabold text-red-600">{failedCount}</div>
              <div className="text-lg font-medium text-red-700 mb-3">Failed</div>
              <div className="w-4/5 bg-white/50 rounded-full h-2.5 overflow-hidden mb-2">
                <div 
                  className="bg-gradient-to-r from-red-500 to-red-600 h-full rounded-full" 
                  style={{ width: totalCount > 0 ? `${(failedCount / totalCount) * 100}%` : '0%' }}
                ></div>
              </div>
              <div className="text-xs text-red-700/70">
                {totalCount > 0 ? Math.min(100, Math.round((failedCount / totalCount) * 100)) : 0}% Failure Rate
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

        {/* Enhanced Program Details Section */}
        <div className="w-full mb-12">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
            {/* Section Header */}
            <button 
              onClick={() => setIsProgramDetailsExpanded(!isProgramDetailsExpanded)}
              className="w-full px-6 py-4 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-200 flex justify-between items-center bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-100"
              aria-expanded={isProgramDetailsExpanded}
            >
              <div className="flex items-center">
                <div className="bg-blue-600 p-2 rounded-lg mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-blue-900">รายละเอียดตามโปรแกรม</h3>
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-blue-700 mr-2">
                  {isProgramDetailsExpanded ? 'ซ่อนรายละเอียด' : 'แสดงรายละเอียด'}
                </span>
                <svg 
                  className={`w-5 h-5 text-blue-700 transform transition-transform duration-200 ${isProgramDetailsExpanded ? 'rotate-180' : ''}`}
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            
            {/* Program Cards Grid */}
            <div className={`p-6 transition-all duration-300 ease-in-out ${isProgramDetailsExpanded ? 'block' : 'hidden'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {programAnalytics.map((prog, index) => {
                  const isExpanded = expandedPrograms[prog.label] || false;
                  const indicatorIcons = {
                    mechanical: '⚙️',
                    biological: '🧪',
                    chemical_external: '🏷️',
                    chemical_internal: '🏷️'
                  };
                  
                  return (
                    <div key={index} className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow duration-200">
                      {/* Program Header */}
                      <div 
                        className="p-5 cursor-pointer border-b border-gray-100"
                        onClick={() => toggleProgram(prog.label)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800">{prog.label}</h3>
                            <p className="text-sm text-gray-500 mt-1">จำนวนรอบทั้งหมด: {prog.total}</p>
                          </div>
                          <div className="flex flex-col items-end">
                            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                              prog.successRate >= 90 ? 'bg-green-100 text-green-800' :
                              prog.successRate >= 70 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {Math.min(100, prog.successRate)}% ความสำเร็จ
                            </div>
                            <button className="mt-2 text-blue-600 text-sm font-medium flex items-center">
                              {isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
                              <svg 
                                className={`w-4 h-4 ml-1 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>ความสำเร็จ</span>
                            <span>{Math.min(100, prog.successRate)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-full rounded-full ${
                                prog.successRate >= 90 ? 'bg-green-500' :
                                prog.successRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(100, prog.successRate)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Collapsible Details */}
                      <div 
                        className={`px-5 pb-5 transition-all duration-300 ease-in-out ${isExpanded ? 'block' : 'hidden'}`}
                        aria-hidden={!isExpanded}
                      >
                        <div className="mt-4 space-y-4">
                          {/* Status Overview */}
                          <div className="bg-blue-50 p-4 rounded-lg">
                            <h4 className="font-medium text-blue-800 mb-2 flex items-center">
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                              </svg>
                              ภาพรวม
                            </h4>
                            <div className="grid grid-cols-2 gap-3 mt-2">
                              <div className="bg-white p-3 rounded-lg shadow-sm">
                                <div className="text-sm text-gray-500">เวลาเฉลี่ย</div>
                                <div className="text-xl font-bold text-blue-600">{prog.avgTime} <span className="text-sm font-normal text-gray-500">นาที</span></div>
                              </div>
                              <div className="bg-white p-3 rounded-lg shadow-sm">
                                <div className="text-sm text-gray-500">จำนวนรอบ</div>
                                <div className="text-xl font-bold text-blue-600">{prog.total} <span className="text-sm font-normal text-gray-500">รอบ</span></div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Indicators */}
                          <div>
                            <h4 className="font-medium text-gray-700 mb-3">ผลการตรวจสอบ</h4>
                            <div className="space-y-3">
                              {[
                                { key: 'mechanical', label: 'กลไก' },
                                { key: 'biological', label: 'ชีวภาพ' },
                                { key: 'chemical_external', label: 'เทปเคมีภายนอก' },
                                { key: 'chemical_internal', label: 'เทปเคมีภายใน' }
                              ].map(({ key, label }) => {
                                const passCount = prog.indicatorStats?.[key]?.pass ?? 0;
                                const failCount = prog.indicatorStats?.[key]?.fail ?? 0;
                                const total = passCount + failCount;
                                const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0;
                                
                                return (
                                  <div key={key} className="bg-gray-50 p-3 rounded-lg">
                                    <div className="flex justify-between items-center mb-1">
                                      <div className="flex items-center">
                                        <span className="mr-2">{indicatorIcons[key as keyof typeof indicatorIcons]}</span>
                                        <span className="text-sm font-medium">{label}</span>
                                      </div>
                                      <span className={`text-xs font-medium ${
                                        passRate === 100 ? 'text-green-600' : 'text-yellow-600'
                                      }`}>
                                        {Math.min(100, passRate)}%
                                      </span>
                                    </div>
                                    <div className="flex items-center text-xs text-gray-500">
                                      <span className="text-green-600 font-medium">{passCount} ผ่าน</span>
                                      <span className="mx-1">•</span>
                                      <span className="text-red-600 font-medium">{failCount} ไม่ผ่าน</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
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

        
                  
      </div>
      <div className="mt-8 text-white/80 text-center text-sm">
        &copy; {new Date().getFullYear()} Sterilizer Data System | For Hospital Use | Thirdlnwza
      </div>
    </div>
  );
}