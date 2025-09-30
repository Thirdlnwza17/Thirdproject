'use client';

import React from "react";
import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartData,
  ChartOptions
} from "chart.js";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend
);

export interface WeekdayData {
  labels: string[];
  counts: number[];
}

interface Props {
  weekdays: WeekdayData;
}

const WeekdayPieChart: React.FC<Props> = ({ weekdays }) => {
  const hasWeekdayData = weekdays.labels?.length > 0 && 
                       weekdays.counts?.length > 0 && 
                       weekdays.counts.some((count: number) => count > 0);

  
  const pieData: ChartData<'pie', number[], string> = {
    labels: weekdays.labels,
    datasets: [
      {
        data: weekdays.counts,
        backgroundColor: [
          'rgba(255, 99, 132, 0.8)',   // Monday - Red
          'rgba(54, 162, 235, 0.8)',   // Tuesday - Blue
          'rgba(255, 206, 86, 0.8)',   // Wednesday - Yellow
          'rgba(75, 192, 192, 0.8)',   // Thursday - Teal
          'rgba(255, 159, 64, 0.8)',   // Friday - Orange
          'rgba(153, 102, 255, 0.8)',  // Saturday - Purple
          'rgba(201, 203, 207, 0.8)'   // Sunday - Gray
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(255, 159, 64, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(201, 203, 207, 1)'
        ],
        borderWidth: 2,
        hoverBorderWidth: 3,
      },
    ],
  };

  const pieOptions: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          font: {
            size: 12,
            weight: 'bold',
          },
          padding: 15,
          usePointStyle: true,
        },
      },
      title: {
        display: true,
        text: 'จำนวนรอบการใช้งานแยกตามวันในสัปดาห์',
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        color: '#1F2937',
        padding: {
          top: 10,
          bottom: 20,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#1F2937',
        bodyColor: '#1F2937',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.raw as number;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = Math.round((value / total) * 100);
            return `${label}: ${value} รอบ (${percentage}%)`;
          },
        },
      },
    },
  };

  if (!hasWeekdayData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="text-4xl mb-2">📊</div>
          <div className="text-lg font-medium">ไม่พบข้อมูลการใช้งานในสัปดาห์นี้</div>
          <div className="text-sm text-gray-400">กรุณาเลือกช่วงวันที่อื่น</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Pie 
        data={pieData} 
        options={pieOptions}
        className="max-h-full" 
      />
    </div>
  );
};

export default WeekdayPieChart;
