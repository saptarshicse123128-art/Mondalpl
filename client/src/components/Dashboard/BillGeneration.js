import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, deleteDoc, writeBatch, query } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './BillGeneration.css';

function BillGeneration() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [billForm, setBillForm] = useState({
    fullName: '',
    date: new Date().toISOString().split('T')[0],
    address: '',
    gst: '',
    phone: '',
    discount: '',
    due: ''
  });
  const [selectedProduct, setSelectedProduct] = useState('');
  const [productQuantity, setProductQuantity] = useState(1);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [bills, setBills] = useState([]);
  const [showBills, setShowBills] = useState(false);
  const [generatedBill, setGeneratedBill] = useState(null);
  const [billSearchQuery, setBillSearchQuery] = useState('');
  const [customProductMode, setCustomProductMode] = useState(false);
  const [customProduct, setCustomProduct] = useState({
    name: '',
    quantity: 1,
    price: ''
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productsList = [];
      snapshot.forEach((doc) => {
        productsList.push({ id: doc.id, ...doc.data() });
      });
      setProducts(productsList);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'bills'), (snapshot) => {
      const billsList = [];
      snapshot.forEach((doc) => {
        billsList.push({ id: doc.id, ...doc.data() });
      });
      // Sort by bill number value (descending - newest first), or by date if no bill number
      setBills(billsList.sort((a, b) => {
        if (a.billNumberValue && b.billNumberValue) {
          return b.billNumberValue - a.billNumberValue;
        }
        return new Date(b.createdAt?.toDate()) - new Date(a.createdAt?.toDate());
      }));
    });

    return () => unsubscribe();
  }, []);

  const handleFormChange = (e) => {
    setBillForm({
      ...billForm,
      [e.target.name]: e.target.value
    });
  };

  const handleAddCustomProduct = () => {
    if (!customProduct.name.trim()) {
      alert('Please enter product name');
      return;
    }
    if (customProduct.quantity <= 0) {
      alert('Quantity must be greater than 0');
      return;
    }
    if (!customProduct.price || parseFloat(customProduct.price) <= 0) {
      alert('Please enter a valid price');
      return;
    }

    // Create a custom product object (not from stock)
    const customProductItem = {
      id: `custom_${Date.now()}`, // Unique ID for custom products
      name: customProduct.name.trim(),
      price: parseFloat(customProduct.price),
      quantity: parseInt(customProduct.quantity),
      category: '',
      subcategory: '',
      isCustomProduct: true // Flag to identify custom products
    };

    // Check if same custom product already exists in cart
    const existingCustomItem = cart.find(item => 
      item.isCustomProduct && 
      item.name.toLowerCase() === customProductItem.name.toLowerCase()
    );

    if (existingCustomItem) {
      // Update quantity if same custom product exists
      setCart(cart.map(item =>
        item.id === existingCustomItem.id
          ? { ...item, quantity: existingCustomItem.quantity + customProductItem.quantity }
          : item
      ));
    } else {
      // Add new custom product to cart
      setCart([...cart, customProductItem]);
    }

    // Reset custom product form and turn off switch
    setCustomProduct({
      name: '',
      quantity: 1,
      price: ''
    });
    setCustomProductMode(false);
  };

  const handleAddProduct = async () => {
    if (customProductMode) {
      handleAddCustomProduct();
      return;
    }

    if (!selectedProduct) {
      alert('Please select a product');
      return;
    }
    if (productQuantity <= 0) {
      alert('Quantity must be greater than 0');
      return;
    }

    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    if (product.quantity < productQuantity) {
      alert(`Only ${product.quantity} items available in stock`);
      return;
    }

    const existingItem = cart.find(item => item.id === product.id);
    const quantityToAdd = existingItem ? productQuantity : productQuantity;
    const newCartQuantity = existingItem ? existingItem.quantity + productQuantity : productQuantity;
    
    if (product.quantity < newCartQuantity) {
      alert(`Only ${product.quantity} items available in stock`);
      return;
    }

    try {
      // Update product quantity in Firestore
      const productRef = doc(db, 'products', product.id);
      const newStockQuantity = product.quantity - quantityToAdd;
      
      await updateDoc(productRef, {
        quantity: newStockQuantity,
        updatedAt: serverTimestamp()
      });

      // Update cart
      if (existingItem) {
        setCart(cart.map(item =>
          item.id === product.id
            ? { ...item, quantity: newCartQuantity }
            : item
        ));
      } else {
        setCart([...cart, { ...product, quantity: productQuantity }]);
      }

      setSelectedProduct('');
      setProductQuantity(1);
      setProductSearchQuery('');
    } catch (error) {
      console.error('Error updating product quantity:', error);
      alert('Failed to update product stock. Please try again.');
    }
  };

  const updateCartQuantity = async (productId, newQuantity) => {
    const cartItem = cart.find(item => item.id === productId);
    if (!cartItem) return;

    // If it's a custom product, just update quantity without stock management
    if (cartItem.isCustomProduct) {
      if (newQuantity <= 0) {
        setCart(cart.filter(item => item.id !== productId));
      } else {
        setCart(cart.map(item =>
          item.id === productId ? { ...item, quantity: newQuantity } : item
        ));
      }
      return;
    }

    if (newQuantity <= 0) {
      // Remove from cart and restore stock
      await restoreProductStock(productId, cartItem.quantity);
      setCart(cart.filter(item => item.id !== productId));
    } else {
      // Calculate the difference in quantity
      const quantityDifference = newQuantity - cartItem.quantity;
      const product = products.find(p => p.id === productId);
      
      if (!product) return;

      // Check if enough stock is available
      if (product.quantity < quantityDifference) {
        alert(`Only ${product.quantity} items available in stock`);
        return;
      }

      try {
        // Update product quantity in Firestore
        const productRef = doc(db, 'products', productId);
        const newStockQuantity = product.quantity - quantityDifference;
        
        await updateDoc(productRef, {
          quantity: newStockQuantity,
          updatedAt: serverTimestamp()
        });

        // Update cart
        setCart(cart.map(item =>
          item.id === productId ? { ...item, quantity: newQuantity } : item
        ));
      } catch (error) {
        console.error('Error updating product quantity:', error);
        alert('Failed to update product stock. Please try again.');
      }
    }
  };

  const restoreProductStock = async (productId, quantityToRestore) => {
    try {
      const productRef = doc(db, 'products', productId);
      const productDoc = await getDoc(productRef);
      
      if (productDoc.exists()) {
        const currentQuantity = productDoc.data().quantity || 0;
        await updateDoc(productRef, {
          quantity: currentQuantity + quantityToRestore,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error restoring product stock:', error);
    }
  };

  const removeFromCart = async (productId) => {
    const cartItem = cart.find(item => item.id === productId);
    if (cartItem && !cartItem.isCustomProduct) {
      // Restore stock when removing from cart (only for stock products)
      await restoreProductStock(productId, cartItem.quantity);
    }
    setCart(cart.filter(item => item.id !== productId));
  };

  const handleDeleteBill = async (billId) => {
    if (!window.confirm('Are you sure you want to delete this bill? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'bills', billId));
      alert('Bill deleted successfully.');
    } catch (error) {
      console.error('Error deleting bill:', error);
      alert('Failed to delete bill. Please try again.');
    }
  };

  const generateBillNumber = (billNumber) => {
    return `MPS/${String(billNumber).padStart(5, '0')}`;
  };

  const getNextBillNumber = async () => {
    try {
      const billsSnapshot = await getDocs(collection(db, 'bills'));
      const billsList = [];
      billsSnapshot.forEach((doc) => {
        billsList.push({ id: doc.id, ...doc.data() });
      });
      
      if (billsList.length === 0) {
        return 1;
      }

      // Extract bill numbers and find the highest
      const billNumbers = billsList
        .map(bill => bill.billNumber)
        .filter(bn => bn && bn.startsWith('MPS/'))
        .map(bn => {
          const numStr = bn.replace('MPS/', '');
          return parseInt(numStr, 10);
        })
        .filter(num => !isNaN(num));

      if (billNumbers.length === 0) {
        return 1;
      }

      const maxBillNumber = Math.max(...billNumbers);
      return maxBillNumber + 1;
    } catch (error) {
      console.error('Error getting next bill number:', error);
      return 1;
    }
  };

  const handleResetAllBills = async () => {
    if (!window.confirm('Are you sure you want to delete ALL bills? This action cannot be undone and will reset bill numbers to MPS/00001.')) {
      return;
    }

    if (!window.confirm('This will permanently delete all bills. Are you absolutely sure?')) {
      return;
    }

    try {
      const billsSnapshot = await getDocs(collection(db, 'bills'));
      const batch = writeBatch(db);
      let count = 0;

      billsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
        count++;
      });

      await batch.commit();
      alert(`Successfully deleted ${count} bill(s). New bills will start from MPS/00001.`);
      setBillSearchQuery('');
    } catch (error) {
      console.error('Error deleting all bills:', error);
      alert('Failed to delete all bills. Please try again.');
    }
  };

  const calculateSubtotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const calculateDiscount = () => {
    return parseFloat(billForm.discount) || 0;
  };

  const calculateFinalTotal = () => {
    const subtotal = calculateSubtotal();
    const discount = calculateDiscount();
    return Math.max(0, subtotal - discount);
  };

  const handleGenerateBill = async () => {
    if (cart.length === 0) {
      alert('Please add products to the bill');
      return;
    }
    if (!billForm.fullName.trim()) {
      alert('Please enter customer full name');
      return;
    }
    if (!billForm.date) {
      alert('Please select a date');
      return;
    }

    try {
      const subtotal = calculateSubtotal();
      const discount = calculateDiscount();
      const finalTotal = calculateFinalTotal();
      const nextBillNumber = await getNextBillNumber();
      const billNumber = generateBillNumber(nextBillNumber);

      const billData = {
        fullName: billForm.fullName,
        date: billForm.date,
        address: billForm.address,
        phone: billForm.phone,
        discount: discount,
        due: billForm.due.trim() || null,
        billNumber: billNumber,
        billNumberValue: nextBillNumber,
        items: cart.map(item => ({
          productId: item.id,
          productName: item.name,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.price * item.quantity
        })),
        subtotal: subtotal,
        total: finalTotal,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'bills'), billData);
      const billWithId = { id: docRef.id, ...billData };
      
      // Automatically download PDF after generating bill
      setTimeout(() => {
        downloadPDF(billWithId);
      }, 500);
      
      // Note: Stock is already updated when products were added to cart
      // So we just clear the cart and form
      setCart([]);
      setBillForm({
        fullName: '',
        date: new Date().toISOString().split('T')[0],
        address: '',
        gst: '',
        phone: '',
        discount: '',
        due: ''
      });
      setGeneratedBill(null); // Clear generatedBill since PDF is auto-downloaded
      
      alert('Bill generated successfully! PDF download started automatically. Check your Downloads folder.');
    } catch (error) {
      console.error('Error generating bill:', error);
      alert('Failed to generate bill');
    }
  };

  const downloadPDF = (bill = null) => {
    try {
      const billToDownload = bill || generatedBill;
      if (!billToDownload) {
        alert('Please generate a bill first');
        return;
      }

      const pdfDoc = new jsPDF();
      
      // Set default font to avoid encoding issues
      pdfDoc.setFont('helvetica');
      
      // Bill Header
      pdfDoc.setFontSize(20);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('INVOICE', 105, 20, { align: 'center' });
      
      pdfDoc.setFontSize(12);
      pdfDoc.setFont('helvetica', 'normal');
      const billNumber = billToDownload.billNumber || billToDownload.id?.slice(0, 8).toUpperCase() || 'N/A';
      pdfDoc.text('Bill #: ' + billNumber, 20, 35);
      const billDate = billToDownload.date || (billToDownload.createdAt?.toDate ? billToDownload.createdAt.toDate().toLocaleDateString() : 'N/A');
      pdfDoc.text('Date: ' + billDate, 20, 42);
      
      // Customer Information
      pdfDoc.setFontSize(14);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('Bill To:', 20, 55);
      pdfDoc.setFontSize(11);
      pdfDoc.setFont('helvetica', 'normal');
      const customerName = String(billToDownload.fullName || billToDownload.customerName || 'N/A');
      pdfDoc.text('Name: ' + customerName, 20, 62);
      
      let currentY = 69;
      if (billToDownload.phone || billToDownload.customerPhone) {
        pdfDoc.text('Phone: ' + String(billToDownload.phone || billToDownload.customerPhone), 20, currentY);
        currentY += 7;
      }
      if (billToDownload.address) {
        const addressText = 'Address: ' + String(billToDownload.address);
        const addressLines = pdfDoc.splitTextToSize(addressText, 170);
        pdfDoc.text(addressLines, 20, currentY);
        currentY += (addressLines.length * 7);
      }
      
      // Items Table
      if (!billToDownload.items || billToDownload.items.length === 0) {
        alert('No items found in this bill');
        return;
      }
      
      // Prepare table data with proper formatting
      const tableData = billToDownload.items.map(item => {
        const price = parseFloat(item.price || 0);
        const quantity = parseInt(item.quantity || 0);
        const subtotal = parseFloat(item.subtotal || (price * quantity));
        
        return [
          String(item.productName || 'N/A'),
          'Rs. ' + price.toFixed(2),
          String(quantity),
          'Rs. ' + subtotal.toFixed(2)
        ];
      });
      
      pdfDoc.autoTable({
        startY: currentY + 5,
        head: [['Product', 'Price', 'Quantity', 'Subtotal']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [102, 126, 234] },
        styles: { 
          fontSize: 10,
          font: 'helvetica'
        },
        margin: { left: 20, right: 20 }
      });
      
      // Calculate final Y position
      const finalY = pdfDoc.lastAutoTable.finalY + 10;
      
      // Totals - using simple text without special characters
      pdfDoc.setFontSize(11);
      pdfDoc.setFont('helvetica', 'normal');
      const subtotal = parseFloat(billToDownload.subtotal || 0);
      pdfDoc.text('Subtotal: Rs. ' + subtotal.toFixed(2), 150, finalY, { align: 'right' });
      
      let currentYPos = finalY + 7;
      
      // Add Discount if provided
      const discount = parseFloat(billToDownload.discount || 0);
      if (discount > 0) {
        pdfDoc.text('Discount: Rs. -' + discount.toFixed(2), 150, currentYPos, { align: 'right' });
        currentYPos += 7;
      }
      
      // Total Amount
      pdfDoc.setFontSize(12);
      pdfDoc.setFont('helvetica', 'bold');
      const total = parseFloat(billToDownload.total || subtotal);
      pdfDoc.text('Total Amount: Rs. ' + total.toFixed(2), 150, currentYPos, { align: 'right' });
      currentYPos += 7;
      
      // Add Due field if provided
      if (billToDownload.due && billToDownload.due.trim()) {
        pdfDoc.setFontSize(11);
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.text('Due: ' + String(billToDownload.due), 150, currentYPos, { align: 'right' });
        currentYPos += 7;
      }
      
      // Footer
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(10);
      pdfDoc.text('Thank you for your business!', 105, finalY + 25, { align: 'center' });
      
      // Save PDF
      const billNum = billToDownload.billNumber || 'N/A';
      const fileName = `Invoice_${billNum}_${customerName.replace(/\s+/g, '_')}_${billDate.replace(/\//g, '-')}.pdf`;
      pdfDoc.save(fileName);
      
      // Show success message
      alert('PDF downloaded successfully! Check your Downloads folder.');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  return (
    <div className="bill-generation">
      <div className="bill-header">
        <h2>Bill Generation</h2>
        <button
          className="toggle-bills-btn"
          onClick={() => setShowBills(!showBills)}
        >
          {showBills ? 'Hide Bills' : 'View All Bills'}
        </button>
      </div>

      {showBills ? (
        <div className="bills-list">
          <div className="bills-list-header">
            <h3>All Bills</h3>
            <div className="bills-controls">
              <input
                type="text"
                placeholder="Search by bill number (e.g., MPS/00001)..."
                value={billSearchQuery}
                onChange={(e) => setBillSearchQuery(e.target.value)}
                className="bill-search-input"
              />
              <button
                className="reset-bills-btn"
                onClick={handleResetAllBills}
                title="Delete all bills"
              >
                🔄 Reset All Bills
              </button>
            </div>
          </div>
          {bills.length === 0 ? (
            <p className="no-bills">No bills generated yet.</p>
          ) : (
            <>
              {(() => {
                const filteredBills = bills.filter(bill => {
                  if (!billSearchQuery.trim()) return true;
                  const searchTerm = billSearchQuery.toLowerCase().trim();
                  const billNum = (bill.billNumber || '').toLowerCase();
                  // Also search by customer name and bill ID as fallback
                  const customerName = (bill.fullName || bill.customerName || '').toLowerCase();
                  const billId = (bill.id || '').toLowerCase();
                  return billNum.includes(searchTerm) || customerName.includes(searchTerm) || billId.includes(searchTerm);
                });
                
                return filteredBills.length === 0 ? (
                  <p className="no-bills">No bills found matching your search.</p>
                ) : (
                  <div className="bills-grid">
                    {filteredBills.map((bill) => (
                      <div key={bill.id} className="bill-card">
                        <div className="bill-card-header">
                          <h4>Bill #{bill.billNumber || bill.id.slice(0, 8)}</h4>
                          <span className="bill-date">
                            {bill.createdAt?.toDate().toLocaleDateString()}
                          </span>
                        </div>
                  <div className="bill-card-body">
                    <p><strong>Customer:</strong> {bill.fullName || bill.customerName}</p>
                    {bill.phone && (
                      <p><strong>Phone:</strong> {bill.phone}</p>
                    )}
                    {bill.date && (
                      <p><strong>Date:</strong> {bill.date}</p>
                    )}
                    <p><strong>Items:</strong> {bill.items?.length || 0}</p>
                    <p className="bill-total"><strong>Total:</strong> ₹{bill.total?.toFixed(2)}</p>
                    <div className="bill-actions">
                      <button
                        className="download-bill-btn"
                        onClick={() => downloadPDF(bill)}
                        title="Download PDF"
                      >
                        📄 Download PDF
                      </button>
                      <button
                        className="delete-bill-btn"
                        onClick={() => handleDeleteBill(bill.id)}
                        title="Delete Bill"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="bill-form">
            <div className="form-section">
              <h3>Customer Information</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    name="fullName"
                    value={billForm.fullName}
                    onChange={handleFormChange}
                    placeholder="Enter customer full name"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Date *</label>
                  <input
                    type="date"
                    name="date"
                    value={billForm.date}
                    onChange={handleFormChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="text"
                    name="phone"
                    value={billForm.phone}
                    onChange={handleFormChange}
                    placeholder="Enter phone number"
                  />
                </div>
                <div className="form-group full-width">
                  <label>Address</label>
                  <textarea
                    name="address"
                    value={billForm.address}
                    onChange={handleFormChange}
                    placeholder="Enter customer address"
                    rows="3"
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-header-with-switch">
                <h3>Add Products</h3>
                <div className="custom-product-switch">
                  <label className="switch-label">
                    <span className="switch-text">Add Custom Product</span>
                    <div className="switch-container">
                      <input
                        type="checkbox"
                        checked={customProductMode}
                        onChange={(e) => {
                          setCustomProductMode(e.target.checked);
                          if (e.target.checked) {
                            // Clear selected product when switching to custom mode
                            setSelectedProduct('');
                            setProductSearchQuery('');
                          } else {
                            // Clear custom product fields when switching back
                            setCustomProduct({
                              name: '',
                              quantity: 1,
                              price: ''
                            });
                          }
                        }}
                        className="switch-input"
                      />
                      <span className="switch-slider"></span>
                    </div>
                  </label>
                </div>
              </div>
              {customProductMode ? (
                <div className="custom-product-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Product Name *</label>
                      <input
                        type="text"
                        value={customProduct.name}
                        onChange={(e) => setCustomProduct({ ...customProduct, name: e.target.value })}
                        placeholder="Enter product name"
                        className="product-search-input"
                      />
                    </div>
                    <div className="form-group">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        min="1"
                        value={customProduct.quantity}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '' || value === '0') {
                            setCustomProduct({ ...customProduct, quantity: '' });
                          } else {
                            const numValue = parseInt(value);
                            if (!isNaN(numValue) && numValue >= 1) {
                              setCustomProduct({ ...customProduct, quantity: numValue });
                            }
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '' || parseInt(e.target.value) < 1) {
                            setCustomProduct({ ...customProduct, quantity: 1 });
                          }
                        }}
                        className="quantity-input"
                        placeholder="Enter quantity"
                      />
                    </div>
                    <div className="form-group">
                      <label>Price (₹) *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customProduct.price}
                        onChange={(e) => setCustomProduct({ ...customProduct, price: e.target.value })}
                        placeholder="Enter price"
                        className="quantity-input"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="add-product-btn"
                    onClick={handleAddCustomProduct}
                    disabled={!customProduct.name.trim() || !customProduct.price || customProduct.quantity < 1}
                  >
                    Add Custom Product
                  </button>
                </div>
              ) : (
                <div className="product-selector">
                  <div className="form-group product-search-group">
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
                          // Delay hiding dropdown to allow click
                          setTimeout(() => setShowProductDropdown(false), 200);
                        }}
                        className="product-search-input"
                      />
                      {showProductDropdown && (
                        <div className="product-dropdown">
                          {products
                            .filter(p => p.quantity > 0 && (!productSearchQuery || p.name.toLowerCase().startsWith(productSearchQuery.toLowerCase())))
                            .slice(0, 10)
                            .map((product) => (
                              <div
                                key={product.id}
                                className="product-dropdown-item"
                                onMouseDown={(e) => {
                                  e.preventDefault(); // Prevent input blur
                                  setSelectedProduct(product.id);
                                  setProductSearchQuery(product.name);
                                  setShowProductDropdown(false);
                                }}
                              >
                                <span className="product-name">{product.name}</span>
                                {product.category && (
                                  <span className="product-category">({product.category}{product.subcategory ? ` - ${product.subcategory}` : ''})</span>
                                )}
                                <span className="product-price">₹{product.price?.toFixed(2)}</span>
                                <span className="product-stock">Stock: {product.quantity}</span>
                              </div>
                            ))}
                          {products.filter(p => p.quantity > 0 && (!productSearchQuery || p.name.toLowerCase().startsWith(productSearchQuery.toLowerCase()))).length === 0 && (
                            <div className="product-dropdown-item no-results">No products found</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
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
                          setProductQuantity(1);
                        }
                      }}
                      className="quantity-input"
                      placeholder="Enter quantity"
                    />
                  </div>
                  <button
                    type="button"
                    className="add-product-btn"
                    onClick={handleAddProduct}
                    disabled={!selectedProduct}
                  >
                    Add Product
                  </button>
                </div>
              )}
            </div>

            <div className="form-section">
              <h3>Selected Products</h3>
              {cart.length === 0 ? (
                <p className="empty-cart">No products added. Select products from above.</p>
              ) : (
                <div className="cart-items">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Subcategory</th>
                        <th>Price</th>
                        <th>Quantity</th>
                        <th>Subtotal</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item) => (
                        <tr key={item.id}>
                          <td data-label="Product">{item.name}</td>
                          <td data-label="Category">{item.category || '-'}</td>
                          <td data-label="Subcategory">{item.subcategory || '-'}</td>
                          <td data-label="Price">₹{item.price?.toFixed(2)}</td>
                          <td data-label="Quantity">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const newQty = parseInt(e.target.value) || 1;
                                if (newQty > 0) {
                                  updateCartQuantity(item.id, newQty);
                                }
                              }}
                              className="quantity-input-edit"
                              style={{
                                width: '80px',
                                padding: '0.5rem',
                                border: '1px solid #ddd',
                                borderRadius: '5px',
                                textAlign: 'center',
                                fontSize: '1rem'
                              }}
                            />
                          </td>
                          <td data-label="Subtotal">₹{(item.price * item.quantity).toFixed(2)}</td>
                          <td data-label="Action">
                            <button
                              className="remove-btn"
                              onClick={() => removeFromCart(item.id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="form-section">
              <h3>Bill Summary</h3>
              <div className="bill-summary">
                <div className="summary-row">
                  <span>Subtotal:</span>
                  <span>₹{calculateSubtotal().toFixed(2)}</span>
                </div>
                <div className="form-group discount-field">
                  <label>Discount (₹)</label>
                  <input
                    type="number"
                    name="discount"
                    value={billForm.discount}
                    onChange={handleFormChange}
                    placeholder="Enter discount amount"
                    min="0"
                    step="0.01"
                  />
                </div>
                {billForm.discount && parseFloat(billForm.discount) > 0 && (
                  <div className="summary-row">
                    <span>Discount:</span>
                    <span>-₹{calculateDiscount().toFixed(2)}</span>
                  </div>
                )}
                <div className="summary-row total-row">
                  <span><strong>Total Amount:</strong></span>
                  <span><strong>₹{calculateFinalTotal().toFixed(2)}</strong></span>
                </div>
                <div className="form-group due-field">
                  <label>Due</label>
                  <input
                    type="text"
                    name="due"
                    value={billForm.due}
                    onChange={handleFormChange}
                    placeholder="Enter due amount or description (optional)"
                  />
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button
                className="generate-bill-btn"
                onClick={handleGenerateBill}
                disabled={cart.length === 0 || !billForm.fullName.trim()}
              >
                Generate Bill
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default BillGeneration;

