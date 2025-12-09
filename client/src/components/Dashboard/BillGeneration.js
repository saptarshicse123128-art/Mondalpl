import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
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
    phone: ''
  });
  const [selectedProduct, setSelectedProduct] = useState('');
  const [productQuantity, setProductQuantity] = useState(1);
  const [bills, setBills] = useState([]);
  const [showBills, setShowBills] = useState(false);
  const [generatedBill, setGeneratedBill] = useState(null);

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
      setBills(billsList.sort((a, b) => new Date(b.createdAt?.toDate()) - new Date(a.createdAt?.toDate())));
    });

    return () => unsubscribe();
  }, []);

  const handleFormChange = (e) => {
    setBillForm({
      ...billForm,
      [e.target.name]: e.target.value
    });
  };

  const handleAddProduct = async () => {
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
    } catch (error) {
      console.error('Error updating product quantity:', error);
      alert('Failed to update product stock. Please try again.');
    }
  };

  const updateCartQuantity = async (productId, newQuantity) => {
    const cartItem = cart.find(item => item.id === productId);
    if (!cartItem) return;

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
    if (cartItem) {
      // Restore stock when removing from cart
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

  const calculateSubtotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const calculateGST = () => {
    const subtotal = calculateSubtotal();
    const gstRate = parseFloat(billForm.gst) || 0;
    return (subtotal * gstRate) / 100;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateGST();
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
      const gstAmount = calculateGST();
      const total = calculateTotal();

      const billData = {
        fullName: billForm.fullName,
        date: billForm.date,
        address: billForm.address,
        phone: billForm.phone,
        gst: parseFloat(billForm.gst) || 0,
        items: cart.map(item => ({
          productId: item.id,
          productName: item.name,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.price * item.quantity
        })),
        subtotal: subtotal,
        gstAmount: gstAmount,
        total: total,
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
        phone: ''
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
      const billNumber = billToDownload.id?.slice(0, 8).toUpperCase() || 'N/A';
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
      const subtotal = parseFloat(billToDownload.subtotal || (billToDownload.total || 0));
      pdfDoc.text('Subtotal: Rs. ' + subtotal.toFixed(2), 150, finalY, { align: 'right' });
      
      if (billToDownload.gst > 0 && billToDownload.gstAmount) {
        const gstRate = parseFloat(billToDownload.gst || 0);
        const gstAmount = parseFloat(billToDownload.gstAmount || 0);
        pdfDoc.text('GST (' + gstRate.toFixed(2) + '%): Rs. ' + gstAmount.toFixed(2), 150, finalY + 7, { align: 'right' });
        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        const total = parseFloat(billToDownload.total || 0);
        pdfDoc.text('Total: Rs. ' + total.toFixed(2), 150, finalY + 15, { align: 'right' });
      } else {
        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        const total = parseFloat(billToDownload.total || subtotal);
        pdfDoc.text('Total: Rs. ' + total.toFixed(2), 150, finalY + 7, { align: 'right' });
      }
      
      // Footer
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(10);
      pdfDoc.text('Thank you for your business!', 105, finalY + 25, { align: 'center' });
      
      // Save PDF
      const fileName = `Invoice_${customerName.replace(/\s+/g, '_')}_${billDate.replace(/\//g, '-')}.pdf`;
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
          <h3>All Bills</h3>
          {bills.length === 0 ? (
            <p className="no-bills">No bills generated yet.</p>
          ) : (
            <div className="bills-grid">
              {bills.map((bill) => (
                <div key={bill.id} className="bill-card">
                  <div className="bill-card-header">
                    <h4>Bill #{bill.id.slice(0, 8)}</h4>
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
              <h3>Add Products</h3>
              <div className="product-selector">
                <div className="form-group">
                  <label>Select Product *</label>
                  <select
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="product-select"
                  >
                    <option value="">Choose a product...</option>
                    {products
                      .filter(p => p.quantity > 0)
                      .map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} {product.category ? `(${product.category}${product.subcategory ? ` - ${product.subcategory}` : ''})` : ''} - ₹{product.price?.toFixed(2)} (Stock: {product.quantity})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={productQuantity}
                    onChange={(e) => setProductQuantity(parseInt(e.target.value) || 1)}
                    className="quantity-input"
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
                          <td>{item.name}</td>
                          <td>{item.category || '-'}</td>
                          <td>{item.subcategory || '-'}</td>
                          <td>₹{item.price?.toFixed(2)}</td>
                          <td>
                            <div className="quantity-controls">
                              <button
                                onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                                className="qty-btn"
                              >
                                -
                              </button>
                              <span>{item.quantity}</span>
                              <button
                                onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                                className="qty-btn"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td>₹{(item.price * item.quantity).toFixed(2)}</td>
                          <td>
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
                <div className="form-group gst-field">
                  <label>GST (%)</label>
                  <input
                    type="number"
                    name="gst"
                    value={billForm.gst}
                    onChange={handleFormChange}
                    placeholder="Enter GST percentage (e.g., 18)"
                    min="0"
                    step="0.01"
                  />
                </div>
                {billForm.gst > 0 && (
                  <div className="summary-row">
                    <span>GST ({billForm.gst}%):</span>
                    <span>₹{calculateGST().toFixed(2)}</span>
                  </div>
                )}
                <div className="summary-row total-row">
                  <span><strong>Total Price:</strong></span>
                  <span><strong>₹{calculateTotal().toFixed(2)}</strong></span>
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

