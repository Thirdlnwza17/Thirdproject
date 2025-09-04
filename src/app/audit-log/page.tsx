'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DocumentData, DocumentSnapshot } from 'firebase/firestore';

interface UserData {
  fullName: string;
  email?: string;
  role: string;
}

interface ChangeItem {
  action: string;
  // Add other properties if they exist in your change items
}

interface ChangeDetail {
  oldValue?: unknown;
  newValue?: unknown;
  _changes?: ChangeItem[];
}

interface AuditLogChanges extends Record<string, ChangeDetail | undefined> {
  sterilizer?: ChangeDetail;
  date?: ChangeDetail;
  items?: {
    _changes?: ChangeItem[];
  };
}

interface AuditLogDetails {
  changes?: AuditLogChanges;
  items?: {
    _changes?: ChangeItem[];
  };
  _changes?: ChangeItem[];
}

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  timestamp: { seconds: number; nanoseconds: number } | Date;
  details: AuditLogDetails;
  user?: UserData;
}

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getAuditLogs, subscribeToAuditLogs, AuditLogEntry } from '@/dbService';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

// Component for collapsible content
interface CollapsibleContentProps {
  content: string;
  maxLength?: number;
}

const CollapsibleContent: React.FC<CollapsibleContentProps> = ({ content, maxLength = 100 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!content) return null;
  
  const needsTruncation = content.length > maxLength;
  const displayContent = isExpanded ? content : needsTruncation ? `${content.substring(0, maxLength)}...` : content;
  
  return (
    <div>
      <div className="inline">
        {displayContent}
        {needsTruncation && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-600 hover:text-blue-800 text-sm ml-1 focus:outline-none"
          >
            {isExpanded ? ' [แสดงน้อยลง]' : ' [แสดงเพิ่มเติม]'}
          </button>
        )}
      </div>
    </div>
  );
};

interface Bubble {
  x: number;
  y: number;
  radius: number;
  dx: number;
  dy: number;
  alpha: number;
}

const ITEMS_PER_PAGE = 10;

export default function AuditLogPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<Record<string, { fullName: string, role: string }>>({});
  const [loading, setLoading] = useState(true);

  // Bubble animation effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();

    // Create bubbles
    const createBubbles = () => {
      const bubbles: Bubble[] = [];
      const bubbleCount = Math.floor((window.innerWidth * window.innerHeight) / 40000);
      
      for (let i = 0; i < bubbleCount; i++) {
        const radius = Math.random() * 20 + 10;
        bubbles.push({
          x: Math.random() * (canvas.width - radius * 2) + radius,
          y: Math.random() * (canvas.height - radius * 2) + radius,
          radius,
          dx: (Math.random() - 0.5) * 0.5,
          dy: (Math.random() - 0.5) * 0.5,
          alpha: Math.random() * 0.3 + 0.2
        });
      }
      return bubbles;
    };

    // Draw a bubble
    const drawBubble = (bubble: Bubble) => {
      if (!ctx) return;
      
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 230, 255, ${bubble.alpha})`;
      ctx.fill();
      
      // Add highlight
      ctx.beginPath();
      ctx.arc(
        bubble.x - bubble.radius * 0.3,
        bubble.y - bubble.radius * 0.3,
        bubble.radius * 0.4,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = `rgba(255, 255, 255, ${bubble.alpha * 0.6})`;
      ctx.fill();
    };

    // Update bubble positions
    const updateBubbles = () => {
      const bubbles = bubblesRef.current;
      
      for (let i = 0; i < bubbles.length; i++) {
        const bubble = bubbles[i];
        
        // Move bubble
        bubble.x += bubble.dx;
        bubble.y += bubble.dy;
        
        // Bounce off edges
        if (bubble.x - bubble.radius < 0 || bubble.x + bubble.radius > canvas.width) {
          bubble.dx = -bubble.dx;
        }
        if (bubble.y - bubble.radius < 0 || bubble.y + bubble.radius > canvas.height) {
          bubble.dy = -bubble.dy;
        }
        
        // Check collision with other bubbles
        for (let j = i + 1; j < bubbles.length; j++) {
          const otherBubble = bubbles[j];
          const dx = bubble.x - otherBubble.x;
          const dy = bubble.y - otherBubble.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < bubble.radius + otherBubble.radius) {
            // Simple elastic collision
            const angle = Math.atan2(dy, dx);
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            
            // Rotate velocities
            const vx1 = bubble.dx * cos + bubble.dy * sin;
            const vy1 = bubble.dy * cos - bubble.dx * sin;
            const vx2 = otherBubble.dx * cos + otherBubble.dy * sin;
            const vy2 = otherBubble.dy * cos - otherBubble.dx * sin;
            
            // Swap velocities
            bubble.dx = vx2 * cos - vy1 * sin;
            bubble.dy = vy1 * cos + vx2 * sin;
            otherBubble.dx = vx1 * cos - vy2 * sin;
            otherBubble.dy = vy2 * cos + vx1 * sin;
            
            // Move bubbles apart to prevent sticking
            const overlap = bubble.radius + otherBubble.radius - distance;
            const moveX = (overlap / 2) * Math.cos(angle);
            const moveY = (overlap / 2) * Math.sin(angle);
            
            bubble.x += moveX;
            bubble.y += moveY;
            otherBubble.x -= moveX;
            otherBubble.y -= moveY;
          }
        }
      }
    };

    // Animation loop
    const animate = () => {
      if (!ctx) return;
      
      // Clear with slight fade for trail effect
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Update and draw bubbles
      updateBubbles();
      bubblesRef.current.forEach(bubble => drawBubble(bubble));
      
      // Continue animation
      animationRef.current = requestAnimationFrame(animate);
    };

    // Handle window resize
    const handleResize = () => {
      resizeCanvas();
      bubblesRef.current = createBubbles();
    };

    // Initialize
    bubblesRef.current = createBubbles();
    animate();
    
    // Add event listeners
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  interface UserData {
    fullName: string;
    email?: string;
    role: string;
  }

  // Load users data
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const usersData: Record<string, UserData> = {};
        usersSnapshot.forEach((doc: DocumentData) => {
          const userData = doc.data();
          // Always store both email and fullName
          usersData[doc.id] = {
            fullName: userData.fullName || userData.displayName || userData.email?.split('@')[0] || 'Unknown User',
            email: userData.email,
            role: userData.role?.toLowerCase() === 'admin' ? 'admin' : 'operator' // Only 'admin' or 'operator' roles
          };
          // Also store user by email for lookup
          if (userData.email) {
            usersData[userData.email] = usersData[doc.id];
          }
        });
        setUsers(usersData);
      } catch (error) {
        console.error('Error loading users:', error);
      }
    };

    loadUsers();
  }, []);

  // Load initial logs
  useEffect(() => {
    const loadLogs = async () => {
      try {
        setLoading(true);
        const logs = await getAuditLogs(100);
        setLogs(logs);
      } catch (error) {
        console.error('Failed to load audit logs:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLogs();

    // Subscribe to real-time updates
    const unsubscribe = subscribeToAuditLogs((newLogs) => {
      setLogs(newLogs);
    });

    return () => unsubscribe();
  }, []);

  // Filter logs based on selected filter and search term
  const filteredLogs = logs.map(log => {
    // First try to find user by ID, then by email
    const userById = users[log.userId];
    const userByEmail = log.userEmail ? users[log.userEmail] : null;
    const user = userById || userByEmail || { 
      fullName: (log.details as AuditLogDetails & { userFullName?: string })?.userFullName || log.userEmail || 'ผู้ใช้ไม่ระบุ',
      role: log.userRole?.toLowerCase() === 'admin' ? 'admin' : 'operator'
    };
    
    return {
      ...log,
      resolvedUser: {
        fullName: user.fullName,
        role: user.role
      }
    };
  }).filter(log => {
    const userName = log.resolvedUser.fullName.toLowerCase();
    const userRole = log.resolvedUser.role;
    
    const matchesFilter = filter === 'all' || log.action === filter.toUpperCase();
    const matchesSearch = searchTerm === '' || 
      userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      userRole.includes(searchTerm.toLowerCase()) ||
      log.entityId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.details.message && log.details.message.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return matchesFilter && matchesSearch;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const goToPage = (page: number) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm]);

  // Format action text
  const getActionText = (log: AuditLogEntry) => {
    switch (log.action) {
      case 'CREATE':
        return 'สร้างรายการใหม่';
      case 'UPDATE':
        return 'อัปเดตรายการ';
      case 'DELETE':
        return 'ลบรายการ';
      case 'STATUS_CHANGE':
        return 'เปลี่ยนสถานะ';
      case 'LOGIN':
        return 'เข้าสู่ระบบ';
      case 'LOGOUT':
        return 'ออกจากระบบ';
      default:
        return log.action;
    }
  };

  // Format entity type
  const getEntityType = (type: string) => {
    switch (type) {
      case 'sterilizer_loads':
        return 'รายการทำความสะอาด';
      case 'users':
        return 'ผู้ใช้';
      case 'settings':
        return 'การตั้งค่าระบบ';
      default:
        return type;
    }
  };

  // Map field names to Thai labels
  const fieldLabels: Record<string, string> = {
    // General fields
    program: 'โปรแกรมการนึ่งฆ่าเชื้อ',
    sterilizer_number: 'หมายเลขเครื่องนึ่ง',
    cycle_number: 'รอบที่',
    load_number: 'Load ที่',
    operator: 'ผู้ปฏิบัติงาน',
    start_time: 'เวลาเริ่มต้น',
    end_time: 'เวลาสิ้นสุด',
    total_duration: 'ระยะเวลาทั้งหมด',
    temperature: 'อุณหภูมิ',
    pressure: 'ความดัน',
    mechanical: 'ผลตรวจสอบกลไก',
    chemical_external: 'ผลตรวจสอบสารเคมี (ภายนอก)',
    chemical_internal: 'ผลตรวจสอบสารเคมี (ภายใน)',
    bio_test: 'ผลตรวจสอบเชื้อทดสอบชีวภาพ',
    notes: 'หมายเหตุ',
    status: 'สถานะ',
    image_url_1: 'รูปภาพ Sterile Slip',
    image_url_2: 'รูปภาพ Attest',
    attest_sn: 'หมายเลขซีเรียล Attest',
    attest_time: 'เวลา Attest',
    items: 'รายการอุปกรณ์',
    prevac: 'Prevac',
    c134c: '134C',
    s9: 'S9',
    d20: 'D20',
  };

  // Format values for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'ไม่ระบุ';
    if (value === '') return 'ว่าง';
    if (typeof value === 'boolean') return value ? 'ผ่าน' : 'ไม่ผ่าน';
    if (Array.isArray(value)) return `รายการ ${value.length} ชิ้น`;
    return String(value);
  };

  // Format details message
  const getDetailsMessage = (log: AuditLogEntry) => {
    // For login/logout actions
    if (log.action === 'LOGIN') return 'เข้าสู่ระบบ';
    if (log.action === 'LOGOUT') return 'ออกจากระบบ';

    // For status changes
    if (log.action === 'STATUS_CHANGE' && log.details.field) {
      const field = fieldLabels[log.details.field] || log.details.field;
      return `เปลี่ยน${field} จาก "${formatValue(log.details.oldValue)}" เป็น "${formatValue(log.details.newValue)}"`;
    }
    
    // For updates with changed fields
    if (log.action === 'UPDATE' && log.details.changed_fields) {
      const changes = log.details.changed_fields as string[];
      const changesObj = log.details.changes as AuditLogChanges | undefined;
      const changeMessages: string[] = [];
      let sterilizerInfo = '';
      let dateInfo = '';

      // First pass: collect sterilizer and date info if they were changed
      if (changes.includes('sterilizer') && changesObj?.sterilizer) {
        const sterilizerChange = changesObj.sterilizer;
        sterilizerInfo = `เครื่องนึ่งหมายเลข ${sterilizerChange.oldValue || 'ไม่ระบุ'} เป็น ${sterilizerChange.newValue || 'ไม่ระบุ'}`;
      }
      
      if (changes.includes('date')) {
        const dateChange = changesObj?.date;
        if (dateChange) {
          const formatDateValue = (value: unknown): string => {
            if (!value) return 'ไม่ระบุ';
            try {
              // Handle Firestore Timestamp objects
              if (typeof value === 'object' && value !== null && 'toDate' in value) {
                return format((value as { toDate: () => Date }).toDate(), 'yyyy/MM/dd', { locale: th });
              }
              // Handle string or number timestamps
              return format(new Date(String(value)), 'yyyy/MM/dd', { locale: th });
            } catch (e) {
              return 'ไม่ระบุ';
            }
          };
          
          const oldDate = formatDateValue(dateChange.oldValue);
          const newDate = formatDateValue(dateChange.newValue);
          dateInfo = `วันที่ ${oldDate} เป็น ${newDate}`;
        }
      }

      // Add sterilizer and date info if they exist
      if (sterilizerInfo || dateInfo) {
        const infoParts = [];
        if (sterilizerInfo) infoParts.push(sterilizerInfo);
        if (dateInfo) infoParts.push(dateInfo);
        changeMessages.push(`รายการ${infoParts.length > 0 ? ' ' + infoParts.join(', ') : ''}`);
      }

      // Process other changes
      changes.forEach(field => {
        // Skip already processed fields
        if (field === 'sterilizer' || field === 'date') return;
        
        const fieldLabel = fieldLabels[field as keyof typeof fieldLabels] || field;
        const changes = (log.details.changes as Record<string, unknown>)?.[field] as ChangeDetail | undefined;
        
        if (changes) {
          // Special handling for image deletions
          if ((field === 'image_url_1' && changes.newValue === '') || 
              (field === 'image_url_2' && changes.newValue === '')) {
            changeMessages.push(`ลบ${fieldLabel}`);
          } 
          // Special handling for test results (mechanical, chemical, bio_test)
          else if (['mechanical', 'chemical_external', 'chemical_internal', 'bio_test'].includes(field)) {
            const oldVal = formatValue(changes.oldValue);
            const newVal = formatValue(changes.newValue);
            if (oldVal !== newVal) {
              changeMessages.push(`เปลี่ยน${fieldLabel} จาก "${oldVal}" เป็น "${newVal}"`);
            }
          }
          // For other fields
          else if (changes.oldValue !== undefined && changes.newValue !== undefined) {
            // Only show if there's an actual change
            if (JSON.stringify(changes.oldValue) !== JSON.stringify(changes.newValue)) {
              changeMessages.push(`เปลี่ยน${fieldLabel} จาก "${formatValue(changes.oldValue)}" เป็น "${formatValue(changes.newValue)}"`);
            }
          }
        }
      });

      // Handle items array changes
      const itemsChange = (log.details.changes as AuditLogChanges)?.items;
      if (itemsChange?._changes) {
        const changes = itemsChange._changes;
        const added = changes.filter((c: ChangeItem) => c.action === 'เพิ่ม').length;
        const removed = changes.filter((c: ChangeItem) => c.action === 'ลบ').length;
        const modified = changes.length - added - removed;
        
        const changeParts = [];
        if (added > 0) changeParts.push(`เพิ่ม ${added} รายการ`);
        if (removed > 0) changeParts.push(`ลบ ${removed} รายการ`);
        if (modified > 0) changeParts.push(`แก้ไข ${modified} รายการ`);
        
        if (changeParts.length > 0) {
          changeMessages.push(`อัปเดตรายการอุปกรณ์: ${changeParts.join(', ')}`);
        }
      }

      return changeMessages.length > 0 ? changeMessages.join(', ') : 'อัปเดตรายการ';
    }
    
    // For deletes
    if (log.action === 'DELETE') {
      // Check if we have additional details in the log
      if (log.details) {
        const details = [];
        if (log.details.sterilizer) {
          details.push(`เครื่องนึ่งหมายเลข ${log.details.sterilizer}`);
        }
        if (log.details.date) {
          try {
            let dateValue: Date | null = null;
            const dateInput = log.details.date;
            
            // Type guard for Firestore Timestamp
            const isFirestoreTimestamp = (obj: unknown): obj is { seconds: number; nanoseconds: number } => {
              return obj !== null && 
                     typeof obj === 'object' && 
                     'seconds' in (obj as object) && 
                     'nanoseconds' in (obj as object) &&
                     typeof (obj as { seconds: unknown }).seconds === 'number' && 
                     typeof (obj as { nanoseconds: unknown }).nanoseconds === 'number';
            };

            // Type guard for object with toDate method
            const hasToDateMethod = (obj: unknown): obj is { toDate: () => Date } => {
              return obj !== null && 
                     typeof obj === 'object' && 
                     'toDate' in (obj as object) && 
                     typeof (obj as { toDate: unknown }).toDate === 'function';
            };

            // Handle different date input types
            if (dateInput instanceof Date) {
              dateValue = dateInput;
            } else if (typeof dateInput === 'string' || typeof dateInput === 'number') {
              dateValue = new Date(dateInput);
            } else if (hasToDateMethod(dateInput)) {
              dateValue = dateInput.toDate();
            } else if (isFirestoreTimestamp(dateInput)) {
              // Handle Firestore timestamp
              dateValue = new Date(dateInput.seconds * 1000 + dateInput.nanoseconds / 1000000);
            }
            
            if (dateValue && !isNaN(dateValue.getTime())) {
              const formattedDate = format(dateValue, 'yyyy/MM/dd', { locale: th });
              details.push(`วันที่ ${formattedDate}`);
            }
          } catch (e) {
            console.error('Error formatting date:', e);
          }
        }
        return `ลบรายการ ${details.join(' ')}`;
      }
      return 'ลบรายการ';
    }
    
    // For creates
    if (log.action === 'CREATE') {
      return 'สร้างรายการใหม่';
    }
    
    // Fallback to message if available
    return log.details.message || 'ไม่มีรายละเอียดเพิ่มเติม';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4 md:p-8 relative">
      <canvas 
        ref={canvasRef} 
        className="fixed top-0 left-0 w-full h-full pointer-events-none z-0"
      />
      <div className="max-w-7xl mx-auto relative z-10 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 relative">
              <Image 
                src="/Instigator.jpg" 
                alt="RAM Logo" 
                fill 
                className="object-cover rounded-full border-2 border-gray-300"
                priority
              />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Audit Log</h1>
              <p className="text-gray-600 mt-1">แสดงประวัติการใช้งานทั้งหมดของระบบ</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
            <div className="flex gap-2">
              <Link 
                href="/dashboard"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Dashboard
              </Link>
              <Link 
                href="/history"
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
              >
                History
              </Link>
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full md:w-48"
            >
              <option value="all">การกระทำทั้งหมด</option>
              <option value="CREATE">สร้างรายการ</option>
              <option value="UPDATE">อัปเดตรายการ</option>
              <option value="DELETE">ลบรายการ</option>
              <option value="STATUS_CHANGE">เปลี่ยนสถานะ</option>
              <option value="LOGIN">เข้าสู่ระบบ</option>
              <option value="LOGOUT">ออกจากระบบ</option>
            </select>
            <input
              type="text"
              placeholder="ค้นหา..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full md:w-64"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    เวลา
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ผู้ใช้
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    การกระทำ
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    รายละเอียด
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(log.timestamp, 'dd/MM/yyyy HH:mm:ss', { locale: th })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {log.resolvedUser.fullName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {log.resolvedUser.role}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          log.action === 'LOGIN' || log.action === 'LOGOUT' 
                            ? 'bg-gray-100 text-gray-800' 
                            : log.action === 'DELETE' 
                              ? 'bg-red-100 text-red-800' 
                              : log.action === 'CREATE' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-blue-100 text-blue-800'
                        }`}>
                          {getActionText(log)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <CollapsibleContent content={getDetailsMessage(log)} maxLength={50} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ก่อนหน้า
                </button>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ถัดไป
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    แสดง <span className="font-medium">{filteredLogs.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0}</span> ถึง{' '}
                    <span className="font-medium">
                      {Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)}
                    </span>{' '}
                    จาก <span className="font-medium">{filteredLogs.length}</span> รายการ
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">ก่อนหน้า</span>
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      // Show first 2 pages, current page, and last 2 pages
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => goToPage(pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === pageNum 
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600' 
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    
                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">ถัดไป</span>
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
