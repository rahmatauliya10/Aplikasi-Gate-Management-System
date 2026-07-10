/**
 * ============================================
 * GMS - Error Message Utility
 * ============================================
 * Centralized error handler to convert technical
 * errors into human-readable Indonesian messages.
 * ============================================
 */

export const getErrorMessage = (error) => {
  // If it's from our global exception filter, backend already gives formatted message
  if (error?.response?.data?.message && typeof error.response.data.message === 'string') {
    return error.response.data.message;
  }

  // If backend couldn't format it, map based on status
  const status = error?.response?.status;

  if (error?.message === 'Network Error' || error?.code === 'ERR_NETWORK') {
    return 'Tidak bisa terhubung ke server.';
  }

  switch (status) {
    case 400:
      return 'Data yang diisi belum sesuai. Periksa kembali form.';
    case 401:
      return 'Sesi login sudah habis. Silakan login ulang.';
    case 403:
      return 'Anda tidak memiliki akses ke halaman ini.';
    case 404:
      return 'Data atau halaman tidak ditemukan.';
    case 409:
      return 'Data sudah ada atau terjadi duplikasi.';
    case 422:
      return 'Validasi data gagal. Periksa field yang wajib diisi.';
    case 500:
      return 'Terjadi kesalahan pada server. Hubungi administrator.';
    case 502:
    case 503:
    case 504:
      return 'Server backend tidak merespons. Pastikan backend aktif dan port API benar.';
    default:
      // Fallback
      return error?.message || 'Terjadi kesalahan yang tidak diketahui.';
  }
};
