'use client';
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebaseConfig";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import Image from "next/image";

interface Bubble {
  x: number;
  y: number;
  radius: number;
  dx: number;
  dy: number;
  alpha: number;
}

export default function Home() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const bubblesRef = useRef<Bubble[]>([]);

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
      const bubbleCount = Math.floor((window.innerWidth * window.innerHeight) / 40000); // Adjust density
      
      for (let i = 0; i < bubbleCount; i++) {
        const radius = Math.random() * 20 + 10; // 10-30px
        bubbles.push({
          x: Math.random() * (canvas.width - radius * 2) + radius,
          y: Math.random() * (canvas.height - radius * 2) + radius,
          radius,
          dx: (Math.random() - 0.5) * 0.5, // Random speed
          dy: (Math.random() - 0.5) * 0.5,
          alpha: Math.random() * 0.3 + 0.2 // 0.2-0.5 opacity
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const db = getFirestore();
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        const role = userSnap.exists() && userSnap.data().role ? userSnap.data().role : "operator";
        if (role !== "admin") {
          router.replace("/history");
        }
      }
    });
    return () => unsubscribe();
  }, [router]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className="fixed top-0 left-0 w-full h-full pointer-events-none z-0"
      />
      <div className="w-full max-w-4xl bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 p-8 md:p-12 flex flex-col items-center transform transition-all duration-300 hover:shadow-2xl">
        {/* Logo with subtle animation */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-200 to-indigo-200 rounded-2xl opacity-70 blur-lg -z-10 animate-pulse"></div>
            <Image 
              src="/ram-logo.jpg" 
              alt="RAM Hospital Logo" 
              width={200} 
              height={200} 
              className="mx-auto w-36 h-36 md:w-44 md:h-44 object-contain bg-white rounded-2xl shadow-md border border-white/30 transition-transform duration-500 hover:scale-105"
              priority
            />
          </div>
        </div>
        
        {/* Main Content */}
        <div className="text-center space-y-6 w-full">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Central Supply Sterile Quality Information System
          </h1>
          
          <p className="text-gray-600 text-lg md:text-xl leading-relaxed">
            ระบบข้อมูลการติดตามคุณภาพการทำฆ่าเชื้ออุปกรณ์เวชภัณฑ์ทางการแพทย์
          </p>
          
          <div className="pt-4">
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-8 py-3.5 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-md hover:shadow-lg hover:opacity-90 transition-all duration-300 transform hover:-translate-y-0.5"
            >
              <Image 
                src="/Instigator.jpg" 
                alt="Instigator" 
                width={24} 
                height={24} 
                className="w-6 h-6 rounded-full mr-2 object-cover"
              />
              เริ่มใช้งานระบบ
            </Link>
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-100 w-full">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center text-gray-500">
            <div className="flex flex-col items-center p-4 rounded-xl hover:bg-blue-50/50 transition-colors">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-2">
                <span className="text-blue-600">🏥</span>
              </div>
              <span className="font-medium">RAM Hospital</span>
            </div>
            <div className="flex flex-col items-center p-4 rounded-xl hover:bg-blue-50/50 transition-colors">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mb-2">
                <span className="text-indigo-600">📅</span>
              </div>
              <span className="font-medium">2025</span>
            </div>
            <div className="flex flex-col items-center p-4 rounded-xl hover:bg-blue-50/50 transition-colors">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mb-2">
                <span className="text-purple-600">💾</span>
              </div>
              <span className="font-medium">Firebase</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}