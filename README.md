# ระบบจัดการงานขนส่ง (Transport Management System)

## ข้อมูลเบื้องต้น
ระบบจัดการงานขนส่งที่พัฒนาด้วย Next.js และ Firebase พร้อมการวิเคราะห์ข้อมูลด้วย Claude AI

## ข้อกำหนดระบบ
- พร้อมรองรับผู้ใช้งานพร้อมกันสูงสุด: 2 คน/ครั้ง
- จำนวนผู้ใช้งานทั้งหมด: 30 บัญชี
- ความจุข้อมูล: 1GB ฟรี (รองรับได้มากกว่า 5 ปี)
- API: Claude AI สำหรับการวิเคราะห์ข้อมูล

## ข้อกำหนดเบื้องต้น
- Node.js เวอร์ชัน 16.0.0 ขึ้นไป
- npm (เวอร์ชัน 7 ขึ้นไป) หรือ yarn
- บัญชี Firebase Project
- บัญชี Vercel
- Claude API Key

## คู่มือการติดตั้งและใช้งาน

### 1. การตั้งค่า Repository
1. สร้าง Repository ใหม่บน GitHub
2. ส่งต่อ Repository ไปยังทีมงาน
3. ติดตั้ง Dependencies:
```bash
npm install
# หรือ
yarn install
```

### 2. ตั้งค่า Firebase
1. สร้างโปรเจคใหม่ที่ [Firebase Console](https://console.firebase.google.com/)
2. เพิ่มแอปพลิเคชันเว็บ
3. ตั้งค่า Authentication (เปิดใช้งาน Email/Password)
4. สร้าง Firestore Database (โหมด Production)
5. ตั้งค่า Storage Rules
6. เพิ่มผู้ดูแลระบบในแท็บ Authentication

### 3. ตั้งค่า Vercel
1. Login เข้าบัญชี Vercel
2. นำเข้าโปรเจคจาก GitHub Repository
3. ตั้งค่าตัวแปรสภาพแวดล้อม:
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
CLAUDE_API_KEY=your_claude_api_key
```
4. ตั้งค่า Build Command: `next build`
5. ตั้งค่า Output Directory: `.next`
6. Deploy โปรเจค

1. ติดตั้ง dependencies:
```bash
npm install
# หรือ
yarn install
```

2. สร้างไฟล์ `.env.local` ที่ root โฟลเดอร์และเพิ่มตัวแปรสภาพแวดล้อมที่จำเป็น:
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## การรันโปรเจค

### โหมดพัฒนา
```bash
npm run dev
# หรือ
yarn dev
```
เปิดเบราว์เซอร์ที่: [http://localhost:3000](http://localhost:3000)

### โหมด Production
```bash
npm run build
npm start
# หรือ
yarn build
yarn start
```

## โครงสร้างโปรเจค
```
src/
├── app/               # หน้าเว็บและ API routes
│   ├── api/          # API endpoints
│   └── dashboard/    # หน้าดัชบอร์ด
├── components/       # Components ต่างๆ
└── lib/             # ไฟล์สำหรับจัดการ Firebase และ utilities อื่นๆ
```

## ฟีเจอร์หลัก
- ระบบยืนยันตัวตนผู้ใช้ (Authentication)
- จัดการข้อมูลการขนส่ง
- ดูประวัติการทำงาน
- สร้างและแก้ไขข้อมูลงาน
- วิเคราะห์ข้อมูลด้วย Claude AI
- ส่งออกรายงาน
- ระบบจัดการผู้ใช้ (สำหรับผู้ดูแลระบบ)

## ค่าใช้จ่ายโดยประมาณ

### Claude API
- 9 รอบ = 0.01$
- 80 รอบ/วัน ≈ 0.0889$ (≈ 3.29 บาท/วัน)
- ต่อเดือน ≈ 98.7 บาท

### Firestore Database Storage
- **รายเดือน**: 4.32MB/เดือน
- **ค่าใช้จ่าย**: ฟรี (น้อยกว่า 1GB)
- **รายปี**: 51.84MB/ปี
- **กรณีเก็บข้อมูลหลายปี**:
  - 5 ปี = 259.2MB
  - 10 ปี = 518.4MB
  - ยังคงฟรี (น้อยกว่า 1GB)
- **เมื่อเกิน 1GB**: $0.18/GB/เดือน (≈ 6.66 บาท/GB/เดือน)

### Firebase Storage
- **รายเดือน**:
  | เดือน | พื้นที่ที่เพิ่มขึ้น (GB) | พื้นที่รวม (GB) | พื้นที่ที่คิดเงิน (GB) | ค่าใช้จ่าย (USD) |
  |-------|------------------------|----------------|----------------------|-----------------|
  | 1     | 2.34                   | 2.34           | 0.00                 | $0.00           |
  | 2     | 2.34                   | 4.68           | 0.00                 | $0.00           |
  | 3     | 2.34                   | 7.02           | 2.02                 | $0.0525         |
  | 4     | 2.34                   | 9.36           | 4.36                 | $0.1134         |
  | 5     | 2.34                   | 11.70          | 6.70                 | $0.1745         |
  | 6     | 2.34                   | 14.04          | 9.04                 | $0.2355         |
  | 7     | 2.34                   | 16.38          | 11.38                | $0.2965         |
  | 8     | 2.34                   | 18.72          | 13.72                | $0.3575         |
  | 9     | 2.34                   | 21.06          | 16.06                | $0.4185         |
  | 10    | 2.34                   | 23.40          | 18.40                | $0.4795         |
  | 11    | 2.34                   | 25.74          | 20.74                | $0.5405         |
  | 12    | 2.34                   | 28.08          | 23.08                | $0.6015         |

### Firestore Database Operations
- **Reads**: 5,778 ครั้ง/วัน (≈ 173,340 ครั้ง/เดือน) - ฟรี
- **Writes**: 533 ครั้ง/วัน (≈ 15,990 ครั้ง/เดือน) - ฟรี

### Bandwidth
- **รายเดือน**: 4.53GB/เดือน
- **ค่าใช้จ่าย**: ฟรี (1GB ฟรี, เกินคิด 0.12 บาท/GB)

## การบำรุงรักษา
1. ตรวจสอบโควตาการใช้งาน Firebase ทุกเดือน
2. ติดตามค่าใช้จ่าย Claude API
3. สำรองข้อมูลเป็นประจำ
4. อัพเดท dependencies เป็นระยะ

## การอัพเกรด
1. ดึงโค้ดล่าสุดจาก GitHub
2. ติดตั้ง dependencies ใหม่
3. รันการทดสอบ
4. Deploy ไปยัง Vercel

