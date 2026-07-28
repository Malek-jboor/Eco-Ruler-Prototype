(function initializeSettlementFoundation(namespace) {
  const SCHEMA_VERSION = 2;
  const CONTROL_ZONE_RADIUS = 3;
  const STARTING_VILLAGE_COUNT = 2;
  const STARTING_CAPITAL_POPULATION = 900;
  const STARTING_CAPITAL_WORKFORCE = 540;
  const STARTING_CAPITAL_HOUSING = 1200;
  const STARTING_VILLAGE_POPULATION = 50;
  const STARTING_VILLAGE_WORKFORCE = 30;
  const STARTING_VILLAGE_HOUSING = 500;

  function normalizedTier(value, fallback = 'town') {
    if (value === 'metropolis') return 'metropolis';
    if (value === 'city') return 'city';
    if (value === 'village') return 'village';
    return fallback;
  }

  function identityFor(city, isCapital) {
    if (isCapital) return 'capital';
    if (city.settlementKind === 'village' || city.settlementIdentity === 'village') return 'village';
    return city.settlementTier === 'town' ? 'town' : 'city';
  }

  function normalizeCity(city, options = {}) {
    const isCapital = Boolean(options.isCapital || city.isCapital || city.settlementIdentity === 'capital');
    const isVillage = !isCapital && (city.settlementKind === 'village' || city.settlementIdentity === 'village');
    let tier = normalizedTier(city.settlementTier || city.level, isVillage ? 'village' : 'town');
    if (isCapital && tier === 'village') tier = 'town';
    if (isVillage) tier = 'village';

    city.settlementTier = tier;
    city.level = tier;
    city.isCapital = isCapital;
    city.settlementKind = isVillage ? 'village' : 'urban';
    city.settlementIdentity = identityFor(city, isCapital);
    city.capitalId = isCapital ? city.id : (options.capitalId || city.capitalId || null);
    city.parentTownId = isVillage ? (city.parentTownId || options.parentTownId || null) : null;
    city.specialtyId = isVillage ? (city.specialtyId || null) : null;
    city.administrativeCenterId = isCapital
      ? city.id
      : isVillage
        ? city.parentTownId
        : city.capitalId;
    city.controlZoneCenterId = isVillage ? city.parentTownId : city.id;
    city.controlZoneRadius = isVillage ? 0 : CONTROL_ZONE_RADIUS;
    city.administrativeBuildings = Array.isArray(city.administrativeBuildings)
      ? city.administrativeBuildings
      : [];
    city.medicalBuildings = Array.isArray(city.medicalBuildings) ? city.medicalBuildings : [];
    city.health = Number.isFinite(Number(city.health)) ? Number(city.health) : 50;
    city.healthSettings = city.healthSettings || {};
    city.demographics = city.demographics || {};
    city.housingCapacity = Math.max(0, Number(city.housingCapacity) || 0);
    city.founderHousing = Math.max(0, Number(city.founderHousing) || 0);
    city.residentialDistrictLevels = Math.max(0, Math.floor(Number(city.residentialDistrictLevels) || 0));
    city.residentialDistrictLevelOrders = Array.isArray(city.residentialDistrictLevelOrders) ? city.residentialDistrictLevelOrders : [];
    city.residentialDistrictDisabledLevels = Math.max(0, Math.floor(Number(city.residentialDistrictDisabledLevels) || 0));
    city.residentialMaintenancePriority = city.residentialMaintenancePriority || 'normal';
    city.pendingResidentialMaintenancePriority = city.pendingResidentialMaintenancePriority || null;
    city.residentialMaintenanceCoverage = Number.isFinite(Number(city.residentialMaintenanceCoverage)) ? Math.max(0, Math.min(1, Number(city.residentialMaintenanceCoverage))) : 1;
    city.satisfaction = Number.isFinite(Number(city.satisfaction)) ? Number(city.satisfaction) : 60;
    city.satisfactionPenalty = city.satisfactionPenalty && Number(city.satisfactionPenalty.remainingDays) > 0 ? { ...city.satisfactionPenalty } : null;
    city.lifecycleProjectId = city.lifecycleProjectId || null;
    city.stateSchemaVersion = SCHEMA_VERSION;
    return city;
  }

  function normalizeOutpost(outpost, capitalId = null) {
    outpost.settlementIdentity = 'outpost';
    outpost.settlementKind = 'outpost';
    outpost.settlementTier = 'outpost';
    outpost.capitalId = outpost.capitalId || capitalId || null;
    outpost.originSettlementId = outpost.originSettlementId || outpost.originCityId || null;
    outpost.originCityId = outpost.originCityId || outpost.originSettlementId || null;
    outpost.administrativeCenterId = outpost.originSettlementId;
    outpost.parentTownId = null;
    outpost.foundingDistance = Math.max(0, Math.floor(Number(outpost.foundingDistance) || 0));
    outpost.conversionProjectId = outpost.conversionProjectId || null;
    outpost.resourceSiteLimit = 1;
    outpost.stateSchemaVersion = SCHEMA_VERSION;
    return outpost;
  }

  function migratePlayer(state) {
    state.player = state.player || {};
    state.player.cities = Array.isArray(state.player.cities) ? state.player.cities : [];
    state.player.outposts = Array.isArray(state.player.outposts) ? state.player.outposts : [];

    let capital = state.player.cities.find((city) => (
      city.isCapital || city.settlementIdentity === 'capital'
    )) || null;
    if (!capital && state.player.gameStarted && state.player.cities.length) {
      capital = state.player.cities[0];
    }

    const capitalId = capital ? capital.id : (state.player.capitalSettlementId || state.player.capitalId || null);
    state.player.cities.forEach((city) => normalizeCity(city, {
      isCapital: Boolean(capital && city.id === capital.id),
      capitalId
    }));
    state.player.outposts.forEach((outpost) => normalizeOutpost(outpost, capitalId));
    state.player.capitalSettlementId = capitalId;
    state.player.capitalId = capitalId;
    state.player.settlementStateVersion = SCHEMA_VERSION;
    return state.player;
  }

  function migrateState(state) {
    migratePlayer(state);
    state.meta = state.meta || {};
    state.meta.settlementStateVersion = SCHEMA_VERSION;
    return state;
  }

  function regionById(state, regionId) {
    return state && state.map && Array.isArray(state.map.regions)
      ? state.map.regions.find((region) => region.id === regionId) || null
      : null;
  }

  function startingVillageSetup(state) {
    return state && state.player ? state.player.startingVillageSetup || null : null;
  }

  function startingVillageSetupInProgress(state) {
    const setup = startingVillageSetup(state);
    return Boolean(setup && setup.status === 'active');
  }

  function beginStartingVillageSetup(state, capitalId) {
    const capital = (state.player.cities || []).find((city) => city.id === capitalId && city.isCapital);
    if (!capital) return { ok: false, reason: 'The State Capital was not found.' };
    state.player.startingVillageSetup = {
      status: 'active',
      stage: 'province',
      capitalId: capital.id,
      required: STARTING_VILLAGE_COUNT,
      entries: [],
      draftRegionId: null,
      editIndex: null,
      editOriginal: null
    };
    return { ok: true, setup: state.player.startingVillageSetup };
  }

  function provinceEligibility(state, regionId) {
    const setup = startingVillageSetup(state);
    const region = regionById(state, regionId);
    const capital = setup
      ? (state.player.cities || []).find((city) => city.id === setup.capitalId)
      : null;
    const capitalRegion = capital ? regionById(state, capital.regionId) : null;
    if (!setup || setup.status !== 'active') return { allowed: false, reason: 'Starting Village setup is not active.', region, capital };
    if (!region) return { allowed: false, reason: 'Choose a valid province.', region, capital };
    if (!capitalRegion) return { allowed: false, reason: 'The Capital province was not found.', region, capital };
    if (region.isWater) return { allowed: false, reason: 'Starting Villages require land provinces.', region, capital };
    if (!capitalRegion.neighbors.includes(region.id)) return { allowed: false, reason: 'Choose a province directly adjacent to the Capital.', region, capital };
    if (region.ownerId || region.controllerId) return { allowed: false, reason: 'This province is already controlled.', region, capital };
    if (setup.entries.some((entry) => entry.regionId === region.id)) {
      return { allowed: false, reason: 'This province is already selected for the other Village.', region, capital };
    }
    const resources = (region.resourceCandidates || []).filter((candidate) => candidate.available);
    return { allowed: true, reason: 'Eligible adjacent Village province.', region, capital, resources };
  }

  function startingVillageSpecialtyCards(state, regionId = null) {
    const setup = startingVillageSetup(state);
    const targetRegionId = regionId || (setup && setup.draftRegionId);
    const region = regionById(state, targetRegionId);
    if (!region || !namespace.developmentEconomy) return [];
    const draft = {
      settlementKind: 'village',
      settlementIdentity: 'village',
      settlementTier: 'village',
      specialtyId: null
    };
    return namespace.developmentEconomy.specialtyCards(draft, region).map((card) => ({
      ...card,
      localDemand: Number(
        namespace.administrationData
        && namespace.administrationData.localDemand[card.id]
        && namespace.administrationData.localDemand[card.id][1]
      ) || 0
    }));
  }

  function chooseStartingVillageProvince(state, regionId) {
    const setup = startingVillageSetup(state);
    if (!setup || setup.status !== 'active' || setup.stage !== 'province') {
      return { ok: false, reason: 'Finish the current setup choice first.' };
    }
    const preview = provinceEligibility(state, regionId);
    if (!preview.allowed) return { ok: false, reason: preview.reason, preview };
    setup.draftRegionId = regionId;
    setup.stage = 'specialty';
    return { ok: true, setup, region: preview.region };
  }

  function chooseStartingVillageSpecialty(state, specialtyId) {
    const setup = startingVillageSetup(state);
    if (!setup || setup.status !== 'active' || setup.stage !== 'specialty' || !setup.draftRegionId) {
      return { ok: false, reason: 'Choose an adjacent province first.' };
    }
    const card = startingVillageSpecialtyCards(state)
      .find((item) => item.id === specialtyId);
    if (!card) return { ok: false, reason: 'Choose a valid Village specialty.' };
    if (!card.eligible) return { ok: false, reason: 'This province has no eligible raw resource for that specialty.' };
    const entry = { regionId: setup.draftRegionId, specialtyId: card.id };
    const insertIndex = Number.isInteger(setup.editIndex)
      ? setup.editIndex
      : setup.entries.length;
    setup.entries.splice(insertIndex, 0, entry);
    setup.draftRegionId = null;
    setup.editIndex = null;
    setup.editOriginal = null;
    setup.stage = setup.entries.length >= setup.required ? 'review' : 'province';
    return { ok: true, setup, entry, card };
  }

  function editStartingVillageChoice(state, index, field) {
    const setup = startingVillageSetup(state);
    const targetIndex = Math.floor(Number(index));
    if (!setup || setup.status !== 'active' || setup.stage !== 'review') {
      return { ok: false, reason: 'The starting Village summary is not ready.' };
    }
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= setup.entries.length) {
      return { ok: false, reason: 'The selected Village choice was not found.' };
    }
    const original = setup.entries.splice(targetIndex, 1)[0];
    setup.editIndex = targetIndex;
    setup.editOriginal = { ...original };
    setup.draftRegionId = field === 'specialty' ? original.regionId : null;
    setup.stage = field === 'specialty' ? 'specialty' : 'province';
    return { ok: true, setup, original };
  }

  function backStartingVillageSetup(state) {
    const setup = startingVillageSetup(state);
    if (!setup || setup.status !== 'active') return { ok: false, reason: 'Starting Village setup is not active.' };
    if (setup.editOriginal && Number.isInteger(setup.editIndex)) {
      setup.entries.splice(setup.editIndex, 0, setup.editOriginal);
      setup.stage = 'review';
    } else if (setup.stage === 'specialty') {
      setup.stage = 'province';
    } else {
      return { ok: false, reason: 'There is no setup step to return from.' };
    }
    setup.draftRegionId = null;
    setup.editIndex = null;
    setup.editOriginal = null;
    return { ok: true, setup };
  }

  function confirmStartingVillages(state) {
    const setup = startingVillageSetup(state);
    if (!setup || setup.status !== 'active' || setup.stage !== 'review' || setup.entries.length !== STARTING_VILLAGE_COUNT) {
      return { ok: false, reason: 'Choose both starting Villages before confirming.' };
    }
    const capital = (state.player.cities || []).find((city) => city.id === setup.capitalId && city.isCapital);
    const capitalRegion = capital ? regionById(state, capital.regionId) : null;
    if (!capital || !capitalRegion) return { ok: false, reason: 'The State Capital was not found.' };
    const seen = new Set();
    let totalLocalDemand = 0;
    const validated = [];
    for (const entry of setup.entries) {
      const region = regionById(state, entry.regionId);
      if (!region || region.isWater || !capitalRegion.neighbors.includes(region.id) || region.ownerId || region.controllerId || seen.has(region.id)) {
        return { ok: false, reason: 'One starting Village province is no longer eligible.' };
      }
      const card = startingVillageSpecialtyCards(state, region.id)
        .find((item) => item.id === entry.specialtyId);
      if (!card || !card.eligible) return { ok: false, reason: 'One starting Village specialty is no longer eligible.' };
      seen.add(region.id);
      totalLocalDemand += card.localDemand;
      validated.push({ entry, region, card });
    }
    const founderLocal = Number(namespace.administrationData && namespace.administrationData.FOUNDER_LOCAL_CONTROL) || 0;
    if (totalLocalDemand > founderLocal) return { ok: false, reason: 'Founder Local Control cannot cover both starting Villages.' };

    const villages = validated.map(({ entry, region }, index) => {
      const village = namespace.models.createCity({
        id: 'village-' + (index + 1),
        name: 'Village ' + (index + 1),
        level: 'village',
        settlementTier: 'village',
        settlementKind: 'village',
        capitalId: capital.id,
        parentTownId: capital.id,
        regionId: region.id,
        controlledRegionIds: [region.id],
        specialtyId: entry.specialtyId,
        population: STARTING_VILLAGE_POPULATION,
        commoners: STARTING_VILLAGE_POPULATION,
        nobles: 0,
        workforceTotal: STARTING_VILLAGE_WORKFORCE,
        workforceAvailable: STARTING_VILLAGE_WORKFORCE,
        housingCapacity: STARTING_VILLAGE_HOUSING,
        founderHousing: STARTING_VILLAGE_HOUSING
      });
      region.ownerId = 'player';
      region.controllerId = 'player';
      region.discovered = true;
      return village;
    });

    capital.population = STARTING_CAPITAL_POPULATION;
    capital.commoners = Math.max(0, STARTING_CAPITAL_POPULATION - 4);
    capital.nobles = Math.min(4, STARTING_CAPITAL_POPULATION);
    capital.workforceTotal = STARTING_CAPITAL_WORKFORCE;
    capital.workforceAssigned = 0;
    capital.workforceAvailable = STARTING_CAPITAL_WORKFORCE;
    capital.housingCapacity = STARTING_CAPITAL_HOUSING;
    capital.founderHousing = STARTING_CAPITAL_HOUSING;
    capital.controlledRegionIds = [capital.regionId];
    state.player.cities.push(...villages);
    migratePlayer(state);
    if (namespace.developmentEconomy) namespace.developmentEconomy.reconcileAll(state);
    if (namespace.workforce) namespace.workforce.recalculateAll(state);
    if (namespace.administration) {
      namespace.administration.reconcile(state);
      namespace.administration.applyCollectionModifiers(state);
    }
    setup.status = 'complete';
    setup.stage = 'complete';
    setup.confirmedEntries = setup.entries.map((entry) => ({ ...entry }));
    return { ok: true, capital, villages, setup, totalLocalDemand };
  }

  namespace.settlementFoundation = Object.freeze({
    SCHEMA_VERSION,
    CONTROL_ZONE_RADIUS,
    STARTING_VILLAGE_COUNT,
    STARTING_CAPITAL_POPULATION,
    STARTING_CAPITAL_WORKFORCE,
    STARTING_CAPITAL_HOUSING,
    STARTING_VILLAGE_POPULATION,
    STARTING_VILLAGE_WORKFORCE,
    STARTING_VILLAGE_HOUSING,
    normalizedTier,
    identityFor,
    normalizeCity,
    normalizeOutpost,
    migratePlayer,
    migrateState,
    startingVillageSetup,
    startingVillageSetupInProgress,
    beginStartingVillageSetup,
    provinceEligibility,
    startingVillageSpecialtyCards,
    chooseStartingVillageProvince,
    chooseStartingVillageSpecialty,
    editStartingVillageChoice,
    backStartingVillageSetup,
    confirmStartingVillages
  });
})(window.EcoRuler = window.EcoRuler || {});
