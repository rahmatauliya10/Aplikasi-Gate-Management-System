<template>
  <teleport to="body">
  <transition name="modal">
    <div v-if="isOpen" class="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6"
      style="background:rgba(2,8,23,0.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);"
      @click.self="close">
      <div class="modal-panel rounded-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[92vh] transition-all duration-500 w-[97vw] sm:w-[90vw] lg:w-[80vw] max-w-4xl mx-auto"
        style="background: white; box-shadow: 0 25px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(74,139,223,0.1);">

        <!-- Header -->
        <div class="px-4 sm:px-6 py-4 sm:py-5 flex justify-between items-center shrink-0"
          style="background: linear-gradient(135deg, #FFFFFF, #E6F0FA); border-bottom: 1px solid rgba(74,139,223,0.15);">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center"
              style="background: linear-gradient(135deg, rgba(74,139,223,0.2), rgba(160,0,109,0.1)); border: 1px solid rgba(74,139,223,0.3);">
              <span class="material-icons text-[#4A8BDF] text-xl sm:text-2xl">menu_book</span>
            </div>
            <div>
              <h2 class="text-lg sm:text-xl font-black text-[#4A8BDF] tracking-tight">User Guide</h2>
              <p class="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Panduan Detail Operasional Aplikasi Gate Management System</p>
            </div>
          </div>
          <button @click="close"
            class="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 hover:bg-red-50 hover:text-red-500 text-slate-400">
            <span class="material-icons text-lg">close</span>
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6" style="background: #F8FAFC;">
          <!-- Intro -->
          <div class="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
            <p class="text-xs sm:text-sm text-slate-700 font-medium leading-relaxed">
              Panduan mendalam ini menyajikan seluruh rangkaian langkah operasional jembatan timbang (weighbridge), QC, gudang, dan pos penjagaan (security) pada ekosistem **GMS V6**. Sistem ini dirancang untuk mencegah kecurangan rekonsiliasi material (anti-fraud) melalui pencocokan deviasi berat otomatis serta pengamanan daur hidup akun pengguna secara ketat.
            </p>
          </div>

          <!-- Section 1: Alur Bisnis Utama (GBB, GBJ, GSP) -->
          <div class="space-y-3">
            <h3 class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span class="material-icons text-[#4A8BDF] text-lg">alt_route</span> Detail Alur Bisnis & Tipe Gudang
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- GBB -->
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div class="flex items-center gap-2 border-b pb-1.5">
                  <span class="w-2.5 h-2.5 rounded-full bg-[#4A8BDF]"></span>
                  <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider">GBB (Bahan Baku Masuk)</h4>
                </div>
                <p class="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Digunakan untuk penerimaan material basah atau kering dari supplier (bahan mentah).
                </p>
                <ol class="text-[10px] text-slate-600 font-bold list-decimal pl-4 space-y-1">
                  <li>Security: Registrasi Check-In</li>
                  <li>Weighbridge: Timbang Masuk (Bruto)</li>
                  <li>QC: Inspeksi Uji Kadar/Lab</li>
                  <li>Warehouse: Bongkar & Konfirmasi</li>
                  <li>Weighbridge: Timbang Keluar (Tara)</li>
                  <li>Security: Konfirmasi Gate-Out</li>
                </ol>
              </div>

              <!-- GBJ -->
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div class="flex items-center gap-2 border-b pb-1.5">
                  <span class="w-2.5 h-2.5 rounded-full bg-[#A0006D]"></span>
                  <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider">GBJ (Barang Jadi Keluar)</h4>
                </div>
                <p class="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Digunakan untuk pengiriman produk jadi keluar dari area pabrik menggunakan armada ekspedisi.
                </p>
                <ol class="text-[10px] text-slate-600 font-bold list-decimal pl-4 space-y-1">
                  <li>Security: Registrasi Check-In</li>
                  <li>Weighbridge: Timbang Masuk (Tara / Kosong)</li>
                  <li>QC: Cek Kesiapan Fisik Truk</li>
                  <li>Warehouse: Pemuatan Barang (Loading)</li>
                  <li>Weighbridge: Timbang Keluar (Bruto / Berisi)</li>
                  <li>Security: Konfirmasi Gate-Out</li>
                </ol>
              </div>

              <!-- GSP -->
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div class="flex items-center gap-2 border-b pb-1.5">
                  <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider">GSP (Suku Cadang & Logistik)</h4>
                </div>
                <p class="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Digunakan untuk penerimaan atau pengeluaran logistik internal non-produksi (mesin, sparepart, ATK).
                </p>
                <ol class="text-[10px] text-slate-600 font-bold list-decimal pl-4 space-y-1">
                  <li>Security: Registrasi Check-In</li>
                  <li>Weighbridge: Timbang Masuk (Pilihan)</li>
                  <li>Warehouse: Bongkar / Muat & Cek Surat</li>
                  <li>Weighbridge: Timbang Keluar (Pilihan)</li>
                  <li>Security: Konfirmasi Gate-Out</li>
                </ol>
              </div>
            </div>
          </div>

          <!-- Section 2: Panduan Berdasarkan Role -->
          <div class="space-y-3">
            <h3 class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span class="material-icons text-[#A0006D] text-lg">groups</span> Pembagian Tugas & Tanggung Jawab Role
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Security -->
              <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                  <span class="material-icons text-[#4A8BDF]">security</span>
                  <h4 class="text-xs sm:text-sm font-black text-slate-800">1. Security (Petugas Gate Pos)</h4>
                </div>
                <div class="p-4 space-y-2.5 text-[11px] text-slate-600 font-medium">
                  <p class="font-bold text-slate-800">Prosedur Check-In Kendaraan:</p>
                  <ul class="list-disc pl-4 space-y-1">
                    <li>Periksa kelengkapan fisik pengemudi (SIM, Surat Jalan, PO).</li>
                    <li>Input pelat nomor secara presisi (contoh: **B1234XYZ** tanpa spasi).</li>
                    <li>Pilih jenis gudang tujuan proses (**GBB**, **GBJ**, atau **GSP**).</li>
                    <li>Jika pelat nomor memicu tanda *Duplicate Active*, tolak check-in dan minta armada tersebut menyelesaikan antrean sebelumnya.</li>
                  </ul>
                  <p class="font-bold text-slate-800 mt-2 border-t pt-2">Prosedur Check-Out Kendaraan:</p>
                  <ul class="list-disc pl-4 space-y-1">
                    <li>Hanya izinkan Check-Out jika status transaksi adalah **WEIGH_OUT_DONE**.</li>
                    <li>Verifikasi segel pintu truk (jika dipasang) sebelum melepas palang pintu gerbang keluar.</li>
                  </ul>
                </div>
              </div>

              <!-- Weighbridge Operator -->
              <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                  <span class="material-icons text-indigo-500">scale</span>
                  <h4 class="text-xs sm:text-sm font-black text-slate-800">2. Operator Jembatan Timbang (Weighbridge)</h4>
                </div>
                <div class="p-4 space-y-2.5 text-[11px] text-slate-600 font-medium">
                  <p class="font-bold text-slate-800">Prosedur Timbang Masuk & Keluar:</p>
                  <ul class="list-disc pl-4 space-y-1">
                    <li>Pastikan ban kendaraan berada sepenuhnya di atas jembatan timbang (sensor tidak terhalang).</li>
                    <li>Input berat kendaraan sesuai dengan tampilan indikator timbangan digital.</li>
                    <li>Sistem memvalidasi berat tara harus lebih ringan dari berat bruto: `Tare Weight < Gross Weight`.</li>
                    <li>**Deteksi Fraud Otomatis:** Sistem menghitung `Deviation = |Net Weight - Actual Weight|`. Deviasi **> 2%** memicu notifikasi Warning, sedangkan **> 5%** memicu status Critical Alert dan otomatis tercatat di audit log.</li>
                  </ul>
                </div>
              </div>

              <!-- QC Inspector -->
              <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                  <span class="material-icons text-emerald-500">biotech</span>
                  <h4 class="text-xs sm:text-sm font-black text-slate-800">3. Quality Control (QC Inspector)</h4>
                </div>
                <div class="p-4 space-y-2.5 text-[11px] text-slate-600 font-medium">
                  <p class="font-bold text-slate-800">Prosedur Inspeksi Mutu & Kesiapan:</p>
                  <ul class="list-disc pl-4 space-y-1">
                    <li>Lakukan inspeksi fisik muatan (untuk bahan baku) atau kebersihan bak truk (untuk barang jadi).</li>
                    <li>Input hasil analisis lab (kadar air, benda asing, dll) secara objektif.</li>
                    <li>Tentukan keputusan hasil pemeriksaan: **Passed (Lolos)** atau **Rejected (Ditolak)**.</li>
                    <li>Jika berstatus ditolak, wajib menginput alasan penolakan secara jelas dan melampirkan foto bukti kondisi fisik muatan.</li>
                  </ul>
                </div>
              </div>

              <!-- Warehouse Operator -->
              <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                  <span class="material-icons text-amber-500">warehouse</span>
                  <h4 class="text-xs sm:text-sm font-black text-slate-800">4. Operator Gudang (Warehouse)</h4>
                </div>
                <div class="p-4 space-y-2.5 text-[11px] text-slate-600 font-medium">
                  <p class="font-bold text-slate-800">Prosedur Bongkar & Muat Barang:</p>
                  <ul class="list-disc pl-4 space-y-1">
                    <li>Klik **Start Loading / Unloading** saat aktivitas fisik dimulai di ramp/dock gudang.</li>
                    <li>Periksa dokumen fisik surat jalan pengantar barang bawaan armada.</li>
                    <li>Input jumlah bag/tonase aktual yang diterima atau dimuat ke dalam truk.</li>
                    <li>Unggah lampiran foto kondisi barang, lalu klik **Complete Warehouse**.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 3: Keamanan Sandi & Sesi Akun -->
          <div class="space-y-3">
            <h3 class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span class="material-icons text-rose-500 text-lg">admin_panel_settings</span> Kebijakan Keamanan Akun & Daur Hidup Sandi
            </h3>
            <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-[11px] font-medium space-y-2.5 leading-relaxed text-slate-600">
              <div class="flex items-start gap-2">
                <span class="material-icons text-rose-500 text-sm mt-0.5">security_update_warning</span>
                <div>
                  <b>Ganti Password Wajib (Forced Password Change):</b> 
                  Akun baru atau akun yang baru di-reset oleh administrator akan ditandai dengan bendera `mustChangePassword=true`. Rute operasional Anda akan diblokir sementara sebelum Anda melakukan penggantian kata sandi pada login pertama kali.
                </div>
              </div>
              <div class="flex items-start gap-2">
                <span class="material-icons text-amber-500 text-sm mt-0.5">key</span>
                <div>
                  <b>Validasi Kompleksitas Sandi:</b> 
                  Kata sandi baru tidak boleh sama dengan kata sandi sebelumnya. Disarankan menggunakan kombinasi minimal 8 karakter yang mengandung huruf besar, huruf kecil, angka, dan simbol khusus demi mencegah peretasan akun.
                </div>
              </div>
              <div class="flex items-start gap-2">
                <span class="material-icons text-indigo-500 text-sm mt-0.5">hourglass_empty</span>
                <div>
                  <b>Masa Berlaku Sandi Sementara:</b> 
                  Kata sandi sementara yang diberikan oleh administrator secara default akan kedaluwarsa dalam **24 jam**. Harap segera gunakan kata sandi tersebut sebelum hangus.
                </div>
              </div>
            </div>
          </div>

          <!-- Section 4: Tips Troubleshooting & Kontak Administrator -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <!-- Tips -->
            <div class="space-y-3">
              <h3 class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <span class="material-icons text-amber-500 text-lg">lightbulb</span> Tips Operasional Harian
              </h3>
              <ul class="list-disc pl-5 text-[11px] text-slate-600 font-medium space-y-2 bg-white border border-slate-200 rounded-xl shadow-sm p-4 h-[180px] overflow-y-auto">
                <li>Lakukan pengecekan konektivitas jaringan lokal timbangan sebelum memulai shift.</li>
                <li>Dilarang me-refresh halaman web saat proses submit data timbang/gudang sedang berputar (loading).</li>
                <li>Gunakan browser Google Chrome versi terbaru demi kestabilan rendering peta antrean.</li>
                <li>Setiap file screenshot atau dokumen wajib dikompres jika ukurannya melebihi batas sistem 10 MB.</li>
                <li>Jika rute menu menghilang, periksa kembali apakah role akun Anda berubah, lalu lakukan relogin.</li>
              </ul>
            </div>

            <!-- Troubleshooting -->
            <div class="space-y-3">
              <h3 class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <span class="material-icons text-red-500 text-lg">build</span> Tabel Solusi Kendala Cepat
              </h3>
              <div class="overflow-x-auto border border-slate-200 rounded-xl shadow-sm bg-white h-[180px] custom-scrollbar overflow-y-auto">
                <table class="w-full text-[11px] text-left">
                  <thead class="bg-slate-50 font-black text-slate-600 uppercase sticky top-0">
                    <tr>
                      <th class="px-3 py-2 border-b">Masalah</th>
                      <th class="px-3 py-2 border-b">Kemungkinan</th>
                      <th class="px-3 py-2 border-b">Solusi</th>
                    </tr>
                  </thead>
                  <tbody class="text-slate-600 font-medium divide-y divide-slate-100">
                    <tr>
                      <td class="px-3 py-2">Akun terkunci</td>
                      <td class="px-3 py-2">Salah kata sandi > 5x</td>
                      <td class="px-3 py-2">Hubungi Admin untuk reset</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2">Error 403 Forbidden</td>
                      <td class="px-3 py-2">Role akses terlarang</td>
                      <td class="px-3 py-2">Minta admin cek setelan role</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2">Scale Reading tidak terbaca</td>
                      <td class="px-3 py-2">Kabel serial timbangan lepas</td>
                      <td class="px-3 py-2">Kencangkan kabel COM/USB timbangan</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2">Upload Gagal</td>
                      <td class="px-3 py-2">Ukuran file melebihi 10MB</td>
                      <td class="px-3 py-2">Kompres gambar ke resolusi lebih rendah</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2">Sesi login habis tiba-tiba</td>
                      <td class="px-3 py-2">Token akses kedaluwarsa</td>
                      <td class="px-3 py-2">Sistem otomatis meminta relogin</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
        </div>

        <!-- Footer -->
        <div class="px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-center shrink-0 gap-3"
          style="background: #FAFBFF; border-top: 1px solid #E8EEF7;">
          <p class="text-[10px] sm:text-[11px] text-slate-500 font-medium italic text-center sm:text-left flex items-center">
            <span class="material-icons text-amber-500 text-[14px] mr-1.5">info</span>
            Butuh bantuan teknis lebih lanjut? Hubungi Admin Utama: 
            <a href="mailto:rahmat.auliya@kapalapi.co.id?subject=GMS%20Support%20Request" class="text-[#4A8BDF] font-bold hover:underline ml-1">rahmat.auliya@kapalapi.co.id</a>
          </p>
          <button @click="close" class="w-full sm:w-auto group relative overflow-hidden flex justify-center items-center space-x-1.5 px-6 py-2.5 rounded-xl transition-all duration-300 hover:shadow-md active:scale-[0.97]"
            style="background: linear-gradient(135deg, #4A8BDF, #3A6ABF); box-shadow: 0 4px 12px rgba(74,139,223,0.25);">
            <span class="text-xs font-black text-white uppercase tracking-widest">Mengerti</span>
          </button>
        </div>

      </div>
    </div>
  </transition>
  </teleport>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'

const props = defineProps({
  isOpen: { type: Boolean, required: true }
})
const emit = defineEmits(['close'])
const close = () => emit('close')
</script>

<style scoped>
.modal-enter-active { transition: opacity 0.3s ease-out; }
.modal-leave-active { transition: opacity 0.2s ease-in; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.modal-enter-active .modal-panel {
  animation: modalSpringUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.modal-leave-active .modal-panel {
  animation: modalDown 0.2s ease-in forwards;
}
@keyframes modalSpringUp {
  0%   { opacity: 0; transform: translateY(30px) scale(0.95); }
  60%  { opacity: 1; transform: translateY(-2px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes modalDown {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(10px) scale(0.97); }
}
</style>
