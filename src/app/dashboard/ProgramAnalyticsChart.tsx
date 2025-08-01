'use client';

import React, { useState } from "react";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  ChartData,
  ChartOptions
} from "chart.js";
import { CHART_COLORS } from "./constants";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

export interface WeekdayData {
  labels: string[];
  counts: number[];
}

export interface ProgramAnalyticsData {
  labels: string[];
  successRates: number[];
  avgDurations: number[];
  totalCounts: number[];
  weekdays?: WeekdayData;
}

interface Props {
  data: ProgramAnalyticsData;
}

const ProgramAnalyticsChart: React.FC<Props> = ({ data }) => {
  const [showPieChart, setShowPieChart] = useState(false);
  const weekdays = data.weekdays || { labels: [], counts: [] };
  const hasWeekdayData = weekdays.labels?.length > 0 && 
                       weekdays.counts?.length > 0 && 
                       weekdays.counts.some(count => count > 0);

  const barData = {
    labels: data.labels,
    datasets: [
      {
        label: "อัตราความสำเร็จ (%)",
        data: data.successRates,
        backgroundColor: CHART_COLORS.successRate,
        borderColor: CHART_COLORS.successRate,
        borderWidth: 1,
        yAxisID: 'y',
      },
      {
        label: "จำนวนรอบทั้งหมด",
        data: data.totalCounts,
        backgroundColor: CHART_COLORS.totalCount,
        borderColor: CHART_COLORS.totalCount,
        borderWidth: 1,
        yAxisID: 'y',
      },
      {
        label: "เวลาเฉลี่ย (นาที)",
        data: data.avgDurations,
        backgroundColor: CHART_COLORS.avgTime,
        borderColor: CHART_COLORS.avgTime,
        borderWidth: 1,
        yAxisID: 'y1',
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        position: "top" as const,
        labels: {
          font: {
            size: 12,
          },
        },
      },
      title: { 
        display: true, 
        text: "การวิเคราะห์ตามประเภทโปรแกรม",
        font: {
          size: 16,
          weight: 'bold' as const,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'อัตราความสำเร็จ (%)' },
        min: 0,
        max: 100,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
      y1: {
        beginAtZero: true,
        position: 'right' as const,
        title: { display: true, text: 'เวลาเฉลี่ย (นาที)' },
        grid: { drawOnChartArea: false },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  // Prepare pie chart data
  const pieData: ChartData<'pie', number[], string> = {
    labels: weekdays.labels,
    datasets: [
      {
        data: weekdays.counts,
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)',   // Monday - Blue
          'rgba(255, 99, 132, 0.8)',   // Tuesday - Red
          'rgba(255, 206, 86, 0.8)',   // Wednesday - Yellow
          'rgba(75, 192, 192, 0.8)',   // Thursday - Teal
          'rgba(153, 102, 255, 0.8)',  // Friday - Purple
          'rgba(255, 159, 64, 0.8)',   // Saturday - Orange
          'rgba(201, 203, 207, 0.8)'   // Sunday - Gray
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)',
          'rgba(201, 203, 207, 1)'
        ],
        borderWidth: 1,
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
          },
        },
      },
      title: {
        display: true,
        text: 'จำนวนรอบการใช้งานแยกตามวันในสัปดาห์',
        font: {
          size: 16,
          weight: 'bold' as const,
        },
      },
      tooltip: {
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

  return (
    <div className="w-full h-[600px] bg-white rounded-xl shadow-lg p-6 relative">
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => setShowPieChart(!showPieChart)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showPieChart ? 'แสดงกราฟแท่ง' : 'แสดงกราฟวงกลม'}
        </button>
      </div>
      <div className="h-[calc(100%-40px)] w-full">
        {showPieChart && hasWeekdayData ? (
          <div className="h-full w-full flex items-center justify-center">
            <Pie 
              data={pieData} 
              options={{
                ...pieOptions,
                plugins: {
                  ...pieOptions.plugins,
                  legend: {
                    ...pieOptions.plugins?.legend,
                    labels: {
                      font: {
                        size: 14,
                      },
                    },
                  },
                },
              }} 
              className="max-h-full" 
            />
          </div>
        ) : showPieChart && !hasWeekdayData ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            ไม่พบข้อมูลการใช้งานในสัปดาห์นี้
          </div>
        ) : (
          <Bar 
            data={barData} 
            options={{
              ...barOptions,
              plugins: {
                ...barOptions.plugins,
                legend: {
                  ...barOptions.plugins?.legend,
                  labels: {
                    font: {
                      size: 14,
                    },
                  },
                },
              },
            }} 
            className="max-h-full" 
          />
        )}
      </div>
    </div>
  );
};

export default ProgramAnalyticsChart;
