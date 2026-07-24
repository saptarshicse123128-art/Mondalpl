import React, { useEffect, useState } from 'react';
import { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import './Dashboard.css';

// Indian States with GST Codes
const INDIAN_STATES = [
  { code: '19', name: 'West Bengal (19)' },
  { code: '09', name: 'Uttar Pradesh (09)' },
  { code: '27', name: 'Maharashtra (27)' },
  { code: '07', name: 'Delhi (07)' },
  { code: '33', name: 'Tamil Nadu (33)' },
  { code: '29', name: 'Karnataka (29)' },
  { code: '30', name: 'Goa (30)' },
  { code: '24', name: 'Gujarat (24)' },
  { code: '08', name: 'Rajasthan (08)' },
  { code: '06', name: 'Haryana (06)' },
  { code: '03', name: 'Punjab (03)' },
  { code: '10', name: 'Bihar (10)' },
  { code: '18', name: 'Assam (18)' },
  { code: '23', name: 'Madhya Pradesh (23)' },
  { code: '36', name: 'Telangana (36)' },
  { code: '37', name: 'Andhra Pradesh (37)' },
  { code: '32', name: 'Kerala (32)' },
  { code: '22', name: 'Chhattisgarh (22)' },
  { code: '20', name: 'Jharkhand (20)' },
  { code: '21', name: 'Odisha (21)' },
  { code: '02', name: 'Himachal Pradesh (02)' },
  { code: '01', name: 'Jammu & Kashmir (01)' },
  { code: '05', name: 'Uttarakhand (05)' },
  { code: '11', name: 'Sikkim (11)' },
  { code: '12', name: 'Arunachal Pradesh (12)' },
  { code: '13', name: 'Nagaland (13)' },
  { code: '14', name: 'Manipur (14)' },
  { code: '15', name: 'Mizoram (15)' },
  { code: '16', name: 'Tripura (16)' },
  { code: '17', name: 'Meghalaya (17)' }
];

function PartyManagement() {
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [form, setForm] = useState({
    name: '',
    gstin: '',
    phone: '',
    email: '',
    address: '',
    stateCode: '19', // Default West Bengal
    differentShipping: false,
    shippingName: '',
    shippingGstin: '',
    shippingPhone: '',
    shippingEmail: '',
    shippingAddress: '',
    shippingStateCode: '19'
  });

  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'parties'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const partyList = [];
      snapshot.forEach((doc) => {
        partyList.push({ id: doc.id, ...doc.data() });
      });
      setParties(partyList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching parties:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const validateGstin = (gstin) => {
    if (!gstin) return true; // Optional GSTIN, but if entered it must be valid
    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return regex.test(gstin.toUpperCase());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('Please enter party name');
      return;
    }

    if (form.gstin && !validateGstin(form.gstin)) {
      alert('Please enter a valid 15-digit GSTIN');
      return;
    }

    const different = form.differentShipping;
    if (different && form.shippingGstin && !validateGstin(form.shippingGstin)) {
      alert('Please enter a valid 15-digit Shipping GSTIN');
      return;
    }

    const partyData = {
      name: form.name.trim(),
      gstin: form.gstin.trim().toUpperCase(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      stateCode: form.stateCode,
      stateName: INDIAN_STATES.find(s => s.code === form.stateCode)?.name.split(' (')[0] || '',
      differentShipping: different,
      shippingName: different ? form.shippingName.trim() : form.name.trim(),
      shippingGstin: different ? form.shippingGstin.trim().toUpperCase() : form.gstin.trim().toUpperCase(),
      shippingPhone: different ? form.shippingPhone.trim() : form.phone.trim(),
      shippingEmail: different ? form.shippingEmail.trim() : form.email.trim(),
      shippingAddress: different ? form.shippingAddress.trim() : form.address.trim(),
      shippingStateCode: different ? form.shippingStateCode : form.stateCode,
      shippingStateName: INDIAN_STATES.find(s => s.code === (different ? form.shippingStateCode : form.stateCode))?.name.split(' (')[0] || ''
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'parties', editingId), partyData);
        alert('Party updated successfully');
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'parties'), partyData);
        alert('Party added successfully');
      }
      
      setForm({
        name: '',
        gstin: '',
        phone: '',
        email: '',
        address: '',
        stateCode: '19',
        differentShipping: false,
        shippingName: '',
        shippingGstin: '',
        shippingPhone: '',
        shippingEmail: '',
        shippingAddress: '',
        shippingStateCode: '19'
      });
    } catch (error) {
      console.error('Error saving party:', error);
      alert('Failed to save party details');
    }
  };

  const handleEdit = (party) => {
    setEditingId(party.id);
    setForm({
      name: party.name,
      gstin: party.gstin || '',
      phone: party.phone || '',
      email: party.email || '',
      address: party.address || '',
      stateCode: party.stateCode || '19',
      differentShipping: party.differentShipping || false,
      shippingName: party.shippingName || '',
      shippingGstin: party.shippingGstin || '',
      shippingPhone: party.shippingPhone || '',
      shippingEmail: party.shippingEmail || '',
      shippingAddress: party.shippingAddress || '',
      shippingStateCode: party.shippingStateCode || '19'
    });
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete party "${name}"?`)) {
      try {
        await deleteDoc(doc(db, 'parties', id));
        alert('Party deleted successfully');
      } catch (error) {
        console.error('Error deleting party:', error);
        alert('Failed to delete party');
      }
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm({
      name: '',
      gstin: '',
      phone: '',
      email: '',
      address: '',
      stateCode: '19',
      differentShipping: false,
      shippingName: '',
      shippingGstin: '',
      shippingPhone: '',
      shippingEmail: '',
      shippingAddress: '',
      shippingStateCode: '19'
    });
  };

  const filteredParties = parties.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.gstin && p.gstin.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p.phone && p.phone.includes(searchQuery))
  );

  return (
    <div className="stock-management"> {/* Reuse stock-management structure for style consistency */}
      <h2>Party Management</h2>
      <div className="party-container">
        
        {/* Form Column */}
        <div className="card" style={{ padding: '20px', background: '#fff', borderRadius: '8px', height: 'fit-content', width: '100%' }}>
          <h3>{editingId ? 'Edit Party' : 'Add New Party'}</h3>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', background: '#f8f9fa', padding: '10px', borderRadius: '6px', border: '1px solid #e9ecef' }}>
              <input
                type="checkbox"
                name="differentShipping"
                id="differentShipping"
                checked={form.differentShipping}
                onChange={handleChange}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="differentShipping" style={{ margin: 0, cursor: 'pointer', userSelect: 'none', fontWeight: 'bold', color: '#2c3e50' }}>
                Add different shipping details
              </label>
            </div>

            {/* Billing Section */}
            <h4 style={{ margin: '5px 0 0 0', color: '#2c3e50', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>Billing Details</h4>

            <div className="form-group">
              <label>Party Name (Billing) *</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Enter party name"
                required
              />
            </div>
            
            <div className="form-group">
              <label>GSTIN (Optional)</label>
              <input
                type="text"
                name="gstin"
                value={form.gstin}
                onChange={handleChange}
                placeholder="15-digit GSTIN"
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            <div className="form-group">
              <label>State (GST Code)</label>
              <select name="stateCode" value={form.stateCode} onChange={handleChange}>
                {INDIAN_STATES.map(s => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="Enter 10-digit mobile"
              />
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Enter email address"
              />
            </div>

            <div className="form-group">
              <label>Billing Address</label>
              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Full billing address"
                style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', minHeight: '60px', fontFamily: 'inherit' }}
              />
            </div>

            {/* Shipping Section */}
            {form.differentShipping && (
              <>
                <h4 style={{ margin: '15px 0 0 0', color: '#2c3e50', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>Shipping Details</h4>
                
                <div className="form-group">
                  <label>Consignee / Shipping Name *</label>
                  <input
                    type="text"
                    name="shippingName"
                    value={form.shippingName}
                    onChange={handleChange}
                    placeholder="Enter shipping receiver name"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Shipping GSTIN (Optional)</label>
                  <input
                    type="text"
                    name="shippingGstin"
                    value={form.shippingGstin}
                    onChange={handleChange}
                    placeholder="15-digit Shipping GSTIN"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>

                <div className="form-group">
                  <label>Shipping Phone</label>
                  <input
                    type="text"
                    name="shippingPhone"
                    value={form.shippingPhone}
                    onChange={handleChange}
                    placeholder="Enter receiver phone"
                  />
                </div>

                <div className="form-group">
                  <label>Shipping Email Address</label>
                  <input
                    type="email"
                    name="shippingEmail"
                    value={form.shippingEmail}
                    onChange={handleChange}
                    placeholder="Enter shipping email address"
                  />
                </div>

                <div className="form-group">
                  <label>Shipping State (GST Code)</label>
                  <select name="shippingStateCode" value={form.shippingStateCode} onChange={handleChange}>
                    {INDIAN_STATES.map(s => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Shipping Address *</label>
                  <textarea
                    name="shippingAddress"
                    value={form.shippingAddress}
                    onChange={handleChange}
                    placeholder="Full shipping address"
                    required
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', minHeight: '60px', fontFamily: 'inherit' }}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="submit" className="add-product-btn" style={{ flex: 1 }}>
                {editingId ? 'Update Party' : 'Save Party'}
              </button>
              {editingId && (
                <button type="button" onClick={handleCancel} className="remove-btn" style={{ flex: 1 }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* List Column */}
        <div className="card" style={{ padding: '20px', background: '#fff', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3>Registered Parties</h3>
            <input
              type="text"
              placeholder="Search by name, GSTIN, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: '6px 12px', width: '250px', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>

          {loading ? (
            <p>Loading parties...</p>
          ) : filteredParties.length === 0 ? (
            <p className="muted">No parties found.</p>
          ) : (
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Party Details</th>
                    <th>GSTIN</th>
                    <th>State</th>
                    <th>Contact</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParties.map(p => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        {p.address && <div style={{ fontSize: '0.85em', color: '#555', marginTop: '4px' }}><strong>Bill to:</strong> {p.address}</div>}
                        {p.differentShipping && p.shippingAddress && (
                          <div style={{ fontSize: '0.85em', color: '#777', marginTop: '2px' }}>
                            <strong>Ship to ({p.shippingStateName || p.shippingStateCode}):</strong> {p.shippingName} - {p.shippingAddress}
                            {p.shippingPhone && ` (Ph: ${p.shippingPhone})`}
                          </div>
                        )}
                      </td>
                      <td>
                        {p.differentShipping ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div>
                              <span style={{ fontSize: '0.75em', color: '#666', fontWeight: 'bold', display: 'block' }}>Billing GSTIN:</span>
                              <span className="chip" style={{ background: p.gstin ? '#e6f7ff' : '#f5f5f5', color: p.gstin ? '#1890ff' : '#888' }}>
                                {p.gstin || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span style={{ fontSize: '0.75em', color: '#666', fontWeight: 'bold', display: 'block' }}>Shipping GSTIN:</span>
                              <span className="chip" style={{ background: p.shippingGstin ? '#f6ffed' : '#f5f5f5', color: p.shippingGstin ? '#52c41a' : '#888' }}>
                                {p.shippingGstin || 'N/A'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="chip" style={{ background: p.gstin ? '#e6f7ff' : '#f5f5f5', color: p.gstin ? '#1890ff' : '#888' }}>
                            {p.gstin || 'N/A'}
                          </span>
                        )}
                      </td>
                      <td>{p.stateName || 'N/A'} ({p.stateCode})</td>
                      <td>
                        <div>{p.phone || '-'}</div>
                        <div style={{ fontSize: '0.85em', color: '#666' }}>{p.email}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => handleEdit(p)} className="edit-btn" style={{ padding: '4px 8px', background: '#3498db', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                            Edit
                          </button>
                          <button onClick={() => handleDelete(p.id, p.name)} className="remove-btn" style={{ padding: '4px 8px', cursor: 'pointer' }}>
                            Delete
                          </button>
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
    </div>
  );
}

export default PartyManagement;
