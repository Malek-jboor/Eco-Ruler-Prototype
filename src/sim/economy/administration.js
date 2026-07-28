(function initializeAdministration(namespace) {
  const EPSILON = 0.000001;

  const round = (value, digits = 6) => {
    const scale = 10 ** digits;
    return Math.round((Number(value) || 0) * scale) / scale;
  };
  const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

  function definitionById(buildingId) {
    return namespace.administrationData.officeDefinitions[buildingId] || null;
  }

  function cityById(state, cityId) {
    return (state.player.cities || []).find((city) => city.id === cityId) || null;
  }

  function ensureCityState(city) {
    city.administrativeBuildings = Array.isArray(city.administrativeBuildings)
      ? city.administrativeBuildings
      : [];
    return city;
  }

  function officeById(city, buildingId) {
    ensureCityState(city);
    return city.administrativeBuildings.find((building) => building.buildingId === buildingId) || null;
  }

  function allOffices(state) {
    return (state.player.cities || []).flatMap((city) => {
      ensureCityState(city);
      return city.administrativeBuildings.map((building) => ({ city, building }));
    }).sort((first, second) => (
      first.building.createdOrder - second.building.createdOrder
      || first.building.id.localeCompare(second.building.id)
    ));
  }

  function activeLevels(building) {
    return namespace.developmentEconomy
      ? namespace.developmentEconomy.activeLevels(building)
      : Math.max(0, Number(building.level) || 0);
  }

  function requiredWorkers(state, building) {
    const definition = definitionById(building && building.buildingId);
    return definition ? Math.max(0, definition.workers * Math.max(0, Number(building.level) || 0)) : 0;
  }

  function requestWorkerCap(state, cityId, buildingId, requestedCap) {
    const city = cityById(state, cityId);
    const building = city ? officeById(city, buildingId) : null;
    if (!building) return { ok: false, reason: 'Administrative office was not found.' };
    const cap = Math.max(0, Math.min(requiredWorkers(state, building), Math.floor(Number(requestedCap) || 0)));
    building.pendingWorkerCap = cap;
    return { ok: true, building, cap };
  }

  function applyPendingChanges(state) {
    allOffices(state).forEach(({ building }) => {
      if (!Number.isFinite(building.pendingWorkerCap)) return;
      building.workerCap = Math.min(requiredWorkers(state, building), Math.max(0, Math.floor(building.pendingWorkerCap)));
      building.pendingWorkerCap = null;
    });
  }

  function settlementRegion(state, city) {
    return city ? namespace.resourceSites.regionById(state, city.regionId) : null;
  }

  function officeProjects(region, cityId, buildingId) {
    if (!region) return [];
    return namespace.constructionQueue.ensureQueue(region).projects.filter((project) => (
      project.kind === 'administrative-building-level'
      && project.cityId === cityId
      && project.buildingId === buildingId
      && ['active', 'waiting', 'paused'].includes(project.status)
    ));
  }

  function projectedLevel(state, city, buildingId) {
    const building = officeById(city, buildingId);
    return (building ? building.level : 0)
      + officeProjects(settlementRegion(state, city), city.id, buildingId).length;
  }

  function constructionPreview(state, city, buildingId) {
    const definition = definitionById(buildingId);
    if (!definition || !city) return null;
    const currentLevel = projectedLevel(state, city, buildingId);
    const multiplier = currentLevel > 0 ? namespace.economyData.expansionMultiplier(currentLevel) : 1;
    return {
      buildingId,
      label: definition.label,
      targetLevel: currentLevel + 1,
      multiplier,
      materials: namespace.economyData.materialCostFor(definition.construction, multiplier),
      cashPercent: null,
      cashAmount: null,
      days: Math.max(1, Math.ceil(definition.construction.days * Math.sqrt(multiplier)))
    };
  }

  function locationAvailability(city, definition) {
    if (!city || !definition) return { allowed: false, reason: 'Administrative office definition was not found.' };
    if (city.settlementKind === 'village' || city.settlementIdentity === 'village') {
      return { allowed: false, reason: 'Administrative offices require a Town, City, or the State Capital.' };
    }
    const location = city.isCapital ? 'capital' : (city.settlementTier || city.level || 'town');
    return definition.locations.includes(location)
      ? { allowed: true }
      : { allowed: false, reason: `${definition.label} is not allowed in this settlement.` };
  }

  function buildAvailability(state, regionId, buildingId) {
    if (!state.player.gameStarted) return { allowed: false, reason: 'Start the game first.' };
    const region = namespace.resourceSites.regionById(state, regionId);
    const city = (state.player.cities || []).find((item) => item.regionId === regionId) || null;
    const definition = definitionById(buildingId);
    if (!region || !city) return { allowed: false, reason: 'Administrative offices require a settlement center province.' };
    const location = locationAvailability(city, definition);
    if (!location.allowed) return { ...location, region, city, definition };
    const capacity = namespace.developmentEconomy.canReserveDevelopment(state, city, buildingId);
    if (!capacity.allowed) return { ...capacity, region, city, definition };
    const preview = constructionPreview(state, city, buildingId);
    const shortages = namespace.resourceSites.materialShortages(state.storage, preview.materials);
    if (Object.keys(shortages).length) {
      return {
        allowed: false,
        reason: 'The central stockpile lacks required construction materials.',
        region, city, definition, preview, shortages, capacity
      };
    }
    return {
      allowed: true,
      reason: 'Ready to enter this settlement province construction queue.',
      region, city, definition, preview, shortages: {}, capacity
    };
  }

  function queueLevel(state, regionId, buildingId) {
    const availability = buildAvailability(state, regionId, buildingId);
    if (!availability.allowed) return availability;
    return namespace.constructionQueue.queueProject(state, availability.region, {
      kind: 'administrative-building-level',
      cityId: availability.city.id,
      buildingId,
      label: availability.definition.label,
      targetLevel: availability.preview.targetLevel,
      durationDays: availability.preview.days,
      materials: availability.preview.materials,
      cashPercent: null,
      cashAmount: null,
      capacityReservation: { type: 'development', points: availability.capacity.footprint },
      modifiers: {}
    });
  }

  function completeProject(state, region, project) {
    const city = cityById(state, project.cityId)
      || (state.player.cities || []).find((item) => item.regionId === region.id);
    const definition = definitionById(project.buildingId);
    if (!city || !definition) return null;
    ensureCityState(city);
    let building = officeById(city, project.buildingId);
    if (!building) {
      state.nextAdministrativeBuildingOrder = Math.max(0, Number(state.nextAdministrativeBuildingOrder) || 0) + 1;
      building = {
        id: `${city.id}-${project.buildingId}`,
        buildingId: project.buildingId,
        level: 0,
        workerCap: 0,
        pendingWorkerCap: null,
        actualWorkers: 0,
        createdOrder: state.nextAdministrativeBuildingOrder,
        status: 'Idle',
        maintenanceMultiplier: 1,
        maintenanceCoverage: 1,
        maintenancePriority: 'normal',
        toolMode: 'no-tools',
        toolPriority: 'normal',
        assignedTools: { simple: 0, bronze: 0 },
        capacityDisabledLevels: 0,
        levelOrders: [],
        lastAdministration: null
      };
      city.administrativeBuildings.push(building);
    }
    const previousRequired = requiredWorkers(state, building);
    const previousRatio = previousRequired > 0 ? Math.min(1, building.workerCap / previousRequired) : 1;
    building.level += 1;
    namespace.developmentEconomy.ensureState(state);
    building.workerCap = Math.round(requiredWorkers(state, building) * previousRatio);
    building.pendingWorkerCap = null;
    building.status = 'Unstaffed';
    return building;
  }

  function reducePreview(state, cityId, buildingId) {
    const city = cityById(state, cityId);
    const region = settlementRegion(state, city);
    if (!city || !region) return { allowed: false, reason: 'Settlement was not found.' };
    const projects = officeProjects(region, cityId, buildingId);
    const waiting = projects.filter((project) => project.status === 'waiting');
    const project = waiting.length
      ? waiting[waiting.length - 1]
      : projects.find((item) => item.status === 'active' || item.status === 'paused');
    if (project) {
      return {
        allowed: true,
        action: project.status === 'waiting' ? 'cancel-waiting' : 'cancel-active',
        project,
        targetLevel: Math.max(0, Number(project.targetLevel || 1) - 1),
        refund: namespace.constructionQueue.refundQuantities(project),
        reason: 'Cancels the newest expansion and refunds its unfinished share.'
      };
    }
    const building = officeById(city, buildingId);
    if (!building || building.level <= 0) return { allowed: false, reason: 'The office is already at Level 0.' };
    return {
      allowed: true,
      action: 'reduce-completed',
      building,
      targetLevel: building.level - 1,
      refund: 0,
      reason: 'Removes one completed level immediately. No materials or cash are refunded.'
    };
  }

  function reduceLevel(state, cityId, buildingId, options = {}) {
    const preview = reducePreview(state, cityId, buildingId);
    if (!preview.allowed) return preview;
    const city = cityById(state, cityId);
    const region = settlementRegion(state, city);
    if (preview.project) {
      const result = namespace.constructionQueue.cancelProject(state, region, preview.project.id, {
        confirmOverflow: Boolean(options.confirmOverflow)
      });
      if (namespace.workforce) namespace.workforce.recalculateAll(state);
      return { ...preview, ...result };
    }
    const building = preview.building;
    const oldRequired = requiredWorkers(state, building);
    const ratio = oldRequired > 0 ? Math.min(1, building.workerCap / oldRequired) : 1;
    building.level -= 1;
    if (Array.isArray(building.levelOrders)) building.levelOrders.pop();
    building.workerCap = Math.round(requiredWorkers(state, building) * ratio);
    building.pendingWorkerCap = null;
    if (building.level <= 0) city.administrativeBuildings = city.administrativeBuildings.filter((item) => item !== building);
    namespace.developmentEconomy.reconcileAll(state);
    namespace.workforce.recalculateAll(state);
    reconcile(state);
    applyCollectionModifiers(state);
    return { ok: true, ...preview, building };
  }

  function ensureState(state) {
    state.administration = state.administration || {};
    const administration = state.administration;
    administration.founderCountryRetired = Boolean(administration.founderCountryRetired);
    administration.founderLocalRetired = Boolean(administration.founderLocalRetired);
    administration.countryRequests = { ...(administration.countryRequests || {}) };
    administration.countryReservations = { ...(administration.countryReservations || {}) };
    administration.localReservations = { ...(administration.localReservations || {}) };
    administration.producedCountry = Math.max(0, Number(administration.producedCountry) || 0);
    administration.producedLocalByCenter = { ...(administration.producedLocalByCenter || {}) };
    administration.alertIds = { ...(administration.alertIds || {}) };
    (state.player.cities || []).forEach(ensureCityState);
    return administration;
  }

  function branchPopulation(state, center) {
    const branch = namespace.settlementHierarchy.branchForTown(state, center.id);
    return Math.max(0, Number(center.population) || 0)
      + (branch ? branch.villages.reduce((sum, village) => sum + Math.max(0, Number(village.population) || 0), 0) : 0);
  }

  function countryDemand(state, center) {
    if (!center || center.isCapital) {
      return { total: 0, tier: 0, distance: 0, population: 0, coordination: 0, branchPopulation: 0, provinceDistance: 0 };
    }
    const capital = namespace.settlementHierarchy.capital(state);
    const tier = namespace.administrationData.countryTierBase[center.settlementTier || center.level] || 20;
    const provinceDistance = capital
      ? namespace.settlementHierarchy.provinceDistance(state, capital.regionId, center.regionId)
      : Infinity;
    const distance = Number.isFinite(provinceDistance) ? Math.max(10, Math.ceil(provinceDistance / 3) * 10) : 0;
    const populationTotal = branchPopulation(state, center);
    const population = Math.ceil(Math.max(0, populationTotal - 2000) / 2000) * 10;
    ensureCityState(center);
    const coordinationLevels = center.administrativeBuildings
      .filter((building) => ['town-hall', 'local-registry'].includes(building.buildingId))
      .reduce((sum, building) => sum + Math.max(0, Math.floor(Number(building.level) || 0)), 0);
    const coordination = coordinationLevels * 5;
    return {
      total: tier + distance + population + coordination,
      tier, distance, population, coordination,
      branchPopulation: populationTotal,
      provinceDistance
    };
  }

  function villageDemand(state, village) {
    const parent = namespace.settlementHierarchy.parentTown(state, village);
    const distance = parent
      ? namespace.settlementHierarchy.provinceDistance(state, parent.regionId, village.regionId, 3)
      : Infinity;
    const specialty = namespace.administrationData.localDemand[village.specialtyId] || null;
    const total = specialty && Number.isFinite(distance) ? Number(specialty[distance]) || 0 : 0;
    return { total, distance, specialtyId: village.specialtyId || null, parentTownId: parent ? parent.id : null };
  }

  function effectiveCountryCapacity(administration) {
    return administration.founderCountryRetired
      ? administration.producedCountry
      : Math.max(namespace.administrationData.FOUNDER_COUNTRY_CONTROL, administration.producedCountry);
  }

  function effectiveLocalCapacity(administration, center) {
    const produced = Math.max(0, Number(administration.producedLocalByCenter[center.id]) || 0);
    if (!center.isCapital || administration.founderLocalRetired) return produced;
    return Math.max(namespace.administrationData.FOUNDER_LOCAL_CONTROL, produced);
  }

  function reconcile(state) {
    const administration = ensureState(state);
    const countryCapacity = effectiveCountryCapacity(administration);
    const countryReservationRows = {};
    Object.values(administration.countryReservations).forEach((reservation) => {
      const amount = Math.max(0, Number(reservation.amount) || 0);
      countryReservationRows[reservation.id] = {
        ...reservation,
        amount,
        allocation: 0,
        coverage: 0
      };
    });
    const countryReserved = Object.values(countryReservationRows).reduce((sum, row) => sum + row.amount, 0);
    const countryReservationScale = countryReserved > EPSILON
      ? Math.min(1, countryCapacity / countryReserved)
      : 1;
    Object.values(countryReservationRows).forEach((row) => {
      row.allocation = round(row.amount * countryReservationScale);
      row.coverage = row.amount > EPSILON ? clamp01(row.allocation / row.amount) : 1;
    });

    const branchCapacity = Math.max(0, countryCapacity - countryReserved);
    const branches = (state.player.cities || []).filter((city) => (
      namespace.settlementHierarchy.isTownCenter(city) && !city.isCapital
    ));
    const branchRows = {};
    branches.forEach((center) => {
      const demand = countryDemand(state, center);
      const requested = Math.min(demand.total, Math.max(0, Math.floor(Number(administration.countryRequests[center.id]) || 0)));
      administration.countryRequests[center.id] = requested;
      branchRows[center.id] = { centerId: center.id, demand, requested, allocation: 0, coverage: 0 };
    });
    Object.keys(administration.countryRequests).forEach((centerId) => {
      if (!branchRows[centerId]) delete administration.countryRequests[centerId];
    });
    const totalRequested = Object.values(branchRows).reduce((sum, row) => sum + row.requested, 0);
    const countryScale = totalRequested > EPSILON ? Math.min(1, branchCapacity / totalRequested) : 1;
    Object.values(branchRows).forEach((row) => {
      row.allocation = round(row.requested * countryScale);
      row.coverage = row.demand.total > 0 ? clamp01(row.allocation / row.demand.total) : 1;
      const center = cityById(state, row.centerId);
      if (center) {
        center.countryControlDemand = row.demand.total;
        center.countryControlRequest = row.requested;
        center.countryControlAllocation = row.allocation;
        center.countryCoverage = row.coverage;
      }
    });
    administration.country = {
      produced: administration.producedCountry,
      founderActive: !administration.founderCountryRetired,
      capacity: round(countryCapacity),
      requested: round(totalRequested),
      reserved: round(countryReserved),
      allocated: round(
        Object.values(countryReservationRows).reduce((sum, row) => sum + row.allocation, 0)
        + Object.values(branchRows).reduce((sum, row) => sum + row.allocation, 0)
      ),
      spare: round(Math.max(0, countryCapacity - countryReserved - totalRequested)),
      scale: countryScale,
      reservationScale: countryReservationScale,
      reservations: countryReservationRows,
      branches: branchRows
    };

    const localByCenter = {};
    (state.player.cities || []).filter(namespace.settlementHierarchy.isTownCenter).forEach((center) => {
      const branch = namespace.settlementHierarchy.branchForTown(state, center.id);
      const villages = branch ? branch.villages : [];
      const rows = {};
      villages.forEach((village) => { rows[village.id] = { villageId: village.id, demand: villageDemand(state, village), allocation: 0, coverage: 0 }; });
      const totalDemand = Object.values(rows).reduce((sum, row) => sum + row.demand.total, 0);
      const capacity = effectiveLocalCapacity(administration, center);
      const reservationRows = {};
      Object.values(administration.localReservations)
        .filter((reservation) => reservation.centerId === center.id)
        .forEach((reservation) => {
          const amount = Math.max(0, Number(reservation.amount) || 0);
          reservationRows[reservation.id] = { ...reservation, amount, allocation: 0, coverage: 0 };
        });
      const reserved = Object.values(reservationRows).reduce((sum, row) => sum + row.amount, 0);
      const reservationScale = reserved > EPSILON ? Math.min(1, capacity / reserved) : 1;
      Object.values(reservationRows).forEach((row) => {
        row.allocation = round(row.amount * reservationScale);
        row.coverage = row.amount > EPSILON ? clamp01(row.allocation / row.amount) : 1;
      });
      const villageCapacity = Math.max(0, capacity - reserved);
      const coverage = totalDemand > EPSILON ? Math.min(1, villageCapacity / totalDemand) : 1;
      Object.values(rows).forEach((row) => {
        row.coverage = coverage;
        row.allocation = round(row.demand.total * coverage);
        const village = cityById(state, row.villageId);
        if (village) {
          village.localControlDemand = row.demand.total;
          village.localControlAllocation = row.allocation;
          village.localCoverage = row.coverage;
        }
      });
      const produced = Math.max(0, Number(administration.producedLocalByCenter[center.id]) || 0);
      localByCenter[center.id] = {
        centerId: center.id,
        produced,
        founderActive: Boolean(center.isCapital && !administration.founderLocalRetired),
        capacity: round(capacity),
        demand: round(totalDemand),
        reserved: round(reserved),
        allocated: round(
          Object.values(reservationRows).reduce((sum, row) => sum + row.allocation, 0)
          + Object.values(rows).reduce((sum, row) => sum + row.allocation, 0)
        ),
        spare: round(Math.max(0, capacity - reserved - totalDemand)),
        coverage,
        reservationScale,
        reservations: reservationRows,
        villages: rows
      };
      center.localControlProduced = produced;
      center.localControlCapacity = capacity;
      center.localControlDemand = totalDemand;
      center.localCoverage = coverage;
    });
    administration.localByCenter = localByCenter;
    return administration;
  }
  function requestCountryControl(state, centerId, requestedValue) {
    const administration = reconcile(state);
    const row = administration.country.branches[centerId];
    if (!row) return { ok: false, reason: 'Country Control branch was not found.' };
    const numeric = Number(requestedValue);
    if (!Number.isInteger(numeric) || numeric < 0) {
      return { ok: false, reason: 'Country Control requests use whole non-negative points.' };
    }
    if (numeric > row.demand.total) return { ok: false, reason: 'The request cannot exceed this branch demand.' };
    const current = row.requested;
    const others = administration.country.requested - current;
    const branchCapacity = Math.max(0, administration.country.capacity - administration.country.reserved);
    if (numeric > current && others + numeric > branchCapacity + EPSILON) {
      return { ok: false, reason: 'Not enough unreserved Country Control for this increase.' };
    }
    administration.countryRequests[centerId] = numeric;
    reconcile(state);
    applyCollectionModifiers(state);
    return { ok: true, centerId, requested: numeric, country: state.administration.country };
  }

  function activeOfficeLine(state, city, building) {
    const definition = definitionById(building.buildingId);
    const levels = activeLevels(building);
    const disabledLevels = Math.max(0, Math.floor(Number(building.capacityDisabledLevels) || 0));
    const retainedWorkers = Math.min(
      Math.max(0, Number(building.actualWorkers) || 0),
      definition.workers * disabledLevels
    );
    const activeRequired = definition.workers * levels;
    const activeWorkers = Math.max(0, Math.min(activeRequired, Number(building.actualWorkers) - retainedWorkers));
    const staffing = activeRequired > EPSILON ? clamp01(activeWorkers / activeRequired) : 0;
    return {
      id: building.id,
      city,
      building,
      definition,
      levels,
      activeRequired,
      activeWorkers,
      staffing,
      maintenance: clamp01(building.maintenanceMultiplier ?? 1),
      paperDemand: (definition.inputs.paper || 0) * levels * staffing,
      bookDemand: (definition.inputs.books || 0) * levels * staffing
    };
  }

  function planDay(state) {
    const beginningStock = { ...(state.storage.available || {}) };
    const lines = allOffices(state).map(({ city, building }) => activeOfficeLine(state, city, building));
    const totalPaper = lines.reduce((sum, line) => sum + line.paperDemand, 0);
    const paperCoverage = totalPaper > EPSILON
      ? Math.min(1, Math.max(0, Number(beginningStock.paper) || 0) / totalPaper)
      : 1;
    const totalBooks = lines.reduce((sum, line) => sum + line.bookDemand * paperCoverage, 0);
    const bookCoverage = totalBooks > EPSILON
      ? Math.min(1, Math.max(0, Number(beginningStock.books) || 0) / totalBooks)
      : 1;
    const consumed = { paper: 0, books: 0 };
    let producedCountry = 0;
    const producedLocalByCenter = {};
    lines.forEach((line) => {
      line.paperCoverage = line.paperDemand > EPSILON ? paperCoverage : 1;
      line.bookCoverage = line.bookDemand > EPSILON ? bookCoverage : 0;
      line.paperUsed = line.paperDemand * line.paperCoverage;
      line.booksUsed = line.bookDemand * line.paperCoverage * line.bookCoverage;
      line.baseOutput = line.definition.baseOutput * line.levels * line.staffing
        * line.maintenance * line.paperCoverage;
      line.bookOutput = line.definition.bookBonus * line.levels * line.staffing
        * line.maintenance * line.paperCoverage * line.bookCoverage;
      line.output = round(line.baseOutput + line.bookOutput);
      consumed.paper += line.paperUsed;
      consumed.books += line.booksUsed;
      if (line.definition.controlType === 'country') producedCountry += line.output;
      else producedLocalByCenter[line.city.id] = (producedLocalByCenter[line.city.id] || 0) + line.output;
    });
    return {
      beginningStock,
      lines,
      paperCoverage,
      bookCoverage,
      consumed: {
        paper: round(consumed.paper),
        books: round(consumed.books)
      },
      producedCountry: round(producedCountry),
      producedLocalByCenter: Object.fromEntries(Object.entries(producedLocalByCenter).map(([id, value]) => [id, round(value)]))
    };
  }

  function resolveAlert(state, key) {
    const administration = ensureState(state);
    const alertId = administration.alertIds[key];
    const alert = alertId ? namespace.dailyEconomy.alertById(state, alertId) : null;
    if (alert) { alert.active = false; alert.resolved = true; }
    delete administration.alertIds[key];
  }

  function updateAlert(state, key, active, title, message, type) {
    const administration = ensureState(state);
    if (!active) { resolveAlert(state, key); return null; }
    let alert = administration.alertIds[key]
      ? namespace.dailyEconomy.alertById(state, administration.alertIds[key])
      : null;
    if (!alert) {
      alert = namespace.dailyEconomy.createAlert(state, { type, title, message, critical: false });
      administration.alertIds[key] = alert.id;
    } else {
      alert.message = message;
      alert.resolved = false;
      alert.active = true;
    }
    return alert;
  }

  function updateAlerts(state, plan) {
    const administration = state.administration;
    const countryShort = Object.values(administration.country.branches).some((row) => row.coverage < 1 - EPSILON);
    const localShort = Object.values(administration.localByCenter).some((row) => row.coverage < 1 - EPSILON);
    const inputShort = plan.lines.some((line) => (
      line.paperDemand > EPSILON && line.paperCoverage < 1 - EPSILON
    ) || (line.bookDemand > EPSILON && line.bookCoverage < 1 - EPSILON));
    updateAlert(state, 'country', countryShort, 'Country Control Shortage', 'One or more branches are collecting less than 100% of their output.', 'country-control-shortage');
    updateAlert(state, 'local', localShort, 'Local Control Shortage', 'One or more Villages are contributing less than 100% of their output.', 'local-control-shortage');
    updateAlert(state, 'inputs', inputShort, 'Administration Input Shortage', 'Paper or Books are limiting administrative output.', 'administration-input-shortage');
  }

  function settlementForRegion(state, regionId) {
    const cities = state.player.cities || [];
    return cities.find((city) => city.regionId === regionId)
      || cities.find((city) => (city.controlledRegionIds || []).includes(regionId))
      || null;
  }

  function collectionCoverageForSettlement(state, settlement) {
    if (!settlement) return 1;
    if (settlement.isCapital) return 1;
    if (settlement.settlementKind === 'village' || settlement.settlementIdentity === 'village') {
      const parent = namespace.settlementHierarchy.parentTown(state, settlement);
      const local = parent && state.administration.localByCenter[parent.id]
        ? state.administration.localByCenter[parent.id].coverage : 0;
      const country = parent && !parent.isCapital && state.administration.country.branches[parent.id]
        ? state.administration.country.branches[parent.id].coverage : 1;
      return clamp01(local * country);
    }
    const branch = state.administration.country.branches[settlement.id];
    return branch ? clamp01(branch.coverage) : 0;
  }

  function applyCollectionModifiers(state) {
    reconcile(state);
    const outpostRegionIds = new Set((state.player.outposts || []).map((outpost) => outpost.regionId));
    (state.map.regions || []).forEach((region) => {
      const outpost = outpostRegionIds.has(region.id);
      const settlement = outpost ? null : settlementForRegion(state, region.id);
      const modifier = outpost ? 0.75 : collectionCoverageForSettlement(state, settlement);
      (region.resourceSites || []).forEach((site) => { site.controllerModifier = modifier; });
    });
    (state.player.cities || []).forEach((city) => {
      const modifier = collectionCoverageForSettlement(state, city);
      city.collectionCoverage = modifier;
      (city.processingBuildings || []).forEach((building) => { building.controllerModifier = modifier; });
    });
    return state.administration;
  }

  function processDay(state) {
    const administration = ensureState(state);
    const plan = planDay(state);
    const consumed = Object.fromEntries(Object.entries(plan.consumed).filter(([, amount]) => amount > EPSILON));
    if (Object.keys(consumed).length) {
      namespace.storageLedger.addQuantities(state.storage.available, consumed, -1);
      namespace.storageLedger.recordTransaction(state.storage, 'administration-inputs-consumed', consumed);
    }
    administration.producedCountry = plan.producedCountry;
    administration.producedLocalByCenter = plan.producedLocalByCenter;
    if (!administration.founderCountryRetired
      && plan.producedCountry + EPSILON >= namespace.administrationData.FOUNDER_COUNTRY_CONTROL) {
      administration.founderCountryRetired = true;
    }
    const capital = namespace.settlementHierarchy.capital(state);
    const capitalLocal = capital ? Number(plan.producedLocalByCenter[capital.id]) || 0 : 0;
    if (!administration.founderLocalRetired
      && capitalLocal + EPSILON >= namespace.administrationData.FOUNDER_LOCAL_CONTROL) {
      administration.founderLocalRetired = true;
    }
    plan.lines.forEach((line) => {
      line.building.lastAdministration = {
        paperCoverage: line.paperCoverage,
        bookCoverage: line.bookCoverage,
        paperUsed: round(line.paperUsed),
        booksUsed: round(line.booksUsed),
        output: line.output,
        controlType: line.definition.controlType
      };
      if (activeLevels(line.building) <= 0) line.building.status = 'Capacity Disabled';
      else if (line.activeWorkers <= EPSILON) line.building.status = 'Unstaffed';
      else if (line.paperCoverage < 1 - EPSILON || (line.bookDemand > EPSILON && line.bookCoverage < 1 - EPSILON)) line.building.status = 'Input Shortage';
      else if (line.activeWorkers + EPSILON < line.activeRequired) line.building.status = 'Understaffed';
      else line.building.status = 'Active';
    });
    reconcile(state);
    applyCollectionModifiers(state);
    updateAlerts(state, plan);
    administration.lastDay = plan;
    return plan;
  }

  namespace.constructionProjectHandlers = namespace.constructionProjectHandlers || {};
  namespace.constructionProjectHandlers['administrative-building-level'] = completeProject;

  namespace.administration = Object.freeze({
    definitionById,
    cityById,
    ensureCityState,
    officeById,
    allOffices,
    activeLevels,
    requiredWorkers,
    requestWorkerCap,
    applyPendingChanges,
    settlementRegion,
    officeProjects,
    projectedLevel,
    constructionPreview,
    locationAvailability,
    buildAvailability,
    queueLevel,
    completeProject,
    reducePreview,
    reduceLevel,
    ensureState,
    branchPopulation,
    countryDemand,
    villageDemand,
    effectiveCountryCapacity,
    effectiveLocalCapacity,
    reconcile,
    requestCountryControl,
    activeOfficeLine,
    planDay,
    settlementForRegion,
    collectionCoverageForSettlement,
    applyCollectionModifiers,
    processDay
  });
})(window.EcoRuler = window.EcoRuler || {});
