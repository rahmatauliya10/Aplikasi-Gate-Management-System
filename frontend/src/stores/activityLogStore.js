import { defineStore } from 'pinia';
import { ref } from 'vue';
import { activityLogApi } from '../api/activityLogApi';

export const useActivityLogStore = defineStore('activityLog', () => {
  const logs = ref([]);
  const loading = ref(false);
  const error = ref(null);
  const pagination = ref({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const filters = ref({ search: '', module: '', status: '', startDate: '', endDate: '' });

  const fetchLogs = async (page = 1) => {
    loading.value = true;
    error.value = null;
    try {
      const response = await activityLogApi.getLogs({
        page,
        limit: pagination.value.limit,
        ...filters.value,
      });
      logs.value = response.data.data;
      pagination.value = response.data.meta;
    } catch (err) {
      error.value = err.gmsMessage || err.response?.data?.message || 'Failed to load activity logs. Please try again.';
      console.error(err);
    } finally {
      loading.value = false;
    }
  };

  const applyFilters = (newFilters) => {
    filters.value = { ...filters.value, ...newFilters };
    fetchLogs(1);
  };

  const clearFilters = () => {
    filters.value = { search: '', module: '', status: '', startDate: '', endDate: '' };
    fetchLogs(1);
  };

  return {
    logs,
    loading,
    error,
    pagination,
    filters,
    fetchLogs,
    applyFilters,
    clearFilters,
  };
});
