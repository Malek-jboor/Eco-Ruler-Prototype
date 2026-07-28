(function initializeHealthPopulation(namespace) {
  const EPSILON = 0.000001;
  const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
  const round = (value, digits = 4) => {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  };

  function cities(state) {
    return state.player && Array.isArray(state.player.cities) ? state.player.cities : [];
  }

  function cityById(state, cityId) {
    return cities(state).find((city) => city.id === cityId) || null;
  }

  function ensureFacilityState(city) {
    city.medicalBuildings = Array.isArray(city.medicalBuildings) ? city.medicalBuildings : [];
    return city.medicalBuildings;
  }

  function ensureSettlement(city) {
    if (!city || city.settlementIdentity === 'outpost') return city;
    const firstSetup = Number(city.healthStateVersion) !== 1;
    city.healthStateVersion = 1;
    city.health = firstSetup ? namespace.healthData.INITIAL_HEALTH : clamp(city.health, 0, 100);
    city.healthSettings = city.healthSettings || {};
    city.healthSettings.clothingLayers = clamp(Math.round(city.healthSettings.clothingLayers || 1), 1, 3);
    city.healthSettings.medicalDistribution = city.healthSettings.medicalDistribution || {};
    city.healthSettings.pendingMedicalDistribution = city.healthSettings.pendingMedicalDistribution || {};
    namespace.healthData.medicalProducts.forEach((product) => {
      const current = city.healthSettings.medicalDistribution[product.id];
      city.healthSettings.medicalDistribution[product.id] = Number.isFinite(Number(current))
        ? clamp(Math.round(current), 0, 100) : 100;
    });
    city.demographics = city.demographics || {};
    city.demographics.allowImmigration = firstSetup ? true : city.demographics.allowImmigration !== false;
    city.demographics.birthAccumulator = Math.max(0, Number(city.demographics.birthAccumulator) || 0);
    city.demographics.deathAccumulator = Math.max(0, Number(city.demographics.deathAccumulator) || 0);
    city.demographics.migrationAccumulator = Number(city.demographics.migrationAccumulator) || 0;
    ensureFacilityState(city);
    city.healthShortageEpisode = city.healthShortageEpisode || null;
    city.immigrationRejectedEpisode = city.immigrationRejectedEpisode || null;
    return city;
  }

  function ensureState(state) {
    state.economy = state.economy || {};
    state.economy.health = state.economy.health || { stateVersion: 1, lastDay: null };
    cities(state).forEach(ensureSettlement);
    return state.economy.health;
  }

  function definitionById(buildingId) {
    return namespace.healthData.facilityDefinitions[buildingId] || null;
  }

  function facilityById(city, buildingId) {
    return ensureFacilityState(city).find((building) => building.buildingId === buildingId) || null;
  }

  function allFacilities(state) {
    return cities(state).flatMap((city) => ensureFacilityState(city).map((building) => ({ city, building })));
  }

  function activeLevels(building) {
    return namespace.developmentEconomy
      ? namespace.developmentEconomy.activeLevels(building)
      : Math.max(0, Number(building.level) || 0);
  }

  function requiredWorkers(state, building) {
    const definition = definitionById(building && building.buildingId);
    return definition ? definition.workers * Math.max(0, Number(building.level) || 0) : 0;
  }

  function requestWorkerCap(state, cityId, buildingId, requestedCap) {
    const city = cityById(state, cityId);
    const building = city && facilityById(city, buildingId);
    if (!building) return { ok: false, reason: 'Medical facility was not found.' };
    const maximum = requiredWorkers(state, building);
    const cap = Math.max(0, Math.min(maximum, Math.floor(Number(requestedCap) || 0)));
    building.pendingWorkerCap = cap;
    return { ok: true, building, cap, applies: 'next-daily-tick' };
  }

  function requestClothingLayers(state, cityId, value) {
    const city = cityById(state, cityId);
    const layers = Math.round(Number(value));
    if (!city || layers < 1 || layers > 3) return { ok: false, reason: 'Clothing layers must be between 1 and 3.' };
    ensureSettlement(city).healthSettings.pendingClothingLayers = layers;
    return { ok: true, value: layers, applies: 'next-daily-tick' };
  }

  function requestMedicalDistribution(state, cityId, productId, value) {
    const city = cityById(state, cityId);
    if (!city || !namespace.healthData.medicalProductById[productId]) return { ok: false, reason: 'Medical product was not found.' };
    const limit = Math.round(Number(value));
    if (!Number.isFinite(limit) || limit < 0 || limit > 100) return { ok: false, reason: 'Distribution limit must be from 0% to 100%.' };
    ensureSettlement(city).healthSettings.pendingMedicalDistribution[productId] = limit;
    return { ok: true, value: limit, applies: 'next-daily-tick' };
  }

  function requestAllowImmigration(state, cityId, enabled) {
    const city = cityById(state, cityId);
    if (!city) return { ok: false, reason: 'Settlement was not found.' };
    ensureSettlement(city).demographics.pendingAllowImmigration = Boolean(enabled);
    return { ok: true, value: Boolean(enabled), applies: 'next-daily-tick' };
  }

  function applyPending(state) {
    ensureState(state);
    cities(state).forEach((city) => {
      const settings = city.healthSettings;
      if (settings.pendingClothingLayers != null) settings.clothingLayers = settings.pendingClothingLayers;
      settings.pendingClothingLayers = null;
      Object.entries(settings.pendingMedicalDistribution).forEach(([productId, value]) => {
        settings.medicalDistribution[productId] = clamp(Math.round(value), 0, 100);
      });
      settings.pendingMedicalDistribution = {};
      if (city.demographics.pendingAllowImmigration != null) {
        const enabled = Boolean(city.demographics.pendingAllowImmigration);
        if (!enabled && city.demographics.migrationAccumulator > 0) city.demographics.migrationAccumulator = 0;
        city.demographics.allowImmigration = enabled;
      }
      city.demographics.pendingAllowImmigration = null;
      ensureFacilityState(city).forEach((building) => {
        if (building.pendingWorkerCap == null) return;
        building.workerCap = Math.min(requiredWorkers(state, building), Math.max(0, Math.floor(building.pendingWorkerCap)));
        building.pendingWorkerCap = null;
      });
    });
  }

  function settlementRegion(state, city) {
    return city ? namespace.resourceSites.regionById(state, city.regionId) : null;
  }

  function facilityProjects(region, cityId, buildingId) {
    if (!region) return [];
    return namespace.constructionQueue.ensureQueue(region).projects.filter((project) => (
      project.kind === 'medical-building-level'
      && project.cityId === cityId
      && project.buildingId === buildingId
      && ['active', 'waiting', 'paused'].includes(project.status)
    ));
  }

  function projectedLevel(state, city, buildingId) {
    const building = facilityById(city, buildingId);
    return (building ? building.level : 0) + facilityProjects(settlementRegion(state, city), city.id, buildingId).length;
  }

  function locationAvailability(city, definition) {
    if (!city || !definition) return { allowed: false, reason: 'Medical facility definition was not found.' };
    const location = city.isCapital ? 'capital' : (city.settlementTier || city.level || 'town');
    return definition.locations.includes(location)
      ? { allowed: true }
      : { allowed: false, reason: `${definition.label} is not allowed in this settlement.` };
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
      days: Math.max(1, Math.ceil(definition.construction.days * Math.sqrt(multiplier))),
      populationCapacity: definition.populationCapacity,
      workers: definition.workers,
      footprint: definition.construction.footprint
    };
  }

  function buildAvailability(state, regionId, buildingId) {
    const region = namespace.resourceSites.regionById(state, regionId);
    const city = cities(state).find((item) => item.regionId === regionId) || null;
    const definition = definitionById(buildingId);
    if (!state.player.gameStarted) return { allowed: false, reason: 'Start the game first.', region, city, definition };
    if (!region || !city) return { allowed: false, reason: 'Medical facilities require a settlement center province.', region, city, definition };
    const location = locationAvailability(city, definition);
    if (!location.allowed) return { ...location, region, city, definition };
    const capacity = namespace.developmentEconomy.canReserveDevelopment(state, city, buildingId);
    const preview = constructionPreview(state, city, buildingId);
    const shortages = namespace.resourceSites.materialShortages(state.storage, preview.materials);
    const allowed = capacity.allowed && Object.keys(shortages).length === 0;
    return {
      allowed,
      reason: !capacity.allowed ? capacity.reason : Object.keys(shortages).length
        ? 'The central stockpile lacks required construction materials.'
        : 'Ready to enter this settlement province construction queue.',
      region, city, definition, preview, shortages, capacity
    };
  }

  function queueLevel(state, regionId, buildingId) {
    const availability = buildAvailability(state, regionId, buildingId);
    if (!availability.allowed) return availability;
    return namespace.constructionQueue.queueProject(state, availability.region, {
      kind: 'medical-building-level',
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
    const city = cityById(state, project.cityId) || cities(state).find((item) => item.regionId === region.id);
    const definition = definitionById(project.buildingId);
    if (!city || !definition) return null;
    ensureFacilityState(city);
    let building = facilityById(city, project.buildingId);
    if (!building) {
      state.nextMedicalBuildingOrder = Math.max(0, Number(state.nextMedicalBuildingOrder) || 0) + 1;
      building = {
        id: `${city.id}-${project.buildingId}`,
        buildingId: project.buildingId,
        level: 0,
        workerCap: 0,
        pendingWorkerCap: null,
        actualWorkers: 0,
        createdOrder: state.nextMedicalBuildingOrder,
        status: 'Idle',
        maintenanceMultiplier: 1,
        maintenanceCoverage: 1,
        maintenancePriority: 'normal',
        capacityDisabledLevels: 0,
        levelOrders: []
      };
      city.medicalBuildings.push(building);
    }
    const previousRequired = requiredWorkers(state, building);
    const previousRatio = previousRequired > 0 ? Math.min(1, building.workerCap / previousRequired) : 1;
    building.level += 1;
    namespace.developmentEconomy.ensureState(state);
    building.workerCap = Math.round(requiredWorkers(state, building) * previousRatio);
    building.status = 'Unstaffed';
    return building;
  }

  function reducePreview(state, cityId, buildingId) {
    const city = cityById(state, cityId);
    const region = settlementRegion(state, city);
    if (!city || !region) return { allowed: false, reason: 'Settlement was not found.' };
    const projects = facilityProjects(region, cityId, buildingId);
    const project = projects.slice().reverse().find((item) => ['waiting', 'active', 'paused'].includes(item.status));
    if (project) return { allowed: true, project, action: 'cancel-project', reason: 'Cancels the newest medical construction project.' };
    const building = facilityById(city, buildingId);
    if (!building || building.level <= 0) return { allowed: false, reason: 'The medical facility is already at Level 0.' };
    return { allowed: true, building, action: 'reduce-completed', targetLevel: building.level - 1, reason: 'Removes one completed level with no refund.' };
  }

  function reduceLevel(state, cityId, buildingId, options = {}) {
    const preview = reducePreview(state, cityId, buildingId);
    if (!preview.allowed) return preview;
    const city = cityById(state, cityId);
    const region = settlementRegion(state, city);
    if (preview.project) return namespace.constructionQueue.cancelProject(state, region, preview.project.id, { confirmOverflow: Boolean(options.confirmOverflow) });
    const building = preview.building;
    const ratio = requiredWorkers(state, building) > 0 ? Math.min(1, building.workerCap / requiredWorkers(state, building)) : 1;
    building.level -= 1;
    if (Array.isArray(building.levelOrders)) building.levelOrders.pop();
    building.workerCap = Math.round(requiredWorkers(state, building) * ratio);
    if (building.level <= 0) city.medicalBuildings = city.medicalBuildings.filter((item) => item !== building);
    namespace.developmentEconomy.reconcileAll(state);
    namespace.workforce.recalculateAll(state);
    return { ok: true, ...preview };
  }

  function facilitySummary(state, city) {
    ensureSettlement(city);
    const rows = ensureFacilityState(city).map((building) => {
      const definition = definitionById(building.buildingId);
      const levels = activeLevels(building);
      const totalRequired = definition.workers * Math.max(0, Number(building.level) || 0);
      const activeRequired = definition.workers * levels;
      const activeWorkers = Math.min(Math.max(0, Number(building.actualWorkers) || 0), activeRequired);
      const staffing = activeRequired > EPSILON ? clamp(activeWorkers / activeRequired) : 0;
      const maintenance = clamp(building.maintenanceCoverage == null ? 1 : building.maintenanceCoverage);
      const effectiveCapacity = definition.populationCapacity * levels * staffing * maintenance;
      return { building, definition, levels, totalRequired, activeRequired, activeWorkers, staffing, maintenance, effectiveCapacity };
    });
    const population = Math.max(0, Number(city.population) || 0);
    const capacity = rows.reduce((sum, row) => sum + row.effectiveCapacity, 0);
    const coveredPopulation = Math.min(population, capacity);
    return {
      cityId: city.id,
      rows,
      population,
      capacity: round(capacity),
      coveredPopulation: round(coveredPopulation),
      coverage: population > EPSILON ? clamp(coveredPopulation / population) : 1
    };
  }

  function satisfactionRow(state, city, livingStandards) {
    const row = livingStandards && livingStandards.rows
      ? livingStandards.rows.find((item) => item.id === city.id)
      : null;
    if (row) return row;
    const preview = namespace.satisfaction.livingStandards(state, false);
    return preview.rows.find((item) => item.id === city.id);
  }

  function consumeExtraClothing(state, livingStandards) {
    const result = {};
    cities(state).forEach((city) => {
      const row = satisfactionRow(state, city, livingStandards);
      result[city.id] = [{ layer: 1, coverage: row ? row.clothing.coverage : 0 }];
    });
    [2, 3].forEach((layer) => {
      const eligible = cities(state).filter((city) => city.healthSettings.clothingLayers >= layer && city.population > 0);
      const required = eligible.reduce((sum, city) => sum + city.population * namespace.healthData.CLOTHING_PER_PERSON_PER_LAYER, 0);
      const available = namespace.satisfactionData.clothingResources.reduce((sum, id) => sum + Math.max(0, Number(state.storage.available[id]) || 0), 0);
      const coverage = required > EPSILON ? Math.min(1, available / required) : 1;
      if (required > EPSILON) namespace.storageLedger.consumeGroup(state.storage, namespace.satisfactionData.clothingResources, required, `health-clothing-layer-${layer}`);
      cities(state).forEach((city) => result[city.id].push({
        layer,
        coverage: city.healthSettings.clothingLayers >= layer ? round(coverage) : 0
      }));
    });
    return result;
  }

  function distributeMedicalProducts(state, facilities) {
    const byCity = Object.fromEntries(cities(state).map((city) => [city.id, {}]));
    namespace.healthData.medicalProducts.forEach((product) => {
      const requests = cities(state).map((city) => {
        const facility = facilities[city.id];
        const fullNeed = facility.coveredPopulation * namespace.healthData.MEDICAL_PRODUCT_PER_COVERED_PERSON;
        const limit = city.healthSettings.medicalDistribution[product.id] / 100;
        return { city, facility, fullNeed, limit, allowedNeed: fullNeed * limit };
      });
      const totalAllowed = requests.reduce((sum, row) => sum + row.allowedNeed, 0);
      const available = Math.max(0, Number(state.storage.available[product.id]) || 0);
      const stockFulfillment = totalAllowed > EPSILON ? Math.min(1, available / totalAllowed) : 1;
      const consumedTotal = totalAllowed * stockFulfillment;
      if (consumedTotal > EPSILON) namespace.storageLedger.consume(state.storage, product.id, consumedTotal, 'medical-products-consumed');
      requests.forEach((row) => {
        const consumed = row.allowedNeed * stockFulfillment;
        const fulfillmentAmongCovered = row.fullNeed > EPSILON ? consumed / row.fullNeed : (row.limit > 0 ? 1 : 0);
        const effectiveCoverage = row.facility.coverage * fulfillmentAmongCovered;
        byCity[row.city.id][product.id] = {
          productId: product.id,
          label: product.label,
          pointsMaximum: product.points,
          distributionLimit: round(row.limit),
          fullNeed: round(row.fullNeed),
          allowedNeed: round(row.allowedNeed),
          consumed: round(consumed),
          stockFulfillment: round(stockFulfillment),
          fulfillmentAmongCovered: round(fulfillmentAmongCovered),
          effectiveCoverage: round(effectiveCoverage),
          points: round(product.points * effectiveCoverage),
          intentionalLimit: row.limit < 1 - EPSILON
        };
      });
    });
    return byCity;
  }

  function healthScore(state, city, row, clothing, facility, medical) {
    const housing = namespace.developmentEconomy.housingSummary(city);
    const first = row && row.food && row.food.layers ? row.food.layers[0] : { coverage: 0, categoryCount: 0 };
    const variety = first.categoryCount <= 1 ? 0 : first.categoryCount === 2 ? 2.1 : first.categoryCount === 3 ? 4.2 : 7;
    const clothingPoints = [5, 3, 2].reduce((sum, maximum, index) => sum + maximum * (clothing[index] ? clothing[index].coverage : 0), 0);
    const medicalProductPoints = Object.values(medical).reduce((sum, product) => sum + product.points, 0);
    const components = {
      base: 30,
      housing: round(housing.satisfactionPotential / 15 * 10),
      foodCoverage: round(first.coverage * 8),
      foodVariety: round(variety),
      clothing: round(clothingPoints),
      medicalProducts: round(medicalProductPoints),
      medicalBuildings: round(facility.coverage * 15)
    };
    const target = clamp(Object.values(components).reduce((sum, value) => sum + value, 0), 0, 100);
    const actual = clamp(city.health, 0, 100);
    const movement = target > actual + EPSILON ? Math.min(namespace.healthData.DAILY_INCREASE, target - actual)
      : target < actual - EPSILON ? -Math.min(namespace.healthData.DAILY_DECREASE, actual - target) : 0;
    return {
      cityId: city.id,
      actual: round(actual, 2),
      target: round(target, 2),
      movement: round(movement, 2),
      nextDay: round(actual + movement, 2),
      components,
      housing,
      food: first,
      clothing,
      facility,
      medicalProducts: medical
    };
  }

  function securityCoverage(state, city) {
    const service = namespace.satisfaction.ensureService(city, 'local-watch');
    return service.requiredWorkers > EPSILON ? clamp(service.actualWorkers / service.requiredWorkers) : 1;
  }

  function demographicRates(state, city, healthValue = city.health) {
    const satisfaction = clamp(city.satisfaction, 0, 100);
    const security = securityCoverage(state, city);
    const birthRate = namespace.healthData.BIRTH_BASE_RATE + satisfaction * namespace.healthData.BIRTH_SATISFACTION_RATE;
    const deathRate = namespace.healthData.DEATH_BASE_RATE * (1.25 - 0.25 * security) * (1.5 - clamp(healthValue, 0, 100) / 100);
    const migrationRate = satisfaction > 50
      ? ((satisfaction - 50) / 50) * 0.1
      : satisfaction < 50 ? -((50 - satisfaction) / 50) * 0.2 : 0;
    return { satisfaction, security, health: healthValue, birthRate, deathRate, migrationRate };
  }

  function populationFloor(city) {
    return city.settlementIdentity === 'village' || city.settlementTier === 'village' ? 50 : 500;
  }

  function projections(city, rates) {
    const population = Math.max(0, Number(city.population) || 0);
    const vacancy = Math.max(0, namespace.developmentEconomy.housingSummary(city).capacity - population);
    const forDays = (days) => {
      const births = Math.floor(population * rates.birthRate * days / namespace.healthData.DAYS_PER_YEAR);
      const deaths = Math.floor(population * rates.deathRate * days / namespace.healthData.DAYS_PER_YEAR);
      const potentialMigration = Math.trunc(population * rates.migrationRate * days / namespace.healthData.DAYS_PER_YEAR);
      const acceptedMigration = potentialMigration > 0
        ? (city.demographics.allowImmigration ? Math.min(potentialMigration, Math.floor(vacancy)) : 0)
        : potentialMigration;
      const rejectedMigration = Math.max(0, potentialMigration - acceptedMigration);
      return { days, births, deaths, potentialMigration, migration: acceptedMigration, rejectedMigration, net: births - deaths + acceptedMigration, population: population + births - deaths + acceptedMigration };
    };
    return { days30: forDays(30), days360: forDays(360) };
  }

  function updatePopulationFields(city) {
    city.population = Math.max(0, Math.floor(Number(city.population) || 0));
    city.workforceTotal = Math.floor(city.population * 0.6);
    city.nonWorkforcePopulation = city.population - city.workforceTotal;
    city.nobles = Math.min(Math.max(0, Math.floor(Number(city.nobles) || 0)), city.population);
    city.commoners = Math.max(0, city.population - city.nobles);
  }

  function commitDemographics(state, city) {
    const demographics = city.demographics;
    const population = Math.max(0, Math.floor(Number(city.population) || 0));
    const rates = demographicRates(state, city);
    demographics.birthAccumulator += population * rates.birthRate / namespace.healthData.DAYS_PER_YEAR;
    demographics.deathAccumulator += population * rates.deathRate / namespace.healthData.DAYS_PER_YEAR;
    const births = Math.floor(demographics.birthAccumulator + EPSILON);
    demographics.birthAccumulator -= births;
    const floor = populationFloor(city);
    const deathCandidates = Math.floor(demographics.deathAccumulator + EPSILON);
    const deaths = Math.min(deathCandidates, Math.max(0, population + births - floor));
    demographics.deathAccumulator -= deathCandidates;
    demographics.deathAccumulator = Math.max(0, demographics.deathAccumulator);

    const dailyMigration = population * rates.migrationRate / namespace.healthData.DAYS_PER_YEAR;
    if (dailyMigration > 0 && !demographics.allowImmigration) {
      if (demographics.migrationAccumulator > 0) demographics.migrationAccumulator = 0;
    } else demographics.migrationAccumulator += dailyMigration;

    let migration = 0;
    let potentialImmigration = 0;
    let rejectedImmigration = 0;
    const afterNatural = population + births - deaths;
    if (demographics.migrationAccumulator >= 1 - EPSILON) {
      potentialImmigration = Math.floor(demographics.migrationAccumulator + EPSILON);
      const vacancy = Math.max(0, Math.floor(namespace.developmentEconomy.housingSummary(city).capacity - afterNatural));
      migration = demographics.allowImmigration ? Math.min(potentialImmigration, vacancy) : 0;
      rejectedImmigration = potentialImmigration - migration;
      demographics.migrationAccumulator -= potentialImmigration;
    } else if (demographics.migrationAccumulator <= -1 + EPSILON) {
      const candidates = Math.floor(-demographics.migrationAccumulator + EPSILON);
      const emigrants = Math.min(candidates, Math.max(0, afterNatural - floor));
      migration = -emigrants;
      demographics.migrationAccumulator += candidates;
    }

    city.population = afterNatural + migration;
    updatePopulationFields(city);
    const projection = projections(city, rates);
    city.demographicSummary = {
      rates,
      births,
      deaths,
      migration,
      potentialImmigration,
      rejectedImmigration,
      net: births - deaths + migration,
      projections: projection
    };
    return city.demographicSummary;
  }

  function resolveEpisode(state, city, key) {
    const episode = city[key];
    if (!episode) return;
    const alert = namespace.dailyEconomy.alertById(state, episode.alertId);
    if (alert) { alert.active = false; alert.resolved = true; }
    city[key] = null;
  }

  function updateHealthAlert(state, city, result) {
    const shortages = [];
    if (result.facility.coverage < 1 - EPSILON) shortages.push('Medical Capacity');
    if (result.facility.rows.some((row) => row.staffing < 1 - EPSILON)) shortages.push('Medical Staffing');
    if (result.facility.rows.some((row) => row.maintenance < 1 - EPSILON)) shortages.push('Medical Maintenance');
    Object.values(result.medicalProducts).forEach((product) => {
      if (!product.intentionalLimit && product.stockFulfillment < 1 - EPSILON) shortages.push(product.label);
    });
    if (!shortages.length) return resolveEpisode(state, city, 'healthShortageEpisode');
    const rates = demographicRates(state, city, result.nextDay);
    const message = `${city.name}: ${Array.from(new Set(shortages)).join(', ')}. Health ${round(result.actual, 1)} -> ${round(result.target, 1)}; mortality ${(rates.deathRate * 100).toFixed(2)}% / Year.`;
    if (city.healthShortageEpisode) {
      const alert = namespace.dailyEconomy.alertById(state, city.healthShortageEpisode.alertId);
      if (alert) alert.message = message;
      return;
    }
    const alert = namespace.dailyEconomy.createAlert(state, { type: 'health-shortage', title: 'Local Health Shortage', message, critical: false });
    city.healthShortageEpisode = { alertId: alert.id };
  }

  function updateImmigrationAlert(state, city, summary) {
    if (!summary.rejectedImmigration) return resolveEpisode(state, city, 'immigrationRejectedEpisode');
    const message = `${city.name}: ${summary.rejectedImmigration} potential immigrants were rejected because Housing is full.`;
    if (city.immigrationRejectedEpisode) {
      const alert = namespace.dailyEconomy.alertById(state, city.immigrationRejectedEpisode.alertId);
      if (alert) alert.message = message;
      return;
    }
    const alert = namespace.dailyEconomy.createAlert(state, { type: 'immigration-rejected', title: 'Immigration Blocked By Housing', message, critical: false });
    city.immigrationRejectedEpisode = { alertId: alert.id };
  }

  function processDay(state, livingStandards) {
    ensureState(state);
    const facilities = Object.fromEntries(cities(state).map((city) => [city.id, facilitySummary(state, city)]));
    const clothing = consumeExtraClothing(state, livingStandards);
    const medical = distributeMedicalProducts(state, facilities);
    const settlements = cities(state).map((city) => {
      const row = satisfactionRow(state, city, livingStandards);
      const result = healthScore(state, city, row, clothing[city.id], facilities[city.id], medical[city.id]);
      city.health = result.nextDay;
      city.healthTarget = result.target;
      city.healthBreakdown = result;
      updateHealthAlert(state, city, result);
      const demographics = commitDemographics(state, city);
      updateImmigrationAlert(state, city, demographics);
      return { ...result, demographics };
    });
    namespace.workforce.recalculateAll(state);
    namespace.developmentEconomy.reconcileAll(state);
    const result = { settlements };
    state.economy.health.lastDay = result;
    return result;
  }

  function previewSettlement(state, cityId) {
    ensureState(state);
    const city = cityById(state, cityId);
    if (!city) return null;
    if (city.healthBreakdown) {
      const rates = demographicRates(state, city);
      return { ...city.healthBreakdown, actual: city.health, target: city.healthTarget, rates, projections: projections(city, rates) };
    }
    const row = satisfactionRow(state, city, null);
    const facility = facilitySummary(state, city);
    const clothing = [
      { layer: 1, coverage: row ? row.clothing.coverage : 0 },
      { layer: 2, coverage: 0 },
      { layer: 3, coverage: 0 }
    ];
    const medical = Object.fromEntries(namespace.healthData.medicalProducts.map((product) => [product.id, {
      productId: product.id, label: product.label, pointsMaximum: product.points,
      distributionLimit: city.healthSettings.medicalDistribution[product.id] / 100,
      fullNeed: facility.coveredPopulation / 1200, allowedNeed: 0, consumed: 0,
      stockFulfillment: 0, fulfillmentAmongCovered: 0, effectiveCoverage: 0, points: 0
    }]));
    const result = healthScore(state, city, row, clothing, facility, medical);
    const rates = demographicRates(state, city, result.actual);
    return { ...result, rates, projections: projections(city, rates) };
  }

  function realmSummary(state) {
    ensureState(state);
    const rows = cities(state).map((city) => previewSettlement(state, city.id));
    const population = cities(state).reduce((sum, city) => sum + Number(city.population || 0), 0);
    const weighted = (field) => population > EPSILON
      ? rows.reduce((sum, row) => sum + Number(row[field] || 0) * Number(cityById(state, row.cityId).population || 0), 0) / population : 0;
    const daily = cities(state).reduce((totals, city) => {
      const summary = city.demographicSummary || { births: 0, deaths: 0, migration: 0, net: 0 };
      totals.births += summary.births || 0;
      totals.deaths += summary.deaths || 0;
      totals.migration += summary.migration || 0;
      totals.net += summary.net || 0;
      return totals;
    }, { births: 0, deaths: 0, migration: 0, net: 0 });
    return { actual: round(weighted('actual'), 1), target: round(weighted('target'), 1), population, daily, settlements: rows };
  }

  namespace.constructionProjectHandlers = namespace.constructionProjectHandlers || {};
  namespace.constructionProjectHandlers['medical-building-level'] = completeProject;

  namespace.health = Object.freeze({
    ensureState, ensureSettlement, ensureFacilityState, cityById, definitionById,
    facilityById, allFacilities, activeLevels, requiredWorkers, requestWorkerCap,
    requestClothingLayers, requestMedicalDistribution, requestAllowImmigration,
    applyPending, settlementRegion, facilityProjects, projectedLevel,
    locationAvailability, constructionPreview, buildAvailability, queueLevel,
    completeProject, reducePreview, reduceLevel, facilitySummary,
    demographicRates, populationFloor, projections, processDay,
    previewSettlement, realmSummary
  });
})(window.EcoRuler = window.EcoRuler || {});
