import { defineStore } from 'pinia';
import gateService from '../services/gateService';
import { handleApiError } from '../utils/apiError';
import { useNotificationStore } from './notificationStore';

export const useGateStore = defineStore('gate', {
  state: () => ({
    gateData: null,
    queue: [],
    loading: false,
    error: null,
  }),
  actions: {
    async checkIn(payload) {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await gateService.checkIn(payload);
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
    
    async checkOut(id, payload) {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await gateService.checkOut(id, payload);
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

    async getGateQueue() {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await gateService.getQueue();
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
    }
  }
});
