export const updateTimestampsByStatus = (truck, newStatus, warehouseCode) => {
  const now = new Date().toISOString();
  
  if (!truck.timestamps) {
    truck.timestamps = {
      gateInAt: null,
      weighInAt: null,
      qcVehicleStartAt: null,
      qcVehicleEndAt: null,
      warehouseStartAt: null,
      warehouseEndAt: null,
      incomingCheckStartAt: null,
      incomingCheckEndAt: null,
      weighOutAt: null,
      gateOutAt: null,
      completedAt: null
    };
  }

  // Handle timestamp updates according to rules
  switch(newStatus) {
    case 'REGISTERED':
      if (!truck.timestamps.gateInAt) truck.timestamps.gateInAt = now;
      break;
    case 'WEIGH_IN_DONE':
    case 'QC_VEHICLE_PENDING':
      if (!truck.timestamps.weighInAt) truck.timestamps.weighInAt = now;
      break;
    case 'QC_VEHICLE_PASSED':
    case 'QC_VEHICLE_HOLD':
    case 'QC_VEHICLE_REJECTED':
      truck.timestamps.qcVehicleEndAt = now;
      break;
    case 'WAREHOUSE_IN_PROGRESS':
      if (!truck.timestamps.warehouseStartAt) truck.timestamps.warehouseStartAt = now;
      break;
    case 'WAREHOUSE_DONE':
    case 'INCOMING_CHECK_PENDING':
      truck.timestamps.warehouseEndAt = now;
      break;
    case 'INCOMING_CHECK_IN_PROGRESS':
      if (!truck.timestamps.incomingCheckStartAt) truck.timestamps.incomingCheckStartAt = now;
      break;
    case 'INCOMING_CHECK_PASSED':
    case 'INCOMING_CHECK_HOLD':
    case 'INCOMING_CHECK_REJECTED':
      truck.timestamps.incomingCheckEndAt = now;
      break;
    case 'WEIGH_OUT_DONE':
      if (!truck.timestamps.weighOutAt) truck.timestamps.weighOutAt = now;
      break;
    case 'COMPLETED':
      if (!truck.timestamps.gateOutAt) truck.timestamps.gateOutAt = now;
      if (!truck.timestamps.completedAt) truck.timestamps.completedAt = now;
      break;
  }
};
