'use client';

import Link from "next/link";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import { getFirestore, setDoc, doc, getDoc, Timestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Save user info to Firestore
      const db = getFirestore();
      const userRef = doc(db, "users", user.uid);

      // ดึงข้อมูล user เดิม
      const userSnap = await getDoc(userRef);
      let role = "operator";
      if (userSnap.exists() && userSnap.data().role) {
        role = userSnap.data().role;
      }

      await setDoc(userRef, {
        email: user.email,
        lastLogin: Timestamp.now(),
        role,
      }, { merge: true });

      setSuccess("Login successful!");
      if (role === "admin") {
        router.replace("/dashboard");
      } else {
        router.replace("/history");
      }
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
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
        <p className="text-gray-500 text-center mb-8">กรุณากรอกอีเมลและรหัสผ่านของคุณ</p>
        
        <form className="w-full space-y-5" onSubmit={handleSubmit}>
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
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-lg transition-all duration-300 transform hover:-translate-y-0.5 shadow-md hover:shadow-lg disabled:opacity-60 disabled:transform-none disabled:shadow-md flex items-center justify-center gap-2"
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
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                เข้าสู่ระบบ
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
