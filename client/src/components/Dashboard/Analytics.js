import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { analyticsUtils, searchUtils } from '../../utils/firebaseUtils';
import './Analytics.css';

// Small inline SVG LineChart component — no external deps
function LineChart({ data }) {
  const [hover, setHover] = useState(null);

  // dimensions
  const width = 800;
  const height = 380;
  const padding = { top: 30, right: 40, bottom: 80, left: 48 };

  const totals = data.map((d) => d.total || 0);
  const max = Math.max(...totals, 1);

  // map data to points
  const points = data.map((d, i) => {
    const x = padding.left + (i * (width - padding.left - padding.right)) / Math.max(1, data.length - 1);
    const y = padding.top + (1 - (d.total / max)) * (height - padding.top - padding.bottom);
    return { x, y, label: new Date(d.date).toLocaleDateString('en-IN'), value: d.total };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');

  return (
    <div className="linechart-wrapper" style={{ maxWidth: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="380" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="lineGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#21b6ae" stopOpacity="1" />
            <stop offset="100%" stopColor="#21b6ae" stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {/* background */}
        <rect x="0" y="0" width="100%" height="100%" fill="#ffffff" />

        {/* horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => (
          <line
            key={idx}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + t * (height - padding.top - padding.bottom)}
            y2={padding.top + t * (height - padding.top - padding.bottom)}
            stroke="rgba(0,0,0,0.1)"
            strokeWidth="1"
          />
        ))}

        {/* path fill */}
        <path d={`${pathD} L ${width - padding.right} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`} fill="url(#lineGrad)" opacity="0.9" />

        {/* line */}
        <path d={pathD} fill="none" stroke="#21b6ae" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

        {/* points */}
        {points.map((p, idx) => {
          // Smart tooltip positioning: show below if point is in top half, above if in bottom half
          const isTopHalf = p.y < height / 2;
          const tooltipY = isTopHalf ? p.y + 50 : p.y - 58;
          const textY1 = isTopHalf ? p.y + 70 : p.y - 38;
          const textY2 = isTopHalf ? p.y + 84 : p.y - 22;
          
          return (
            <g key={idx} onMouseEnter={() => setHover(idx)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
              <circle cx={p.x} cy={p.y} r={6} fill="#21b6ae" stroke="#fff" strokeWidth={2} />
              {hover === idx && (
                <g>
                  <rect x={p.x - 60} y={tooltipY} width={120} height={36} rx={6} fill="#333" opacity={0.95} />
                  <text x={p.x - 52} y={textY1} fill="#fff" fontSize="12">{p.label}</text>
                  <text x={p.x - 52} y={textY2} fill="#21b6ae" fontSize="13">₹{p.value}</text>
                </g>
              )}
              <text x={p.x} y={height - padding.bottom + 18} fontSize="12" fill="#333" textAnchor="middle">{new Date(data[idx].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Analytics() {
  const [totalSales, setTotalSales] = useState(0);
  const [billCount, setBillCount] = useState(0);
  const [topProducts, setTopProducts] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [totalDue, setTotalDue] = useState(0);
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('weekly'); // weekly, monthly, yearly
  const [bills, setBills] = useState([]);
  const [lowStockSearch, setLowStockSearch] = useState('');
  const [showAllLowStock, setShowAllLowStock] = useState(false);

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);

        // Get low stock products
        const lowStock = await searchUtils.getLowStockProducts(20);
        setLowStockProducts(lowStock);

        // Get inventory value
        const inventory = await analyticsUtils.getInventoryValue();
        setInventoryValue(inventory.totalValue);
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  // Real-time bills listener for raw bill data
  useEffect(() => {
    const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const billsList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let billDateStr = data.date;

        // Fallback to createdAt if date is missing
        if (!billDateStr && data.createdAt?.toDate) {
          billDateStr = data.createdAt.toDate().toISOString().split('T')[0];
        }

        if (!billDateStr) return;

        billsList.push({
          id: docSnap.id,
          date: billDateStr,
          total: data.total || 0,
          due: data.due ?? null,
          items: Array.isArray(data.items) ? data.items : []
        });
      });

      setBills(billsList);
    });

    return () => unsubscribe();
  }, []);

  // Recompute analytics based on selected time range
  useEffect(() => {
    if (!bills.length) {
      setSalesData([]);
      setTotalSales(0);
      setBillCount(0);
      setTotalDue(0);
      setTopProducts([]);
      return;
    }

    const now = new Date();
    const rangeDays =
      timeRange === 'weekly' ? 7 : timeRange === 'monthly' ? 30 : 365;

    // Helper: filter bills in range
    const filteredBills = bills.filter((bill) => {
      const billDate = new Date(bill.date);
      if (isNaN(billDate)) return false;
      const diffDays = (now - billDate) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= rangeDays;
    });

    // Total sales & bill count for range
    const total = filteredBills.reduce((sum, bill) => sum + (bill.total || 0), 0);
    setTotalSales(total);
    setBillCount(filteredBills.length);

    // Total due amount for range
    const dueTotal = filteredBills.reduce((sum, bill) => {
      if (bill.due == null || bill.due === '') return sum;
      if (typeof bill.due === 'number') {
        return sum + bill.due;
      }
      const cleaned = String(bill.due).replace(/[^0-9.-]/g, '');
      const num = parseFloat(cleaned);
      if (isNaN(num)) return sum;
      return sum + num;
    }, 0);
    setTotalDue(dueTotal);

    // Daily sales for chart
    const dailySales = {};

    filteredBills.forEach((bill) => {
      const key = bill.date; // group by day (YYYY-MM-DD)
      dailySales[key] = (dailySales[key] || 0) + bill.total;
    });

    const salesArray = Object.entries(dailySales)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    setSalesData(salesArray);

    // Top products within range
    const productMap = {};
    filteredBills.forEach((bill) => {
      bill.items.forEach((item) => {
        const key = item.productId || item.productName || 'unknown';
        if (!productMap[key]) {
          productMap[key] = {
            productId: item.productId || key,
            productName: item.productName || 'Unknown',
            quantity: 0,
            totalRevenue: 0,
            billCount: 0
          };
        }
        productMap[key].quantity += item.quantity || 0;
        const revenue = item.subtotal != null ? item.subtotal : (item.price || 0) * (item.quantity || 0);
        productMap[key].totalRevenue += revenue;
        productMap[key].billCount += 1;
      });
    });

    const topList = Object.values(productMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    setTopProducts(topList);
  }, [bills, timeRange]);

  if (loading) {
    return <div className="analytics-container"><p className="loading">Loading analytics...</p></div>;
  }

  return (
    <div className="analytics-container">
      <div className="chart-header-row">
        <h2>📊 Sales Analytics & Overview</h2>
        <div className="time-filter">
          <button
            type="button"
            className={timeRange === 'weekly' ? 'time-btn active' : 'time-btn'}
            onClick={() => setTimeRange('weekly')}
          >
            Weekly
          </button>
          <button
            type="button"
            className={timeRange === 'monthly' ? 'time-btn active' : 'time-btn'}
            onClick={() => setTimeRange('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            className={timeRange === 'yearly' ? 'time-btn active' : 'time-btn'}
            onClick={() => setTimeRange('yearly')}
          >
            Yearly
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">💰</div>
          <div className="metric-content">
            <h3>Total Sales</h3>
            <p className="metric-value">₹{totalSales.toFixed(2)}</p>
            <span className="metric-label">
              {timeRange === 'weekly'
                ? 'Last 7 days'
                : timeRange === 'monthly'
                ? 'Last 30 days'
                : 'Last 365 days'}
            </span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📄</div>
          <div className="metric-content">
            <h3>Total Bills</h3>
            <p className="metric-value">{billCount}</p>
            <span className="metric-label">
              {timeRange === 'weekly'
                ? 'Bills in last 7 days'
                : timeRange === 'monthly'
                ? 'Bills in last 30 days'
                : 'Bills in last 365 days'}
            </span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">🧾</div>
          <div className="metric-content">
            <h3>Total Due Amount</h3>
            <p className="metric-value">₹{totalDue.toFixed(2)}</p>
            <span className="metric-label">
              {timeRange === 'weekly'
                ? 'Due in last 7 days'
                : timeRange === 'monthly'
                ? 'Due in last 30 days'
                : 'Due in last 365 days'}
            </span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📦</div>
          <div className="metric-content">
            <h3>Inventory Value</h3>
            <p className="metric-value">₹{inventoryValue.toFixed(2)}</p>
            <span className="metric-label">Current stock</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⚠️</div>
          <div className="metric-content">
            <h3>Low Stock</h3>
            <p className="metric-value">{lowStockProducts.length}</p>
            <span className="metric-label">Items</span>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="summary-section">
        <h3>📊 Quick Summary</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">Avg. Sale Per Bill:</span>
            <span className="summary-value">₹{billCount > 0 ? (totalSales / billCount).toFixed(2) : '0.00'}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total Products:</span>
            <span className="summary-value">{topProducts.reduce((acc, p) => acc + 1, 0)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Out of Stock:</span>
            <span className="summary-value" style={{ color: lowStockProducts.filter(p => p.quantity === 0).length > 0 ? '#dc3545' : '#28a745' }}>
              {lowStockProducts.filter(p => p.quantity === 0).length}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Low Stock Count:</span>
            <span className="summary-value" style={{ color: lowStockProducts.filter(p => p.quantity > 0).length > 0 ? '#ffc107' : '#28a745' }}>
              {lowStockProducts.filter(p => p.quantity > 0).length}
            </span>
          </div>
        </div>
      </div>

      {/* Sales Chart */}
      <div className="chart-section">
        <h3>📈 Sales Trend</h3>
        <div className="sales-chart dark-chart">
          {salesData.length > 0 ? (
            <LineChart data={salesData} />
          ) : (
            <p className="no-data">No sales data available yet</p>
          )}
        </div>
      </div>

      {/* Top Selling Products */}
      <div className="section">
        <h3>🏆 Top Selling Products</h3>
        {topProducts.length > 0 ? (
          <div className="products-table">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product Name</th>
                  <th>Units Sold</th>
                  <th>Revenue</th>
                  <th>Times Purchased</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product, index) => (
                  <tr key={product.productId}>
                    <td className="rank">{index + 1}</td>
                    <td>{product.productName}</td>
                    <td className="quantity">{product.quantity}</td>
                    <td className="revenue">₹{product.totalRevenue.toFixed(2)}</td>
                    <td className="count">{product.billCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-data">No sales data available yet</p>
        )}
      </div>

      {/* Low Stock Alert */}
      <div className="section">
        <h3>⚠️ Low Stock Items (≤20 units)</h3>
        {lowStockProducts.length > 0 ? (
          <div className="products-table">
            <div className="low-stock-search-row">
              <input
                type="text"
                placeholder="Search low stock by name or category..."
                value={lowStockSearch}
                onChange={(e) => setLowStockSearch(e.target.value)}
                className="low-stock-search-input"
              />
            </div>
            <table>
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th>Current Stock</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = lowStockProducts.filter((product) => {
                    if (!lowStockSearch.trim()) return true;
                    const q = lowStockSearch.toLowerCase().trim();
                    return (
                      (product.name || '').toLowerCase().includes(q) ||
                      (product.category || '').toLowerCase().includes(q)
                    );
                  });

                  const visible = showAllLowStock ? filtered : filtered.slice(0, 6);

                  if (visible.length === 0) {
                    return (
                      <tr>
                        <td colSpan="5" className="no-data">
                          No low stock items match your search.
                        </td>
                      </tr>
                    );
                  }

                  return visible.map((product) => (
                  <tr key={product.id} className={`status-${product.quantity === 0 ? 'critical' : 'warning'}`}>
                    <td className="product-name">{product.name}</td>
                    <td>{product.category}</td>
                    <td className="stock-quantity">
                      <span className={`badge ${product.quantity === 0 ? 'badge-danger' : 'badge-warning'}`}>
                        {product.quantity}
                      </span>
                    </td>
                    <td className="price">₹{product.price?.toFixed(2)}</td>
                    <td className="status-cell">
                      {product.quantity === 0 ? (
                        <span className="status-badge danger">OUT OF STOCK</span>
                      ) : (
                        <span className="status-badge warning">LOW STOCK</span>
                      )}
                    </td>
                  </tr>
                ));})()}
              </tbody>
            </table>
            {lowStockProducts.length > 6 && (
              <div className="low-stock-more-row">
                <button
                  type="button"
                  className="low-stock-more-btn"
                  onClick={() => setShowAllLowStock((prev) => !prev)}
                >
                  {showAllLowStock ? 'Show Less' : 'See More'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="no-data">All products have sufficient stock! ✅</p>
        )}
      </div>
    </div>
  );
}

export default Analytics;
