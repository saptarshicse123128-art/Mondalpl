import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatDDMMYYYY } from '../../utils/dateUtils';
import './Analytics.css'; // For low-stock-more-btn styling

const SELLER_STATE_CODE = '19'; // West Bengal
function GstInvoiceHistory() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDueOnly, setShowDueOnly] = useState(false);

  const [openMenuInvoiceId, setOpenMenuInvoiceId] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'gst_invoices'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setInvoices(list);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching GST invoices:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const buildGSTPDF = (invoice, isDownload = false) => {
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

    // "TAX INVOICE" header outside/above the border box in the center
    pdfDoc.setFontSize(11);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text('TAX INVOICE', 105, 9, { align: 'center' });

    // Headers & Branding (10mm margin, 190mm width)
    pdfDoc.setFontSize(15);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text('NEW MONDAL PLUMBING AND SANITATION', 13, 20);
    
    pdfDoc.setFontSize(8.5);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.setTextColor(80, 80, 80);
    pdfDoc.text('1029/1, 89 Road, Chintamani Para, Diamond Harbour, West Bengal - 743331', 13, 25);
    pdfDoc.text('Mobile: 9434504491 | Email: mondalplumbingandsanitation@gmail.com', 13, 29);
    pdfDoc.text('GSTIN: 19ERZPM6976H1ZH | PAN: ERZPM6976H', 13, 33);

    // Single continuous outer rectangle framing top heading and billing details seamlessly
    pdfDoc.setDrawColor(180, 180, 180);
    pdfDoc.setLineWidth(0.3);
    pdfDoc.rect(10, 13, 190, 58); // Combined Top Box (13 to 71)
    pdfDoc.line(10, 37, 200, 37); // Divider between Header and Billing Section
    pdfDoc.line(10, 43, 200, 43); // Divider under Billing Details title row

    const hasDiffShipping = invoice.partyShippingAddress && invoice.partyShippingAddress !== invoice.partyAddress;

    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setFontSize(9.5);
    pdfDoc.setTextColor(0, 0, 0);

    if (hasDiffShipping) {
      pdfDoc.text('Billing Details', 12, 41);
      pdfDoc.text('Shipping Details', 75, 41);
      pdfDoc.text('Invoice Details', 140, 41);

      pdfDoc.line(71, 37, 71, 71);
      pdfDoc.line(136, 37, 136, 71);

      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8);
      pdfDoc.text(invoice.partyName || 'N/A', 12, 49);
      const splitBillAddr = pdfDoc.splitTextToSize(invoice.partyAddress || 'N/A', 57);
      pdfDoc.text(splitBillAddr, 12, 53);
      pdfDoc.text('Phone: ' + (invoice.partyPhone || 'N/A'), 12, 63);
      pdfDoc.text('GSTIN: ' + (invoice.partyGstin || 'URD (Unregistered)'), 12, 67);

      pdfDoc.text(invoice.partyShippingName || invoice.partyName || 'N/A', 75, 49);
      const splitShipAddr = pdfDoc.splitTextToSize(invoice.partyShippingAddress || 'N/A', 57);
      pdfDoc.text(splitShipAddr, 75, 53);
      pdfDoc.text('Phone: ' + (invoice.partyShippingPhone || 'N/A'), 75, 63);
      pdfDoc.text('GSTIN: ' + (invoice.partyShippingGstin || 'URD (Unregistered)'), 75, 67);

      pdfDoc.text('Invoice No. - ' + invoice.invoiceNumber, 140, 49);
      pdfDoc.text('Invoice Date - ' + formatDDMMYYYY(invoice.date), 140, 54);
      const dueDateVal = (() => {
        const d = new Date(invoice.date);
        if (isNaN(d.getTime())) return formatDDMMYYYY(invoice.date);
        d.setDate(d.getDate() + 15);
        return formatDDMMYYYY(d);
      })();
      pdfDoc.text('Due Date - ' + dueDateVal, 140, 59);
      const posVal = (invoice.partyShippingStateCode || invoice.partyStateCode || '19') + ' - ' + (invoice.partyShippingStateName || invoice.partyStateName || 'West Bengal');
      pdfDoc.text('Place of Supply - ' + posVal, 140, 64);
    } else {
      pdfDoc.text('Billing & Shipping Details', 12, 41);
      pdfDoc.text('Invoice Details', 135, 41);

      pdfDoc.line(130, 37, 130, 71);

      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8);
      pdfDoc.text(invoice.partyName || 'N/A', 12, 49);
      const splitBillAddr = pdfDoc.splitTextToSize(invoice.partyAddress || 'N/A', 115);
      pdfDoc.text(splitBillAddr, 12, 53);
      pdfDoc.text('Phone: ' + (invoice.partyPhone || 'N/A'), 12, 63);
      pdfDoc.text('GSTIN: ' + (invoice.partyGstin || 'URD (Unregistered)'), 12, 67);

      pdfDoc.text('Invoice No. - ' + invoice.invoiceNumber, 135, 49);
      pdfDoc.text('Invoice Date - ' + formatDDMMYYYY(invoice.date), 135, 54);
      const dueDateVal = (() => {
        const d = new Date(invoice.date);
        if (isNaN(d.getTime())) return formatDDMMYYYY(invoice.date);
        d.setDate(d.getDate() + 15);
        return formatDDMMYYYY(d);
      })();
      pdfDoc.text('Due Date - ' + dueDateVal, 135, 59);
      const posVal = (invoice.partyStateCode || '19') + ' - ' + (invoice.partyStateName || 'West Bengal');
      pdfDoc.text('Place of Supply - ' + posVal, 135, 64);
    }

    const tableData = (invoice.items || []).map((item, index) => {
      const qty = item.quantity || 1;
      const unitVal = item.unit || item.stockUnit || '';
      const qtyFormatted = unitVal ? `${qty} ${unitVal}` : String(qty);
      const hsn = item.hsnCode || item.hsn || '';
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
        qtyFormatted,
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
        { content: 'Qty', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
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

    const totalQty = (invoice.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalTaxable = (invoice.items || []).reduce((sum, item) => {
      const qty = item.quantity || 1;
      const taxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      return sum + (taxPrice * qty);
    }, 0);
    const totalGstAmt = (invoice.items || []).reduce((sum, item) => {
      const qty = item.quantity || 1;
      const taxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      const gstRate = item.gstRate !== undefined ? item.gstRate : 18;
      const gstAmt = item.gstAmount !== undefined ? item.gstAmount : (taxPrice * (gstRate / 100));
      return sum + (gstAmt * qty);
    }, 0);
    const totalFinalPrice = (invoice.items || []).reduce((sum, item) => {
      const qty = item.quantity || 1;
      const taxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      const gstRate = item.gstRate !== undefined ? item.gstRate : 18;
      const finalPrice = item.finalPrice !== undefined ? item.finalPrice : (taxPrice * (1 + gstRate / 100));
      return sum + (finalPrice * qty);
    }, 0);
    const totalDiscountAmt = (invoice.items || []).reduce((sum, item) => {
      const qty = item.quantity || 1;
      const discAmt = item.discountAmount !== undefined ? item.discountAmount : 0;
      return sum + (discAmt * qty);
    }, 0);
    const totalAmount = (invoice.items || []).reduce((sum, item) => {
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
      startY: 71,
      head: tableHeaders,
      body: tableData,
      foot: tableFooter,
      theme: 'grid',
      headStyles: {
        fillColor: [240, 243, 245],
        textColor: [44, 62, 80],
        fontSize: 7.5,
        fontStyle: 'bold'
      },
      footStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontSize: 7,
        fontStyle: 'bold',
        lineColor: [180, 180, 180],
        lineWidth: 0.15
      },
      styles: {
        fontSize: 7,
        font: 'helvetica',
        lineColor: [180, 180, 180],
        lineWidth: 0.15
      },
      margin: { left: 10, right: 10 }
    });

    let finalY = pdfDoc.lastAutoTable.finalY + 10;

    // Ensure we don't overflow the page with the summary tables
    if (finalY + 38 > 280) {
      pdfDoc.addPage();
      finalY = 20;
    }

    // ── Generate Left Table (Tax Summary) data ──
    const taxGroups = {};
    (invoice.items || []).forEach(item => {
      const qty = item.quantity || 1;
      const rate = item.gstRate !== undefined ? item.gstRate : 18;
      const unitTaxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      const unitGst = item.gstAmount !== undefined ? item.gstAmount : (unitTaxPrice * (rate / 100));

      if (!taxGroups[rate]) {
        taxGroups[rate] = { rate, taxable: 0, tax: 0 };
      }
      taxGroups[rate].taxable += (unitTaxPrice * qty);
      taxGroups[rate].tax += (unitGst * qty);
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

    const discVal = parseFloat(invoice.discount) || 0;
    const adjVal = invoice.totalAdjustments !== undefined 
      ? parseFloat(invoice.totalAdjustments) 
      : (Array.isArray(invoice.adjustments) ? invoice.adjustments.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0) : 0);
    const roundOffVal = invoice.roundOff !== undefined ? parseFloat(invoice.roundOff) : 0;
    const hasModifications = discVal > 0 || adjVal > 0 || (roundOffVal !== 0 && Math.abs(roundOffVal) >= 0.01);

    const rightRows = [];
    rightRows.push(['Taxable Amt. -', taxSummaryTaxable.toFixed(2)]);
    rightRows.push(['Total Tax -', taxSummaryTax.toFixed(2)]);

    if (hasModifications) {
      rightRows.push(['Subtotal -', totalAmount.toFixed(2)]);
      if (discVal > 0) {
        rightRows.push(['Extra Disc. -', `-${discVal.toFixed(2)}`]);
      }
      if (adjVal > 0) {
        const adjBillNos = Array.isArray(invoice.adjustments) && invoice.adjustments.length > 0 
          ? invoice.adjustments.map(a => a.billNumber || a.invoiceNumber).filter(Boolean).join(', ') 
          : '';
        const adjLabel = adjBillNos ? `Prev. Bill Adj. (${adjBillNos}) -` : 'Prev. Bill Adj. -';
        rightRows.push([adjLabel, `+${adjVal.toFixed(2)}`]);
      }
      if (roundOffVal !== 0 && Math.abs(roundOffVal) >= 0.01) {
        rightRows.push(['Round Off -', roundOffVal > 0 ? `+${roundOffVal.toFixed(2)}` : roundOffVal.toFixed(2)]);
      }
    }

    rightRows.push([
      { content: 'Grand Total -', styles: { fontStyle: 'bold', fillColor: [240, 243, 245] } },
      { content: invoice.grandTotal.toFixed(2), styles: { fontStyle: 'bold', fillColor: [240, 243, 245] } }
    ]);

    rightRows.push(['Paid Amount -', (invoice.paidAmount || 0).toFixed(2)]);

    const dueVal = invoice.due !== undefined ? invoice.due : Math.max(0, invoice.grandTotal - (invoice.paidAmount || 0));
    if (dueVal > 0) {
      rightRows.push([
        { content: 'Due Balance -', styles: { fontStyle: 'bold', textColor: [231, 76, 60] } },
        { content: dueVal.toFixed(2), styles: { fontStyle: 'bold', textColor: [231, 76, 60] } }
      ]);
    }

    const sectionStartY = finalY;

    // ── Render Left Table (Tax Summary) ──
    pdfDoc.autoTable({
      startY: sectionStartY,
      margin: { left: 10 },
      tableWidth: 105,
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

    // ── Render Left Table 2 (Invoice Amt in words) directly connected under Tax Summary ──
    const wordsRows = [
      [{ content: 'Invoice Amt in words:', styles: { fontStyle: 'bold', fontSize: 7.5 } }],
      [{ content: convertNumberToWords(invoice.grandTotal), styles: { fontStyle: 'italic', fontSize: 7.5 } }]
    ];

    pdfDoc.autoTable({
      startY: leftFinalY,
      margin: { left: 10 },
      tableWidth: 105,
      body: wordsRows,
      theme: 'plain',
      styles: {
        fontSize: 7.5,
        font: 'helvetica',
        lineColor: [180, 180, 180],
        lineWidth: 0.15,
        halign: 'left',
        valign: 'middle'
      },
      didParseCell: function(data) {
        if (data.row.index === 0) {
          data.cell.styles.lineWidth = { top: 0.15, bottom: 0, left: 0.15, right: 0.15 };
        } else if (data.row.index === 1) {
          data.cell.styles.lineWidth = { top: 0, bottom: 0, left: 0.15, right: 0.15 };
        }
      }
    });
    const wordsFinalY = pdfDoc.lastAutoTable.finalY;

    // ── Render Right Table (Totals Summary) connected on right side (without middle vertical line) ──
    pdfDoc.autoTable({
      startY: sectionStartY,
      margin: { left: 115 },
      tableWidth: 85,
      body: rightRows,
      theme: 'plain',
      styles: {
        fontSize: 7.5,
        font: 'helvetica',
        lineColor: [180, 180, 180],
        lineWidth: 0.15,
        halign: 'left',
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { halign: 'right', cellWidth: 35 }
      },
      didParseCell: function(data) {
        if (data.column.index === 0) {
          data.cell.styles.lineWidth = { top: 0.15, bottom: 0.15, left: 0.15, right: 0 };
        } else if (data.column.index === 1) {
          data.cell.styles.lineWidth = { top: 0.15, bottom: 0.15, left: 0, right: 0.15 };
        }
      }
    });
    const rightFinalY = pdfDoc.lastAutoTable.finalY;

    finalY = Math.max(rightFinalY, wordsFinalY);

    // Draw bold outer framing border enclosing all 3 connected middle tables
    pdfDoc.setDrawColor(180, 180, 180);
    pdfDoc.setLineWidth(0.3);
    pdfDoc.rect(10, sectionStartY, 190, finalY - sectionStartY);

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
      finalY += 4;

      if (finalY + 44 > 280) {
        pdfDoc.addPage();
        finalY = 20;
      }

      const boxLeft = 10;
      const boxTop = finalY;
      const boxWidth = 190;
      const boxHeight = 42;
      const bankWidth = boxWidth * 0.7;
      const signWidth = boxWidth * 0.3;
      const dividerX = boxLeft + bankWidth;

      // Outer frame boundaries: rect at (10, 13, 190, 58) starts at y=13
      pdfDoc.setDrawColor(180, 180, 180);
      pdfDoc.setLineWidth(0.3);
      pdfDoc.rect(boxLeft, boxTop, boxWidth, boxHeight);
      pdfDoc.line(boxLeft, boxTop + 10, boxLeft + boxWidth, boxTop + 10);
      pdfDoc.line(dividerX, boxTop, dividerX, boxTop + boxHeight);

      // Connect continuous vertical side outer frame lines (x=10 & x=200) from top header (y=13) down to bottom bank box (boxTop + boxHeight)
      pdfDoc.line(10, 13, 10, boxTop + boxHeight);
      pdfDoc.line(200, 13, 200, boxTop + boxHeight);

      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setFontSize(8);
      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.text('Bank Details:', boxLeft + 2, boxTop + 5);
      pdfDoc.setFontSize(7.5);
      pdfDoc.text('For NEW MONDAL PLUMBING', dividerX + 2, boxTop + 4.5);
      pdfDoc.text('AND SANITATION:', dividerX + 2, boxTop + 8.5);

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

      if (qrDataUrl) {
        const qrSize = 28;
        const qrX = dividerX - qrSize - 2;
        const qrY = boxTop + 11;
        pdfDoc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
      }

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

      const safeNumStr = String(invoice.invoiceNumber).replace(/[/\\?%*:|"<>]/g, '_');
      const fileName = `GST_Invoice_${safeNumStr}.pdf`;

      if (isDownload) {
        pdfDoc.save(fileName);
      } else {
        const pdfBlob = pdfDoc.output('blob');
        const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          navigator.share({
            files: [pdfFile],
            title: `GST Invoice ${invoice.invoiceNumber}`
          }).catch((err) => {
            console.warn('System Open With dismissed, opening in browser tab:', err);
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
          });
        } else {
          const pdfUrl = URL.createObjectURL(pdfBlob);
          window.open(pdfUrl, '_blank');
        }
      }
    };

    Promise.all([
      loadImageAsDataURL('/signature.png'),
      loadImageAsDataURL('/qr_code.png')
    ]).then(([sigDataUrl, qrDataUrl]) => {
      drawBottomSection(qrDataUrl, sigDataUrl);
    });
  };

  const handleDownloadPDF = (invoice) => {
    buildGSTPDF(invoice, true);
  };

  const handleView = (invoice) => {
    buildGSTPDF(invoice, false);
  };

  const getInvoicePartyPhone = (invoice) => {
    const rawPhone = invoice.partyPhone || invoice.partyShippingPhone || invoice.phone || invoice.mobile || '';
    const digits = String(rawPhone).replace(/[^0-9]/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    return digits;
  };

  const sendDueReminder = async (invoice) => {
    const dueAmount = invoice.due !== undefined ? invoice.due : Math.max(0, (invoice.grandTotal || 0) - (invoice.paidAmount || 0));
    const customerName = invoice.partyName || 'Customer';
    const invoiceNo = invoice.invoiceNumber || '';
    const invoiceDate = formatDDMMYYYY(invoice.date);
    const dueAmountStr = dueAmount.toFixed(2);
    const businessName = 'NEW MONDAL PLUMBING AND SANITATION';

    const text = `Hello ${customerName},
This is a reminder regarding your pending payment.
Invoice No: ${invoiceNo}
Invoice Date: ${invoiceDate}
*Due Amount: ₹${dueAmountStr}*
Kindly clear the outstanding amount at your earliest convenience.
Pay at : 9434504491@ybl
Thank you for your business. 🙏
*${businessName}*`;

    const cleanPhone = getInvoicePartyPhone(invoice);

    if (!cleanPhone) {
      alert(`No phone number found for party: ${customerName}`);
      return;
    }

    try {
      let qrBlob;
      try {
        const response = await fetch('/qr_code.png');
        if (response.ok) {
          qrBlob = await response.blob();
        }
      } catch (e) {
        console.warn('Fetch /qr_code.png failed:', e);
      }

      if (qrBlob && navigator.share) {
        const qrFile = new File([qrBlob], 'payment_qr_code.png', { type: 'image/png' });
        const shareData = { title: `Due Payment Reminder - ${invoiceNo}`, text: text };
        if (navigator.canShare && navigator.canShare({ files: [qrFile] })) {
          shareData.files = [qrFile];
        }
        await navigator.share(shareData);
        return;
      }
    } catch (err) {
      console.warn('Web Share with QR image file failed:', err);
    }

    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  };

  const deleteInvoice = async (invoiceId) => {
    if (!window.confirm('Are you sure you want to delete this GST invoice? This action cannot be undone.')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'gst_invoices', invoiceId));
      alert('GST Invoice deleted successfully.');
    } catch (err) {
      console.error('Error deleting GST invoice:', err);
      alert('Failed to delete GST invoice.');
    }
  };

  // Filters logic
  const filteredInvoices = invoices.filter(inv => {
    const textMatch = 
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.partyName && inv.partyName.toLowerCase().includes(searchQuery.toLowerCase()));
      
    let dateMatch = true;
    if (startDate) {
      dateMatch = dateMatch && inv.date >= startDate;
    }
    if (endDate) {
      dateMatch = dateMatch && inv.date <= endDate;
    }

    let dueMatch = true;
    if (showDueOnly) {
      dueMatch = (inv.due || 0) > 0;
    }

    return textMatch && dateMatch && dueMatch;
  });

  return (
    <div className="stock-management"> {/* Reuse styles for card panels and layout */}
      <h2>GST Invoice History</h2>

      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px', background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #eee' }}>
        <div style={{ flex: 2, minWidth: '250px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85em', color: '#666', fontWeight: 'bold' }}>Search Invoices</label>
          <input
            type="text"
            placeholder="Search by invoice number or party name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85em', color: '#666', fontWeight: 'bold' }}>From Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85em', color: '#666', fontWeight: 'bold' }}>To Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '20px', gap: '6px' }}>
          <input
            type="checkbox"
            id="showDueOnly"
            checked={showDueOnly}
            onChange={(e) => setShowDueOnly(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#e74c3c' }}
          />
          <label htmlFor="showDueOnly" style={{ margin: 0, fontSize: '0.9em', fontWeight: 600, color: '#e74c3c', cursor: 'pointer' }}>
            Show Due Bills Only
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: '20px' }}>
          <button 
            onClick={() => { setSearchQuery(''); setStartDate(''); setEndDate(''); setShowDueOnly(false); }}
            className="remove-btn" 
            style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '20px', background: '#fff', borderRadius: '8px' }}>
        {loading ? (
          <p>Loading invoices...</p>
        ) : filteredInvoices.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>No GST invoices found.</p>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Invoice No</th>
                  <th>Date</th>
                  <th>Customer Name</th>
                  <th>Phone No</th>
                  <th>Taxable Total</th>
                  <th>Total Tax</th>
                  <th>Grand Total</th>
                  <th>Paid Amount</th>
                  <th>Due Balance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td><strong>{inv.invoiceNumber}</strong></td>
                    <td>{formatDDMMYYYY(inv.date)}</td>
                    <td>{inv.partyName}</td>
                    <td>{inv.partyPhone || inv.partyShippingPhone || inv.phone || '—'}</td>
                    <td>₹{inv.taxableTotal?.toFixed(2)}</td>
                    <td>₹{inv.totalTax?.toFixed(2)}</td>
                    <td><strong style={{ color: '#2c3e50' }}>₹{inv.grandTotal?.toFixed(2)}</strong></td>
                    <td style={{ color: '#27ae60' }}>₹{inv.paidAmount?.toFixed(2)}</td>
                    <td style={{ color: inv.due > 0 ? '#e74c3c' : '#27ae60', fontWeight: 'bold' }}>
                      ₹{inv.due?.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          flexWrap: 'nowrap',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <button
                          type="button"
                          className="low-stock-more-btn"
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            background: '#fff',
                            cursor: 'pointer',
                            color: '#333'
                          }}
                          onClick={() => handleView(inv)}
                          title="View"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="low-stock-more-btn"
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            borderRadius: '4px',
                            border: '1px solid #d63384',
                            background: '#e83e8c',
                            cursor: 'pointer',
                            color: '#fff'
                          }}
                          onClick={() => handleDownloadPDF(inv)}
                          title="Print / Download PDF"
                        >
                          Print
                        </button>
                        <div
                          className="po-menu-container"
                          style={{ position: 'relative', display: 'inline-flex' }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuInvoiceId(
                                openMenuInvoiceId === inv.id ? null : inv.id
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
                          {openMenuInvoiceId === inv.id && (
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
                                  setOpenMenuInvoiceId(null);
                                  // Load invoice into GST Bill Generation screen for full editing without saving to draft list automatically
                                  const editData = {
                                    editingInvoiceId: inv.id,
                                    invoiceNumber: inv.invoiceNumber,
                                    partyId: inv.partyId,
                                    partyName: inv.partyName,
                                    cart: (inv.items || []).map(item => ({
                                      ...item,
                                      cartItemId: item.cartItemId || item.id || `item_${Date.now()}_${Math.random()}`
                                    })),
                                    invoiceForm: {
                                      date: inv.date || new Date().toISOString().split('T')[0],
                                      discount: String(inv.discount || ''),
                                      paidAmount: String(inv.paidAmount || '')
                                    },
                                    adjustments: inv.adjustments || []
                                  };
                                  try {
                                    localStorage.setItem('mondal_gst_active_edit', JSON.stringify(editData));
                                  } catch (err) {
                                    console.error('Error setting active edit payload:', err);
                                  }
                                  navigate('/dashboard/gst-bills');
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
                                  setOpenMenuInvoiceId(null);
                                  sendDueReminder(inv);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '10px 15px',
                                  border: 'none',
                                  background: 'none',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  color: '#e67e22',
                                  borderTop: '1px solid #eee'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#fff8f0';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'white';
                                }}
                              >
                                🔔 Due Reminder
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuInvoiceId(null);
                                  deleteInvoice(inv.id);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '10px 15px',
                                  border: 'none',
                                  background: 'none',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  color: '#dc3545',
                                  borderTop: '1px solid #eee'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#fff5f5';
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default GstInvoiceHistory;
