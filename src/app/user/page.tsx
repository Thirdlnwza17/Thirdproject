'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import Image from 'next/image';
import { fetchAllUsers, UserData } from '@/dbService';

interface User extends Omit<UserData, 'lastLogin'> {
  status: 'online' | 'offline';
  name: string;
  lastLogin: { toDate: () => Date } | null;
}

interface Bubble {
  x: number;
  y: number;
  radius: number;
  dx: number;
  dy: number;
  alpha: number;
}

export default function UserManagementPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch users from Firestore
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const usersData = await fetchAllUsers();
        
        // Transform and sort users
        const transformedUsers: User[] = usersData.map(userData => {
          const user: User = {
            ...userData,
            name: userData.fullName || userData.email.split('@')[0],
            lastLogin: userData.lastLogin || null,
            status: 'offline' // You might want to implement online status tracking
          };
          return user;
        }).sort((a, b) => {
          // Sort by admin status first (admin comes first), then by name
          if (a.role === 'admin' && b.role !== 'admin') return -1;
          if (a.role !== 'admin' && b.role === 'admin') return 1;
          return a.name.localeCompare(b.name, 'th');
        });
        
        setUsers(transformedUsers);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
    
    // Set up real-time updates if needed
    // const unsubscribe = onSnapshot(collection(db, 'users'), () => {
    //   fetchUsers();
    // });
    // 
    // return () => unsubscribe();
  }, []);

  // Bubble animation setup (same as audit log)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();

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

    const drawBubble = (bubble: Bubble) => {
      if (!ctx) return;
      
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 230, 255, ${bubble.alpha})`;
      ctx.fill();
      
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

    const updateBubbles = () => {
      const bubbles = bubblesRef.current;
      
      for (let i = 0; i < bubbles.length; i++) {
        const bubble = bubbles[i];
        
        bubble.x += bubble.dx;
        bubble.y += bubble.dy;
        
        if (bubble.x - bubble.radius < 0 || bubble.x + bubble.radius > canvas.width) {
          bubble.dx = -bubble.dx;
        }
        if (bubble.y - bubble.radius < 0 || bubble.y + bubble.radius > canvas.height) {
          bubble.dy = -bubble.dy;
        }
        
        for (let j = i + 1; j < bubbles.length; j++) {
          const otherBubble = bubbles[j];
          const dx = bubble.x - otherBubble.x;
          const dy = bubble.y - otherBubble.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < bubble.radius + otherBubble.radius) {
            const angle = Math.atan2(dy, dx);
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            
            const vx1 = bubble.dx * cos + bubble.dy * sin;
            const vy1 = bubble.dy * cos - bubble.dx * sin;
            const vx2 = otherBubble.dx * cos + otherBubble.dy * sin;
            const vy2 = otherBubble.dy * cos - otherBubble.dx * sin;
            
            bubble.dx = vx2 * cos - vy1 * sin;
            bubble.dy = vy1 * cos + vx2 * sin;
            otherBubble.dx = vx1 * cos - vy2 * sin;
            otherBubble.dy = vy2 * cos + vx1 * sin;
            
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

    const animate = () => {
      if (!ctx) return;
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      updateBubbles();
      bubblesRef.current.forEach(bubble => drawBubble(bubble));
      
      animationRef.current = requestAnimationFrame(animate);
    };

    // Initialize bubbles and start animation
    bubblesRef.current = createBubbles();
    animate();

    // Handle window resize
    const handleResize = () => {
      resizeCanvas();
      bubblesRef.current = createBubbles();
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const formatLastLogin = (date: { toDate: () => Date } | Date | undefined | null) => {
    if (!date) return 'ไม่ทราบ';
    const dateObj = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return format(dateObj, 'yyyy/MM/dd HH:mm');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <canvas
        ref={canvasRef}
        className="fixed top-0 left-0 w-full h-full pointer-events-none z-0"
      />

      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-4">
            <Image
              src="/Instigator.jpg"
              alt="Instigator Logo"
              width={50}
              height={50}
              className="rounded-lg"
            />
            <h1 className="text-3xl font-bold text-gray-800">ผู้ใช้งานทั้งหมด</h1>
          </div>
          <div className="flex space-x-4">
            <Link href="/dashboard">
              <button className="bg-white hover:bg-gray-100 text-blue-600 font-semibold py-2 px-4 border border-blue-300 rounded-lg shadow-sm">
                Dashboard
              </button>
            </Link>
            <Link href="/history">
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm">
                Record
              </button>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-800">รายชื่อผู้ใช้งานทั้งหมด</h2>
              <div className="relative">
                <input
                  type="text"
                  placeholder="ค้นหาผู้ใช้งาน..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <svg
                  className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ลำดับ
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ชื่อ-สกุล
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        รหัสพนักงาน
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        สิทธิ์การใช้งาน
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ออนไลน์ล่าสุด
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user, index) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 font-medium">
                              {user.name.charAt(0)}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{user.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.email ? user.email.replace('@gmail.com', '') : ''}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            user.role === 'admin' 
                              ? 'bg-purple-100 text-purple-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {user.role === 'admin' ? 'Admin' : 'Operator'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatLastLogin(user.lastLogin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 flex justify-between items-center">
              <div className="text-sm text-gray-500">
                แสดง <span className="font-medium">1</span> ถึง <span className="font-medium">{users.length}</span> จาก <span className="font-medium">{users.length}</span> รายการ
              </div>
              <div className="flex space-x-2">
                <button className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                  ก่อนหน้า
                </button>
                <button className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                  1
                </button>
                <button className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                  ถัดไป
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
