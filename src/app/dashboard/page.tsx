'use client';

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from 'next/image';
import { VercelDateRangePicker } from "@/components/VercelDateRangePicker";
import { 
  getUserRole, 
  subscribeToSterilizerLoads, 
  logAuditAction,
  deleteLog as deleteLogService,
  updateLog as updateLogService,
  signOutUser,
  firebaseSignOut,
  firebaseAuthStateChanged as onAuthStateChanged,
  FirebaseUser as User,
  auth
} from "@/dbService";

import { MAIN_PROGRAMS, AUTOCLAVE_SUBPROGRAMS } from "./constants";
import ProgramAnalyticsChart, { ProgramAnalyticsData } from "./ProgramAnalyticsChart";
import { calculateProgramAnalytics, SterilizerEntry as AnalyticsSterilizerEntry, ProgramAnalytics } from "./analyticsService";
import BubbleBackground from "@/components/BubbleBackground";

// Dashboard Card Component
const DashboardCard = ({ 
  title, 
  children, 
  className = '' 
}: { 
  title?: string; 
  children: React.ReactNode; 
  className?: string; 
}) => (
  <div className={`bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden ${className}`}>
    {title && (
      <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-100">
        <h3 className="text-xl font-bold text-blue-900">{title}</h3>
      </div>
    )}
    <div className="p-6">
      {children}
    </div>
  </div>
);


const UserDropdown = ({ user, role, onLogout }: { user: User | null, role: string, onLogout: () => void }) => {
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
        className="flex items-center gap-3 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-full px-4 py-1.5 font-medium shadow transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden border-2 border-blue-300">
          <Image 
            src="/Instigator.jpg" 
            alt="User" 
            width={32} 
            height={32}
            className="w-full h-full object-cover"
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
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-all duration-300 transform hover:-translate-y-0.5"
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
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};



// Type for test results that we expect to work with
type TestResultValue = 'ผ่าน' | 'ไม่ผ่าน' | string | boolean | undefined;

// Type for objects that can be checked for test results
type TestResults = {
  mechanical?: TestResultValue;
  chemical_external?: TestResultValue;
  chemical_internal?: TestResultValue;
  bio_test?: TestResultValue;
  status?: string | boolean | number;
  [key: string]: unknown; // Allow additional properties
};

// Type guard to check if an object has test result fields
function hasTestResultFields(data: unknown): data is TestResults {
  if (typeof data !== 'object' || data === null) return false;
  
  const testFields = ['mechanical', 'chemical_external', 'chemical_internal', 'bio_test'];
  return testFields.some(field => field in data);
}

function normalizeStatus(status: string | boolean | number | undefined | null): "PASS" | "FAIL" | "CANCEL" {
  if (status === undefined || status === null) return "FAIL";
  if (status === "PASS" || status === "ผ่าน" || status === true || status === 1) return "PASS";
  if (status === "FAIL" || status === "ไม่ผ่าน" || status === false || status === 0) return "FAIL";
  if (status === "CANCEL" || status === "ยกเลิก") return "CANCEL";
  return "FAIL"; // fallback
}

// ตรวจสอบว่ามีการเลือกผลการทดสอบหรือไม่
function hasTestResults(data: unknown): boolean {
  if (!hasTestResultFields(data)) return false;
  
  const checkField = (value: TestResultValue | undefined): boolean => {
    if (value === undefined) return false;
    if (typeof value === 'boolean') return true;
    return value === 'ผ่าน' || value === 'ไม่ผ่าน';
  };
  
  return (
    checkField(data.mechanical) ||
    checkField(data.chemical_external) ||
    checkField(data.chemical_internal) ||
    checkField(data.bio_test)
  );
}

// Convert a test result value to a normalized string
const normalizeTestResult = (value: TestResultValue | undefined): string => {
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'ผ่าน' : 'ไม่ผ่าน';
  return value;
};

// ถ้า indicator ตัวใด "ไม่ผ่าน" ให้ถือว่า FAIL
function getEntryStatus(data: unknown): "PASS" | "FAIL" | "CANCEL" | "NONE" {
  // ถ้าไม่มีการเลือกผลการทดสอบเลย ให้คืนค่า NONE
  if (!hasTestResults(data)) {
    return "NONE";
  }
  
  // Ensure data has the expected shape
  if (!hasTestResultFields(data)) {
    return "NONE";
  }
  
  // Convert all test results to strings for comparison
  const testResults = {
    bio_test: normalizeTestResult(data.bio_test),
    mechanical: normalizeTestResult(data.mechanical),
    chemical_external: normalizeTestResult(data.chemical_external),
    chemical_internal: normalizeTestResult(data.chemical_internal)
  };
  
  // Check if  test has failed
  if (Object.values(testResults).some(result => result === 'ไม่ผ่าน')) {
    return "FAIL";
  }
  
  // If no tests have failed, check the status field
  const statusValue = typeof data.status === 'boolean' 
    ? (data.status ? 'PASS' : 'FAIL') 
    : data.status;
    
  return normalizeStatus(statusValue || 'NONE');
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

  // Import the base SterilizerEntry type from dbService
  type SterilizerEntry = import('@/dbService').SterilizerEntry;
  
  // Extend the type to include our computed fields
  interface DashboardEntry extends Omit<SterilizerEntry, 'status' | 'created_at' | 'toDate'> {
    id: string;
    status: "PASS" | "FAIL" | "CANCEL" | "NONE";
    program_name: string;
    created_at: { toDate: () => Date } | undefined;
    checkboxResults: CheckboxResults;

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
  const [isProgramDetailsExpanded, setIsProgramDetailsExpanded] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });

  const handleDateRangeChange = useCallback((range: { startDate: string; endDate: string }) => {
    setDateRange(range);
  }, []);

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
        try {
          // Get user role using email
          console.log('Getting role for user:', firebaseUser.email);
          const userRole = await getUserRole(firebaseUser.email || firebaseUser.uid);
          console.log('User role:', userRole);
          setRole(userRole);
          
          // If user is not admin, redirect to history
          if (userRole !== 'admin') {
            console.log('Non-admin user, redirecting to /history');
            router.replace('/history');
          }
        } catch (error) {
          console.error('Error getting user role:', error);
          // Default to operator role on error
          setRole('operator');
          router.replace('/history');
        }
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
          })
          .filter(entry => entry.status !== 'NONE'); // กรองข้อมูลที่มีสถานะ NONE ออก
        
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
      
      // Unsubscribe from  listeners
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
  

    // Custom date range filter (if selected)
  let filteredByDate = entries;
  if (dateRange.startDate || dateRange.endDate) {
    filteredByDate = entries.filter(e => {
      if (!e.created_at) return false;
      try {
        const d = e.created_at.toDate();
        const start = dateRange.startDate ? new Date(dateRange.startDate + 'T00:00:00') : null;
        const end = dateRange.endDate ? new Date(dateRange.endDate + 'T23:59:59') : null;
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
    totalCounts: programAnalytics.map(p => p.total)
  };

  // Prepare weekday data for pie chart
  const weekdayData = {
    labels: weekdays,
    counts: weekdayCounts
  };

  if (loading || (role && role !== 'admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200 relative overflow-hidden">
        <BubbleBackground />
        <div className="text-blue-900 text-xl font-semibold animate-pulse relative z-10">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-4 relative overflow-hidden bg-transparent">
      <BubbleBackground />
      <div className="w-full max-w-6xl bg-white/90 rounded-3xl shadow-2xl mt-4 p-8 flex flex-col items-center border border-white/30 backdrop-blur-xl relative z-10">
        <div className="w-full flex justify-between items-center mb-4">
          <div className="flex-1">
            {/* Empty div to push user controls to the right */}
          </div>
          <div className="flex items-center gap-3">
            <Link 
              href="/history" 
              className="px-4 sm:px-6 py-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold shadow-md transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 hover:shadow-lg text-center text-sm sm:text-base whitespace-nowrap"
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
                className="w-45 h-35 object-contain hover:opacity-90 transition-opacity cursor-pointer"
              />
            </Link>
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 drop-shadow text-center">
              <span className="text-sky-400">Central Supply Sterile Quality</span>{' '}
              <span className="text-blue-700">information system</span>
            </h1>
            <p className="text-lg md:text-xl text-cyan-600 mb-4 text-center">ระบบข้อมูลการติดตามคุณภาพของการฆ่าเชื้ออุปกรณ์เวชภัณฑ์ทางการแพทย์</p>
          </div>
        </div>
        
          {/* Date Range Picker - Left Aligned */}
          <div className="mb-6 w-full">
            <div className="flex justify-start">
              <div className="w-auto">
                <VercelDateRangePicker
                  onDateRangeChange={handleDateRangeChange}
                  initialRange={dateRange}
                />
              </div>
            </div>
          </div>
        


          {/* Small Status Widgets */}
          <div className="w-full mb-4">
            <div className="grid grid-cols-3 gap-3">
              {/* Total Rounds Widget */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-sm p-4 flex flex-col items-center border border-blue-50">
                <div className="text-3xl font-bold text-blue-600">{totalCount}</div>
                <div className="text-base font-medium text-blue-700 mb-3">Total Rounds</div>
                <div className="w-full bg-white/50 rounded-full h-2 overflow-hidden mb-2">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full" 
                    style={{ width: '100%' }}
                  ></div>
                </div>
                <div className="text-xs text-blue-700/70">All cycles</div>
              </div>

              {/* Passed Widget */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow-sm p-4 flex flex-col items-center border border-green-50">
                <div className="text-3xl font-bold text-green-600">{passedCount}</div>
                <div className="text-base font-medium text-green-700 mb-3">Passed</div>
                <div className="w-full bg-white/50 rounded-full h-2 overflow-hidden mb-2">
                  <div 
                    className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full" 
                    style={{ width: `${passRate}%` }}
                  ></div>
                </div>
                <div className="text-xs text-green-700/70">
                  {Math.min(100, passRate)}% Success
                </div>
              </div>

              {/* Failed Widget */}
              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg shadow-sm p-4 flex flex-col items-center border border-red-50">
                <div className="text-3xl font-bold text-red-600">{failedCount}</div>
                <div className="text-base font-medium text-red-700 mb-3">Failed</div>
                <div className="w-full bg-white/50 rounded-full h-2 overflow-hidden mb-2">
                  <div 
                    className="bg-gradient-to-r from-red-500 to-red-600 h-full rounded-full" 
                    style={{ width: totalCount > 0 ? `${(failedCount / totalCount) * 100}%` : '0%' }}
                  ></div>
                </div>
                <div className="text-xs text-red-700/70">
                  {totalCount > 0 ? Math.min(100, Math.round((failedCount / totalCount) * 100)) : 0}% Failure
                </div>
              </div>
            </div>
          </div>

          {/* Analytics Chart */}
          <div className="w-full mb-6">
            <div className="bg-white rounded-xl shadow-lg p-4 border border-blue-50">
              <div className="w-full" style={{ height: '450px' }}>
                <ProgramAnalyticsChart data={chartData} weekdayData={weekdayData} />
              </div>
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
                <div className="w-5 h-5 mr-3 rounded-full overflow-hidden ring-2 ring-white/60 shadow-sm">
                  <Image
                    src="/tux.jpg"
                    alt="โปรแกรมไอคอน"
                    width={20}
                    height={20}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-xl font-bold text-blue-900">รายละเอียดตามโปรแกรม</h3>
              </div>
              <div className="flex items-center">
              
              </div>
            </button>
            
            {/* Program Cards Grid - Horizontal Layout */}
            <div className="p-6">
              <div className="overflow-x-auto pb-4">
                <div className="inline-flex space-x-6 min-w-full">
                  {programAnalytics.map((prog, index) => {
                    const indicatorIcons = {
                      mechanical: '⚙️',
                      biological: '🧪',
                      chemical_external: '🏷️',
                      chemical_internal: '🏷️'
                    };
                    
                    return (
                      <div key={index} className="flex-none w-80 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
                        {/* Program Header */}
                        <div className="p-5 border-b border-gray-100">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-base font-semibold text-gray-800">{prog.label}</h3>
                              <p className="text-xs text-gray-500 mt-1">จำนวนรอบทั้งหมด: {prog.total}</p>
                            </div>
                            <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              prog.successRate >= 90 ? 'bg-green-100 text-green-800' :
                              prog.successRate >= 70 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {Math.min(100, prog.successRate)}%
                            </div>
                          </div>
                          
                          {/* Progress Bar */}
                          <div className="mt-3">
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
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
                        
                        {/* Indicators */}
                        <div className="p-4 space-y-3">
                          {[
                            { key: 'mechanical', label: 'กลไก' },
                            { key: 'biological', label: 'ชีวภาพ' },
                            { key: 'chemical_external', label: 'เทปภายนอก' },
                            { key: 'chemical_internal', label: 'เทปภายใน' }
                          ].map(({ key, label }) => {
                            const passCount = prog.indicatorStats?.[key]?.pass ?? 0;
                            const failCount = prog.indicatorStats?.[key]?.fail ?? 0;
                            const total = passCount + failCount;
                            const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0;
                            
                            return (
                              <div key={key} className="flex items-center justify-between text-sm">
                                <div className="flex items-center">
                                  <span className="mr-2 text-base">{indicatorIcons[key as keyof typeof indicatorIcons]}</span>
                                  <span className="text-gray-700">{label}</span>
                                </div>
                                <div className="flex items-center">
                                  <span className="text-green-600 font-medium text-xs">{passCount} ผ่าน</span>
                                  <span className="mx-1 text-gray-400">•</span>
                                  <span className="text-red-600 font-medium text-xs">{failCount} ไม่ผ่าน</span>
                                  <span className={`ml-2 text-xs font-medium w-10 text-right ${
                                    passRate === 100 ? 'text-green-600' : passRate > 0 ? 'text-yellow-600' : 'text-gray-400'
                                  }`}>
                                    {total > 0 ? `${passRate}%` : '-'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Average Time */}
                        <div className="border-t border-gray-100 p-3 bg-gray-50">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">เวลาเฉลี่ย:</span>
                            <span className="font-medium text-blue-600">{prog.avgTime} นาที</span>
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

        
                  
      </div>
      <div className="mt-8 text-black text-center text-sm">
        &copy; {new Date().getFullYear()} Sterilizer Data System | For Ram Hospital | Chitiwat Turmcher
      </div>
    </div>
  );
}