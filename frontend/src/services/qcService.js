/**
 * ============================================
 * GMS - QC (Quality Control) Service
 * ============================================
 * Handles: QC inspection, verification, approval/rejection
 * Connects to: /qc/* endpoints
 * ============================================
 */

import api from './api'

const qcService = {
  /**
   * Get trucks waiting for QC inspection
   */
  getQueue() {
    return api.get('/qc/queue')
  },

  /**
   * Start QC inspection
   * @param {Number|String} truckId
   * @param {Object} data - { inspector }
   */
  startInspection(truckId, data) {
    return api.post(`/qc/start/${truckId}`, data)
  },

  /**
   * Start Product Analysis (PA) inspection for GSP
   * @param {Number|String} transactionId
   */
  startProductAnalysis(transactionId) {
    return api.post(`/qc/product-analysis/${transactionId}/start`)
  },

  /**
   * Get Product Analysis (PA) history and rounds for GSP
   * @param {Number|String} transactionId
   */
  getProductAnalysisHistory(transactionId) {
    return api.get(`/qc/product-analysis/${transactionId}`)
  },

  previewPaCorrection(transactionId, data) {
    return api.post(`/transactions/${transactionId}/pa-correction-preview`, data)
  },

  /**
   * Submit QC Vehicle result (approve/reject) - For GBJ
   * @param {Number|String} transactionId
   * @param {Object} data - { result: 'PASS'|'REJECT', vehicleCleanliness, ... }
   */
  submitVehicleResult(transactionId, data) {
    return api.post(`/qc/vehicle-result/${transactionId}`, data)
  },

  /**
   * Submit QC Incoming Material result (approve/reject) - For GBB/GSP
   * @param {Number|String} transactionId
   * @param {Object} data - { result: 'PASS'|'REJECT', odor, color, moisture, ... }
   */
  submitIncomingResult(transactionId, data) {
    return api.post(`/qc/incoming-result/${transactionId}`, data)
  },

  /**
   * Get QC detail for a truck
   * @param {Number|String} truckId
   */
  getDetail(truckId) {
    return api.get(`/qc/detail/${truckId}`)
  },

  /**
   * Get QC history/records
   * @param {Object} params - { date, status, page, limit }
   */
  getHistory(params) {
    return api.get('/qc/history', { params })
  }
}

export default qcService
