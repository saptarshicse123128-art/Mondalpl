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

  const [openShareInvoiceId, setOpenShareInvoiceId] = useState(null);
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

    pdfDoc.setDrawColor(180, 180, 180);
    pdfDoc.setLineWidth(0.3);
    pdfDoc.rect(20, 39, 170, 32);
    pdfDoc.line(20, 45, 190, 45);

    const hasDiffShipping = invoice.partyShippingAddress && invoice.partyShippingAddress !== invoice.partyAddress;

    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setFontSize(9.5);
    pdfDoc.setTextColor(0, 0, 0);

    if (hasDiffShipping) {
      pdfDoc.text('Billing Details', 22, 43);
      pdfDoc.text('Shipping Details', 77, 43);
      pdfDoc.text('Invoice Details', 134, 43);

      pdfDoc.line(75, 39, 75, 71);
      pdfDoc.line(132, 39, 132, 71);

      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8);
      pdfDoc.text(invoice.partyName || 'N/A', 22, 49);
      const splitBillAddr = pdfDoc.splitTextToSize(invoice.partyAddress || 'N/A', 50);
      pdfDoc.text(splitBillAddr, 22, 53);
      pdfDoc.text('Phone: ' + (invoice.partyPhone || 'N/A'), 22, 63);
      pdfDoc.text('GSTIN: ' + (invoice.partyGstin || 'URD (Unregistered)'), 22, 67);

      pdfDoc.text(invoice.partyShippingName || invoice.partyName || 'N/A', 77, 49);
      const splitShipAddr = pdfDoc.splitTextToSize(invoice.partyShippingAddress || 'N/A', 50);
      pdfDoc.text(splitShipAddr, 77, 53);
      pdfDoc.text('Phone: ' + (invoice.partyShippingPhone || 'N/A'), 77, 63);
      pdfDoc.text('GSTIN: ' + (invoice.partyShippingGstin || 'URD (Unregistered)'), 77, 67);

      pdfDoc.text('Invoice No. - ' + invoice.invoiceNumber, 134, 49);
      pdfDoc.text('Invoice Date - ' + formatDDMMYYYY(invoice.date), 134, 54);
      const dueDateVal = (() => {
        const d = new Date(invoice.date);
        if (isNaN(d.getTime())) return formatDDMMYYYY(invoice.date);
        d.setDate(d.getDate() + 15);
        return formatDDMMYYYY(d);
      })();
      pdfDoc.text('Due Date - ' + dueDateVal, 134, 59);
      const posVal = (invoice.partyShippingStateCode || invoice.partyStateCode || '19') + ' - ' + (invoice.partyShippingStateName || invoice.partyStateName || 'West Bengal');
      pdfDoc.text('Place of Supply - ' + posVal, 134, 64);
    } else {
      pdfDoc.text('Billing Details', 22, 43);
      pdfDoc.text('Invoice Details', 127, 43);

      pdfDoc.line(125, 39, 125, 71);

      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8);
      pdfDoc.text(invoice.partyName || 'N/A', 22, 49);
      const splitBillAddr = pdfDoc.splitTextToSize(invoice.partyAddress || 'N/A', 100);
      pdfDoc.text(splitBillAddr, 22, 53);
      pdfDoc.text('Phone: ' + (invoice.partyPhone || 'N/A'), 22, 63);
      pdfDoc.text('GSTIN: ' + (invoice.partyGstin || 'URD (Unregistered)'), 22, 67);

      pdfDoc.text('Invoice No. - ' + invoice.invoiceNumber, 127, 49);
      pdfDoc.text('Invoice Date - ' + formatDDMMYYYY(invoice.date), 127, 54);
      const dueDateVal = (() => {
        const d = new Date(invoice.date);
        if (isNaN(d.getTime())) return formatDDMMYYYY(invoice.date);
        d.setDate(d.getDate() + 15);
        return formatDDMMYYYY(d);
      })();
      pdfDoc.text('Due Date - ' + dueDateVal, 127, 59);
      const posVal = (invoice.partyStateCode || '19') + ' - ' + (invoice.partyStateName || 'West Bengal');
      pdfDoc.text('Place of Supply - ' + posVal, 127, 64);
    }

    const tableData = (invoice.items || []).map((item, index) => {
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

    const totalQty = (invoice.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalTaxable = (invoice.items || []).reduce((sum, item) => {
      const taxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      return sum + taxPrice;
    }, 0);
    const totalGstAmt = (invoice.items || []).reduce((sum, item) => {
      const taxPrice = item.taxablePrice !== undefined ? item.taxablePrice : (item.price || 0);
      const gstRate = item.gstRate !== undefined ? item.gstRate : 18;
      const gstAmt = item.gstAmount !== undefined ? item.gstAmount : (taxPrice * (gstRate / 100));
      return sum + gstAmt;
    }, 0);
    const totalFinalPrice = (invoice.items || []).reduce((sum, item) => {
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

      if (finalY + 40 > 280) {
        pdfDoc.addPage();
        finalY = 20;
      }

      const boxLeft = 20;
      const boxTop = finalY;
      const boxWidth = 170;
      const boxHeight = 42;
      const bankWidth = boxWidth * 0.7;
      const signWidth = boxWidth * 0.3;
      const dividerX = boxLeft + bankWidth;

      pdfDoc.setDrawColor(160, 160, 160);
      pdfDoc.setLineWidth(0.3);
      pdfDoc.rect(boxLeft, boxTop, boxWidth, boxHeight);
      pdfDoc.line(boxLeft, boxTop + 10, boxLeft + boxWidth, boxTop + 10);
      pdfDoc.line(dividerX, boxTop, dividerX, boxTop + boxHeight);

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

  const shareInvoiceWhatsApp = async (invoice) => {
    const text = `Hello ${invoice.partyName || ''},\nHere is your GST Invoice details:\nInvoice No: ${invoice.invoiceNumber}\nDate: ${formatDDMMYYYY(invoice.date)}\nTotal Amount: ₹${invoice.grandTotal?.toFixed(2)}\nPaid: ₹${(invoice.paidAmount || 0).toFixed(2)}\nDue: ₹${(invoice.due || 0).toFixed(2)}\n\nThank you for doing business with NEW MONDAL PLUMBING AND SANITATION!`;
    const cleanPhone = getInvoicePartyPhone(invoice);

    try {
      // Build PDF document for attachment
      const pdfDoc = new jsPDF();
      pdfDoc.setFont('helvetica');

      pdfDoc.setFontSize(16);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.text('NEW MONDAL PLUMBING AND SANITATION', 20, 20);
      pdfDoc.setFontSize(8.5);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.text('Vill+P.O- Uttardeepur, P.S- Diamond Harbour, Dist- South 24 Parganas, Pin- 743331', 20, 25);
      pdfDoc.text('Mobile: 9732738873 / 9735824593 | Email: mondalplumbing2024@gmail.com', 20, 29);
      pdfDoc.line(20, 32, 190, 32);

      pdfDoc.setFontSize(13);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('TAX INVOICE', 105, 39, { align: 'center' });
      pdfDoc.rect(20, 43, 170, 27);
      pdfDoc.line(125, 43, 125, 70);

      pdfDoc.setFontSize(8.5);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('Billed To / Customer Details:', 22, 48);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.text('Name: ' + (invoice.partyName || 'N/A'), 22, 53);
      pdfDoc.text('Address: ' + (invoice.partyAddress || 'N/A'), 22, 58);
      pdfDoc.text('Phone: ' + (invoice.partyPhone || 'N/A'), 22, 63);
      pdfDoc.text('GSTIN: ' + (invoice.partyGstin || 'URD (Unregistered)'), 22, 67);

      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8);
      pdfDoc.text('Invoice No. - ' + invoice.invoiceNumber, 127, 49);
      pdfDoc.text('Invoice Date - ' + formatDDMMYYYY(invoice.date), 127, 54);

      const tableData = (invoice.items || []).map((item, index) => [
        String(index + 1),
        item.name + (item.variationSize ? ` (${item.variationSize})` : ''),
        item.hsnCode || item.hsn || '',
        String(item.quantity || 1),
        (item.mrp || 0).toFixed(2),
        (item.taxablePrice || 0).toFixed(2),
        `${item.gstRate || 18}%`,
        (item.gstAmount || 0).toFixed(2),
        (item.finalPrice || 0).toFixed(2),
        `${item.discountPercent || 0}%`,
        (item.discountAmount || 0).toFixed(2),
        (item.rowAmount || 0).toFixed(2)
      ]);

      pdfDoc.autoTable({
        startY: 75,
        head: [[
          'SL No', 'Item Name', 'HSN', 'Qty', 'MRP', 'Taxable Price', 'GST %', 'GST AMT', 'Final Price', 'Disc %', 'Disc AMT', 'Amount'
        ]],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontSize: 7 }
      });

      const pdfBlob = pdfDoc.output('blob');
      const safeNumStr = String(invoice.invoiceNumber).replace(/[/\\?%*:|"<>]/g, '_');
      const file = new File([pdfBlob], `GST_Invoice_${safeNumStr}.pdf`, { type: 'application/pdf' });

      // Try native Web Share API with file + text (supported in mobile browsers & modern apps)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `GST Invoice ${invoice.invoiceNumber}`,
          text: text,
          files: [file]
        });
        return;
      }
    } catch (err) {
      console.warn('Web Share with PDF file not supported/cancelled, falling back to direct link:', err);
    }

    // Fallback to WhatsApp Business direct message link
    const encodedText = encodeURIComponent(text);
    const businessUrl = cleanPhone 
      ? `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`
      : `whatsapp://send?text=${encodedText}`;
    const webUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    const win = window.open(businessUrl, '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      window.open(webUrl, '_blank');
    }
  };

  const sendDueReminder = async (invoice) => {
    const dueAmount = invoice.due !== undefined ? invoice.due : Math.max(0, (invoice.grandTotal || 0) - (invoice.paidAmount || 0));
    const customerName = invoice.partyName || 'Customer';
    const invoiceNo = invoice.invoiceNumber || '';
    const invoiceDate = formatDDMMYYYY(invoice.date);
    const totalAmount = (invoice.grandTotal || 0).toFixed(2);
    const paidAmount = (invoice.paidAmount || 0).toFixed(2);
    const dueAmountStr = dueAmount.toFixed(2);
    const businessName = 'NEW MONDAL PLUMBING AND SANITATION';

    const text = `Hello ${customerName},
This is a reminder regarding your pending payment.
Invoice No: ${invoiceNo}
Invoice Date: ${invoiceDate}
Total Amount: ₹${totalAmount}
Paid: ₹${paidAmount}
*Due Amount: ₹${dueAmountStr}*
Kindly clear the outstanding amount at your earliest convenience.
Pay at : 9434504491@ybl
Thank you for your business. 🙏
*${businessName}*`;

    const cleanPhone = getInvoicePartyPhone(invoice);
    const encodedText = encodeURIComponent(text);

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
        console.warn('Fetch /qr_code.png failed, attempting canvas generation:', e);
      }

      if (!qrBlob) {
        // Fallback: draw QR image onto canvas to produce PNG Blob
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          img.src = '/qr_code.png';
        });
        if (img.width > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          qrBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        }
      }

      if (qrBlob) {
        const qrFile = new File([qrBlob], 'payment_qr_code.png', { type: 'image/png' });

        if (navigator.share) {
          const shareData = {
            title: `Due Payment Reminder - ${invoiceNo}`,
            text: text
          };
          if (navigator.canShare && navigator.canShare({ files: [qrFile] })) {
            shareData.files = [qrFile];
          }
          await navigator.share(shareData);
          return;
        }
      }
    } catch (err) {
      console.warn('Web Share with QR image file failed or cancelled:', err);
    }

    // Direct WhatsApp web link fallback
    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
    window.open(waUrl, '_blank');
  };

  const shareEpsonSmartPanel = async (invoice) => {
    try {
      // Create invoice PDF blob for Web Share API or Epson URI scheme
      const pdfDoc = new jsPDF();
      pdfDoc.setFont('helvetica');
      
      pdfDoc.setFontSize(16);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('NEW MONDAL PLUMBING AND SANITATION', 20, 20);
      pdfDoc.setFontSize(8.5);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.text('Vill+P.O- Uttardeepur, P.S- Diamond Harbour, Dist- South 24 Parganas, Pin- 743331', 20, 25);
      pdfDoc.text('Mobile: 9732738873 / 9735824593 | Email: mondalplumbing2024@gmail.com', 20, 29);
      pdfDoc.line(20, 32, 190, 32);

      pdfDoc.setFontSize(13);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('TAX INVOICE', 105, 39, { align: 'center' });
      pdfDoc.rect(20, 43, 170, 27);
      pdfDoc.line(125, 43, 125, 70);

      pdfDoc.setFontSize(8.5);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('Billed To / Customer Details:', 22, 48);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.text('Name: ' + (invoice.partyName || 'N/A'), 22, 53);
      pdfDoc.text('Address: ' + (invoice.partyAddress || 'N/A'), 22, 58);
      pdfDoc.text('Phone: ' + (invoice.partyPhone || 'N/A'), 22, 63);
      pdfDoc.text('GSTIN: ' + (invoice.partyGstin || 'URD (Unregistered)'), 22, 67);

      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(8);
      pdfDoc.text('Invoice No. - ' + invoice.invoiceNumber, 127, 49);
      pdfDoc.text('Invoice Date - ' + formatDDMMYYYY(invoice.date), 127, 54);

      const tableData = (invoice.items || []).map((item, index) => [
        String(index + 1),
        item.name + (item.variationSize ? ` (${item.variationSize})` : ''),
        item.hsnCode || item.hsn || '',
        String(item.quantity || 1),
        (item.mrp || 0).toFixed(2),
        (item.taxablePrice || 0).toFixed(2),
        `${item.gstRate || 18}%`,
        (item.gstAmount || 0).toFixed(2),
        (item.finalPrice || 0).toFixed(2),
        `${item.discountPercent || 0}%`,
        (item.discountAmount || 0).toFixed(2),
        (item.rowAmount || 0).toFixed(2)
      ]);

      pdfDoc.autoTable({
        startY: 75,
        head: [[
          'SL No', 'Item Name', 'HSN', 'Qty', 'MRP', 'Taxable Price', 'GST %', 'GST AMT', 'Final Price', 'Disc %', 'Disc AMT', 'Amount'
        ]],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontSize: 7 }
      });

      const pdfBlob = pdfDoc.output('blob');
      const safeNumStr = String(invoice.invoiceNumber).replace(/[/\\?%*:|"<>]/g, '_');
      const file = new File([pdfBlob], `GST_Invoice_${safeNumStr}.pdf`, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `GST Invoice ${invoice.invoiceNumber}`,
          text: `Epson Smart Panel - Print GST Invoice ${invoice.invoiceNumber}`
        });
      } else {
        // Fallback for Epson app scheme / browser print view
        const epsonSchemeUrl = `epsoniprint://print?file=${encodeURIComponent(URL.createObjectURL(pdfBlob))}`;
        window.open(epsonSchemeUrl, '_blank') || window.open(URL.createObjectURL(pdfBlob), '_blank');
      }
    } catch (err) {
      console.error('Error sharing with Epson Smart Panel:', err);
      // Open PDF in new tab as fallback
      handleDownloadPDF(invoice);
    }
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
                              setOpenShareInvoiceId(null);
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
