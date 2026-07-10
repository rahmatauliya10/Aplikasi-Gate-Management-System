import { defineStore } from 'pinia';
import qcService from '../services/qcService';
import { handleApiError } from '../utils/apiError';
import { useNotificationStore } from './notificationStore';

export const useQcStore = defineStore('qc', {
  state: () => ({
    queue: [],
    loading: false,
    error: null,
  }),
  actions: {
    async getQcQueue() {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await qcService.getQueue();
        this.queue = response.data;
        return this.queue;
      } catch (error) {
        const parsedError = handleApiError(error);
        this.error = parsedError.message;
        notificationStore.addNotification('Error', this.error, 'error');
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async startQcVehicle(id, payload) {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await qcService.startInspection(id, payload);
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

    async submitVehicleResult(id, payload) {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await qcService.submitVehicleResult(id, payload);
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

    async submitIncomingResult(id, payload) {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await qcService.submitIncomingResult(id, payload);
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
