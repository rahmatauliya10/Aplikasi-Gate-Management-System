import { defineStore } from 'pinia';
import weighbridgeService from '../services/weighbridgeService';
import { handleApiError } from '../utils/apiError';
import { useNotificationStore } from './notificationStore';

export const useWeighbridgeStore = defineStore('weighbridge', {
  state: () => ({
    queue: [],
    loading: false,
    error: null,
  }),
  actions: {
    async submitWeighIn(id, payload) {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await weighbridgeService.weighIn(id, payload);
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

    async submitWeighOut(id, payload) {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await weighbridgeService.weighOut(id, payload);
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

    async getWeighbridgeQueue() {
      this.loading = true;
      this.error = null;
      const notificationStore = useNotificationStore();
      try {
        const response = await weighbridgeService.getQueue();
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
