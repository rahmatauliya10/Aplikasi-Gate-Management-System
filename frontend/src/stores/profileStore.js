import { defineStore } from 'pinia';
import { getErrorMessage } from '../utils/errorMessage';

export const useProfileStore = defineStore('profile', {
  state: () => ({
    profileData: null,
    loading: false,
    error: null,
  }),
  getters: {
    // Add getters here if needed
  },
  actions: {
    async fetchProfilePlaceholder() {
      this.loading = true;
      this.error = null;
      try {
        // TODO: Replace with actual backend API call
        // const response = await api.get('/profile');
        // this.profileData = response.data;
      } catch (error) {
        this.error = error.gmsMessage || getErrorMessage(error);
      } finally {
        this.loading = false;
      }
    }
  }
});
