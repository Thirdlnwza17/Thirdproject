'use client';
import React, { useState, useEffect, useRef } from 'react';
import { saveAs } from 'file-saver';
import { getFirestore, collection, query, orderBy, onSnapshot, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import EditLoadModal from './EditLoadModal';

export default function SterilizerLoadsCardView({ user, startDate, endDate, clearAllFiltersTrigger }: { user: any, startDate?: string, endDate?: string, clearAllFiltersTrigger?: number }) {
  // State สำหรับ Card View
  const [loads, setLoads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [autoclaveSub, setAutoclaveSub] = useState('All');
  const cardsPerPage = 6;
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<any | null>(null);
  // เพิ่ม state สำหรับ modal edit
  const [editForm, setEditForm] = useState<any | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editError, setEditError] = useState("");
  // State สำหรับ filter เพิ่มเติม
  const [mechanicalFilter, setMechanicalFilter] = useState("");
  const [chemicalExternalFilter, setChemicalExternalFilter] = useState("");
  const [chemicalInternalFilter, setChemicalInternalFilter] = useState("");
  const [bioTestFilter, setBioTestFilter] = useState("");
  // SN Filter
  const [snFilter, setSnFilter] = useState('');
  // State สำหรับ search
  const [searchText, setSearchText] = useState("");

  // State สำหรับ modal image, zoom, drag
  const [showBigImage1, setShowBigImage1] = useState(false);
  const [showBigImage2, setShowBigImage2] = useState(false);
  const [zoomBig1, setZoomBig1] = useState(1);
  const [offsetBig1, setOffsetBig1] = useState({ x: 0, y: 0 });
  const [draggingBig1, setDraggingBig1] = useState(false);
  const dragStartBig1 = useRef({ x: 0, y: 0 });
  const offsetStartBig1 = useRef({ x: 0, y: 0 });
  const [zoomBig2, setZoomBig2] = useState(1);
  const [offsetBig2, setOffsetBig2] = useState({ x: 0, y: 0 });
  const [draggingBig2, setDraggingBig2] = useState(false);
  const dragStartBig2 = useRef({ x: 0, y: 0 });
  const offsetStartBig2 = useRef({ x: 0, y: 0 });
  const overlayRef1 = useRef<HTMLDivElement>(null);
  const overlayRef2 = useRef<HTMLDivElement>(null);
  const lastTapBig1 = useRef(0);
  const lastTapBig2 = useRef(0);

  useEffect(() => {
    setLoading(true);
    const db = getFirestore();
    const q = query(collection(db, 'sterilizer_loads'), orderBy('created_at', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setLoads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Reset all filters when clearAllFiltersTrigger changes
  useEffect(() => {
    setFilter('All');
    setAutoclaveSub('All');
    setSnFilter('');
    setMechanicalFilter('');
    setChemicalExternalFilter('');
    setChemicalInternalFilter('');
    setBioTestFilter('');
    setSearchText('');
    setCurrentPage(1);
  }, [clearAllFiltersTrigger]);

  // ฟังก์ชัน filter, pagination
  // ปรับ filter ให้รองรับช่วงวันที่
  const filteredLoads = loads.filter(load => {
    // SN Filter (ใช้ attest_sn)
    if (snFilter && load.attest_sn !== snFilter) return false;
    // กรองตามช่วงวันที่
    if (startDate || endDate) {
      const dateStr = load.date || load.test_date;
      if (!dateStr) return false;
      const entryDate = new Date(dateStr);
      if (startDate && entryDate < new Date(startDate)) return false;
      if (endDate && entryDate > new Date(endDate)) return false;
    }
    // กรองประเภท
    if (filter !== 'All') {
      const prog = (load.program || '').toUpperCase();
      if (filter === 'Gas' && prog !== 'EO') return false;
      if (filter === 'Plasma' && prog !== 'PLASMA') return false;
      if (filter === 'Autoclave') {
        if (autoclaveSub === 'All') {
          if (!(prog === 'BOWIE' || prog === 'PREVAC')) return false;
        } else {
          if (prog !== autoclaveSub) return false;
        }
      }
    }
    // Multi-filters
    if (mechanicalFilter && (load.mechanical || '').toLowerCase() !== mechanicalFilter) return false;
    if (chemicalExternalFilter && (load.chemical_external || '').toLowerCase() !== chemicalExternalFilter) return false;
    if (chemicalInternalFilter && (load.chemical_internal || '').toLowerCase() !== chemicalInternalFilter) return false;
    if (bioTestFilter && (load.bio_test || '').toLowerCase() !== bioTestFilter) return false;

    // Search only: operator, items, sterilizer
    if (searchText && searchText.trim()) {
      const lower = searchText.trim().toLowerCase();
      // Operator fields
      const operator = (load.operator || '').toLowerCase();
      const sterileStaff = (load.sterile_staff || '').toLowerCase();
      const resultReader = (load.result_reader || '').toLowerCase();
      // Equipment names
      const items = Array.isArray(load.items)
        ? load.items.map((item: any) => (typeof item === 'string' ? item : (item.name || ''))).join(' ').toLowerCase()
        : (typeof load.items === 'string' ? load.items.toLowerCase() : '');
      // Sterilizer
      const sterilizer = (load.sterilizer || '').toLowerCase();
      if (!(
        operator.includes(lower) ||
        sterileStaff.includes(lower) ||
        resultReader.includes(lower) ||
        items.includes(lower) ||
        sterilizer.includes(lower)
      )) return false;
    }

    return true;
  });
  const totalPages = Math.ceil(filteredLoads.length / cardsPerPage);
  const paginatedLoads = filteredLoads.slice((currentPage - 1) * cardsPerPage, currentPage * cardsPerPage);

  // ฟังก์ชัน modal edit, modal image, zoom, drag (เหมือนเดิม)
  // ... (handleEdit, handleEditSave, handleDelete, modal image, zoom, drag, etc.)

  // ฟังก์ชัน handleEditSave (logic อัปเดตข้อมูล)
  const handleEditSave = async (formData: any) => {
    setEditLoading(true);
    setEditError("");
    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'sterilizer_loads', formData.id), {
        ...formData,
        attest_sn: formData.attest_sn || '',
        attest_time: formData.attest_time || '',
        total_duration: formData.total_duration || '',
      });
      setEditForm(null);
      setLoading(true);
      // Refresh loads
      const q = query(collection(db, 'sterilizer_loads'), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      setLoads(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    } catch (err: any) {
      setEditError(err.message || "เกิดข้อผิดพลาด");
    } finally {
      setEditLoading(false);
    }
  };

  // ฟังก์ชัน handleDelete (logic ลบข้อมูล)
  const handleDelete = async (id: string) => {
    setDeleteLoading(true);
    setEditError("");
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'sterilizer_loads', id));
      setEditForm(null);
      setLoading(true);
      // Refresh loads
      const q = query(collection(db, 'sterilizer_loads'), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      setLoads(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    } catch (err: any) {
      setEditError(err.message || "เกิดข้อผิดพลาดในการลบข้อมูล");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <div className="text-center text-gray-500 py-8">กำลังโหลดข้อมูล...</div>;
  if (loads.length === 0) return <div className="text-center text-gray-400 py-12 text-lg">ยังไม่มีข้อมูลรอบการทำงาน</div>;

  // --- Export CSV ---
  function handleExportCsv() {
    if (!filteredLoads || filteredLoads.length === 0) {
      alert("ไม่มีข้อมูลให้ export");
      return;
    }
    // Define CSV headers
    const headers = [
      "ID",
      "TestDate",
      "SerialNumber",
      "Program",
      "Items",
      "ChemicalResult",
      "BiologicalResult",
      "SterilizationTime",
      "Temperature",
      "Operator"
    ];
    // Map Firestore fields correctly
    const rows = filteredLoads.map(e => [
      e.id ?? "",
      (
        e.date &&
        typeof e.date === 'object' &&
        typeof (e.date as any).toDate === 'function'
      )
        ? (e.date as any).toDate().toISOString().slice(0, 10)
        : (typeof e.date === 'string' ? e.date : (e.date ?? "")),
      e.attest_sn ?? e.serial_number ?? "",
      e.program ?? "",
      Array.isArray(e.items)
        ? e.items.map((i: any) => (typeof i === 'string' ? i : (i.name || '')).replace(/"/g, '""')).join(';')
        : (typeof e.items === 'string' ? e.items.replace(/"/g, '""') : ''),
      e.chemical_external ?? "",
      e.bio_test ?? "",
      e.attest_time ?? "",
      e.temperature ?? "",
      e.created_by ?? ""
    ]);
    // Convert to CSV string
    const csvContent = '\uFEFF' + [headers, ...rows]
      .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    // Download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `sterilizer-history-visible-${new Date().toISOString().slice(0,10)}.csv`);
  }

  return (
    <>
      {/* Filter dropdown */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        {/* SN Filter */}
        <label className="font-bold text-gray-700">SN:</label>
        <select
          className="border rounded px-2 py-1 text-black bg-white"
          value={snFilter}
          onChange={e => { setSnFilter(e.target.value); setCurrentPage(1); }}
        >
          <option value="">ทั้งหมด</option>
          <option value="431930">431930</option>
          <option value="101715">101715</option>
        </select>
        <input
          className="border rounded px-2 py-1 text-black bg-white w-60 order-first"
          type="text"
          placeholder="ค้นหาชื่ออุปกรณ์, operator, เครื่องอบฆ่าเชื้อ"
          value={searchText}
          onChange={e => { setSearchText(e.target.value); setCurrentPage(1); }}
          style={{ minWidth: 220 }}
        />
        <label className="font-bold text-gray-700">ประเภทโปรแกรม:</label>
        <select
          className="border rounded px-2 py-1 text-black bg-white"
          value={filter}
          onChange={e => {
            setFilter(e.target.value);
            setCurrentPage(1);
            if (e.target.value !== 'Autoclave') setAutoclaveSub('All');
          }}
        >
          <option value="All" className="text-black">All</option>
          <option value="Plasma" className="text-black">Plasma</option>
          <option value="Autoclave" className="text-black">Autoclave</option>
          <option value="Gas" className="text-black">Gas</option>
        </select>
        {filter === 'Autoclave' && (
          <select
            className="border rounded px-2 py-1 text-black bg-white ml-2"
            value={autoclaveSub}
            onChange={e => { setAutoclaveSub(e.target.value); setCurrentPage(1); }}
          >
            <option value="All">ทั้งหมด</option>
            <option value="PREVAC">PREVAC</option>
            <option value="BOWIE">BOWIE</option>
          </select>
        )}
        {/* Multi-filters */}
        <label className="font-bold text-gray-700 ml-2">กลไก:</label>
        <select
          className="border rounded px-2 py-1 text-black bg-white"
          value={mechanicalFilter}
          onChange={e => { setMechanicalFilter(e.target.value); setCurrentPage(1); }}
        >
          <option value="">ทั้งหมด</option>
          <option value="ผ่าน">ผ่าน</option>
          <option value="ไม่ผ่าน">ไม่ผ่าน</option>
        </select>
        <label className="font-bold text-gray-700 ml-2">เทปเคมีภายนอก:</label>
        <select
          className="border rounded px-2 py-1 text-black bg-white"
          value={chemicalExternalFilter}
          onChange={e => { setChemicalExternalFilter(e.target.value); setCurrentPage(1); }}
        >
          <option value="">ทั้งหมด</option>
          <option value="ผ่าน">ผ่าน</option>
          <option value="ไม่ผ่าน">ไม่ผ่าน</option>
        </select>
        <label className="font-bold text-gray-700 ml-2">เทปเคมีภายใน:</label>
        <select
          className="border rounded px-2 py-1 text-black bg-white"
          value={chemicalInternalFilter}
          onChange={e => { setChemicalInternalFilter(e.target.value); setCurrentPage(1); }}
        >
          <option value="">ทั้งหมด</option>
          <option value="ผ่าน">ผ่าน</option>
          <option value="ไม่ผ่าน">ไม่ผ่าน</option>
        </select>
        <label className="font-bold text-gray-700 ml-2">ชีวภาพ:</label>
        <select
          className="border rounded px-2 py-1 text-black bg-white"
          value={bioTestFilter}
          onChange={e => { setBioTestFilter(e.target.value); setCurrentPage(1); }}
        >
          <option value="">ทั้งหมด</option>
          <option value="ผ่าน">ผ่าน</option>
          <option value="ไม่ผ่าน">ไม่ผ่าน</option>
        </select>
        <button
          className="ml-2 px-4 py-2 rounded bg-green-500 hover:bg-green-700 text-white font-bold shadow"
          onClick={handleExportCsv}
        >
          ⬇️ Export CSV
        </button>
        {/* ปุ่มล้างตัวกรอง */}
        {/* <button
          className="ml-2 px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold"
          onClick={() => {
            setMechanicalFilter('');
            setChemicalExternalFilter('');
            setChemicalInternalFilter('');
            setBioTestFilter('');

            setFilter('All');
            setAutoclaveSub('All');
            setCurrentPage(1);
          }}
        >ล้างตัวกรอง</button> */}
      </div>
      {/* Filtered count */}
      <div className="mb-2 text-gray-700 font-semibold">แสดง {filteredLoads.length} รายการ</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mt-4">
        {paginatedLoads.map(load => (
          <div key={`${load.date || ''}-${load.program || ''}-${load.created_at?.seconds || ''}`} className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-blue-200 flex flex-col gap-4 cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
            onClick={e => {
              if ((e.target as HTMLElement).tagName === 'IMG' || (e.target as HTMLElement).closest('button,input,label')) return;
              setEditForm(load);
            }}
          >
            {/* Header - Blue row on top */}
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-lg text-blue-700">
                {load.date || "-"} | {load.sterilizer || "-"}
              </div>
              <div className="text-xs text-gray-400">{load.program || "-"}</div>
            </div>
            {/* SN, เวลา, Duration Display - Black row below */}
            {(load.attest_sn || load.attest_time || load.total_duration) && (
              <div className="text-sm text-black font-semibold flex flex-wrap gap-6 items-center">
                {load.attest_sn && <span>SN: <span className="font-bold">{load.attest_sn}</span></span>}
                {load.attest_time && <span>เวลา: <span className="font-bold">{load.attest_time}</span></span>}
                {load.total_duration && <span>เวลารวม: <span className="font-bold">{load.total_duration}</span> นาที</span>}
              </div>
            )}

            {/* ข้อมูลหลัก */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-black">
              <div><span className="font-semibold">ผลกลไก:</span> {load.mechanical || "-"}</div>
              <div><span className="font-semibold">ผลเคมีภายนอก:</span> {load.chemical_external || "-"}</div>
              <div><span className="font-semibold">ผลเคมีภายใน:</span> {load.chemical_internal || "-"}</div>
              <div><span className="font-semibold">ผลชีวภาพ:</span> {load.bio_test || "-"}</div>
              <div><span className="font-semibold">เจ้าหน้าที่:</span> {load.sterile_staff || "-"}</div>
              <div><span className="font-semibold">ผู้อ่านผล:</span> {load.result_reader || "-"}</div>
            </div>
            {/* ชุดอุปกรณ์ */}
            {load.items && load.items.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <div className="font-bold text-black mb-1">ชุดอุปกรณ์ ({load.items.length} รายการ)</div>
                <table className="w-full text-xs border border-black mb-2 bg-white min-w-[400px]">
                  <thead>
                    <tr>
                      <th className="border border-black p-1 text-black">NO</th>
                      <th className="border border-black p-1 text-black">ชื่อ/กลุ่มอุปกรณ์</th>
                      <th className="border border-black p-1 text-black">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {load.items.slice(0, 5).map((item: any, idx: number) => (
                      <tr key={idx} className="text-black">
                        <td className="border border-black p-1 text-center text-black">{idx + 1}</td>
                        <td className="border border-black p-1 text-black">{item.name}</td>
                        <td className="border border-black p-1 text-center text-black">{item.quantity}</td>
                      </tr>
                    ))}
                    {load.items.length > 5 && (
                      <tr>
                        <td colSpan={3} className="text-center text-gray-500 border border-black">
                          ...และอีก {load.items.length - 5} รายการ
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {/* รูป */}
            <div className="flex gap-4 mt-2 flex-wrap">
              {[1,2].map(idx => (
                <div key={`image-${load.id}-${idx}`} className="flex flex-col items-center">
                  {load[`image_url_${idx}`] ? (
                    <img src={load[`image_url_${idx}`]} alt={`Sterile ${idx}`} className="w-32 h-32 object-contain border rounded mb-1 bg-gray-50" />
                  ) : (
                    <div className="w-32 h-32 flex items-center justify-center border rounded bg-gray-100 text-gray-400 mb-1">ไม่มีรูป</div>
                  )}
                  <div className="text-xs text-gray-500">{idx === 1 ? 'Sterile Slip' : 'Attest'}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6">
          <button
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold disabled:opacity-50"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            ก่อนหน้า
          </button>
          <span className="font-semibold text-gray-700">หน้า {currentPage} / {totalPages}</span>
          <button
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold disabled:opacity-50"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            ถัดไป
          </button>
        </div>
      )}
      {/* Modal edit, modal image, ... (สามารถแยกเป็น component เพิ่มเติมได้) */}
      {editForm && (
        <EditLoadModal
          editForm={editForm}
          setEditForm={setEditForm}
          onSave={handleEditSave}
          onDelete={handleDelete}
          loading={editLoading}
          deleteLoading={deleteLoading}
          error={editError}
          allLoads={loads}
          user={user}
        />
      )}
    </>
  );
} 