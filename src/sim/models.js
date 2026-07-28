(function initializeModels(namespace) {
  let nextId = 1;

  function createId(prefix) {
    const id = `${prefix}-${String(nextId).padStart(4, '0')}`;
    nextId += 1;
    return id;
  }

  function uniqueValues(values) {
    return Array.from(new Set(values));
  }

  function terrainExists(terrainId) {
    return namespace.data.terrainTypes.some((terrain) => terrain.id === terrainId);
  }

  function traitExists(traitId) {
    return Boolean(namespace.resources.naturalTraitById[traitId]);
  }

  function resourceExists(resourceId) {
    return Boolean(namespace.resources.resourceById[resourceId]);
  }

  function createProvinceConstruction(options = {}) {
    return {
      projects: Array.isArray(options.projects) ? [...options.projects] : [],
      history: Array.isArray(options.history) ? [...options.history] : [],
      nextProjectNumber: Math.max(1, Number(options.nextProjectNumber) || 1)
    };
  }

  function createResourceSite(options = {}) {
    const resourceId = options.resourceId || null;
    if (!resourceId || !resourceExists(resourceId)) {
      throw new Error(`Unknown resource type: ${resourceId}`);
    }
    return {
      id: options.id || createId('site'),
      resourceId,
      buildingId: options.buildingId || null,
      level: Math.max(0, Math.floor(Number(options.level) || 0)),
      workerCap: Math.max(0, Math.floor(Number(options.workerCap) || 0)),
      pendingWorkerCap: Number.isFinite(options.pendingWorkerCap)
        ? Math.max(0, Math.floor(options.pendingWorkerCap))
        : null,
      actualWorkers: Math.max(0, Math.floor(Number(options.actualWorkers) || 0)),
      seasonalAccrual: { ...(options.seasonalAccrual || {}) },
      pendingRemoval: Boolean(options.pendingRemoval),
      createdOrder: Math.max(1, Number(options.createdOrder) || nextId),
      status: options.status || 'Idle'
    };
  }

  function createRegion(options = {}) {
    const terrainId = options.terrainId || 'plains';
    const cleanTraits = uniqueValues(options.traits || []);
    if (!terrainExists(terrainId)) throw new Error(`Unknown terrain type: ${terrainId}`);
    cleanTraits.forEach((traitId) => {
      if (!traitExists(traitId)) throw new Error(`Unknown natural trait: ${traitId}`);
    });

    return {
      id: options.id || createId('region'),
      name: options.name || 'Unsurveyed Region',
      terrainId,
      traits: cleanTraits,
      neighbors: uniqueValues(options.neighbors || []),
      ownerId: options.ownerId || null,
      controllerId: options.controllerId || null,
      discovered: Boolean(options.discovered),
      resourceSites: Array.isArray(options.resourceSites)
        ? options.resourceSites.map((site) => createResourceSite(site))
        : [],
      construction: createProvinceConstruction(options.construction),
      resourceCandidates: [...(options.resourceCandidates || [])],
      polygonArea: Number(options.polygonArea) || 0,
      areaKm2: Number(options.areaKm2) || 0,
      resourceCapacity: Number(options.resourceCapacity) || 0,
      resourceCapacityUsed: Number(options.resourceCapacityUsed) || 0,
      waterCapacity: Number(options.waterCapacity) || 0,
      waterCapacityUsed: Number(options.waterCapacityUsed) || 0,
      combinedNaturalPotential: Number(options.combinedNaturalPotential) || 0,
      notes: options.notes || ''
    };
  }

  function createCity(options = {}) {
    const id = options.id || createId('city');
    const regionId = options.regionId || null;
    const controlledRegionIds = options.controlledRegionIds || [];
    const isCapital = Boolean(options.isCapital || options.settlementIdentity === 'capital');
    const settlementKind = options.settlementKind === 'village' || options.settlementIdentity === 'village'
      ? 'village'
      : 'urban';
    let settlementTier = options.settlementTier || options.level || (settlementKind === 'village' ? 'village' : 'town');
    if (isCapital && settlementTier === 'village') settlementTier = 'town';
    const settlementIdentity = isCapital
      ? 'capital'
      : settlementKind === 'village'
        ? 'village'
        : settlementTier === 'town' ? 'town' : 'city';
    const capitalId = isCapital ? id : (options.capitalId || null);
    const parentTownId = settlementKind === 'village' ? (options.parentTownId || null) : null;
    return {
      id,
      name: options.name || (isCapital ? 'State Capital' : settlementKind === 'village' ? 'New Village' : 'New Town'),
      level: settlementTier,
      settlementTier,
      settlementKind,
      settlementIdentity,
      isCapital,
      capitalId,
      parentTownId,
      specialtyId: settlementKind === 'village' ? (options.specialtyId || null) : null,
      administrativeCenterId: isCapital ? id : (parentTownId || capitalId),
      controlZoneCenterId: settlementKind === 'village' ? parentTownId : id,
      controlZoneRadius: settlementKind === 'village' ? 0 : 3,
      stateSchemaVersion: 1,
      regionId,
      controlledRegionIds: uniqueValues(regionId ? [regionId, ...controlledRegionIds] : controlledRegionIds),
      population: Number(options.population ?? 1000),
      commoners: Number(options.commoners ?? 996),
      nobles: Number(options.nobles ?? 4),
      workforceTotal: Number(options.workforceTotal ?? 600),
      workforceAssigned: Number(options.workforceAssigned) || 0,
      workforceAvailable: Number(options.workforceAvailable ?? options.workforceTotal ?? 600),
      housingCapacity: Math.max(0, Number(options.housingCapacity) || 0),
      founderHousing: Math.max(0, Number(options.founderHousing) || 0),
      residentialDistrictLevels: Math.max(0, Math.floor(Number(options.residentialDistrictLevels) || 0)),
      residentialDistrictLevelOrders: Array.isArray(options.residentialDistrictLevelOrders) ? [...options.residentialDistrictLevelOrders] : [],
      residentialDistrictDisabledLevels: Math.max(0, Math.floor(Number(options.residentialDistrictDisabledLevels) || 0)),
      residentialMaintenancePriority: options.residentialMaintenancePriority || 'normal',
      pendingResidentialMaintenancePriority: options.pendingResidentialMaintenancePriority || null,
      residentialMaintenanceCoverage: Number.isFinite(Number(options.residentialMaintenanceCoverage)) ? Math.max(0, Math.min(1, Number(options.residentialMaintenanceCoverage))) : 1,
      satisfaction: Number.isFinite(Number(options.satisfaction)) ? Number(options.satisfaction) : 60,
      satisfactionPenalty: options.satisfactionPenalty ? { ...options.satisfactionPenalty } : null,
      lifecycleProjectId: options.lifecycleProjectId || null,
      processingBuildings: Array.isArray(options.processingBuildings)
        ? options.processingBuildings.map((building) => ({ ...building }))
        : [],
      administrativeBuildings: Array.isArray(options.administrativeBuildings)
        ? options.administrativeBuildings.map((building) => ({ ...building }))
        : [],
      medicalBuildings: Array.isArray(options.medicalBuildings)
        ? options.medicalBuildings.map((building) => ({ ...building }))
        : [],
      health: Number.isFinite(Number(options.health)) ? Number(options.health) : 50,
      healthSettings: { ...(options.healthSettings || {}) },
      demographics: { ...(options.demographics || {}) },
      storage: { ...(options.storage || {}) }
    };
  }

  function createOutpost(options = {}) {
    const id = options.id || createId('outpost');
    const originSettlementId = options.originSettlementId || options.originCityId || null;
    return {
      id,
      name: options.name || 'New Outpost',
      settlementIdentity: 'outpost',
      settlementKind: 'outpost',
      settlementTier: 'outpost',
      stateSchemaVersion: 1,
      regionId: options.regionId || null,
      capitalId: options.capitalId || null,
      originSettlementId,
      originCityId: originSettlementId,
      administrativeCenterId: originSettlementId,
      parentTownId: null,
      population: Math.max(0, Number(options.population) || 0),
      workforceTotal: Math.max(0, Number(options.workforceTotal) || 0),
      workforceAssigned: Math.max(0, Number(options.workforceAssigned) || 0),
      workforceAvailable: Math.max(0, Number(options.workforceAvailable) || 0),
      housingCapacity: Math.max(0, Number(options.housingCapacity) || 0),
      foundingDistance: Math.max(0, Math.floor(Number(options.foundingDistance) || 0)),
      conversionProjectId: options.conversionProjectId || null,
      upkeep: { food: 0, money: 0, soldiers: 0, ...(options.upkeep || {}) },

      storage: { ...(options.storage || {}) },
      resourceSiteLimit: 1
    };
  }

  function createResourceStockpile(initialValues = {}) {
    const stockpile = {};
    Object.entries(initialValues).forEach(([resourceId, amount]) => {
      if (!resourceExists(resourceId)) throw new Error(`Unknown resource type: ${resourceId}`);
      stockpile[resourceId] = Math.max(0, Number(amount) || 0);
    });
    return stockpile;
  }

  function createModelSummary() {
    return {
      terrainTypes: namespace.data.terrainTypes.length,
      resourceTypes: namespace.resources.resourceTypes.length,
      resourceSites: namespace.resources.resourceSites.length,
      naturalTraits: namespace.resources.naturalTraits.length,
      factories: ['Province', 'Expandable Resource Site', 'Processing Building', 'Construction Queue', 'City', 'Outpost', 'Resource Stockpile']
    };
  }

  namespace.models = Object.freeze({
    createProvinceConstruction,
    createResourceSite,
    createRegion,
    createCity,
    createOutpost,
    createResourceStockpile,
    createModelSummary
  });
})(window.EcoRuler = window.EcoRuler || {});
