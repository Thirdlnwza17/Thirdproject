'use client';

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { 
  UserData, 
  fetchAllUsers, 
  loginUser, 
  logAuditAction
} from "@/dbService";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebaseConfig";


interface Bubble {
  x: number;
  y: number;
  radius: number;
  dx: number;
  dy: number;
  alpha: number;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Bubble animation refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const bubblesRef = useRef<Bubble[]>([]);

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

  // User data loading effect
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersList = await fetchAllUsers();
        setUsers(usersList);
      } catch (err) {
        console.error("Error fetching users:", err);
      }
    };

    loadUsers();
  }, []);

  // Update selected user when email changes
  useEffect(() => {
    if (email && users.length > 0) {
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      setSelectedUser(user || null);
    } else {
      setSelectedUser(null);
    }
  }, [email, users]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    if (!selectedUser) {
      setError("ไม่พบผู้ใช้ที่ตรงกับอีเมลนี้");
      return;
    }
    
    setLoading(true);
    try {
      const { role, user } = await loginUser(email, password, selectedUser);
      
      setSuccess("เข้าสู่ระบบสำเร็จ!");
      if (role === "admin") {
        router.replace("/dashboard");
      } else {
        router.replace("/history");
      }
    } catch (err: any) {
      // Log failed login attempt
      if (selectedUser) {
        await logAuditAction(
          'LOGIN_ATTEMPT',
          'users',
          selectedUser.id,
          selectedUser.id,
          selectedUser.email,
          selectedUser.role || 'user',
          {
            message: 'เข้าสู่ระบบไม่สำเร็จ',
            error: err.message,
            userAgent: window.navigator.userAgent,
            ip: 'unknown' // In a real app, you'd get this from the request headers
          }
        );
      }
      
      if (err instanceof Error) {
        setError(err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
      } else {
        setError("เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4 relative overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className="fixed top-0 left-0 w-full h-full pointer-events-none z-0"
      />
      <div className="w-full max-w-md bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 p-8 md:p-10 transform transition-all duration-300 hover:shadow-2xl">
        {/* Logo with subtle animation */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-200 to-indigo-200 rounded-2xl opacity-70 blur-lg -z-10 animate-pulse"></div>
            <div className="w-32 h-32 md:w-36 md:h-36 bg-white rounded-2xl shadow-md border border-white/30 flex items-center justify-center overflow-hidden">
              <Image
                src="/user.png"
                alt="User Icon"
                width={140}
                height={140}
                className="object-contain p-4"
                priority
              />
            </div>
          </div>
        </div>
        
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent text-center mb-2">
          เข้าสู่ระบบ
        </h1>
        <p className="text-gray-500 text-center mb-8">กรุณากรอกชื่อ-นามสกุล อีเมล และรหัสผ่านของคุณ</p>
        
        <form className="w-full space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-5">
          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">อีเมล</label>
            <input
              id="email"
              type="email"
              placeholder="กรุณากรอกอีเมล"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-base text-gray-800 placeholder-gray-400 transition-all duration-200"
              required
            />
          </div>
          
          {selectedUser && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">ชื่อ-นามสกุล</label>
              <div className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-800">
                {selectedUser.fullName}
              </div>
            </div>
          )}
        </div>
          
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">รหัสผ่าน</label>
            </div>
            <input
              id="password"
              type="password"
              placeholder="กรุณากรอกรหัสผ่าน"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-base text-gray-800 placeholder-gray-400 transition-all duration-200"
              required
            />
          </div>
          
          <button
            type="submit"
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-lg transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 shadow-md hover:shadow-lg disabled:opacity-60 disabled:transform-none disabled:shadow-md flex items-center justify-center gap-2"
            disabled={loading}
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                กำลังเข้าสู่ระบบ...
              </>
            ) : (
              <>
                <Image 
                  src="/Instigator.jpg" 
                  alt="Instigator" 
                  width={20} 
                  height={20} 
                  className="w-5 h-5 rounded-full object-cover"
                />
                <span>เข้าสู่ระบบ</span>
              </>
            )}
          </button>
        </form>
        
        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}
        
        {success && (
          <div className="mt-4 p-3 bg-green-50 text-green-600 rounded-lg text-sm font-medium flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {success}
          </div>
        )}
        
        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <Link href="/" className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center group transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 transform group-hover:-translate-x-0.5 transition-transform" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            กลับหน้าแรก
          </Link>
        </div>
      </div>
    </div>
  );
}
