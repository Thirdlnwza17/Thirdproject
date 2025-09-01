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
  ChartData,
  ChartOptions,
  ArcElement
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

export interface ProgramAnalyticsData {
  labels: string[];
  successRates: number[];
  avgDurations: number[];
  totalCounts: number[];
}

interface Props {
  data: ProgramAnalyticsData;
  weekdayData?: {
    labels: string[];
    counts: number[];
  };
}

const ProgramAnalyticsChart: React.FC<Props> = ({ data, weekdayData }) => {
  const [showPieChart, setShowPieChart] = useState(false);

  // Calculate total count for percentage calculation
  const totalCount = data.totalCounts.reduce((sum, count) => sum + count, 0) || 1;
  // Calculate percentage for each program
  const percentageCounts = data.totalCounts.map(count => {
    const percentage = (count / totalCount) * 100;
    // Ensure at least 5% height for visibility when there's data
    return count > 0 ? Math.max(5, Math.round(percentage)) : 0;
  });

  // Filter out programs with no data
  const hasData = (index: number) => data.totalCounts[index] > 0;
  const filteredLabels = data.labels.filter((_, i) => hasData(i));
  
  // Prepare pie chart data for weekday usage - show all days
  const pieData: ChartData<'pie', number[], string> = {
    labels: weekdayData ? weekdayData.labels : [],
    datasets: [
      {
        data: weekdayData ? weekdayData.counts : [],
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
          color: '#6B7280',
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
        color: '#6B7280',
        padding: {
          top: 10,
          bottom: 20,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#6B7280',
        bodyColor: '#6B7280',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.raw as number;
            const totalWeekdayCount = weekdayData ? weekdayData.counts.reduce((sum, count) => sum + count, 0) : 0;
            if (value === 0) {
              return `${label}: ไม่มีข้อมูล`;
            }
            const percentage = totalWeekdayCount > 0 ? Math.round((value / totalWeekdayCount) * 100) : 0;
            return `${label}: ${value} รอบ (${percentage}%)`;
          },
        },
      },
    },
  };
  
  const barData = {
    labels: filteredLabels.length > 0 ? filteredLabels : ['โปรแกรม'],
    datasets: [
      {
        label: "อัตราความสำเร็จ (%)",
        data: data.labels.map((_, i) => hasData(i) ? data.successRates[i] : null),
        backgroundColor: (context: any) => {
          const bgColor = CHART_COLORS.successRate;
          const gradient = context.chart.ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, `${bgColor}cc`);
          gradient.addColorStop(1, `${bgColor}66`);
          return gradient;
        },
        borderColor: CHART_COLORS.successRate,
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'y',
        barThickness: 30,
        shadowColor: 'rgba(0, 0, 0, 0.1)',
        shadowBlur: 4,
        shadowOffsetX: 1,
        shadowOffsetY: 1,
      },
      {
        label: "สัดส่วนรอบทั้งหมด (%)",
        data: data.labels.map((_, i) => hasData(i) ? percentageCounts[i] : null),
        backgroundColor: (context: any) => {
          const bgColor = CHART_COLORS.totalCount;
          const gradient = context.chart.ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, `${bgColor}99`);
          gradient.addColorStop(1, `${bgColor}33`);
          return gradient;
        },
        borderColor: CHART_COLORS.totalCount,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
        yAxisID: 'y1',
        barThickness: 30,
        type: 'bar' as const,
        order: 2,
      },
      {
        label: "เวลาเฉลี่ย (นาที)",
        data: data.labels.map((_, i) => hasData(i) ? data.avgDurations[i] : null),
        backgroundColor: (context: any) => {
          const bgColor = CHART_COLORS.avgTime;
          const gradient = context.chart.ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, `${bgColor}cc`);
          gradient.addColorStop(1, `${bgColor}66`);
          return gradient;
        },
        borderColor: CHART_COLORS.avgTime,
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'y1',
        barThickness: 30,
        shadowColor: 'rgba(0, 0, 0, 0.2)',
        shadowBlur: 8,
        shadowOffsetX: 2,
        shadowOffsetY: 2,
      },
    ],
  };

  const barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        position: "top" as const,
        labels: {
          font: {
            size: 12,
            weight: 'bold'
          },
          padding: 8,
          usePointStyle: true,
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#1F2937',
        bodyColor: '#1F2937',
        borderColor: '#E5E7EB',
        borderWidth: 1,
        padding: 8,
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              if (label.includes('อัตรา')) {
                label += context.parsed.y.toFixed(1) + '%';
              } else if (label.includes('เวลาเฉลี่ย')) {
                label += context.parsed.y.toFixed(1) + ' นาที';
              } else if (label.includes('สัดส่วนรอบทั้งหมด')) {
                const index = context.dataIndex;
                const actualCount = data.totalCounts[index];
                const percentage = Math.round((actualCount / totalCount) * 100);
                label = `สัดส่วน: ${percentage}% (${actualCount} รอบ)`;
              }
            }
            return label;
          }
        }
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#6B7280',
          font: {
            weight: 'bold',
            family: '"Kanit", sans-serif',
            size: 10,
          },
        },
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: false,
          text: 'อัตราความสำเร็จและสัดส่วนการใช้งาน',
          font: {
            size: 10,
            weight: 'bold'
          },
          padding: { bottom: 2 }
        },
        grid: {
          color: '#E5E7EB',
        },
        ticks: {
          color: CHART_COLORS.successRate,
          callback: function(value) {
            if (typeof value === 'number') {
              return `${value}%`;
            }
            return value;
          },
        },
        max: 110,
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: false,
          text: 'สัดส่วนรอบทั้งหมด (%)',
          color: CHART_COLORS.totalCount,
          font: {
            size: 9,
            weight: 'bold'
          }
        },
        min: 0,
        max: 100,
        suggestedMin: 0,
        suggestedMax: 100,
        beginAtZero: true,
        grid: {
          display: false,
        },
        ticks: {
          color: CHART_COLORS.totalCount,
          callback: function(value) {
            if (typeof value === 'number') {
              return `${value}%`;
            }
            return value;
          },
          stepSize: 20,
          maxTicksLimit: 6,
        },
        afterFit: function(scale) {
          scale.paddingTop = 10;
          scale.paddingBottom = 10;
        }
      },
    },
    elements: {
      bar: {
        borderSkipped: false,
      },
    },
  };



  return (
    <div className="w-full h-full flex flex-col">
      <div className="mb-2 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-800">สถิติการทำงาน</h3>
        <button
          onClick={() => setShowPieChart(!showPieChart)}
          className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors duration-200"
        >
          {showPieChart ? 'แสดงกราฟแท่ง' : 'แสดงกราฟวงกลม'}
        </button>
      </div>
      <div className="flex-1 w-full overflow-x-auto">
        <div className="min-w-[600px] h-full">
          {showPieChart ? (
            <Pie 
              data={pieData} 
              options={pieOptions}
              className="w-full h-full" 
            />
          ) : (
            <Bar 
              data={barData} 
              options={{
                ...barOptions,
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  ...barOptions.plugins,
                  legend: {
                    ...barOptions.plugins?.legend,
                    labels: {
                      ...barOptions.plugins?.legend?.labels,
                      font: {
                        size: typeof window !== 'undefined' && window.innerWidth < 640 ? 10 : 12,
                      },
                    },
                  },
                },
              }}
              className="w-full h-full min-h-[300px]"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgramAnalyticsChart;
