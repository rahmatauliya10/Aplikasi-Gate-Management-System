/**
 * ============================================
 * GMS - Warehouse Service
 * ============================================
 * Handles: GBB, GBJ, GSP warehouse processes
 * Connects to: /warehouse/* endpoints
 * ============================================
 */

import api from './api'

const warehouseService = {
  /**
   * Get trucks in warehouse queue
   * @param {Object} params - { type: 'gbb'|'gbj'|'gsp', status }
   */
  getQueue(params) {
    return api.get('/warehouse/queue', { params })
  },

  /**
   * Start warehouse process for a truck
   * @param {Number|String} truckId
   * @param {Object} data - { type: 'gbb'|'gbj'|'gsp', operator }
   */
  startProcess(truckId, data) {
    return api.post(`/warehouse/start/${truckId}`, data)
  },

  /**
   * Complete warehouse process for a truck
   * @param {Number|String} truckId
   * @param {Object} data - { type, rollWeight, productDetails, notes }
   */
  completeProcess(truckId, data) {
    return api.post(`/warehouse/complete/${truckId}`, data)
  },

  /**
   * Get warehouse process details for a truck
   * @param {Number|String} truckId
   */
  getProcessDetail(truckId) {
    return api.get(`/warehouse/process/${truckId}`)
  },

  /**
   * Get warehouse activity log
   * @param {Object} params - { type, date, page, limit }
   */
  getActivity(params) {
    return api.get('/warehouse/activity', { params })
  },

  /**
   * Complete QC Analysis for GBB
   * @param {Number|String} truckId
   */
  completeQcAnalysis(truckId, data = {}) {
    return api.post(`/warehouse/complete-qc-analysis/${truckId}`, data)
  }
}

export default warehouseService
