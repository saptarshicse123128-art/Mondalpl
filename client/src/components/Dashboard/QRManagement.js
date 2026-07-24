import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import './Dashboard.css';

// Hardcoded Cloudinary Credentials as requested
const CLOUDINARY_CLOUD_NAME = 'jlz7oqmj';
const CLOUDINARY_UPLOAD_PRESET = 'gyyhhiug';

function QRManagement() {
  const [qrImages, setQrImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [titleInput, setTitleInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [previewModalImg, setPreviewModalImg] = useState(null);

  // Fetch QR Images from Firebase Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'qr_codes'), (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => new Date(b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt) - new Date(a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt));
      setQrImages(list);
    });

    return () => unsubscribe();
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedImage(e.target.files[0]);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedImage) {
      setError('Please select an image file to upload.');
      return;
    }

    try {
      setUploading(true);
      setError('');

      // Upload image to Cloudinary via Unsigned API
      const formData = new FormData();
      formData.append('file', selectedImage);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

      const cloudinaryRes = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: 'POST',
          body: formData
        }
      );

      const cloudinaryData = await cloudinaryRes.json();

      if (!cloudinaryRes.ok) {
        throw new Error(cloudinaryData.error?.message || 'Failed to upload to Cloudinary');
      }

      const imageUrl = cloudinaryData.secure_url;
      const publicId = cloudinaryData.public_id;

      // Save record to Firebase Firestore
      await addDoc(collection(db, 'qr_codes'), {
        title: titleInput.trim() || 'Payment QR Code',
        imageUrl: imageUrl,
        publicId: publicId,
        createdAt: serverTimestamp()
      });

      // Reset form
      setSelectedImage(null);
      setTitleInput('');
      setUploading(false);
      alert('QR Code image uploaded and saved successfully!');
    } catch (err) {
      console.error('Upload Error:', err);
      setError(err.message || 'Failed to upload image');
      setUploading(false);
    }
  };

  const handleDelete = async (qrId) => {
    if (window.confirm('Are you sure you want to delete this QR Code image?')) {
      try {
        await deleteDoc(doc(db, 'qr_codes', qrId));
        if (previewModalImg?.id === qrId) {
          setPreviewModalImg(null);
        }
        alert('QR Code image deleted successfully.');
      } catch (err) {
        console.error('Delete Error:', err);
        alert('Failed to delete QR code image.');
      }
    }
  };

  return (
    <div className="card" style={{ padding: '24px', background: '#fff', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#1e293b' }}>📱 QR Code Gallery & Management</h2>
      </div>

      {/* Upload Form */}
      <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '25px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.05rem', color: '#334155' }}>📤 Add New QR Image</h3>
        {error && <div style={{ color: '#ef4444', marginBottom: '10px', fontSize: '14px', fontWeight: 600 }}>{error}</div>}
        <form onSubmit={handleUpload} style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
              Title / Note (Optional)
            </label>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="e.g. PhonePe QR / GPay QR"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            />
          </div>
          <div style={{ flex: '1', minWidth: '220px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
              Select QR Image *
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              required
              style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff' }}
            />
          </div>
          <button
            type="submit"
            disabled={uploading}
            style={{
              padding: '9px 20px',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.7 : 1
            }}
          >
            {uploading ? 'Uploading to Cloudinary...' : '⬆️ Upload QR Code'}
          </button>
        </form>
      </div>

      {/* QR Codes Grid */}
      <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: '#1e293b' }}>
        🖼️ Saved QR Codes ({qrImages.length})
      </h3>

      {qrImages.length === 0 ? (
        <p style={{ color: '#64748b', textAlign: 'center', margin: '40px 0' }}>No QR code images added yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
          {qrImages.map((qr) => (
            <div
              key={qr.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px',
                background: '#fff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center'
              }}
            >
              <div
                onClick={() => setPreviewModalImg(qr)}
                style={{ cursor: 'pointer', overflow: 'hidden', borderRadius: '8px', width: '100%', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}
                title="Click to view large size"
              >
                <img
                  src={qr.imageUrl}
                  alt={qr.title}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transition: 'transform 0.2s' }}
                />
              </div>
              <strong style={{ margin: '10px 0 4px 0', fontSize: '14px', color: '#1e293b' }}>{qr.title}</strong>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => setPreviewModalImg(qr)}
                  style={{ flex: 1, padding: '6px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  🔍 View Large
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(qr.id)}
                  style={{ padding: '6px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Large View Modal */}
      {previewModalImg && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => setPreviewModalImg(null)}
        >
          <div
            style={{
              background: '#fff',
              padding: '20px',
              borderRadius: '12px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative',
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewModalImg(null)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '12px',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                fontSize: '16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold'
              }}
            >
              ×
            </button>
            <h3 style={{ margin: '0 0 15px 0', color: '#1e293b' }}>{previewModalImg.title}</h3>
            <img
              src={previewModalImg.imageUrl}
              alt={previewModalImg.title}
              style={{ maxWidth: '80vw', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px' }}
            />
            <div style={{ marginTop: '15px', display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => handleDelete(previewModalImg.id)}
                style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                🗑️ Delete QR Code
              </button>
              <button
                type="button"
                onClick={() => setPreviewModalImg(null)}
                style={{ padding: '8px 16px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QRManagement;
