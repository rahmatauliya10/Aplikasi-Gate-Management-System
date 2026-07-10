import { defineStore } from 'pinia';
import warehouseService from '../services/warehouseService';
import { handleApiError } from '../utils/apiError';
import { useNotificationStore } from './notificationStore';

export const useWarehouseStore = defineStore('warehouse', {
  state: () => ({
    loading: false,
    error: null,
  }),
  actions: {
    async startProcess(id, payload) {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await warehouseService.startProcess(id, payload);
        return response.data;
      } catch (error) {
        const parsedError = handleApiError(error);
        this.error = parsedError.message;
        notificationStore.addNotification('Error', this.error, 'error');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async completeProcess(id, payload) {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await warehouseService.completeProcess(id, payload);
        return response.data;
      } catch (error) {
        const parsedError = handleApiError(error);
        this.error = parsedError.message;
        notificationStore.addNotification('Error', this.error, 'error');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async submitIncomingCheck(id, payload) {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await warehouseService.submitIncomingCheck(id, payload);
        return response.data;
      } catch (error) {
        const parsedError = handleApiError(error);
        this.error = parsedError.message;
        notificationStore.addNotification('Error', this.error, 'error');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async completeQcAnalysis(id) {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await warehouseService.completeQcAnalysis(id);
        return response.data;
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
