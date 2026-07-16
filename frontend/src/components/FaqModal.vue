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
                <span class="material-icons text-[#4A8BDF] text-xl sm:text-2xl">forum</span>
              </div>
              <div>
                <h2 class="text-lg sm:text-xl font-black text-[#4A8BDF] tracking-tight">Frequently Asked Questions</h2>
                <p class="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Tanya Jawab Cepat Seputar Operasional & Kendala GMS</p>
              </div>
            </div>
            <button @click="close"
              class="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 hover:bg-red-50 hover:text-red-500 text-slate-400">
              <span class="material-icons text-lg">close</span>
            </button>
          </div>

          <!-- Search Bar -->
          <div class="px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center relative">
            <span class="material-icons text-slate-400 absolute left-8 sm:left-10">search</span>
            <input 
              v-model="searchQuery" 
              type="text" 
              placeholder="Cari pertanyaan atau kata kunci kendala..."
              class="w-full pl-10 pr-4 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#4A8BDF] focus:ring-1 focus:ring-[#4A8BDF] transition-all bg-white font-medium"
            />
            <button 
              v-if="searchQuery" 
              @click="searchQuery = ''" 
              class="absolute right-8 sm:right-10 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <span class="material-icons text-sm sm:text-base">clear</span>
            </button>
          </div>

          <!-- Body -->
          <div class="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar space-y-4" style="background: #F8FAFC;">
            <!-- Category Tabs -->
            <div class="flex gap-2 overflow-x-auto pb-2 shrink-0">
              <button 
                v-for="cat in categories" 
                :key="cat.id"
                @click="selectedCategory = cat.id"
                class="px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-300 border"
                :class="selectedCategory === cat.id 
                  ? 'bg-[#E6F0FA] border-[#4A8BDF] text-[#4A8BDF] shadow-sm' 
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'"
              >
                {{ cat.name }}
              </button>
            </div>

            <!-- FAQ List -->
            <div v-if="filteredFaqs.length > 0" class="space-y-3">
              <div 
                v-for="(faq, idx) in filteredFaqs" 
                :key="idx" 
                class="bg-white border rounded-xl overflow-hidden shadow-sm transition-all duration-300"
                :class="openIndex === idx ? 'border-[#4A8BDF]/50 ring-1 ring-[#4A8BDF]/10' : 'border-slate-200'"
              >
                <!-- Question Header -->
                <button 
                  @click="toggleFaq(idx)"
                  class="w-full px-4 py-3.5 text-left flex justify-between items-center gap-3 transition-colors hover:bg-slate-50/50"
                >
                  <span class="text-xs sm:text-sm font-black text-slate-800 leading-snug">
                    {{ faq.question }}
                  </span>
                  <span 
                    class="material-icons text-slate-400 transition-transform duration-300 shrink-0"
                    :class="{ 'rotate-180 text-[#4A8BDF]': openIndex === idx }"
                  >
                    keyboard_arrow_down
                  </span>
                </button>

                <!-- Answer Content -->
                <div 
                  class="transition-all duration-300 ease-in-out"
                  :style="openIndex === idx ? 'max-height: 500px; opacity: 1;' : 'max-height: 0px; opacity: 0; overflow: hidden;'"
                >
                  <div class="px-4 pb-4 pt-1 text-[11px] sm:text-xs text-slate-600 font-medium leading-relaxed border-t border-slate-50">
                    <div v-html="faq.answer" class="space-y-2"></div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-12">
              <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <span class="material-icons text-3xl">sentiment_dissatisfied</span>
              </div>
              <h4 class="text-xs sm:text-sm font-bold text-slate-700">Pertanyaan tidak ditemukan</h4>
              <p class="text-[10px] sm:text-xs text-slate-500 font-medium mt-1">Coba gunakan kata kunci lain atau pilih kategori yang berbeda.</p>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-center shrink-0 gap-3"
            style="background: #FAFBFF; border-top: 1px solid #E8EEF7;">
            <p class="text-[10px] sm:text-[11px] text-slate-500 font-medium italic text-center sm:text-left flex items-center">
              <span class="material-icons text-[#4A8BDF] text-[14px] mr-1.5">contact_support</span>
              Butuh bantuan lebih lanjut? Hubungi Admin via email: 
              <a href="mailto:rahmat.auliya@kapalapi.co.id?subject=GMS%20Help%20Request" class="text-[#4A8BDF] hover:underline ml-1 font-bold">rahmat.auliya@kapalapi.co.id</a>
            </p>
            <button @click="close" class="w-full sm:w-auto group relative overflow-hidden flex justify-center items-center space-x-1.5 px-6 py-2.5 rounded-xl transition-all duration-300 hover:shadow-md active:scale-[0.97]"
              style="background: linear-gradient(135deg, #4A8BDF, #3A6ABF); box-shadow: 0 4px 12px rgba(74,139,223,0.25);">
              <span class="text-xs font-black text-white uppercase tracking-widest">Tutup</span>
            </button>
          </div>

        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  isOpen: { type: Boolean, required: true }
})
const emit = defineEmits(['close'])

const close = () => emit('close')

const searchQuery = ref('')
const selectedCategory = ref('all')
const openIndex = ref(null)

const categories = [
  { id: 'all', name: 'Semua Kategori' },
  { id: 'flow', name: 'Alur Transaksi' },
  { id: 'security', name: 'Akun & Keamanan' },
  { id: 'weigh', name: 'Timbangan & Antrean' },
  { id: 'docs', name: 'Dokumen & Lampiran' }
]

const faqs = [
  {
    category: 'flow',
    question: 'Mengapa pelat nomor saya bertanda "Duplicate Active Transaction"?',
    answer: 'Kendaraan tersebut sudah didaftarkan (Gate In) dan masih berada di dalam area pabrik (berstatus aktif/belum Gate Out). Transaksi lama harus diselesaikan hingga status **Completed** atau dibatalkan oleh operator dengan hak akses yang sesuai sebelum kendaraan tersebut dapat Check-In kembali.'
  },
  {
    category: 'flow',
    question: 'Bagaimana cara membatalkan transaksi yang salah input saat Check-In?',
    answer: 'Selama kendaraan belum menimbang masuk (**Weigh-In**), transaksi dapat dibatalkan melalui menu detail transaksi. Klik tombol **Cancel Transaction**, masukkan alasan pembatalan yang logis, lalu lakukan Check-In ulang dengan data yang benar.'
  },
  {
    category: 'security',
    question: 'Saya mendapat pesan "PASSWORD_CHANGE_REQUIRED", apa yang harus dilakukan?',
    answer: 'Untuk alasan keamanan data operasional, administrator mewajibkan Anda untuk memperbarui kata sandi sementara Anda. Akses Anda ke menu operasional dibatasi sampai Anda mengganti kata sandi melalui formulir **Change Password**.'
  },
  {
    category: 'security',
    question: 'Bagaimana cara mereset password akun saya yang terkunci atau lupa?',
    answer: 'Silakan hubungi Administrator Utama (Bpk. Rahmat Auliya) melalui email di <a href="mailto:rahmat.auliya@kapalapi.co.id?subject=GMS%20Password%20Reset%20Request" class="text-[#4A8BDF] font-bold hover:underline">rahmat.auliya@kapalapi.co.id</a>. Akun Anda akan di-reset dengan kata sandi sementara yang berlaku selama 24 jam.'
  },
  {
    category: 'weigh',
    question: 'Mengapa Berat Bersih (Net Weight) bernilai 0 di timbangan keluar?',
    answer: 'Hal ini terjadi secara otomatis jika transaksi berstatus ditolak (**Rejected**) baik oleh pihak QC maupun Gudang, sehingga tidak ada rekonsiliasi material bersih yang ditimbang. Kondisi ini juga terjadi jika timbang masuk (Weigh-In) belum pernah diproses.'
  },
  {
    category: 'weigh',
    question: 'Bagaimana cara mengatasi error "Tare weight must be less than Gross weight"?',
    answer: 'Validasi ini memastikan bahwa berat kosong kendaraan (Tara) selalu lebih ringan dari berat isi muatan (Bruto). Jika nilai tara lebih besar/sama dengan bruto, sistem akan menolak submit. Harap verifikasi keakuratan pembacaan skala timbangan lokal Anda.'
  },
  {
    category: 'weigh',
    question: 'Bagaimana pembagian alur antrean untuk proses GBB, GBJ, dan GSP?',
    answer: '<ul><li><b>GBB (Gudang Bahan Baku):</b> Gate In -> Timbang Masuk (Bruto) -> QC & Incoming Check -> Bongkar Muatan -> Timbang Keluar (Tara) -> Gate Out.</li><li><b>GBJ (Gudang Barang Jadi):</b> Gate In -> Timbang Masuk (Tara) -> QC Check -> Muat Barang -> Timbang Keluar (Bruto) -> Gate Out.</li><li><b>GSP (Gudang Suku Cadang):</b> Alur logistik internal non-produksi dengan validasi timbang minimal.</li></ul>'
  },
  {
    category: 'docs',
    question: 'Mengapa unggahan foto/dokumen surat jalan saya ditolak oleh sistem?',
    answer: 'GMS memiliki batas keamanan upload berkas:<ul><li>Maksimum ukuran file: <b>10 MB</b>.</li><li>Format berkas yang didukung: <b>JPG, JPEG, PNG, dan PDF</b>.</li></ul>Jika file melebihi batas, kompres terlebih dahulu sebelum mengunggah.'
  }
]

// Reset open index when category or search query changes
watch([selectedCategory, searchQuery], () => {
  openIndex.value = null
})

const toggleFaq = (idx) => {
  openIndex.value = openIndex.value === idx ? null : idx
}

const filteredFaqs = computed(() => {
  return faqs.filter(faq => {
    // Filter by Category
    const matchesCat = selectedCategory.value === 'all' || faq.category === selectedCategory.value
    
    // Filter by Search Query
    const query = searchQuery.value.toLowerCase().trim()
    const matchesSearch = !query || 
      faq.question.toLowerCase().includes(query) || 
      faq.answer.toLowerCase().includes(query)

    return matchesCat && matchesSearch
  })
})
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
