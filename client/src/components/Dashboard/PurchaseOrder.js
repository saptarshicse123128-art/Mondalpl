import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { formatProductWithVariation, normalizeSizeNamePosition } from '../../utils/productDisplay';
import './Analytics.css';

// Helper function to format date to dd.mm.yyyy
const formatDateDDMMYYYY = (date) => {
  if (!date) return '';
  let dateObj;
  if (date instanceof Date) {
    dateObj = date;
  } else if (date.toDate && typeof date.toDate === 'function') {
    dateObj = date.toDate();
  } else if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    return '';
  }
  
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return `${day}.${month}.${year}`;
};

function PurchaseOrder() {
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [lowStockSearch, setLowStockSearch] = useState('');
  const [allProductsSearch, setAllProductsSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderStep, setOrderStep] = useState('select'); // 'select' | 'preview'
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]); // with orderQuantity (string) and optional isCustom
  const [orderName, setOrderName] = useState('');
  const [orderDate, setOrderDate] = useState(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}.${month}.${year}`;
  });

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [openLowVariationProductId, setOpenLowVariationProductId] = useState(null);
  const [openOrderVariationProductId, setOpenOrderVariationProductId] = useState(null);
  const [showAllOrderProducts, setShowAllOrderProducts] = useState(false);
  const [oldOrdersSearch, setOldOrdersSearch] = useState('');
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [selectedRestockOrderId, setSelectedRestockOrderId] = useState('');
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockQuantities, setRestockQuantities] = useState({});
  const [sizeNamePosition, setSizeNamePosition] = useState('left');
  const smallActionButtonStyle = {
    padding: '0.35rem 0.8rem',
    fontSize: '0.8rem',
    minWidth: '70px'
  };

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'app');
    const unsub = onSnapshot(
      settingsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setSizeNamePosition(normalizeSizeNamePosition(snapshot.data().sizeNamePosition));
        } else {
          setSizeNamePosition('left');
        }
      },
      (err) => {
        console.error('Failed to listen to app settings:', err);
        setSizeNamePosition('left');
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchLowStock = async () => {
      try {
        setLoading(true);

        const snapshot = await getDocs(collection(db, 'products'));
        const lowList = [];
        const allList = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const baseProduct = {
            id: docSnap.id,
            name: data.name || '',
            category: data.category || '',
            catalogueNumber: data.catalogueNumber || '',
            price: data.price || 0
          };

          const totalQuantity = data.quantity || 0;
          const productLowThreshold = data.lowStockQuantity ? parseInt(data.lowStockQuantity, 10) : null;

          const hasVariations = Array.isArray(data.variations) && data.variations.length > 0;

          // Structure we'll push if this product has any low/out entries
          const lowEntry = {
            ...baseProduct,
            base: null, // for non-variation product low/out
            variations: [] // only low/out variations
          };

          // Structure including ALL variations/base, for purchase order selection
          const allEntry = {
            ...baseProduct,
            base: null,
            variations: []
          };

          if (hasVariations) {
            let aggregatedQty = 0;
            let anyOut = false;
            let anyLow = false;

            data.variations.forEach((variation) => {
              const vQty = variation.quantity || 0;
              aggregatedQty += vQty;
              const vLowRaw = variation.lowStockQuantity;
              const vLow =
                vLowRaw !== undefined && vLowRaw !== null && vLowRaw !== ''
                  ? parseInt(vLowRaw, 10)
                  : null;

              const isOut = vQty === 0;
              const isLow = !isOut && vLow !== null && !Number.isNaN(vLow) && vQty <= vLow;

              if (isOut) anyOut = true;
              if (isLow) anyLow = true;

              const varStatus = isOut ? 'out' : isLow ? 'low' : 'ok';

              // For low-stock-only list, keep only low/out variations
              if (isOut || isLow) {
                lowEntry.variations.push({
                  id: `${docSnap.id}_${variation.size || ''}`,
                  size: variation.size || '',
                  quantity: vQty,
                  unit: variation.unit || '',
                  catalogueNumber: variation.catalogueNumber || data.catalogueNumber || '',
                  price: variation.price || data.price || 0,
                  purchasePrice: variation.purchasePrice || data.purchasePrice || 0,
                  status: varStatus
                });
              }

              // For all-products list, include every variation with its status
              allEntry.variations.push({
                id: `${docSnap.id}_${variation.size || ''}`,
                size: variation.size || '',
                quantity: vQty,
                unit: variation.unit || '',
                catalogueNumber: variation.catalogueNumber || data.catalogueNumber || '',
                price: variation.price || data.price || 0,
                purchasePrice: variation.purchasePrice || data.purchasePrice || 0,
                status: varStatus
              });
            });

            if (lowEntry.variations.length > 0) {
              lowList.push(lowEntry);
            }

            const overallStatus = anyOut ? 'out' : anyLow ? 'low' : 'ok';
            allEntry.base = {
              quantity: aggregatedQty,
              unit: data.unit || '',
              price: data.price || 0,
              purchasePrice: data.purchasePrice || 0,
              status: overallStatus
            };
            allList.push(allEntry);
          } else {
            const isOut = totalQuantity === 0;
            const thresholdValid =
              productLowThreshold !== null && !Number.isNaN(productLowThreshold);
            const isLow =
              !isOut && thresholdValid && totalQuantity <= productLowThreshold;

            if (isOut || isLow) {
              lowEntry.base = {
                quantity: totalQuantity,
                unit: data.unit || '',
                price: data.price || 0,
                purchasePrice: data.purchasePrice || 0,
                status: isOut ? 'out' : 'low'
              };
              lowList.push(lowEntry);
            }

            const overallStatus = isOut ? 'out' : isLow ? 'low' : 'ok';
            allEntry.base = {
              quantity: totalQuantity,
              unit: data.unit || '',
              price: data.price || 0,
              purchasePrice: data.purchasePrice || 0,
              status: overallStatus
            };
            allList.push(allEntry);
          }
        });

        // Sort: out-of-stock first, then low stock; then by name
        lowList.sort((a, b) => {
          const aStatus = (a.base?.status || a.variations[0]?.status || 'low');
          const bStatus = (b.base?.status || b.variations[0]?.status || 'low');
          if (aStatus !== bStatus) {
            return aStatus === 'out' ? -1 : 1;
          }
          return (a.name || '').localeCompare(b.name || '');
        });

        setLowStockProducts(lowList);

        const statusPriority = { out: 0, low: 1, ok: 2 };
        allList.sort((a, b) => {
          const aStatus = a.base?.status || 'ok';
          const bStatus = b.base?.status || 'ok';
          const aP = statusPriority[aStatus] ?? 2;
          const bP = statusPriority[bStatus] ?? 2;
          if (aP !== bP) {
            return aP - bP;
          }
          return (a.name || '').localeCompare(b.name || '');
        });
        setAllProducts(allList);
      } catch (error) {
        console.error('Error fetching low stock products for purchase order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLowStock();
  }, []);

  // Listen to saved purchase orders
  useEffect(() => {
    const ordersRef = collection(db, 'purchaseOrders');
    const q = query(ordersRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setPurchaseOrders(list);
      },
      (error) => {
        console.error('Error fetching purchase orders:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Search function (same as StockManagement)
  const matchesSearch = (text, query) => {
    if (!text || !query) return false;
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    const normalizeText = (str) => {
      return str.replace(/[()\s]+/g, '').toLowerCase();
    };
    
    const normalizedText = normalizeText(lowerText);
    const normalizedQuery = normalizeText(lowerQuery);
    
    if (!lowerQuery.includes(' ') && lowerQuery.length >= 2) {
      if (lowerText.includes(lowerQuery) || normalizedText.includes(normalizedQuery)) {
        return true;
      }
      return false;
    }
    
    if (normalizedText.includes(normalizedQuery)) return true;
    
    const queryWords = lowerQuery
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word.replace(/[()]/g, ''))
      .filter(word => word.length >= 2);
    
    if (queryWords.length === 0) return false;
    
    const textWords = lowerText
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word.replace(/[()]/g, ''))
      .filter(word => word.length > 0);
    
    const matchedWords = queryWords.filter(queryWord => {
      const normalizedQueryWord = normalizeText(queryWord);
      
      if (normalizedText.includes(normalizedQueryWord)) return true;
      if (lowerText.includes(queryWord)) return true;
      
      return textWords.some(textWord => {
        const normalizedTextWord = normalizeText(textWord);
        return normalizedTextWord.includes(normalizedQueryWord) || 
               normalizedQueryWord.includes(normalizedTextWord) ||
               textWord.includes(queryWord) || 
               queryWord.includes(textWord);
      });
    });
    
    const matchThreshold = Math.max(1, Math.ceil(queryWords.length * 0.7));
    return matchedWords.length >= matchThreshold;
  };

  const calculateRelevanceScore = (product, query) => {
    if (!query.trim()) return 0;
    
    const lowerQuery = query.toLowerCase().trim();
    const lowerName = (product.name || '').toLowerCase();
    const lowerCategory = (product.category || '').toLowerCase();
    
    let score = 0;
    
    if (lowerName.includes(lowerQuery)) {
      score += 1000;
      if (lowerName.startsWith(lowerQuery)) {
        score += 500;
      }
    }
    
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 0);
    const nameWords = lowerName.split(/\s+/);
    
    if (queryWords.length > 1) {
      let wordIndex = 0;
      for (let i = 0; i < nameWords.length && wordIndex < queryWords.length; i++) {
        if (nameWords[i].includes(queryWords[wordIndex])) {
          wordIndex++;
        }
      }
      if (wordIndex === queryWords.length) {
        score += 800;
        let adjacentCount = 0;
        for (let i = 0; i < nameWords.length - 1; i++) {
          const twoWords = nameWords[i] + ' ' + nameWords[i + 1];
          if (lowerQuery.includes(twoWords) || twoWords.includes(lowerQuery)) {
            adjacentCount++;
          }
        }
        if (adjacentCount > 0) {
          score += 300;
        }
      }
    }
    
    const allWordsMatch = queryWords.every(qw => 
      nameWords.some(nw => nw.includes(qw) || qw.includes(nw))
    );
    if (allWordsMatch) {
      score += 400;
    }
    
    if (lowerCategory.includes(lowerQuery)) {
      score += 200;
    }
    
    queryWords.forEach(qw => {
      if (lowerName.includes(qw)) {
        score += 100;
      }
    });
    
    return score;
  };

  // Filter and sort low stock products
  const filteredLowStockProducts = (() => {
    if (!lowStockSearch.trim()) return lowStockProducts;
    
    const query = lowStockSearch.trim();
    const matching = lowStockProducts.filter(product => {
      return (
        matchesSearch(product.name, query) ||
        matchesSearch(product.category, query)
      );
    });
    
    return matching.sort((a, b) => {
      const scoreA = calculateRelevanceScore(a, query);
      const scoreB = calculateRelevanceScore(b, query);
      return scoreB - scoreA;
    });
  })();

  // Filter and sort all products
  const filteredAllProducts = (() => {
    if (!allProductsSearch.trim()) return allProducts;
    
    const query = allProductsSearch.trim();
    const matching = allProducts.filter(product => {
      return (
        matchesSearch(product.name, query) ||
        matchesSearch(product.category, query)
      );
    });
    
    return matching.sort((a, b) => {
      const scoreA = calculateRelevanceScore(a, query);
      const scoreB = calculateRelevanceScore(b, query);
      return scoreB - scoreA;
    });
  })();

  const toggleSelectProduct = (productId) => {
    setSelectedIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      return [...prev, productId];
    });
  };

  const startCreateOrder = () => {
    setIsCreatingOrder(true);
    setOrderStep('select');
    setSelectedIds([]);
    setSelectedProducts([]);
    setShowAllOrderProducts(false);
  };

  const goToPreview = () => {
    const items = [];

    allProducts.forEach((product) => {
      // Base product (aggregated) selection
      if (selectedIds.includes(product.id)) {
        items.push({
          id: product.id,
          name: product.name,
          catalogueNumber: product.catalogueNumber || '',
          orderQuantity: '1'
        });
      }

      // Individual variation selection
      if (Array.isArray(product.variations)) {
        product.variations.forEach((v) => {
          if (selectedIds.includes(v.id)) {
            items.push({
              id: v.id,
              name: v.size
                ? formatProductWithVariation(product.name, v.size, sizeNamePosition)
                : product.name,
              catalogueNumber: v.catalogueNumber || product.catalogueNumber || '',
              orderQuantity: '1'
            });
          }
        });
      }
    });

    if (items.length === 0) {
      alert('Please select at least one product or variation for the purchase order.');
      return;
    }

    setSelectedProducts(items);
    setOrderStep('preview');
  };

  const handleQuantityChange = (index, value) => {
    setSelectedProducts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], orderQuantity: value };
      return copy;
    });
  };

  const handleCustomFieldChange = (index, field, value) => {
    setSelectedProducts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddCustomProduct = () => {
    setSelectedProducts((prev) => [
      ...prev,
      {
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        catalogueNumber: '',
        orderQuantity: '',
        isCustom: true
      }
    ]);
  };

  const handleRemoveProductFromOrder = (index) => {
    setSelectedProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const closeOrderModal = () => {
    setIsCreatingOrder(false);
    setOrderStep('select');
    setSelectedIds([]);
    setSelectedProducts([]);
    setOrderName('');
    setOrderDate(formatDateDDMMYYYY(new Date()));
    setShowAllOrderProducts(false);
  };

  // Helper to build and download PDF from generic order data
  const createOrderPDF = (displayName, displayDate, itemsToOrder) => {
    const doc = new jsPDF('p', 'mm', 'a4');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('ORDER LIST', 105, 25, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    // Name on left (without brackets)
    if (displayName && displayName.trim() && displayName !== '[Name]') {
      doc.text(displayName.trim(), 20, 40);
    }
    // Date on right (without brackets)
    if (displayDate) {
      doc.text(displayDate, 190, 40, { align: 'right' });
    }

    // Table
    const anyCatalogue = itemsToOrder.some(
      (item) => item.catalogueNumber && String(item.catalogueNumber).trim() !== ''
    );

    const head = anyCatalogue
      ? [['SL No.', 'Products', 'Catalogue No.', 'Qty.']]
      : [['SL No.', 'Products', 'Qty.']];

    const body = itemsToOrder.map((item, idx) => {
      const row = [
        String(idx + 1),
        item.name || ''
      ];

      if (anyCatalogue) {
        const catalogueNo = item.catalogueNumber && String(item.catalogueNumber).trim() !== ''
          ? String(item.catalogueNumber).trim()
          : '';
        row.push(catalogueNo);
      }

      row.push(String(item.orderQuantity));

      return row;
    });

    doc.autoTable({
      startY: 50,
      head,
      body,
      theme: 'grid',
      headStyles: {
        fillColor: [50, 50, 50],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      styles: {
        font: 'helvetica',
        fontSize: 10
      },
      columnStyles: anyCatalogue
        ? {
            0: { cellWidth: 20 },
            1: { cellWidth: 90 },
            2: { cellWidth: 40 },
            3: { cellWidth: 20 }
          }
        : {
            0: { cellWidth: 20 },
            1: { cellWidth: 110 },
            2: { cellWidth: 20 }
          },
      margin: { left: 15, right: 15 }
    });

    const fileName = `PurchaseOrder_${String(displayDate).replace(/-/g, '')}.pdf`;
    doc.save(fileName);
  };

  const generateOrderPDF = async () => {
    const itemsToOrder = selectedProducts.filter((p) => {
      const q = (p.orderQuantity ?? '').toString().trim();
      return q.length > 0;
    });
    if (itemsToOrder.length === 0) {
      alert('Please set quantity for at least one product before generating the PDF.');
      return;
    }

    const displayName = orderName && orderName.trim().length > 0 ? orderName.trim() : '';
    const displayDate = orderDate || formatDateDDMMYYYY(new Date());

    // Create and download PDF
    createOrderPDF(displayName, displayDate, itemsToOrder);

    // Save order to Firestore for future reference
    try {
      const orderDoc = {
        name: displayName,
        date: displayDate,
        createdAt: serverTimestamp(),
        items: itemsToOrder.map((item) => ({
          productId: item.isCustom ? null : (item.id || null),
          name: item.name || '',
          catalogueNumber: item.catalogueNumber || '',
          quantityText: item.orderQuantity != null ? String(item.orderQuantity) : ''
        }))
      };

      await addDoc(collection(db, 'purchaseOrders'), orderDoc);
    } catch (err) {
      console.error('Failed to save purchase order:', err);
    }

    alert('Purchase order PDF generated successfully.');
    closeOrderModal();
  };

  const downloadExistingOrderPDF = (order) => {
    const displayName = order.name && order.name.trim().length > 0 ? order.name.trim() : '';
    let dateFromDoc = '';
    if (order.date) {
      // If date is already in dd.mm.yyyy format, use it; otherwise convert
      if (order.date.includes('.')) {
        dateFromDoc = order.date;
      } else {
        dateFromDoc = formatDateDDMMYYYY(new Date(order.date));
      }
    } else if (order.createdAt?.toDate) {
      dateFromDoc = formatDateDDMMYYYY(order.createdAt.toDate());
    } else {
      dateFromDoc = formatDateDDMMYYYY(new Date());
    }
    const items = Array.isArray(order.items) ? order.items : [];
    const itemsForPdf = items.filter((it) => {
      const qt = (it.quantityText != null ? it.quantityText : it.quantity);
      if (qt == null) return false;
      return String(qt).trim().length > 0;
    });

    if (itemsForPdf.length === 0) {
      alert('This purchase order has no items with quantity.');
      return;
    }

    createOrderPDF(displayName, dateFromDoc, itemsForPdf.map((it) => ({
      name: it.name,
      catalogueNumber: it.catalogueNumber,
      orderQuantity: it.quantityText != null ? it.quantityText : it.quantity
    })));
  };

  const deletePurchaseOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to delete this purchase order?')) {
      return;
    }
    try {
      const orderRef = doc(db, 'purchaseOrders', orderId);
      await deleteDoc(orderRef);
    } catch (err) {
      console.error('Failed to delete purchase order:', err);
      alert('Failed to delete purchase order. Please try again.');
    }
  };

  const handleRestockNow = async () => {
    if (!selectedRestockOrderId) {
      alert('Please select a purchase order to restock.');
      return;
    }

    const order = purchaseOrders.find((o) => o.id === selectedRestockOrderId);
    if (!order) {
      alert('Selected purchase order not found.');
      return;
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const restockItems = items
      .filter((it, idx) => {
        if (!it.productId) return false;
        const key = it.productId || String(idx);
        const override = restockQuantities[key];
        const baseRaw = it.quantityText != null ? it.quantityText : it.quantity;
        const raw = override !== undefined && override !== '' ? override : baseRaw;
        if (raw == null) return false;
        const n = parseInt(String(raw), 10);
        return !Number.isNaN(n) && n > 0;
      })
      .map((it, idx) => {
        const key = it.productId || String(idx);
        const override = restockQuantities[key];
        const baseRaw = it.quantityText != null ? it.quantityText : it.quantity;
        const raw = override !== undefined && override !== '' ? override : baseRaw;
        const qty = parseInt(String(raw), 10);
        return { ...it, _restockQty: qty };
      });

    if (restockItems.length === 0) {
      alert('This purchase order has no valid quantities to restock.');
      return;
    }

    if (!window.confirm('Are you sure you want to restock products from this purchase order?')) {
      return;
    }

    setRestockLoading(true);
    try {
      for (const item of restockItems) {
        const qty = item._restockQty;
        if (!qty || qty <= 0) continue;

        const key = item.productId;
        if (!key) continue;

        // Variation-based key (productId_size) vs base product id
        const [productId, ...rest] = key.split('_');
        const variationSizeKey = rest.length > 0 ? rest.join('_') : null;

        const productRef = doc(db, 'products', productId);
        const snap = await getDoc(productRef);
        if (!snap.exists()) continue;
        const data = snap.data();

        if (variationSizeKey && Array.isArray(data.variations) && data.variations.length > 0) {
          const variations = data.variations.map((v) => {
            if (v.size === variationSizeKey) {
              const currentQty = v.quantity || 0;
              return { ...v, quantity: currentQty + qty };
            }
            return v;
          });
          const totalQuantity = variations.reduce(
            (sum, v) => sum + (v.quantity || 0),
            0
          );
          await updateDoc(productRef, {
            variations,
            quantity: totalQuantity,
            updatedAt: serverTimestamp()
          });
        } else {
          const currentQty = data.quantity || 0;
          await updateDoc(productRef, {
            quantity: currentQty + qty,
            updatedAt: serverTimestamp()
          });
        }
      }

      alert('Products have been restocked successfully.');
      setIsRestockOpen(false);
      setSelectedRestockOrderId('');
    } catch (err) {
      console.error('Failed to restock products:', err);
      alert('Failed to restock some products. Please check console for details.');
    } finally {
      setRestockLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="analytics-container">
        <p className="loading">Loading purchase order data...</p>
      </div>
    );
  }

  return (
    <div className="analytics-container">
      <h2>📥 Purchase Order / Low Stock Items</h2>

      <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
        <button
          type="button"
          className="low-stock-more-btn"
          onClick={() => setIsHistoryOpen(true)}
        >
          📂 Show Old Purchase Orders
        </button>
        <button
          type="button"
          className="low-stock-more-btn"
          onClick={startCreateOrder}
        >
          ➕ Create Purchase Order
        </button>
        <button
          type="button"
          className="low-stock-more-btn"
          onClick={() => {
            if (purchaseOrders.length === 0) {
              alert('No purchase orders available for restocking yet.');
              return;
            }
            setSelectedRestockOrderId('');
            setRestockQuantities({});
            setIsRestockOpen(true);
          }}
        >
          🔁 Restocking of Products
        </button>
      </div>

      <div className="section">
        <h3>⚠️ Low Stock Items</h3>
        {lowStockProducts.length > 0 ? (
          <div className="products-table">
            <div className="low-stock-search-row">
              <input
                type="text"
                placeholder="Search low stock by name, brand, or category..."
                value={lowStockSearch}
                onChange={(e) => setLowStockSearch(e.target.value)}
                className="low-stock-search-input"
              />
            </div>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Brand</th>
                  <th>Current Stock</th>
                  <th>Unit</th>
                  <th>Purchase Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = filteredLowStockProducts;

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan="6" className="no-data">
                          No low stock items based on configured thresholds.
                        </td>
                      </tr>
                    );
                  }

                  return filtered.flatMap((product) => {
                    const hasVariations = product.variations && product.variations.length > 0;
                    const isOpen = openLowVariationProductId === product.id;

                    const status =
                      product.base?.status ||
                      product.variations?.[0]?.status ||
                      'low';
                    const unit = product.base?.unit ?? product.variations?.[0]?.unit ?? '';
                    const purchasePrice =
                      product.base?.purchasePrice ?? product.variations?.[0]?.purchasePrice ?? product.purchasePrice ?? 0;

                    const mainRow = (
                      <tr
                        key={product.id}
                        className={`status-${status === 'out' ? 'critical' : 'warning'}`}
                      >
                        <td className="product-name" style={{ position: 'relative' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {hasVariations && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenLowVariationProductId(isOpen ? null : product.id)
                                }
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  fontSize: '16px',
                                  color: '#667eea',
                                  transition: 'transform 0.2s'
                                }}
                                title={isOpen ? 'Hide variations' : 'Show variations'}
                              >
                                <span
                                  style={{
                                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s'
                                  }}
                                >
                                  ▶
                                </span>
                              </button>
                            )}
                            <span>{product.name}</span>
                          </div>
                        </td>
                        <td>{product.category}</td>
                        <td className="stock-quantity">
                          {product.base ? (
                            <span
                              className={`badge ${
                                product.base.status === 'out' ? 'badge-danger' : 'badge-warning'
                              }`}
                            >
                              {product.base.quantity}
                            </span>
                          ) : (
                            <span className="badge badge-warning">See variations</span>
                          )}
                        </td>
                        <td>{unit || '-'}</td>
                        <td className="price">₹{(purchasePrice || 0).toFixed(2)}</td>
                        <td className="status-cell">
                          {product.base ? (
                            product.base.status === 'out' ? (
                              <span className="status-badge danger">OUT OF STOCK</span>
                            ) : (
                              <span className="status-badge warning">LOW STOCK</span>
                            )
                          ) : (
                            <span className="status-badge warning">LOW STOCK VARIANTS</span>
                          )}
                        </td>
                      </tr>
                    );

                    const variationRow =
                      hasVariations && isOpen ? (
                        <tr key={`${product.id}_vars`}>
                          <td colSpan="6">
                            <table
                              style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                marginTop: '6px',
                                backgroundColor: '#fafafa'
                              }}
                            >
                              <thead>
                                <tr>
                                  <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                    Size
                                  </th>
                                  <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                    Quantity
                                  </th>
                                  <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                    Unit
                                  </th>
                                  <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                    Purchase Price
                                  </th>
                                  <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {product.variations.map((v) => (
                                  <tr key={v.id}>
                                    <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                                      {v.size || '-'}
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                                      {v.quantity}
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                                      {v.unit || '-'}
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                                      ₹{(v.purchasePrice || 0).toFixed(2)}
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                                      {v.status === 'out' ? (
                                        <span className="status-badge danger">OUT OF STOCK</span>
                                      ) : (
                                        <span className="status-badge warning">LOW STOCK</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null;

                    return variationRow ? [mainRow, variationRow] : [mainRow];
                  });
                })()}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-data">All products have sufficient stock! ✅</p>
        )}
      </div>

      {/* Create Purchase Order Modal */}
      {isCreatingOrder && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeOrderModal();
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '10px',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: '20px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}
            >
              <h3 style={{ margin: 0 }}>
                {orderStep === 'select' ? 'Select Products for Purchase Order' : 'Preview Purchase Order'}
              </h3>
              <button
                type="button"
                onClick={closeOrderModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  cursor: 'pointer',
                  color: '#666'
                }}
                title="Close"
              >
                ×
              </button>
            </div>

            {orderStep === 'select' && (
              <div>
                <p style={{ marginBottom: '10px' }}>
                  Select the products you want to include in the purchase order. Low stock items are
                  highlighted in yellow and out-of-stock items in red.
                </p>
                <div style={{ marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Search products by name, brand, or category..."
                    value={allProductsSearch}
                    onChange={(e) => setAllProductsSearch(e.target.value)}
                    className="low-stock-search-input"
                    style={{ width: '100%', maxWidth: '500px' }}
                  />
                </div>
                <div className="products-table">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>Add</th>
                        <th>Product / Variation</th>
                        <th>Brand</th>
                        <th>Current Stock</th>
                        <th>Unit</th>
                        <th>Purchase Price</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllOrderProducts
                        ? filteredAllProducts
                        : filteredAllProducts.filter((product) => {
                            const status = product.base?.status || 'ok';
                            return status === 'low' || status === 'out';
                          })
                      ).flatMap((product) => {
                        const hasVariations =
                          Array.isArray(product.variations) && product.variations.length > 0;
                        const isOpen = openOrderVariationProductId === product.id;
                        const status = product.base?.status || 'ok';
                        const baseUnit =
                          product.base?.unit ?? product.variations?.[0]?.unit ?? '-';
                        const basePurchasePriceRaw =
                          product.base?.purchasePrice ??
                          product.variations?.[0]?.purchasePrice ??
                          0;
                        const basePurchasePrice = Number(basePurchasePriceRaw) || 0;

                        const mainRow = (
                          <tr
                            key={product.id}
                            className={
                              status === 'out'
                                ? 'status-critical'
                                : status === 'low'
                                ? 'status-warning'
                                : ''
                            }
                          >
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(product.id)}
                                onChange={() => toggleSelectProduct(product.id)}
                              />
                            </td>
                            <td className="product-name" style={{ position: 'relative' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}
                              >
                                {hasVariations && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenOrderVariationProductId(
                                        isOpen ? null : product.id
                                      )
                                    }
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      fontSize: '16px',
                                      color: '#667eea',
                                      transition: 'transform 0.2s'
                                    }}
                                    title={isOpen ? 'Hide variations' : 'Show variations'}
                                  >
                                    <span
                                      style={{
                                        transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.2s'
                                      }}
                                    >
                                      ▶
                                    </span>
                                  </button>
                                )}
                                <span>{product.name}</span>
                              </div>
                            </td>
                            <td>{product.category}</td>
                            <td>{product.base ? product.base.quantity : '-'}</td>
                            <td>{baseUnit}</td>
                            <td>₹{basePurchasePrice.toFixed(2)}</td>
                            <td>
                              <span
                                className={`status-badge ${
                                  status === 'out' ? 'danger' : status === 'low' ? 'warning' : ''
                                }`}
                              >
                                {status === 'out'
                                  ? 'OUT OF STOCK'
                                  : status === 'low'
                                  ? 'LOW STOCK'
                                  : 'OK'}
                              </span>
                            </td>
                          </tr>
                        );

                        const variationRow =
                          hasVariations && isOpen ? (
                            <tr key={`${product.id}_order_vars`}>
                              <td colSpan="6">
                                <table
                                  style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    marginTop: '6px',
                                    backgroundColor: '#fafafa'
                                  }}
                                >
                                  <thead>
                                    <tr>
                                      <th
                                        style={{
                                          padding: '6px',
                                          border: '1px solid #ddd',
                                          width: '40px'
                                        }}
                                      >
                                        Add
                                      </th>
                                      <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                        Size
                                      </th>
                                      <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                        Quantity
                                      </th>
                                      <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                        Unit
                                      </th>
                                      <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                        Purchase Price
                                      </th>
                                      <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                        Status
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {product.variations.map((v) => {
                                      const vPurchasePrice = Number(v.purchasePrice ?? 0) || 0;
                                      return (
                                        <tr key={v.id}>
                                          <td
                                            style={{
                                              padding: '6px',
                                              border: '1px solid #ddd',
                                              textAlign: 'center'
                                            }}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={selectedIds.includes(v.id)}
                                              onChange={() => toggleSelectProduct(v.id)}
                                            />
                                          </td>
                                          <td
                                            style={{ padding: '6px', border: '1px solid #ddd' }}
                                          >
                                            {v.size || '-'}
                                          </td>
                                          <td
                                            style={{ padding: '6px', border: '1px solid #ddd' }}
                                          >
                                            {v.quantity}
                                          </td>
                                          <td
                                            style={{ padding: '6px', border: '1px solid #ddd' }}
                                          >
                                            {v.unit || '-'}
                                          </td>
                                          <td
                                            style={{ padding: '6px', border: '1px solid #ddd' }}
                                          >
                                            ₹{vPurchasePrice.toFixed(2)}
                                          </td>
                                          <td
                                            style={{ padding: '6px', border: '1px solid #ddd' }}
                                          >
                                            <span
                                              className={`status-badge ${
                                                v.status === 'out'
                                                  ? 'danger'
                                                  : v.status === 'low'
                                                  ? 'warning'
                                                  : ''
                                              }`}
                                            >
                                              {v.status === 'out'
                                                ? 'OUT OF STOCK'
                                                : v.status === 'low'
                                                ? 'LOW STOCK'
                                                : 'OK'}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          ) : null;

                        return variationRow ? [mainRow, variationRow] : [mainRow];
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    className="cancel-due-btn"
                    onClick={closeOrderModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="save-due-btn"
                    onClick={() => setShowAllOrderProducts(true)}
                    disabled={showAllOrderProducts}
                  >
                    Add Extra Items
                  </button>
                  <button
                    type="button"
                    className="save-due-btn"
                    onClick={goToPreview}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {orderStep === 'preview' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    gap: '20px',
                    marginBottom: '16px',
                    flexWrap: 'wrap'
                  }}
                >
                  <div className="form-group" style={{ minWidth: '200px' }}>
                    <label>Order Name / Supplier Name</label>
                    <input
                      type="text"
                      value={orderName}
                      onChange={(e) => setOrderName(e.target.value)}
                      placeholder="Enter name (optional)"
                    />
                  </div>
                  <div className="form-group" style={{ minWidth: '160px' }}>
                    <label>Date (dd.mm.yyyy)</label>
                    <input
                      type="text"
                      value={orderDate}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow only digits and dots
                        if (/^[\d.]*$/.test(value) || value === '') {
                          setOrderDate(value);
                        }
                      }}
                      placeholder="dd.mm.yyyy"
                      pattern="\d{2}\.\d{2}\.\d{4}"
                    />
                  </div>
                </div>

                <div className="products-table">
                  <table>
                    <thead>
                      <tr>
                        <th>SL No.</th>
                        <th>Product</th>
                        <th>Catalogue No.</th>
                        <th>Qty to Order</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProducts.filter(product => {
                        // Only show products that have catalogue number
                        return product.catalogueNumber && product.catalogueNumber.trim().length > 0;
                      }).map((product, index) => (
                        <tr key={product.id}>
                          <td>{index + 1}</td>
                          <td>
                            {product.isCustom ? (
                              <input
                                type="text"
                                value={product.name || ''}
                                onChange={(e) => handleCustomFieldChange(index, 'name', e.target.value)}
                                placeholder="Custom product name"
                              />
                            ) : (
                              product.name
                            )}
                          </td>
                          <td>
                            {product.isCustom ? (
                              <input
                                type="text"
                                value={product.catalogueNumber || ''}
                                onChange={(e) => handleCustomFieldChange(index, 'catalogueNumber', e.target.value)}
                                placeholder="Catalogue no. (optional)"
                              />
                            ) : (
                              product.catalogueNumber || ''
                            )}
                          </td>
                          <td>
                            <input
                              type="text"
                              value={product.orderQuantity || ''}
                              onChange={(e) => handleQuantityChange(index, e.target.value)}
                              placeholder="Qty (can include text)"
                              style={{ width: '120px' }}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="cancel-due-btn"
                              onClick={() => handleRemoveProductFromOrder(index)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: '12px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    className="low-stock-more-btn"
                    onClick={handleAddCustomProduct}
                  >
                    ➕ Add Custom Product
                  </button>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    className="cancel-due-btn"
                    onClick={() => setOrderStep('select')}
                  >
                    Back
                  </button>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className="cancel-due-btn"
                      onClick={closeOrderModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="save-due-btn"
                      onClick={generateOrderPDF}
                    >
                      Save & Generate PDF
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Old Purchase Orders Modal */}
      {isHistoryOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsHistoryOpen(false);
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '10px',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: '20px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}
            >
              <h3 style={{ margin: 0 }}>Old Purchase Orders</h3>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  cursor: 'pointer',
                  color: '#666'
                }}
                title="Close"
              >
                ×
              </button>
            </div>

            {purchaseOrders.length === 0 ? (
              <p className="no-data">No purchase orders saved yet.</p>
            ) : (
              <>
                <div style={{ marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Search by date, name, or order no..."
                    value={oldOrdersSearch}
                    onChange={(e) => setOldOrdersSearch(e.target.value)}
                    className="low-stock-search-input"
                    style={{ width: '100%', maxWidth: '400px' }}
                  />
                </div>
                <div className="products-table">
                  <table>
                    <thead>
                      <tr>
                        <th>SL No.</th>
                        <th>Date</th>
                        <th>Name</th>
                        <th>Items</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseOrders.map((order, index) => {
                        let dateLabel = '-';
                        if (order.date) {
                          if (order.date.includes('.')) {
                            dateLabel = order.date;
                          } else {
                            dateLabel = formatDateDDMMYYYY(new Date(order.date));
                          }
                        } else if (order.createdAt?.toDate) {
                          dateLabel = formatDateDDMMYYYY(order.createdAt.toDate());
                        }
                        const nameLabel = order.name || '[Name]';
                        const itemCount = Array.isArray(order.items) ? order.items.length : 0;
                        const slNo = index + 1;

                        const query = oldOrdersSearch.trim().toLowerCase();
                        if (query) {
                          const haystack = `${slNo} ${dateLabel} ${nameLabel}`.toLowerCase();
                          if (!haystack.includes(query)) {
                            return null;
                          }
                        }

                        return (
                          <tr key={order.id}>
                            <td>{slNo}</td>
                            <td>{dateLabel}</td>
                            <td>{nameLabel}</td>
                            <td>{itemCount}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="low-stock-more-btn"
                                  style={smallActionButtonStyle}
                                  onClick={() => downloadExistingOrderPDF(order)}
                                >
                                  Download PDF
                                </button>
                                <button
                                  type="button"
                                  className="low-stock-more-btn"
                                  style={smallActionButtonStyle}
                                  onClick={() => downloadExistingOrderPDF(order)}
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  className="delete-bill-btn"
                                  style={smallActionButtonStyle}
                                  onClick={() => deletePurchaseOrder(order.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Restocking Modal */}
      {isRestockOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !restockLoading) {
              setIsRestockOpen(false);
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '10px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '85vh',
              overflow: 'auto',
              padding: '20px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}
            >
              <h3 style={{ margin: 0 }}>Restocking of Products</h3>
              <button
                type="button"
                onClick={() => !restockLoading && setIsRestockOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  cursor: 'pointer',
                  color: '#666'
                }}
                title="Close"
                disabled={restockLoading}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>
                Select Purchase Order to Restock
              </label>
              <select
                value={selectedRestockOrderId}
                onChange={(e) => setSelectedRestockOrderId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '5px',
                  border: '1px solid #ddd',
                  fontSize: '0.95rem'
                }}
              >
                <option value="">-- Choose a purchase order --</option>
                {purchaseOrders.map((order, index) => {
                  let dateLabel = '-';
                  if (order.date) {
                    if (order.date.includes('.')) {
                      dateLabel = order.date;
                    } else {
                      dateLabel = formatDateDDMMYYYY(new Date(order.date));
                    }
                  } else if (order.createdAt?.toDate) {
                    dateLabel = formatDateDDMMYYYY(order.createdAt.toDate());
                  }
                  const nameLabel = order.name || '[Name]';
                  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
                  const slNo = index + 1;
                  return (
                    <option key={order.id} value={order.id}>
                      {slNo}. {dateLabel} - {nameLabel} ({itemCount} items)
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedRestockOrderId && (() => {
              const order = purchaseOrders.find((o) => o.id === selectedRestockOrderId);
              if (!order) return null;
              const items = Array.isArray(order.items) ? order.items : [];
              const restockItems = items.filter((it, idx) => {
                if (!it.productId) return false;
                const key = it.productId || String(idx);
                const override = restockQuantities[key];
                const baseRaw = it.quantityText != null ? it.quantityText : it.quantity;
                const raw = override !== undefined && override !== '' ? override : baseRaw;
                if (raw == null) return false;
                const n = parseInt(String(raw), 10);
                return !Number.isNaN(n) && n > 0;
              });
              if (restockItems.length === 0) {
                return (
                  <p className="no-data">
                    This purchase order has no valid quantities to restock.
                  </p>
                );
              }
              return (
                <div className="products-table">
                  <h4 style={{ marginBottom: '8px' }}>Preview of Products to Restock</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>SL No.</th>
                        <th>Product</th>
                        <th>Catalogue No.</th>
                        <th>Quantity to Add</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restockItems.map((it, idx) => {
                        const key = it.productId || String(idx);
                        const baseRaw = it.quantityText != null ? it.quantityText : it.quantity;
                        const value =
                          restockQuantities[key] !== undefined
                            ? restockQuantities[key]
                            : baseRaw ?? '';
                        return (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>{it.name}</td>
                            <td>{it.catalogueNumber || '-'}</td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                value={value}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRestockQuantities((prev) => ({
                                    ...prev,
                                    [key]: val
                                  }));
                                }}
                                style={{
                                  width: '80px',
                                  padding: '0.25rem 0.4rem',
                                  borderRadius: '4px',
                                  border: '1px solid #ccc',
                                  textAlign: 'right'
                                }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <div
              style={{
                marginTop: '16px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px'
              }}
            >
              <button
                type="button"
                className="cancel-due-btn"
                onClick={() => setIsRestockOpen(false)}
                disabled={restockLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="save-due-btn"
                onClick={handleRestockNow}
                disabled={restockLoading || !selectedRestockOrderId}
              >
                {restockLoading ? 'Restocking...' : 'Restock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PurchaseOrder;


