import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useBranch } from '../../context/BranchContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Download, TrendingUp, TrendingDown, DollarSign, ShoppingCart } from 'lucide-react';
import { createPdfBlob, createXlsxBlob } from '../../utils/reportExportGenerators';

export default function ReportsPage() {
  const { selectedLocationId } = useBranch();
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchReports();
  }, [dateRange, selectedLocationId]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/reports/weekly?start_date=${dateRange.startDate}&end_date=${dateRange.endDate}`);
      
      setReportData({
        summary: response.data.summary,
        daily_sales: response.data.sales_by_day,
        sales_by_category: response.data.sales_by_category || [],
        top_products: response.data.top_products || [],
        payment_methods: response.data.payment_methods || []
      });
    } catch (err) {
      console.error('Failed to fetch reports:', err);
      setReportData({
        summary: { total_sales: 0, total_expenses: 0, net_profit: 0, avg_transaction: 0 },
        daily_sales: [],
        sales_by_category: [],
        top_products: [],
        payment_methods: []
      });
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
  
  const salesByCategory = reportData?.sales_by_category || [];
  const dailySales = reportData?.daily_sales || [];
  const paymentMethods = reportData?.payment_methods || [];


  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const reportSummaryRows = [
    ['metric', 'value'],
    ['total_sales', Number(reportData?.summary?.total_sales || 0).toFixed(2)],
    ['total_expenses', Number(reportData?.summary?.total_expenses || 0).toFixed(2)],
    ['net_profit', Number(reportData?.summary?.net_profit || 0).toFixed(2)],
    ['avg_transaction', Number(reportData?.summary?.avg_transaction || 0).toFixed(2)],
  ];

  const dailySalesRows = [
    ['date', 'daily_sales'],
    ...dailySales.map((item) => [item.date, Number(item.total_sales || 0).toFixed(2)]),
  ];

  const exportWeeklyCsv = async () => {
    try {
      const response = await api.get(
        `/reports/weekly/export?start_date=${dateRange.startDate}&end_date=${dateRange.endDate}`,
        { responseType: 'blob' }
      );
      downloadBlob(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }), `report-${dateRange.startDate}-to-${dateRange.endDate}.csv`);
    } catch (err) {
      console.error('Failed to export report:', err);
    }
  };

  const buildExecutivePdfLines = () => [
    'report',
    `period: ${dateRange.startDate} to ${dateRange.endDate}`,
    '',
    ...reportSummaryRows.slice(1).map(([key, value]) => `${key}: ${value}`),
  ];

  const buildDetailedPdfLines = () => [
    'report',
    `period: ${dateRange.startDate} to ${dateRange.endDate}`,
    '',
    'summary',
    ...reportSummaryRows.slice(1).map(([key, value]) => `${key}: ${value}`),
    '',
    'daily_sales',
    ...dailySalesRows.slice(1).map(([date, value]) => `${date}: ${value}`),
    '',
    'payment_methods',
    ...paymentMethods.map((method) => `${method.payment_method || 'unknown'}: ${Number(method.total || 0).toFixed(2)} (${Number(method.count || 0)} transactions)`),
    '',
    'top_products',
    ...(reportData?.top_products || []).map((item) => `${item.name || 'unknown'}: ${Number(item.revenue || 0).toFixed(2)}`),
  ];

  const exportExecutivePdf = () => {
    const blob = createPdfBlob(buildExecutivePdfLines());
    downloadBlob(blob, `report-executive-${dateRange.startDate}-to-${dateRange.endDate}.pdf`);
  };

  const exportDetailedPdf = () => {
    const blob = createPdfBlob(buildDetailedPdfLines());
    downloadBlob(blob, `report-detailed-${dateRange.startDate}-to-${dateRange.endDate}.pdf`);
  };

  const exportXlsx = () => {
    const blob = createXlsxBlob([
      { name: 'summary', rows: reportSummaryRows },
      { name: 'daily_sales', rows: dailySalesRows },
    ]);
    downloadBlob(blob, `report-${dateRange.startDate}-to-${dateRange.endDate}.xlsx`);
  };

  const exportFullBundle = async () => {
    await exportWeeklyCsv();
    exportXlsx();
    exportExecutivePdf();
    exportDetailedPdf();
  };

  const stats = [
    {
      title: 'Total Sales',
      value: `$${reportData?.summary?.total_sales?.toFixed(2) || '0.00'}`,
      icon: DollarSign,
      color: 'var(--success)',
      change: '+12.5%'
    },
    {
      title: 'Total Expenses',
      value: `$${reportData?.summary?.total_expenses?.toFixed(2) || '0.00'}`,
      icon: TrendingDown,
      color: 'var(--danger)',
      change: '-3.2%'
    },
    {
      title: 'Net Profit',
      value: `$${reportData?.summary?.net_profit?.toFixed(2) || '0.00'}`,
      icon: TrendingUp,
      color: 'var(--primary)',
      change: '+18.7%'
    },
    {
      title: 'Avg. Transaction',
      value: `$${reportData?.summary?.avg_transaction?.toFixed(2) || '0.00'}`,
      icon: ShoppingCart,
      color: 'var(--info)',
      change: '+5.1%'
    }
  ];

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="reports-page">
      <div className="page-header">
        <h2>Report</h2>
        <div className="date-filter">
          <div className="input-group">
            <input
              type="date"
              className="form-control"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
            />
            <span className="input-group-text">to</span>
            <input
              type="date"
              className="form-control"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
            />
          </div>
        </div>
      </div>

      <div className="stats-grid mb-4">
        {stats.map((stat, idx) => (
          <div key={idx} className="stat-card card">
            <div className="stat-icon" style={{ background: stat.color }}>
              <stat.icon size={24} color="white" />
            </div>
            <div className="stat-content">
              <div className="stat-label">{stat.title}</div>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-change" style={{ color: stat.change.startsWith('+') ? 'var(--success)' : 'var(--danger)' }}>
                {stat.change}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <h3>Daily Sales Trend</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailySales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Sales']}
                  labelFormatter={(date) => new Date(date).toLocaleDateString()}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="total_sales" 
                  stroke="var(--primary)" 
                  strokeWidth={2}
                  name="Daily Sales"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Sales by Category</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              {salesByCategory.length > 0 ? (
                <PieChart>
                  <Pie
                    data={salesByCategory}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="revenue"
                    nameKey="category"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {salesByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
                  <Legend />
                </PieChart>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                  <p className="text-muted">No sales by category data available</p>
                </div>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="details-grid">
        <div className="card">
          <div className="card-header">
            <h3>Top Products</h3>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reportData?.top_products || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']} />
                <Legend />
                <Bar dataKey="revenue" fill="var(--success)" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Payment Methods</h3>
          </div>
          <div className="card-body">
            <div className="payment-methods">
              {(paymentMethods && paymentMethods.length > 0) ? 
                paymentMethods.map((method, idx) => (
                  <div key={idx} className="payment-method-item">
                    <div className="payment-method-label">{method.payment_method}</div>
                    <div className="payment-method-stats">
                      <span className="payment-count badge badge-primary">{method.count} transactions</span>
                      <span className="payment-amount">${Number(method.total).toFixed(2)}</span>
                    </div>
                  </div>
                )) :
                <p className="text-muted">No payment method data available</p>
              }
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header">
          <h3>Report</h3>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-3">
              <button className="btn btn-outline-primary w-100" onClick={exportFullBundle}>
                <Download size={16} /> Full Export (Executive PDF + Detailed PDF + CSV + XLSX)
              </button>
            </div>
            <div className="col-md-3">
              <button className="btn btn-outline-success w-100" onClick={exportExecutivePdf}>
                <Download size={16} /> Executive PDF
              </button>
            </div>
            <div className="col-md-3">
              <button className="btn btn-outline-info w-100" onClick={exportDetailedPdf}>
                <Download size={16} /> Detailed PDF
              </button>
            </div>
            <div className="col-md-3">
              <button className="btn btn-outline-warning w-100" onClick={exportXlsx}>
                <Download size={16} /> XLSX
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
