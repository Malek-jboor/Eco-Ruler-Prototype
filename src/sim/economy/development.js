(function initializeDevelopmentEconomy(namespace) {
  const DAYS = 120;
  const EPSILON = 0.000001;
  const REFERENCE_PROVINCE_AREA_KM2 = 5500;
  const siteClasses = {
    wheat: 'low', vegetables: 'low', cotton: 'low', herbs: 'low', fruit: 'low',
    honey: 'low', deer: 'low', foxes: 'low', sheep: 'medium', cattle: 'medium',
    horses: 'medium', fish: 'medium', pearls: 'medium', wood: 'medium',
    stone: 'medium', clay: 'medium', sand: 'medium', salt: 'high',
    copper: 'high', tin: 'high'
  };

  const round = (value) => Math.round((Number(value) || 0) * 1000000) / 1000000;
  const activeLevels = (target) => Math.max(0,
    Math.floor(Number(target.level) || 0) - Math.floor(Number(target.capacityDisabledLevels) || 0));
  const footprint = (id) => Number(namespace.developmentData.footprints[id]) || 0;
  const profile = (city) => namespace.developmentData.settlementLevels[city.settlementTier || city.level]
    || namespace.developmentData.settlementLevels.village;
  const floorTenth = (value) => Math.floor((Math.max(0, Number(value) || 0) + EPSILON) * 10) / 10;

  function specialtyFor(city) {
    if (!city || (city.settlementKind !== 'village' && city.settlementIdentity !== 'village')) return null;
    return namespace.developmentData.villageSpecialties[city.specialtyId] || null;
  }

  function specialtyMatches(city, resourceId) {
    const specialty = specialtyFor(city);
    const resources = specialty && namespace.developmentData.specialtyResources[specialty.id];
    return Boolean(resources && resources.has(resourceId));
  }

  function developmentCapacityFor(city, region) {
    const settlement = profile(city);
    const area = Math.max(0, Number(region && region.areaKm2) || REFERENCE_PROVINCE_AREA_KM2);
    const specialty = specialtyFor(city);
    const multiplier = specialty ? specialty.developmentMultiplier : 1;
    const calculated = settlement.referenceDevelopmentCapacity * area / REFERENCE_PROVINCE_AREA_KM2 * multiplier;
    return floorTenth((city.settlementKind === 'village' || city.settlementIdentity === 'village')
      ? Math.max(1, calculated)
      : calculated);
  }

  function resourceCapacityProfile(city, region) {
    const raw = Math.max(0, Number(region && region.baseResourceCapacity) || 0);
    const settlement = profile(city);
    const specialty = specialtyFor(city);
    const landMultiplier = specialty ? specialty.landResourceMultiplier : settlement.landResourceMultiplier;
    const general = floorTenth(raw * landMultiplier);
    const specialtyBonus = specialty ? floorTenth(raw * specialty.matchingResourceBonus) : 0;
    return {
      raw,
      general,
      specialtyBonus,
      total: round(general + specialtyBonus),
      specialtyId: specialty ? specialty.id : null
    };
  }

  function canBuildProcessing(city, buildingId) {
    const definition = namespace.manufacturingData.processingBuildings[buildingId];
    if (!definition) return { allowed: false, reason: 'Processing building definition was not found.' };
    if (city.isCapital) {
      return definition.locations.includes('capital')
        ? { allowed: true }
        : { allowed: false, reason: 'This building is not allowed in the State Capital.' };
    }
    if (city.settlementKind === 'village' || city.settlementIdentity === 'village') {
      const specialty = specialtyFor(city);
      if (!specialty) return { allowed: false, reason: 'Choose the Village specialty before constructing processing buildings.' };
      return specialty.allowedBuildings.includes(buildingId)
        ? { allowed: true }
        : { allowed: false, reason: `A ${specialty.label} cannot construct this building.` };
    }
    const tier = city.settlementTier || city.level || 'town';
    return definition.locations.includes(tier)
      ? { allowed: true }
      : { allowed: false, reason: `This building is not allowed in a ${tier}.` };
  }

  function specialtyCards(city, region) {
    return Object.values(namespace.developmentData.villageSpecialties).map((specialty) => ({
      ...specialty,
      eligible: specialty.id === 'trade' || specialty.id === 'military'
        || (region.resourceCandidates || []).some((candidate) => (
          candidate.available && namespace.developmentData.specialtyResources[specialty.id].has(candidate.resourceId)
        )),
      developmentCapacity: floorTenth(Math.max(1,
        profile(city).referenceDevelopmentCapacity
          * (Math.max(0, Number(region.areaKm2) || REFERENCE_PROVINCE_AREA_KM2) / REFERENCE_PROVINCE_AREA_KM2)
          * specialty.developmentMultiplier)),
      generalResourceCapacity: floorTenth((Number(region.baseResourceCapacity) || 0) * specialty.landResourceMultiplier),
      matchingResourceBonus: floorTenth((Number(region.baseResourceCapacity) || 0) * specialty.matchingResourceBonus)
    }));
  }

  function research(state) {
    const value = state.player.research && state.player.research.completed;
    if (Array.isArray(value)) return new Set(value);
    return new Set(value ? Object.keys(value).filter((id) => value[id]) : []);
  }

  function nextOrder(state) {
    state.nextDevelopmentLevelOrder = (Number(state.nextDevelopmentLevelOrder) || 0) + 1;
    return state.nextDevelopmentLevelOrder;
  }

  function ensureOrders(state, target, count) {
    target.levelOrders = Array.isArray(target.levelOrders) ? target.levelOrders : [];
    while (target.levelOrders.length < count) target.levelOrders.push(nextOrder(state));
    target.levelOrders.length = count;
  }

  function defaults(state, target) {
    ensureOrders(state, target, Math.max(0, Math.floor(Number(target.level) || 0)));
    target.capacityDisabledLevels = Math.max(0, Math.floor(Number(target.capacityDisabledLevels) || 0));
    target.maintenancePriority = target.maintenancePriority || 'normal';
    target.toolPriority = target.toolPriority || 'normal';
    target.toolMode = target.toolMode || 'no-tools';
    target.assignedTools = {
      simple: Math.max(0, Number(target.assignedTools && target.assignedTools.simple) || 0),
      bronze: Math.max(0, Number(target.assignedTools && target.assignedTools.bronze) || 0)
    };
  }

  function ensureState(state) {
    const ledger = state.storage;
    ledger.warehouseLevelsByRegion = { ...(ledger.warehouseLevelsByRegion || {}) };
    ledger.warehouseLevelOrdersByRegion = { ...(ledger.warehouseLevelOrdersByRegion || {}) };
    ledger.warehouseDisabledLevelsByRegion = { ...(ledger.warehouseDisabledLevelsByRegion || {}) };
    ledger.warehouseMaintenancePriorityByRegion = { ...(ledger.warehouseMaintenancePriorityByRegion || {}) };
    ledger.pendingWarehouseMaintenancePriorityByRegion = { ...(ledger.pendingWarehouseMaintenancePriorityByRegion || {}) };
    if (!Object.keys(ledger.warehouseLevelsByRegion).length && ledger.warehouseLevels && ledger.warehouseRegionId) {
      ledger.warehouseLevelsByRegion[ledger.warehouseRegionId] = ledger.warehouseLevels;
    }
    Object.keys(ledger.warehouseLevelsByRegion).forEach((regionId) => {
      const count = Math.max(0, Math.floor(Number(ledger.warehouseLevelsByRegion[regionId]) || 0));
      ledger.warehouseLevelsByRegion[regionId] = count;
      const holder = { levelOrders: ledger.warehouseLevelOrdersByRegion[regionId] };
      ensureOrders(state, holder, count);
      ledger.warehouseLevelOrdersByRegion[regionId] = holder.levelOrders;
    });
    (state.player.cities || []).forEach((city) => {
      city.level = namespace.developmentData.settlementLevels[city.level] ? city.level : 'village';
      city.settlementTier = namespace.developmentData.settlementLevels[city.settlementTier] ? city.settlementTier : city.level;
      if (city.settlementKind !== 'village' && city.settlementIdentity !== 'village') city.specialtyId = null;
      city.processingBuildings = city.processingBuildings || [];
      city.processingBuildings.forEach((item) => defaults(state, item));
      city.administrativeBuildings = city.administrativeBuildings || [];
      city.administrativeBuildings.forEach((item) => defaults(state, item));
      city.medicalBuildings = city.medicalBuildings || [];
      city.medicalBuildings.forEach((item) => defaults(state, item));
      city.residentialDistrictLevels = Math.max(0, Math.floor(Number(city.residentialDistrictLevels) || 0));
      city.residentialDistrictLevelOrders = Array.isArray(city.residentialDistrictLevelOrders) ? city.residentialDistrictLevelOrders : [];
      city.residentialMaintenancePriority = city.residentialMaintenancePriority || 'normal';
      city.pendingResidentialMaintenancePriority = city.pendingResidentialMaintenancePriority || null;
      city.residentialMaintenanceCoverage = Math.max(0, Math.min(1, Number.isFinite(Number(city.residentialMaintenanceCoverage)) ? Number(city.residentialMaintenanceCoverage) : 1));
      const region = namespace.resourceSites.regionById(state, city.regionId);
      if (region && !Number.isFinite(Number(region.baseResourceCapacity))) {
        region.baseResourceCapacity = Math.max(0, Number(region.resourceCapacity) || 0);
      }
    });
    state.map.regions.forEach((region) => (region.resourceSites || []).forEach((item) => defaults(state, item)));
  }

  function reservations(region, type) {
    return namespace.constructionQueue.ensureQueue(region).projects.reduce((sum, project) => (
      ['active', 'waiting', 'paused'].includes(project.status)
      && project.capacityReservation && project.capacityReservation.type === type
        ? sum + Math.max(0, Number(project.capacityReservation.points) || 0) : sum
    ), 0);
  }

  function disableNewest(levels, budget, disable) {
    let active = levels.reduce((sum, item) => sum + item.points, 0);
    levels.slice().sort((a, b) => b.order - a.order).forEach((item) => {
      if (active <= budget + EPSILON) return;
      active -= item.points;
      disable(item);
    });
    return Math.max(0, active);
  }

  function activeWarehouseLevels(state, regionId) {
    return Math.max(0, Number(state.storage.warehouseLevelsByRegion[regionId] || 0)
      - Number(state.storage.warehouseDisabledLevelsByRegion[regionId] || 0));
  }

  function reconcileDevelopment(state, city) {
    const region = namespace.resourceSites.regionById(state, city.regionId);
    if (!region) return null;
    const levels = [];
    city.processingBuildings.forEach((building) => {
      defaults(state, building);
      building.capacityDisabledLevels = 0;
      building.capacityDisabledLevelOrders = [];
      building.levelOrders.forEach((order) => levels.push({
        kind: 'building', target: building, order, points: footprint(building.buildingId)
      }));
    });
    (city.administrativeBuildings || []).forEach((building) => {
      defaults(state, building);
      building.capacityDisabledLevels = 0;
      building.capacityDisabledLevelOrders = [];
      building.levelOrders.forEach((order) => levels.push({
        kind: 'administration', target: building, order, points: footprint(building.buildingId)
      }));
    });
    (city.medicalBuildings || []).forEach((building) => {
      defaults(state, building);
      building.capacityDisabledLevels = 0;
      building.capacityDisabledLevelOrders = [];
      building.levelOrders.forEach((order) => levels.push({
        kind: 'medical', target: building, order, points: footprint(building.buildingId)
      }));
    });
    city.residentialDistrictLevels = Math.max(0, Math.floor(Number(city.residentialDistrictLevels) || 0));
    city.residentialDistrictLevelOrders = Array.isArray(city.residentialDistrictLevelOrders) ? city.residentialDistrictLevelOrders : [];
    city.residentialDistrictDisabledLevels = 0;
    city.residentialDistrictLevelOrders.forEach((order) => levels.push({ kind: 'residential', target: city, order, points: footprint('residential-district') }));
    const warehouseOrders = state.storage.warehouseLevelOrdersByRegion[region.id] || [];
    state.storage.warehouseDisabledLevelsByRegion[region.id] = 0;
    warehouseOrders.forEach((order) => levels.push({
      kind: 'warehouse', order, points: footprint('warehouse')
    }));
    const total = developmentCapacityFor(city, region);
    const reserved = reservations(region, 'development');
    const completed = levels.reduce((sum, item) => sum + item.points, 0);
    const active = disableNewest(levels, Math.max(0, total - reserved), (item) => {
      if (item.kind === 'warehouse') state.storage.warehouseDisabledLevelsByRegion[region.id] += 1;
      else if (item.kind === 'residential') city.residentialDistrictDisabledLevels += 1;
      else {
        item.target.capacityDisabledLevels += 1;
        item.target.capacityDisabledLevelOrders.push(item.order);
      }
    });
    city.developmentCapacity = total;
    city.developmentCapacityUsed = round(completed + reserved);
    region.developmentCapacity = total;
    region.developmentCapacityUsed = city.developmentCapacityUsed;
    return { total, used: city.developmentCapacityUsed, active: round(active), reserved: round(reserved) };
  }

  function reconcileResource(state, city) {
    const region = namespace.resourceSites.regionById(state, city.regionId);
    if (!region) return null;
    const capacity = resourceCapacityProfile(city, region);
    region.resourceCapacity = capacity.total;
    region.generalResourceCapacity = capacity.general;
    region.specialtyResourceCapacity = capacity.specialtyBonus;
    region.resourceCapacitySpecialtyId = capacity.specialtyId;

    const levels = [];
    (region.resourceSites || []).forEach((site) => {
      const candidate = namespace.resourceSites.eligibleCandidate(region, site.resourceId);
      site.capacityDisabledLevels = 0;
      site.capacityDisabledLevelOrders = [];
      if (!candidate || candidate.capacityType === 'water') return;
      defaults(state, site);
      site.levelOrders.forEach((order) => levels.push({
        site,
        order,
        points: Math.max(0, Number(candidate.capacityPerLevel) || 0),
        matching: specialtyMatches(city, site.resourceId)
      }));
    });

    const pending = namespace.constructionQueue.ensureQueue(region).projects
      .filter((project) => ['active', 'waiting', 'paused'].includes(project.status)
        && project.capacityReservation
        && ['land', 'resource'].includes(project.capacityReservation.type))
      .map((project) => ({
        points: Math.max(0, Number(project.capacityReservation.points) || 0),
        matching: specialtyMatches(city, project.resourceId)
      }));
    const reserved = pending.reduce((sum, item) => sum + item.points, 0);
    const reservedGeneralOnly = pending.filter((item) => !item.matching)
      .reduce((sum, item) => sum + item.points, 0);
    const completed = levels.reduce((sum, item) => sum + item.points, 0);
    const completedGeneralOnly = levels.filter((item) => !item.matching)
      .reduce((sum, item) => sum + item.points, 0);
    let active = completed;
    let activeGeneralOnly = completedGeneralOnly;

    levels.slice().sort((a, b) => b.order - a.order).forEach((item) => {
      const exceedsTotal = active + reserved > capacity.total + EPSILON;
      const exceedsGeneral = activeGeneralOnly + reservedGeneralOnly > capacity.general + EPSILON;
      if (!exceedsTotal && !exceedsGeneral) return;
      active -= item.points;
      if (!item.matching) activeGeneralOnly -= item.points;
      item.site.capacityDisabledLevels += 1;
      item.site.capacityDisabledLevelOrders.push(item.order);
    });

    region.resourceCapacityUsed = round(completed + reserved);
    region.resourceCapacityGeneralOnlyUsed = round(completedGeneralOnly + reservedGeneralOnly);
    region.resourceCapacityActive = round(Math.max(0, active));
    region.specialtyResourceCapacityUsed = round(Math.max(0, active + reserved - capacity.general));
    return {
      ...capacity,
      used: region.resourceCapacityUsed,
      active: region.resourceCapacityActive,
      reserved: round(reserved),
      generalOnlyUsed: region.resourceCapacityGeneralOnlyUsed,
      specialtyUsed: region.specialtyResourceCapacityUsed
    };
  }

  function resourceSummary(state, cityId) {
    ensureState(state);
    const city = (state.player.cities || []).find((item) => item.id === cityId);
    return city ? reconcileResource(state, city) : null;
  }

  function canReserveResource(state, region, resourceId, points) {
    const city = (state.player.cities || []).find((item) => item.regionId === region.id);
    if (!city) return null;
    const summary = resourceSummary(state, city.id);
    const required = Math.max(0, Number(points) || 0);
    const matching = specialtyMatches(city, resourceId);
    if (summary.used + required > summary.total + EPSILON) {
      return { allowed: false, reason: 'Not enough Resource Capacity.', summary, matching };
    }
    if (!matching && summary.generalOnlyUsed + required > summary.general + EPSILON) {
      return { allowed: false, reason: 'The matching specialty pool cannot be used by this Resource Site.', summary, matching };
    }
    return { allowed: true, summary, matching };
  }

  function reconcileAll(state) {
    ensureState(state);
    (state.player.cities || []).forEach((city) => {
      reconcileDevelopment(state, city);
      reconcileResource(state, city);
    });
    const regionIds = Object.keys(state.storage.warehouseLevelsByRegion);
    state.storage.warehouseLevels = regionIds.reduce(
      (sum, id) => sum + Number(state.storage.warehouseLevelsByRegion[id] || 0), 0);
    const activeCapacity = regionIds.reduce((sum, id) => (
      sum + activeWarehouseLevels(state, id) * namespace.storageLedger.warehouseCapacityForRegion(state, id)
    ), 0);
    state.storage.capacity = Number(state.storage.baseCapacity ?? namespace.storageLedger.FOUNDING_STORAGE_CAPACITY)
      + activeCapacity;
    (state.player.cities || []).forEach((city) => housingSummary(city));
  }

  function developmentSummary(state, cityId) {
    ensureState(state);
    const city = (state.player.cities || []).find((item) => item.id === cityId);
    return city ? reconcileDevelopment(state, city) : null;
  }

  function canReserveDevelopment(state, city, buildingId) {
    const summary = developmentSummary(state, city.id);
    const points = footprint(buildingId);
    if (!summary || !points) return { allowed: false, reason: 'Development footprint is not defined.' };
    return summary.used + points <= summary.total + EPSILON
      ? { allowed: true, footprint: points, summary }
      : { allowed: false, reason: 'Not enough Development Capacity.', footprint: points, summary };
  }

  function targets(state) {
    const result = [];
    state.map.regions.forEach((region) => (region.resourceSites || []).forEach((target) => result.push({
      kind: 'resource', target, id: target.resourceId, levels: activeLevels(target)
    })));
    (state.player.cities || []).forEach((city) => {
      (city.processingBuildings || []).forEach((target) => result.push({
        kind: 'processing', target, id: target.buildingId, levels: activeLevels(target)
      }));
      (city.administrativeBuildings || []).forEach((target) => result.push({
        kind: 'administration', target, id: target.buildingId, levels: activeLevels(target)
      }));
      (city.medicalBuildings || []).forEach((target) => result.push({
        kind: 'medical', target, id: target.buildingId, levels: activeLevels(target)
      }));
      const levels = activeWarehouseLevels(state, city.regionId);
      if (levels) result.push({ kind: 'warehouse', target: city, city, id: 'warehouse', levels });
      const residentialLevels = Math.max(0, Number(city.residentialDistrictLevels) || 0)
        - Math.max(0, Number(city.residentialDistrictDisabledLevels) || 0);
      if (residentialLevels) result.push({ kind: 'residential', target: city, city, id: 'residential-district', levels: residentialLevels });
    });
    return result;
  }

  function staffing(state, entry) {
    if (entry.kind === 'warehouse' || entry.kind === 'residential') return 1;
    const required = entry.kind === 'resource'
      ? namespace.workforce.requiredWorkers(entry.target)
      : entry.kind === 'administration'
        ? namespace.administration.requiredWorkers(state, entry.target)
        : entry.kind === 'medical'
          ? namespace.health.requiredWorkers(state, entry.target)
          : namespace.manufacturing.requiredWorkers(state, entry.target);
    return required ? Math.min(1, Number(entry.target.actualWorkers || 0) / required) : 0;
  }

  function maintenanceData(entry) {
    if (entry.kind === 'resource') {
      const economy = namespace.economyData.rawSiteEconomy[entry.id];
      return [siteClasses[entry.id] || 'medium', economy && economy.construction];
    }
    if (entry.kind === 'warehouse') {
      const profileId = entry.city.settlementTier === 'village' ? 'warehouseVillage' : 'warehouseUrban';
      return ['low', namespace.economyData.developmentConstructionProfiles[profileId]];
    }
    if (entry.kind === 'residential') return ['low', namespace.economyData.developmentConstructionProfiles.residentialDistrict];
    const definition = entry.kind === 'administration'
      ? namespace.administrationData.officeDefinitions[entry.id]
      : entry.kind === 'medical'
        ? namespace.healthData.facilityDefinitions[entry.id]
        : namespace.manufacturingData.processingBuildings[entry.id];
    return [namespace.developmentData.maintenanceClasses[entry.id] || 'medium', definition && definition.construction];
  }

  function maintenancePreview(state) {
    const entries = targets(state).map((entry) => {
      const [rateClass, construction] = maintenanceData(entry);
      const scale = namespace.developmentData.maintenanceRates[rateClass]
        * entry.levels * staffing(state, entry) / DAYS;
      const need = Object.fromEntries(Object.entries(construction ? namespace.economyData.materialCostFor(construction) : {})
        .map(([id, amount]) => [id, amount * scale]).filter(([, amount]) => amount > EPSILON));
      const city = entry.city || (state.player.cities || []).find((candidate) =>
        (candidate.processingBuildings || []).includes(entry.target)
        || (candidate.administrativeBuildings || []).includes(entry.target)
        || (candidate.medicalBuildings || []).includes(entry.target));
      const region = entry.kind === 'resource'
        ? state.map.regions.find((candidate) => (candidate.resourceSites || []).includes(entry.target))
        : city && state.map.regions.find((candidate) => candidate.id === city.regionId);
      const definition = entry.kind === 'administration' ? namespace.administrationData.officeDefinitions[entry.id]
        : entry.kind === 'medical' ? namespace.healthData.facilityDefinitions[entry.id]
          : entry.kind === 'processing' ? namespace.manufacturingData.processingBuildings[entry.id] : null;
      const label = entry.kind === 'warehouse' ? 'Warehouse'
        : entry.kind === 'residential' ? 'Residential District'
          : definition ? definition.label : (entry.target.label || entry.id);
      const priority = entry.kind === 'warehouse'
        ? (state.storage.warehouseMaintenancePriorityByRegion[entry.city.regionId] || 'normal')
        : entry.kind === 'residential' ? entry.city.residentialMaintenancePriority : entry.target.maintenancePriority;
      return { ...entry, need, actualNeed: {}, priority, label, location: city ? city.name : (region ? region.name : 'Unknown') };
    });
    const stock = { ...(state.storage.available || {}) };
    namespace.developmentData.priorities.forEach((priority) => {
      const group = entries.filter((entry) => entry.priority === priority && Object.keys(entry.need).length);
      const totals = {};
      group.forEach((entry) => Object.entries(entry.need).forEach(([id, amount]) => { totals[id] = (totals[id] || 0) + amount; }));
      let coverage = group.length ? 1 : 0;
      Object.entries(totals).forEach(([id, amount]) => { coverage = Math.min(coverage, Number(stock[id] || 0) / amount); });
      coverage = Math.max(0, Math.min(1, coverage));
      group.forEach((entry) => { entry.actualNeed = Object.fromEntries(Object.entries(entry.need).map(([id, amount]) => [id, amount * coverage])); });
      Object.entries(totals).forEach(([id, amount]) => { stock[id] = Math.max(0, Number(stock[id] || 0) - amount * coverage); });
    });
    return entries;
  }
  function setMaintenance(entry, coverage) {
    coverage = Math.max(0, Math.min(1, coverage));
    if (entry.kind === 'warehouse') entry.city.warehouseMaintenanceCoverage = coverage;
    else if (entry.kind === 'residential') entry.city.residentialMaintenanceCoverage = coverage;
    else {
      entry.target.maintenanceCoverage = coverage;
      entry.target.maintenanceMultiplier = 0.25 + 0.75 * coverage;
    }
  }

  function processMaintenance(state) {
    const entries = targets(state);
    const consumed = {};
    entries.forEach((entry) => {
      const [rateClass, construction] = maintenanceData(entry);
      const scale = namespace.developmentData.maintenanceRates[rateClass]
        * entry.levels * staffing(state, entry) / DAYS;
      const materials = construction ? namespace.economyData.materialCostFor(construction) : {};
      entry.need = Object.fromEntries(Object.entries(materials)
        .map(([id, amount]) => [id, amount * scale]).filter(([, amount]) => amount > EPSILON));
      entry.priority = entry.kind === 'warehouse'
        ? (state.storage.warehouseMaintenancePriorityByRegion[entry.city.regionId] || 'normal')
        : entry.kind === 'residential' ? entry.city.residentialMaintenancePriority : entry.target.maintenancePriority;
      setMaintenance(entry, Object.keys(entry.need).length ? 0 : 1);
    });
    namespace.developmentData.priorities.forEach((priority) => {
      const group = entries.filter((entry) => entry.priority === priority && Object.keys(entry.need).length);
      const need = {};
      group.forEach((entry) => Object.entries(entry.need).forEach(([id, amount]) => {
        need[id] = (need[id] || 0) + amount;
      }));
      let coverage = group.length ? 1 : 0;
      Object.entries(need).forEach(([id, amount]) => {
        coverage = Math.min(coverage, Number(state.storage.available[id] || 0) / amount);
      });
      coverage = Math.max(0, Math.min(1, coverage));
      group.forEach((entry) => setMaintenance(entry, coverage));
      Object.entries(need).forEach(([id, amount]) => {
        const used = round(amount * coverage);
        state.storage.available[id] = round(Math.max(0, Number(state.storage.available[id]) - used));
        consumed[id] = round((consumed[id] || 0) + used);
      });
    });
    if (Object.keys(consumed).length) {
      namespace.storageLedger.recordTransaction(state.storage, 'maintenance-materials', consumed);
    }
    return { entries, consumed };
  }

  function operationalTargets(state) {
    return targets(state).filter((entry) => !['warehouse', 'residential'].includes(entry.kind)).map((entry) => ({
      ...entry,
      workers: entry.target.level
        ? Number(entry.target.actualWorkers || 0) * entry.levels / entry.target.level : 0
    }));
  }

  function record(state, type, values) {
    const clean = Object.fromEntries(Object.entries(values)
      .filter(([, amount]) => amount > EPSILON).map(([id, amount]) => [id, round(amount)]));
    if (Object.keys(clean).length) namespace.storageLedger.recordTransaction(state.storage, type, clean);
  }

  function processTools(state) {
    const completed = research(state);
    const entries = operationalTargets(state);
    const returned = {};
    entries.forEach((entry) => {
      ['simple', 'bronze'].forEach((type) => {
        const amount = Number(entry.target.assignedTools[type] || 0);
        const id = namespace.developmentData.economicTools[type].resourceId;
        state.storage.available[id] = round(Number(state.storage.available[id] || 0) + amount);
        returned[id] = (returned[id] || 0) + amount;
      });
      entry.target.assignedTools = { simple: 0, bronze: 0 };
    });
    record(state, 'tools-returned', returned);
    const assigned = {};
    namespace.developmentData.priorities.forEach((priority) => {
      const group = entries.filter((entry) => entry.workers > EPSILON
        && entry.target.toolPriority === priority && entry.target.toolMode !== 'no-tools');
      ['bronze', 'simple'].forEach((type) => {
        const tool = namespace.developmentData.economicTools[type];
        if (!completed.has(tool.researchId)) return;
        const demand = group.map((entry) => {
          const mode = entry.target.toolMode;
          const compatible = mode === 'best-available' || mode === type + '-only';
          const held = entry.target.assignedTools.simple + entry.target.assignedTools.bronze;
          return { entry, amount: compatible ? Math.max(0, entry.workers - held) : 0 };
        });
        const total = demand.reduce((sum, item) => sum + item.amount, 0);
        const ratio = total ? Math.min(1, Number(state.storage.available[tool.resourceId] || 0) / total) : 0;
        demand.forEach((item) => {
          const amount = item.amount * ratio;
          item.entry.target.assignedTools[type] = round(amount);
          state.storage.available[tool.resourceId] = round(Number(state.storage.available[tool.resourceId] || 0) - amount);
          assigned[tool.resourceId] = (assigned[tool.resourceId] || 0) + amount;
        });
      });
    });
    record(state, 'tools-assigned', assigned);
    const worn = {};
    const replacements = {};
    entries.forEach((entry) => {
      let buff = 0;
      ['simple', 'bronze'].forEach((type) => {
        const tool = namespace.developmentData.economicTools[type];
        const current = Number(entry.target.assignedTools[type] || 0);
        const wear = current * tool.dailyWear;
        entry.target.assignedTools[type] = round(current - wear);
        worn[tool.resourceId] = (worn[tool.resourceId] || 0) + wear;
        const replacement = Math.min(wear, Number(state.storage.available[tool.resourceId] || 0));
        state.storage.available[tool.resourceId] = round(Number(state.storage.available[tool.resourceId] || 0) - replacement);
        entry.target.assignedTools[type] = round(entry.target.assignedTools[type] + replacement);
        replacements[tool.resourceId] = (replacements[tool.resourceId] || 0) + replacement;
        buff += entry.workers ? entry.target.assignedTools[type] / entry.workers * (tool.multiplier - 1) : 0;
      });
      entry.target.toolCoverage = entry.workers
        ? Math.min(1, (entry.target.assignedTools.simple + entry.target.assignedTools.bronze) / entry.workers) : 0;
      entry.target.toolMultiplier = 1 + Math.max(0, buff);
    });
    record(state, 'tool-wear', worn);
    record(state, 'tool-replacements', replacements);
    return { entries, assigned, returned, worn, replacements };
  }

  function requestSettings(target, changes = {}) {
    if (!target) return { ok: false, reason: 'Economic target was not found.' };
    if (namespace.developmentData.priorities.includes(changes.maintenancePriority)) {
      target.pendingMaintenancePriority = changes.maintenancePriority;
    }
    if (namespace.developmentData.priorities.includes(changes.toolPriority)) {
      target.pendingToolPriority = changes.toolPriority;
    }
    if (namespace.developmentData.toolModes.includes(changes.toolMode)) {
      target.pendingToolMode = changes.toolMode;
    }
    return { ok: true, target };
  }

  function requestWarehouseMaintenance(state, regionId, priority) {
    if (!namespace.developmentData.priorities.includes(priority)) {
      return { ok: false, reason: 'Unknown maintenance priority.' };
    }
    ensureState(state);
    state.storage.pendingWarehouseMaintenancePriorityByRegion[regionId] = priority;
    return { ok: true, regionId, priority };
  }

  function requestResidentialMaintenance(state, cityId, priority) {
    if (!namespace.developmentData.priorities.includes(priority)) return { ok: false, reason: 'Unknown maintenance priority.' };
    const city = (state.player.cities || []).find((item) => item.id === cityId);
    if (!city) return { ok: false, reason: 'Settlement was not found.' };
    city.pendingResidentialMaintenancePriority = priority;
    return { ok: true, cityId, priority };
  }
  function applyPendingSettings(state) {
    operationalTargets(state).forEach(({ target }) => {
      ['MaintenancePriority', 'ToolPriority', 'ToolMode'].forEach((name) => {
        const pending = 'pending' + name;
        const current = name.charAt(0).toLowerCase() + name.slice(1);
        if (target[pending]) target[current] = target[pending];
        target[pending] = null;
      });
    });
    Object.entries(state.storage.pendingWarehouseMaintenancePriorityByRegion || {})
      .forEach(([regionId, priority]) => {
        state.storage.warehouseMaintenancePriorityByRegion[regionId] = priority;
      });
    state.storage.pendingWarehouseMaintenancePriorityByRegion = {};
    (state.player.cities || []).forEach((city) => {
      if (city.pendingResidentialMaintenancePriority) city.residentialMaintenancePriority = city.pendingResidentialMaintenancePriority;
      city.pendingResidentialMaintenancePriority = null;
    });
  }

  function housingSummary(city) {
    const founderHousing = Math.max(0, Number(city.founderHousing) || (city.isCapital ? 1200 : city.settlementTier === 'village' ? 500 : 1200));
    const completedLevels = Math.max(0, Math.floor(Number(city.residentialDistrictLevels) || 0));
    const disabledLevels = Math.min(completedLevels, Math.max(0, Math.floor(Number(city.residentialDistrictDisabledLevels) || 0)));
    const activeLevels = completedLevels - disabledLevels;
    const capacity = founderHousing + activeLevels * 600;
    const population = Math.max(0, Number(city.population) || 0);
    const coverage = population > EPSILON ? Math.min(1, capacity / population) : 1;
    const maintenanceCoverage = Math.max(0, Math.min(1, Number.isFinite(Number(city.residentialMaintenanceCoverage)) ? Number(city.residentialMaintenanceCoverage) : 1));
    const quality = 15 * coverage * (0.5 + 0.5 * maintenanceCoverage);
    city.founderHousing = founderHousing;
    city.housingCapacity = capacity;
    city.housingCoverage = round(coverage);
    city.housingMaintenanceCoverage = round(maintenanceCoverage);
    city.housingSatisfactionPotential = round(quality);
    return { founderHousing, completedLevels, disabledLevels, activeLevels, capacity, population, coverage: round(coverage), maintenanceCoverage: round(maintenanceCoverage), satisfactionPotential: round(quality), shortage: Math.max(0, population - capacity) };
  }

  const RESIDENTIAL_MATERIALS = Object.freeze({ wood: 597, planks: 216, stone: 90, bricks: 360, 'nails-fittings': 100 });

  function residentialProjects(region, cityId) {
    return namespace.constructionQueue.ensureQueue(region).projects.filter((project) => project.kind === 'residential-district' && project.cityId === cityId);
  }

  function residentialBuildAvailability(state, cityId) {
    const city = (state.player.cities || []).find((item) => item.id === cityId);
    const region = city && namespace.resourceSites.regionById(state, city.regionId);
    if (!city || !region) return { allowed: false, reason: 'Settlement was not found.', city, region };
    const capacity = canReserveDevelopment(state, city, 'residential-district');
    const shortages = namespace.resourceSites.materialShortages(state.storage, RESIDENTIAL_MATERIALS);
    const targetLevel = Math.max(0, Number(city.residentialDistrictLevels) || 0)
      + residentialProjects(region, city.id).length + 1;
    const allowed = capacity.allowed && Object.keys(shortages).length === 0;
    return {
      allowed,
      reason: !capacity.allowed
        ? capacity.reason
        : Object.keys(shortages).length
          ? 'The central stockpile lacks required construction materials.'
          : 'Ready to enter the province construction queue.',
      city,
      region,
      capacity,
      shortages,
      targetLevel,
      preview: {
        buildingId: 'residential-district',
        label: 'Residential District',
        materials: RESIDENTIAL_MATERIALS,
        days: 60,
        cashPercent: 50,
        footprint: 0.2,
        housingAdded: 600
      }
    };
  }

  function queueResidentialDistrict(state, cityId) {
    const availability = residentialBuildAvailability(state, cityId);
    if (!availability.allowed) return availability;
    return namespace.constructionQueue.queueProject(state, availability.region, {
      kind: 'residential-district',
      cityId: availability.city.id,
      buildingId: availability.preview.buildingId,
      label: availability.preview.label,
      targetLevel: availability.targetLevel,
      durationDays: availability.preview.days,
      materials: availability.preview.materials,
      cashPercent: availability.preview.cashPercent,
      cashAmount: null,
      capacityReservation: { type: 'development', points: availability.preview.footprint },
      modifiers: {}
    });
  }

  function reduceResidentialDistrict(state, cityId) {
    const city = (state.player.cities || []).find((item) => item.id === cityId);
    const region = city && namespace.resourceSites.regionById(state, city.regionId);
    if (!city || !region) return { ok: false, reason: 'Settlement was not found.' };
    const projects = residentialProjects(region, city.id);
    const project = projects.slice().reverse().find((item) => ['waiting', 'active', 'paused'].includes(item.status));
    if (project) return namespace.constructionQueue.discardProject(state, region, project.id, 'reduce-residential');
    if (!(Number(city.residentialDistrictLevels) > 0)) return { ok: false, reason: 'No completed Residential District level can be reduced.' };
    city.residentialDistrictLevels -= 1;
    city.residentialDistrictLevelOrders.pop();
    reconcileAll(state);
    housingSummary(city);
    return { ok: true, city };
  }

  namespace.constructionProjectHandlers = namespace.constructionProjectHandlers || {};
  namespace.constructionProjectHandlers['residential-district'] = function completeResidentialDistrict(state, region, project) {
    const city = (state.player.cities || []).find((item) => item.id === project.cityId);
    if (!city) return;
    city.residentialDistrictLevels = Math.max(0, Number(city.residentialDistrictLevels) || 0) + 1;
    city.residentialDistrictLevelOrders = Array.isArray(city.residentialDistrictLevelOrders) ? city.residentialDistrictLevelOrders : [];
    state.nextDevelopmentLevelOrder = Math.max(0, Number(state.nextDevelopmentLevelOrder) || 0) + 1;
    city.residentialDistrictLevelOrders.push(state.nextDevelopmentLevelOrder);
    reconcileAll(state);
    housingSummary(city);
  };
  function processDay(state) {
    if (namespace.workforcePriority) namespace.workforcePriority.applyPending(state);
    reconcileAll(state);
    namespace.workforce.recalculateAll(state);
    return { maintenance: processMaintenance(state), tools: processTools(state) };
  }

  namespace.developmentEconomy = Object.freeze({
    DAYS_PER_YEAR: DAYS, REFERENCE_PROVINCE_AREA_KM2, profile, footprint, ensureState, activeLevels,
    specialtyFor, specialtyMatches, specialtyCards, developmentCapacityFor, resourceCapacityProfile,
    canBuildProcessing, activeWarehouseLevels, housingSummary, reconcileDevelopment, reconcileResource, reconcileAll,
    developmentSummary, resourceSummary, canReserveDevelopment, canReserveResource, targets, processMaintenance,
    operationalTargets, processTools, requestSettings, requestWarehouseMaintenance, requestResidentialMaintenance,
    applyPendingSettings, residentialProjects, residentialBuildAvailability, queueResidentialDistrict, reduceResidentialDistrict, maintenancePreview, processDay
  });
})(window.EcoRuler = window.EcoRuler || {});
