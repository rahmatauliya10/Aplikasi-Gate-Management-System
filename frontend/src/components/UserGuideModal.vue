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
              <p class="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Panduan singkat penggunaan aplikasi Gate Management System</p>
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
            <p class="text-sm text-slate-700 font-medium">Panduan ini berisi langkah-langkah penggunaan fitur utama aplikasi GMS (Gate Management System) untuk masing-masing role (Administrator, Security, Warehouse, dan QC). Silakan pilih bagian yang sesuai dengan role Anda.</p>
          </div>

          <!-- Section 2: Quick Start -->
          <div class="space-y-3">
            <h3 class="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span class="material-icons text-[#4A8BDF] text-lg">bolt</span> Quick Start / Panduan Cepat
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
                <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-2 font-black">1</div>
                <h4 class="text-xs font-black text-slate-800 mb-1">Login</h4>
                <p class="text-[10px] text-slate-500 font-medium">Login ke aplikasi menggunakan akun Anda.</p>
              </div>
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
                <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-2 font-black">2</div>
                <h4 class="text-xs font-black text-slate-800 mb-1">Pilih Menu</h4>
                <p class="text-[10px] text-slate-500 font-medium">Pilih menu sesuai dengan role dan tugas Anda.</p>
              </div>
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
                <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-2 font-black">3</div>
                <h4 class="text-xs font-black text-slate-800 mb-1">Input Data</h4>
                <p class="text-[10px] text-slate-500 font-medium">Input atau update data kendaraan & barang.</p>
              </div>
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
                <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-2 font-black">4</div>
                <h4 class="text-xs font-black text-slate-800 mb-1">Submit & Monitor</h4>
                <p class="text-[10px] text-slate-500 font-medium">Submit dan monitor status proses kendaraan.</p>
              </div>
            </div>
          </div>

          <!-- Section 3: Roles -->
          <div class="space-y-3">
            <h3 class="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span class="material-icons text-[#A0006D] text-lg">groups</span> Panduan Berdasarkan Role
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Security -->
              <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <span class="material-icons text-[#4A8BDF]">security</span>
                  <h4 class="text-sm font-black text-slate-800">Security</h4>
                </div>
                <div class="p-4 space-y-3 text-xs text-slate-600 font-medium">
                  <p class="font-bold text-slate-800">Gate Check-In:</p>
                  <ol class="list-decimal pl-4 space-y-1">
                    <li>Login sebagai Security.</li>
                    <li>Buka menu <b>Gate Check-In</b>.</li>
                    <li>Input data kendaraan, driver name, dan driver phone number.</li>
                    <li>Pilih destination / tujuan proses.</li>
                    <li>Input cargo information.</li>
                    <li>Upload / isi data yang diperlukan, lalu klik <b>Submit</b>.</li>
                    <li>Pastikan status kendaraan berhasil masuk ke flow berikutnya.</li>
                  </ol>
                  <p class="font-bold text-slate-800 mt-2 border-t pt-2">Gate Check-Out:</p>
                  <ol class="list-decimal pl-4 space-y-1">
                    <li>Buka kendaraan yang sudah selesai proses.</li>
                    <li>Cek data akhir kendaraan.</li>
                    <li>Validasi status proses.</li>
                    <li>Klik <b>Check-Out</b> jika data sudah sesuai.</li>
                  </ol>
                </div>
              </div>

              <!-- Warehouse -->
              <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <span class="material-icons text-amber-500">warehouse</span>
                  <h4 class="text-sm font-black text-slate-800">Warehouse</h4>
                </div>
                <div class="p-4 space-y-3 text-xs text-slate-600 font-medium">
                  <ol class="list-decimal pl-4 space-y-1">
                    <li>Login sebagai Warehouse.</li>
                    <li>Buka daftar kendaraan yang menunggu proses warehouse.</li>
                    <li>Cek detail kendaraan dan cargo.</li>
                    <li>Update proses loading / unloading.</li>
                    <li>Isi data pendukung jika diperlukan.</li>
                    <li>Submit status warehouse.</li>
                  </ol>
                </div>
              </div>

              <!-- QC -->
              <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <span class="material-icons text-emerald-500">biotech</span>
                  <h4 class="text-sm font-black text-slate-800">Quality Control (QC)</h4>
                </div>
                <div class="p-4 space-y-3 text-xs text-slate-600 font-medium">
                  <ol class="list-decimal pl-4 space-y-1">
                    <li>Login sebagai QC.</li>
                    <li>Buka daftar kendaraan yang membutuhkan inspeksi QC.</li>
                    <li>Cek detail barang.</li>
                    <li>Input hasil pengecekan QC.</li>
                    <li>Pilih status release / hold / reject jika tersedia.</li>
                    <li>Submit hasil QC.</li>
                  </ol>
                </div>
              </div>

              <!-- Administrator -->
              <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <span class="material-icons text-indigo-500">admin_panel_settings</span>
                  <h4 class="text-sm font-black text-slate-800">Administrator</h4>
                </div>
                <div class="p-4 space-y-3 text-xs text-slate-600 font-medium">
                  <ol class="list-decimal pl-4 space-y-1">
                    <li>Login sebagai Administrator.</li>
                    <li>Monitor semua proses dari Dashboard.</li>
                    <li>Kelola user jika tersedia di menu User Management.</li>
                    <li>Cek dashboard dan status operasional kendaraan.</li>
                    <li>Pastikan role user sudah sesuai.</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 4: Status Proses -->
          <div class="space-y-3">
            <h3 class="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span class="material-icons text-emerald-500 text-lg">timeline</span> Status Proses
            </h3>
            <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-xs font-medium space-y-2">
              <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-orange-500"></span> <b>Pending:</b> Menunggu proses selanjutnya.</div>
              <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-[#4A8BDF]"></span> <b>In Progress:</b> Sedang dikerjakan oleh tim terkait.</div>
              <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-emerald-500"></span> <b>Completed:</b> Tahapan proses berhasil diselesaikan.</div>
              <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-red-500"></span> <b>Rejected / Hold:</b> Terdapat kendala atau ditolak.</div>
              <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-slate-500"></span> <b>Checked Out:</b> Kendaraan telah keluar dari fasilitas.</div>
            </div>
          </div>

          <!-- Section 5 & 6: Tips & Troubleshooting -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <!-- Tips -->
            <div class="space-y-3">
              <h3 class="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <span class="material-icons text-amber-500 text-lg">lightbulb</span> Tips Penggunaan
              </h3>
              <ul class="list-disc pl-5 text-xs text-slate-600 font-medium space-y-2 bg-white border border-slate-200 rounded-xl shadow-sm p-4 h-[180px] overflow-y-auto">
                <li>Pastikan data kendaraan benar sebelum submit.</li>
                <li>Jangan refresh halaman saat proses submit.</li>
                <li>Gunakan role sesuai akses masing-masing.</li>
                <li>Jika muncul error 403, cek role dan akses user Anda.</li>
                <li>Jika muncul error 502, cek koneksi backend/server.</li>
                <li>Jika data tidak muncul, coba refresh atau logout-login ulang.</li>
              </ul>
            </div>

            <!-- Troubleshooting -->
            <div class="space-y-3">
              <h3 class="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <span class="material-icons text-red-500 text-lg">build</span> Troubleshooting
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
                      <td class="px-3 py-2">Tidak bisa login</td>
                      <td class="px-3 py-2">Salah email/password</td>
                      <td class="px-3 py-2">Cek kembali email & password</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2">Error 403 Access Denied</td>
                      <td class="px-3 py-2">Role tidak sesuai</td>
                      <td class="px-3 py-2">Login dengan role yang benar</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2">Error 502</td>
                      <td class="px-3 py-2">Server down</td>
                      <td class="px-3 py-2">Hubungi tim IT</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2">Data tidak tersimpan</td>
                      <td class="px-3 py-2">Koneksi terputus</td>
                      <td class="px-3 py-2">Refresh dan input ulang</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2">Tombol submit diam</td>
                      <td class="px-3 py-2">Proses di latar</td>
                      <td class="px-3 py-2">Tunggu beberapa saat</td>
                    </tr>
                    <tr>
                      <td class="px-3 py-2">Logout gagal</td>
                      <td class="px-3 py-2">Cache browser</td>
                      <td class="px-3 py-2">Clear cache browser</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Section 7: FAQ -->
          <div class="space-y-3">
            <h3 class="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span class="material-icons text-[#4A8BDF] text-lg">help</span> FAQ (Tanya Jawab)
            </h3>
            <div class="space-y-2">
              <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <p class="text-xs font-black text-slate-800">Q: Siapa yang bisa mengakses semua menu?</p>
                <p class="text-xs text-slate-600 font-medium mt-1">A: Hanya role Administrator yang memiliki akses ke seluruh menu.</p>
              </div>
              <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <p class="text-xs font-black text-slate-800">Q: Kenapa menu saya berbeda dengan user lain?</p>
                <p class="text-xs text-slate-600 font-medium mt-1">A: Tampilan menu disesuaikan berdasarkan Role masing-masing user untuk fokus kerja.</p>
              </div>
              <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <p class="text-xs font-black text-slate-800">Q: Apa yang harus dilakukan jika salah input data?</p>
                <p class="text-xs text-slate-600 font-medium mt-1">A: Segera hubungi Administrator untuk meminta perbaikan data atau pembatalan proses.</p>
              </div>
              <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <p class="text-xs font-black text-slate-800">Q: Kenapa data kendaraan tidak muncul?</p>
                <p class="text-xs text-slate-600 font-medium mt-1">A: Pastikan kendaraan sudah didaftarkan (Check-In) dan koneksi internet stabil.</p>
              </div>
              <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <p class="text-xs font-black text-slate-800">Q: Kapan kendaraan boleh di-check out?</p>
                <p class="text-xs text-slate-600 font-medium mt-1">A: Setelah seluruh rangkaian operasional dan pengecekan QC (jika ada) telah berstatus Completed/Released.</p>
              </div>
            </div>
          </div>
          
        </div>

        <!-- Footer -->
        <div class="px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-center shrink-0 gap-3"
          style="background: #FAFBFF; border-top: 1px solid #E8EEF7;">
          <p class="text-[11px] text-slate-500 font-medium italic text-center sm:text-left flex items-center">
            <span class="material-icons text-amber-500 text-[14px] mr-1.5">info</span>
            Jika masih mengalami kendala, hubungi Administrator atau tim support aplikasi GMS.
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
