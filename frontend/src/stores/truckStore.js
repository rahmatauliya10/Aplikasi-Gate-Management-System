import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useNotificationStore } from './notificationStore'
import { updateTimestampsByStatus } from '../utils/timeFlow'
import truckService from '../services/truckService'
import { getErrorMessage } from '../utils/errorMessage'

export const useTruckStore = defineStore('truck', () => {
    // State
    const trucks = ref([])
    const loading = ref(false)
    const error = ref(null)

    // Actions
    const fetchTrucks = async () => {
        loading.value = true;
        error.value = null;
        try {
            const response = await truckService.getActive();
            const data = response.data;
            if (Array.isArray(data)) {
                trucks.value = data;
            } else if (data && Array.isArray(data.data)) {
                trucks.value = data.data;
            } else {
                trucks.value = data || [];
            }
        } catch (err) {
            console.error('[truckStore] API fetch failed:', err.message);
            error.value = err.gmsMessage || getErrorMessage(err);
            throw err;
        } finally {
            loading.value = false;
        }
    }

    const addTruck = async (truck) => {
        loading.value = true;
        error.value = null;
        try {
            const gateService = (await import('../services/gateService')).default;
            const response = await gateService.checkIn(truck);
            const backendData = response.data?.data || response.data;
            
            const newTruck = upsertTruck(backendData);
            const notificationStore = useNotificationStore()
            notificationStore.addNotification('New Truck Registered', `Truck ${truck.plateNumber || 'New'} has been added to the system.`, 'success')
            return newTruck;
        } catch (err) {
            error.value = err.gmsMessage || getErrorMessage(err);
            throw err;
        } finally {
            loading.value = false;
        }
    }

    const updateTruckStatus = (id, newStatus) => {
        // Now mostly handled by fetchTrucks after action
        // We can just trigger a fetchTrucks or minimally update local if needed
        const truck = trucks.value.find(t => String(t.id) === String(id))
        if (truck) {
            truck.status = newStatus
            updateTimestampsByStatus(truck, newStatus, truck.processType)
            
            const notificationStore = useNotificationStore()
            notificationStore.addNotification('Truck Status Updated', `Truck ${truck.plateNumber || id} is now ${newStatus}.`, 'info')
        }
    }

    const cancelTruck = async (id, reason) => {
        loading.value = true;
        error.value = null;
        try {
            const response = await truckService.cancel(id, reason);
            const cancelledTruck = response.data?.data || response.data;
            const index = trucks.value.findIndex(t => String(t.id) === String(id));
            if (index !== -1) {
                trucks.value[index] = { ...trucks.value[index], ...cancelledTruck };
            }
            const notificationStore = useNotificationStore();
            notificationStore.addNotification('Registration Cancelled', `Truck registration has been successfully cancelled.`, 'warning');
        } catch (err) {
            error.value = err.gmsMessage || getErrorMessage(err);
            throw err;
        } finally {
            loading.value = false;
        }
    }

    const deleteTruck = async (id) => {
        loading.value = true;
        error.value = null;
        try {
            await truckService.delete(id);
            trucks.value = trucks.value.filter(t => String(t.id) !== String(id));
            const notificationStore = useNotificationStore();
            notificationStore.addNotification('Data Deleted', `Truck record has been deleted permanently.`, 'info');
        } catch (err) {
            error.value = err.gmsMessage || getErrorMessage(err);
            throw err;
        } finally {
            loading.value = false;
        }
    }

    const correctTruck = async (id, correctionData) => {
        loading.value = true;
        error.value = null;
        try {
            const response = await truckService.correct(id, correctionData);
            const resultData = response.data?.data;
            if (resultData && resultData.updatedTx) {
                upsertTruck(resultData.updatedTx);
            }
            const notificationStore = useNotificationStore();
            notificationStore.addNotification('Data Corrected', 'Transaction data successfully corrected by Admin.', 'success');
            return resultData;
        } catch (err) {
            error.value = err.gmsMessage || getErrorMessage(err);
            throw err;
        } finally {
            loading.value = false;
        }
    }

    const updateTruckWeight = (id, type, weight) => {
        const truck = trucks.value.find(t => String(t.id) === String(id))
        if (truck) {
            truck.weights = truck.weights || { gross: 0, tare: 0, net: 0, rollWeight: 0 }
            truck.weights[type] = weight

            if (truck.weights.gross && truck.weights.tare) {
                truck.weights.net = Math.abs(truck.weights.gross - truck.weights.tare)
            }
            
            const notificationStore = useNotificationStore()
            notificationStore.addNotification('Weight Recorded', `${type} weight for truck ${truck.plateNumber || id} recorded as ${weight}kg.`, 'info')
        }
    }

    const updateTruckDetails = (id, details) => {
        const truck = trucks.value.find(t => String(t.id) === String(id))
        if (truck) {
            Object.assign(truck, details)
            
            const notificationStore = useNotificationStore()
            notificationStore.addNotification('Truck Details Updated', `Details for truck ${truck.plateNumber || id} have been updated.`, 'info')
        }
    }

    const upsertTruck = (backendData) => {
        if (!backendData || !backendData.id) return null;
        const index = trucks.value.findIndex(t => String(t.id) === String(backendData.id));
        if (index !== -1) {
            Object.assign(trucks.value[index], backendData);
            return trucks.value[index];
        } else {
            trucks.value.unshift(backendData);
            return backendData;
        }
    }

    // Getters
    const getTruckById = (id) => {
        return trucks.value.find(t => String(t.id) === String(id))
    }

    const activeTrucks = computed(() => {
        return trucks.value.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
    })

    const completedTrucks = computed(() => {
        return trucks.value.filter(t => t.status === 'COMPLETED')
    })

    return {
        trucks,
        loading,
        error,
        fetchTrucks,
        addTruck,
        updateTruckStatus,
        cancelTruck,
        deleteTruck,
        correctTruck,
        updateTruckWeight,
        updateTruckDetails,
        upsertTruck,
        getTruckById,
        activeTrucks,
        completedTrucks
    }
})
