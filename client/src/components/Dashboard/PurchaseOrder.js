import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs, deleteDoc, doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore';
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

const formatPurchaseOrderNumber = (value) => `MPS/PO/${String(value ?? 0).padStart(5, '0')}`;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getOrderNumberValueFromOrder = (order, fallbackIndex = 0) => {
  if (typeof order?.orderNumberValue === 'number' && !Number.isNaN(order.orderNumberValue)) {
    return order.orderNumberValue;
  }
  return fallbackIndex + 1;
};

const parsePositiveNumber = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

const roundQtySecondary = (n) => Number(Number(n).toFixed(4));

/** PO line has dual-unit metadata (restock in secondary, inventory in primary). `enableDualUnit !== false` keeps older POs without the flag working. */
const isDualRestockItem = (it) =>
  Boolean(
    it &&
      it.productId &&
      it.enableDualUnit !== false &&
      it.orderedQuantitySecondary != null &&
      Number(it.orderedQuantitySecondary) > 0 &&
      parsePositiveNumber(it.conversionFactor) &&
      String(it.secondaryUnit || '').trim() !== ''
  );

/** Preview / save: use secondary qty UI when this catalog line is dual-enabled on the product. */
const previewItemUsesSecondaryQty = (item) =>
  Boolean(
    item &&
      !item.isCustom &&
      item.enableDualUnit &&
      String(item.secondaryUnit || '').trim() &&
      parsePositiveNumber(item.conversionFactor)
  );

const getDueSecondary = (it) => {
  if (!isDualRestockItem(it)) return 0;
  const ordered = Number(it.orderedQuantitySecondary);
  if (it.dueQuantitySecondary != null && Number.isFinite(Number(it.dueQuantitySecondary))) {
    return Math.max(0, roundQtySecondary(Number(it.dueQuantitySecondary)));
  }
  const added = Number(it.addedQuantitySecondary || 0);
  return Math.max(0, roundQtySecondary(ordered - added));
};

const primaryDeltaFromSecondary = (addSecondary, conversionFactor) => {
  const factor = parsePositiveNumber(conversionFactor);
  if (!factor || !parsePositiveNumber(addSecondary)) return 0;
  return Math.round(Number(addSecondary) * factor);
};

const getDualTrackedLines = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.filter(isDualRestockItem);
};

/** Ordered primary count for single-unit (non–dual) catalog PO lines. */
const getLegacyOrderedPrimary = (it) => {
  if (it?.orderedPrimaryRestock != null && Number.isFinite(Number(it.orderedPrimaryRestock))) {
    const n = Math.floor(Number(it.orderedPrimaryRestock));
    return n > 0 ? n : 0;
  }
  const raw = it?.quantityText != null ? it.quantityText : it?.quantity;
  if (raw == null) return 0;
  const n = parseInt(String(raw).trim(), 10);
  return !Number.isNaN(n) && n > 0 ? n : 0;
};

/** Remaining primary qty to restock for a legacy (single-unit) tracked line. */
const getDuePrimaryLegacy = (it) => {
  const ordered = getLegacyOrderedPrimary(it);
  if (ordered <= 0) return 0;
  if (it?.duePrimaryRestock != null && Number.isFinite(Number(it.duePrimaryRestock))) {
    return Math.max(0, Math.floor(Number(it.duePrimaryRestock)));
  }
  const added = Math.floor(Number(it.addedPrimaryRestock || 0));
  return Math.max(0, ordered - added);
};

const getLegacyPrimaryTrackedLines = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.filter((line) => line.productId && !isDualRestockItem(line) && getLegacyOrderedPrimary(line) > 0);
};

/**
 * Order-level restock:
 * - PENDING when nothing has been restocked yet
 * - PARTIAL when some (but not all) tracked qty has been restocked
 * - COMPLETED when all tracked lines are fully restocked
 * NOT TRACKED only when there are catalog lines but none qualify for either tracking model.
 */
const getPurchaseOrderOverallRestockStatus = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  const dualLines = getDualTrackedLines(order);
  const legacyTracked = getLegacyPrimaryTrackedLines(order);
  const tracked = [...dualLines, ...legacyTracked];
  if (tracked.length === 0) {
    if (!items.some((line) => line.productId)) return null;
    return 'NOT TRACKED';
  }

  const lineStatuses = tracked.map((line) => inferLineRestockStatusLabel(line));
  if (lineStatuses.every((s) => s === 'COMPLETED')) return 'COMPLETED';
  if (lineStatuses.every((s) => s === 'PENDING')) return 'PENDING';
  return 'PARTIAL';
};

const inferLineRestockStatusLabel = (it) => {
  if (isDualRestockItem(it)) {
    const due = getDueSecondary(it);
    if (due <= 1e-6) return 'COMPLETED';
    const added = Number(it.addedQuantitySecondary || 0);
    if (added > 1e-6) return 'PARTIAL';
    return 'PENDING';
  }
  if (it?.productId && getLegacyOrderedPrimary(it) > 0) {
    const due = getDuePrimaryLegacy(it);
    if (due <= 0) return 'COMPLETED';
    const added = Math.floor(Number(it.addedPrimaryRestock || 0));
    if (added > 0) return 'PARTIAL';
    return 'PENDING';
  }
  return null;
};

const getRestockPrimaryUnitLabel = (it) => {
  const u = String(it.primaryUnit || it.orderUnit || it.unit || '').trim();
  return u || 'units';
};

/** Shown in restock modal for non–dual-unit lines (ordered column). */
const getRestockOrderedPrimaryDisplay = (it) => {
  const raw = it.quantityText != null ? it.quantityText : it.quantity;
  if (raw == null || String(raw).trim() === '') return '—';
  const s = String(raw).trim();
  const u = getRestockPrimaryUnitLabel(it);
  if (u && u !== 'units' && !new RegExp(`\\b${escapeRegExp(u)}\\b`, 'i').test(s)) {
    return `${s} ${u}`;
  }
  return s;
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
  const [previewSearchQuery, setPreviewSearchQuery] = useState('');
  const [expandedHistoryOrderId, setExpandedHistoryOrderId] = useState(null);
  const [openMenuOrderId, setOpenMenuOrderId] = useState(null);
  const [openShareOrderId, setOpenShareOrderId] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editingOrderMeta, setEditingOrderMeta] = useState(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [selectedRestockOrderId, setSelectedRestockOrderId] = useState('');
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockQuantities, setRestockQuantities] = useState({});
  const iconActionButtonStyle = {
    padding: '0.3rem 0.55rem',
    fontSize: '0.8rem',
    minWidth: 'auto',
    lineHeight: 1.2
  };
  const initRestockQuantitiesForOrder = (order) => {
    if (!order || !Array.isArray(order.items)) return {};
    const next = {};
    order.items.forEach((it) => {
      if (!it.productId) return;
      const key = it.productId;
      if (isDualRestockItem(it)) {
        const due = getDueSecondary(it);
        if (due > 0) next[key] = String(due);
      } else {
        const dueP = getDuePrimaryLegacy(it);
        if (dueP > 0) next[key] = String(dueP);
      }
    });
    return next;
  };

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
            subcategory: data.subcategory || '',
            catalogueNumber: data.catalogueNumber || '',
            price: data.price || 0,
            unit: data.unit || '',
            sizeNamePosition: normalizeSizeNamePosition(data.sizeNamePosition),
            enableDualUnit: Boolean(data.enableDualUnit),
            primaryUnit: data.primaryUnit || '',
            secondaryUnit: data.secondaryUnit || '',
            conversionFactor: data.conversionFactor || null
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
                  status: varStatus,
                  primaryUnit: variation.primaryUnit || data.unit || '',
                  secondaryUnit: variation.secondaryUnit || '',
                  conversionFactor: variation.conversionFactor || null,
                  enableDualUnit: Boolean(data.enableDualUnit)
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
                status: varStatus,
                primaryUnit: variation.primaryUnit || data.unit || '',
                secondaryUnit: variation.secondaryUnit || '',
                conversionFactor: variation.conversionFactor || null,
                enableDualUnit: Boolean(data.enableDualUnit)
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

  // Close old-order action menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuOrderId && !event.target.closest('.po-menu-container')) {
        setOpenMenuOrderId(null);
      }
      if (openShareOrderId && !event.target.closest('.po-share-container')) {
        setOpenShareOrderId(null);
      }
    };
    if (openMenuOrderId || openShareOrderId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [openMenuOrderId, openShareOrderId]);

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

  const isOrderProductSelected = (product) => {
    if (!product) return false;
    if (selectedIds.includes(product.id)) return true;
    const variations = Array.isArray(product.variations) ? product.variations : [];
    return variations.some((v) => selectedIds.includes(v.id));
  };

  const visibleOrderSelectProducts = (
    showAllOrderProducts
      ? filteredAllProducts
      : filteredAllProducts.filter((product) => {
          const status = product.base?.status || 'ok';
          return status === 'low' || status === 'out';
        })
  );
  const selectedOrderSelectProducts = visibleOrderSelectProducts.filter(isOrderProductSelected);
  const otherOrderSelectProducts = visibleOrderSelectProducts.filter(
    (product) => !isOrderProductSelected(product)
  );

  const toggleSelectProduct = (productId) => {
    const product = allProducts.find((p) => p.id === productId);
    const hasVariations = Boolean(product?.variations && product.variations.length > 0);

    setSelectedIds((prev) => {
      if (!hasVariations) {
        if (prev.includes(productId)) {
          return prev.filter((id) => id !== productId);
        }
        return [...prev, productId];
      }

      const variationIds = product.variations.map((v) => v.id);
      const allSelected =
        prev.includes(productId) && variationIds.every((id) => prev.includes(id));

      if (allSelected) {
        // Unselect parent + all child variations together.
        return prev.filter((id) => id !== productId && !variationIds.includes(id));
      }

      // Selecting parent product auto-selects all variations under it.
      return [...new Set([...prev, productId, ...variationIds])];
    });
  };

  const startCreateOrder = () => {
    setEditingOrderId(null);
    setEditingOrderMeta(null);
    setIsCreatingOrder(true);
    setOrderStep('select');
    setSelectedIds([]);
    setSelectedProducts([]);
    setShowAllOrderProducts(false);
    setPreviewSearchQuery('');
  };

  const startEditOrder = (order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const mappedProducts = items.map((it, index) => {
      const isCustom = !it.productId;
      const qtyText = it.quantityText != null ? String(it.quantityText) : (it.quantity != null ? String(it.quantity) : '');
      const dual =
        Boolean(it.enableDualUnit) &&
        it.orderedQuantitySecondary != null &&
        parsePositiveNumber(it.conversionFactor) &&
        String(it.secondaryUnit || '').trim() !== '';

      return {
        id: it.productId || `custom_edit_${order.id}_${index}`,
        name: it.name || '',
        productBrand: it.productBrand || '',
        productCategory: it.productCategory || '',
        catalogueNumber: it.catalogueNumber || '',
        orderQuantity: dual ? String(it.orderedQuantityPrimary ?? qtyText) : qtyText,
        orderUnit: it.orderUnit || it.unit || '',
        isCustom,
        enableDualUnit: Boolean(it.enableDualUnit),
        orderQuantitySecondary:
          it.orderedQuantitySecondary != null ? String(it.orderedQuantitySecondary) : '',
        orderedQuantityPrimary: it.orderedQuantityPrimary ?? null,
        secondaryUnit: it.secondaryUnit || '',
        primaryUnit: it.primaryUnit || '',
        conversionFactor: it.conversionFactor || null
      };
    });

    const ids = mappedProducts.filter((p) => !p.isCustom && p.id).map((p) => p.id);

    let resolvedDate = '';
    if (order.date && String(order.date).trim()) {
      const rawDate = String(order.date).trim();
      if (rawDate.includes('.')) {
        resolvedDate = rawDate;
      } else {
        const parsed = new Date(rawDate);
        resolvedDate = Number.isNaN(parsed.getTime())
          ? rawDate
          : formatDateDDMMYYYY(parsed);
      }
    } else if (order.createdAt?.toDate) {
      resolvedDate = formatDateDDMMYYYY(order.createdAt.toDate());
    }

    setEditingOrderId(order.id);
    setEditingOrderMeta({
      orderNumber: order.orderNumber || null,
      orderNumberValue:
        typeof order.orderNumberValue === 'number' ? order.orderNumberValue : null,
      previousItems: items,
      originalDate: resolvedDate || null
    });
    setOrderName(order.name || '');
    if (resolvedDate) {
      setOrderDate(resolvedDate);
    }
    setSelectedIds(ids);
    setSelectedProducts(mappedProducts);
    setOrderStep('preview');
    // Allow adding any catalog product while editing
    setShowAllOrderProducts(true);
    setOpenMenuOrderId(null);
    setOpenShareOrderId(null);
    setIsHistoryOpen(false);
    setExpandedHistoryOrderId(null);
    setIsCreatingOrder(true);
    setPreviewSearchQuery('');
  };

  const shareOrderOnWhatsApp = (order) => {
    let dateLabel = '-';
    if (order.date) {
      dateLabel = order.date.includes('.')
        ? order.date
        : formatDateDDMMYYYY(new Date(order.date));
    } else if (order.createdAt?.toDate) {
      dateLabel = formatDateDDMMYYYY(order.createdAt.toDate());
    }

    const orderNumber =
      order.orderNumber || formatPurchaseOrderNumber(getOrderNumberValueFromOrder(order, 0));
    const nameLabel = order.name || '';
    const items = Array.isArray(order.items) ? order.items : [];

    const lines = items
      .map((it, idx) => {
        const qty = it.quantityText != null ? it.quantityText : it.quantity;
        if (qty == null || String(qty).trim() === '') return null;
        const unit = it.orderUnit || it.unit || '';
        const qtyLabel = unit ? `${qty} ${unit}` : String(qty);
        return `${idx + 1}. ${it.name || 'Item'} — ${qtyLabel}`;
      })
      .filter(Boolean);

    if (lines.length === 0) {
      alert('This purchase order has no items with quantity to share.');
      return;
    }

    let message = `*Purchase Order*\n${orderNumber}\nDate: ${dateLabel}`;
    if (nameLabel) message += `\nName: ${nameLabel}`;
    message += `\n\n*Items:*\n${lines.join('\n')}`;

    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const goToPreview = () => {
    const items = [];
    const existingById = new Map(
      selectedProducts.filter((p) => !p.isCustom && p.id).map((p) => [p.id, p])
    );
    const existingCustomItems = selectedProducts.filter((p) => p.isCustom);

    allProducts.forEach((product) => {
      const hasVariations = Array.isArray(product.variations) && product.variations.length > 0;

      // Base product (aggregated) selection
      // If product has variations, parent-row selection is treated as selecting all child variations.
      if (selectedIds.includes(product.id) && !hasVariations) {
        const existing = existingById.get(product.id);
        if (existing) {
          items.push({ ...existing });
        } else {
          items.push({
            id: product.id,
            name: product.name,
            productBrand: product.category || '',
            productCategory: product.subcategory || '',
            catalogueNumber: product.catalogueNumber || '',
            orderQuantity: '1',
            orderUnit: product.base?.unit || product.unit || '',
            orderQuantitySecondary: product.enableDualUnit ? '1' : '',
            orderedQuantityPrimary:
              product.enableDualUnit && parsePositiveNumber(product.conversionFactor)
                ? parsePositiveNumber(product.conversionFactor)
                : null,
            primaryUnit: product.primaryUnit || product.base?.unit || product.unit || '',
            secondaryUnit: product.secondaryUnit || '',
            conversionFactor: product.conversionFactor || null,
            enableDualUnit: Boolean(product.enableDualUnit)
          });
        }
      }

      // Individual variation selection
      if (hasVariations) {
        const parentSelected = selectedIds.includes(product.id);
        const productDual = Boolean(product.enableDualUnit);
        product.variations.forEach((v) => {
          // If parent row is selected, include all child variations in preview/PDF.
          if (parentSelected || selectedIds.includes(v.id)) {
            const existing = existingById.get(v.id);
            if (existing) {
              items.push({ ...existing });
            } else {
              items.push({
                id: v.id,
                name: v.size
                  ? formatProductWithVariation(
                      product.name,
                      v.size,
                      normalizeSizeNamePosition(product.sizeNamePosition)
                    )
                  : product.name,
                productBrand: product.category || '',
                productCategory: product.subcategory || '',
                catalogueNumber: v.catalogueNumber || product.catalogueNumber || '',
                orderQuantity: '1',
                orderUnit: v.unit || product.base?.unit || product.unit || '',
                orderQuantitySecondary: productDual ? '1' : '',
                orderedQuantityPrimary:
                  productDual && parsePositiveNumber(v.conversionFactor)
                    ? parsePositiveNumber(v.conversionFactor)
                    : null,
                primaryUnit: v.primaryUnit || product.base?.unit || product.unit || '',
                secondaryUnit: v.secondaryUnit || '',
                conversionFactor: v.conversionFactor || null,
                enableDualUnit: productDual
              });
            }
          }
        });
      }
    });

    if (items.length === 0 && existingCustomItems.length === 0) {
      alert('Please select at least one product or variation for the purchase order.');
      return;
    }

    setSelectedProducts([...items, ...existingCustomItems]);
    setOrderStep('preview');
  };

  const handleQuantityChange = (index, value) => {
    setSelectedProducts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], orderQuantity: value };
      return copy;
    });
  };

  const handleSecondaryQuantityChange = (index, value) => {
    setSelectedProducts((prev) => {
      const copy = [...prev];
      const item = copy[index];
      const conversionFactor = parsePositiveNumber(item?.conversionFactor);
      const secondaryQty = parsePositiveNumber(value);
      const orderedQuantityPrimary =
        conversionFactor && secondaryQty ? secondaryQty * conversionFactor : null;
      copy[index] = {
        ...item,
        orderQuantitySecondary: value,
        orderedQuantityPrimary
      };
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
        productBrand: '',
        productCategory: '',
        catalogueNumber: '',
        orderQuantity: '',
        orderUnit: '',
        isCustom: true
      }
    ]);
  };

  const handleRemoveProductFromOrder = (index) => {
    setSelectedProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const resolveOrderItemUnit = (item) => {
    const directUnit = String(item.orderUnit ?? item.unit ?? '').trim();
    if (directUnit) return directUnit;

    const productId = String(item.id ?? item.productId ?? '').trim();
    if (!productId) return '';

    if (productId.includes('_')) {
      const [baseId, ...variationParts] = productId.split('_');
      const variationKey = variationParts.join('_');
      const baseProduct = allProducts.find((p) => p.id === baseId);
      const matchedVariation = baseProduct?.variations?.find((v) => v.size === variationKey);
      return String(matchedVariation?.unit ?? baseProduct?.base?.unit ?? baseProduct?.unit ?? '').trim();
    }

    const baseProduct = allProducts.find((p) => p.id === productId);
    return String(baseProduct?.base?.unit ?? baseProduct?.unit ?? '').trim();
  };

  const closeOrderModal = () => {
    setIsCreatingOrder(false);
    setOrderStep('select');
    setSelectedIds([]);
    setSelectedProducts([]);
    setOrderName('');
    setOrderDate(formatDateDDMMYYYY(new Date()));
    setShowAllOrderProducts(false);
    setEditingOrderId(null);
    setEditingOrderMeta(null);
    setShowExitConfirm(false);
    setPreviewSearchQuery('');
  };

  const requestCloseOrderModal = () => {
    setShowExitConfirm(true);
  };

  const getNextPurchaseOrderNumber = () => {
    if (purchaseOrders.length === 0) return 1;
    const maxValue = purchaseOrders.reduce((max, order, index) => {
      const current = getOrderNumberValueFromOrder(order, index);
      return current > max ? current : max;
    }, 1);
    return maxValue + 1;
  };

  // Helper to build PDF from generic order data
  /** Supplier / order name is stored on the Firestore document only; it is not drawn on the PDF. */
  const createOrderPDFDoc = (displayDate, itemsToOrder, orderNumberLabel = '') => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageCenterX = doc.internal.pageSize.getWidth() / 2;
    const anyCatalogue = itemsToOrder.some(
      (item) => item.catalogueNumber && String(item.catalogueNumber).trim() !== ''
    );
    /** Sum of column widths — used to center the table on the page. */
    const tableContentWidthMm = anyCatalogue ? 20 + 90 + 40 + 30 : 20 + 110 + 30;
    const pageWidthMm = doc.internal.pageSize.getWidth();
    const tableSideMarginMm = Math.max(8, (pageWidthMm - tableContentWidthMm) / 2);
    /** Match header text to the centered table edges (same as autoTable horizontal margins). */
    const tableEdgeLeftMm = tableSideMarginMm;
    const tableEdgeRightMm = tableSideMarginMm + tableContentWidthMm;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.text('ORDER LIST', pageCenterX, 24, { align: 'center' });
    // Underline below ORDER LIST heading
    doc.setLineWidth(0.8);
    doc.line(pageCenterX - 53, 28, pageCenterX + 53, 28);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    doc.text('Mondal Plumbing & Sanitation', tableEdgeLeftMm, 40);
    if (displayDate) {
      doc.text(displayDate, tableEdgeLeftMm, 46);
    }
    if (orderNumberLabel) {
      doc.text(`ORD NO. : ${orderNumberLabel}`, tableEdgeRightMm, 40, { align: 'right' });
    }

    const head = anyCatalogue
      ? [['SL No.', 'Products', 'Catalogue No.', 'Qty (Unit)']]
      : [['SL No.', 'Products', 'Qty (Unit)']];

    const body = itemsToOrder.map((item, idx) => {
      const qtyRaw = String(item.orderQuantity ?? '').trim();
      const unitRaw = String(item.orderUnit ?? item.unit ?? '').trim();
      const qtyAlreadyContainsUnit =
        unitRaw.length > 0
          ? new RegExp(`\\b${escapeRegExp(unitRaw)}\\b$`, 'i').test(qtyRaw)
          : false;
      const qtyWithUnit =
        unitRaw && qtyRaw && !qtyAlreadyContainsUnit ? `${qtyRaw} ${unitRaw}` : qtyRaw;
      const catalogueNo =
        item.catalogueNumber && String(item.catalogueNumber).trim() !== ''
          ? String(item.catalogueNumber).trim()
          : '';

      if (anyCatalogue) {
        if (catalogueNo) {
          return [String(idx + 1), item.name || '', catalogueNo, qtyWithUnit];
        }
        // No catalogue number: let product name span Products + Catalogue columns (no blank cell)
        return [
          String(idx + 1),
          { content: item.name || '', colSpan: 2, styles: { halign: 'left', valign: 'middle' } },
          qtyWithUnit
        ];
      }

      return [String(idx + 1), item.name || '', qtyWithUnit];
    });

    doc.autoTable({
      startY: 55,
      head,
      body,
      theme: 'grid',
      headStyles: {
        fillColor: [50, 50, 50],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        font: 'helvetica',
        valign: 'middle'
      },
      styles: {
        font: 'helvetica',
        fontSize: 10,
        halign: 'center',
        valign: 'middle'
      },
      columnStyles: anyCatalogue
        ? {
            0: { cellWidth: 20, fontStyle: 'bold', halign: 'center', valign: 'middle' },
            1: { cellWidth: 90, halign: 'left', valign: 'middle' },
            2: { cellWidth: 40, fontStyle: 'bold', halign: 'center', valign: 'middle' },
            3: { cellWidth: 30, fontStyle: 'bold', halign: 'center', valign: 'middle' }
          }
        : {
            0: { cellWidth: 20, fontStyle: 'bold', halign: 'center', valign: 'middle' },
            1: { cellWidth: 110, halign: 'left', valign: 'middle' },
            2: { cellWidth: 30, fontStyle: 'bold', halign: 'center', valign: 'middle' }
          },
      margin: { left: tableSideMarginMm, right: tableSideMarginMm }
    });

    return doc;
  };

  const generateOrderPDF = async () => {
    const itemsToOrder = selectedProducts
      .filter((p) => {
        if (previewItemUsesSecondaryQty(p)) {
          return parsePositiveNumber(p.orderQuantitySecondary) !== null;
        }
        const q = (p.orderQuantity ?? '').toString().trim();
        return q.length > 0;
      })
      .map((item) => ({
        ...item,
        orderUnit: previewItemUsesSecondaryQty(item)
          ? item.secondaryUnit
          : resolveOrderItemUnit(item),
        orderQuantity: previewItemUsesSecondaryQty(item)
          ? String(item.orderQuantitySecondary ?? '')
          : item.orderQuantity
      }));
    if (itemsToOrder.length === 0) {
      alert('Please set quantity for at least one product before generating the PDF.');
      return;
    }

    const displayName = orderName && orderName.trim().length > 0 ? orderName.trim() : '';
    const isEditing = Boolean(editingOrderId);
    const displayDate =
      (orderDate && String(orderDate).trim()) ||
      (isEditing && editingOrderMeta?.originalDate) ||
      formatDateDDMMYYYY(new Date());

    const orderNumberValue = isEditing
      ? (editingOrderMeta?.orderNumberValue != null
          ? editingOrderMeta.orderNumberValue
          : getNextPurchaseOrderNumber())
      : getNextPurchaseOrderNumber();
    const orderNumber = isEditing
      ? (editingOrderMeta?.orderNumber || formatPurchaseOrderNumber(orderNumberValue))
      : formatPurchaseOrderNumber(orderNumberValue);

    // Create and download PDF
    const pdfDoc = createOrderPDFDoc(displayDate, itemsToOrder, orderNumber);
    const safeOrderNumber = orderNumber.replace(/\//g, '-');
    const fileName = `${safeOrderNumber}_${String(displayDate).replace(/[.\-/]/g, '')}.pdf`;
    pdfDoc.save(fileName);

    const previousItemsByProductId = new Map();
    if (isEditing && Array.isArray(editingOrderMeta?.previousItems)) {
      editingOrderMeta.previousItems.forEach((prev) => {
        if (prev?.productId) previousItemsByProductId.set(prev.productId, prev);
      });
    }

    // Save order to Firestore for future reference
    try {
      const orderDoc = {
        name: displayName,
        date: displayDate,
        orderNumber,
        orderNumberValue,
        items: itemsToOrder.map((item) => {
          const oqSec = parsePositiveNumber(item.orderQuantitySecondary);
          const hasDualLine =
            Boolean(item.enableDualUnit) &&
            !item.isCustom &&
            oqSec != null &&
            parsePositiveNumber(item.conversionFactor) &&
            String(item.secondaryUnit || '').trim() !== '';
          const legacyOrderedInt = (() => {
            if (item.isCustom) return null;
            const raw = item.orderQuantity != null ? String(item.orderQuantity).trim() : '';
            const n = parseInt(raw, 10);
            return !Number.isNaN(n) && n > 0 ? n : null;
          })();

          const prev = !item.isCustom && item.id ? previousItemsByProductId.get(item.id) : null;
          const prevAddedSec = prev ? Number(prev.addedQuantitySecondary || 0) : 0;
          const prevAddedPri = prev ? Number(prev.addedPrimaryRestock || 0) : 0;

          return {
            productId: item.isCustom ? null : (item.id || null),
            name: item.name || '',
            productBrand: item.productBrand || '',
            productCategory: item.productCategory || '',
            catalogueNumber: item.catalogueNumber || '',
            quantityText: item.orderQuantity != null ? String(item.orderQuantity) : '',
            orderUnit: item.orderUnit || item.unit || '',
            enableDualUnit: Boolean(item.enableDualUnit),
            orderedQuantitySecondary: oqSec,
            orderedQuantityPrimary: parsePositiveNumber(item.orderedQuantityPrimary),
            secondaryUnit: item.secondaryUnit || '',
            primaryUnit: item.primaryUnit || item.orderUnit || item.unit || '',
            conversionFactor: parsePositiveNumber(item.conversionFactor),
            ...(hasDualLine
              ? (() => {
                  const due = Math.max(0, roundQtySecondary(oqSec - prevAddedSec));
                  return {
                    addedQuantitySecondary: prevAddedSec,
                    dueQuantitySecondary: due,
                    status:
                      due <= 0 ? 'COMPLETED' : prevAddedSec > 1e-6 ? 'PARTIAL' : 'PENDING'
                  };
                })()
              : legacyOrderedInt != null && !item.isCustom
                ? (() => {
                    const due = Math.max(0, legacyOrderedInt - prevAddedPri);
                    return {
                      orderedPrimaryRestock: legacyOrderedInt,
                      addedPrimaryRestock: prevAddedPri,
                      duePrimaryRestock: due,
                      status:
                        due <= 0 ? 'COMPLETED' : prevAddedPri > 0 ? 'PARTIAL' : 'PENDING'
                    };
                  })()
                : {})
          };
        })
      };

      if (isEditing) {
        await updateDoc(doc(db, 'purchaseOrders', editingOrderId), {
          ...orderDoc,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'purchaseOrders'), {
          ...orderDoc,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error(isEditing ? 'Failed to update purchase order:' : 'Failed to save purchase order:', err);
    }

    alert(isEditing ? 'Purchase order updated successfully.' : 'Purchase order PDF generated successfully.');
    closeOrderModal();
  };

  const downloadExistingOrderPDF = (order) => {
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

    const orderNumberLabel = order.orderNumber || formatPurchaseOrderNumber(1);
    const pdfDoc = createOrderPDFDoc(dateFromDoc, itemsForPdf.map((it) => ({
      name: it.name,
      catalogueNumber: it.catalogueNumber,
      orderQuantity: it.quantityText != null ? it.quantityText : it.quantity,
      orderUnit: it.orderUnit || it.unit || ''
    })), orderNumberLabel);
    const safeOrderNumber = orderNumberLabel.replace(/\//g, '-');
    const fileName = `${safeOrderNumber}_${String(dateFromDoc).replace(/[.\-/]/g, '')}.pdf`;
    pdfDoc.save(fileName);
  };

  const viewExistingOrderPDF = (order) => {
    let dateFromDoc = '';
    if (order.date) {
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

    const orderNumberLabel = order.orderNumber || formatPurchaseOrderNumber(1);
    const pdfDoc = createOrderPDFDoc(dateFromDoc, itemsForPdf.map((it) => ({
      name: it.name,
      catalogueNumber: it.catalogueNumber,
      orderQuantity: it.quantityText != null ? it.quantityText : it.quantity,
      orderUnit: it.orderUnit || it.unit || ''
    })), orderNumberLabel);

    const pdfBlob = pdfDoc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const opened = window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      alert('Popup blocked. Please allow popups to view the PDF.');
      URL.revokeObjectURL(pdfUrl);
      return;
    }
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000);
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

  const resetAllPurchaseOrders = async () => {
    if (!window.confirm('This will delete ALL previous purchase orders. Continue?')) {
      return;
    }
    if (!window.confirm('Are you absolutely sure? SL numbers will restart from MPS/PO/00000.')) {
      return;
    }
    try {
      const snapshot = await getDocs(collection(db, 'purchaseOrders'));
      if (snapshot.empty) {
        alert('No purchase orders found to reset.');
        return;
      }
      const batch = writeBatch(db);
      snapshot.forEach((docSnap) => {
        batch.delete(doc(db, 'purchaseOrders', docSnap.id));
      });
      await batch.commit();
      alert('All purchase orders deleted. New purchase orders will start from MPS/PO/00001.');
    } catch (err) {
      console.error('Failed to reset purchase orders:', err);
      alert('Failed to reset purchase orders. Please try again.');
    }
  };

  const applyPrimaryQuantityToProduct = async (productIdKey, qtyPrimaryDelta) => {
    if (!qtyPrimaryDelta || qtyPrimaryDelta <= 0) return;
    const [productId, ...rest] = productIdKey.split('_');
    const variationSizeKey = rest.length > 0 ? rest.join('_') : null;

    const productRef = doc(db, 'products', productId);
    const snap = await getDoc(productRef);
    if (!snap.exists()) return;
    const data = snap.data();

    if (variationSizeKey && Array.isArray(data.variations) && data.variations.length > 0) {
      const variations = data.variations.map((v) => {
        if (v.size === variationSizeKey) {
          const currentQty = v.quantity || 0;
          return { ...v, quantity: currentQty + qtyPrimaryDelta };
        }
        return v;
      });
      const totalQuantity = variations.reduce((sum, v) => sum + (v.quantity || 0), 0);
      await updateDoc(productRef, {
        variations,
        quantity: totalQuantity,
        updatedAt: serverTimestamp()
      });
    } else {
      const currentQty = data.quantity || 0;
      await updateDoc(productRef, {
        quantity: currentQty + qtyPrimaryDelta,
        updatedAt: serverTimestamp()
      });
    }
  };

  const handleRestockNow = async () => {
    if (!selectedRestockOrderId) {
      alert('Please select a purchase order to restock.');
      return;
    }

    const orderRef = doc(db, 'purchaseOrders', selectedRestockOrderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      alert('Selected purchase order not found.');
      return;
    }

    const orderData = orderSnap.data();
    const items = Array.isArray(orderData.items) ? [...orderData.items] : [];

    const linesToApply = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.productId) continue;
      const key = it.productId;
      const rawInput = restockQuantities[key];
      if (rawInput === undefined || rawInput === null || String(rawInput).trim() === '') {
        continue;
      }

      if (isDualRestockItem(it)) {
        const due = getDueSecondary(it);
        if (due <= 0) continue;
        const addSec = parsePositiveNumber(String(rawInput).trim());
        if (!addSec) {
          alert(`Enter a valid positive quantity for "${it.name || 'item'}".`);
          return;
        }
        if (addSec > due + 1e-6) {
          alert(
            `Quantity to add cannot exceed due quantity (${due} ${it.secondaryUnit || ''}) for "${it.name || 'item'}".`
          );
          return;
        }
        const addPrimary = primaryDeltaFromSecondary(addSec, it.conversionFactor);
        if (!addPrimary || addPrimary <= 0) {
          alert(`Could not convert to primary units for "${it.name || 'item'}". Check conversion factor.`);
          return;
        }
        linesToApply.push({ index: i, mode: 'dual', productIdKey: key, addSec, addPrimary });
      } else {
        const dueP = getDuePrimaryLegacy(it);
        if (dueP <= 0) continue;
        const qty = parseInt(String(rawInput).trim(), 10);
        if (Number.isNaN(qty) || qty < 0) {
          alert(`Enter a valid whole number (0 or greater) for "${it.name || 'item'}".`);
          return;
        }
        if (qty === 0) continue;
        if (qty > dueP) {
          alert(
            `Quantity to add cannot exceed due quantity (${dueP} ${getRestockPrimaryUnitLabel(it)}) for "${it.name || 'item'}".`
          );
          return;
        }
        linesToApply.push({ index: i, mode: 'legacy', productIdKey: key, addPrimary: qty });
      }
    }

    if (linesToApply.length === 0) {
      alert('Enter at least one quantity to restock, or check that this order still has due quantities.');
      return;
    }

    if (!window.confirm('Are you sure you want to restock products from this purchase order?')) {
      return;
    }

    setRestockLoading(true);
    try {
      let itemsMutated = false;
      for (const line of linesToApply) {
        await applyPrimaryQuantityToProduct(line.productIdKey, line.addPrimary);

        if (line.mode === 'dual') {
          const it = items[line.index];
          const ordered = Number(it.orderedQuantitySecondary);
          const prevAdded = Number(it.addedQuantitySecondary || 0);
          const newAdded = roundQtySecondary(prevAdded + line.addSec);
          let newDue = roundQtySecondary(ordered - newAdded);
          if (newDue < 1e-6) newDue = 0;
          items[line.index] = {
            ...it,
            addedQuantitySecondary: newAdded,
            dueQuantitySecondary: newDue,
            status: newDue <= 1e-6 ? 'COMPLETED' : newAdded > 1e-6 ? 'PARTIAL' : 'PENDING'
          };
          itemsMutated = true;
        } else if (line.mode === 'legacy') {
          const it = items[line.index];
          const ordered = getLegacyOrderedPrimary(it);
          const prevAdded = Math.floor(Number(it.addedPrimaryRestock || 0));
          const newAdded = prevAdded + line.addPrimary;
          let newDue = Math.max(0, ordered - newAdded);
          items[line.index] = {
            ...it,
            orderedPrimaryRestock: ordered,
            addedPrimaryRestock: newAdded,
            duePrimaryRestock: newDue,
            status: newDue <= 0 ? 'COMPLETED' : newAdded > 0 ? 'PARTIAL' : 'PENDING'
          };
          itemsMutated = true;
        }
      }

      if (itemsMutated) {
        await updateDoc(orderRef, {
          items,
          updatedAt: serverTimestamp()
        });
      }

      alert('Products have been restocked successfully.');
      setIsRestockOpen(false);
      setSelectedRestockOrderId('');
      setRestockQuantities({});
    } catch (err) {
      console.error('Failed to restock products:', err);
      alert('Failed to restock some products. Please check console for details.');
    } finally {
      setRestockLoading(false);
    }
  };

  const previewOrderNumber = editingOrderId && editingOrderMeta?.orderNumber
    ? editingOrderMeta.orderNumber
    : formatPurchaseOrderNumber(
        editingOrderId && editingOrderMeta?.orderNumberValue != null
          ? editingOrderMeta.orderNumberValue
          : getNextPurchaseOrderNumber()
      );

  const renderOrderSelectProductRows = (productList) =>
    productList.flatMap((product) => {
      const hasVariations =
        Array.isArray(product.variations) && product.variations.length > 0;
      const isOpen = openOrderVariationProductId === product.id;
      const status = product.base?.status || 'ok';
      const basePurchasePriceRaw =
        product.base?.purchasePrice ??
        product.variations?.[0]?.purchasePrice ??
        0;
      const basePurchasePrice = Number(basePurchasePriceRaw) || 0;
      const baseNormalPriceRaw =
        product.base?.price ??
        product.variations?.[0]?.price ??
        product.price ??
        0;
      const baseNormalPrice = Number(baseNormalPriceRaw) || 0;

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
                    setOpenOrderVariationProductId(isOpen ? null : product.id)
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
          <td>
            {(product.category || '-') + ' / ' + (product.subcategory || 'No category')}
          </td>
          <td className="stock-quantity">
            {hasVariations ? (
              <span className="badge badge-warning">See variations</span>
            ) : (
              `${product.base?.quantity ?? '-'}${product.base?.unit ? ` ${product.base.unit}` : ''}`
            )}
          </td>
          <td>₹{basePurchasePrice.toFixed(2)}</td>
          <td>₹{baseNormalPrice.toFixed(2)}</td>
          <td className="status-cell">
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
            <td colSpan="7">
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
                      Qty (Unit)
                    </th>
                    <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                      Purchase Price
                    </th>
                    <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                      Price
                    </th>
                    <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {product.variations.map((v) => {
                    const vPurchasePrice = Number(v.purchasePrice ?? 0) || 0;
                    const vNormalPrice = Number(v.price ?? 0) || 0;
                    const qtyUnit = v.unit || product.base?.unit || '';
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
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                          {v.size || '-'}
                        </td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                          {`${v.quantity ?? '-'}${qtyUnit ? ` ${qtyUnit}` : ''}`}
                        </td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                          ₹{vPurchasePrice.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                          ₹{vNormalPrice.toFixed(2)}
                        </td>
                        <td style={{ padding: '6px', border: '1px solid #ddd' }}>
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
    });

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

      <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
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
                  <th style={{ textAlign: 'center' }}>Qty (Unit)</th>
                  <th style={{ textAlign: 'center' }}>Purchase Price</th>
                  <th style={{ textAlign: 'center' }}>Price</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
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
                    const purchasePrice =
                      product.base?.purchasePrice ?? product.variations?.[0]?.purchasePrice ?? product.purchasePrice ?? 0;
                    const sellingPrice =
                      product.base?.price ?? product.variations?.[0]?.price ?? product.price ?? 0;

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
                        <td>
                          {(product.category || '-') + ' / ' + (product.subcategory || 'No category')}
                        </td>
                        <td className="stock-quantity">
                          {product.base ? (
                            <span
                              className={`badge ${
                                product.base.status === 'out' ? 'badge-danger' : 'badge-warning'
                              }`}
                            >
                              {`${product.base.quantity}${product.base?.unit ? ` ${product.base.unit}` : ''}`}
                            </span>
                          ) : (
                            <span className="badge badge-warning">See variations</span>
                          )}
                        </td>
                        <td className="stock-quantity">
                          {hasVariations ? (
                            <span className="badge badge-warning">See variations</span>
                          ) : (
                            <span className="price">₹{(purchasePrice || 0).toFixed(2)}</span>
                          )}
                        </td>
                        <td className="stock-quantity">
                          {hasVariations ? (
                            <span className="badge badge-warning">See variations</span>
                          ) : (
                            <span className="price">₹{(sellingPrice || 0).toFixed(2)}</span>
                          )}
                        </td>
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
                                    Qty (Unit)
                                  </th>
                                  <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                    Purchase Price
                                  </th>
                                  <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                    Price
                                  </th>
                                  <th style={{ padding: '6px', border: '1px solid #ddd' }}>
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {product.variations.map((v) => {
                                  const qtyUnit = v.unit || product.base?.unit || product.unit || '';
                                  return (
                                  <tr key={v.id}>
                                    <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                                      {v.size || '-'}
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                                      {`${v.quantity}${qtyUnit ? ` ${qtyUnit}` : ''}`}
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                                      ₹{(v.purchasePrice || 0).toFixed(2)}
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                                      ₹{(v.price || 0).toFixed(2)}
                                    </td>
                                    <td style={{ padding: '6px', border: '1px solid #ddd' }}>
                                      {v.status === 'out' ? (
                                        <span className="status-badge danger">OUT OF STOCK</span>
                                      ) : (
                                        <span className="status-badge warning">LOW STOCK</span>
                                      )}
                                    </td>
                                  </tr>
                                )})}
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
              requestCloseOrderModal();
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
                {orderStep === 'select'
                  ? (editingOrderId ? 'Edit Products for Purchase Order' : 'Select Products for Purchase Order')
                  : (editingOrderId ? 'Edit Purchase Order' : 'Preview Purchase Order')}
              </h3>
              <button
                type="button"
                onClick={requestCloseOrderModal}
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
                        <th style={{ textAlign: 'center' }}>Qty (Unit)</th>
                        <th>Purchase Price</th>
                        <th>Price</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderSelectProducts.length > 0 && (
                        <tr>
                          <td
                            colSpan="7"
                            style={{
                              background: '#eef5ff',
                              fontWeight: 700,
                              fontSize: '0.92rem',
                              padding: '10px 12px',
                              color: '#1a56db',
                              borderBottom: '1px solid #d0e0ff'
                            }}
                          >
                            Selected Products ({selectedOrderSelectProducts.length})
                          </td>
                        </tr>
                      )}
                      {renderOrderSelectProductRows(selectedOrderSelectProducts)}
                      {selectedOrderSelectProducts.length > 0 &&
                        otherOrderSelectProducts.length > 0 && (
                          <tr>
                            <td
                              colSpan="7"
                              style={{
                                background: '#f5f5f7',
                                fontWeight: 700,
                                fontSize: '0.92rem',
                                padding: '10px 12px',
                                color: '#555',
                                borderBottom: '1px solid #e0e0e0'
                              }}
                            >
                              Other Products
                            </td>
                          </tr>
                        )}
                      {renderOrderSelectProductRows(otherOrderSelectProducts)}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    className="cancel-due-btn"
                    onClick={requestCloseOrderModal}
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
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px',
                    gap: '10px',
                    flexWrap: 'wrap'
                  }}
                >
                  <input
                    type="text"
                    placeholder="Search existing items in this purchase order..."
                    value={previewSearchQuery}
                    onChange={(e) => setPreviewSearchQuery(e.target.value)}
                    className="low-stock-search-input"
                    style={{ width: '100%', maxWidth: '400px', margin: 0 }}
                  />
                  <div style={{ fontWeight: 700 }}>
                    ORD NO. : {previewOrderNumber}
                  </div>
                </div>
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
                        <th>Product Brand</th>
                        <th>Category</th>
                        <th>Catalogue No.</th>
                        <th style={{ textAlign: 'center' }}>Qty (Unit)</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProducts
                        .map((product, originalIndex) => ({ ...product, originalIndex }))
                        .filter((product) => {
                          if (!previewSearchQuery.trim()) return true;
                          const q = previewSearchQuery.trim().toLowerCase();
                          return (
                            (product.name || '').toLowerCase().includes(q) ||
                            (product.productBrand || '').toLowerCase().includes(q) ||
                            (product.productCategory || '').toLowerCase().includes(q) ||
                            (product.catalogueNumber || '').toLowerCase().includes(q)
                          );
                        })
                        .map((product, displayIndex) => (
                          <tr key={product.id}>
                            <td>{displayIndex + 1}</td>
                            <td>
                              {product.isCustom ? (
                                <input
                                  type="text"
                                  value={product.name || ''}
                                  onChange={(e) => handleCustomFieldChange(product.originalIndex, 'name', e.target.value)}
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
                                  value={product.productBrand || ''}
                                  onChange={(e) => handleCustomFieldChange(product.originalIndex, 'productBrand', e.target.value)}
                                  placeholder="Brand (optional)"
                                />
                              ) : (
                                product.productBrand || '-'
                              )}
                            </td>
                            <td>
                              {product.isCustom ? (
                                <input
                                  type="text"
                                  value={product.productCategory || ''}
                                  onChange={(e) => handleCustomFieldChange(product.originalIndex, 'productCategory', e.target.value)}
                                  placeholder="Category (optional)"
                                />
                              ) : (
                                product.productCategory || '-'
                              )}
                            </td>
                            <td>
                              {product.isCustom ? (
                                <input
                                  type="text"
                                  value={product.catalogueNumber || ''}
                                  onChange={(e) => handleCustomFieldChange(product.originalIndex, 'catalogueNumber', e.target.value)}
                                  placeholder="Catalogue no. (optional)"
                                />
                              ) : (
                                product.catalogueNumber || ''
                              )}
                            </td>
                            <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                              {previewItemUsesSecondaryQty(product) ? (
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    alignItems: 'center'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={product.orderQuantitySecondary || ''}
                                      onChange={(e) => handleSecondaryQuantityChange(product.originalIndex, e.target.value)}
                                      placeholder="0"
                                      style={{ width: '90px', textAlign: 'center' }}
                                    />
                                    <span>{product.secondaryUnit}</span>
                                  </div>
                                  <small style={{ color: '#555' }}>
                                    1 {product.secondaryUnit} = {product.conversionFactor} {product.primaryUnit || 'units'}
                                  </small>
                                  <small style={{ color: '#333', fontWeight: 600 }}>
                                    Primary qty: {product.orderedQuantityPrimary ?? 0} {product.primaryUnit || ''}
                                  </small>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  <input
                                    type="text"
                                    value={product.orderQuantity || ''}
                                    onChange={(e) => handleQuantityChange(product.originalIndex, e.target.value)}
                                    placeholder="Qty (can include text)"
                                    style={{ width: '120px', textAlign: 'center' }}
                                  />
                                </div>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="cancel-due-btn"
                                onClick={() => handleRemoveProductFromOrder(product.originalIndex)}
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

                <div
                  style={{
                    marginTop: '16px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                    alignItems: 'stretch',
                    justifyContent: 'flex-end'
                  }}
                >
                  <button
                    type="button"
                    className="cancel-due-btn"
                    onClick={() => {
                      if (editingOrderId) {
                        setShowAllOrderProducts(true);
                      }
                      setOrderStep('select');
                    }}
                    style={{
                      minHeight: '40px',
                      padding: '0.6rem 14px',
                      boxSizing: 'border-box',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="save-due-btn"
                    onClick={() => {
                      setShowAllOrderProducts(true);
                      setOrderStep('select');
                    }}
                    style={{
                      minHeight: '40px',
                      padding: '0.6rem 14px',
                      boxSizing: 'border-box',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Add Items
                  </button>
                  <button
                    type="button"
                    className="cancel-due-btn"
                    onClick={requestCloseOrderModal}
                    style={{
                      minHeight: '40px',
                      padding: '0.6rem 14px',
                      boxSizing: 'border-box',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="save-due-btn"
                    onClick={generateOrderPDF}
                    style={{
                      whiteSpace: 'nowrap',
                      minHeight: '40px',
                      padding: '0.6rem 14px',
                      boxSizing: 'border-box',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {editingOrderId ? 'Update & Generate PDF' : 'Save & Generate PDF'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Exit confirmation for Create/Edit Purchase Order */}
      {showExitConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 11000,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowExitConfirm(false);
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '10px',
              maxWidth: '400px',
              width: '100%',
              padding: '22px 20px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>Do you want to exit?</h3>
            <p style={{ margin: '0 0 18px 0', color: '#555', fontSize: '0.95rem' }}>
              Your current selection will not be saved if you leave.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                style={{
                  minWidth: '90px',
                  padding: '0.55rem 1.1rem',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  background: '#dc3545',
                  color: '#fff'
                }}
              >
                No
              </button>
              <button
                type="button"
                onClick={closeOrderModal}
                style={{
                  minWidth: '90px',
                  padding: '0.55rem 1.1rem',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  background: '#28a745',
                  color: '#fff'
                }}
              >
                Yes
              </button>
            </div>
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
              setExpandedHistoryOrderId(null);
              setOpenMenuOrderId(null);
              setOpenShareOrderId(null);
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
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="delete-bill-btn"
                  onClick={resetAllPurchaseOrders}
                  title="Delete all purchase orders and reset SL number"
                >
                  Reset All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsHistoryOpen(false);
                    setExpandedHistoryOrderId(null);
                    setOpenMenuOrderId(null);
                    setOpenShareOrderId(null);
                  }}
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
                        <th style={{ width: '40px', textAlign: 'center' }} aria-label="Expand" />
                        <th>SL No.</th>
                        <th>Name</th>
                        <th>Date</th>
                        <th>Items</th>
                        <th>Restock status</th>
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
                        const orderNumber = order.orderNumber || formatPurchaseOrderNumber(getOrderNumberValueFromOrder(order, index));
                        const overallRestockStatus = getPurchaseOrderOverallRestockStatus(order);
                        const dualLines = getDualTrackedLines(order);
                        const hasExpandableLines = itemCount > 0;

                        const query = oldOrdersSearch.trim().toLowerCase();
                        if (query) {
                          const haystack =
                            `${orderNumber} ${dateLabel} ${nameLabel} ${overallRestockStatus || ''}`.toLowerCase();
                          if (!haystack.includes(query)) {
                            return null;
                          }
                        }

                        const statusBadge = (label) => {
                          if (label === 'COMPLETED') {
                            return {
                              background: '#e8f5e9',
                              color: '#2e7d32',
                              border: '1px solid #c8e6c9'
                            };
                          }
                          if (label === 'PARTIAL') {
                            return {
                              background: '#fff3e0',
                              color: '#e65100',
                              border: '1px solid #ffe0b2'
                            };
                          }
                          if (label === 'PENDING') {
                            return {
                              background: '#e3f2fd',
                              color: '#1565c0',
                              border: '1px solid #bbdefb'
                            };
                          }
                          return {
                            background: '#eceff1',
                            color: '#546e7a',
                            border: '1px solid #cfd8dc'
                          };
                        };

                        const isExpanded = expandedHistoryOrderId === order.id;

                        return (
                          <React.Fragment key={order.id}>
                            <tr>
                              <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                {hasExpandableLines ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedHistoryOrderId(isExpanded ? null : order.id)
                                    }
                                    title={isExpanded ? 'Hide line details' : 'Show line details'}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: '2px',
                                      color: '#667eea',
                                      fontSize: '14px',
                                      lineHeight: 1,
                                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                      transition: 'transform 0.2s'
                                    }}
                                  >
                                    ▶
                                  </button>
                                ) : null}
                              </td>
                              <td>{orderNumber}</td>
                              <td>{nameLabel}</td>
                              <td>{dateLabel}</td>
                              <td>{itemCount}</td>
                              <td>
                                {overallRestockStatus ? (
                                  <span
                                    title={
                                      overallRestockStatus === 'NOT TRACKED'
                                        ? 'No line has restock tracking: need dual-unit data or a positive whole-number order quantity on catalog lines.'
                                        : undefined
                                    }
                                    style={{
                                      display: 'inline-block',
                                      padding: '3px 10px',
                                      borderRadius: '6px',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      ...statusBadge(overallRestockStatus)
                                    }}
                                  >
                                    {overallRestockStatus}
                                  </span>
                                ) : (
                                  <span style={{ color: '#999', fontSize: '0.88rem' }}>—</span>
                                )}
                              </td>
                              <td>
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: '6px',
                                    flexWrap: 'nowrap',
                                    alignItems: 'center'
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="low-stock-more-btn"
                                    style={iconActionButtonStyle}
                                    onClick={() => viewExistingOrderPDF(order)}
                                    title="View"
                                  >
                                    View
                                  </button>
                                  <div
                                    className="po-share-container"
                                    style={{ position: 'relative', display: 'inline-flex' }}
                                  >
                                    <button
                                      type="button"
                                      className="low-stock-more-btn"
                                      style={iconActionButtonStyle}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuOrderId(null);
                                        setOpenShareOrderId(
                                          openShareOrderId === order.id ? null : order.id
                                        );
                                      }}
                                      title="Share"
                                    >
                                      Share
                                    </button>
                                    {openShareOrderId === order.id && (
                                      <div
                                        style={{
                                          position: 'absolute',
                                          top: '100%',
                                          left: 0,
                                          backgroundColor: 'white',
                                          border: '1px solid #ddd',
                                          borderRadius: '5px',
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                          zIndex: 1000,
                                          minWidth: '140px',
                                          marginTop: '4px',
                                          overflow: 'hidden'
                                        }}
                                      >
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            shareOrderOnWhatsApp(order);
                                            setOpenShareOrderId(null);
                                          }}
                                          style={{
                                            width: '100%',
                                            padding: '10px 15px',
                                            border: 'none',
                                            background: 'none',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            color: '#128C7E',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#f5f5f5';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'white';
                                          }}
                                        >
                                          WhatsApp
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <div
                                    className="po-menu-container"
                                    style={{ position: 'relative', display: 'inline-flex' }}
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenShareOrderId(null);
                                        setOpenMenuOrderId(
                                          openMenuOrderId === order.id ? null : order.id
                                        );
                                      }}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '18px',
                                        padding: '4px 6px',
                                        color: '#333',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '4px',
                                        fontWeight: 'bold',
                                        lineHeight: '0.45',
                                        gap: '2px'
                                      }}
                                      title="More options"
                                    >
                                      <span>•</span>
                                      <span>•</span>
                                      <span>•</span>
                                    </button>
                                    {openMenuOrderId === order.id && (
                                      <div
                                        style={{
                                          position: 'absolute',
                                          top: '100%',
                                          right: 0,
                                          backgroundColor: 'white',
                                          border: '1px solid #ddd',
                                          borderRadius: '5px',
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                          zIndex: 1000,
                                          minWidth: '150px',
                                          marginTop: '4px',
                                          overflow: 'hidden'
                                        }}
                                      >
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            startEditOrder(order);
                                          }}
                                          style={{
                                            width: '100%',
                                            padding: '10px 15px',
                                            border: 'none',
                                            background: 'none',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            color: '#333'
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#f5f5f5';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'white';
                                          }}
                                        >
                                          ✏️ Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            downloadExistingOrderPDF(order);
                                            setOpenMenuOrderId(null);
                                          }}
                                          style={{
                                            width: '100%',
                                            padding: '10px 15px',
                                            border: 'none',
                                            background: 'none',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            color: '#333',
                                            borderTop: '1px solid #eee'
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#f5f5f5';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'white';
                                          }}
                                        >
                                          📄 Download
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenMenuOrderId(null);
                                            deletePurchaseOrder(order.id);
                                          }}
                                          style={{
                                            width: '100%',
                                            padding: '10px 15px',
                                            border: 'none',
                                            background: 'none',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            color: '#e74c3c',
                                            borderTop: '1px solid #eee'
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#f5f5f5';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'white';
                                          }}
                                        >
                                          🗑️ Delete
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && hasExpandableLines && (
                              <tr>
                                <td colSpan={7} style={{ padding: 0, background: '#f8f9fc' }}>
                                  <div style={{ padding: '12px 16px 16px' }}>
                                    <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '0.88rem' }}>
                                      Order line details
                                    </div>
                                    <p
                                      style={{
                                        fontSize: '0.8rem',
                                        color: '#666',
                                        margin: '0 0 10px 0',
                                        lineHeight: 1.45
                                      }}
                                    >
                                      {(() => {
                                        const lt = getLegacyPrimaryTrackedLines(order);
                                        if (dualLines.length > 0 && lt.length > 0) {
                                          return 'Dual-unit lines use the secondary unit for due/ordered. Single-unit lines use the primary unit.';
                                        }
                                        if (dualLines.length > 0) {
                                          return 'Dual-unit lines show restock status and due quantity in the secondary unit.';
                                        }
                                        if (lt.length > 0) {
                                          return 'Single-unit catalog lines show restock status and due quantity in the primary unit.';
                                        }
                                        return 'No tracked catalog lines (positive whole-number order qty, or dual-unit metadata).';
                                      })()}
                                    </p>
                                    <table
                                      style={{
                                        width: '100%',
                                        borderCollapse: 'collapse',
                                        fontSize: '0.85rem',
                                        background: '#fff'
                                      }}
                                    >
                                      <thead>
                                        <tr style={{ background: '#eef1f8' }}>
                                          <th style={{ textAlign: 'left', padding: '8px', border: '1px solid #dde2ee' }}>
                                            Product
                                          </th>
                                          <th style={{ textAlign: 'center', padding: '8px', border: '1px solid #dde2ee' }}>
                                            Restock line status
                                          </th>
                                          <th style={{ textAlign: 'right', padding: '8px', border: '1px solid #dde2ee' }}>
                                            Due
                                          </th>
                                          <th style={{ textAlign: 'right', padding: '8px', border: '1px solid #dde2ee' }}>
                                            Ordered
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(order.items || []).map((it, li) => {
                                          const rowKey = `${order.id}_line_${li}`;
                                          if (!it.productId) {
                                            return (
                                              <tr key={rowKey}>
                                                <td style={{ padding: '8px', border: '1px solid #eee' }}>
                                                  {it.name || 'Custom line'}
                                                </td>
                                                <td
                                                  colSpan={3}
                                                  style={{
                                                    padding: '8px',
                                                    border: '1px solid #eee',
                                                    color: '#888',
                                                    fontStyle: 'italic'
                                                  }}
                                                >
                                                  Not linked to catalog / not tracked for restock
                                                </td>
                                              </tr>
                                            );
                                          }
                                          const lineStatus = inferLineRestockStatusLabel(it);
                                          if (isDualRestockItem(it) && lineStatus) {
                                            const due = getDueSecondary(it);
                                            const ord = roundQtySecondary(it.orderedQuantitySecondary);
                                            return (
                                              <tr key={rowKey}>
                                                <td style={{ padding: '8px', border: '1px solid #eee' }}>
                                                  {it.name || '—'}
                                                </td>
                                                <td
                                                  style={{ padding: '8px', border: '1px solid #eee', textAlign: 'center' }}
                                                >
                                                  <span
                                                    style={{
                                                      display: 'inline-block',
                                                      padding: '2px 8px',
                                                      borderRadius: '4px',
                                                      fontWeight: 700,
                                                      fontSize: '0.76rem',
                                                      ...statusBadge(lineStatus)
                                                    }}
                                                  >
                                                    {lineStatus}
                                                  </span>
                                                </td>
                                                <td style={{ padding: '8px', border: '1px solid #eee', textAlign: 'right' }}>
                                                  {due} {it.secondaryUnit || ''}
                                                </td>
                                                <td style={{ padding: '8px', border: '1px solid #eee', textAlign: 'right' }}>
                                                  {ord} {it.secondaryUnit || ''}
                                                </td>
                                              </tr>
                                            );
                                          }
                                          if (lineStatus && getLegacyOrderedPrimary(it) > 0) {
                                            const due = getDuePrimaryLegacy(it);
                                            const ord = getLegacyOrderedPrimary(it);
                                            const u = getRestockPrimaryUnitLabel(it);
                                            return (
                                              <tr key={rowKey}>
                                                <td style={{ padding: '8px', border: '1px solid #eee' }}>
                                                  {it.name || '—'}
                                                </td>
                                                <td
                                                  style={{ padding: '8px', border: '1px solid #eee', textAlign: 'center' }}
                                                >
                                                  <span
                                                    style={{
                                                      display: 'inline-block',
                                                      padding: '2px 8px',
                                                      borderRadius: '4px',
                                                      fontWeight: 700,
                                                      fontSize: '0.76rem',
                                                      ...statusBadge(lineStatus)
                                                    }}
                                                  >
                                                    {lineStatus}
                                                  </span>
                                                </td>
                                                <td style={{ padding: '8px', border: '1px solid #eee', textAlign: 'right' }}>
                                                  {due} {u}
                                                </td>
                                                <td style={{ padding: '8px', border: '1px solid #eee', textAlign: 'right' }}>
                                                  {ord} {u}
                                                </td>
                                              </tr>
                                            );
                                          }
                                          return (
                                            <tr key={rowKey}>
                                              <td style={{ padding: '8px', border: '1px solid #eee' }}>
                                                {it.name || '—'}
                                              </td>
                                              <td
                                                style={{ padding: '8px', border: '1px solid #eee', textAlign: 'center' }}
                                              >
                                                <span
                                                  style={{
                                                    display: 'inline-block',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontWeight: 700,
                                                    fontSize: '0.76rem',
                                                    ...statusBadge('NOT TRACKED')
                                                  }}
                                                >
                                                  NOT TRACKED
                                                </span>
                                              </td>
                                              <td style={{ padding: '8px', border: '1px solid #eee', textAlign: 'right' }}>
                                                —
                                              </td>
                                              <td style={{ padding: '8px', border: '1px solid #eee', textAlign: 'right' }}>
                                                {getRestockOrderedPrimaryDisplay(it)}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
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
              setRestockQuantities({});
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
                onClick={() => {
                  if (!restockLoading) {
                    setIsRestockOpen(false);
                    setRestockQuantities({});
                  }
                }}
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
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedRestockOrderId(id);
                  if (!id) {
                    setRestockQuantities({});
                    return;
                  }
                  const selectedOrder = purchaseOrders.find((o) => o.id === id);
                  setRestockQuantities(initRestockQuantitiesForOrder(selectedOrder));
                }}
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
                  const orderNumber = order.orderNumber || formatPurchaseOrderNumber(getOrderNumberValueFromOrder(order, index));
                  return (
                    <option key={order.id} value={order.id}>
                      {orderNumber} - {nameLabel} - {dateLabel} ({itemCount} items)
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedRestockOrderId && (() => {
              const order = purchaseOrders.find((o) => o.id === selectedRestockOrderId);
              if (!order) return null;
              const items = Array.isArray(order.items) ? order.items : [];
              const restockItems = items.filter((it) => {
                if (!it.productId) return false;
                if (isDualRestockItem(it)) {
                  return getDueSecondary(it) > 1e-6;
                }
                return getDuePrimaryLegacy(it) > 0;
              });
              if (restockItems.length === 0) {
                return (
                  <p className="no-data">
                    This purchase order has no remaining quantities to restock.
                  </p>
                );
              }
              const hasDualRestockLine = restockItems.some(isDualRestockItem);
              const hasLegacyRestockLine = restockItems.some((row) => !isDualRestockItem(row));
              let orderedQtyHeader = 'Ordered quantity';
              let qtyToAddHeader = 'Quantity to add';
              if (hasDualRestockLine && !hasLegacyRestockLine) {
                orderedQtyHeader = 'Ordered quantity (secondary unit)';
                qtyToAddHeader = 'Quantity to add (secondary unit)';
              } else if (!hasDualRestockLine && hasLegacyRestockLine) {
                orderedQtyHeader = 'Ordered quantity (primary unit)';
                qtyToAddHeader = 'Quantity to add (primary unit)';
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
                        <th style={{ textTransform: 'none' }}>{orderedQtyHeader}</th>
                        <th style={{ textTransform: 'none' }}>{qtyToAddHeader}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restockItems.map((it, idx) => {
                        const key = it.productId;
                        const dual = isDualRestockItem(it);
                        const due = dual ? getDueSecondary(it) : null;
                        const duePrimary = getDuePrimaryLegacy(it);
                        const value =
                          restockQuantities[key] !== undefined
                            ? restockQuantities[key]
                            : dual
                              ? String(due ?? '')
                              : String(duePrimary || '');
                        return (
                          <tr key={`${key}_${idx}`}>
                            <td>{idx + 1}</td>
                            <td>{it.name}</td>
                            <td>{it.catalogueNumber || '-'}</td>
                            <td>
                              {dual ? (
                                <div>
                                  <div style={{ fontWeight: 600 }}>
                                    {roundQtySecondary(it.orderedQuantitySecondary)} {it.secondaryUnit || ''}
                                  </div>
                                  <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '4px' }}>
                                    Due: {due} {it.secondaryUnit || ''}
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div style={{ fontWeight: 600 }}>
                                    {getLegacyOrderedPrimary(it)} {getRestockPrimaryUnitLabel(it)}
                                  </div>
                                  <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '4px' }}>
                                    Due: {duePrimary} {getRestockPrimaryUnitLabel(it)}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td>
                              {dual ? (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap'
                                  }}
                                >
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={value}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setRestockQuantities((prev) => ({
                                        ...prev,
                                        [key]: val
                                      }));
                                    }}
                                    style={{
                                      width: '90px',
                                      padding: '0.25rem 0.4rem',
                                      borderRadius: '4px',
                                      border: '1px solid #ccc',
                                      textAlign: 'center'
                                    }}
                                  />
                                  <span style={{ fontSize: '0.9rem' }}>{it.secondaryUnit || ''}</span>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                  }}
                                >
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
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
                                      textAlign: 'center'
                                    }}
                                  />
                                  <span style={{ fontSize: '0.85rem', color: '#555' }}>
                                    {getRestockPrimaryUnitLabel(it)}
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {restockItems.some((it) => !isDualRestockItem(it)) && (
                    <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '10px' }}>
                      Rows without secondary units: enter the quantity to add in primary units (inventory is stored in primary units only).
                    </p>
                  )}
                </div>
              );
            })()}

            <div
              style={{
                marginTop: '16px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                alignItems: 'stretch',
                flexWrap: 'wrap'
              }}
            >
              <button
                type="button"
                className="cancel-due-btn"
                onClick={() => {
                  setIsRestockOpen(false);
                  setRestockQuantities({});
                }}
                disabled={restockLoading}
                style={{
                  minHeight: '40px',
                  padding: '0.6rem 14px',
                  boxSizing: 'border-box',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="save-due-btn"
                onClick={handleRestockNow}
                disabled={restockLoading || !selectedRestockOrderId}
                style={{
                  minHeight: '40px',
                  padding: '0.6rem 14px',
                  boxSizing: 'border-box',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap'
                }}
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


