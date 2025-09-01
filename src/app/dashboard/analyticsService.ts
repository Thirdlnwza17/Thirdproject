// Analytics service for dashboard program analysis

// กำหนด interface สำหรับผลการตรวจสอบแต่ละตัว (Indicator)
export interface CheckboxResults {
  chemical_external?: string; // เทปเคมีภายนอก
  chemical_internal?: string; // เทปเคมีภายใน
  mechanical?: string;        // กลไก
  biological?: string;        // ชีวภาพ
}

export interface SterilizerEntry {
  id: string;
  status: "PASS" | "FAIL" | "CANCEL";
  program_name?: string;
  created_at?: { toDate: () => Date };
  created_by?: string;
  duration_min?: number;
  sterilization_time?: string;
  checkboxResults?: CheckboxResults;
  [key: string]: unknown;
}

export interface ProgramAnalytics {
  label: string;
  description?: string;
  total: number;
  successRate: number;
  avgTime: number;
  indicatorStats: {
    [indicatorKey: string]: {
      pass: number;
      fail: number;
    }
  };
}

export function getProgramGroup(entry: SterilizerEntry): string {
  if (!entry.program_name) return "อื่นๆ";
  const program = entry.program_name.toUpperCase();
  
  if (program === "EO") return "EO";
  if (program === "PLASMA") return "Plasma";
  if (program === "AUTOCLAVE") return "Autoclave";
  if (program === "BOWIE") return "BOWIE";
  if (program === "PREVAC") return "PREVAC";
  
  return "อื่นๆ";
}

export function calculateProgramAnalytics(
  entries: SterilizerEntry[],
  programKey: string
): ProgramAnalytics {
  let filteredEntries: SterilizerEntry[];
  
  if (programKey === "Autoclave") {
    // Include Autoclave, BOWIE, and PREVAC
    filteredEntries = entries.filter(e => {
      const group = getProgramGroup(e);
      return group === "Autoclave" || group === "BOWIE" || group === "PREVAC";
    });
  } else {
    filteredEntries = entries.filter(e => getProgramGroup(e) === programKey);
  }
  
  const total = filteredEntries.length;
  const passCount = filteredEntries.filter(e => e.status === "PASS").length;

  // Indicator pass/fail stats
  const indicatorStats: { [indicatorKey: string]: { pass: number; fail: number } } = {
    mechanical: { pass: 0, fail: 0 },
    biological: { pass: 0, fail: 0 },
    chemical_external: { pass: 0, fail: 0 },
    chemical_internal: { pass: 0, fail: 0 },
  };
  filteredEntries.forEach(entry => {
    const cr = entry.checkboxResults || {};
    // กลไก
    if ((typeof cr.mechanical === 'boolean' && cr.mechanical === false) || cr.mechanical === "ไม่ผ่าน") indicatorStats.mechanical.fail++;
    else if ((typeof cr.mechanical === 'boolean' && cr.mechanical === true) || cr.mechanical === "ผ่าน") indicatorStats.mechanical.pass++;
    // รองรับกรณี string 'true'/'false'
    else if (cr.mechanical === 'false') indicatorStats.mechanical.fail++;
    else if (cr.mechanical === 'true') indicatorStats.mechanical.pass++;
    // ชีวภาพ
    if ((typeof cr.biological === 'boolean' && cr.biological === false) || cr.biological === "ไม่ผ่าน") indicatorStats.biological.fail++;
    else if ((typeof cr.biological === 'boolean' && cr.biological === true) || cr.biological === "ผ่าน") indicatorStats.biological.pass++;
    else if (cr.biological === 'false') indicatorStats.biological.fail++;
    else if (cr.biological === 'true') indicatorStats.biological.pass++;
    // เทปเคมีภายนอก
    if ((typeof cr.chemical_external === 'boolean' && cr.chemical_external === false) || cr.chemical_external === "ไม่ผ่าน") indicatorStats.chemical_external.fail++;
    else if ((typeof cr.chemical_external === 'boolean' && cr.chemical_external === true) || cr.chemical_external === "ผ่าน") indicatorStats.chemical_external.pass++;
    else if (cr.chemical_external === 'false') indicatorStats.chemical_external.fail++;
    else if (cr.chemical_external === 'true') indicatorStats.chemical_external.pass++;
    // เทปเคมีภายใน
    if ((typeof cr.chemical_internal === 'boolean' && cr.chemical_internal === false) || cr.chemical_internal === "ไม่ผ่าน") indicatorStats.chemical_internal.fail++;
    else if ((typeof cr.chemical_internal === 'boolean' && cr.chemical_internal === true) || cr.chemical_internal === "ผ่าน") indicatorStats.chemical_internal.pass++;
    else if (cr.chemical_internal === 'false') indicatorStats.chemical_internal.fail++;
    else if (cr.chemical_internal === 'true') indicatorStats.chemical_internal.pass++;
  });
  const successRate = total > 0 ? Math.round((passCount / total) * 100) : 0;
  
  // Calculate average time
  let avgTime = 0;
  if (total > 0) {
    const totalTime = filteredEntries.reduce((sum, entry) => {
      // Try to extract time from duration_min or sterilization_time
      let timeInMinutes = 0;
      
      if (typeof entry.duration_min === 'number') {
        timeInMinutes = entry.duration_min;
      } else if (entry.sterilization_time) {
        // แปลง sterilization_time เป็นนาที
        const timeStr = String(entry.sterilization_time);
        if (/\d+:\d+/.test(timeStr)) {
          // รูปแบบ HH:MM
          const [h, m] = timeStr.split(':').map(Number);
          timeInMinutes = h * 60 + m;
        } else if (/\d+\s*min/.test(timeStr)) {
          // รูปแบบ "120 min"
          timeInMinutes = parseInt(timeStr);
        } else if (!isNaN(Number(timeStr))) {
          // เป็นตัวเลขล้วน
          timeInMinutes = Number(timeStr);
        }
      } else if (entry.total_duration !== undefined && entry.total_duration !== null) {
        // รองรับ total_duration (string หรือ number)
        // ถ้าเป็นโปรแกรม EO ให้ตีความเป็นชั่วโมง (hours)
        const td = entry.total_duration;
        let num = 0;
        if (typeof td === 'number') {
          num = td;
        } else if (typeof td === 'string' && td.trim() !== '') {
          num = parseFloat(td);
        }
        // ใช้ค่าเวลาตามที่บันทึกไว้ ไม่ต้องแปลง
        timeInMinutes = num;
      }
      
      return sum + timeInMinutes;
    }, 0);
    
    avgTime = Math.round((totalTime / total) * 10) / 10;
  }
  
  return {
    label: programKey === "Autoclave" ? "Autoclave (รวม)" : programKey,
    total,
    successRate,
    avgTime,
    indicatorStats,
  };

}
