# Rencana Implementasi Perbaikan Status QC Reject Menjadi Pending

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memperbaiki bug status QC rejected yang tampil sebagai PENDING pada Quality Analysis card di modal TruckDetailsModal ketika dibuka dari halaman History.

**Architecture:** Memperbarui pemetaan `qcDetails` pada file `History.vue` untuk menyertakan `status` dan `note`, serta memperkuat logika computed `qcDetails` di `TruckDetailsModal.vue` agar menggabungkan data properti secara dinamis dengan data relasi database.

**Tech Stack:** Vue 3, Javascript, Tailwind CSS.

## Global Constraints
- Solusi harus minimal dan langsung mengatasi akar masalah (ponytail).
- Menggunakan library bawaan proyek, tidak menambahkan dependensi baru.

---

### Task 1: Perbarui Pemetaan data di History.vue

**Files:**
- Modify: `frontend/src/views/History.vue:658-675`

**Interfaces:**
- Mengkonsumsi: Relasi `incomingMaterialChecks` dan `qcVehicleChecks` pada objek `truck`.
- Menghasilkan: Objek `qcDetails` pada objek `truck` yang lengkap dengan properti `status` dan `note`.

- [ ] **Step 1: Modifikasi pemetaan `qcDetails` di `History.vue`**

Ganti baris 658-675 di `History.vue` dengan kode berikut:
```javascript
    // Map QC Details dynamically from incomingMaterialChecks / qcVehicleChecks
    let qcDetails = null
    if (truck.incomingMaterialChecks && truck.incomingMaterialChecks.length > 0) {
      const im = truck.incomingMaterialChecks[0]
      qcDetails = {
        status: im.result,
        note: im.notes || im.defectNotes || '',
        kadarAir: im.moisture,
        totalFM: im.foreignMatter,
        bijiOK: im.beanCondition === 'PASS' || im.result === 'PASS' ? 100 : 0,
        pic: im.checkedBy?.name || 'N/A'
      }
    } else if (truck.qcVehicleChecks && truck.qcVehicleChecks.length > 0) {
      const qv = truck.qcVehicleChecks[0]
      qcDetails = {
        status: qv.result,
        note: qv.notes || '',
        kadarAir: null,
        totalFM: null,
        bijiOK: qv.result === 'PASS' ? 100 : 0,
        pic: qv.checkedBy?.name || 'N/A'
      }
    }
```

- [ ] **Step 2: Commit perubahan**
```bash
git add frontend/src/views/History.vue
git commit -m "fix(frontend): add status and note to qcDetails map in History view"
```

---

### Task 2: Perbarui computed qcDetails di TruckDetailsModal.vue

**Files:**
- Modify: `frontend/src/components/TruckDetailsModal.vue:454-483`

**Interfaces:**
- Mengkonsumsi: `props.truck` yang berisi `qcDetails` dan relasi pemeriksaan QC.
- Menghasilkan: Objek `qcDetails` yang tergabung sempurna antara detail kustom dan data relasi.

- [ ] **Step 1: Modifikasi computed `qcDetails`**

Ganti baris 454-483 di `TruckDetailsModal.vue` dengan kode berikut:
```javascript
const qcDetails = computed(() => {
  const sourceDetails = props.truck?.qcDetails;
  let relationDetails = null;

  // GBB / GSP from backend relations
  if (props.truck?.incomingMaterialChecks && props.truck.incomingMaterialChecks.length > 0) {
    const check = props.truck.incomingMaterialChecks[0];
    relationDetails = {
      pic: check.checkedBy?.name || 'QC Inspector',
      status: check.result,
      note: check.notes || check.defectNotes || '',
      bau: check.odor === 'PASS' ? 'Normal' : check.odor === 'REJECT' ? 'Abnormal' : check.odor || '',
      warna: check.color === 'PASS' ? 'Normal' : check.color === 'REJECT' ? 'Abnormal' : check.color || '',
      kadarAir: check.moisture,
      totalFM: check.foreignMatter,
      bijiOK: check.sampleWeight
    };
  }
  // GBJ from backend relations
  else if (props.truck?.qcVehicleChecks && props.truck.qcVehicleChecks.length > 0) {
    const check = props.truck.qcVehicleChecks[0];
    relationDetails = {
      pic: check.checkedBy?.name || 'QC Inspector',
      status: check.result,
      note: check.notes || '',
      kadarAir: null,
      totalFM: null,
      bijiOK: check.result === 'PASS' ? 100 : 0
    };
  }

  // Merge sourceDetails and relationDetails if both exist
  if (sourceDetails && relationDetails) {
    return {
      ...relationDetails,
      ...sourceDetails,
      status: sourceDetails.status || relationDetails.status,
      note: sourceDetails.note !== undefined ? sourceDetails.note : relationDetails.note,
      bau: sourceDetails.bau !== undefined ? sourceDetails.bau : relationDetails.bau,
      warna: sourceDetails.warna !== undefined ? sourceDetails.warna : relationDetails.warna,
      pic: sourceDetails.pic && sourceDetails.pic !== 'N/A' ? sourceDetails.pic : relationDetails.pic
    };
  }

  return sourceDetails || relationDetails;
});
```

- [ ] **Step 2: Commit perubahan**
```bash
git add frontend/src/components/TruckDetailsModal.vue
git commit -m "fix(frontend): merge qcDetails safely in TruckDetailsModal"
```

---

### Task 3: Verifikasi Perubahan Secara Manual

**Files:** None

- [ ] **Step 1: Jalankan aplikasi secara lokal dan buka halaman History**
Buka daftar log transaksi yang ditolak/QC REJECTED, klik salah satunya untuk memunculkan modal. Pastikan banner Quality Analysis menampilkan warna merah dengan status REJECT/REJECTED bukan PENDING yang berwarna biru.

---

### Task 4: Panduan Update Ke Rancher Desktop

**Files:** None

- [ ] **Step 1: Dokumentasikan langkah-langkah deployment ulang kontainer menggunakan Rancher Desktop**
Buat panduan bagi pengguna untuk melakukan rebuild docker image dan deploy ulang di Rancher Desktop.
Panduan akan mencakup:
1. Rebuild image frontend/backend (atau menggunakan `rebuild-run-gms.bat` jika ada).
2. Melakukan redeploy Kubernetes pod / k3s workloads melalui Kubernetes dashboard Rancher Desktop.
