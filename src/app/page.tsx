'use client';
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebaseConfig";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import Image from "next/image";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // สุ่มค่าหลัง mount (client only)
    const arr = Array.from({ length: 30 }).map(() => ({
      width: Math.random() * 16 + 8,
      height: Math.random() * 16 + 8,
      left: Math.random() * 100,
      top: Math.random() * 100,
      background: ["#f472b6", "#a78bfa", "#38bdf8", "#facc15"][Math.floor(Math.random() * 4)],
      animationDuration: (Math.random() * 8 + 6) + "s",
    }));
    // setParticles(arr); // This line was removed as per the edit hint.
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="w-full max-w-4xl bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 p-8 md:p-12 flex flex-col items-center transform transition-all duration-300 hover:shadow-2xl">
        {/* Logo with subtle animation */}
        <div className="mb-8 flex justify-center animate-float">
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
        <div className="text-center space-y-6 max-w-2xl">
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
              <span className="mr-2">🚀</span>เริ่มใช้งานระบบ
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
    </div>
  );
}
