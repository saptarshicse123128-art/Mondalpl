import React, { useState, useEffect } from 'react';
import { collection, getDocs, onSnapshot, serverTimestamp, doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './BillGeneration.css'; // Re-use styling for consistency

const SELLER_STATE_CODE = '19'; // West Bengal
function GstBillGeneration() {
  const [parties, setParties] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedVariation, setSelectedVariation] = useState('');
  const [productQuantity, setProductQuantity] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  
  // Adjustment from previous GST bills
  const [gstInvoices, setGstInvoices] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [selectedSuggestedInvoiceIds, setSelectedSuggestedInvoiceIds] = useState([]);

  // Invoice extra details (removed invoiceNumber and notes)
  const [invoiceForm, setInvoiceForm] = useState({
    date: new Date().toISOString().split('T')[0],
    discount: '',
    paidAmount: ''
  });

  const [selectedParty, setSelectedParty] = useState(null);

  // Load parties, products and gst invoices
  useEffect(() => {
    const unsubParties = onSnapshot(collection(db, 'parties'), (snapshot) => {
      const partyList = [];
      snapshot.forEach((doc) => {
        partyList.push({ id: doc.id, ...doc.data() });
      });
      setParties(partyList);
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productList = [];
      snapshot.forEach((doc) => {
        productList.push({ id: doc.id, ...doc.data() });
      });
      setProducts(productList);
    });

    const unsubGstInvoices = onSnapshot(collection(db, 'gst_invoices'), (snapshot) => {
      const invoicesList = [];
      snapshot.forEach((doc) => {
        invoicesList.push({ id: doc.id, ...doc.data() });
      });
      setGstInvoices(invoicesList);
    });

    return () => {
      unsubParties();
      unsubProducts();
      unsubGstInvoices();
    };
  }, []);

  // Update selected party object
  useEffect(() => {
    if (selectedPartyId) {
      const party = parties.find(p => p.id === selectedPartyId);
      setSelectedParty(party || null);
    } else {
      setSelectedParty(null);
    }
  }, [selectedPartyId, parties]);

  const handleInvoiceFormChange = (e) => {
    setInvoiceForm({
      ...invoiceForm,
      [e.target.name]: e.target.value
    });
  };

  const matchesProductSearch = (text, queryText) => {
    if (!text || !queryText) return false;
    return text.toLowerCase().includes(queryText.toLowerCase());
  };

  const calculateProductSearchRelevance = (product, queryText) => {
    const name = (product.name || '').toLowerCase();
    const queryLower = queryText.toLowerCase();
    if (name.startsWith(queryLower)) return 10;
    if (name.includes(' ' + queryLower)) return 5;
    return 1;
  };

  const addToCart = () => {
    if (!selectedProduct) {
      alert('Please select a product');
      return;
    }

    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    const qty = parseInt(productQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    // Check variations
    const hasVariations = product.variations && Array.isArray(product.variations) && product.variations.length > 0;
    if (hasVariations && !selectedVariation) {
      alert('Please select a variation/size');
      return;
    }

    // Retrieve product details automatically
    let finalPrice = product.price || 0;
    let mrp = product.sellingMrp || product.mrp || 0;
    let discountPercent = parseFloat(product.sellingDiscount) || parseFloat(product.discount) || 0;

    if (hasVariations) {
      const sizeVar = product.variations.find(v => v.size === selectedVariation);
      if (sizeVar) {
        finalPrice = sizeVar.price || 0;
        mrp = sizeVar.sellingMrp || sizeVar.mrp || mrp;
        discountPercent = parseFloat(sizeVar.sellingDiscount) || parseFloat(sizeVar.discount) || discountPercent;
      }
    }

    const gstRateVal = 18;
    const taxablePriceVal = finalPrice / (1 + gstRateVal / 100);
    const gstAmtVal = finalPrice - taxablePriceVal;
    const discountAmtVal = mrp * (discountPercent / 100);

    // Check stock
    let availableStock = product.quantity || 0;
    if (hasVariations) {
      const sizeVar = product.variations.find(v => v.size === selectedVariation);
      availableStock = sizeVar ? sizeVar.quantity || 0 : 0;
    }

    if (qty > availableStock) {
      alert(`Insufficient stock. Only ${availableStock} units available.`);
      return;
    }

    // Generate cart item key
    const cartItemId = hasVariations ? `${product.id}_${selectedVariation}` : product.id;

    // Check if item already exists in cart
    const existingIndex = cart.findIndex(item => item.cartItemId === cartItemId);

    const cartItem = {
      cartItemId,
      id: product.id,
      name: product.name,
      variationSize: hasVariations ? selectedVariation : '',
      quantity: qty,
      mrp: mrp,
      discountPercent: discountPercent,
      discountAmount: discountAmtVal,
      taxablePrice: taxablePriceVal,
      gstRate: gstRateVal,
      gstAmount: gstAmtVal,
      finalPrice: finalPrice,
      rowAmount: finalPrice * qty,
      hsnCode: '7307', // Default plumbing HSN
      price: taxablePriceVal, // exclusive of tax
      subtotal: taxablePriceVal * qty
    };

    if (existingIndex > -1) {
      const updatedCart = [...cart];
      const newQty = updatedCart[existingIndex].quantity + qty;
      
      if (newQty > availableStock) {
        alert(`Cannot add more. Total in cart (${newQty}) exceeds available stock (${availableStock})`);
        return;
      }
      
      updatedCart[existingIndex].quantity = newQty;
      updatedCart[existingIndex].subtotal = updatedCart[existingIndex].price * newQty;
      updatedCart[existingIndex].rowAmount = updatedCart[existingIndex].finalPrice * newQty;
      setCart(updatedCart);
    } else {
      setCart([...cart, cartItem]);
    }

    // Clear item inputs
    setSelectedProduct('');
    setProductSearchQuery('');
    setSelectedVariation('');
    setProductQuantity('');
  };

  const removeFromCart = (cartItemId) => {
    setCart(cart.filter(item => item.cartItemId !== cartItemId));
  };

  // Calculations
  const calculateCartTotals = () => {
    let taxableTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    const isInterstate = selectedParty ? (selectedParty.shippingStateCode || selectedParty.stateCode) !== SELLER_STATE_CODE : false;

    cart.forEach(item => {
      const taxable = item.subtotal;
      const gstPercent = item.gstRate;
      const gstAmount = taxable * (gstPercent / 100);

      taxableTotal += taxable;

      if (isInterstate) {
        igstTotal += gstAmount;
      } else {
        cgstTotal += gstAmount / 2;
        sgstTotal += gstAmount / 2;
      }
    });

    const totalTax = cgstTotal + sgstTotal + igstTotal;
    const subtotalWithTax = taxableTotal + totalTax;
    const discount = parseFloat(invoiceForm.discount) || 0;
    const totalAdjustments = adjustments.reduce((sum, adj) => sum + adj.amount, 0);
    const grandTotal = Math.max(0, subtotalWithTax - discount + totalAdjustments);
    
    // Round off
    const roundedGrandTotal = Math.round(grandTotal);
    const roundOff = roundedGrandTotal - grandTotal;

    return {
      taxableTotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      totalTax,
      subtotalWithTax,
      discount,
      totalAdjustments,
      grandTotal: roundedGrandTotal,
      roundOff
    };
  };

  const getSuggestedInvoices = () => {
    if (!selectedPartyId) return [];
    return gstInvoices.filter(inv => {
      if (adjustments.some(adj => adj.billId === inv.id)) return false;
      return inv.partyId === selectedPartyId && (inv.due || 0) > 0;
    });
  };

  const removeAdjustment = (billId) => {
    setAdjustments(adjustments.filter(a => a.billId !== billId));
  };

  const totals = calculateCartTotals();

  // Save and print GST invoice
  const generateInvoice = async () => {
    if (!selectedPartyId) {
      alert('Please select a party');
      return;
    }

    const party = parties.find(p => p.id === selectedPartyId);
    if (!party) {
      alert('Selected party details not found');
      return;
    }

    if (cart.length === 0) {
      alert('Please add at least one product to the cart');
      return;
    }

    try {
      const invoiceBatch = writeBatch(db);
      
      // 1. Generate Invoice Number dynamically based on Financial Year (April 1 to March 31)
      const invoiceDate = invoiceForm.date; // YYYY-MM-DD
      const getFinancialYearString = (dateVal) => {
        if (!dateVal) return '';
        let dateObj;
        if (dateVal.toDate) {
          dateObj = dateVal.toDate();
        } else if (dateVal instanceof Date) {
          dateObj = dateVal;
        } else {
          dateObj = new Date(dateVal);
        }
        
        if (isNaN(dateObj.getTime())) return '';
        
        const y = dateObj.getFullYear();
        const m = dateObj.getMonth(); // 0 = Jan, 11 = Dec
        const startY = m >= 3 ? y : y - 1;
        const endY = startY + 1;
        return `${String(startY).slice(-2)}-${String(endY).slice(-2)}`;
      };
      const fyStr = getFinancialYearString(invoiceDate);
      
      const snapshot = await getDocs(collection(db, 'gst_invoices'));
      const invoicesInSameFY = snapshot.docs.filter(doc => {
        const docData = doc.data();
        if (!docData.date) return false;
        return getFinancialYearString(docData.date) === fyStr;
      });
      const nextSeq = invoicesInSameFY.length + 1;
      const seqStr = String(nextSeq).padStart(4, '0');
      const invoiceNo = `NMPS/${fyStr}/${seqStr}`;

      // 2. Reduce Stocks in Database
      for (const item of cart) {
        const productRef = doc(db, 'products', item.id);
        const productSnap = await getDoc(productRef);
        
        if (productSnap.exists()) {
          const productData = productSnap.data();
          const hasVariations = productData.variations && Array.isArray(productData.variations) && productData.variations.length > 0;
          
          if (hasVariations && item.variationSize) {
            const updatedVariations = productData.variations.map(v => {
              if (v.size === item.variationSize) {
                return { ...v, quantity: Math.max(0, (v.quantity || 0) - item.quantity) };
              }
              return v;
            });
            const newTotalQty = updatedVariations.reduce((sum, v) => sum + (v.quantity || 0), 0);
            
            invoiceBatch.update(productRef, {
              variations: updatedVariations,
              quantity: newTotalQty
            });
          } else {
            const newQty = Math.max(0, (productData.quantity || 0) - item.quantity);
            invoiceBatch.update(productRef, { quantity: newQty });
          }
        }
      }

      // 3. Save GST Invoice to DB
      const invoiceData = {
        invoiceNumber: invoiceNo,
        date: invoiceForm.date,
        partyId: selectedPartyId,
        partyName: party.name,
        partyGstin: party.gstin || '',
        partyPhone: party.phone || '',
        partyEmail: party.email || '',
        partyAddress: party.address || '',
        partyShippingName: party.shippingName || party.name || '',
        partyShippingGstin: party.shippingGstin || party.gstin || '',
        partyShippingPhone: party.shippingPhone || party.phone || '',
        partyShippingEmail: party.shippingEmail || party.email || '',
        partyShippingAddress: party.shippingAddress || party.address || '',
        partyShippingStateCode: party.shippingStateCode || party.stateCode || '',
        partyShippingStateName: party.shippingStateName || party.stateName || '',
        partyStateCode: party.stateCode || '',
        partyStateName: party.stateName || '',
        items: cart,
        taxableTotal: totals.taxableTotal,
        cgstTotal: totals.cgstTotal,
        sgstTotal: totals.sgstTotal,
        igstTotal: totals.igstTotal,
        totalTax: totals.totalTax,
        discount: totals.discount,
        totalAdjustments: totals.totalAdjustments || 0,
        adjustments: adjustments.map(a => ({ billId: a.billId, billNumber: a.billNumber, type: a.type, amount: a.amount })),
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        paidAmount: parseFloat(invoiceForm.paidAmount) || 0,
        due: Math.max(0, totals.grandTotal - (parseFloat(invoiceForm.paidAmount) || 0)),
        notes: '',
        createdAt: serverTimestamp()
      };

      const newDocRef = doc(collection(db, 'gst_invoices'));
      invoiceBatch.set(newDocRef, invoiceData);

      // 4. Update previous GST invoices that were adjusted (set due to 0)
      for (const adj of adjustments) {
        const prevInvRef = doc(db, 'gst_invoices', adj.billId);
        invoiceBatch.update(prevInvRef, {
          due: 0,
          adjustedInInvoice: invoiceNo,
          updatedAt: serverTimestamp()
        });
      }

      await invoiceBatch.commit();
      alert(`GST Invoice ${invoiceNo} generated successfully!`);

      // 5. Trigger print
      printInvoicePDF({ id: newDocRef.id, ...invoiceData });

      // 6. Reset states
      setCart([]);
      setSelectedPartyId('');
      setAdjustments([]);
      setSelectedSuggestedInvoiceIds([]);
      setInvoiceForm({
        date: new Date().toISOString().split('T')[0],
        discount: '',
        paidAmount: ''
      });

    } catch (error) {
      console.error('Error generating GST Invoice:', error);
      alert('Failed to generate GST invoice');
    }
  };

  // jsPDF Print function
  const printInvoicePDF = (invoice) => {
    const pdfDoc = new jsPDF();
    pdfDoc.setFont('helvetica');
    const isInterstate = (invoice.partyShippingStateCode || invoice.partyStateCode) !== SELLER_STATE_CODE;

    const convertNumberToWords = (num) => {
      const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
      const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

      if ((num = num.toString()).length > 9) return 'overflow';
      const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
      if (!n) return '';
      let str = '';
      str += n[1] !== '00' ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
      str += n[2] !== '00' ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
      str += n[3] !== '00' ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
      str += n[4] !== '0' ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
      str += n[5] !== '00' ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
      return str.trim() ? 'Rupees ' + str.trim() + ' Only' : 'Rupees Zero Only';
    };

    // Headers & Branding
    pdfDoc.setFontSize(16);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text('NEW MONDAL PLUMBING AND SANITATION', 20, 20);
    
    pdfDoc.setFontSize(8.5);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.setTextColor(80, 80, 80);
    pdfDoc.text('1029/1, 89 Road, Chintamani Para, Diamond Harbour, West Bengal - 743331', 20, 25);
    pdfDoc.text('Mobile: 9434504491 | Email: mondalplumbingandsanitation@gmail.com', 20, 29);
    pdfDoc.text('GSTIN: 19ERZPM6976H1ZH | PAN: ERZPM6976H', 20, 33);

    // Draw main buyer details box container
    pdfDoc.setDrawColor(180, 180, 180);
    pdfDoc.setLineWidth(0.3);
    pdfDoc.rect(20, 39, 170, 32); // Outer box border
    pdfDoc.line(20, 45, 190, 45); // Horizontal divider under column titles

    // Check if separate shipping details are present
    const hasDiffShipping = invoice.partyShippingAddress && invoice.partyShippingAddress !== invoice.partyAddress;

    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setFontSize(9.5);
    pdfDoc.setTextColor(0, 0, 0);

    if (hasDiffShipping) {
      // 3-Column Layout: Billing, Shipping, Invoice
      pdfDoc.text('Billing Details', 22, 43);
      pdfDoc.text('Shipping Details', 77, 43);
      pdfDoc.text('Invoice Details', 134, 43);

      pdfDoc.line(75, 39, 75, 71);  // Vertical line 1
      pdfDoc.line(132, 39, 132, 71); // Vertical line 2

      // Column 1: Billing
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8);
      pdfDoc.text(invoice.partyName || 'N/A', 22, 49);
      const splitBillAddr = pdfDoc.splitTextToSize(invoice.partyAddress || 'N/A', 50);
      pdfDoc.text(splitBillAddr, 22, 53);
      pdfDoc.text('Phone: ' + (invoice.partyPhone || 'N/A'), 22, 63);
      pdfDoc.text('GSTIN: ' + (invoice.partyGstin || 'URD (Unregistered)'), 22, 67);

      // Column 2: Shipping
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8);
      pdfDoc.text(invoice.partyShippingName || invoice.partyName || 'N/A', 77, 49);
      const splitShipAddr = pdfDoc.splitTextToSize(invoice.partyShippingAddress || 'N/A', 50);
      pdfDoc.text(splitShipAddr, 77, 53);
      pdfDoc.text('Phone: ' + (invoice.partyShippingPhone || 'N/A'), 77, 63);
      pdfDoc.text('GSTIN: ' + (invoice.partyShippingGstin || 'URD (Unregistered)'), 77, 67);

      // Column 3: Invoice
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8);
      pdfDoc.text('Invoice No. - ' + invoice.invoiceNumber, 134, 49);
      pdfDoc.text('Invoice Date - ' + invoice.date, 134, 54);
      const dueDateVal = (() => {
        const d = new Date(invoice.date);
        if (isNaN(d.getTime())) return invoice.date;
        d.setDate(d.getDate() + 15);
        return d.toISOString().split('T')[0];
      })();
      pdfDoc.text('Due Date - ' + dueDateVal, 134, 59);
      const posVal = (invoice.partyShippingStateCode || invoice.partyStateCode || '19') + ' - ' + (invoice.partyShippingStateName || invoice.partyStateName || 'West Bengal');
      pdfDoc.text('Place of Supply - ' + posVal, 134, 64);

    } else {
      // 2-Column Layout: Billing/Shipping combined, Invoice
      pdfDoc.text('Billing Details', 22, 43);
      pdfDoc.text('Invoice Details', 127, 43);

      pdfDoc.line(125, 39, 125, 71); // Vertical divider

      // Column 1: Billing & Shipping
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8);
      pdfDoc.text(invoice.partyName || 'N/A', 22, 49);
      const splitBillAddr = pdfDoc.splitTextToSize(invoice.partyAddress || 'N/A', 100);
      pdfDoc.text(splitBillAddr, 22, 53);
      pdfDoc.text('Phone: ' + (invoice.partyPhone || 'N/A'), 22, 63);
      pdfDoc.text('GSTIN: ' + (invoice.partyGstin || 'URD (Unregistered)'), 22, 67);

      // Column 2: Invoice
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8);
      pdfDoc.text('Invoice No. - ' + invoice.invoiceNumber, 127, 49);
      pdfDoc.text('Invoice Date - ' + invoice.date, 127, 54);
      const dueDateVal = (() => {
        const d = new Date(invoice.date);
        if (isNaN(d.getTime())) return invoice.date;
        d.setDate(d.getDate() + 15);
        return d.toISOString().split('T')[0];
      })();
      pdfDoc.text('Due Date - ' + dueDateVal, 127, 59);
      const posVal = (invoice.partyStateCode || '19') + ' - ' + (invoice.partyStateName || 'West Bengal');
      pdfDoc.text('Place of Supply - ' + posVal, 127, 64);
    }

    // Table mapping
    const tableData = invoice.items.map((item, index) => {
      const qty = item.quantity || 1;
      const hsn = item.hsnCode || '7307';
      const mrpVal = item.mrp !== undefined ? item.mrp : (item.finalPrice || item.price || 0);
      const discPercent = item.discountPercent !== undefined ? item.discountPercent : 0;
      const discAmt = item.discountAmount !== undefined ? item.discountAmount : 0;
      const taxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      const gstRate = item.gstRate !== undefined ? item.gstRate : 18;
      const gstAmt = item.gstAmount !== undefined ? item.gstAmount : (taxPrice * (gstRate / 100));
      const finalPrice = item.finalPrice !== undefined ? item.finalPrice : (taxPrice * (1 + gstRate / 100));
      const rowAmt = item.rowAmount !== undefined ? item.rowAmount : (finalPrice * qty);

      return [
        String(index + 1),
        item.name + (item.variationSize ? ` (${item.variationSize})` : ''),
        hsn,
        String(qty),
        mrpVal.toFixed(2),
        taxPrice.toFixed(2),
        `${gstRate}%`,
        gstAmt.toFixed(2),
        finalPrice.toFixed(2),
        `${discPercent}%`,
        discAmt.toFixed(2),
        rowAmt.toFixed(2)
      ];
    });

    const tableHeaders = [
      [
        { content: 'SL No', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'Item Name', rowSpan: 2, styles: { valign: 'middle' } },
        { content: 'HSN', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'Qty (unit)', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'MRP', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'Taxable Price/Unit', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'GST', colSpan: 2, styles: { halign: 'center' } },
        { content: 'Final Price/Unit', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
        { content: 'Discount', colSpan: 2, styles: { halign: 'center' } },
        { content: 'Amount', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }
      ],
      [
        { content: '%', styles: { halign: 'center' } },
        { content: 'AMT', styles: { halign: 'center' } },
        { content: '%', styles: { halign: 'center' } },
        { content: 'AMT', styles: { halign: 'center' } }
      ]
    ];

    const totalQty = invoice.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalTaxable = invoice.items.reduce((sum, item) => {
      const taxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      return sum + taxPrice;
    }, 0);
    const totalGstAmt = invoice.items.reduce((sum, item) => {
      const taxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      const gstRate = item.gstRate !== undefined ? item.gstRate : 18;
      const gstAmt = item.gstAmount !== undefined ? item.gstAmount : (taxPrice * (gstRate / 100));
      return sum + gstAmt;
    }, 0);
    const totalFinalPrice = invoice.items.reduce((sum, item) => {
      const taxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      const gstRate = item.gstRate !== undefined ? item.gstRate : 18;
      const finalPrice = item.finalPrice !== undefined ? item.finalPrice : (taxPrice * (1 + gstRate / 100));
      return sum + finalPrice;
    }, 0);
    const totalDiscountAmt = invoice.items.reduce((sum, item) => {
      const discAmt = item.discountAmount !== undefined ? item.discountAmount : 0;
      return sum + discAmt;
    }, 0);
    const totalAmount = invoice.items.reduce((sum, item) => {
      const qty = item.quantity || 1;
      const taxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      const gstRate = item.gstRate !== undefined ? item.gstRate : 18;
      const finalPrice = item.finalPrice !== undefined ? item.finalPrice : (taxPrice * (1 + gstRate / 100));
      const rowAmt = item.rowAmount !== undefined ? item.rowAmount : (finalPrice * qty);
      return sum + rowAmt;
    }, 0);

    const tableFooter = [[
      { content: 'Total', styles: { halign: 'center' } },
      { content: '' },
      { content: '' },
      { content: String(totalQty), styles: { halign: 'center' } },
      { content: '' },
      { content: totalTaxable.toFixed(2), styles: { halign: 'center' } },
      { content: totalGstAmt.toFixed(2), colSpan: 2, styles: { halign: 'center' } },
      { content: totalFinalPrice.toFixed(2), styles: { halign: 'center' } },
      { content: totalDiscountAmt.toFixed(2), colSpan: 2, styles: { halign: 'center' } },
      { content: totalAmount.toFixed(2), styles: { halign: 'center' } }
    ]];

    pdfDoc.autoTable({
      startY: 75,
      head: tableHeaders,
      body: tableData,
      foot: tableFooter,
      theme: 'grid',
      headStyles: {
        fillColor: [44, 62, 80],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold'
      },
      footStyles: {
        fillColor: [245, 245, 245],
        textColor: [0, 0, 0],
        fontSize: 7,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 7,
        font: 'helvetica'
      },
      margin: { left: 20, right: 20 }
    });

    let finalY = pdfDoc.lastAutoTable.finalY + 10;

    // Ensure we don't overflow the page with the summary tables
    if (finalY + 38 > 280) {
      pdfDoc.addPage();
      finalY = 20;
    }

    // ── Generate Left Table (Tax Summary) data ──
    const taxGroups = {};
    invoice.items.forEach(item => {
      const rate = item.gstRate !== undefined ? item.gstRate : 18;
      const unitTaxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      const unitGst = item.gstAmount !== undefined ? item.gstAmount : (unitTaxPrice * (rate / 100));

      if (!taxGroups[rate]) {
        taxGroups[rate] = { rate, taxable: 0, tax: 0 };
      }
      taxGroups[rate].taxable += unitTaxPrice;
      taxGroups[rate].tax += unitGst;
    });

    const distinctRates = Object.keys(taxGroups).map(Number).sort((a, b) => b - a);
    const hasMultipleRates = distinctRates.length > 1;

    let leftHeaders;
    if (isInterstate) {
      if (hasMultipleRates) {
        leftHeaders = [
          [{ content: 'Tax Summary :', colSpan: 3, styles: { halign: 'left', fillColor: [240, 243, 245], textColor: [44, 62, 80], fontStyle: 'bold', fontSize: 8 } }],
          ['Taxable Amt.', 'IGST', 'Total Tax']
        ];
      } else {
        const r = distinctRates[0] || 18;
        leftHeaders = [
          [{ content: 'Tax Summary :', colSpan: 3, styles: { halign: 'left', fillColor: [240, 243, 245], textColor: [44, 62, 80], fontStyle: 'bold', fontSize: 8 } }],
          ['Taxable Amt.', `IGST (${r}%)`, `Total Tax (${r}%)`]
        ];
      }
    } else {
      if (hasMultipleRates) {
        leftHeaders = [
          [{ content: 'Tax Summary :', colSpan: 4, styles: { halign: 'left', fillColor: [240, 243, 245], textColor: [44, 62, 80], fontStyle: 'bold', fontSize: 8 } }],
          ['Taxable Amt.', 'CGST', 'SGST', 'Total Tax']
        ];
      } else {
        const r = distinctRates[0] || 18;
        leftHeaders = [
          [{ content: 'Tax Summary :', colSpan: 4, styles: { halign: 'left', fillColor: [240, 243, 245], textColor: [44, 62, 80], fontStyle: 'bold', fontSize: 8 } }],
          ['Taxable Amt.', `CGST (${r/2}%)`, `SGST (${r/2}%)`, `Total Tax (${r}%)`]
        ];
      }
    }

    const leftRows = distinctRates.map(rate => {
      const g = taxGroups[rate];
      if (isInterstate) {
        return [
          g.taxable.toFixed(2),
          hasMultipleRates ? `${g.tax.toFixed(2)} (${rate}%)` : g.tax.toFixed(2),
          g.tax.toFixed(2)
        ];
      } else {
        return [
          g.taxable.toFixed(2),
          hasMultipleRates ? `${(g.tax / 2).toFixed(2)} (${rate/2}%)` : (g.tax / 2).toFixed(2),
          hasMultipleRates ? `${(g.tax / 2).toFixed(2)} (${rate/2}%)` : (g.tax / 2).toFixed(2),
          g.tax.toFixed(2)
        ];
      }
    });

    // ── Generate Right Table (Totals Summary) data ──
    let taxSummaryTaxable = 0;
    let taxSummaryTax = 0;
    Object.values(taxGroups).forEach(g => {
      taxSummaryTaxable += g.taxable;
      taxSummaryTax += g.tax;
    });

    const rightRows = [];
    rightRows.push(['Taxable Amt. -', taxSummaryTaxable.toFixed(2)]);
    rightRows.push(['Total Tax -', taxSummaryTax.toFixed(2)]);
    rightRows.push(['Total Amt. -', (taxSummaryTaxable + taxSummaryTax).toFixed(2)]);

    if (invoice.discount && parseFloat(invoice.discount) > 0) {
      rightRows.push(['Extra Disc. -', parseFloat(invoice.discount).toFixed(2)]);
    }

    const prevAdj = 0; // default to 0 since it is not saved/inputted
    if (prevAdj > 0) {
      rightRows.push(['Prev. bill Adj. -', prevAdj.toFixed(2)]);
    }

    rightRows.push([
      { content: 'Grand Total -', styles: { fontStyle: 'bold', fillColor: [240, 243, 245] } },
      { content: invoice.grandTotal.toFixed(2), styles: { fontStyle: 'bold', fillColor: [240, 243, 245] } }
    ]);

    rightRows.push(['Paid Amount -', (invoice.paidAmount || 0).toFixed(2)]);

    const dueVal = invoice.due !== undefined ? invoice.due : Math.max(0, invoice.grandTotal - (invoice.paidAmount || 0));
    rightRows.push([
      { content: 'Due Balance -', styles: { fontStyle: dueVal > 0 ? 'bold' : 'normal', textColor: dueVal > 0 ? [231, 76, 60] : [0, 0, 0] } },
      { content: dueVal.toFixed(2), styles: { fontStyle: dueVal > 0 ? 'bold' : 'normal', textColor: dueVal > 0 ? [231, 76, 60] : [0, 0, 0] } }
    ]);

    // ── Render Left Table ──
    pdfDoc.autoTable({
      startY: finalY,
      margin: { left: 20 },
      tableWidth: 110,
      head: leftHeaders,
      body: leftRows,
      theme: 'grid',
      headStyles: {
        fillColor: [240, 243, 245],
        textColor: [44, 62, 80],
        fontSize: 7.5,
        fontStyle: 'bold',
        lineColor: [180, 180, 180],
        lineWidth: 0.15
      },
      styles: {
        fontSize: 7.5,
        font: 'helvetica',
        lineColor: [180, 180, 180],
        lineWidth: 0.15,
        halign: 'center',
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center' }
      }
    });
    const leftFinalY = pdfDoc.lastAutoTable.finalY;

    // ── Render Right Table ──
    pdfDoc.autoTable({
      startY: finalY,
      margin: { left: 135 },
      tableWidth: 55,
      body: rightRows,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        font: 'helvetica',
        lineColor: [180, 180, 180],
        lineWidth: 0.15,
        halign: 'left',
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { halign: 'right', cellWidth: 23 }
      }
    });
    const rightFinalY = pdfDoc.lastAutoTable.finalY;

    // ── Render Left Table 2 (Invoice Amt in words) ──
    const wordsRows = [
      [{ content: 'Invoice Amt in words:', styles: { fontStyle: 'bold', fontSize: 7.5 } }],
      [{ content: convertNumberToWords(invoice.grandTotal), styles: { fontStyle: 'italic', fontSize: 7.5 } }]
    ];

    pdfDoc.autoTable({
      startY: leftFinalY + 4,
      margin: { left: 20 },
      tableWidth: 110,
      body: wordsRows,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        font: 'helvetica',
        lineColor: [180, 180, 180],
        lineWidth: 0.15,
        halign: 'left',
        valign: 'middle'
      }
    });
    const wordsFinalY = pdfDoc.lastAutoTable.finalY;

    finalY = Math.max(rightFinalY, wordsFinalY);

    // Notes
    if (invoice.notes) {
      finalY += 6;
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8.5);
      pdfDoc.text('Notes: ' + invoice.notes, 20, finalY);
    }

    // ── Bottom Section: Bank Details (70%) + Authorized Signatory (30%) ──
    const loadImageAsDataURL = (url) =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.onload = () => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(xhr.response);
        };
        xhr.onerror = () => resolve(null);
        xhr.send();
      });

    const drawBottomSection = (qrDataUrl, sigDataUrl) => {
      finalY += 12;

      // Check if we need a new page
      if (finalY + 40 > 280) {
        pdfDoc.addPage();
        finalY = 20;
      }

      const boxLeft = 20;
      const boxTop = finalY;
      const boxWidth = 170;
      const boxHeight = 42;

      const bankWidth = boxWidth * 0.7;   // 119
      const signWidth = boxWidth * 0.3;   // 51
      const dividerX = boxLeft + bankWidth;

      pdfDoc.setDrawColor(160, 160, 160);
      pdfDoc.setLineWidth(0.3);

      // Outer box
      pdfDoc.rect(boxLeft, boxTop, boxWidth, boxHeight);

      // Header divider line — pushed down to fit 2-line right header
      pdfDoc.line(boxLeft, boxTop + 10, boxLeft + boxWidth, boxTop + 10);

      // Vertical divider between bank & sign sections
      pdfDoc.line(dividerX, boxTop, dividerX, boxTop + boxHeight);

      // ── Column headers ──
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setFontSize(8);
      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.text('Bank Details:', boxLeft + 2, boxTop + 5);
      // Split right header into 2 lines so it stays inside the 30% box
      pdfDoc.setFontSize(7.5);
      pdfDoc.text('For NEW MONDAL PLUMBING', dividerX + 2, boxTop + 4.5);
      pdfDoc.text('AND SANITATION:', dividerX + 2, boxTop + 8.5);

      // ── Bank Details text (left 70%) ──
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(7.5);
      const bankLines = [
        'Account No.: 08880021002025',
        'IFSC Code: UCBA0000880',
        'Account Holder: NEW MONDAL PLUMBING AND SANITATION',
        'Bank Name: UCO Bank',
        'Bank Address: Diamond Harbour – 743331'
      ];
      bankLines.forEach((line, i) => {
        pdfDoc.text(line, boxLeft + 2, boxTop + 15 + i * 4.8);
      });

      // ── QR Code (inside bank section, right side) ──
      if (qrDataUrl) {
        const qrSize = 28;
        const qrX = dividerX - qrSize - 2;
        const qrY = boxTop + 11;
        pdfDoc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      }

      // ── Authorized Signatory (right 30%) ──
      if (sigDataUrl) {
        const sigW = 35;
        const sigH = 16;
        const sigX = dividerX + (signWidth - sigW) / 2;
        const sigY = boxTop + 13;
        pdfDoc.addImage(sigDataUrl, 'PNG', sigX, sigY, sigW, sigH);
      }

      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(7.5);
      pdfDoc.setTextColor(60, 60, 60);
      pdfDoc.text('Authorized Signatory', dividerX + signWidth / 2, boxTop + boxHeight - 3, { align: 'center' });

      // Open print window
      const pdfBlob = pdfDoc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open('', '_blank', 'width=900,height=650');
      if (printWindow) {
        printWindow.document.write(
          `<html><head><title>Print Invoice</title></head><body style="margin:0;"><embed width="100%" height="100%" src="${pdfUrl}" type="application/pdf"></body></html>`
        );
      }
    };

    // Load both images then draw
    Promise.all([
      loadImageAsDataURL('/signature.png'),
      loadImageAsDataURL('/qr_code.png')
    ]).then(([sigDataUrl, qrDataUrl]) => {
      drawBottomSection(qrDataUrl, sigDataUrl);
    });
  };

  return (
    <div className="bill-generation"> {/* Re-use class names for Dashboard.css mapping */}
      <h2>GST Bill Generation</h2>
      
      <div className="bill-container">
        
        {/* Left billing console */}
        <div className="card" style={{ padding: '20px', background: '#fff', borderRadius: '8px' }}>
          
          {/* Party Selection & HSN defaults */}
          <div className="gst-party-row">
            <div className="form-group">
              <label>Select Party / Customer *</label>
              <select value={selectedPartyId} onChange={(e) => setSelectedPartyId(e.target.value)} required>
                <option value="">-- Select Party --</option>
                {parties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.gstin ? `(${p.gstin})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Billing Date *</label>
              <input
                type="date"
                name="date"
                value={invoiceForm.date}
                onChange={handleInvoiceFormChange}
              />
            </div>
          </div>

          <hr style={{ border: '0', borderTop: '1px solid #eee', margin: '15px 0' }} />

          {/* Add Product Area */}
          <h4>Add Item to Bill</h4>
          
          <div style={{ marginBottom: '15px' }}>
            <div className="form-group product-search-group" style={{ position: 'relative', marginBottom: 0 }}>
              <label>Select Product *</label>
              <div className="product-search-container">
                <input
                  type="text"
                  value={productSearchQuery}
                  onChange={(e) => {
                    setProductSearchQuery(e.target.value);
                    setShowProductDropdown(true);
                    if (!e.target.value) {
                      setSelectedProduct('');
                    }
                  }}
                  onFocus={() => setShowProductDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowProductDropdown(false), 200);
                  }}
                  placeholder="Type product name to search..."
                  className="product-search-input"
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                />
                
                {showProductDropdown && (
                  <div className="product-dropdown" style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    width: '100%',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    background: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: '0 0 4px 4px',
                    zIndex: 1000,
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}>
                    {(() => {
                      const trimmedQuery = (productSearchQuery || '').trim();
                      const matching = products.filter(p =>
                        p.quantity > 0 &&
                        (
                          !trimmedQuery ||
                          matchesProductSearch(p.name, trimmedQuery) ||
                          (p.category && matchesProductSearch(p.category, trimmedQuery)) ||
                          (p.subcategory && matchesProductSearch(p.subcategory, trimmedQuery))
                        )
                      );
                      
                      if (matching.length === 0) {
                        return (
                          <div className="product-dropdown-item no-results" style={{ padding: '10px', color: '#888' }}>
                            No products found
                          </div>
                        );
                      }
                      
                      const sorted = trimmedQuery
                        ? matching.sort((a, b) =>
                            calculateProductSearchRelevance(b, trimmedQuery) -
                            calculateProductSearchRelevance(a, trimmedQuery)
                          )
                        : matching;
                      
                      return sorted.slice(0, 30).map((product) => (
                        <div
                          key={product.id}
                          className="product-dropdown-item"
                          style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSelectedProduct(product.id);
                            setSelectedVariation('');
                            setProductSearchQuery(product.name);
                            setShowProductDropdown(false);
                          }}
                        >
                          <span className="product-name" style={{ fontWeight: '500' }}>{product.name}</span>
                          {(!product.variations || !Array.isArray(product.variations) || product.variations.length === 0) && (
                            <span className="product-price" style={{ color: '#27ae60', fontWeight: 'bold' }}>₹{product.price?.toFixed(2)}</span>
                          )}
                          {product.variations && Array.isArray(product.variations) && product.variations.length > 0 && (
                            <span className="product-stock" style={{ color: '#667eea', fontSize: '0.85em', fontWeight: 'bold' }}>Has sizes</span>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="gst-add-item-row">
            
            {selectedProduct && (() => {
              const selectedProductData = products.find(p => p.id === selectedProduct);
              const hasVariations = selectedProductData?.variations && Array.isArray(selectedProductData.variations) && selectedProductData.variations.length > 0;
              
              if (hasVariations) {
                return (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Select Size *</label>
                    <select
                      value={selectedVariation}
                      onChange={(e) => {
                        setSelectedVariation(e.target.value);
                      }}
                      style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', width: '100%', boxSizing: 'border-box' }}
                      required
                    >
                      <option value="">Choose size...</option>
                      {selectedProductData.variations
                        .filter(v => (v.quantity || 0) > 0)
                        .map((variation, index) => (
                          <option key={index} value={variation.size}>
                            {variation.size}
                          </option>
                        ))}
                    </select>
                  </div>
                );
              }
              return (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Select Size</label>
                  <select disabled style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', width: '100%', backgroundColor: '#f5f5f5', cursor: 'not-allowed', boxSizing: 'border-box' }}>
                    <option value="">No sizes</option>
                  </select>
                </div>
              );
            })()}

            {!selectedProduct && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Select Size</label>
                <select disabled style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', width: '100%', backgroundColor: '#f5f5f5', cursor: 'not-allowed', boxSizing: 'border-box' }}>
                  <option value="">Select product first</option>
                </select>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Quantity *</label>
              <input
                type="number"
                min="1"
                value={productQuantity}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || value === '0') {
                    setProductQuantity('');
                  } else {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue >= 1) {
                      setProductQuantity(numValue);
                    }
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === '' || parseInt(e.target.value) < 1) {
                    setProductQuantity('');
                  }
                }}
                placeholder="Enter quantity"
                style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ height: '40px' }}>
              <button
                type="button"
                className="add-product-btn"
                onClick={addToCart}
                disabled={(() => {
                  if (!selectedProduct) return true;
                  const selectedProductData = products.find(p => p.id === selectedProduct);
                  const hasVariations = selectedProductData?.variations && Array.isArray(selectedProductData.variations) && selectedProductData.variations.length > 0;
                  if (hasVariations && !selectedVariation) return true;
                  return false;
                })()}
                style={{ padding: '10px 15px', width: '100%', height: '100%', fontWeight: 'bold', boxSizing: 'border-box' }}
              >
                Add Item
              </button>
            </div>

          </div>

          {/* Cart Table */}
          {cart.length > 0 && (
            <div className="table-container" style={{ marginTop: '20px', overflowX: 'auto' }}>
              <table className="stock-table">
                <thead>
                  <tr>
                    <th rowSpan="2" style={{ verticalAlign: 'middle', textAlign: 'center' }}>SL No</th>
                    <th rowSpan="2" style={{ verticalAlign: 'middle' }}>Item Name</th>
                    <th rowSpan="2" style={{ verticalAlign: 'middle', textAlign: 'center' }}>HSN</th>
                    <th rowSpan="2" style={{ verticalAlign: 'middle', textAlign: 'center' }}>Qty (unit)</th>
                    <th rowSpan="2" style={{ verticalAlign: 'middle', textAlign: 'center' }}>MRP</th>
                    <th rowSpan="2" style={{ verticalAlign: 'middle', textAlign: 'center' }}>Taxable Price/Unit</th>
                    <th colSpan="2" style={{ textAlign: 'center', borderBottom: '1px solid #ddd' }}>GST</th>
                    <th rowSpan="2" style={{ verticalAlign: 'middle', textAlign: 'center' }}>Final Price/Unit</th>
                    <th colSpan="2" style={{ textAlign: 'center', borderBottom: '1px solid #ddd' }}>Discount</th>
                    <th rowSpan="2" style={{ verticalAlign: 'middle', textAlign: 'center' }}>Amount</th>
                    <th rowSpan="2" style={{ verticalAlign: 'middle', textAlign: 'center' }}>Action</th>
                  </tr>
                  <tr>
                    <th style={{ textAlign: 'center' }}>%</th>
                    <th style={{ textAlign: 'center' }}>AMT</th>
                    <th style={{ textAlign: 'center' }}>%</th>
                    <th style={{ textAlign: 'center' }}>AMT</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, index) => (
                    <tr key={item.cartItemId}>
                      <td style={{ textAlign: 'center' }}>{index + 1}</td>
                      <td>
                        <strong>{item.name}</strong>
                        {item.variationSize && <span style={{ fontSize: '0.85em', color: '#666', display: 'block' }}>Size: {item.variationSize}</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>{item.hsnCode}</td>
                      <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'center' }}>₹{(item.mrp || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'center' }}>₹{(item.taxablePrice || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'center' }}>{item.gstRate}%</td>
                      <td style={{ textAlign: 'center' }}>₹{(item.gstAmount || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'center' }}>₹{(item.finalPrice || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'center' }}>{item.discountPercent || 0}%</td>
                      <td style={{ textAlign: 'center' }}>₹{(item.discountAmount || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'center' }}>₹{(item.rowAmount || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button onClick={() => removeFromCart(item.cartItemId)} className="remove-btn" style={{ padding: '2px 6px' }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {cart.length > 0 && (
                    <tr style={{ fontWeight: 'bold', background: '#f9f9f9', borderTop: '2px solid #dee2e6' }}>
                      <td style={{ textAlign: 'center', border: '1px solid #dee2e6' }}>Total</td>
                      <td style={{ border: '1px solid #dee2e6' }}></td>
                      <td style={{ border: '1px solid #dee2e6' }}></td>
                      <td style={{ textAlign: 'center', border: '1px solid #dee2e6' }}>
                        {cart.reduce((sum, item) => sum + (item.quantity || 0), 0)}
                      </td>
                      <td style={{ border: '1px solid #dee2e6' }}></td>
                      <td style={{ textAlign: 'center', border: '1px solid #dee2e6' }}>
                        ₹{cart.reduce((sum, item) => sum + (item.taxablePrice || 0), 0).toFixed(2)}
                      </td>
                      <td colSpan="2" style={{ textAlign: 'center', border: '1px solid #dee2e6' }}>
                        ₹{cart.reduce((sum, item) => sum + (item.gstAmount || 0), 0).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center', border: '1px solid #dee2e6' }}>
                        ₹{cart.reduce((sum, item) => sum + (item.finalPrice || 0), 0).toFixed(2)}
                      </td>
                      <td colSpan="2" style={{ textAlign: 'center', border: '1px solid #dee2e6' }}>
                        ₹{cart.reduce((sum, item) => sum + (item.discountAmount || 0), 0).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center', border: '1px solid #dee2e6' }}>
                        ₹{cart.reduce((sum, item) => sum + (item.rowAmount || 0), 0).toFixed(2)}
                      </td>
                      <td style={{ border: '1px solid #dee2e6' }}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

        </div>

        {/* Right billing summary box */}
        <div className="card" style={{ padding: '20px', background: '#fff', borderRadius: '8px', height: 'fit-content' }}>
          <h3>Bill Calculation</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '15px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span>
              <span>₹{totals.subtotalWithTax.toFixed(2)}</span>
            </div>

            <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <label style={{ margin: 0 }}>Discount (₹):</label>
              <input
                type="number"
                name="discount"
                value={invoiceForm.discount}
                onChange={handleInvoiceFormChange}
                placeholder="Discount"
                style={{ width: '100px', textAlign: 'right', padding: '4px' }}
              />
            </div>

            {/* Adjust from Previous GST Bill */}
            <div style={{ marginTop: '12px', borderTop: '1px dashed #ccc', paddingTop: '12px' }}>
              <label style={{ fontWeight: '600', color: '#555', display: 'block', marginBottom: '5px' }}>Adjust from Previous GST Bill</label>
              
              {(() => {
                const suggested = getSuggestedInvoices();
                if (suggested.length === 0) return <span style={{ fontSize: '0.85em', color: '#888' }}>No pending dues found</span>;

                return (
                  <div style={{ border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: '8px', padding: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                    {suggested.map(inv => (
                      <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85em', padding: '4px 0' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', margin: 0, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selectedSuggestedInvoiceIds.includes(inv.id)}
                            onChange={() => {
                              setSelectedSuggestedInvoiceIds(prev =>
                                prev.includes(inv.id) ? prev.filter(id => id !== inv.id) : [...prev, inv.id]
                              );
                            }}
                          />
                          <span>{inv.invoiceNumber}</span>
                        </label>
                        <span style={{ fontWeight: '600', color: '#e74c3c' }}>₹{(inv.due || 0).toFixed(2)}</span>
                      </div>
                    ))}
                    {selectedSuggestedInvoiceIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const toAdd = suggested.filter(inv => selectedSuggestedInvoiceIds.includes(inv.id));
                          const newAdjs = toAdd.map(inv => ({
                            billId: inv.id,
                            billNumber: inv.invoiceNumber,
                            type: 'due',
                            amount: inv.due
                          }));
                          setAdjustments([...adjustments, ...newAdjs]);
                          setSelectedSuggestedInvoiceIds([]);
                        }}
                        style={{ width: '100%', padding: '4px', fontSize: '0.85em', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '6px', fontWeight: 'bold' }}
                      >
                        Adjust Selected (₹{suggested.filter(inv => selectedSuggestedInvoiceIds.includes(inv.id)).reduce((sum, inv) => sum + (inv.due || 0), 0).toFixed(2)})
                      </button>
                    )}
                  </div>
                );
              })()}

              {adjustments.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <span style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#333' }}>Adjusted Dues:</span>
                  {adjustments.map(adj => (
                    <div key={adj.billId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85em', padding: '2px 0', color: '#27ae60' }}>
                      <span>{adj.billNumber}</span>
                      <div>
                        <span style={{ marginRight: '8px' }}>+₹{adj.amount.toFixed(2)}</span>
                        <button type="button" onClick={() => removeAdjustment(adj.billId)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: 0 }}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {totals.roundOff !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '0.9em', marginTop: '5px' }}>
                <span>Round Off:</span>
                <span>₹{totals.roundOff.toFixed(2)}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2em', fontWeight: 'bold', color: '#2c3e50', marginTop: '10px' }}>
              <span>Grand Total:</span>
              <span>₹{totals.grandTotal.toFixed(2)}</span>
            </div>

            <hr style={{ border: '0', borderTop: '1px solid #eee', margin: '10px 0' }} />

            <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ margin: 0 }}>Paid Amount (₹):</label>
              <input
                type="number"
                name="paidAmount"
                value={invoiceForm.paidAmount}
                onChange={handleInvoiceFormChange}
                placeholder="Amount Paid"
                style={{ width: '120px', textAlign: 'right', padding: '6px', fontWeight: 'bold' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#e74c3c', marginBottom: '10px' }}>
              <span>Remaining Due:</span>
              <span>₹{Math.max(0, totals.grandTotal - (parseFloat(invoiceForm.paidAmount) || 0)).toFixed(2)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={generateInvoice}
            className="add-product-btn"
            style={{ width: '100%', padding: '12px', fontSize: '1.05em', background: '#27ae60', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}
          >
            Generate & Print GST Bill
          </button>
        </div>

      </div>
    </div>
  );
}

export default GstBillGeneration;
