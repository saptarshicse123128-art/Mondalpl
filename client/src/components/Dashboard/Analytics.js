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
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);

        // Get top selling products
        const topSellers = await analyticsUtils.getTopSellingProducts(5);
        setTopProducts(topSellers);

        // Get low stock products
        const lowStock = await searchUtils.getLowStockProducts(20);
        setLowStockProducts(lowStock);

        // Get inventory value
        const inventory = await analyticsUtils.getInventoryValue();
        setInventoryValue(inventory.totalValue);

        // Get total sales
        const total = await analyticsUtils.getTotalSalesAmount();
        setTotalSales(total);
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  // Real-time bills listener for bill count
  useEffect(() => {
    const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBillCount(snapshot.size);
      
      // Build daily sales data
      const dailySales = {};
      snapshot.forEach((doc) => {
        const date = doc.data().date;
        if (date) {
          dailySales[date] = (dailySales[date] || 0) + (doc.data().total || 0);
        }
      });

      // Convert to sorted array
      const salesArray = Object.entries(dailySales)
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-7); // Last 7 days

      setSalesData(salesArray);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="analytics-container"><p className="loading">Loading analytics...</p></div>;
  }

  return (
    <div className="analytics-container">
      <h2>📊 Sales Analytics & Overview</h2>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">💰</div>
          <div className="metric-content">
            <h3>Total Sales</h3>
            <p className="metric-value">₹{totalSales.toFixed(2)}</p>
            <span className="metric-label">All time</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📄</div>
          <div className="metric-content">
            <h3>Total Bills</h3>
            <p className="metric-value">{billCount}</p>
            <span className="metric-label">Generated</span>
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

      {/* Sales Chart */}
      <div className="chart-section">
        <h3>📈 Sales Trend (Last 7 Days)</h3>
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
                {lowStockProducts.map((product) => (
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
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-data">All products have sufficient stock! ✅</p>
        )}
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
            <span className="summary-label">Critical Alerts:</span>
            <span className="summary-value" style={{ color: lowStockProducts.filter(p => p.quantity === 0).length > 0 ? '#dc3545' : '#28a745' }}>
              {lowStockProducts.filter(p => p.quantity === 0).length}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Warning Count:</span>
            <span className="summary-value" style={{ color: lowStockProducts.filter(p => p.quantity > 0).length > 0 ? '#ffc107' : '#28a745' }}>
              {lowStockProducts.filter(p => p.quantity > 0).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
