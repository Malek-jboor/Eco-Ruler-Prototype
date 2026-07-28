(function initializeWorkforce(namespace) {
  const DAYS_PER_YEAR = 120;

  function cityForRegion(state, regionId) {
    return (state.player.cities || []).find((city) => (
      city.regionId === regionId
      || (Array.isArray(city.controlledRegionIds) && city.controlledRegionIds.includes(regionId))
    )) || null;
  }

  function outpostForRegion(state, regionId) {
    return (state.player.outposts || []).find((outpost) => outpost.regionId === regionId) || null;
  }

  function requiredWorkers(site) {
    const economy = namespace.economyData.rawSiteEconomy[site.resourceId];
    return economy && Number.isFinite(economy.workersPerLevel)
      ? economy.workersPerLevel * site.level
      : 0;
  }

  function citySites(state, city) {
    const controlled = new Set(city.controlledRegionIds || []);
    if (city.regionId) controlled.add(city.regionId);
    return state.map.regions
      .filter((region) => controlled.has(region.id))
      .flatMap((region) => (region.resourceSites || []).map((site) => ({ region, site })))
      .sort((first, second) => (
        first.site.createdOrder - second.site.createdOrder
        || first.site.id.localeCompare(second.site.id)
      ));
  }

  function outpostSites(state, outpost) {
    const region = namespace.resourceSites.regionById(state, outpost.regionId);
    return region
      ? (region.resourceSites || []).map((site) => ({ region, site })).sort((first, second) => (
        first.site.createdOrder - second.site.createdOrder
        || first.site.id.localeCompare(second.site.id)
      ))
      : [];
  }

  function allocateSites(entries, total) {
    let remaining = Math.max(0, Number(total) || 0);
    entries.forEach(({ site }) => {
      const required = requiredWorkers(site);
      const cap = Math.min(required, Math.max(0, Number(site.workerCap) || 0));
      site.actualWorkers = Math.min(cap, remaining);
      remaining -= site.actualWorkers;
      site.status = namespace.developmentEconomy && namespace.developmentEconomy.activeLevels(site) <= 0
        ? 'Capacity Disabled'
        : (site.actualWorkers <= 0
          ? 'Unstaffed'
          : (site.actualWorkers < required ? 'Understaffed' : 'Active'));
    });
    return remaining;
  }

  function cityProcessingBuildings(city) {
    if (!namespace.manufacturing) return [];
    namespace.manufacturing.ensureCityState(city);
    return city.processingBuildings.slice().sort((first, second) => (
      first.createdOrder - second.createdOrder
      || first.id.localeCompare(second.id)
    ));
  }

  function allocateProcessingBuildings(state, city, total) {
    let remaining = Math.max(0, Number(total) || 0);
    cityProcessingBuildings(city).forEach((building) => {
      const required = namespace.manufacturing.requiredWorkers(state, building);
      const cap = Math.min(required, Math.max(0, Number(building.workerCap) || 0));
      building.actualWorkers = Math.min(cap, remaining);
      remaining -= building.actualWorkers;
      building.status = namespace.developmentEconomy && namespace.developmentEconomy.activeLevels(building) <= 0
        ? 'Capacity Disabled'
        : (building.actualWorkers <= 0
          ? 'Unstaffed'
          : (building.actualWorkers < required ? 'Understaffed' : 'Active'));
    });
    return remaining;
  }

  function recalculateCity(state, city) {
    if (namespace.workforcePriority) return namespace.workforcePriority.allocateCity(state, city);
    const total = Math.max(0, Number(city.workforceTotal) || 0);
    const afterSites = allocateSites(citySites(state, city), total);
    const remaining = allocateProcessingBuildings(state, city, afterSites);
    city.workforceAssigned = total - remaining;
    city.workforceAvailable = remaining;
    return city;
  }

  function recalculateOutpost(state, outpost) {
    if (namespace.workforcePriority) return namespace.workforcePriority.allocateOutpost(state, outpost);
    const total = Math.max(0, Number(outpost.workforceTotal) || 0);
    const remaining = allocateSites(outpostSites(state, outpost), total);
    outpost.workforceAssigned = total - remaining;
    outpost.workforceAvailable = remaining;
    return outpost;
  }

  function recalculateAll(state) {
    (state.player.cities || []).forEach((city) => recalculateCity(state, city));
    (state.player.outposts || []).forEach((outpost) => recalculateOutpost(state, outpost));

    const managed = new Set();
    (state.player.cities || []).forEach((city) => {
      (city.controlledRegionIds || []).forEach((regionId) => managed.add(regionId));
      if (city.regionId) managed.add(city.regionId);
    });
    (state.player.outposts || []).forEach((outpost) => managed.add(outpost.regionId));

    state.map.regions
      .filter((region) => !managed.has(region.id))
      .forEach((region) => (region.resourceSites || []).forEach((site) => {
        site.actualWorkers = 0;
        site.status = 'Unstaffed';
      }));
  }

  function originCity(state, outpost) {
    return (state.player.cities || []).find((city) => city.id === outpost.originCityId)
      || [...(state.player.cities || [])].sort((a, b) => (
        Number(b.workforceAvailable || 0) - Number(a.workforceAvailable || 0)
      ))[0]
      || null;
  }

  function transferOutpostWorkers(state, outpost, requested) {
    recalculateAll(state);
    const city = originCity(state, outpost);
    if (!city) return { requested, transferred: 0, reason: 'No origin city is available.' };
    const available = Math.max(0, Number(city.workforceAvailable) || 0);
    const transferred = Math.min(Math.max(0, Math.floor(Number(requested) || 0)), available);
    if (transferred <= 0) {
      return { requested, transferred: 0, reason: 'The origin city has no available workforce.' };
    }

    city.workforceTotal = Math.max(0, Number(city.workforceTotal) - transferred);
    city.population = Math.max(0, Number(city.population) - transferred);
    city.commoners = Math.max(0, Number(city.commoners || 0) - transferred);
    outpost.originCityId = city.id;
    outpost.workforceTotal = Math.max(0, Number(outpost.workforceTotal) || 0) + transferred;
    outpost.population = Math.max(0, Number(outpost.population) || 0) + transferred;
    recalculateAll(state);
    return { requested, transferred, cityId: city.id };
  }

  function annexOutpost(state, outpostId, cityId) {
    const outpost = (state.player.outposts || []).find((item) => item.id === outpostId);
    const city = (state.player.cities || []).find((item) => item.id === cityId);
    if (!outpost || !city) {
      return { ok: false, reason: 'Outpost or destination city was not found.' };
    }
    if (!city.controlledRegionIds.includes(outpost.regionId)) {
      city.controlledRegionIds.push(outpost.regionId);
    }
    city.population += Math.max(0, Number(outpost.population) || 0);
    city.workforceTotal += Math.max(0, Number(outpost.workforceTotal) || 0);
    state.player.outposts = state.player.outposts.filter((item) => item !== outpost);
    recalculateAll(state);
    return { ok: true, city, outpost, appliesControllerChangeNextTick: true };
  }

  function requestWorkerCap(state, regionId, resourceId, requestedCap) {
    const region = namespace.resourceSites.regionById(state, regionId);
    const site = region ? namespace.resourceSites.siteByResource(region, resourceId) : null;
    if (!site) return { ok: false, reason: 'Resource Site was not found.' };
    const maximum = requiredWorkers(site);
    const cap = Math.max(0, Math.min(maximum, Math.floor(Number(requestedCap) || 0)));
    site.pendingWorkerCap = cap;
    return { ok: true, site, cap };
  }

  function applyPendingWorkerCaps(state) {
    state.map.regions.forEach((region) => (region.resourceSites || []).forEach((site) => {
      if (!Number.isFinite(site.pendingWorkerCap)) return;
      site.workerCap = site.pendingWorkerCap;
      site.pendingWorkerCap = null;
    }));
  }

  function multiplierOrDefault(value, fallback = 1) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function outputPreview(region, site) {
    const economy = namespace.economyData.rawSiteEconomy[site.resourceId];
    if (!economy) return null;
    const candidate = namespace.resourceSites.eligibleCandidate(region, site.resourceId);
    const required = requiredWorkers(site);
    const staffingRatio = required > 0 ? Math.min(1, site.actualWorkers / required) : 0;
    const environmentalEfficiency = candidate ? candidate.finalEfficiency : 0;
    const effectiveLevels = namespace.developmentEconomy
      ? namespace.developmentEconomy.activeLevels(site)
      : site.level;
    const factors = {
      staffing: staffingRatio,
      environment: environmentalEfficiency,
      tools: multiplierOrDefault(site.toolMultiplier),
      technology: multiplierOrDefault(site.technologyMultiplier),
      maintenance: multiplierOrDefault(site.maintenanceMultiplier),
      controller: multiplierOrDefault(site.controllerModifier)
    };
    const multiplier = Object.values(factors).reduce((product, factor) => product * factor, 1);
    return {
      requiredWorkers: required,
      staffingRatio,
      environmentalEfficiency,
      factors,
      productionTiming: economy.productionTiming,
      harvestSeason: economy.harvestSeason,
      outputs: economy.outputs.map((item) => {
        const annualAmount = item.annualAmount * effectiveLevels * multiplier;
        return {
          ...item,
          annualAmount,
          dailyAmount: annualAmount / DAYS_PER_YEAR,
          harvestAmount: economy.productionTiming === 'seasonal' ? annualAmount : null
        };
      })
    };
  }

  namespace.workforce = Object.freeze({
    DAYS_PER_YEAR,
    cityForRegion,
    outpostForRegion,
    requiredWorkers,
    citySites,
    outpostSites,
    cityProcessingBuildings,
    allocateProcessingBuildings,
    recalculateCity,
    recalculateOutpost,
    recalculateAll,
    transferOutpostWorkers,
    annexOutpost,
    requestWorkerCap,
    applyPendingWorkerCaps,
    outputPreview
  });
})(window.EcoRuler = window.EcoRuler || {});
