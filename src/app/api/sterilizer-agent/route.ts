import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, Timestamp, collection, addDoc } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { auth } from '../../../firebaseConfig'; // ใช้ named import (firebaseConfig ไม่มี default export)

// Ensure Firebase is initialized only once
if (!getApps().length) {
  // initializeApp(firebaseConfig); // ไม่ต้อง initialize ซ้ำ เพราะ import { auth } จะ initialize แล้ว
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  // สมมุติรับข้อมูลจาก Go agent (mock format)
  // สามารถแก้ไข mapping ได้เมื่อทราบ format จริง
  const db = getFirestore();
  await addDoc(collection(db, 'sterilizer_cycles'), {
    raw_data: data.raw_data,
    received_at: data.received_at ? Timestamp.fromDate(new Date(data.received_at)) : Timestamp.now(),
    created_at: Timestamp.now(),
    source: 'agent',
  });
  return NextResponse.json({ status: 'ok', received: data });
}