import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  onSnapshot,
  serverTimestamp,
  deleteField
} from 'firebase/firestore';
import { db } from '../../firebase';
import { categoryService } from '../../services/firebaseService';
import { normalizeSizeNamePosition } from '../../utils/productDisplay';
import { applyMrpFieldChange, parseOptionalFloat } from '../../utils/priceMrp';
import './StockManagement.css';

const EMPTY_FORM_DATA = {
  name: '',
  price: '',
  purchasePrice: '',
  purchaseMrp: '',
  purchaseDiscount: '',
  sellingMrp: '',
  sellingDiscount: '',
  quantity: '',
  category: '',
  subcategory: '',
  hsnCode: '',
  catalogueNumber: '',
  lowStockQuantity: '',
  unit: '',
  primaryUnit: '',
  secondaryUnit: '',
  conversionFactor: ''
};

const EMPTY_VARIATION = {
  size: '',
  price: '',
  purchasePrice: '',
  purchaseMrp: '',
  purchaseDiscount: '',
  sellingMrp: '',
  sellingDiscount: '',
  quantity: '',
  lowStockQuantity: '',
  catalogueNumber: '',
  primaryUnit: '',
  secondaryUnit: '',
  conversionFactor: ''
};

function buildMrpSaveFields(enabled, mrp, discount, price) {
  if (!enabled) {
    return {
      mrp: null,
      discount: null,
      price: parseOptionalFloat(price)
    };
  }
  return {
    mrp: parseOptionalFloat(mrp),
    discount: parseOptionalFloat(discount),
    price: parseOptionalFloat(price)
  };
}

function MrpField({ label, value, onChange, onWheel, required = false, placeholder = '' }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <input
        type="number"
        value={value}
        onChange={onChange}
        onWheel={onWheel}
        step="0.01"
        min="0"
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

function MrpPricingSection({
  showToggles = true,
  enablePp,
  enableSp,
  onTogglePp,
  onToggleSp,
  purchaseMrp,
  purchaseDiscount,
  purchasePrice,
  sellingMrp,
  sellingDiscount,
  sellingPrice,
  onPurchaseChange,
  onSellingChange,
  onWheel,
  sellingPriceRequired = false
}) {
  const bothMrp = enablePp && enableSp;

  return (
    <div style={{ marginBottom: '1rem' }}>
      {showToggles && (
        <div
          className="form-row"
          style={{ marginBottom: bothMrp || enablePp || enableSp ? '0.75rem' : 0 }}
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enablePp}
                onChange={onTogglePp}
                style={{ width: 'auto', margin: 0 }}
              />
              <span><strong>Enable PP MRP System</strong></span>
            </label>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enableSp}
                onChange={onToggleSp}
                style={{ width: 'auto', margin: 0 }}
              />
              <span><strong>Enable Selling Price MRP System</strong></span>
            </label>
          </div>
        </div>
      )}

      {bothMrp ? (
        <div className="form-row-6">
          <MrpField
            label="MRP (₹)"
            value={purchaseMrp}
            onChange={(e) => onPurchaseChange('mrp', e.target.value)}
            onWheel={onWheel}
          />
          <MrpField
            label="Discount (%)"
            value={purchaseDiscount}
            onChange={(e) => onPurchaseChange('discount', e.target.value)}
            onWheel={onWheel}
          />
          <MrpField
            label="Purchase Price (₹)"
            value={purchasePrice}
            onChange={(e) => onPurchaseChange('price', e.target.value)}
            onWheel={onWheel}
          />
          <MrpField
            label="MRP (₹)"
            value={sellingMrp}
            onChange={(e) => onSellingChange('mrp', e.target.value)}
            onWheel={onWheel}
          />
          <MrpField
            label="Discount (%)"
            value={sellingDiscount}
            onChange={(e) => onSellingChange('discount', e.target.value)}
            onWheel={onWheel}
          />
          <MrpField
            label="Selling Price (₹) *"
            value={sellingPrice}
            onChange={(e) => onSellingChange('price', e.target.value)}
            onWheel={onWheel}
            required={sellingPriceRequired}
          />
        </div>
      ) : enablePp ? (
        <div className="form-row-4">
          <MrpField
            label="MRP (₹)"
            value={purchaseMrp}
            onChange={(e) => onPurchaseChange('mrp', e.target.value)}
            onWheel={onWheel}
          />
          <MrpField
            label="Discount (%)"
            value={purchaseDiscount}
            onChange={(e) => onPurchaseChange('discount', e.target.value)}
            onWheel={onWheel}
          />
          <MrpField
            label="Purchase Price (₹)"
            value={purchasePrice}
            onChange={(e) => onPurchaseChange('price', e.target.value)}
            onWheel={onWheel}
          />
          <MrpField
            label="Selling Price (₹) *"
            value={sellingPrice}
            onChange={(e) => onSellingChange('price', e.target.value)}
            onWheel={onWheel}
            required={sellingPriceRequired}
          />
        </div>
      ) : enableSp ? (
        <div className="form-row-4">
          <MrpField
            label="Purchase Price (₹)"
            value={purchasePrice}
            onChange={(e) => onPurchaseChange('price', e.target.value)}
            onWheel={onWheel}
            placeholder="Cost price"
          />
          <MrpField
            label="MRP (₹)"
            value={sellingMrp}
            onChange={(e) => onSellingChange('mrp', e.target.value)}
            onWheel={onWheel}
          />
          <MrpField
            label="Discount (%)"
            value={sellingDiscount}
            onChange={(e) => onSellingChange('discount', e.target.value)}
            onWheel={onWheel}
          />
          <MrpField
            label="Selling Price (₹) *"
            value={sellingPrice}
            onChange={(e) => onSellingChange('price', e.target.value)}
            onWheel={onWheel}
            required={sellingPriceRequired}
          />
        </div>
      ) : (
        <div className="form-row">
          <MrpField
            label="Purchase Price (₹)"
            value={purchasePrice}
            onChange={(e) => onPurchaseChange('price', e.target.value)}
            onWheel={onWheel}
            placeholder="Cost price"
          />
          <MrpField
            label="Selling Price (₹) *"
            value={sellingPrice}
            onChange={(e) => onSellingChange('price', e.target.value)}
            onWheel={onWheel}
            required={sellingPriceRequired}
          />
        </div>
      )}
    </div>
  );
}

function StockManagement() {
  const [products, setProducts] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM_DATA });
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [subcategories, setSubcategories] = useState([]);
  const [showCategoryPanel, setShowCategoryPanel] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [variationEnabled, setVariationEnabled] = useState(true);
  const [variations, setVariations] = useState([]);
  /** Per product: when true, variations use primary/secondary units and POs use secondary qty. */
  const [enableDualUnit, setEnableDualUnit] = useState(true);
  const [enablePpMrpSystem, setEnablePpMrpSystem] = useState(false);
  const [enableSpMrpSystem, setEnableSpMrpSystem] = useState(false);
  const [openVariationProductId, setOpenVariationProductId] = useState(null);
  /** Per-product setting: applies to all variations of this product on bills and POs */
  const [productSizeNamePosition, setProductSizeNamePosition] = useState('left');
  const formRef = useRef(null);

  useEffect(() => {
    // Subscribe to brands collection so form can show brand/category options
    const unsubscribeCategories = categoryService.onCategoriesChange((cats, err) => {
      if (err) {
        console.error('Failed to listen categories:', err);
        return;
      }
      setCategories(cats || []);
    });

    // Set up real-time listener for products from Firestore
    const productsCollection = collection(db, 'products');

    const unsubscribe = onSnapshot(
      productsCollection,
      (snapshot) => {
        const productsList = [];
        snapshot.forEach((doc) => {
          productsList.push({ id: doc.id, ...doc.data() });
        });
        // Sort by createdAt if available (newest first), otherwise by name
        productsList.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
            // Handle both Timestamp objects and Date objects
            const aTime = a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
            const bTime = b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
            return bTime - aTime; // Descending order
          }
          return (a.name || '').localeCompare(b.name || '');
        });
        setProducts(productsList);
        setInitialLoading(false);
      },
      (error) => {
        console.error('Error fetching products from Firestore:', error);
        setMessage({ type: 'error', text: `Failed to load products: ${error.message}` });
        setInitialLoading(false);
      }
    );

    return () => {
      unsubscribe();
      if (typeof unsubscribeCategories === 'function') unsubscribeCategories();
    };
  }, []);

  // When categories change, if current selectedCategoryId exists update its subcategories
  useEffect(() => {
    if (!selectedCategoryId) return;
    const cat = categories.find((c) => c.id === selectedCategoryId);
    setSubcategories(cat?.subcategories || []);
  }, [categories, selectedCategoryId]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handlePurchaseMrpChange = (field, value) => {
    const updated = applyMrpFieldChange(field, value, {
      mrp: formData.purchaseMrp,
      discount: formData.purchaseDiscount,
      price: formData.purchasePrice
    });

    let sellingMrp = formData.sellingMrp;
    let sellingDiscount = formData.sellingDiscount;
    let sellingPrice = formData.price;

    // Keep selling MRP in sync when purchase MRP is typed or auto-calculated
    if (updated.mrp !== formData.purchaseMrp) {
      sellingMrp = updated.mrp;
      const sellingUpdated = applyMrpFieldChange('mrp', updated.mrp, {
        mrp: updated.mrp,
        discount: formData.sellingDiscount,
        price: formData.price
      });
      sellingDiscount = sellingUpdated.discount;
      sellingPrice = sellingUpdated.price;
    }

    setFormData({
      ...formData,
      purchaseMrp: updated.mrp,
      purchaseDiscount: updated.discount,
      purchasePrice: updated.price,
      sellingMrp,
      sellingDiscount,
      price: sellingPrice
    });
  };

  const handleSellingMrpChange = (field, value) => {
    const updated = applyMrpFieldChange(field, value, {
      mrp: formData.sellingMrp,
      discount: formData.sellingDiscount,
      price: formData.price
    });

    let purchaseMrp = formData.purchaseMrp;
    let purchaseDiscount = formData.purchaseDiscount;
    let purchasePrice = formData.purchasePrice;

    // Keep purchase MRP in sync when selling MRP is typed or auto-calculated
    if (updated.mrp !== formData.sellingMrp) {
      purchaseMrp = updated.mrp;
      const purchaseUpdated = applyMrpFieldChange('mrp', updated.mrp, {
        mrp: updated.mrp,
        discount: formData.purchaseDiscount,
        price: formData.purchasePrice
      });
      purchaseDiscount = purchaseUpdated.discount;
      purchasePrice = purchaseUpdated.price;
    }

    setFormData({
      ...formData,
      sellingMrp: updated.mrp,
      sellingDiscount: updated.discount,
      price: updated.price,
      purchaseMrp,
      purchaseDiscount,
      purchasePrice
    });
  };

  const handleVariationMrpChange = (index, type, field, value) => {
    const variation = variations[index];
    const mrpKey = type === 'purchase' ? 'purchaseMrp' : 'sellingMrp';
    const otherMrpKey = type === 'purchase' ? 'sellingMrp' : 'purchaseMrp';
    const discountKey = type === 'purchase' ? 'purchaseDiscount' : 'sellingDiscount';
    const otherDiscountKey = type === 'purchase' ? 'sellingDiscount' : 'purchaseDiscount';
    const priceKey = type === 'purchase' ? 'purchasePrice' : 'price';
    const otherPriceKey = type === 'purchase' ? 'price' : 'purchasePrice';

    const updated = applyMrpFieldChange(field, value, {
      mrp: variation[mrpKey] || '',
      discount: variation[discountKey] || '',
      price: variation[priceKey] || ''
    });

    const patch = {
      [mrpKey]: updated.mrp,
      [discountKey]: updated.discount,
      [priceKey]: updated.price
    };

    // Sync the other side's MRP when this side's MRP changes (typed or calculated)
    if (updated.mrp !== (variation[mrpKey] || '')) {
      patch[otherMrpKey] = updated.mrp;
      const otherUpdated = applyMrpFieldChange('mrp', updated.mrp, {
        mrp: updated.mrp,
        discount: variation[otherDiscountKey] || '',
        price: variation[otherPriceKey] || ''
      });
      patch[otherDiscountKey] = otherUpdated.discount;
      patch[otherPriceKey] = otherUpdated.price;
    }

    const updatedVariations = [...variations];
    updatedVariations[index] = {
      ...updatedVariations[index],
      ...patch
    };
    setVariations(updatedVariations);
  };

  // Prevent number input from changing value on scroll
  const handleNumberInputWheel = (e) => {
    e.target.blur();
  };

  const handleCategorySelect = (e) => {
    const catId = e.target.value;
    setSelectedCategoryId(catId);
    const cat = categories.find((c) => c.id === catId);
    setSubcategories(cat?.subcategories || []);
    // Keep product.category as the category name for storage
    setFormData({ ...formData, category: cat ? cat.name : '' , subcategory: '' });
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    
    try {
      // Add product to Firestore
      // Use selected category name when available
      const categoryName = (() => {
        const cat = categories.find((c) => c.id === selectedCategoryId);
        return cat ? cat.name : formData.category.trim();
      })();

      const productData = {
        name: formData.name.trim(),
        category: categoryName,
        subcategory: formData.subcategory?.trim() || '',
        hsnCode: formData.hsnCode?.trim() || '',
        enablePpMrpSystem: Boolean(enablePpMrpSystem),
        enableSpMrpSystem: Boolean(enableSpMrpSystem),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const ppFields = buildMrpSaveFields(
        enablePpMrpSystem,
        formData.purchaseMrp,
        formData.purchaseDiscount,
        formData.purchasePrice
      );
      productData.purchasePrice = ppFields.price;
      if (enablePpMrpSystem) {
        productData.purchaseMrp = ppFields.mrp;
        productData.purchaseDiscount = ppFields.discount;
      }

      // If variations are enabled, save variations instead of single price/quantity
      if (variationEnabled && variations.length > 0) {
        // Validate variations
        const validVariations = variations
          .filter(v => v.size && v.price && v.quantity)
          .map(v => {
            const pp = buildMrpSaveFields(
              enablePpMrpSystem,
              v.purchaseMrp,
              v.purchaseDiscount,
              v.purchasePrice
            );
            const sp = buildMrpSaveFields(
              enableSpMrpSystem,
              v.sellingMrp,
              v.sellingDiscount,
              v.price
            );
            return {
              size: v.size.trim(),
              price: sp.price,
              purchasePrice: pp.price,
              quantity: parseInt(v.quantity),
              lowStockQuantity: v.lowStockQuantity ? parseInt(v.lowStockQuantity) : null,
              catalogueNumber: v.catalogueNumber?.trim() || '',
              ...(enablePpMrpSystem
                ? { purchaseMrp: pp.mrp, purchaseDiscount: pp.discount }
                : {}),
              ...(enableSpMrpSystem
                ? { sellingMrp: sp.mrp, sellingDiscount: sp.discount }
                : {}),
              ...(enableDualUnit
                ? {
                    primaryUnit: v.primaryUnit?.trim() || '',
                    secondaryUnit: v.secondaryUnit?.trim() || '',
                    conversionFactor: v.conversionFactor ? parseFloat(v.conversionFactor) : null
                  }
                : {})
            };
          });
        
        if (validVariations.length === 0) {
          setMessage({ type: 'error', text: 'Please add at least one valid variation with size, price, and quantity' });
          setLoading(false);
          return;
        }
        if (enableDualUnit) {
          const invalidDualUnit = validVariations.some(
            (v) => !v.primaryUnit || !v.secondaryUnit || !v.conversionFactor || v.conversionFactor <= 0
          );
          if (invalidDualUnit) {
            setMessage({ type: 'error', text: 'Each variation must have primary unit, secondary unit, and conversion factor greater than 0.' });
            setLoading(false);
            return;
          }
        }
        
        productData.variations = validVariations;
        // Calculate total quantity from all variations
        productData.quantity = validVariations.reduce((sum, v) => sum + (v.quantity || 0), 0);
        // Use first variation's price as base price (or calculate average)
        productData.price = validVariations[0].price;
        // Unit is at product level, same for all variations
        productData.unit = formData.unit?.trim() || '';
        productData.sizeNamePosition = normalizeSizeNamePosition(productSizeNamePosition);
        productData.enableDualUnit = Boolean(enableDualUnit);
      } else {
        // Single product without variations
        const spFields = buildMrpSaveFields(
          enableSpMrpSystem,
          formData.sellingMrp,
          formData.sellingDiscount,
          formData.price
        );
        productData.price = spFields.price;
        if (enableSpMrpSystem) {
          productData.sellingMrp = spFields.mrp;
          productData.sellingDiscount = spFields.discount;
        }
        productData.quantity = parseInt(formData.quantity);
        productData.catalogueNumber = formData.catalogueNumber?.trim() || '';
        productData.lowStockQuantity = formData.lowStockQuantity ? parseInt(formData.lowStockQuantity) : null;
        productData.unit = formData.unit?.trim() || '';
        productData.enableDualUnit = Boolean(enableDualUnit);
        if (enableDualUnit) {
          if (!formData.primaryUnit?.trim() || !formData.secondaryUnit?.trim() || !formData.conversionFactor || parseFloat(formData.conversionFactor) <= 0) {
            setMessage({ type: 'error', text: 'Dual unit requires Primary Unit, Secondary Unit, and Conversion Factor > 0.' });
            setLoading(false);
            return;
          }
          productData.primaryUnit = formData.primaryUnit.trim();
          productData.secondaryUnit = formData.secondaryUnit.trim();
          productData.conversionFactor = parseFloat(formData.conversionFactor);
        }
      }

      await addDoc(collection(db, 'products'), productData);
      
      setFormData({ ...EMPTY_FORM_DATA });
      setSelectedCategoryId('');
      setVariationEnabled(true);
      setVariations([]);
      setProductSizeNamePosition('left');
      setEnableDualUnit(true);
      setEnablePpMrpSystem(false);
      setEnableSpMrpSystem(false);
      setShowAddForm(false);
      setMessage({ type: 'success', text: 'Product added successfully!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error adding product to Firestore:', error);
      setMessage({ type: 'error', text: `Failed to add product: ${error.message}` });
    }
    setLoading(false);
  };

  const handleDeleteProduct = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
        setMessage({ type: 'success', text: 'Product deleted successfully!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      } catch (error) {
        console.error('Error deleting product from Firestore:', error);
        setMessage({ type: 'error', text: `Failed to delete product: ${error.message}` });
      }
    }
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product.id);
    setFormData({
      name: product.name || '',
      price: product.price?.toString() || '',
      purchasePrice: product.purchasePrice?.toString() || '',
      purchaseMrp: product.purchaseMrp?.toString() || '',
      purchaseDiscount: product.purchaseDiscount?.toString() || '',
      sellingMrp: product.sellingMrp?.toString() || '',
      sellingDiscount: product.sellingDiscount?.toString() || '',
      quantity: product.quantity?.toString() || '',
      category: product.category || '',
      subcategory: product.subcategory || '',
      hsnCode: product.hsnCode || '',
      catalogueNumber: product.catalogueNumber || '',
      lowStockQuantity: product.lowStockQuantity?.toString() || '',
      unit: product.unit || '',
      primaryUnit: product.primaryUnit || '',
      secondaryUnit: product.secondaryUnit || '',
      conversionFactor: product.conversionFactor?.toString() || ''
    });
    // Load variations if they exist
    if (product.variations && Array.isArray(product.variations) && product.variations.length > 0) {
      setVariationEnabled(true);
      setVariations(product.variations.map(v => ({
        size: v.size || '',
        price: v.price?.toString() || '',
        purchasePrice: v.purchasePrice?.toString() || '',
        purchaseMrp: v.purchaseMrp?.toString() || '',
        purchaseDiscount: v.purchaseDiscount?.toString() || '',
        sellingMrp: v.sellingMrp?.toString() || '',
        sellingDiscount: v.sellingDiscount?.toString() || '',
        quantity: v.quantity?.toString() || '',
        lowStockQuantity: v.lowStockQuantity?.toString() || '',
        catalogueNumber: v.catalogueNumber || '',
        primaryUnit: v.primaryUnit || product.unit || '',
        secondaryUnit: v.secondaryUnit || '',
        conversionFactor: v.conversionFactor?.toString() || ''
      })));
    } else {
      setVariationEnabled(false);
      setVariations([]);
    }
    setEnableDualUnit(product.enableDualUnit === undefined ? true : Boolean(product.enableDualUnit));
    setEnablePpMrpSystem(Boolean(product.enablePpMrpSystem));
    setEnableSpMrpSystem(Boolean(product.enableSpMrpSystem));
    setProductSizeNamePosition(normalizeSizeNamePosition(product.sizeNamePosition));
    // try to find category id by name
    const matched = categories.find((c) => c.name === (product.category || ''));
    if (matched) {
      setSelectedCategoryId(matched.id);
      setSubcategories(matched.subcategories || []);
    } else {
      setSelectedCategoryId('');
      setSubcategories([]);
    }
    setShowAddForm(true);
    // Scroll to form after a short delay to ensure DOM is updated
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    
    try {
      const productRef = doc(db, 'products', editingProduct);
      const categoryName = (() => {
        const cat = categories.find((c) => c.id === selectedCategoryId);
        return cat ? cat.name : formData.category.trim();
      })();

      const updateData = {
        name: formData.name.trim(),
        category: categoryName,
        subcategory: formData.subcategory?.trim() || '',
        hsnCode: formData.hsnCode?.trim() || '',
        enablePpMrpSystem: Boolean(enablePpMrpSystem),
        enableSpMrpSystem: Boolean(enableSpMrpSystem),
        updatedAt: serverTimestamp()
      };

      const ppFields = buildMrpSaveFields(
        enablePpMrpSystem,
        formData.purchaseMrp,
        formData.purchaseDiscount,
        formData.purchasePrice
      );
      updateData.purchasePrice = ppFields.price;
      if (enablePpMrpSystem) {
        updateData.purchaseMrp = ppFields.mrp;
        updateData.purchaseDiscount = ppFields.discount;
      } else {
        updateData.purchaseMrp = deleteField();
        updateData.purchaseDiscount = deleteField();
      }

      // If variations are enabled, save variations instead of single price/quantity
      if (variationEnabled && variations.length > 0) {
        // Validate variations
        const validVariations = variations
          .filter(v => v.size && v.price && v.quantity)
          .map(v => {
            const pp = buildMrpSaveFields(
              enablePpMrpSystem,
              v.purchaseMrp,
              v.purchaseDiscount,
              v.purchasePrice
            );
            const sp = buildMrpSaveFields(
              enableSpMrpSystem,
              v.sellingMrp,
              v.sellingDiscount,
              v.price
            );
            return {
              size: v.size.trim(),
              price: sp.price,
              purchasePrice: pp.price,
              quantity: parseInt(v.quantity),
              lowStockQuantity: v.lowStockQuantity ? parseInt(v.lowStockQuantity) : null,
              catalogueNumber: v.catalogueNumber?.trim() || '',
              ...(enablePpMrpSystem
                ? { purchaseMrp: pp.mrp, purchaseDiscount: pp.discount }
                : {}),
              ...(enableSpMrpSystem
                ? { sellingMrp: sp.mrp, sellingDiscount: sp.discount }
                : {}),
              ...(enableDualUnit
                ? {
                    primaryUnit: v.primaryUnit?.trim() || '',
                    secondaryUnit: v.secondaryUnit?.trim() || '',
                    conversionFactor: v.conversionFactor ? parseFloat(v.conversionFactor) : null
                  }
                : {})
            };
          });
        
        if (validVariations.length === 0) {
          setMessage({ type: 'error', text: 'Please add at least one valid variation with size, price, and quantity' });
          setLoading(false);
          return;
        }
        if (enableDualUnit) {
          const invalidDualUnit = validVariations.some(
            (v) => !v.primaryUnit || !v.secondaryUnit || !v.conversionFactor || v.conversionFactor <= 0
          );
          if (invalidDualUnit) {
            setMessage({ type: 'error', text: 'Each variation must have primary unit, secondary unit, and conversion factor greater than 0.' });
            setLoading(false);
            return;
          }
        }
        
        updateData.variations = validVariations;
        // Calculate total quantity from all variations
        updateData.quantity = validVariations.reduce((sum, v) => sum + (v.quantity || 0), 0);
        // Use first variation's price as base price
        updateData.price = validVariations[0].price;
        // Unit is at product level, same for all variations
        updateData.unit = formData.unit?.trim() || '';
        updateData.sizeNamePosition = normalizeSizeNamePosition(productSizeNamePosition);
        updateData.enableDualUnit = Boolean(enableDualUnit);
      } else {
        // Single product without variations
        const spFields = buildMrpSaveFields(
          enableSpMrpSystem,
          formData.sellingMrp,
          formData.sellingDiscount,
          formData.price
        );
        updateData.price = spFields.price;
        if (enableSpMrpSystem) {
          updateData.sellingMrp = spFields.mrp;
          updateData.sellingDiscount = spFields.discount;
        } else {
          updateData.sellingMrp = deleteField();
          updateData.sellingDiscount = deleteField();
        }
        updateData.quantity = parseInt(formData.quantity);
        updateData.catalogueNumber = formData.catalogueNumber?.trim() || '';
        updateData.lowStockQuantity = formData.lowStockQuantity ? parseInt(formData.lowStockQuantity) : null;
        updateData.unit = formData.unit?.trim() || '';
        updateData.enableDualUnit = Boolean(enableDualUnit);
        if (enableDualUnit) {
          if (!formData.primaryUnit?.trim() || !formData.secondaryUnit?.trim() || !formData.conversionFactor || parseFloat(formData.conversionFactor) <= 0) {
            setMessage({ type: 'error', text: 'Dual unit requires Primary Unit, Secondary Unit, and Conversion Factor > 0.' });
            setLoading(false);
            return;
          }
          updateData.primaryUnit = formData.primaryUnit.trim();
          updateData.secondaryUnit = formData.secondaryUnit.trim();
          updateData.conversionFactor = parseFloat(formData.conversionFactor);
        } else {
          updateData.primaryUnit = deleteField();
          updateData.secondaryUnit = deleteField();
          updateData.conversionFactor = deleteField();
        }
        // Remove variations if switching from variations to single product
        updateData.variations = null;
        updateData.sizeNamePosition = deleteField();
      }

      await updateDoc(productRef, updateData);
      
      setFormData({ ...EMPTY_FORM_DATA });
      setSelectedCategoryId('');
      setVariationEnabled(true);
      setVariations([]);
      setProductSizeNamePosition('left');
      setEnableDualUnit(true);
      setEnablePpMrpSystem(false);
      setEnableSpMrpSystem(false);
      setShowAddForm(false);
      setEditingProduct(null);
      setMessage({ type: 'success', text: 'Product updated successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error updating product in Firestore:', error);
      setMessage({ type: 'error', text: `Failed to update product: ${error.message}` });
    }
    setLoading(false);
  };

  const handleCancel = () => {
    setFormData({ ...EMPTY_FORM_DATA });
    setShowAddForm(false);
    setEditingProduct(null);
    setMessage({ type: '', text: '' });
    setVariationEnabled(true);
    setVariations([]);
    setProductSizeNamePosition('left');
    setEnableDualUnit(true);
    setEnablePpMrpSystem(false);
    setEnableSpMrpSystem(false);
  };

  // Variation management helpers
  const handleAddVariation = () => {
    setVariations([...variations, { ...EMPTY_VARIATION, primaryUnit: formData.unit || '' }]);
  };

  const handleRemoveVariation = (index) => {
    setVariations(variations.filter((_, i) => i !== index));
  };

  const handleVariationChange = (index, field, value) => {
    const updatedVariations = [...variations];
    updatedVariations[index] = {
      ...updatedVariations[index],
      [field]: value
    };
    setVariations(updatedVariations);
  };

  // Brand & Category management helpers
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return setMessage({ type: 'error', text: 'Brand name required' });
    try {
      await categoryService.addCategory(newCategoryName.trim());
      setNewCategoryName('');
      setMessage({ type: 'success', text: 'Brand added' });
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (err) {
      console.error('Add brand failed', err);
      setMessage({ type: 'error', text: 'Failed to add brand' });
    }
  };

  const handleAddSubcategory = async (categoryId) => {
    const name = newSubcategoryName.trim();
    if (!categoryId || !name) return setMessage({ type: 'error', text: 'Select brand and enter category' });
    try {
      await categoryService.addSubcategory(categoryId, name);
      setNewSubcategoryName('');
      setMessage({ type: 'success', text: 'Category added' });
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (err) {
      console.error('Add category failed', err);
      setMessage({ type: 'error', text: 'Failed to add category' });
    }
  };

  // Optimized search function that handles:
  // 1. Partial word matching (missing words don't break search)
  // 2. Word order independence
  // 3. Ignoring spaces (e.g., "WaterTank" matches "Water Tank")
  // 4. Handling numbers in parentheses (e.g., "75" matches "(75 mm)", "75mm" matches "(75 mm)")
  const matchesSearch = (text, query) => {
    if (!text || !query) return false;
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    // Normalize: remove parentheses, spaces, and keep alphanumeric characters
    // This allows "75mm" to match "(75 mm)" and "75" to match "(75 mm)"
    const normalizeText = (str) => {
      return str.replace(/[()\s]+/g, '').toLowerCase();
    };
    
    const normalizedText = normalizeText(lowerText);
    const normalizedQuery = normalizeText(lowerQuery);
    
    // For single-word queries (like "pump"), check if it appears as a whole substring first
    // This prevents "p" from matching "P Trap" - we need the whole word "pump"
    if (!lowerQuery.includes(' ') && lowerQuery.length >= 2) {
      // Single word query - must appear as a whole substring
      if (lowerText.includes(lowerQuery) || normalizedText.includes(normalizedQuery)) {
        return true;
      }
      // For single-word queries, if it doesn't match as a whole, don't continue
      return false;
    }
    
    // For multi-word queries, first check if normalized query appears in normalized text
    if (normalizedText.includes(normalizedQuery)) return true;
    
    // Extract words and numbers separately (for multi-word queries)
    const queryWords = lowerQuery
      .split(/\s+/) // Split by spaces only
      .filter(word => word.length > 0)
      .map(word => word.replace(/[()]/g, '')) // Remove parentheses from individual words
      .filter(word => word.length >= 2); // Ignore single letters (require at least 2 chars)
    
    if (queryWords.length === 0) return false;
    
    // Normalize text words similarly
    const textWords = lowerText
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word.replace(/[()]/g, ''))
      .filter(word => word.length > 0);
    
    // Check if each query word appears in the text (with or without spaces, parentheses)
    const matchedWords = queryWords.filter(queryWord => {
      const normalizedQueryWord = normalizeText(queryWord);
      
      // Check in normalized text
      if (normalizedText.includes(normalizedQueryWord)) return true;
      
      // Check in text with spaces
      if (lowerText.includes(queryWord)) return true;
      
      // Check if query word is part of any text word
      return textWords.some(textWord => {
        const normalizedTextWord = normalizeText(textWord);
        return normalizedTextWord.includes(normalizedQueryWord) || 
               normalizedQueryWord.includes(normalizedTextWord) ||
               textWord.includes(queryWord) || 
               queryWord.includes(textWord);
      });
    });
    
    // Match if at least 70% of words are found (handles missing words like "type")
    const matchThreshold = Math.max(1, Math.ceil(queryWords.length * 0.7));
    return matchedWords.length >= matchThreshold;

  };

  // Calculate relevance score for sorting
  const calculateRelevanceScore = (product, query) => {
    if (!query.trim()) return 0;
    
    const lowerQuery = query.toLowerCase().trim();
    const lowerName = (product.name || '').toLowerCase();
    const lowerCategory = (product.category || '').toLowerCase();
    const lowerSubcategory = (product.subcategory || '').toLowerCase();
    
    let score = 0;
    
    // Exact phrase match in name (highest priority)
    if (lowerName.includes(lowerQuery)) {
      score += 1000;
      // Bonus if it starts with the query
      if (lowerName.startsWith(lowerQuery)) {
        score += 500;
      }
    }
    
    // Check if query words appear in order in name
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 0);
    const nameWords = lowerName.split(/\s+/);
    
    if (queryWords.length > 1) {
      // Check if words appear in order
      let wordIndex = 0;
      for (let i = 0; i < nameWords.length && wordIndex < queryWords.length; i++) {
        if (nameWords[i].includes(queryWords[wordIndex])) {
          wordIndex++;
        }
      }
      if (wordIndex === queryWords.length) {
        score += 800;
        // Bonus if words are adjacent
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
    
    // All query words appear in name (even if not in order)
    const allWordsMatch = queryWords.every(qw => 
      nameWords.some(nw => nw.includes(qw) || qw.includes(nw))
    );
    if (allWordsMatch) {
      score += 400;
    }
    
    // Category matches
    if (lowerCategory.includes(lowerQuery)) {
      score += 200;
    }
    if (lowerSubcategory.includes(lowerQuery)) {
      score += 150;
    }
    
    // Partial matches in name
    queryWords.forEach(qw => {
      if (lowerName.includes(qw)) {
        score += 100;
      }
    });
    
    return score;
  };

  // Filter and sort products based on search query
  const filteredProducts = (() => {
    if (!searchQuery.trim()) return products;
    
    const query = searchQuery.trim();
    
    // Filter products that match the search
    const matching = products.filter(product => {
      return (
        matchesSearch(product.name, query) ||
        matchesSearch(product.category, query) ||
        matchesSearch(product.subcategory, query) ||
        matchesSearch(product.description, query) ||
        product.price?.toString().includes(query)
      );
    });
    
    // Sort by relevance score (highest first)
    return matching.sort((a, b) => {
      const scoreA = calculateRelevanceScore(a, query);
      const scoreB = calculateRelevanceScore(b, query);
      return scoreB - scoreA; // Descending order
    });
  })();

  return (
    <div className="stock-management">
      <div className="stock-header">
        <h2>Stock Management</h2>
        <button
          className="add-product-btn"
          onClick={() => {
            if (showAddForm) {
              handleCancel();
            } else {
              setShowAddForm(true);
              setEditingProduct(null);
              // When adding a fresh product, start with one default variation row
              setVariationEnabled(true);
              setProductSizeNamePosition('left');
              setEnableDualUnit(true);
              setEnablePpMrpSystem(false);
              setEnableSpMrpSystem(false);
              setVariations([{ ...EMPTY_VARIATION }]);
              setFormData({ ...EMPTY_FORM_DATA });
              setSelectedCategoryId('');
              setSubcategories([]);
              // Scroll to form after a short delay to ensure DOM is updated
              setTimeout(() => {
                if (formRef.current) {
                  formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }, 100);
            }
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add New Product'}
        </button>
      </div>

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {showAddForm && (
        <div className="add-product-form" ref={formRef}>
          <h3>{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
          <form onSubmit={editingProduct ? handleUpdateProduct : handleAddProduct}>
            {variationEnabled ? (
              <>
                {/* When Variations Enabled: Product Name, Brand, HSN Code, Unit in first row */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Product Name *</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Brand</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select
                        name="categoryId"
                        value={selectedCategoryId}
                        onChange={handleCategorySelect}
                      >
                        <option value="">Select brand</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <select
                        name="subcategory"
                        value={formData.subcategory}
                        onChange={handleInputChange}
                        style={{ minWidth: 160 }}
                      >
                        <option value="">No category</option>
                        {subcategories.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button type="button" className="small-btn" onClick={() => setShowCategoryPanel((v) => !v)}>
                        Manage
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>HSN Code</label>
                    <input
                      type="text"
                      name="hsnCode"
                      value={formData.hsnCode}
                      onChange={handleInputChange}
                      placeholder="Enter HSN code"
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input
                      type="text"
                      name="unit"
                      value={formData.unit}
                      onChange={handleInputChange}
                      placeholder="e.g., kg, pcs, liters"
                    />
                  </div>
                </div>
                <div
                  className="form-row"
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}
                >
                  <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        checked={variationEnabled}
                        onChange={(e) => {
                          setVariationEnabled(e.target.checked);
                          if (!e.target.checked) {
                            setVariations([]);
                          } else {
                            if (variations.length === 0) {
                              setVariations([{ ...EMPTY_VARIATION, primaryUnit: formData.unit || '' }]);
                            }
                            setEnableDualUnit(true);
                          }
                        }}
                        style={{ width: 'auto', margin: 0 }}
                      />
                      <span>Enable Variations</span>
                    </label>
                  </div>
                  <div className="form-group" style={{ flex: '1 1 260px', marginBottom: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={enableDualUnit}
                        onChange={(e) => setEnableDualUnit(e.target.checked)}
                        disabled={!variationEnabled}
                        style={{ width: 'auto', marginTop: '3px' }}
                      />
                      <span>
                        <strong>Enable dual unit</strong>
                        <span style={{ display: 'block', fontSize: '0.82rem', color: '#555', fontWeight: 400, marginTop: '4px' }}>
                          Secondary unit + conversion to primary stock; purchase orders use secondary qty.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* When Variations Disabled: Two column layout matching the image */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Product Name *</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Brand</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select
                        name="categoryId"
                        value={selectedCategoryId}
                        onChange={handleCategorySelect}
                      >
                        <option value="">Select brand</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <select
                        name="subcategory"
                        value={formData.subcategory}
                        onChange={handleInputChange}
                        style={{ minWidth: 160 }}
                      >
                        <option value="">No category</option>
                        {subcategories.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button type="button" className="small-btn" onClick={() => setShowCategoryPanel((v) => !v)}>
                        Manage
                      </button>
                    </div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>HSN Code</label>
                    <input
                      type="text"
                      name="hsnCode"
                      value={formData.hsnCode}
                      onChange={handleInputChange}
                      placeholder="Enter HSN code"
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input
                      type="text"
                      name="unit"
                      value={formData.unit}
                      onChange={handleInputChange}
                      placeholder="e.g., kg, pcs, liters"
                    />
                  </div>
                </div>
                <div className="form-options-row">
                  <div className="form-group toggle-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        checked={variationEnabled}
                        onChange={(e) => {
                          setVariationEnabled(e.target.checked);
                          if (!e.target.checked) {
                            setVariations([]);
                          } else {
                            if (variations.length === 0) {
                              setVariations([{ ...EMPTY_VARIATION, primaryUnit: formData.unit || '' }]);
                            }
                            setEnableDualUnit(true);
                          }
                        }}
                        style={{ width: 'auto', margin: 0 }}
                      />
                      <span>Enable Variations</span>
                    </label>
                  </div>
                  <div className="form-group toggle-group">
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={enableDualUnit}
                        onChange={(e) => setEnableDualUnit(e.target.checked)}
                        style={{ width: 'auto', marginTop: '3px' }}
                      />
                      <span>
                        <strong>Enable dual unit</strong>
                        <span style={{ display: 'block', fontSize: '0.82rem', color: '#555', fontWeight: 400, marginTop: '4px' }}>
                          Secondary unit + conversion factor (e.g. sell by box, stock in pcs).
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
                <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
                  <div className="form-group" style={{ maxWidth: '220px', marginBottom: 0 }}>
                    <label>Quantity *</label>
                    <input
                      type="number"
                      name="quantity"
                      value={formData.quantity}
                      onChange={handleInputChange}
                      onWheel={handleNumberInputWheel}
                      min="0"
                      required={!variationEnabled}
                    />
                  </div>
                </div>
                <MrpPricingSection
                  enablePp={enablePpMrpSystem}
                  enableSp={enableSpMrpSystem}
                  onTogglePp={(e) => setEnablePpMrpSystem(e.target.checked)}
                  onToggleSp={(e) => setEnableSpMrpSystem(e.target.checked)}
                  purchaseMrp={formData.purchaseMrp}
                  purchaseDiscount={formData.purchaseDiscount}
                  purchasePrice={formData.purchasePrice}
                  sellingMrp={formData.sellingMrp}
                  sellingDiscount={formData.sellingDiscount}
                  sellingPrice={formData.price}
                  onPurchaseChange={handlePurchaseMrpChange}
                  onSellingChange={handleSellingMrpChange}
                  onWheel={handleNumberInputWheel}
                  sellingPriceRequired={!variationEnabled}
                />
                <div className="form-row">
                  <div className="form-group">
                    <label>Low Stock Quantity</label>
                    <input
                      type="number"
                      name="lowStockQuantity"
                      value={formData.lowStockQuantity}
                      onChange={handleInputChange}
                      onWheel={handleNumberInputWheel}
                      min="0"
                      placeholder="Alert threshold"
                    />
                  </div>
                  <div className="form-group">
                    <label>Catalogue Number</label>
                    <input
                      type="text"
                      name="catalogueNumber"
                      value={formData.catalogueNumber}
                      onChange={handleInputChange}
                      placeholder="Enter catalogue number"
                    />
                  </div>
                </div>
                {enableDualUnit && (
                  <div className="form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className="form-group">
                      <label>Primary Unit *</label>
                      <input
                        type="text"
                        name="primaryUnit"
                        value={formData.primaryUnit}
                        onChange={handleInputChange}
                        placeholder="e.g., piece, kg"
                        required={enableDualUnit}
                      />
                    </div>
                    <div className="form-group">
                      <label>Secondary Unit *</label>
                      <input
                        type="text"
                        name="secondaryUnit"
                        value={formData.secondaryUnit}
                        onChange={handleInputChange}
                        placeholder="e.g., box, carton"
                        required={enableDualUnit}
                      />
                    </div>
                    <div className="form-group">
                      <label>Conversion Factor *</label>
                      <input
                        type="number"
                        name="conversionFactor"
                        value={formData.conversionFactor}
                        onChange={handleInputChange}
                        onWheel={handleNumberInputWheel}
                        min="0.0001"
                        step="0.0001"
                        placeholder="e.g., 20 (1 box = 20 pcs)"
                        required={enableDualUnit}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
            
            {variationEnabled ? (
              <div className="variations-section" style={{ marginTop: '15px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ fontWeight: 'bold' }}>Product Variations</label>
                </div>
                <div
                  style={{
                    marginBottom: '14px',
                    padding: '10px 12px',
                    background: '#f0f4ff',
                    borderRadius: '6px',
                    border: '1px solid #dde4f7',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>Size name on bills &amp; purchase orders</div>
                    <div style={{ fontSize: '0.88rem', color: '#555' }}>
                      For <strong>this product only</strong>: size before or after the name for <strong>every variation</strong> (not a global setting).
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid #ccc'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setProductSizeNamePosition('left')}
                      style={{
                        padding: '8px 14px',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        background: productSizeNamePosition === 'left' ? '#667eea' : '#fff',
                        color: productSizeNamePosition === 'left' ? '#fff' : '#333'
                      }}
                    >
                      Left
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductSizeNamePosition('right')}
                      style={{
                        padding: '8px 14px',
                        border: 'none',
                        borderLeft: '1px solid #ccc',
                        cursor: 'pointer',
                        fontWeight: 600,
                        background: productSizeNamePosition === 'right' ? '#667eea' : '#fff',
                        color: productSizeNamePosition === 'right' ? '#fff' : '#333'
                      }}
                    >
                      Right
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    marginBottom: '14px',
                    padding: '10px 12px',
                    background: '#f9f9f9',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '20px',
                    alignItems: 'center'
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={enablePpMrpSystem}
                      onChange={(e) => setEnablePpMrpSystem(e.target.checked)}
                      style={{ width: 'auto', margin: 0 }}
                    />
                    <span><strong>Enable PP MRP System</strong></span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={enableSpMrpSystem}
                      onChange={(e) => setEnableSpMrpSystem(e.target.checked)}
                      style={{ width: 'auto', margin: 0 }}
                    />
                    <span><strong>Enable Selling Price MRP System</strong></span>
                  </label>
                </div>
                
                {variations.length === 0 ? (
                  <p style={{ color: '#666', fontStyle: 'italic' }}>No variations added. Click "Add New Variation" button below to add one.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {variations.map((variation, index) => (
                      <div
                        key={index}
                        style={{
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          padding: '15px',
                          backgroundColor: '#f9f9f9'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <strong>Variation {index + 1}</strong>
                          <button
                            type="button"
                            onClick={() => handleRemoveVariation(index)}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label>Size *</label>
                            <input
                              type="text"
                              value={variation.size}
                              onChange={(e) => handleVariationChange(index, 'size', e.target.value)}
                              placeholder="e.g., Small, Medium, Large, 1/2 inch, etc."
                              required
                            />
                          </div>
                        </div>
                        <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
                          <div className="form-group" style={{ maxWidth: '220px', marginBottom: 0 }}>
                            <label>Quantity *</label>
                            <input
                              type="number"
                              value={variation.quantity}
                              onChange={(e) => handleVariationChange(index, 'quantity', e.target.value)}
                              onWheel={handleNumberInputWheel}
                              min="0"
                              required
                            />
                          </div>
                        </div>
                        <MrpPricingSection
                          showToggles={false}
                          enablePp={enablePpMrpSystem}
                          enableSp={enableSpMrpSystem}
                          purchaseMrp={variation.purchaseMrp || ''}
                          purchaseDiscount={variation.purchaseDiscount || ''}
                          purchasePrice={variation.purchasePrice || ''}
                          sellingMrp={variation.sellingMrp || ''}
                          sellingDiscount={variation.sellingDiscount || ''}
                          sellingPrice={variation.price || ''}
                          onPurchaseChange={(field, value) => handleVariationMrpChange(index, 'purchase', field, value)}
                          onSellingChange={(field, value) => handleVariationMrpChange(index, 'selling', field, value)}
                          onWheel={handleNumberInputWheel}
                          sellingPriceRequired
                        />
                        <div className="form-row">
                          <div className="form-group">
                            <label>Low Stock Quantity</label>
                            <input
                              type="number"
                              value={variation.lowStockQuantity || ''}
                              onChange={(e) => handleVariationChange(index, 'lowStockQuantity', e.target.value)}
                              onWheel={handleNumberInputWheel}
                              min="0"
                              placeholder="Alert threshold"
                            />
                          </div>
                          <div className="form-group">
                            <label>Catalogue Number</label>
                            <input
                              type="text"
                              value={variation.catalogueNumber || ''}
                              onChange={(e) => handleVariationChange(index, 'catalogueNumber', e.target.value)}
                              placeholder="Enter catalogue number"
                            />
                          </div>
                        </div>
                        {enableDualUnit && (
                          <div className="form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                            <div className="form-group">
                              <label>Primary Unit *</label>
                              <input
                                type="text"
                                value={variation.primaryUnit || ''}
                                onChange={(e) => handleVariationChange(index, 'primaryUnit', e.target.value)}
                                placeholder="e.g., piece"
                                required={enableDualUnit}
                              />
                            </div>
                            <div className="form-group">
                              <label>Secondary Unit *</label>
                              <input
                                type="text"
                                value={variation.secondaryUnit || ''}
                                onChange={(e) => handleVariationChange(index, 'secondaryUnit', e.target.value)}
                                placeholder="e.g., box"
                                required={enableDualUnit}
                              />
                            </div>
                            <div className="form-group">
                              <label>Conversion Factor *</label>
                              <input
                                type="number"
                                value={variation.conversionFactor || ''}
                                onChange={(e) => handleVariationChange(index, 'conversionFactor', e.target.value)}
                                onWheel={handleNumberInputWheel}
                                min="0.0001"
                                step="0.0001"
                                placeholder="e.g., 20"
                                required={enableDualUnit}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px' }}>
              {variationEnabled && (
                <button
                  type="button"
                  onClick={handleAddVariation}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  + Add New Variation
                </button>
              )}
            <button type="submit" disabled={loading} className="submit-btn">
              {loading 
                ? (editingProduct ? 'Updating...' : 'Adding...') 
                : (editingProduct ? 'Update Product' : 'Add Product')
              }
            </button>
            </div>
          </form>
          {showCategoryPanel && (
            <div className="category-panel">
              <h4>Manage Brands & Categories</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>New Brand</label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Brand name"
                  />
                  <button type="button" className="submit-btn" onClick={handleAddCategory}>Add Brand</button>
                </div>
                <div className="form-group">
                  <label>New Category</label>
                  <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
                    <option value="">Select brand</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input
                    type="text"
                    value={newSubcategoryName}
                    onChange={(e) => setNewSubcategoryName(e.target.value)}
                    placeholder="Category name"
                  />
                  <button type="button" className="submit-btn" onClick={() => handleAddSubcategory(selectedCategoryId)}>Add Category</button>
                </div>
              </div>

              <div className="categories-list">
                <h5>Existing Brands</h5>
                <ul>
                  {categories.map((c) => (
                    <li key={c.id}>
                      <strong>{c.name}</strong>
                      {Array.isArray(c.subcategories) && c.subcategories.length > 0 && (
                        <div className="sub-list">{c.subcategories.join(', ')}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="products-table">
        <div className="table-header">
          <h3>Products List</h3>
          <div className="search-container">
            <input
              type="text"
              placeholder="Search products by name, brand, category, description, or price..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        {initialLoading ? (
          <p className="loading">Loading products...</p>
        ) : products.length === 0 ? (
          <p className="no-products">No products found. Add your first product!</p>
        ) : filteredProducts.length === 0 ? (
          <p className="no-products">No products found matching your search.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Brand</th>
                <th>Catalogue No.</th>
                <th>HSN</th>
                <th>Low Alert Qty</th>
                <th>Purchase Discount</th>
                <th>Purchase Price</th>
                <th>MRP</th>
                <th>Selling Discount</th>
                <th>Selling Price</th>
                <th>Quantity (Unit)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const hasVariations = product.variations && Array.isArray(product.variations) && product.variations.length > 0;
                const isVariationOpen = openVariationProductId === product.id;
                
                return (
                  <React.Fragment key={product.id}>
                    <tr>
                      <td data-label="Name" style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {hasVariations && (
                            <button
                              type="button"
                              onClick={() => setOpenVariationProductId(isVariationOpen ? null : product.id)}
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
                              title={isVariationOpen ? 'Hide variations' : 'Show variations'}
                            >
                              <span style={{ 
                                transform: isVariationOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s'
                              }}>
                                ▶
                              </span>
                            </button>
                          )}
                          <span>{product.name}</span>
                        </div>
                      </td>
                      <td data-label="Brand">{product.category}{product.subcategory ? ' / ' + product.subcategory : ''}</td>
                      <td data-label="Catalogue No.">
                        {hasVariations ? (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>See variations</span>
                        ) : (
                          <>{product.catalogueNumber || '-'}</>
                        )}
                      </td>
                      <td data-label="HSN">{product.hsnCode || '-'}</td>
                      <td data-label="Low Alert Qty">
                        {hasVariations ? (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>See variations</span>
                        ) : (
                          <>{product.lowStockQuantity ?? '-'}</>
                        )}
                      </td>
                      <td data-label="Purchase Discount">
                        {hasVariations ? (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>See variations</span>
                        ) : (
                          <>
                            {product.purchaseDiscount != null && product.purchaseDiscount !== ''
                              ? `${Number(product.purchaseDiscount)}%`
                              : '-'}
                          </>
                        )}
                      </td>
                      <td data-label="Purchase Price">
                        {hasVariations ? (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>See variations</span>
                        ) : (
                          <>₹{product.purchasePrice?.toFixed(2) || '-'}</>
                        )}
                      </td>
                      <td data-label="MRP">
                        {hasVariations ? (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>See variations</span>
                        ) : (
                          <>
                            {product.sellingMrp != null && product.sellingMrp !== ''
                              ? `₹${Number(product.sellingMrp).toFixed(2)}`
                              : '-'}
                          </>
                        )}
                      </td>
                      <td data-label="Selling Discount">
                        {hasVariations ? (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>See variations</span>
                        ) : (
                          <>
                            {product.sellingDiscount != null && product.sellingDiscount !== ''
                              ? `${Number(product.sellingDiscount)}%`
                              : '-'}
                          </>
                        )}
                      </td>
                      <td data-label="Selling Price">
                        {hasVariations ? (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>See variations</span>
                        ) : (
                          <>₹{product.price?.toFixed(2) || '0.00'}</>
                        )}
                      </td>
                      <td data-label="Quantity (Unit)">
                        {hasVariations ? (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>See variations</span>
                        ) : (
                          <>
                            {product.quantity || 0}{' '}
                            {product.unit || ''}
                          </>
                        )}
                      </td>
                      <td data-label="Actions">
                        <div className="action-buttons">
                          <button
                            className="edit-btn"
                            onClick={() => handleEditProduct(product)}
                          >
                            Edit
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => handleDeleteProduct(product.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {hasVariations && isVariationOpen && (
                      <tr>
                        <td colSpan="12" style={{ padding: '0', backgroundColor: '#f5f5f5' }}>
                          <div style={{ padding: '15px', marginLeft: '30px' }}>
                            <h4 style={{ margin: '0 0 10px 0', color: '#333', fontSize: '14px', fontWeight: 'bold' }}>
                              Product Variations:
                            </h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '4px' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#f0f0f0' }}>
                                  <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #ddd', fontSize: '13px' }}>Size</th>
                                  <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #ddd', fontSize: '13px' }}>Catalogue No.</th>
                                  <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #ddd', fontSize: '13px' }}>HSN</th>
                                  <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>Low Alert Qty</th>
                                  <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>Purchase Discount</th>
                                  <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>Purchase Price</th>
                                  <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>MRP</th>
                                  <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>Selling Discount</th>
                                  <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>Selling Price</th>
                                  <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>Qty (Unit)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {product.variations.map((variation, index) => (
                                  <tr key={index}>
                                    <td style={{ padding: '8px', border: '1px solid #ddd', fontSize: '13px' }}>{variation.size || '-'}</td>
                                    <td style={{ padding: '8px', border: '1px solid #ddd', fontSize: '13px' }}>{variation.catalogueNumber || '-'}</td>
                                    <td style={{ padding: '8px', border: '1px solid #ddd', fontSize: '13px' }}>{product.hsnCode || '-'}</td>
                                    <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>{variation.lowStockQuantity ?? '-'}</td>
                                    <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>
                                      {variation.purchaseDiscount != null && variation.purchaseDiscount !== ''
                                        ? `${Number(variation.purchaseDiscount)}%`
                                        : '-'}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>
                                      ₹{typeof variation.purchasePrice === 'number' ? variation.purchasePrice.toFixed(2) : '-'}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>
                                      {variation.sellingMrp != null && variation.sellingMrp !== ''
                                        ? `₹${Number(variation.sellingMrp).toFixed(2)}`
                                        : '-'}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>
                                      {variation.sellingDiscount != null && variation.sellingDiscount !== ''
                                        ? `${Number(variation.sellingDiscount)}%`
                                        : '-'}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>
                                      ₹{typeof variation.price === 'number' ? variation.price.toFixed(2) : '0.00'}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>
                                      {variation.quantity || 0}{' '}
                                      {product.unit || ''}
                                    </td>
                                  </tr>
                                ))}
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
        )}
      </div>
    </div>
  );
}

export default StockManagement;

