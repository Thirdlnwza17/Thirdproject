
export const MAIN_PROGRAMS = [
  { key: "EO", label: "EO" },
  { key: "Plasma", label: "Plasma" },
  { key: "Autoclave", label: "Autoclave" },
];

export const AUTOCLAVE_SUBPROGRAMS = [
  { key: "BOWIE", label: "BOWIE" },
  { key: "PREVAC", label: "PREVAC" },
];

export const STATUS_OPTIONS = ["PASS", "FAIL"] as const;

// Chemical, Mechanical, and Biological indicator filters
export const INDICATOR_FILTERS = [
  { key: "CHEMICAL_EXTERNAL", label: "เทปเคมีภายนอก" },
  { key: "CHEMICAL_INTERNAL", label: "เทปเคมีภายใน" },
  { key: "MECHANICAL", label: "กลไก" },
  { key: "BIOLOGICAL", label: "ชีวภาพ" },
];

export const PROGRAM_FILTERS = [
  { key: "ALL", label: "ทั้งหมด" },
  ...MAIN_PROGRAMS,
  ...AUTOCLAVE_SUBPROGRAMS,
];

export const ALL_FILTERS = [
  ...PROGRAM_FILTERS,
  ...INDICATOR_FILTERS,
];

export const TIME_RANGE_FILTERS = [
  { key: 'TODAY', label: 'วันนี้' },
  { key: 'WEEK', label: 'สัปดาห์นี้' },
  { key: 'MONTH', label: 'เดือนนี้' },
  { key: 'YEAR', label: 'ปีนี้' },
];

export const CHART_COLORS = {
  successRate: "#10b981",
  avgTime: "#f59e0b", 
  totalCount: "#3b82f6",
  background: ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"],
};
