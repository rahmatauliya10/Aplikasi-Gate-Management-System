import api from './api'

const settingsService = {
  async getBackupStatus() {
    const response = await api.get('/settings/database/status')
    return response.data
  },

  async getBackupHistory() {
    const response = await api.get('/settings/database/history')
    return response.data
  },

  async triggerBackup(type = 'MANUAL_EXPLICIT') {
    const response = await api.post('/settings/database/trigger', { type })
    return response.data
  },

  async downloadBackup() {
    const response = await api.post('/settings/database/backup', {}, {
      responseType: 'blob',
      timeout: 60000,
    })
    return response
  },

  async restoreDatabase(backupData, adminPassword) {
    const response = await api.post('/settings/database/restore', {
      backupData,
      adminPassword,
    }, {
      timeout: 90000,
    })
    return response.data
  }
}

export default settingsService
