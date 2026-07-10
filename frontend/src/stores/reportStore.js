import { defineStore } from 'pinia';
import { getErrorMessage } from '../utils/errorMessage';

export const useReportStore = defineStore('report', {
  state: () => ({
    reportData: null,
    loading: false,
    error: null,
  }),
  getters: {
    // Add getters here if needed
  },
  actions: {
    async fetchReportPlaceholder() {
      this.loading = true;
      this.error = null;
      try {
        // TODO: Replace with actual backend API call
        // const response = await api.get('/report');
        // this.reportData = response.data;
      } catch (error) {
        this.error = error.gmsMessage || getErrorMessage(error);
      } finally {
        this.loading = false;
      }
    }
  }
});
