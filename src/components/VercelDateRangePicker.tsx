'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  format, 
  subDays, 
  startOfWeek, 
  startOfMonth, 
  startOfYear, 
  isSameDay, 
  addMonths, 
  subMonths, 
  isSameMonth, 
  isWithinInterval, 
  eachDayOfInterval, 
  endOfMonth, 
  startOfDay, 
  endOfDay,
  isBefore,
  isAfter,
  isToday,
  getDay,
  addDays,
  subWeeks,
  addWeeks,
  addYears,
  subYears
} from 'date-fns';
import { th } from 'date-fns/locale';

type DateRange = {
  startDate: string;
  endDate: string;
};

type Preset = {
  label: string;
  value: string;
  getRange: () => { startDate: Date; endDate: Date };
};

interface VercelDateRangePickerProps {
  onDateRangeChange: (range: DateRange) => void;
  initialRange?: DateRange;
  className?: string;
}

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function getMonthDays(date: Date) {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const days = eachDayOfInterval({ start, end });
  
  // Add padding days from previous month
  const startDay = getDay(start);
  for (let i = 0; i < startDay; i++) {
    days.unshift(subDays(start, i + 1));
  }
  
  // Add padding days from next month
  const endDay = getDay(end);
  for (let i = 0; i < 6 - endDay; i++) {
    days.push(addDays(end, i + 1));
  }
  
  return days;
}

export function VercelDateRangePicker({
  onDateRangeChange,
  initialRange = { startDate: '', endDate: '' },
  className = '',
}: VercelDateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [range, setRange] = useState<DateRange>(initialRange);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectionState, setSelectionState] = useState<'start' | 'end'>('start');
  const [tempEndDate, setTempEndDate] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Update internal state when initialRange prop changes
  useEffect(() => {
    setRange(initialRange);
    if (!initialRange.startDate && !initialRange.endDate) {
      setSelectedPreset('');
      setSelectionState('start');
      setTempEndDate(null);
    }
  }, [initialRange]);
  
  const days = getMonthDays(currentMonth);
  const nextMonth = addMonths(currentMonth, 1);
  const prevMonth = subMonths(currentMonth, 1);

  const presets: Preset[] = [
    {
      label: 'วันนี้',
      value: 'today',
      getRange: () => {
        const today = new Date();
        return { startDate: today, endDate: today };
      },
    },
    {
      label: 'เมื่อวาน',
      value: 'yesterday',
      getRange: () => {
        const yesterday = subDays(new Date(), 1);
        return { startDate: yesterday, endDate: yesterday };
      },
    },
    {
      label: 'สัปดาห์นี้',
      value: 'thisWeek',
      getRange: () => {
        const today = new Date();
        const start = startOfWeek(today, { locale: th });
        return { startDate: start, endDate: today };
      },
    },
    {
      label: 'เดือนนี้',
      value: 'thisMonth',
      getRange: () => {
        const today = new Date();
        const start = startOfMonth(today);
        return { startDate: start, endDate: today };
      },
    },
    {
      label: 'ปีนี้',
      value: 'thisYear',
      getRange: () => {
        const today = new Date();
        const start = startOfYear(today);
        return { startDate: start, endDate: today };
      },
    },
  ];

  // Format date to YYYY-MM-DD for input[type="date"]
  const formatDate = (date: Date | string): string => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    return format(d, 'yyyy-MM-dd');
  };

  // Format date for display (YYYY/MM/DD)
  const formatDisplayDate = (date: string): string => {
    if (!date) return '';
    return format(new Date(date), 'yyyy/MM/dd');
  };

  // Format date for display in input (YYYY/MM/DD)
  const formatInputDate = (date: string): string => {
    if (!date) return '';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return format(d, 'yyyy/MM/dd');
    } catch {
      return '';
    }
  };

  // Parse date from input (YYYY/MM/DD or YYYY-MM-DD)
  const parseInputDate = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      // Handle both YYYY/MM/DD and YYYY-MM-DD formats
      const separator = dateStr.includes('/') ? '/' : '-';
      const [year, month, day] = dateStr.split(separator);
      
      if (year && month && day) {
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        if (isNaN(date.getTime())) return '';
        return format(date, 'yyyy-MM-dd');
      }
      return '';
    } catch {
      return '';
    }
  };

  // Handle date input change with custom format
  const handleDateInputChange = (type: 'start' | 'end', value: string) => {
    // Allow only numbers and slashes
    const cleaned = value.replace(/[^0-9/]/g, '');
    
    // Auto-format as user types (YYYY/MM/DD)
    let formatted = '';
    for (let i = 0; i < cleaned.length; i++) {
      if (i === 4 || i === 6) {
        formatted += '/';
      }
      if (i < 8) { // Only allow YYYY/MM/DD (8 digits + 2 slashes = 10 chars)
        formatted += cleaned[i];
      }
    }
    
    // Update the visible input value
    if (type === 'start') {
      setRange(prev => ({
        ...prev,
        startDate: formatted.length === 10 ? parseInputDate(formatted) : ''
      }));
    } else {
      setTempEndDate(formatted.length === 10 ? parseInputDate(formatted) : '');
      if (formatted.length === 10) {
        handleDateChange('end', parseInputDate(formatted));
      } else {
        setRange(prev => ({ ...prev, endDate: '' }));
      }
    }
  };

  // Navigate months
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToPrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  
  // Handle preset selection
  const handlePresetSelect = (preset: Preset) => {
    const { startDate, endDate } = preset.getRange();
    const newRange = {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    };
    
    setRange(newRange);
    setSelectedPreset(preset.value);
    onDateRangeChange(newRange);
    setIsOpen(false);
    setSelectionState('start');
  };

  // Clear all selections
  const clearSelections = () => {
    const newRange = { startDate: '', endDate: '' };
    setRange(newRange);
    setSelectedPreset('');
    setSelectionState('start');
    setTempEndDate(null);
    setCurrentMonth(new Date()); // Reset to current month view
    onDateRangeChange(newRange);
    setIsOpen(false); // Close the dropdown
  };

  // Handle date selection from calendar
  const handleDateSelect = (date: Date) => {
    const dateStr = formatDate(date);
    
    if (selectionState === 'start') {
      const newRange = {
        startDate: dateStr,
        endDate: '',
      };
      setRange(newRange);
      setSelectionState('end');
      setTempEndDate(null);
    } else {
      let newStart = range.startDate;
      let newEnd = dateStr;
      
      // If end date is before start date, swap them
      if (newEnd < newStart) {
        [newStart, newEnd] = [newEnd, newStart];
      }
      
      const newRange = {
        startDate: newStart,
        endDate: newEnd,
      };
      
      setRange(newRange);
      setSelectedPreset('');
      onDateRangeChange(newRange);
      setSelectionState('start');
      setTempEndDate(null);
    }
  };
  
  // Handle hover over dates when selecting range
  const handleDateHover = (date: Date) => {
    if (selectionState === 'end' && range.startDate) {
      setTempEndDate(formatDate(date));
    }
  };
  
  // Check if a date is in the selected range
  const isInRange = (date: Date) => {
    if (!range.startDate) return false;
    
    const currentEnd = tempEndDate || range.endDate;
    if (!currentEnd) return false;
    
    const start = startOfDay(new Date(range.startDate));
    const end = endOfDay(new Date(currentEnd));
    const current = startOfDay(date);
    
    return isWithinInterval(current, { start, end });
  };
  
  // Check if a date is the start or end of the range
  const isRangeEdge = (date: Date) => {
    if (!range.startDate) return false;
    
    const dateStr = formatDate(date);
    const currentEnd = tempEndDate || range.endDate;
    
    return dateStr === range.startDate || dateStr === currentEnd;
  };
  
  // Handle custom date changes from input
  const handleDateChange = (type: 'start' | 'end', value: string) => {
    const newRange = { ...range };
    
    if (type === 'start') {
      newRange.startDate = value;
      // If end date is before start date, update it to match start date
      if (newRange.endDate && value > newRange.endDate) {
        newRange.endDate = value;
      }
    } else {
      newRange.endDate = value;
      // If start date is after end date, update it to match end date
      if (newRange.startDate && value < newRange.startDate) {
        newRange.startDate = value;
      }
    }
    
    setRange(newRange);
    setSelectedPreset('');
    onDateRangeChange(newRange);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Format the display text based on the selected range
  const getDisplayText = (): string => {
    if (selectedPreset) {
      const preset = presets.find(p => p.value === selectedPreset);
      if (preset) return preset.label;
    }
    
    if (range.startDate && range.endDate) {
      const start = formatDisplayDate(range.startDate);
      const end = formatDisplayDate(range.endDate);
      
      if (range.startDate === range.endDate) {
        return start;
      }
      
      return `${start} - ${end}`;
    }
    
    if (range.startDate) {
      return `${formatDisplayDate(range.startDate)} - ถึงวันที่...`;
    }
    
    return 'Select Date Range';
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full px-4 h-[38px] text-sm font-medium text-left bg-white border rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 ${
          selectionState === 'end' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <div className="flex items-center">
          <img 
            src="/OIP.jpg" 
            alt="Calendar" 
            className={`w-5 h-5 mr-2 object-contain ${selectionState === 'end' ? 'opacity-100' : 'opacity-70'}`}
          />
          <span className={`truncate ${selectionState === 'end' ? 'text-blue-700 font-semibold' : 'text-gray-700'}`}>
            {getDisplayText() || 'เลือกช่วงวันที่'}
          </span>
        </div>
        <svg
          className={`w-5 h-5 transition-transform duration-200 ${
            isOpen ? 'transform rotate-180' : ''
          } ${selectionState === 'end' ? 'text-blue-500' : 'text-gray-400'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg w-[300px] sm:w-[600px]">
          <div className="p-3 border-b border-gray-100">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">ช่วงเวลาที่กำหนดไว้ล่วงหน้า</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className={`px-2.5 py-1.5 text-xs rounded-md text-center transition-colors ${
                    selectedPreset === preset.value
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="p-3 border-t border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Calendar View */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setCurrentMonth(subYears(currentMonth, 1))}
                      className="p-1 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-md"
                      title="ปีที่แล้ว"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={goToPrevMonth}
                      className="p-1 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-md"
                      title="เดือนที่แล้ว"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="text-sm font-medium text-gray-900">
                    {format(currentMonth, 'MMMM yyyy', { locale: th })}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={goToNextMonth}
                      className="p-1 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-md"
                      title="เดือนหน้า"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentMonth(addYears(currentMonth, 1))}
                      className="p-1 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-md"
                      title="ปีหน้า"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="h-6 flex items-center justify-center">
                      {day}
                    </div>
                  ))}
                </div>
                
                <div className="grid grid-cols-7 gap-1 mt-1">
                  {days.map((day, idx) => {
                    const dayStr = formatDate(day);
                    const isSelected = isRangeEdge(day);
                    const inRange = isInRange(day);
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isTodayDate = isToday(day);
                    const isStart = range.startDate === dayStr;
                    const isEnd = (tempEndDate || range.endDate) === dayStr;
                    const isSelecting = selectionState === 'end' && range.startDate;
                    
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleDateSelect(day)}
                        onMouseEnter={() => handleDateHover(day)}
                        className={`h-8 w-8 mx-auto rounded-full text-sm flex items-center justify-center relative transition-colors
                          ${!isCurrentMonth ? 'text-gray-300' : 'text-gray-700'}
                          ${isTodayDate && !isSelected ? 'font-bold' : ''}
                          ${isSelected ? 'bg-blue-600 text-white' : ''}
                          ${inRange && !isSelected ? 'bg-blue-100' : ''}
                          ${isCurrentMonth ? 'hover:bg-gray-100' : ''}
                          ${isSelecting ? 'cursor-pointer' : ''}
                        `}
                      >
                        {day.getDate()}
                        {isStart && (
                          <span className="absolute -bottom-1 left-1/2 w-1/2 h-1 bg-blue-600 rounded-full transform -translate-x-1/2"></span>
                        )}
                        {isEnd && (
                          <span className="absolute -bottom-1 left-1/2 w-1/2 h-1 bg-blue-600 rounded-full transform -translate-x-1/2"></span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Date Display - Read Only */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">ตั้งแต่</label>
                    <div className="relative">
                      <div className="relative">
                        <input
                          type="text"
                          readOnly
                          value={range.startDate ? formatInputDate(range.startDate) : ''}
                          placeholder="เลือกจากปฏิทิน"
                          className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm bg-gray-50 cursor-pointer"
                          onClick={() => setIsOpen(true)}
                        />
                        {range.startDate && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRange(prev => ({ ...prev, startDate: '' }));
                            }}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">ถึง</label>
                    <div className="relative">
                      <div className="relative">
                        <input
                          type="text"
                          readOnly
                          value={range.endDate ? formatInputDate(range.endDate) : ''}
                          placeholder="เลือกจากปฏิทิน"
                          className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm bg-gray-50 cursor-pointer"
                          onClick={() => setIsOpen(true)}
                        />
                        {range.endDate && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRange(prev => ({ ...prev, endDate: '' }));
                            }}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                      {selectionState === 'end' ? 'เลือกวันที่สิ้นสุด' : 'เลือกวันที่เริ่มต้น'}
                    </span>
                    <button
                      type="button"
                      onClick={clearSelections}
                      className="text-xs text-gray-600 hover:text-gray-800 font-medium"
                    >
                      ล้างการเลือก
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}