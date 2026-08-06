/**
 * ============================================
 * GMS - Truck Service
 * ============================================
 * Handles: truck registration, listing, updates, status tracking
 * Connects to: /transactions/* endpoints
 * ============================================
 */

import api from './api'

const truckService = {
  /**
   * Get all trucks with optional filters
   * @param {Object} params - { status, step, search, page, limit }
   */
  getAll(params) {
    return api.get('/transactions', { params })
  },

  /**
   * Get single truck by ID
   * @param {Number|String} id
   */
  getById(id) {
    return api.get(`/transactions/${id}`)
  },

  /**
   * Register new truck (gate check-in)
   * @param {Object} data - { licensePlate, driverName, origin, destination, cargo, doNumber }
   */
  register(data) {
    return api.post('/transactions', data)
  },

  /**
   * Update truck details
   * @param {Number|String} id
   * @param {Object} data
   */
  update(id, data) {
    return api.put(`/transactions/${id}`, data)
  },

  /**
   * Update truck status/step
   * @param {Number|String} id
   * @param {Object} data - { status, step }
   */
  updateStatus(id, data) {
    return api.patch(`/transactions/${id}/status`, data)
  },

  /**
   * Get active trucks (not completed)
   */
  getActive() {
    return api.get('/transactions/active')
  },

  /**
   * Get completed trucks (history)
   * @param {Object} params - { startDate, endDate, page, limit }
   */
  getCompleted(params) {
    return api.get('/transactions', { params: { ...params, status: 'COMPLETED' } })
  },

  /**
   * Cancel a transaction
   * @param {Number|String} id 
   * @param {String} reason 
   */
  cancel(id, reason) {
    return api.post(`/transactions/${id}/cancel`, { cancellationReason: reason })
  },

  /**
   * Correct completed transaction (ADMIN only)
   * @param {Number|String} id 
   * @param {Object} data - { reason, evidenceUrl, grossWeight, tareWeight, actualWeight, etc. }
   */
  correct(id, data) {
    return api.post(`/transactions/${id}/corrections`, data)
  },

  /**
   * Get correction history for a transaction (ADMIN only)
   * @param {Number|String} id 
   */
  getCorrections(id) {
    return api.get(`/transactions/${id}/corrections`)
  },

  /**
   * Correct operation log across modules (ADMIN only, fail-closed atomic)
   */
  correctOperationLog(id, data) {
    return api.post(`/transactions/${id}/operation-log-corrections`, data)
  },

  /**
   * Get operation log correction history and attribution (ADMIN only)
   */
  getOperationLogCorrections(id) {
    return api.get(`/transactions/${id}/operation-log-corrections`)
  },

  /**
   * Delete a transaction completely
   * @param {Number|String} id 
   */
  delete(id) {
    return api.delete(`/transactions/${id}`)
  }
}

export default truckService
