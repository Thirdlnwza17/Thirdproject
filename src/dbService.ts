
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, getDoc, getDocs, doc, Timestamp, setDoc, limit, where } from 'firebase/firestore';
import { signInWithEmailAndPassword, updateProfile, User as FirebaseUser, onAuthStateChanged as firebaseAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebaseConfig';


export interface UserData {
  id: string;
  email: string;
  fullName: string;
  role: string;
  displayName?: string;
  lastLogin?: { toDate: () => Date };
}
type TestResult = 'ผ่าน' | 'ไม่ผ่าน';

interface TestData {
  mechanical?: TestResult;
  chemical_external?: TestResult;
  chemical_internal?: TestResult;
  bio_test?: TestResult;
}

export type AuditLogAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'LOGIN' | 'LOGOUT' | 'LOGIN_ATTEMPT';

export interface AuditLogEntry {
  id?: string;
  action: AuditLogAction;
  entityType: string;
  userId: string;
  userEmail: string;
  userRole: string;
  timestamp: Date;
  details: {
    field?: string;
    oldValue?: string | number | Date | null;
    newValue?: string | number | Date | null;
    message?: string;
    ip?: string;
    userAgent?: string;
    error?: string;
    [key: string]: unknown; 
  };
}


export interface FirestoreDocument {
  id: string;
  [key: string]: unknown;
}

export interface SterilizerEntry extends FirestoreDocument {
  id: string;
  status?: "PASS" | "FAIL" | "NONE";
  program_name?: string;
  program?: string;
  created_at?: { toDate: () => Date };
  created_by?: string;
  sterilization_time?: string;
  total_duration?: number;
  attest_sn?: string;
  chemical_external?: string | boolean;
  chemical_internal?: string | boolean;
  mechanical?: string | boolean;
  bio_test?: string | boolean;
  // Add other fields as needed
}

const COLLECTIONS = {
  gas: 'gas_logs',
  plasma: 'plasma_logs',
  autoclave: 'autoclave_logs',
};

export function getColByProgram(program: string): string | null {
  if (!program) return null;
  if (program === 'EO') return COLLECTIONS.gas;
  if (program === 'Plasma') return COLLECTIONS.plasma;
  if (program === 'PREVAC' || program === 'BOWIE') return COLLECTIONS.autoclave;
  return null;
}

export async function createLog(program: string, data: SterilizerEntry, userId: string = '', userEmail: string = 'system', userRole: string = 'system') {
  const col = getColByProgram(program);
  if (!col) throw new Error('Invalid program type');
  
  const docRef = await addDoc(collection(db, col), {
    ...data,
    created_at: data.created_at || Timestamp.now(),
  });
  
  // Log the creation
  await logAuditAction(
    'CREATE',
    col,
    docRef.id,
    userId,
    userEmail,
    userRole,
    {
      message: `สร้างรายการใหม่ใน ${program}`,
      newValue: data
    }
  );
  
  return docRef.id;
}


export async function getAllLogs(col: string) {
  const q = query(collection(db, col), orderBy('created_at', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as SterilizerEntry);
}

// READ ONE
export async function getLog(col: string, id: string) {
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as SterilizerEntry : null;
}

// UPDATE
export async function updateLog(program: string, id: string, data: SterilizerEntry, userId: string = '', userEmail: string = 'system', userRole: string = 'system') {
  const col = getColByProgram(program);
  if (!col) throw new Error('Invalid program type');
  
  // Get the current document before updating
  const docRef = doc(db, col, id);
  const docSnap = await getDoc(docRef);
  const beforeData = docSnap.exists() ? docSnap.data() : null;
  
  // Update the document
  await updateDoc(docRef, data);
  
  // Find changed fields
  const changes: Record<string, { oldValue: string | number | Date | null; newValue: unknown }> = {};
  if (beforeData) {
    Object.keys(data).forEach(key => {
      if (JSON.stringify(beforeData[key]) !== JSON.stringify(data[key as keyof SterilizerEntry])) {
        changes[key] = {
          oldValue: beforeData[key],
          newValue: data[key as keyof SterilizerEntry]
        };
      }
    });
  }
  
  // Log the update
  await logAuditAction(
    'UPDATE',
    col,
    id,
    userId,
    userEmail,
    userRole,
    {
      message: `อัปเดตรายการใน ${program}`,
      ...changes
    }
  );
}

// DELETE
export async function deleteLog(program: string, id: string, userId: string = '', userEmail: string = 'system', userRole: string = 'system') {
  const col = getColByProgram(program);
  if (!col) throw new Error('Invalid program type');
  
  // Get the document before deleting
  const docRef = doc(db, col, id);
  const docSnap = await getDoc(docRef);
  const beforeData = docSnap.exists() ? docSnap.data() : null;
  
  // Delete the document
  await deleteDoc(docRef);
  
  // Log the deletion
  await logAuditAction(
    'DELETE',
    col,
    id,
    userId,
    userEmail,
    userRole,
    {
      message: `ลบรายการจาก ${program}`,
      oldValue: beforeData
    }
  );
}


export async function getAllLogsFromAll() {
  const colNames = [...Object.values(COLLECTIONS), 'sterilizer_loads'];
  const results = await Promise.all(colNames.map(async col => {
    const q = query(collection(db, col), orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data(), _col: col }) as SterilizerEntry);
  }));
  return results.flat();
} 



// Update manual entry
export async function updateSterilizerEntry(id: string, data: SterilizerEntry) {
  return await updateDoc(doc(db, "sterilizer_entries", id), data);
}

// Delete manual entry
export async function deleteSterilizerEntry(id: string) {
  return await deleteDoc(doc(db, "sterilizer_entries", id));
}

// Add OCR entry
export async function addOcrEntry(data: SterilizerEntry) {
  return await addDoc(collection(db, "sterilizer_ocr_entries"), data);
}

// Get user role by UID or email
export async function getUserRole(identifier: string): Promise<string> {
  try {
    // First try to find by email
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", identifier));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const userData = querySnapshot.docs[0].data();
      if (userData.role) {
        return userData.role;
      }
    }
    
    // If not found by email, try by UID
    const userRef = doc(db, "users", identifier);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists() && userSnap.data().role) {
      return userSnap.data().role;
    }
    
    console.warn('No role found for user:', identifier);
    return "operator";
  } catch (error) {
    console.error('Error getting user role:', error);
    return "operator";
  }
}

// ฟังก์ชันคำนวณสถานะ
function calculateStatus(data: TestData): "PASS" | "FAIL" | "NONE" {
  // ตรวจสอบว่ามีการเลือกผลการทดสอบหรือไม่
  const hasTestResults = 
    data.mechanical === 'ผ่าน' || data.mechanical === 'ไม่ผ่าน' ||
    data.chemical_external === 'ผ่าน' || data.chemical_external === 'ไม่ผ่าน' ||
    data.chemical_internal === 'ผ่าน' || data.chemical_internal === 'ไม่ผ่าน' ||
    data.bio_test === 'ผ่าน' || data.bio_test === 'ไม่ผ่าน';
  
  // ถ้าไม่มีการเลือกผลการทดสอบเลย ให้คืนค่า NONE
  if (!hasTestResults) {
    return 'NONE';
  }
  
  // ถ้ามีการเลือกผลการทดสอบ ให้ตรวจสอบว่ามีการ "ไม่ผ่าน" หรือไม่
  if (
    data.mechanical === 'ไม่ผ่าน' ||
    data.chemical_external === 'ไม่ผ่าน' ||
    data.chemical_internal === 'ไม่ผ่าน' ||
    data.bio_test === 'ไม่ผ่าน'
  ) {
    return 'FAIL';
  }
  
  // ถ้าทุกอย่างผ่าน ให้คืนค่า PASS
  return 'PASS';
}

// Subscribe to sterilizer loads
export function subscribeToSterilizerLoads(
  onUpdate: (entries: SterilizerEntry[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(collection(db, "sterilizer_loads"), orderBy("created_at", "desc"));
  
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const entries: SterilizerEntry[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        entries.push({
          id: doc.id,
          status: calculateStatus(data), // ใช้ฟังก์ชันคำนวณสถานะ
          program_name: data.program_name,
          program: data.program,
          created_at: data.created_at,
          created_by: data.created_by,
          duration_min: data.duration_min,
          sterilization_time: data.sterilization_time,
          total_duration: data.total_duration,
          attest_table: Array.isArray(data.attest_table) ? data.attest_table : [],
          attest_sn: data.attest_sn || '',
          chemical_external: data.chemical_external,
          chemical_internal: data.chemical_internal,
          mechanical: data.mechanical,
          bio_test: data.bio_test,
        });
      });
      onUpdate(entries);
    },
    (error) => {
      console.error("Error subscribing to sterilizer loads:", error);
      onError?.(error);
    }
  );
  
  return unsubscribe;
}

// User Management Functions
export async function fetchAllUsers(): Promise<UserData[]> {
  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      email: doc.data().email,
      fullName: doc.data().fullName || doc.data().displayName || 'No Name',
      role: doc.data().role || ''
    }));
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

export async function loginUser(email: string, password: string, selectedUserData: UserData) {
  try {
    console.log('Login attempt with:', { 
      email, 
      selectedUserRole: selectedUserData.role,
      selectedUserData 
    });
    
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    // Get the role from selectedUserData without any fallback
    const role = selectedUserData.role;
    
    console.log('User authenticated, role:', role);
    
    // Update user's last login time
    await updateProfile(user, {
      displayName: selectedUserData.fullName
    });
    
    // Update last login time in Firestore
    const userDocRef = doc(db, 'users', selectedUserData.id);
    await updateDoc(userDocRef, {
      lastLogin: Timestamp.now()
    });
    
    // Log the login
    await logAuditAction(
      'LOGIN',
      'users',
      selectedUserData.id,
      selectedUserData.id,
      selectedUserData.email,
      role,
      {
        message: 'เข้าสู่ระบบ',
        newValue: {
          lastLogin: new Date().toISOString()
        }
      }
    );
    
    return { user, role };
  } catch (error: unknown) {
    console.error("Login error:", error);
  
    if (error instanceof Error) {
      throw new Error(error.message || "Login failed");
    }
  
    throw new Error("Login failed");
  }
}
export function getCurrentUser() {
  return auth.currentUser;
}

export async function signOutUser(userId: string = '', userEmail: string = 'system', userRole: string = 'system') {
  try {
    // Log the logout before signing out
    if (userId && userEmail !== 'system') {
      await logAuditAction(
        'LOGOUT',
        'users',
        userId,
        userId,
        userEmail,
        userRole,
        {
          message: 'ออกจากระบบ'
        }
      );
    }
    
    await auth.signOut();
    return { success: true };
  } catch (error) {
    console.error('Error signing out:', error);
    return { success: false, error };
  }
}

// Update OCR entry
export async function updateOcrEntry(id: string, data: SterilizerEntry) {
  return await updateDoc(doc(db, "sterilizer_ocr_entries", id), data);
}

// Delete OCR entry
export async function deleteOcrEntry(id: string) {
  return await deleteDoc(doc(db, "sterilizer_ocr_entries", id));
}

// Helper function to remove undefined values from an object
function removeUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(obj).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value === undefined) return acc;
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const cleaned = removeUndefined(value as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) {
        acc[key] = cleaned;
      }
    } else if (Array.isArray(value)) {
      acc[key] = value.map(item => 
        item && typeof item === 'object' ? removeUndefined(item as Record<string, unknown>) : item
      );
    } else {
      acc[key] = value;
    }
    
    return acc;
  }, {});
}

// Log action to audit log
export async function logAuditAction(
  action: AuditLogAction,
  entityType: string,
  entityId: string,
  userId: string,
  userEmail: string,
  userRole: string,
  details: {
    field?: string;
    oldValue?: unknown;
    newValue?: unknown;
    message?: string;
    ip?: string;
    userAgent?: string;
    error?: string;
    [key: string]: unknown;
  }
): Promise<void> {
  try {
    // Clean up the details object by removing undefined values
    const cleanedDetails = removeUndefined(details);
    
    await addDoc(collection(db, 'audit_logs'), {
      action,
      entityType,
      entityId,
      userId,
      userEmail,
      userRole,
      timestamp: Timestamp.now(),
      details: cleanedDetails,
    });
  } catch (error) {
    console.error('Error logging audit action:', error);
  }
}

// Get all audit logs
export async function getAuditLogs(limitCount = 100): Promise<AuditLogEntry[]> {
  try {
    const q = query(
      collection(db, 'audit_logs'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp.toDate()
    } as AuditLogEntry));
  } catch (error) {
    console.error('Error getting audit logs:', error);
    throw error;
  }
}

// Subscribe to audit log changes
export function subscribeToAuditLogs(
  callback: (logs: AuditLogEntry[]) => void,
  limitCount = 100
): () => void {
  const q = query(
    collection(db, 'audit_logs'),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp.toDate()
    } as AuditLogEntry));
    
    callback(logs);
  }, (error) => {
    console.error('Error subscribing to audit logs:', error);
  });

  return unsubscribe;
}

