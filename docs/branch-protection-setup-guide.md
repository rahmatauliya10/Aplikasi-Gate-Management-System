# Panduan Konfigurasi GitHub Branch Protection (P0-03)

Dokumen ini adalah panduan langkah demi langkah untuk mengaktifkan **Branch Protection Rules** pada repository GitHub Gate Management System (GMS) untuk branch `update-v1.0.0` dan `9`.

---

## 1. Navigasi ke Pengaturan GitHub

1. Buka repository GMS di browser (misal: `https://github.com/<owner>/Aplikasi-Gate-Management-System`).
2. Klik tab **Settings** (di pojok kanan atas tab repository).
3. Di sidebar kiri, pada kategori **Code and automation**, klik **Branches**.
4. Klik tombol **Add branch protection rule** (atau klik **Edit** jika rule sudah ada).

---

## 2. Parameter Branch Protection Rule

Isi formulir dengan konfigurasi ketat berikut:

### A. Target Branch
- **Branch name pattern**: `update-v1.0.0` *(ulangi langkah yang sama nanti untuk `main`)*

### B. Pull Request Controls
- [x] **Require a pull request before merging**
  - [x] **Require approvals**: Minimal `1` approval
  - [x] **Dismiss stale pull request approvals when new commits are pushed**
  - [x] **Require review from Code Owners** (opsional jika CODEOWNERS dikonfigurasi)

### C. Required Status Checks (Zero Broken Gate Rule)
- [x] **Require status checks to pass before merging**
  - [x] **Require branches to be up to date before merging**
  - Pada kotak pencarian *Status checks that are required*, cari dan centang seluruh job CI berikut:

```
Backend Test, Coverage, Build & Schema Validation (fresh)
Backend Test, Coverage, Build & Schema Validation (upgraded)
Frontend Build & Bundle Verification
Dependency Security & Secret Scan
Historical Migration Rehearsal & DR Integrity Gate (P0-01)
Production Restore DR Failure-Injection Gate (P0-02)
Post-Migration Coordinated Rollback Drill Gate (P0-03)
Full-Stack Staging Stack & Cross-Stack E2E Gate (GBB / GSP / GBJ)
```

> **Catatan Penting**: Nama status check di atas hanya muncul di daftar pencarian setelah workflow GitHub Actions pernah dijalankan minimal satu kali pada repository.

### D. Governance & Tamper Protection
- [x] **Require conversation resolution before merging**
- [x] **Require signed commits** (opsional jika tim menggunakan GPG signing)
- [x] **Require linear history**
- [x] **Do not allow bypassing the above settings** *(Berlaku juga untuk repository Administrators)*
- [x] **Restrict who can push to matching branches**
- [x] **Block force pushes** (Krusial: mencegah rewrite git history yang merusak audit trail)
- [x] **Block branch deletions**

---

## 3. Simpan dan Validasi

1. Klik tombol **Save changes** di bagian bawah halaman.
2. Masukkan password atau 2FA konfirmasi GitHub jika diminta.

### Cara Memvalidasi Efektivitas Rule:
- Coba lakukan `git push origin update-v1.0.0 --force` dari terminal lokal.
- **Hasil yang diharapkan:** GitHub menolak push dengan error:
  `remote: error: GH006: Protected branch update: Cannot force-push to a protected branch`.
- Buka Pull Request baru yang sengaja dibuat gagal salah satu test check-nya.
- **Hasil yang diharapkan:** Tombol **Merge pull request** dinonaktifkan (disabled) dengan pesan:
  `Required status checks must pass before merging`.
