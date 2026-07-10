import { defineStore } from 'pinia';
import dashboardService from '../services/dashboardService';
import { handleApiError } from '../utils/apiError';
import { useNotificationStore } from './notificationStore';

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    summary: null,
    leadTime: null,
    queueOverview: null,
    loading: false,
    error: null,
  }),
  actions: {
    async fetchSummary() {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await dashboardService.getSummary();
        this.summary = response.data;
        return this.summary;
      } catch (error) {
        const parsedError = handleApiError(error);
        this.error = parsedError.message;
        notificationStore.addNotification('Error', this.error, 'error');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchLeadTime() {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await dashboardService.getLeadTime();
        this.leadTime = response.data;
        return this.leadTime;
      } catch (error) {
        const parsedError = handleApiError(error);
        this.error = parsedError.message;
        notificationStore.addNotification('Error', this.error, 'error');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchQueueOverview() {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await dashboardService.getQueueOverview();
        this.queueOverview = response.data;
        return this.queueOverview;
      } catch (error) {
        const parsedError = handleApiError(error);
        this.error = parsedError.message;
        notificationStore.addNotification('Error', this.error, 'error');
        throw error;
      } finally {
        this.loading = false;
      }
    }
  }
});
