(function initializeResourceSites(namespace) {
  function ensureRegionState(region) {
    region.resourceSites = Array.isArray(region.resourceSites) ? region.resourceSites : [];
    region.construction = region.construction || namespace.models.createProvinceConstruction();
    region.resourceCapacityUsed = Number(region.resourceCapacityUsed) || 0;
    region.waterCapacityUsed = Number(region.waterCapacityUsed) || 0;
    return region;
  }

  function regionById(state, regionId) {
    return state.map.regions.find((region) => region.id === regionId) || null;
  }

  function siteByResource(region, resourceId) {
    ensureRegionState(region);
    return region.resourceSites.find((site) => site.resourceId === resourceId) || null;
  }

  function eligibleCandidate(region, resourceId) {
    return (region.resourceCandidates || []).find((candidate) => (
      candidate.resourceId === resourceId && candidate.available
    )) || null;
  }

  function pendingProjects(region, resourceId) {
    ensureRegionState(region);
    return region.construction.projects.filter((project) => (
      project.kind === 'resource-site-level'
      && project.resourceId === resourceId
      && ['active', 'waiting', 'paused'].includes(project.status)
    ));
  }

  function projectedLevel(region, resourceId) {
    const site = siteByResource(region, resourceId);
    return (site ? site.level : 0) + pendingProjects(region, resourceId).length;
  }

  function outpostForRegion(state, regionId) {
    return (state.player.outposts || []).find((outpost) => outpost.regionId === regionId) || null;
  }

  function outpostSpecialization(state, region) {
    if (!region || !outpostForRegion(state, region.id)) return null;
    const completed = region.resourceSites.find((site) => site.level > 0);
    if (completed) return completed.resourceId;
    const pending = region.construction.projects.find((project) => (
      project.kind === 'resource-site-level'
      && ['active', 'waiting', 'paused'].includes(project.status)
    ));
    return pending ? pending.resourceId : null;
  }

  function materialShortages(ledger, materials) {
    return Object.entries(materials || {}).reduce((shortages, [resourceId, amount]) => {
      const missing = Math.max(0, amount - Number(ledger.available[resourceId] || 0));
      if (missing > 0) shortages[resourceId] = Math.round(missing * 10000) / 10000;
      return shortages;
    }, {});
  }

  function constructionModifiersFor(state, region) {
    const provinceValue = Number(region && region.constructionTimeModifier);
    const technologyValue = Number(state && state.player && state.player.modifiers && state.player.modifiers.constructionTime);
    return {
      provinceModifier: Number.isFinite(provinceValue) && provinceValue > 0 ? provinceValue : 1,
      technologyModifier: Number.isFinite(technologyValue) && technologyValue > 0 ? technologyValue : 1
    };
  }

  function buildAvailability(state, region, resourceId) {
    if (!state.player.gameStarted) return { allowed: false, reason: 'Start the game first.' };
    if (namespace.developmentEconomy) namespace.developmentEconomy.reconcileAll(state);
    if (!region || region.isWater) return { allowed: false, reason: 'Resource Sites require a land province.' };
    if (region.ownerId !== 'player' && region.controllerId !== 'player') {
      return { allowed: false, reason: 'The province is not controlled by Player Realm.' };
    }

    const candidate = eligibleCandidate(region, resourceId);
    if (!candidate) return { allowed: false, reason: 'This resource is not eligible in the province.' };
    const economy = namespace.economyData.rawSiteEconomy[resourceId];
    if (!economy || !economy.buildable) {
      return { allowed: false, reason: 'Construction or production balance is deferred for this Resource Site.' };
    }

    const targetLevel = projectedLevel(region, resourceId) + 1;
    if (targetLevel > candidate.naturalPotential) {
      return { allowed: false, reason: `Natural Potential is limited to Level ${candidate.naturalPotential}.` };
    }

    const outpost = outpostForRegion(state, region.id);
    if (outpost) {
      const otherSite = region.resourceSites.find((site) => site.resourceId !== resourceId && site.level > 0);
      const otherProject = region.construction.projects.find((project) => (
        project.kind === 'resource-site-level' && project.resourceId !== resourceId
      ));
      if (otherSite || otherProject) {
        return { allowed: false, reason: 'An Outpost may operate one raw resource type only.' };
      }
    }

    const capacityType = candidate.capacityType || 'land';
    if (capacityType === 'water') {
      if (region.waterCapacityUsed + candidate.capacityPerLevel > region.waterCapacity) {
        return { allowed: false, reason: 'Not enough Water Capacity.' };
      }
    } else {
      const capacity = namespace.developmentEconomy
        ? namespace.developmentEconomy.canReserveResource(state, region, resourceId, candidate.capacityPerLevel)
        : null;
      if (capacity && !capacity.allowed) return { ...capacity, candidate, economy };
      if (!capacity && region.resourceCapacityUsed + candidate.capacityPerLevel > region.resourceCapacity) {
        return { allowed: false, reason: 'Not enough Resource Capacity.' };
      }
    }

    const modifiers = constructionModifiersFor(state, region);
    if (outpost) {
      modifiers.materialModifier = 1.25;
      modifiers.durationModifier = 1.2;
    }
    const preview = namespace.economyData.constructionPreview(resourceId, targetLevel - 1, modifiers);
    const shortages = materialShortages(state.storage, preview.materials);
    if (Object.keys(shortages).length) {
      return { allowed: false, reason: 'The central stockpile lacks required construction materials.', preview, shortages };
    }
    return { allowed: true, reason: 'Ready to enter the province construction queue.', preview, candidate, economy };
  }

  function queueLevel(state, regionId, resourceId) {
    const region = regionById(state, regionId);
    const availability = buildAvailability(state, region, resourceId);
    if (!availability.allowed) return availability;

    const siteDefinition = namespace.resources.resourceSiteByResourceId[resourceId];
    const project = {
      kind: 'resource-site-level',
      resourceId,
      buildingId: siteDefinition ? siteDefinition.id : `${resourceId}-site`,
      label: siteDefinition ? siteDefinition.label : `${resourceId} Site`,
      targetLevel: availability.preview.targetLevel,
      durationDays: availability.preview.days,
      materials: availability.preview.materials,
      cashPercent: availability.preview.cashPercent,
      cashAmount: null,
      capacityReservation: {
        type: availability.candidate.capacityType,
        points: availability.candidate.capacityPerLevel
      },
      modifiers: {
        province: availability.preview.provinceModifier,
        technology: availability.preview.technologyModifier
      }
    };
    return namespace.constructionQueue.queueProject(state, region, project);
  }

  function completeProject(state, region, project) {
    ensureRegionState(region);
    const economy = namespace.economyData.rawSiteEconomy[project.resourceId];
    const definition = namespace.resources.resourceSiteByResourceId[project.resourceId];
    let site = siteByResource(region, project.resourceId);
    if (!site) {
      state.nextResourceSiteOrder = (Number(state.nextResourceSiteOrder) || 0) + 1;
      site = namespace.models.createResourceSite({
        id: `${region.id}-${project.resourceId}-site`,
        resourceId: project.resourceId,
        buildingId: definition ? definition.id : project.buildingId,
        level: 0,
        createdOrder: state.nextResourceSiteOrder
      });
      region.resourceSites.push(site);
    }

    const previousLevel = site.level;
    const previousRequired = economy.workersPerLevel * previousLevel;
    const displayedCap = Number.isFinite(site.pendingWorkerCap)
      ? site.pendingWorkerCap
      : site.workerCap;
    const workerLimitRatio = previousRequired > 0
      ? Math.max(0, Math.min(1, displayedCap / previousRequired))
      : 1;

    site.level += 1;
    namespace.developmentEconomy.ensureState(state);
    namespace.developmentEconomy.reconcileAll(state);
    site.workerCap = Math.round(economy.workersPerLevel * site.level * workerLimitRatio);
    site.pendingWorkerCap = null;
    site.status = 'Unstaffed';

    const outpost = outpostForRegion(state, region.id);
    if (outpost) {
      site.controllerModifier = 0.75;
      outpost.housingCapacity = economy.workersPerLevel * site.level;
      if (namespace.workforce && typeof namespace.workforce.transferOutpostWorkers === 'function') {
        namespace.workforce.transferOutpostWorkers(state, outpost, economy.workersPerLevel);
      }
    }
    return site;
  }

  function reducePreview(state, region, resourceId) {
    if (!region) return { allowed: false, reason: 'Province was not found.' };
    const projects = pendingProjects(region, resourceId);
    const waiting = projects.filter((project) => project.status === 'waiting');
    const project = waiting.length
      ? waiting[waiting.length - 1]
      : projects.find((item) => item.status === 'active' || item.status === 'paused');
    const candidate = eligibleCandidate(region, resourceId);
    const economy = namespace.economyData.rawSiteEconomy[resourceId];

    if (project) {
      return {
        allowed: true,
        action: project.status === 'waiting' ? 'cancel-waiting' : 'cancel-active',
        project,
        targetLevel: Math.max(0, Number(project.targetLevel || 1) - 1),
        capacityReleased: project.capacityReservation ? project.capacityReservation.points : 0,
        workersReleased: 0,
        refund: 0,
        reason: 'Cancels the newest expansion for this site. No materials or cash are refunded.'
      };
    }

    const site = siteByResource(region, resourceId);
    if (!site || site.level <= 0) {
      return { allowed: false, reason: 'The site is already at Level 0.', refund: 0 };
    }
    return {
      allowed: true,
      action: 'reduce-completed',
      site,
      targetLevel: site.level - 1,
      capacityReleased: candidate ? candidate.capacityPerLevel : 0,
      workersReleased: economy ? economy.workersPerLevel : 0,
      refund: 0,
      reason: 'Reduces one completed level immediately. No materials or cash are refunded.'
    };
  }

  function reduceLevel(state, regionId, resourceId) {
    const region = regionById(state, regionId);
    const preview = reducePreview(state, region, resourceId);
    if (!preview.allowed) return preview;

    if (preview.project) {
      const result = namespace.constructionQueue.discardProject(
        state,
        region,
        preview.project.id,
        preview.action
      );
      if (namespace.workforce) namespace.workforce.recalculateAll(state);
      return { ...preview, ...result };
    }

    const site = preview.site;
    const candidate = eligibleCandidate(region, resourceId);
    if (candidate) {
      const key = candidate.capacityType === 'water'
        ? 'waterCapacityUsed'
        : 'resourceCapacityUsed';
      region[key] = Math.max(0, Number(region[key] || 0) - candidate.capacityPerLevel);
    }
    site.level -= 1;
    if (Array.isArray(site.levelOrders)) site.levelOrders.pop();
    site.pendingRemoval = false;
    const economy = namespace.economyData.rawSiteEconomy[resourceId];
    const newMaximum = economy ? economy.workersPerLevel * site.level : 0;
    site.workerCap = Math.min(site.workerCap, newMaximum);
    site.pendingWorkerCap = null;

    const outpost = outpostForRegion(state, region.id);
    if (outpost && economy) outpost.housingCapacity = economy.workersPerLevel * site.level;
    if (site.level <= 0) {
      region.resourceSites = region.resourceSites.filter((item) => item !== site);
    }
    if (namespace.developmentEconomy) namespace.developmentEconomy.reconcileAll(state);
    if (namespace.workforce) namespace.workforce.recalculateAll(state);
    return { ok: true, ...preview, site };
  }

  function requestRemoveLevel(state, regionId, resourceId) {
    return reduceLevel(state, regionId, resourceId);
  }

  function applyPendingRemovals(state) {
    state.map.regions.forEach((region) => {
      ensureRegionState(region);
      region.resourceSites.slice().forEach((site) => {
        if (!site.pendingRemoval) return;
        const candidate = eligibleCandidate(region, site.resourceId);
        if (candidate) {
          if (candidate.capacityType === 'water') {
            region.waterCapacityUsed = Math.max(0, region.waterCapacityUsed - candidate.capacityPerLevel);
          } else {
            region.resourceCapacityUsed = Math.max(0, region.resourceCapacityUsed - candidate.capacityPerLevel);
          }
        }
        site.level -= 1;
        if (Array.isArray(site.levelOrders)) site.levelOrders.pop();
        site.pendingRemoval = false;
        const economy = namespace.economyData.rawSiteEconomy[site.resourceId];
        site.workerCap = economy && economy.workersPerLevel ? Math.min(site.workerCap, economy.workersPerLevel * site.level) : 0;
        if (site.level <= 0) {
          region.resourceSites = region.resourceSites.filter((item) => item !== site);
        }
      });
    });
  }

  function refreshControllerModifiers(state) {
    state.map.regions.forEach((region) => {
      const outpost = outpostForRegion(state, region.id);
      (region.resourceSites || []).forEach((site) => {
        site.controllerModifier = outpost ? 0.75 : 1;
      });
    });
    if (namespace.administration) namespace.administration.applyCollectionModifiers(state);
  }

  namespace.resourceSites = Object.freeze({
    ensureRegionState,
    regionById,
    siteByResource,
    eligibleCandidate,
    pendingProjects,
    projectedLevel,
    outpostSpecialization,
    materialShortages,
    constructionModifiersFor,
    buildAvailability,
    queueLevel,
    completeProject,
    reducePreview,
    reduceLevel,
    requestRemoveLevel,
    applyPendingRemovals,
    refreshControllerModifiers
  });
})(window.EcoRuler = window.EcoRuler || {});
