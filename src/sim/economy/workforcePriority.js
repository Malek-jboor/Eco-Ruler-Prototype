(function initializeWorkforcePriority(namespace) {
  const EPSILON = 0.000001;

  function typeIdForResource(resourceId) {
    return namespace.workforcePriorityData.resourceTypeByResourceId[resourceId] || resourceId;
  }

  function typeIdForEntry(entry) {
    return entry.kind === 'resource'
      ? typeIdForResource(entry.target.resourceId)
      : entry.target.buildingId;
  }

  function definition(typeId) {
    return namespace.workforcePriorityData.byId[typeId]
      || Object.freeze({
        id: typeId,
        label: String(typeId).split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
        kind: 'unknown',
        sourceId: typeId
      });
  }

  function discoveredTypeIds(state) {
    const ids = [];
    (state.map.regions || []).forEach((region) => (region.resourceSites || []).forEach((site) => {
      ids.push(typeIdForResource(site.resourceId));
    }));
    (state.player.cities || []).forEach((city) => {
      (city.processingBuildings || []).forEach((building) => ids.push(building.buildingId));
      (city.administrativeBuildings || []).forEach((building) => ids.push(building.buildingId));
      (city.medicalBuildings || []).forEach((building) => ids.push(building.buildingId));
    });
    return Array.from(new Set(ids));
  }

  function normalizeOrder(state, requested) {
    const known = namespace.workforcePriorityData.defaultIds;
    const allowed = Array.from(new Set([...known, ...discoveredTypeIds(state)]));
    const allowedSet = new Set(allowed);
    const result = [];
    (Array.isArray(requested) ? requested : []).forEach((id) => {
      if (allowedSet.has(id) && !result.includes(id)) result.push(id);
    });
    allowed.forEach((id) => {
      if (!result.includes(id)) result.push(id);
    });
    return result;
  }

  function ensureState(state) {
    state.player.workforcePriority = state.player.workforcePriority || {};
    const priority = state.player.workforcePriority;
    priority.order = normalizeOrder(state, priority.order);
    priority.pendingOrder = Array.isArray(priority.pendingOrder)
      ? normalizeOrder(state, priority.pendingOrder)
      : null;
    return priority;
  }

  function activeOrder(state) {
    return ensureState(state).order.slice();
  }

  function displayedOrder(state) {
    const priority = ensureState(state);
    return (priority.pendingOrder || priority.order).slice();
  }

  function requestOrder(state, requested) {
    const priority = ensureState(state);
    const normalized = normalizeOrder(state, requested);
    if (normalized.length !== priority.order.length
      || new Set(normalized).size !== normalized.length) {
      return { ok: false, reason: 'The Workforce Priority order is incomplete.' };
    }
    priority.pendingOrder = normalized;
    return { ok: true, order: normalized.slice(), applies: 'next-daily-tick' };
  }

  function requestMove(state, sourceId, targetId) {
    const order = displayedOrder(state);
    const sourceIndex = order.indexOf(sourceId);
    const targetIndex = order.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return { ok: false, reason: 'Workforce Priority type was not found.' };
    }
    order.splice(sourceIndex, 1);
    order.splice(order.indexOf(targetId), 0, sourceId);
    return requestOrder(state, order);
  }

  function requestMoveByDelta(state, typeId, delta) {
    const order = displayedOrder(state);
    const index = order.indexOf(typeId);
    const nextIndex = Math.max(0, Math.min(order.length - 1, index + Number(delta || 0)));
    if (index < 0 || index === nextIndex) return { ok: false, reason: 'This type is already at the list boundary.' };
    order.splice(index, 1);
    order.splice(nextIndex, 0, typeId);
    return requestOrder(state, order);
  }

  function requestReset(state) {
    const extras = displayedOrder(state).filter((id) => !namespace.workforcePriorityData.byId[id]);
    return requestOrder(state, [...namespace.workforcePriorityData.defaultIds, ...extras]);
  }

  function applyPending(state) {
    const priority = ensureState(state);
    if (!priority.pendingOrder) return { applied: false, order: priority.order.slice() };
    priority.order = priority.pendingOrder.slice();
    priority.pendingOrder = null;
    return { applied: true, order: priority.order.slice() };
  }

  function entryForResource(pair) {
    return { kind: 'resource', region: pair.region, target: pair.site };
  }

  function cityEntries(state, city) {
    if (namespace.satisfaction) namespace.satisfaction.ensureSettlement(city);
    return [
      ...namespace.workforce.citySites(state, city).map(entryForResource),
      ...namespace.workforce.cityProcessingBuildings(city).map((building) => ({
        kind: 'processing', region: namespace.manufacturing.settlementRegion(state, city), target: building
      })),
      ...(city.administrativeBuildings || []).map((building) => ({
        kind: 'administration', region: namespace.manufacturing.settlementRegion(state, city), target: building
      })),
      ...(city.medicalBuildings || []).map((building) => ({
        kind: 'medical', region: namespace.manufacturing.settlementRegion(state, city), target: building
      })),
      ...(namespace.satisfaction ? Object.values(city.satisfactionServices || {}).map((service) => ({
        kind: 'service', region: namespace.manufacturing.settlementRegion(state, city), target: service
      })) : [])
    ];
  }

  function outpostEntries(state, outpost) {
    return namespace.workforce.outpostSites(state, outpost).map(entryForResource);
  }

  function requestedWorkers(state, entry) {
    const required = entry.kind === 'resource'
      ? namespace.workforce.requiredWorkers(entry.target)
      : entry.kind === 'service'
        ? Math.max(0, Number(entry.target.requiredWorkers) || 0)
        : entry.kind === 'administration'
          ? namespace.administration.requiredWorkers(state, entry.target)
          : entry.kind === 'medical'
            ? namespace.health.requiredWorkers(state, entry.target)
            : namespace.manufacturing.requiredWorkers(state, entry.target);
    return {
      required,
      cap: Math.min(required, Math.max(0, Number(entry.target.workerCap) || 0))
    };
  }

  function isFullyDisabled(entry) {
    return entry.kind !== 'service' && Boolean(namespace.developmentEconomy
      && namespace.developmentEconomy.activeLevels(entry.target) <= 0);
  }

  function setStatus(state, entry, required, cap, disabled) {
    const target = entry.target;
    if (disabled) target.status = 'Capacity Disabled';
    else if (cap <= EPSILON || target.actualWorkers <= EPSILON) target.status = 'Unstaffed';
    else if (target.actualWorkers + EPSILON < required) target.status = 'Understaffed';
    else target.status = 'Active';
  }

  function allocatePool(state, entries, total, poolId, poolName) {
    const order = activeOrder(state);
    const byType = new Map();
    const prepared = entries.map((entry) => {
      const typeId = typeIdForEntry(entry);
      const demand = requestedWorkers(state, entry);
      const disabledLevels = Math.max(0, Math.floor(Number(entry.target.capacityDisabledLevels) || 0));
      const totalLevels = Math.max(0, Math.floor(Number(entry.target.level) || 0));
      const retainedDemand = totalLevels > 0
        ? demand.required * Math.min(totalLevels, disabledLevels) / totalLevels
        : 0;
      const retainedWorkers = Math.min(
        Math.max(0, Number(entry.target.actualWorkers) || 0),
        retainedDemand
      );
      const disabled = totalLevels > 0 && disabledLevels >= totalLevels;
      const activeCap = disabled ? 0 : Math.max(0, demand.cap - retainedWorkers);
      const preparedEntry = {
        ...entry,
        ...demand,
        typeId,
        disabled,
        disabledLevels,
        retainedWorkers,
        activeCap,
        poolId,
        poolName
      };
      if (!byType.has(typeId)) byType.set(typeId, []);
      byType.get(typeId).push(preparedEntry);
      return preparedEntry;
    });

    const poolTotal = Math.max(0, Number(total) || 0);
    const rawRetained = prepared.reduce((sum, entry) => sum + entry.retainedWorkers, 0);
    const retainedScale = rawRetained > poolTotal + EPSILON ? poolTotal / rawRetained : 1;
    let retained = 0;
    prepared.forEach((entry) => {
      entry.retainedWorkers *= retainedScale;
      entry.target.actualWorkers = entry.retainedWorkers;
      retained += entry.retainedWorkers;
      if (entry.disabled) setStatus(state, entry, entry.required, entry.cap, true);
    });
    const allocatable = Math.max(0, poolTotal - retained);
    let remaining = allocatable;

    order.forEach((typeId) => {
      const group = (byType.get(typeId) || [])
        .filter((entry) => !entry.disabled && entry.activeCap > EPSILON);
      const requested = group.reduce((sum, entry) => sum + entry.activeCap, 0);
      const ratio = requested > EPSILON ? Math.min(1, remaining / requested) : 0;
      group.forEach((entry) => {
        entry.target.actualWorkers = entry.retainedWorkers + entry.activeCap * ratio;
        setStatus(state, entry, entry.required, entry.cap, false);
      });
      remaining = Math.max(0, remaining - requested * ratio);
    });

    prepared.filter((entry) => !entry.disabled && entry.activeCap <= EPSILON).forEach((entry) => {
      entry.target.actualWorkers = entry.retainedWorkers;
      setStatus(state, entry, entry.required, entry.cap, false);
    });
    return {
      entries: prepared,
      retained,
      assigned: retained + (allocatable - remaining),
      available: remaining
    };
  }

  function allocateCity(state, city) {
    const result = allocatePool(state, cityEntries(state, city), city.workforceTotal, city.id, city.name);
    city.workforceAssigned = result.assigned;
    city.workforceAvailable = result.available;
    return city;
  }

  function allocateOutpost(state, outpost) {
    const result = allocatePool(state, outpostEntries(state, outpost), outpost.workforceTotal, outpost.id, outpost.name);
    outpost.workforceAssigned = result.assigned;
    outpost.workforceAvailable = result.available;
    return outpost;
  }

  function summaries(state) {
    ensureState(state);
    const rows = Object.fromEntries(displayedOrder(state).map((id) => [id, {
      ...definition(id), requested: 0, actual: 0, shortage: 0, settlements: new Set()
    }]));
    const pools = [
      ...(state.player.cities || []).map((city) => ({ id: city.id, name: city.name, entries: cityEntries(state, city) })),
      ...(state.player.outposts || []).map((outpost) => ({ id: outpost.id, name: outpost.name, entries: outpostEntries(state, outpost) }))
    ];
    pools.forEach((pool) => pool.entries.forEach((entry) => {
      const id = typeIdForEntry(entry);
      const row = rows[id] || (rows[id] = {
        ...definition(id), requested: 0, actual: 0, shortage: 0, settlements: new Set()
      });
      const demand = requestedWorkers(state, entry);
      if (isFullyDisabled(entry) || demand.cap <= EPSILON) return;
      row.requested += demand.cap;
      row.actual += Math.max(0, Number(entry.target.actualWorkers) || 0);
      row.settlements.add(pool.id);
    }));
    return displayedOrder(state).map((id) => {
      const row = rows[id];
      return {
        ...row,
        shortage: Math.max(0, row.requested - row.actual),
        affectedSettlements: row.settlements.size,
        settlements: undefined
      };
    });
  }

  namespace.workforcePriority = Object.freeze({
    typeIdForResource,
    typeIdForEntry,
    definition,
    discoveredTypeIds,
    normalizeOrder,
    ensureState,
    activeOrder,
    displayedOrder,
    requestOrder,
    requestMove,
    requestMoveByDelta,
    requestReset,
    applyPending,
    cityEntries,
    outpostEntries,
    requestedWorkers,
    isFullyDisabled,
    allocatePool,
    allocateCity,
    allocateOutpost,
    summaries
  });
})(window.EcoRuler = window.EcoRuler || {});
