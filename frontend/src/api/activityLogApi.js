import api from '../services/api';

export const activityLogApi = {
  getLogs(params) {
    return api.get('/activity-logs', { params });
  },
};
