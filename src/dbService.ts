// dbService.ts
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, getDoc, getDocs, doc, Timestamp, setDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, updateProfile, User as FirebaseUser, onAuthStateChanged as firebaseAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebaseConfig';

// User-related interfaces and types
export interface UserData {
  id: string;
  email: string;
  fullName: string;
  role: string;
  displayName?: string;
  lastLogin?: { toDate: () => Date };
}

// Base interface for Firestore document data
export interface FirestoreDocument {
  id: string;
  [key: string]: unknown;
}

export interface SterilizerEntry extends FirestoreDocument {
  id: string;
  status?: "PASS" | "FAIL" | "CANCEL";
  program_name?: string;
  program?: string;
  created_at?: { toDate: () => Date };
  created_by?: string;
  duration_min?: number;
  sterilization_time?: string;
  total_duration?: number;
  attest_table?: any[];
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

// CREATE
export async function createLog(program: string, data: SterilizerEntry) {
  const col = getColByProgram(program);
  if (!col) throw new Error('Invalid program type');
  const docRef = await addDoc(collection(db, col), {
    ...data,
    created_at: data.created_at || Timestamp.now(),
  });
  return docRef.id;
}

// READ ALL (optionally with order)
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
export async function updateLog(program: string, id: string, data: SterilizerEntry) {
  const col = getColByProgram(program);
  if (!col) throw new Error('Invalid program type');
  await updateDoc(doc(db, col, id), data);
}

// DELETE
export async function deleteLog(program: string, id: string) {
  const col = getColByProgram(program);
  if (!col) throw new Error('Invalid program type');
  await deleteDoc(doc(db, col, id));
}

// Utility: get all logs from all collections (for All filter)
export async function getAllLogsFromAll() {
  const colNames = [...Object.values(COLLECTIONS), 'sterilizer_loads'];
  const results = await Promise.all(colNames.map(async col => {
    const q = query(collection(db, col), orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data(), _col: col }) as SterilizerEntry);
  }));
  return results.flat();
} 

// --- เพิ่มฟังก์ชันสำหรับใช้งานใน history/page.tsx ---

// Subscribe to manual entries
export function subscribeSterilizerEntries(callback: (entries: SterilizerEntry[]) => void) {
  const q = query(collection(db, "sterilizer_entries"), orderBy("test_date", "desc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as SterilizerEntry));
  });
}

// Subscribe to OCR entries
export function subscribeOcrEntries(callback: (entries: SterilizerEntry[]) => void) {
  const q = query(collection(db, "sterilizer_ocr_entries"), orderBy("created_at", "desc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as SterilizerEntry));
  });
}

// Add manual entry
export async function addSterilizerEntry(data: SterilizerEntry) {
  return await addDoc(collection(db, "sterilizer_entries"), data);
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

// Get user role by UID
export async function getUserRole(uid: string): Promise<string> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  return userSnap.exists() && userSnap.data().role ? userSnap.data().role : "operator";
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
          status: data.status,
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
      role: doc.data().role || 'operator'
    }));
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

export async function loginUser(email: string, password: string, selectedUserData: UserData) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update the user's display name in Firebase Auth
    await updateProfile(user, {
      displayName: selectedUserData.fullName.trim()
    });

    // Save/update user info in Firestore
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    let role = 'operator';
    if (userSnap.exists() && userSnap.data()?.role) {
      role = userSnap.data()?.role;
    }

    await setDoc(
      userRef,
      {
        email: user.email,
        fullName: selectedUserData.fullName.trim(),
        lastLogin: Timestamp.now(),
        role,
      },
      { merge: true }
    );

    return { role };
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

export function onAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
  return firebaseAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function signOutUser() {
  try {
    await auth.signOut();
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
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

// Log action (edit/delete)
export async function logAction(action: string, entryId: string, before: SterilizerEntry, after: SterilizerEntry, user: string, role: string) {
  return await addDoc(collection(db, "sterilizer_action_logs"), {
    action,
    entry_id: entryId,
    by: user,
    role,
    at: Timestamp.now(),
    before,
    after,
  });
}

// Check for duplicate OCR entry
export async function checkOcrDuplicate(imageUrl: string, extractedText: string) {
  const q = query(collection(db, "sterilizer_ocr_entries"), orderBy("created_at", "desc"));
  const snapshot = await getDocs(q);
  const existingEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SterilizerEntry[];
  const duplicates = existingEntries.filter(entry => {
    const imageMatch = entry.image_url === imageUrl;
    const textMatch = entry.extracted_text === extractedText;
    return imageMatch || textMatch;
  });
  return duplicates;
} 