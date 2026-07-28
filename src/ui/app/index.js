(function initializeApp(namespace) {
  const {
    escapeHtml,
    escapeAttribute,
    terrainById,
    worldProfileById,
    worldShapeById,
    mapSizeById
  } = namespace.uiCore;
  const {
    resetMapViewport,
    visibleMapViewBox,
    formatViewBox,
    closeSelectedProvince,
    bindMapViewControls,
    ensureUiState,
    setProvincePopoverAnchor,
    positionProvincePopover,
    lockProvincePopoverPosition,
    startProvincePopoverDrag,
    moveProvincePopoverDrag,
    finishProvincePopoverDrag,
    startProvincePopoverResize,
    moveProvincePopoverResize,
    finishProvincePopoverResize,
    toggleProvincePopoverMaximize,
    regionById
  } = namespace.uiViewport;
  const {
    ensurePlayerState,
    isRegionRevealed,
    startGame,
    buildOutpostButton,
    startGameButton,
    buildOutpost
  } = namespace.uiRealm;
  const {
    addLog,
    tooltipAttributes,
    terrainLegend,
    categoryRows,
    resourceCatalog,
    optionsFor,
    terrainSummaryRows,
    traitSummaryTooltipBody,
    modelSummaryTooltipBody,
    selectedRegionPopover
  } = namespace.uiProvince;
  const { warningList, logRows, polygonPoints, riverLines, regionPolygons } = namespace.uiMapRender;
  const { hideTooltip, bindTooltips, tooltipSnapshot, restoreTooltip } = namespace.uiTooltips;
  const { storagePanel } = namespace.uiStorage;

  function readWorldProfile(root) {
    const input = root.querySelector('[data-world-profile]');
    return namespace.mapGenerator.normalizeWorldProfile(input ? input.value : namespace.data.mapDefaults.worldProfile);
  }

  function readWorldShape(root) {
    const input = root.querySelector('[data-world-shape]');
    return namespace.mapGenerator.normalizeWorldShape(input ? input.value : namespace.data.mapDefaults.worldShape);
  }

  function readMapSize(root) {
    const input = root.querySelector('[data-map-size]');
    return namespace.mapGenerator.normalizeMapSize(input ? input.value : namespace.data.mapDefaults.mapSize);
  }

  function readClusterStrength(root) {
    const input = root.querySelector('[data-cluster-strength]');
    return namespace.mapGenerator.normalizeClusterStrength(input ? input.value : namespace.data.mapDefaults.clusterStrength);
  }

  function readSeed(root) {
    const input = root.querySelector('[data-map-seed]');
    return input && input.value.trim()
      ? input.value.trim()
      : namespace.data.mapDefaults.seed;
  }

  function readStartSeed(root) {
    const input = root.querySelector('[data-start-seed]');
    return input && input.value.trim()
      ? input.value.trim()
      : namespace.data.mapDefaults.startSeed;
  }

  function fullGameSeed(state) {
    return `${state.map.seed}::${state.startSeed}`;
  }

  function resetProvinceUi(state) {
    const stateUi = ensureUiState(state);
    delete stateUi.resourceBuildMenu;
    delete stateUi.resourceSiteDetail;
    delete stateUi.processingBuildingDetail;
    stateUi.provincePopoverMaximized = false;
  }

  function showToast(root, state, message, type = 'success') {
    const stateUi = ensureUiState(state);
    stateUi.toasts = Array.isArray(stateUi.toasts) ? stateUi.toasts : [];
    const toast = {
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      message,
      type
    };
    stateUi.toasts = [...stateUi.toasts.slice(-2), toast];
    window.setTimeout(() => {
      const currentUi = ensureUiState(state);
      currentUi.toasts = (currentUi.toasts || []).filter(
        (item) => item.id !== toast.id
      );
      if (namespace.currentState === state) render(root, state);
    }, 2600);
  }

  function notify(root, state, message, type = 'success') {
    addLog(state, message);
    showToast(root, state, message, type);
  }

  function buildingSearchTokens(value) {
    return String(value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function applyConstructionBuildFilter(root, state) {
    const panel = root.querySelector('[data-construction-build]');
    if (!panel) return;
    const ui = ensureUiState(state);
    const query = String(ui.constructionBuildSearch || '');
    const tokens = buildingSearchTokens(query);
    const expanded = ui.constructionBuildCategories || {};
    let visibleTotal = 0;

    panel.querySelectorAll('[data-build-category]').forEach((category) => {
      const categoryId = category.dataset.buildCategory;
      const categoryText = String(category.dataset.buildCategoryName || '').toLowerCase();
      const cards = Array.from(category.querySelectorAll('[data-search-text]'));
      let visibleCount = 0;
      cards.forEach((card) => {
        const text = (String(card.dataset.searchText || '') + ' ' + categoryText).toLowerCase();
        const matches = tokens.every((token) => text.includes(token));
        card.hidden = !matches;
        if (matches) visibleCount += 1;
      });
      visibleTotal += visibleCount;
      category.hidden = tokens.length > 0 && visibleCount === 0;
      if (tokens.length > 0 && visibleCount > 0) {
        category.open = true;
      } else if (tokens.length === 0) {
        category.open = Object.prototype.hasOwnProperty.call(expanded, categoryId)
          ? Boolean(expanded[categoryId])
          : ['resource-sites', 'production'].includes(categoryId);
      }
      const count = category.querySelector('[data-build-count]');
      if (count) count.textContent = String(tokens.length > 0 ? visibleCount : Number(count.dataset.totalCount) || 0);
    });

    const noResults = panel.querySelector('[data-build-no-results]');
    if (noResults) noResults.hidden = tokens.length === 0 || visibleTotal > 0;
    const clearButton = panel.querySelector('[data-action="clear-building-search"]');
    if (clearButton) clearButton.hidden = query.length === 0;
  }

  function generateMap(root, state, options = {}) {
    const seed = options.randomMapSeed
      ? `map-${Date.now().toString(36)}`
      : readSeed(root);
    const startSeed = options.randomStartSeed
      ? `start-${Date.now().toString(36)}`
      : readStartSeed(root);
    const worldProfile = readWorldProfile(root);
    const worldShape = readWorldShape(root);
    const mapSize = readMapSize(root);
    const clusterStrength = readClusterStrength(root);

    state.map = namespace.mapGenerator.generateRegionMap({
      mapSize,
      worldShape,
      seed,
      worldProfile,
      clusterStrength
    });
    state.startSeed = startSeed;
    const player = ensurePlayerState(state);
    player.gameStarted = false;
    player.cities = [];
    player.outposts = [];
    player.armies = [];
    player.startingVillageSetup = null;
    player.research = { completed: [] };
    state.storage = namespace.storageLedger.createLedger();
    state.nextResourceSiteOrder = 0;
    state.nextProcessingBuildingOrder = 0;
    state.nextAdministrativeBuildingOrder = 0;
    state.administration = {
      founderCountryRetired: false, founderLocalRetired: false, countryRequests: {},
      producedCountry: 0, producedLocalByCenter: {}, alertIds: {},
      countryReservations: {}, localReservations: {}
    };
    state.expansion = { nextOrderNumber: 1, settlerOrders: [] };
    namespace.timeEngine.resetClock(state);
    state.economy = {
      settlementFood: {},
      clothesCoverage: null,
      shortageEpisode: null,
      harvestHistory: [],
      productionHistory: []
    };
    state.alerts = [];
    state.nextAlertNumber = 1;
    state.map.selectedRegionId = null;
    resetProvinceUi(state);
    resetMapViewport(state);
    const stateUi = ensureUiState(state);
    stateUi.worldGenerated = true;
    stateUi.activeMainPanel = null;
    const profile = worldProfileById(worldProfile);
    const shape = worldShapeById(worldShape);
    addLog(
      state,
      `Generated hidden world: ${shape.label}, ${profile.label}, ${state.map.summary.totalRegions} provinces.`
    );

    if (options.startAfter) {
      startGame(root, state);
      return;
    }
    render(root, state);
  }

  function selectRegion(root, state, regionId, event = null, sourceElement = null) {
    const region = regionById(state, regionId);
    if (region && !isRegionRevealed(state, region)) {
      state.map.selectedRegionId = null;
      resetProvinceUi(state);
      addLog(state, 'Unknown province. Remove fog of war before inspecting this province.');
      render(root, state);
      return;
    }
    state.map.selectedRegionId = regionId;
    const ui = ensureUiState(state);
    ui.provincePopoverTab = region && (namespace.uiRealm.cityForRegion(state, region.id) || namespace.uiRealm.outpostForRegion(state, region.id)) ? 'overview' : 'info';
    delete ui.resourceBuildMenu;
    delete ui.resourceSiteDetail;
    delete ui.processingBuildingDetail;
    setProvincePopoverAnchor(root, state, event, sourceElement);
    if (region) {
      const terrain = terrainById(region.terrainId);
      const available = (region.resourceCandidates || []).filter((candidate) => candidate.available).length;
      addLog(state, `Selected ${region.name}: ${terrain.label}, ${region.traits.length} natural traits, ${available} resources, ${region.neighbors.length} neighbors.`);
    }
    render(root, state);
  }

  function setProvincePopoverTab(root, state, tab) {
    lockProvincePopoverPosition(root, state);
    const ui = ensureUiState(state);
    ui.provincePopoverTab = ['info', 'resources', 'overview', 'buildings', 'population', 'administration', 'development'].includes(tab) ? tab : 'info';
    delete ui.resourceBuildMenu;
    delete ui.resourceSiteDetail;
    delete ui.processingBuildingDetail;
    hideTooltip(true);
    render(root, state);
  }


  function queueResourceSite(root, state, regionId, resourceId) {
    lockProvincePopoverPosition(root, state);
    const result = namespace.resourceSites.queueLevel(
      state,
      regionId,
      resourceId
    );
    const region = regionById(state, regionId);
    if (!result.ok) {
      notify(
        root,
        state,
        result.reason || 'Resource Site could not be queued.',
        'error'
      );
      render(root, state);
      return;
    }
    const definition = namespace.uiCore.siteForResource(resourceId);
    const stateUi = ensureUiState(state);
    stateUi.provincePopoverTab = 'resources';
    delete stateUi.resourceBuildMenu;
    delete stateUi.resourceSiteDetail;
    notify(
      root,
      state,
      `${definition.label} Level ${result.project.targetLevel} queued in ${region.name}.`
    );
    render(root, state);
  }

  function openResourceSite(root, state, regionId, resourceId) {
    lockProvincePopoverPosition(root, state);
    const ui = ensureUiState(state);
    ui.provincePopoverTab = 'resources';
    ui.resourceSiteDetail = { regionId, resourceId };
    delete ui.resourceBuildMenu;
    render(root, state);
  }

  function backToResources(root, state) {
    lockProvincePopoverPosition(root, state);
    delete ensureUiState(state).resourceSiteDetail;
    render(root, state);
  }

  function setWorkerCap(root, state, regionId, resourceId, value) {
    lockProvincePopoverPosition(root, state);
    const result = namespace.workforce.requestWorkerCap(state, regionId, resourceId, value);
    if (result.ok) addLog(state, `Worker limit set to ${result.cap}; it applies on the next daily tick.`);
    else addLog(state, result.reason);
    render(root, state);
  }

  function removeResourceLevel(root, state, regionId, resourceId) {
    lockProvincePopoverPosition(root, state);
    const region = regionById(state, regionId);
    const preview = namespace.resourceSites.reducePreview(state, region, resourceId);
    if (!preview.allowed) {
      notify(root, state, preview.reason || 'Resource Site cannot be reduced.', 'error');
      render(root, state);
      return;
    }
    const confirmed = window.confirm(
      'Reduce this Resource Site by one step? The newest expansion is removed first and no materials or cash are refunded.'
    );
    if (!confirmed) return;
    const result = namespace.resourceSites.reduceLevel(state, regionId, resourceId);
    notify(
      root,
      state,
      result.ok ? 'Resource Site reduced with no refund.' : (result.reason || 'Reduction failed.'),
      result.ok ? 'success' : 'error'
    );
    render(root, state);
  }

  function queueProcessingBuilding(root, state, regionId, buildingId) {
    lockProvincePopoverPosition(root, state);
    const result = namespace.manufacturing.queueLevel(state, regionId, buildingId);
    const definition = namespace.manufacturing.definitionById(buildingId);
    const region = regionById(state, regionId);
    notify(
      root,
      state,
      result.ok
        ? definition.label + ' Level ' + result.project.targetLevel + ' queued in ' + region.name + '.'
        : (result.reason || 'Processing Building could not be queued.'),
      result.ok ? 'success' : 'error'
    );
    render(root, state);
  }

  function openProcessingBuilding(root, state, regionId, cityId, buildingId) {
    lockProvincePopoverPosition(root, state);
    const ui = ensureUiState(state);
    ui.provincePopoverTab = 'buildings';
    ui.processingBuildingDetail = { regionId, cityId, buildingId };
    delete ui.resourceSiteDetail;
    render(root, state);
  }

  function backToSettlement(root, state) {
    lockProvincePopoverPosition(root, state);
    delete ensureUiState(state).processingBuildingDetail;
    render(root, state);
  }

  function updateManufacturingAllocations(form, source) {
    const recipeId = source.dataset.recipeId;
    const isTemporarilyEmpty = source.matches('[data-allocation-number]') && source.value === '';
    const value = isTemporarilyEmpty
      ? 0
      : Math.max(0, Math.min(100, Math.round((Number(source.value) || 0) * 10) / 10));
    if (!isTemporarilyEmpty) source.value = value.toFixed(1);
    if (isTemporarilyEmpty) {
      source.setAttribute('aria-invalid', 'true');
    } else source.removeAttribute('aria-invalid');
    form.querySelectorAll('[data-recipe-id="' + CSS.escape(recipeId) + '"]').forEach((input) => {
      if (input !== source && !isTemporarilyEmpty) input.value = value.toFixed(1);
    });
    const total = Array.from(form.querySelectorAll('[data-allocation-number]'))
      .reduce((sum, input) => sum + (Number(input.value) || 0), 0);
    const totalLabel = form.querySelector('[data-allocation-total]');
    if (totalLabel) totalLabel.textContent = total.toFixed(1) + '%';
    const balance = form.querySelector('[data-allocation-balance]');
    if (balance) {
      const difference = Math.round(Math.abs(100 - total) * 10) / 10;
      balance.textContent = Math.abs(total - 100) < 0.0001
        ? 'Ready to apply: 100.0%'
        : total < 100
          ? 'Remaining: ' + difference.toFixed(1) + '%'
          : 'Overallocated: ' + difference.toFixed(1) + '%';
      balance.className = total > 100 ? 'allocation-balance overallocated' : 'allocation-balance';
    }
    const apply = form.querySelector('[data-action="apply-manufacturing-settings"]');
    if (apply) apply.disabled = Math.abs(total - 100) > 0.0001;
  }

  function applyManufacturingSettings(root, state, form) {
    const allocations = {};
    form.querySelectorAll('[data-allocation-number]').forEach((input) => {
      allocations[input.dataset.recipeId] = Number(input.value) || 0;
    });
    const allocationResult = namespace.manufacturing.requestAllocations(
      state,
      form.dataset.cityId,
      form.dataset.buildingId,
      allocations
    );
    if (!allocationResult.ok) {
      notify(root, state, allocationResult.reason, 'error');
      render(root, state);
      return;
    }
    const workerInput = form.querySelector('[data-processing-worker-range]');
    const workerResult = namespace.manufacturing.requestWorkerCap(
      state,
      form.dataset.cityId,
      form.dataset.buildingId,
      workerInput ? workerInput.value : 0
    );
    const city = namespace.manufacturing.cityById(state, form.dataset.cityId);
    const building = city ? namespace.manufacturing.buildingById(city, form.dataset.buildingId) : null;
    const settingsResult = namespace.developmentEconomy.requestSettings(building, {
      maintenancePriority: form.querySelector('[data-maintenance-priority]').value,
      toolMode: form.querySelector('[data-tool-mode]').value,
      toolPriority: form.querySelector('[data-tool-priority]').value
    });
    notify(
      root,
      state,
      workerResult.ok && settingsResult.ok
        ? 'Production, maintenance, and tool settings will apply on the next daily tick.'
        : (workerResult.reason || settingsResult.reason),
      workerResult.ok && settingsResult.ok ? 'success' : 'error'
    );
    render(root, state);
  }

  function reduceProcessingBuilding(root, state, cityId, buildingId) {
    lockProvincePopoverPosition(root, state);
    const preview = namespace.manufacturing.reducePreview(state, cityId, buildingId);
    if (!preview.allowed) {
      notify(root, state, preview.reason || 'Processing Building cannot be reduced.', 'error');
      render(root, state);
      return;
    }
    const confirmation = preview.project
      ? 'Cancel the newest expansion? Its full untouched cost or unfinished share will be refunded.'
      : 'Remove one completed level immediately? Completed levels provide no refund.';
    if (!window.confirm(confirmation)) return;
    let result = namespace.manufacturing.reduceLevel(state, cityId, buildingId);
    if (!result.ok && result.reason === 'refund-overflow-confirmation-required') {
      const confirmed = window.confirm(
        'The refund exceeds free storage. Excess refunded materials will be lost. Continue?'
      );
      if (confirmed) {
        result = namespace.manufacturing.reduceLevel(
          state,
          cityId,
          buildingId,
          { confirmOverflow: true }
        );
      }
    }
    if (result.ok && result.targetLevel <= 0) {
      delete ensureUiState(state).processingBuildingDetail;
    }
    notify(
      root,
      state,
      result.ok
        ? (preview.project ? 'Expansion cancelled and its unfinished share refunded.' : 'Completed building level removed with no refund.')
        : (result.reason || 'Reduction failed.'),
      result.ok ? 'success' : 'error'
    );
    render(root, state);
  }

  function queueAdministrativeBuilding(root, state, regionId, buildingId) {
    lockProvincePopoverPosition(root, state);
    const result = namespace.administration.queueLevel(state, regionId, buildingId);
    const definition = namespace.administration.definitionById(buildingId);
    const region = regionById(state, regionId);
    notify(
      root,
      state,
      result.ok
        ? definition.label + ' Level ' + result.project.targetLevel + ' queued in ' + region.name + '.'
        : (result.reason || 'Administrative office could not be queued.'),
      result.ok ? 'success' : 'error'
    );
    if (result.ok) {
      const ui = ensureUiState(state);
      ui.provincePopoverTab = 'buildings';
      const city = namespace.administration.cityById(state, result.project.cityId);
      if (city) {
        ui.settlementDetailTabs = ui.settlementDetailTabs || {};
        ui.settlementDetailTabs[city.id] = 'buildings';
      }
    }
    render(root, state);
  }

  function reduceAdministrativeBuilding(root, state, cityId, buildingId) {
    lockProvincePopoverPosition(root, state);
    const preview = namespace.administration.reducePreview(state, cityId, buildingId);
    if (!preview.allowed) {
      notify(root, state, preview.reason || 'Administrative office cannot be reduced.', 'error');
      render(root, state);
      return;
    }
    const confirmation = preview.project
      ? 'Cancel the newest office expansion? Its full untouched cost or unfinished share will be refunded.'
      : 'Remove one completed office level immediately? Completed levels provide no refund.';
    if (!window.confirm(confirmation)) return;
    let result = namespace.administration.reduceLevel(state, cityId, buildingId);
    if (!result.ok && result.reason === 'refund-overflow-confirmation-required') {
      const confirmed = window.confirm('The refund exceeds free storage. Excess refunded materials will be lost. Continue?');
      if (confirmed) {
        result = namespace.administration.reduceLevel(state, cityId, buildingId, { confirmOverflow: true });
      }
    }
    notify(
      root,
      state,
      result.ok
        ? (preview.project ? 'Office expansion cancelled and its unfinished share refunded.' : 'Completed office level removed with no refund.')
        : (result.reason || 'Office reduction failed.'),
      result.ok ? 'success' : 'error'
    );
    render(root, state);
  }

  function requestAdministrativeWorkerCap(root, state, input) {
    const result = namespace.administration.requestWorkerCap(
      state,
      input.dataset.cityId,
      input.dataset.buildingId,
      input.value
    );
    notify(root, state, result.ok ? 'Administrative worker limit will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
    render(root, state);
  }

  function requestAdministrativeMaintenance(root, state, select) {
    const city = namespace.administration.cityById(state, select.dataset.cityId);
    const building = city ? namespace.administration.officeById(city, select.dataset.buildingId) : null;
    const result = namespace.developmentEconomy.requestSettings(building, { maintenancePriority: select.value });
    notify(root, state, result.ok ? 'Administrative maintenance priority will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
    render(root, state);
  }

  function applyCountryControlRequest(root, state, button) {
    const input = root.querySelector('[data-country-control-input][data-center-id="' + CSS.escape(button.dataset.centerId) + '"]');
    const result = namespace.administration.requestCountryControl(state, button.dataset.centerId, input ? Number(input.value) : 0);
    notify(root, state, result.ok ? 'Country Control request applied.' : result.reason, result.ok ? 'success' : 'error');
    render(root, state);
  }
  function constructionRegion(state, regionId) {
    return regionId
      ? regionById(state, regionId)
      : namespace.uiViewport.selectedRegion(state);
  }

  function toggleConstructionPause(
    root,
    state,
    regionId,
    projectId
  ) {
    lockProvincePopoverPosition(root, state);
    const region = constructionRegion(state, regionId);
    const project = region
      ? namespace.constructionQueue.activeProject(region)
      : null;
    if (!region || !project || project.id !== projectId) return;
    const paused = project.status !== 'paused';
    const result = namespace.constructionQueue.setPaused(
      region,
      projectId,
      paused
    );
    notify(
      root,
      state,
      result.ok
        ? `Construction ${paused ? 'paused' : 'resumed'} in ${region.name}.`
        : result.reason,
      result.ok ? 'success' : 'error'
    );
    render(root, state);
  }

  function moveConstruction(
    root,
    state,
    regionId,
    projectId,
    direction
  ) {
    lockProvincePopoverPosition(root, state);
    const region = constructionRegion(state, regionId);
    if (!region) return;
    const result = namespace.constructionQueue.moveProject(
      region,
      projectId,
      direction
    );
    notify(
      root,
      state,
      result.ok
        ? `Construction priority changed in ${region.name}.`
        : result.reason,
      result.ok ? 'success' : 'error'
    );
    render(root, state);
  }

  function cancelConstruction(root, state, regionId, projectId) {
    lockProvincePopoverPosition(root, state);
    const region = constructionRegion(state, regionId);
    if (!region) return;
    let result = namespace.constructionQueue.cancelProject(
      state,
      region,
      projectId
    );
    if (
      !result.ok
      && result.reason === 'refund-overflow-confirmation-required'
    ) {
      const confirmed = window.confirm(
        `The refund needs ${result.requiredPoints} storage points, but only ${result.freePoints} are free. Excess materials will be lost. Continue?`
      );
      if (confirmed) {
        result = namespace.constructionQueue.cancelProject(
          state,
          region,
          projectId,
          { confirmOverflow: true }
        );
      }
    }
    notify(
      root,
      state,
      result.ok
        ? `Construction cancelled in ${region.name}.`
        : (result.reason || 'Cancellation failed.'),
      result.ok ? 'success' : 'error'
    );
    render(root, state);
  }

  function bindEvents(root, state) {
    if (typeof root.querySelectorAll !== 'function') return;
    const on = (selector, eventName, handler) => {
      root.querySelectorAll(selector).forEach((element) => {
        element.addEventListener(eventName, (event) => handler(event, element));
      });
    };

    on('[data-action="generate-map"]', 'click', () => {
      generateMap(root, state);
    });
    on('[data-action="random-map-seed"]', 'click', () => {
      generateMap(root, state, { randomMapSeed: true });
    });
    on('[data-action="random-start-seed"]', 'click', () => {
      generateMap(root, state, { randomStartSeed: true });
    });
    on('[data-action="start-game"]', 'click', (event) => {
      event.stopPropagation();
      generateMap(root, state, { startAfter: true });
    });
    on('[data-action="select-starting-village-specialty"]', 'click', (event, button) => {
      event.stopPropagation();
      const result = namespace.settlementFoundation.chooseStartingVillageSpecialty(
        state,
        button.dataset.specialtyId
      );
      notify(root, state, result.ok ? 'Starting Village specialty selected.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="edit-starting-village-province"]', 'click', (event, button) => {
      event.stopPropagation();
      const result = namespace.settlementFoundation.editStartingVillageChoice(state, button.dataset.index, 'province');
      if (!result.ok) notify(root, state, result.reason, 'error');
      render(root, state);
    });
    on('[data-action="edit-starting-village-specialty"]', 'click', (event, button) => {
      event.stopPropagation();
      const result = namespace.settlementFoundation.editStartingVillageChoice(state, button.dataset.index, 'specialty');
      if (!result.ok) notify(root, state, result.reason, 'error');
      render(root, state);
    });
    on('[data-action="back-starting-village-setup"]', 'click', (event) => {
      event.stopPropagation();
      const result = namespace.settlementFoundation.backStartingVillageSetup(state);
      if (!result.ok) notify(root, state, result.reason, 'error');
      render(root, state);
    });
    on('[data-action="confirm-starting-villages"]', 'click', (event) => {
      event.stopPropagation();
      const result = namespace.settlementFoundation.confirmStartingVillages(state);
      if (!result.ok) {
        notify(root, state, result.reason, 'error');
        render(root, state);
        return;
      }
      namespace.uiRealm.refreshPlayerVisibility(state);
      state.map.selectedRegionId = result.capital.regionId;
      ensureUiState(state).provincePopoverTab = 'overview';
      notify(root, state, 'Starting setup confirmed. The State Capital and two Villages are ready.', 'success');
      render(root, state);
    });
    on('[data-action="toggle-developer-preview"]', 'click', () => {
      const stateUi = ensureUiState(state);
      stateUi.developerMapPreview = !stateUi.developerMapPreview;
      render(root, state);
    });
    on('[data-action="copy-full-seed"]', 'click', async () => {
      try {
        await navigator.clipboard.writeText(fullGameSeed(state));
        showToast(root, state, 'Full Game Seed copied.');
      } catch (error) {
        showToast(root, state, 'Could not copy the Full Game Seed.', 'error');
      }
      render(root, state);
    });
    on('[data-action="apply-full-seed"]', 'click', () => {
      const input = root.querySelector('[data-full-game-seed]');
      const parts = input ? input.value.split('::') : [];
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        showToast(root, state, 'Full Game Seed format is invalid.', 'error');
        render(root, state);
        return;
      }
      root.querySelector('[data-map-seed]').value = parts[0].trim();
      root.querySelector('[data-start-seed]').value = parts[1].trim();
      generateMap(root, state);
      showToast(root, state, 'Full Game Seed applied and world regenerated.');
      render(root, state);
    });

    on('[data-action="select-outpost-source"]', 'change', (event, select) => {
      const ui = ensureUiState(state);
      ui.outpostFoundingSources = ui.outpostFoundingSources || {};
      ui.outpostFoundingSources[select.dataset.regionId] = select.value;
      render(root, state);
    });
    on('[data-action="build-outpost"]', 'click', (event, button) => {
      event.stopPropagation();
      const region = namespace.uiViewport.selectedRegion(state);
      const availability = namespace.uiRealm.outpostAvailability(state, region, button.dataset.sourceId);
      if (!availability.allowed || !availability.preview) {
        showToast(root, state, availability.reason, 'error');
        render(root, state);
        return;
      }
      const preview = availability.preview;
      const confirmed = window.confirm(
        'Start this Outpost expedition from ' + preview.source.name + '?\\n'
        + '50 settlers | ' + preview.profile.durationDays + ' days | '
        + preview.food.required.total + ' food'
      );
      if (!confirmed) return;
      const result = buildOutpost(root, state, preview.source.id);
      showToast(root, state, result.ok ? 'Outpost founding project started.' : (result.reason || 'Founding failed.'), result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="begin-internal-transfer"]', 'click', (event) => {
      event.stopPropagation();
      delete ensureUiState(state).internalTransferDraft;
      namespace.uiExpansion.beginSelection(state, { type: 'internal-transfer-select-source' });
      render(root, state);
    });
    on('[data-internal-transfer-draft-amount]', 'change', (event, input) => {
      const draft = ensureUiState(state).internalTransferDraft;
      if (!draft) return;
      const source = namespace.outpostLifecycle.settlementById(state, draft.sourceId);
      const maximum = namespace.outpostLifecycle.internalTransferAvailability(source).maxTransferable;
      draft.amount = Math.max(1, Math.min(maximum, Math.floor(Number(input.value) || 1)));
      render(root, state);
    });
    on('[data-action="cancel-internal-transfer-draft"]', 'click', (event) => {
      event.stopPropagation();
      delete ensureUiState(state).internalTransferDraft;
      render(root, state);
    });
    on('[data-action="confirm-internal-transfer"]', 'click', (event) => {
      event.stopPropagation();
      const ui = ensureUiState(state);
      const draft = ui.internalTransferDraft;
      const input = root.querySelector('[data-internal-transfer-draft-amount]');
      if (!draft) return;
      const amount = Math.max(1, Math.floor(Number(input && input.value) || draft.amount || 1));
      const result = namespace.outpostLifecycle.sendInternalResidents(state, draft.sourceId, draft.destinationId, amount);
      if (result.ok) delete ui.internalTransferDraft;
      notify(root, state, result.ok ? 'Settler transfer departed.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="choose-internal-transfer-source"]', 'click', (event, button) => {
      const input = root.querySelector(`[data-internal-transfer-amount][data-destination-id="${button.dataset.destinationId}"]`);
      const amount = Math.max(0, Math.floor(Number(input && input.value) || 0));
      namespace.uiExpansion.beginSelection(state, { type: 'internal-transfer-source', destinationId: button.dataset.destinationId, amount });
      render(root, state);
    });    on('[data-action="choose-settler-source"]', 'click', (event, button) => {
      const input = root.querySelector('[data-settler-amount][data-outpost-id="' + button.dataset.outpostId + '"]');
      const amount = Math.max(0, Math.floor(Number(input && input.value) || 0));
      namespace.uiExpansion.beginSelection(state, { type: 'settler-source', outpostId: button.dataset.outpostId, amount });
      render(root, state);
    });
    on('[data-action="cancel-settler-order"]', 'click', (event, button) => {
      const result = namespace.outpostLifecycle.cancelSettlerOrder(state, button.dataset.orderId);
      notify(root, state, result.ok ? 'Settler order cancelled before departure.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="choose-village-parent"]', 'click', (event, button) => {
      namespace.uiExpansion.beginSelection(state, { type: 'village-parent', outpostId: button.dataset.outpostId });
      render(root, state);
    });
    on('[data-action="open-settlement-decision"]', 'click', (event, button) => {
      event.stopPropagation();
      ensureUiState(state).settlementDecision = {
        kind: button.dataset.kind,
        cityId: button.dataset.cityId
      };
      render(root, state);
    });
    on('[data-action="open-parent-transfer-details"]', 'click', (event, button) => {
      event.stopPropagation();
      ensureUiState(state).settlementDecision = {
        kind: 'parent-transfer',
        cityId: button.dataset.cityId
      };
      render(root, state);
    });
    on('[data-action="close-settlement-decision"]', 'click', (event) => {
      event.stopPropagation();
      delete ensureUiState(state).settlementDecision;
      render(root, state);
    });
    on('[data-action="confirm-settlement-decision"]', 'click', (event) => {
      event.stopPropagation();
      const ui = ensureUiState(state);
      const decision = ui.settlementDecision;
      if (!decision) return;
      if (decision.kind === 'parent-transfer') {
        delete ui.settlementDecision;
        namespace.uiExpansion.beginSelection(state, { type: 'village-reparent', villageId: decision.cityId });
        render(root, state);
        return;
      }
      const result = decision.kind === 'downgrade'
        ? namespace.settlementLifecycle.queueDowngrade(state, decision.cityId)
        : namespace.settlementLifecycle.queueAdvancement(state, decision.cityId);
      if (result.ok) delete ui.settlementDecision;
      notify(root, state, result.ok
        ? (decision.kind === 'downgrade' ? 'Settlement downgrade queued.' : 'Settlement advancement queued.')
        : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });    on('[data-action="choose-village-reparent"]', 'click', (event, button) => {
      namespace.uiExpansion.beginSelection(state, { type: 'village-reparent', villageId: button.dataset.cityId });
      render(root, state);
    });
    on('[data-action="start-settlement-advancement"]', 'click', (event, button) => {
      const preview = namespace.settlementLifecycle.advancementPreview(state, button.dataset.cityId);
      if (!preview.allowed) {
        notify(root, state, preview.reason, 'error');
        render(root, state);
        return;
      }
      if (!window.confirm(`Start ${preview.profile.label}?\n${preview.profile.durationDays} days | ${preview.countryReservation} Country Control reserved`)) return;
      const result = namespace.settlementLifecycle.queueAdvancement(state, button.dataset.cityId);
      notify(root, state, result.ok ? 'Settlement advancement queued.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="start-settlement-downgrade"]', 'click', (event, button) => {
      const preview = namespace.settlementLifecycle.downgradePreview(state, button.dataset.cityId);
      if (!preview.allowed) {
        notify(root, state, preview.reason, 'error');
        render(root, state);
        return;
      }
      if (!window.confirm(`Start ${preview.profile.label}?\nNo material refund. The current tier remains active until completion.`)) return;
      const result = namespace.settlementLifecycle.queueDowngrade(state, button.dataset.cityId);
      notify(root, state, result.ok ? 'Settlement downgrade queued.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });    on('[data-action="select-outpost-specialty"]', 'click', (event, button) => {
      const ui = ensureUiState(state);
      ui.outpostConversionDrafts = ui.outpostConversionDrafts || {};
      ui.outpostConversionDrafts[button.dataset.outpostId] = {
        ...(ui.outpostConversionDrafts[button.dataset.outpostId] || {}),
        specialtyId: button.dataset.specialtyId
      };
      render(root, state);
    });
    on('[data-action="start-outpost-village-conversion"]', 'click', (event, button) => {
      const draft = (ensureUiState(state).outpostConversionDrafts || {})[button.dataset.outpostId] || {};
      const preview = namespace.outpostLifecycle.villageConversionPreview(state, button.dataset.outpostId, draft.parentTownId, draft.specialtyId);
      if (!preview.allowed) {
        notify(root, state, preview.reason, 'error');
        render(root, state);
        return;
      }
      if (!window.confirm('Convert this Outpost to a ' + preview.specialty.label + ' under ' + preview.parent.name + '?')) return;
      const result = namespace.outpostLifecycle.queueConversion(state, button.dataset.outpostId, 'village', draft);
      notify(root, state, result.ok ? 'Village conversion started.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="start-outpost-town-conversion"]', 'click', (event, button) => {
      const preview = namespace.outpostLifecycle.townConversionPreview(state, button.dataset.outpostId);
      if (!preview.allowed) {
        notify(root, state, preview.reason, 'error');
        render(root, state);
        return;
      }
      if (!window.confirm('Convert this Outpost to a direct-Capital Town branch?')) return;
      const result = namespace.outpostLifecycle.queueConversion(state, button.dataset.outpostId, 'town');
      notify(root, state, result.ok ? 'Town conversion started.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="choose-relocation-destination"]', 'click', (event, button) => {
      const input = root.querySelector('[data-relocation-amount][data-outpost-id="' + button.dataset.outpostId + '"]');
      const amount = Math.max(0, Math.floor(Number(input && input.value) || 0));
      namespace.uiExpansion.beginSelection(state, { type: 'relocation-destination', outpostId: button.dataset.outpostId, amount });
      render(root, state);
    });
    on('[data-action="choose-dismantle-destination"]', 'click', (event, button) => {
      namespace.uiExpansion.beginSelection(state, { type: 'dismantle-destination', outpostId: button.dataset.outpostId });
      render(root, state);
    });
    on('[data-action="cancel-expansion-selection"]', 'click', () => {
      delete ensureUiState(state).expansionSelectionMode;
      render(root, state);
    });    on('[data-action="set-settlement-detail-tab"]', 'click', (event, button) => {
      const ui = ensureUiState(state);
      ui.settlementDetailTabs = ui.settlementDetailTabs || {};
      ui.settlementDetailTabs[button.dataset.settlementId] = button.dataset.tab;
      render(root, state);
    });
    on('[data-action="set-province-tab"]', 'click', (event, button) => {
      event.stopPropagation();
      setProvincePopoverTab(root, state, button.dataset.tab);
    });
    on('[data-action="toggle-province-building-group"]', 'click', (event, button) => {
      event.stopPropagation();
      const ui = ensureUiState(state);
      ui.provinceBuildingGroupsOpen = ui.provinceBuildingGroupsOpen || {};
      ui.provinceBuildingGroupsOpen[button.dataset.cityId] = ui.provinceBuildingGroupsOpen[button.dataset.cityId] || {};
      ui.provinceBuildingGroupsOpen[button.dataset.cityId][button.dataset.groupId] = button.getAttribute('aria-expanded') !== 'true';
      render(root, state);
    });
    on('[data-action="toggle-province-building-available"]', 'click', (event, button) => {
      event.stopPropagation();
      const ui = ensureUiState(state);
      ui.provinceBuildingAvailableOpen = ui.provinceBuildingAvailableOpen || {};
      ui.provinceBuildingAvailableOpen[button.dataset.cityId] = ui.provinceBuildingAvailableOpen[button.dataset.cityId] || {};
      ui.provinceBuildingAvailableOpen[button.dataset.cityId][button.dataset.groupId] = button.getAttribute('aria-expanded') !== 'true';
      render(root, state);
    });
    on('[data-action="toggle-province-workforce-breakdown"]', 'click', (event, button) => {
      event.stopPropagation();
      const ui = ensureUiState(state);
      ui.provinceWorkforceExpanded = ui.provinceWorkforceExpanded || {};
      ui.provinceWorkforceExpanded[button.dataset.settlementId] = !ui.provinceWorkforceExpanded[button.dataset.settlementId];
      render(root, state);
    });
    on('[data-action="set-local-population-tab"]', 'click', (event, button) => {
      event.stopPropagation();
      const ui = ensureUiState(state);
      ui.populationDetailTabs = ui.populationDetailTabs || {};
      ui.populationDetailTabs[button.dataset.cityId] = button.dataset.tab;
      render(root, state);
    });

    on('[data-action="queue-resource-site"]', 'click', (event, button) => {
      event.stopPropagation();
      queueResourceSite(
        root,
        state,
        button.dataset.regionId,
        button.dataset.resourceId
      );
    });
    on('[data-action="open-resource-site"]', 'click', (event, button) => {
      event.stopPropagation();
      openResourceSite(
        root,
        state,
        button.dataset.regionId,
        button.dataset.resourceId
      );
    });
    on('[data-action="back-to-resources"]', 'click', (event) => {
      event.stopPropagation();
      backToResources(root, state);
    });
    on('[data-action="set-worker-cap"]', 'change', (event, input) => {
      setWorkerCap(
        root,
        state,
        input.dataset.regionId,
        input.dataset.resourceId,
        input.value
      );
    });
    on('[data-worker-cap-number]', 'change', (event, input) => {
      const range = input
        .closest('.worker-cap-control')
        .querySelector('[data-action="set-worker-cap"]');
      setWorkerCap(
        root,
        state,
        range.dataset.regionId,
        range.dataset.resourceId,
        input.value
      );
    });
    on('[data-action="adjust-worker-cap"]', 'click', (event, button) => {
      const control = button.closest('.worker-cap-control');
      const range = control.querySelector('[data-action="set-worker-cap"]');
      const numberInput = control.querySelector('[data-worker-cap-number]');
      const next = Number(numberInput.value) + Number(button.dataset.delta);
      setWorkerCap(
        root,
        state,
        range.dataset.regionId,
        range.dataset.resourceId,
        next
      );
    });
    on('[data-action="set-economic-setting"]', 'change', (event, select) => {
      const region = namespace.resourceSites.regionById(state, select.dataset.regionId);
      const target = region
        ? namespace.resourceSites.siteByResource(region, select.dataset.resourceId)
        : null;
      const result = namespace.developmentEconomy.requestSettings(target, {
        [select.dataset.setting]: select.value
      });
      notify(root, state, result.ok ? 'Operating setting will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="remove-resource-level"]', 'click', (event, button) => {
      removeResourceLevel(
        root,
        state,
        button.dataset.regionId,
        button.dataset.resourceId
      );
    });
    on('[data-action="queue-administrative-building"]', 'click', (event, button) => {
      event.stopPropagation();
      queueAdministrativeBuilding(root, state, button.dataset.regionId, button.dataset.buildingId);
    });
    on('[data-action="reduce-administrative-building"]', 'click', (event, button) => {
      event.stopPropagation();
      reduceAdministrativeBuilding(root, state, button.dataset.cityId, button.dataset.buildingId);
    });
    on('[data-action="set-admin-worker-cap"]', 'change', (event, input) => {
      requestAdministrativeWorkerCap(root, state, input);
    });
    on('[data-action="set-admin-maintenance"]', 'change', (event, select) => {
      requestAdministrativeMaintenance(root, state, select);
    });
    on('[data-action="apply-country-control"]', 'click', (event, button) => {
      event.stopPropagation();
      applyCountryControlRequest(root, state, button);
    });
    on('[data-action="queue-processing-building"]', 'click', (event, button) => {
      event.stopPropagation();
      queueProcessingBuilding(
        root,
        state,
        button.dataset.regionId,
        button.dataset.buildingId
      );
    });
    on('[data-action="open-processing-building"]', 'click', (event, button) => {
      event.stopPropagation();
      openProcessingBuilding(
        root,
        state,
        namespace.manufacturing.cityById(state, button.dataset.cityId).regionId,
        button.dataset.cityId,
        button.dataset.buildingId
      );
    });
    on('[data-action="back-to-settlement"]', 'click', (event) => {
      event.stopPropagation();
      backToSettlement(root, state);
    });
    on('[data-action="reduce-processing-building"]', 'click', (event, button) => {
      event.stopPropagation();
      reduceProcessingBuilding(root, state, button.dataset.cityId, button.dataset.buildingId);
    });
    on('[data-action="apply-manufacturing-settings"]', 'click', (event, button) => {
      event.stopPropagation();
      applyManufacturingSettings(root, state, button.closest('[data-manufacturing-form]'));
    });
    on('[data-allocation-range]', 'input', (event, input) => {
      updateManufacturingAllocations(input.closest('[data-manufacturing-form]'), input);
    });
    on('[data-allocation-number]', 'input', (event, input) => {
      updateManufacturingAllocations(input.closest('[data-manufacturing-form]'), input);
    });
    on('[data-processing-worker-range]', 'input', (event, input) => {
      const form = input.closest('[data-manufacturing-form]');
      const output = form.querySelector('[data-processing-worker-value]');
      if (output) output.textContent = input.value + ' / ' + input.max;
    });
    on('[data-action="toggle-construction-pause"]', 'click', (event, button) => {
      toggleConstructionPause(
        root,
        state,
        button.dataset.regionId,
        button.dataset.projectId
      );
    });
    on('[data-action="move-construction"]', 'click', (event, button) => {
      moveConstruction(
        root,
        state,
        button.dataset.regionId,
        button.dataset.projectId,
        button.dataset.direction
      );
    });
    on('[data-action="cancel-construction"]', 'click', (event, button) => {
      cancelConstruction(
        root,
        state,
        button.dataset.regionId,
        button.dataset.projectId
      );
    });

    on('[data-action="toggle-time"]', 'click', () => {
      namespace.timeEngine.togglePause(state);
      render(root, state);
    });
    on('[data-action="set-time-speed"]', 'click', (event, button) => {
      namespace.timeEngine.setSpeed(state, Number(button.dataset.speed));
      render(root, state);
    });
    on('[data-action="open-shortage-alert"]', 'click', (event, button) => {
      event.stopPropagation();
      const alert = namespace.dailyEconomy.alertById(state, button.dataset.alertId);
      if (!alert) return;
      ensureUiState(state).criticalAlertModalId = alert.id;
      render(root, state);
    });
    on('[data-action="close-shortage-alert"]', 'click', (event) => {
      event.stopPropagation();
      ensureUiState(state).criticalAlertModalId = null;
      render(root, state);
    });
    root.querySelectorAll('.shortage-hud-alert').forEach((button) => {
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const alert = namespace.dailyEconomy.alertById(state, button.dataset.alertId);
        if (alert) alert.iconDismissed = true;
        ensureUiState(state).criticalAlertModalId = null;
        render(root, state);
      });
    });

    on('[data-action="open-season-report"]', 'click', (event, button) => {
      event.stopPropagation();
      const alert = namespace.dailyEconomy.alertById(state, button.dataset.alertId);
      if (!alert || alert.type !== 'annual-report') return;
      namespace.flowEconomy.openSeasonReport(state, alert.id);
      render(root, state);
    });
    on('[data-action="close-season-report"]', 'click', (event) => {
      event.stopPropagation();
      namespace.flowEconomy.closeSeasonReport(state);
      render(root, state);
    });
    on('[data-action="delete-alert"]', 'click', (event, button) => {
      event.stopPropagation();
      const alert = namespace.dailyEconomy.alertById(state, button.dataset.alertId);
      if (alert && alert.type === 'annual-report' && !window.confirm(`Delete ${alert.title}? This report cannot be recovered.`)) return;
      namespace.flowEconomy.deleteAlert(state, button.dataset.alertId);
      render(root, state);
    });
    on('[data-action="set-alert-filter"]', 'click', (event, button) => {
      ensureUiState(state).alertFilter = button.dataset.filter;
      render(root, state);
    });
    on('[data-action="set-alert-category"]', 'change', (event, select) => {
      ensureUiState(state).alertCategoryFilter = select.value;
      render(root, state);
    });
    on('[data-action="set-alert-settlement"]', 'change', (event, select) => {
      ensureUiState(state).alertSettlementFilter = select.value;
      render(root, state);
    });
    on('[data-action="set-warehouse-maintenance"]', 'change', (event, select) => {
      const result = namespace.developmentEconomy.requestWarehouseMaintenance(
        state,
        select.dataset.regionId,
        select.value
      );
      notify(root, state, result.ok ? 'Warehouse maintenance priority will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="choose-warehouse-location"]', 'click', (event) => {
      event.stopPropagation();
      ensureUiState(state).inventoryWarehousePicker = true;
      render(root, state);
    });
    on('[data-action="cancel-warehouse-location"]', 'click', (event) => {
      event.stopPropagation();
      delete ensureUiState(state).inventoryWarehousePicker;
      render(root, state);
    });
    on('[data-action="open-construction-details"]', 'click', (event, button) => {
      event.stopPropagation();
      ensureUiState(state).constructionDetails = {
        kind: button.dataset.kind,
        regionId: button.dataset.regionId || null,
        cityId: button.dataset.cityId || null,
        buildingId: button.dataset.buildingId || null
      };
      delete ensureUiState(state).inventoryWarehousePicker;
      render(root, state);
    });
    on('[data-action="close-construction-details"]', 'click', (event) => {
      event.stopPropagation();
      delete ensureUiState(state).constructionDetails;
      render(root, state);
    });
    on('[data-action="confirm-construction-details"]', 'click', (event) => {
      event.stopPropagation();
      const ui = ensureUiState(state);
      const details = ui.constructionDetails;
      if (!details) return;
      const result = details.kind === 'warehouse'
        ? namespace.storageLedger.queueWarehouse(state, details.regionId)
        : details.kind === 'medical'
          ? namespace.health.queueLevel(state, details.regionId, details.buildingId)
          : namespace.developmentEconomy.queueResidentialDistrict(state, details.cityId);
      if (result.ok) delete ui.constructionDetails;
      notify(root, state, result.ok ? 'Construction project queued.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="queue-warehouse"]', 'click', (event, button) => {
      const result = namespace.storageLedger.queueWarehouse(state, button.dataset.regionId);
      notify(
        root,
        state,
        result.ok ? 'Warehouse queued in the settlement province.' : (result.reason || 'Warehouse could not be queued.'),
        result.ok ? 'success' : 'error'
      );
      render(root, state);
    });

    on('[data-action="reduce-medical-building"]', 'click', (event, button) => {
      event.stopPropagation();
      const preview = namespace.health.reducePreview(state, button.dataset.cityId, button.dataset.buildingId);
      if (!preview.allowed) {
        notify(root, state, preview.reason || 'Medical facility cannot be reduced.', 'error');
        render(root, state);
        return;
      }
      if (!window.confirm('Reduce the newest Medical Building level or project? Completed levels give no refund.')) return;
      const result = namespace.health.reduceLevel(state, button.dataset.cityId, button.dataset.buildingId);
      notify(root, state, result.ok ? 'Medical Building reduced.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="reduce-warehouse"]', 'click', (event, button) => {
      event.stopPropagation();
      const preview = namespace.storageLedger.warehouseReducePreview(state, button.dataset.regionId);
      if (!preview.allowed) {
        notify(root, state, preview.reason || 'Warehouse cannot be reduced.', 'error');
        render(root, state);
        return;
      }
      if (!window.confirm('Reduce this Warehouse by one step? No materials or cash are refunded.')) return;
      const result = namespace.storageLedger.reduceWarehouseLevel(state, button.dataset.regionId);
      notify(
        root,
        state,
        result.ok ? 'Warehouse reduced with no refund.' : (result.reason || 'Warehouse reduction failed.'),
        result.ok ? 'success' : 'error'
      );
      render(root, state);
    });
    on('[data-action="quick-processing-worker-cap"]', 'change', (event, input) => {
      const result = namespace.manufacturing.requestWorkerCap(state, input.dataset.cityId, input.dataset.buildingId, input.value);
      notify(root, state, result.ok ? 'Worker Cap will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="quick-admin-worker-cap"]', 'change', (event, input) => {
      requestAdministrativeWorkerCap(root, state, input);
    });
    on('[data-action="add-capital-population"]', 'click', () => {
      const capital = (state.player.cities || []).find((city) => city.isCapital) || (state.player.cities || [])[0];
      if (!capital) return;
      capital.population = Math.max(0, Number(capital.population) || 0) + 100;
      capital.commoners = Math.max(0, Number(capital.commoners) || 0) + 100;
      capital.workforceTotal = Math.max(0, Number(capital.workforceTotal) || 0) + 60;
      capital.nonWorkforcePopulation = Math.max(0, Number(capital.nonWorkforcePopulation) || 0) + 40;
      namespace.workforce.recalculateAll(state);
      notify(root, state, 'Added 100 Commoners to the State Capital for testing.', 'success');
      render(root, state);
    });    on('[data-action="set-residential-maintenance"]', 'change', (event, select) => {
      const result = namespace.developmentEconomy.requestResidentialMaintenance(state, select.dataset.cityId, select.value);
      notify(root, state, result.ok ? 'Residential maintenance priority will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });    on('[data-action="build-residential-district"]', 'click', (event, button) => {
      const result = namespace.developmentEconomy.queueResidentialDistrict(state, button.dataset.cityId);
      notify(root, state, result.ok ? 'Residential District queued.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="reduce-residential-district"]', 'click', (event, button) => {
      if (!window.confirm('Reduce the newest Residential District level or project? Completed levels give no refund.')) return;
      const result = namespace.developmentEconomy.reduceResidentialDistrict(state, button.dataset.cityId);
      notify(root, state, result.ok ? 'Residential District reduced.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="set-satisfaction-meals"]', 'change', (event, select) => {
      const result = namespace.satisfaction.requestMealCount(state, select.dataset.cityId, select.value);
      notify(root, state, result.ok ? 'Meal allocation will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="set-satisfaction-drinks"]', 'change', (event, select) => {
      const result = namespace.satisfaction.requestDrinkLevel(state, select.dataset.cityId, select.value);
      notify(root, state, result.ok ? 'Drink allocation will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="set-all-satisfaction-service"]', 'click', (event, button) => {
      const serviceId = button.dataset.serviceId;
      const cities = state.player.cities || [];
      const label = serviceId === 'local-watch' ? 'Local Watch' : 'Religious Services';
      const raw = window.prompt(`Set ${label} worker cap for every settlement:`, '0');
      if (raw == null) return;
      const requested = Math.max(0, Math.floor(Number(raw) || 0));
      const projectedTotal = cities.reduce((sum, city) => {
        const service = namespace.satisfaction.ensureService(city, serviceId);
        return sum + Math.min(requested, service.requiredWorkers);
      }, 0);
      if (!window.confirm(`Apply ${label} cap ${requested} to ${cities.length} settlements? Projected requested workers: ${projectedTotal}. Changes apply on the next daily tick.`)) return;
      const results = cities.map((city) => namespace.satisfaction.requestServiceCap(state, city.id, serviceId, requested));
      const failed = results.find((result) => !result.ok);
      notify(root, state, failed ? failed.reason : `${label} Set All request saved for ${cities.length} settlements.`, failed ? 'error' : 'success');
      render(root, state);
    });
    on('[data-action="set-satisfaction-service-cap"]', 'change', (event, input) => {
      const result = namespace.satisfaction.requestServiceCap(state, input.dataset.cityId, input.dataset.serviceId, input.value);
      notify(root, state, result.ok ? 'Service worker cap will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="set-health-clothing-layers"]', 'change', (event, select) => {
      const result = namespace.health.requestClothingLayers(state, select.dataset.cityId, select.value);
      notify(root, state, result.ok ? 'Clothing layers will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="set-medical-distribution"]', 'change', (event, input) => {
      const result = namespace.health.requestMedicalDistribution(state, input.dataset.cityId, input.dataset.productId, input.value);
      notify(root, state, result.ok ? 'Medical distribution will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="set-medical-worker-cap"]', 'change', (event, input) => {
      const result = namespace.health.requestWorkerCap(state, input.dataset.cityId, input.dataset.buildingId, input.value);
      notify(root, state, result.ok ? 'Medical worker cap will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="set-allow-immigration"]', 'change', (event, input) => {
      const result = namespace.health.requestAllowImmigration(state, input.dataset.cityId, input.checked);
      notify(root, state, result.ok ? 'Immigration policy will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="open-workforce-priority"]', 'click', () => {
      const ui = ensureUiState(state);
      ui.activeMainPanel = 'production';
      ui.mainPanelTabs = ui.mainPanelTabs || {};
      ui.mainPanelTabs.production = 'workforce-priority';
      render(root, state);
    });
    on('[data-action="toggle-realm-branch"]', 'click', (event, button) => {
      const stateUi = ensureUiState(state);
      stateUi.realmOpenBranches = stateUi.realmOpenBranches || {};
      stateUi.realmBranchProblemFirst = stateUi.realmBranchProblemFirst || {};
      stateUi.realmOpenBranches[button.dataset.page] = stateUi.realmOpenBranches[button.dataset.page] === button.dataset.centerId
        ? null : button.dataset.centerId;
      stateUi.realmBranchProblemFirst[button.dataset.page] = false;
      render(root, state);
    });
    on('[data-action="open-realm-branch-warnings"]', 'click', (event, button) => {
      const stateUi = ensureUiState(state);
      stateUi.realmOpenBranches = stateUi.realmOpenBranches || {};
      stateUi.realmBranchProblemFirst = stateUi.realmBranchProblemFirst || {};
      stateUi.realmOpenBranches[button.dataset.page] = button.dataset.centerId;
      stateUi.realmBranchProblemFirst[button.dataset.page] = true;
      render(root, state);
    });
    on('[data-action="focus-realm-settlement"]', 'click', (event, button) => {
      const stateUi = ensureUiState(state);
      stateUi.activeMainPanel = null;
      stateUi.provincePopoverTab = button.dataset.page && button.dataset.page.indexOf('administration') === 0
        ? 'administration' : 'population';
      selectRegion(root, state, button.dataset.regionId);
    });
    on('[data-batch-scope]', 'change', (event, select) => {
      const form = select.closest('[data-realm-batch-form]');
      const target = form && form.querySelector('[data-batch-target]');
      if (!target) return;
      const scope = select.value;
      target.disabled = scope === 'all';
      Array.from(target.options).forEach((option) => {
        const matches = option.dataset.targetScope === scope;
        option.hidden = scope !== 'all' && !matches;
        option.disabled = scope !== 'all' && !matches;
      });
      if (scope !== 'all') {
        const first = Array.from(target.options).find((option) => option.dataset.targetScope === scope);
        if (first) target.value = first.value;
      }
    });
    on('[data-batch-field]', 'change', (event, select) => {
      const form = select.closest('[data-realm-batch-form]');
      const valueSelect = form && form.querySelector('[data-batch-value]');
      const definition = form && namespace.uiRealmBranches.fields(form.dataset.page).find((field) => field[0] === select.value);
      if (!valueSelect || !definition) return;
      valueSelect.replaceChildren(...definition[2].map((entry) => {
        const option = document.createElement('option');
        option.value = entry[0];
        option.textContent = entry[1];
        return option;
      }));
    });
    on('[data-action="preview-realm-batch"]', 'click', (event, button) => {
      const form = button.closest('[data-realm-batch-form]');
      namespace.uiRealmBranches.previewBatch(state, {
        page: form.dataset.page,
        scope: form.querySelector('[data-batch-scope]').value,
        targetId: form.querySelector('[data-batch-target]').value,
        field: form.querySelector('[data-batch-field]').value,
        value: form.querySelector('[data-batch-value]').value
      });
      render(root, state);
    });
    on('[data-action="confirm-realm-batch"]', 'click', () => {
      const applied = namespace.uiRealmBranches.confirmBatch(state);
      notify(root, state, applied ? 'One-time batch changes will apply on the next daily tick.' : 'No batch preview is available.', applied ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="sort-settlement-table"]', 'click', (event, button) => {
      const stateUi = ensureUiState(state);
      const current = stateUi.settlementTableSort || {};
      stateUi.settlementTableSort = {
        key: button.dataset.sortKey,
        direction: current.key === button.dataset.sortKey && current.direction === 'desc' ? 'asc' : 'desc'
      };
      render(root, state);
    });
    on('[data-action="reset-settlement-sort"]', 'click', () => {
      ensureUiState(state).settlementTableSort = { key: 'population', direction: 'desc' };
      render(root, state);
    });
    on('[data-action="select-settlement-development"]', 'change', (event, select) => {
      ensureUiState(state).settlementDevelopmentSelection = select.value;
      render(root, state);
    });
    on('[data-action="set-frontier-sort"]', 'change', (event, select) => {
      ensureUiState(state).frontierSort = select.value;
      render(root, state);
    });
    on('[data-action="set-outpost-sort"]', 'change', (event, select) => {
      ensureUiState(state).outpostSort = select.value;
      render(root, state);
    });
    on('[data-action="toggle-completed-transfers"]', 'change', (event, input) => {
      ensureUiState(state).showCompletedTransfers = input.checked;
      render(root, state);
    });
    on('[data-action="toggle-production-filter"]', 'click', (event, button) => {
      const stateUi = ensureUiState(state);
      stateUi.productionFilters = stateUi.productionFilters || {};
      const filters = stateUi.productionFilters[button.dataset.tab] || (stateUi.productionFilters[button.dataset.tab] = {});
      filters[button.dataset.filter] = !filters[button.dataset.filter];
      render(root, state);
    });
    on('[data-action="toggle-production-type"]', 'click', (event, button) => {
      const stateUi = ensureUiState(state);
      stateUi.productionOpenTypes = stateUi.productionOpenTypes || {};
      stateUi.productionOpenTypes[button.dataset.tab] = stateUi.productionOpenTypes[button.dataset.tab] === button.dataset.typeId
        ? null : button.dataset.typeId;
      render(root, state);
    });
    on('[data-production-batch-field]', 'change', (event, select) => {
      const form = select.closest('[data-production-batch-form]');
      const valueSelect = form && form.querySelector('[data-production-batch-value]');
      const fields = form && namespace.uiRealmProduction.batchFields(state, form.dataset.tab, form.dataset.typeId);
      const definition = fields && fields.find((field) => field[0] === select.value);
      if (!valueSelect || !definition) return;
      valueSelect.replaceChildren(...definition[2].map((entry) => {
        const option = document.createElement('option');
        option.value = entry[0];
        option.textContent = entry[1];
        return option;
      }));
    });
    on('[data-action="sort-production-types"]', 'click', (event, button) => {
      const stateUi = ensureUiState(state);
      stateUi.productionSort = stateUi.productionSort || {};
      const current = stateUi.productionSort[button.dataset.tab] || { key: 'type', direction: 'asc' };
      stateUi.productionSort[button.dataset.tab] = {
        key: button.dataset.sortKey,
        direction: current.key === button.dataset.sortKey && current.direction === 'asc' ? 'desc' : 'asc'
      };
      render(root, state);
    });
    on('[data-action="preview-production-batch"]', 'click', (event, button) => {
      const form = button.closest('[data-production-batch-form]');
      namespace.uiRealmProduction.previewBatch(
        state,
        form.dataset.tab,
        form.dataset.typeId,
        form.querySelector('[data-production-batch-field]').value,
        form.querySelector('[data-production-batch-value]').value
      );
      render(root, state);
    });
    on('[data-action="confirm-production-batch"]', 'click', () => {
      const applied = namespace.uiRealmProduction.confirmBatch(state);
      notify(root, state, applied ? 'Compatible type batch is pending for the next daily tick.' : 'No type batch preview is available.', applied ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="toggle-construction-filter"]', 'click', (event, button) => {
      const stateUi = ensureUiState(state);
      stateUi.constructionProjectFilters = stateUi.constructionProjectFilters || {};
      stateUi.constructionProjectFilters[button.dataset.filter] = !stateUi.constructionProjectFilters[button.dataset.filter];
      render(root, state);
    });
    on('[data-action="toggle-inventory-filter"]', 'click', (event, button) => {
      const stateUi = ensureUiState(state);
      stateUi.inventoryFilters = stateUi.inventoryFilters || {};
      stateUi.inventoryFilters[button.dataset.filter] = !stateUi.inventoryFilters[button.dataset.filter];
      render(root, state);
    });
    on('[data-action="toggle-inventory-category"]', 'click', (event, button) => {
      const stateUi = ensureUiState(state);
      stateUi.inventoryCollapsedCategories = stateUi.inventoryCollapsedCategories || {};
      stateUi.inventoryCollapsedCategories[button.dataset.categoryId] = !stateUi.inventoryCollapsedCategories[button.dataset.categoryId];
      render(root, state);
    });
    on('[data-product-cap-min], [data-product-cap-max], [data-product-reserve]', 'input', (event, input) => {
      const row = input.closest('[data-product-cap-row]');
      const stateUi = ensureUiState(state);
      stateUi.inventoryCapDrafts = stateUi.inventoryCapDrafts || {};
      const previous = stateUi.inventoryCapDrafts[row.dataset.resourceId] || {
        autoMin: namespace.storageLedger.productCapFor(state.storage, row.dataset.resourceId, true).autoMin,
        minEdited: false
      };
      const minInput = row.querySelector('[data-product-cap-min]');
      const maxInput = row.querySelector('[data-product-cap-max]');
      let autoMin = Boolean(previous.autoMin);
      let minEdited = Boolean(previous.minEdited);
      if (input.matches('[data-product-cap-min]')) {
        autoMin = false;
        minEdited = true;
      } else if (input.matches('[data-product-cap-max]') && (autoMin || !minEdited)) {
        autoMin = true;
        const maximum = Number(maxInput.value);
        minInput.value = maxInput.value === '' || !Number.isFinite(maximum) ? '0' : String(Math.round(maximum * 80) / 100);
      }
      stateUi.inventoryCapDrafts[row.dataset.resourceId] = {
        min: minInput.value,
        max: maxInput.value,
        reserve: row.querySelector('[data-product-reserve]').value,
        autoMin,
        minEdited
      };
    });
    on('[data-action="apply-product-cap"]', 'click', (event, button) => {
      const row = button.closest('[data-product-cap-row]');
      const stateUi = ensureUiState(state);
      stateUi.inventoryCapDrafts = stateUi.inventoryCapDrafts || {};
      const result = namespace.storageLedger.requestStockPolicy(
        state.storage,
        row.dataset.resourceId,
        row.querySelector('[data-product-cap-min]').value,
        row.querySelector('[data-product-cap-max]').value,
        row.querySelector('[data-product-reserve]').value,
        stateUi.inventoryCapDrafts[row.dataset.resourceId] || {}
      );
      if (result.ok) {
        if (stateUi.inventoryCapDrafts) delete stateUi.inventoryCapDrafts[row.dataset.resourceId];
        stateUi.inventoryPolicyConfirmations = stateUi.inventoryPolicyConfirmations || {};
        stateUi.inventoryPolicyConfirmations[row.dataset.resourceId] = true;
      }
      notify(root, state, result.ok ? 'Stock policy will apply on the next daily tick.' : result.reason, result.ok ? 'success' : 'error');
      render(root, state);
    });
    on('[data-action="set-main-panel-tab"]', 'click', (event, button) => {
      const ui = ensureUiState(state);
      ui.mainPanelTabs = ui.mainPanelTabs || {};
      ui.mainPanelTabs[button.dataset.panel] = button.dataset.tab;
      render(root, state);
    });
    on('[data-action="move-workforce-priority"]', 'click', (event, button) => {
      const row = button.closest('[data-workforce-priority-id]');
      const result = namespace.workforcePriority.requestMoveByDelta(
        state,
        row.dataset.workforcePriorityId,
        Number(button.dataset.delta)
      );
      if (!result.ok) showToast(root, state, result.reason, 'error');
      render(root, state);
    });
    on('[data-action="reset-workforce-priority"]', 'click', () => {
      if (!window.confirm('Reset the complete realm Workforce Priority list to the recommended order?')) return;
      namespace.workforcePriority.requestReset(state);
      showToast(root, state, 'Recommended Workforce Priority is pending for the next daily tick.');
      render(root, state);
    });
    on('[data-action="filter-workforce-priority"]', 'input', (event, input) => {
      const ui = ensureUiState(state);
      ui.workforcePriorityFilter = input.value;
      const query = input.value.trim().toLowerCase();
      root.querySelectorAll('[data-workforce-priority-id]').forEach((row) => {
        row.hidden = Boolean(query && !row.dataset.searchText.includes(query));
      });
    });
    on('[data-action="clear-workforce-priority-filter"]', 'click', () => {
      const ui = ensureUiState(state);
      ui.workforcePriorityFilter = '';
      const input = root.querySelector('[data-action="filter-workforce-priority"]');
      if (input) input.value = '';
      root.querySelectorAll('[data-workforce-priority-id]').forEach((row) => { row.hidden = false; });
      if (input) input.focus();
    });
    on('[data-workforce-priority-id]', 'dragstart', (event, row) => {
      const ui = ensureUiState(state);
      ui.draggedWorkforcePriorityId = row.dataset.workforcePriorityId;
      row.classList.add('dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', row.dataset.workforcePriorityId);
      }
    });
    on('[data-workforce-priority-id]', 'dragover', (event, row) => {
      event.preventDefault();
      row.classList.add('drag-over');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    on('[data-workforce-priority-id]', 'dragleave', (event, row) => {
      row.classList.remove('drag-over');
    });
    on('[data-workforce-priority-id]', 'drop', (event, row) => {
      event.preventDefault();
      const ui = ensureUiState(state);
      const sourceId = (event.dataTransfer && event.dataTransfer.getData('text/plain'))
        || ui.draggedWorkforcePriorityId;
      row.classList.remove('drag-over');
      if (sourceId && sourceId !== row.dataset.workforcePriorityId) {
        namespace.workforcePriority.requestMove(state, sourceId, row.dataset.workforcePriorityId);
      }
      delete ui.draggedWorkforcePriorityId;
      render(root, state);
    });
    on('[data-workforce-priority-id]', 'dragend', (event, row) => {
      row.classList.remove('dragging');
      row.classList.remove('drag-over');
      delete ensureUiState(state).draggedWorkforcePriorityId;
    });
    on('[data-action="set-construction-tab"]', 'click', (event, button) => {
      const ui = ensureUiState(state);
      ui.constructionTab = button.dataset.tab;
      if (ui.constructionTab !== 'build') delete ui.constructionBuildMode;
      render(root, state);
    });
    on('[data-action="filter-buildings"]', 'input', (event, input) => {
      const ui = ensureUiState(state);
      ui.constructionBuildSearch = input.value;
      applyConstructionBuildFilter(root, state);
    });
    on('[data-action="clear-building-search"]', 'click', () => {
      const ui = ensureUiState(state);
      ui.constructionBuildSearch = '';
      const input = root.querySelector('[data-action="filter-buildings"]');
      if (input) {
        input.value = '';
        input.focus();
      }
      applyConstructionBuildFilter(root, state);
    });
    on('[data-build-category]', 'toggle', (event, details) => {
      const ui = ensureUiState(state);
      if (buildingSearchTokens(ui.constructionBuildSearch).length) return;
      ui.constructionBuildCategories = ui.constructionBuildCategories || {};
      ui.constructionBuildCategories[details.dataset.buildCategory] = details.open;
    });
    on('[data-action="select-build-type"]', 'click', (event, button) => {
      const ui = ensureUiState(state);
      ui.constructionBuildMode = {
        kind: button.dataset.kind,
        resourceId: button.dataset.resourceId || null,
        buildingId: button.dataset.buildingId || null,
        label: button.dataset.label
      };
      ui.activeMainPanel = 'construction';
      ui.constructionTab = 'build';
      render(root, state);
    });
    on('[data-action="open-main-panel"]', 'click', (event, button) => {
      event.stopPropagation();
      const stateUi = ensureUiState(state);
      state.map.selectedRegionId = null;
      delete stateUi.resourceBuildMenu;
      delete stateUi.resourceSiteDetail;
      delete stateUi.processingBuildingDetail;
      stateUi.activeMainPanel = button.dataset.panel;
      hideTooltip(true);
      render(root, state);
    });
    on('[data-action="open-construction-projects"]', 'click', (event) => {
      event.stopPropagation();
      const ui = ensureUiState(state);
      state.map.selectedRegionId = null;
      ui.activeMainPanel = 'construction';
      ui.constructionTab = 'projects';
      render(root, state);
    });
    on('[data-action="close-main-panel"]', 'click', () => {
      ensureUiState(state).activeMainPanel = null;
      render(root, state);
    });
    on('[data-action="toggle-sidebar-pin"]', 'click', () => {
      const stateUi = ensureUiState(state);
      stateUi.sidebarPinned = !stateUi.sidebarPinned;
      namespace.uiViewport.persistUiLayout(state);
      render(root, state);
    });
    on('[data-action="reset-interface-layout"]', 'click', () => {
      namespace.uiViewport.resetInterfaceLayout(state);
      showToast(root, state, 'Interface layout reset.');
      render(root, state);
    });
    on('[data-action="focus-province"]', 'click', (event, button) => {
      ensureUiState(state).activeMainPanel = null;
      selectRegion(root, state, button.dataset.regionId);
    });
    on('[data-action="focus-resource-site"]', 'click', (event, button) => {
      ensureUiState(state).activeMainPanel = null;
      state.map.selectedRegionId = button.dataset.regionId;
      openResourceSite(
        root,
        state,
        button.dataset.regionId,
        button.dataset.resourceId
      );
    });
    on('[data-action="focus-processing-building"]', 'click', (event, button) => {
      ensureUiState(state).activeMainPanel = null;
      state.map.selectedRegionId = button.dataset.regionId;
      openProcessingBuilding(
        root,
        state,
        button.dataset.regionId,
        button.dataset.cityId,
        button.dataset.buildingId
      );
    });

    on('[data-action="toggle-province-maximize"]', 'click', (event) => {
      event.stopPropagation();
      toggleProvincePopoverMaximize(root, state);
      namespace.uiViewport.persistUiLayout(state);
      render(root, state);
    });
    on('[data-action="close-province"]', 'click', (event) => {
      event.stopPropagation();
      closeSelectedProvince(root, state);
    });

    const mapShell = root.querySelector('[data-map-shell]');
    if (mapShell) mapShell.addEventListener('contextmenu', (event) => {
      const ui = ensureUiState(state);
      if (!ui.constructionBuildMode && !ui.expansionSelectionMode) return;
      event.preventDefault();
      delete ui.constructionBuildMode;
      delete ui.expansionSelectionMode;
      render(root, state);
    });
    root.querySelectorAll('.region-cell[data-region-id]').forEach(
      (regionElement) => {
        regionElement.addEventListener('click', (event) => {
          if (namespace.uiViewport.isRegionClickSuppressed()) {
            event.preventDefault();
            return;
          }
          event.stopPropagation();
          if (namespace.settlementFoundation.startingVillageSetupInProgress(state)) {
            const setup = namespace.settlementFoundation.startingVillageSetup(state);
            if (setup.stage !== 'province') {
              const message = setup.stage === 'specialty' ? 'Choose the specialty for the selected Village province first.' : 'Review and confirm the two starting Villages first.';
              notify(root, state, message, 'error');
              render(root, state);
              return;
            }
            const result = namespace.settlementFoundation.chooseStartingVillageProvince(state, regionElement.dataset.regionId);
            notify(root, state, result.ok ? 'Starting Village province selected. Choose its specialty.' : result.reason, result.ok ? 'success' : 'error');
            render(root, state);
            return;
          }
          const expansionMode = ensureUiState(state).expansionSelectionMode;
          if (expansionMode) {
            const region = regionById(state, regionElement.dataset.regionId);
            const presentation = namespace.uiExpansion.selectionPresentation(state, region);
            if (!presentation || !presentation.preview.allowed) {
              notify(root, state, presentation ? presentation.preview.reason : 'This province is not eligible.', 'error');
              render(root, state);
              return;
            }
            if (!['village-parent', 'internal-transfer-select-source', 'internal-transfer-select-destination'].includes(expansionMode.type)) {
              const confirmed = window.confirm(
                presentation.title + '\n' + presentation.body
                + (expansionMode.type === 'dismantle-destination' ? '\nThe built Resource Site will be removed with no refund.' : '')
              );
              if (!confirmed) return;
            }
            const result = namespace.uiExpansion.selectMapTarget(state, region.id);
            notify(root, state, result.ok ? (result.reason || 'Expansion selection applied.') : result.reason, result.ok ? 'success' : 'error');
            render(root, state);
            return;
          }
          if (event.target.closest && event.target.closest('[data-construction-marker]')) {
            const ui = ensureUiState(state);
            ui.activeMainPanel = 'construction';
            ui.constructionTab = 'projects';
            ui.focusedConstructionRegionId = regionElement.dataset.regionId;
            state.map.selectedRegionId = null;
            render(root, state);
            return;
          }
          const mode = ensureUiState(state).constructionBuildMode;
          if (mode) {
            const region = regionById(state, regionElement.dataset.regionId);
            const result = mode.kind === 'warehouse'
              ? namespace.storageLedger.queueWarehouse(state, region.id)
              : mode.kind === 'processing-building'
                ? namespace.manufacturing.queueLevel(state, region.id, mode.buildingId)
                : mode.kind === 'administrative-building'
                  ? namespace.administration.queueLevel(state, region.id, mode.buildingId)
                  : mode.kind === 'medical-building'
                    ? namespace.health.queueLevel(state, region.id, mode.buildingId)
                    : namespace.resourceSites.queueLevel(state, region.id, mode.resourceId);
            notify(root, state, result.ok ? mode.label + ' queued in ' + region.name + '.' : (result.reason || 'This province is not eligible.'), result.ok ? 'success' : 'error');
            render(root, state);
            return;
          }
          selectRegion(
            root,
            state,
            regionElement.dataset.regionId,
            event,
            regionElement
          );
        });
        regionElement.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            regionElement.click();
          }
        });
      }
    );

    on('[data-cluster-strength]', 'input', (event, input) => {
      const output = root.querySelector('[data-cluster-value]');
      if (output) output.textContent = input.value;
    });
    on('[data-province-drag-handle]', 'pointerdown', (event) => {
      startProvincePopoverDrag(root, state, event);
    });
    on('[data-province-drag-handle]', 'pointermove', (event) => {
      moveProvincePopoverDrag(root, state, event);
    });
    on('[data-province-drag-handle]', 'pointerup', (event) => {
      finishProvincePopoverDrag(event);
    });
    on('[data-province-drag-handle]', 'pointercancel', (event) => {
      finishProvincePopoverDrag(event);
    });
    on('[data-province-resize]', 'pointerdown', (event) => {
      startProvincePopoverResize(root, state, event);
    });
    on('[data-province-resize]', 'pointermove', (event) => {
      moveProvincePopoverResize(root, state, event);
    });
    on('[data-province-resize]', 'pointerup', (event) => {
      finishProvincePopoverResize(event);
    });
    on('[data-province-resize]', 'pointercancel', (event) => {
      finishProvincePopoverResize(event);
    });
    root.querySelectorAll('[data-province-popover]').forEach((panel) => {
      panel.addEventListener('click', (event) => event.stopPropagation());
      panel.addEventListener(
        'pointerdown',
        (event) => event.stopPropagation()
      );
    });

    applyConstructionBuildFilter(root, state);
    bindMapViewControls(root, state);
    bindTooltips(root);
  }

  function mapSvg(state, mapView, className = '') {
    return `
      <div class='region-map-shell ${escapeAttribute(className)}' data-map-shell>
        <svg
          class='region-map'
          data-region-map
          viewBox='${formatViewBox(mapView)}'
          aria-label='Generated region map'
        >
          <polygon
            class='map-boundary'
            points='${polygonPoints(state.map.boundary)}'
          ></polygon>
          ${regionPolygons(state)}
          ${riverLines(state)}
        </svg>
      </div>
    `;
  }

  function undiscoveredMapSvg(state, mapView) {
    return `
      <div class='region-map-shell setup-fog-map-shell' aria-label='Undiscovered generated world'>
        <svg class='region-map' viewBox='${formatViewBox(mapView)}' aria-hidden='true'>
          <polygon class='setup-fog-boundary' points='${polygonPoints(state.map.boundary)}'></polygon>
          <g class='setup-fog-provinces'>
            ${state.map.regions.map((region) => `
              <polygon
                class='setup-fog-province ${region.isWater ? 'water' : 'land'}'
                points='${polygonPoints(region.polygon)}'
              ></polygon>
            `).join('')}
          </g>
        </svg>
      </div>
    `;
  }

  function setupScreen(state) {
    const { data } = namespace;
    const profile = worldProfileById(state.map.worldProfile);
    const shape = worldShapeById(state.map.worldShape);
    const stateUi = ensureUiState(state);
    const mapView = visibleMapViewBox(state);
    return `
      <div class='setup-shell'>
        <header class='setup-header'>
          <div>
            <p>${escapeHtml(data.prototypeMilestone.name)}</p>
            <h1>Eco Ruler</h1>
          </div>
          <button
            type='button'
            data-action='toggle-developer-preview'
            aria-pressed='${stateUi.developerMapPreview ? 'true' : 'false'}'
          >
            Developer Preview
          </button>
        </header>
        <main class='setup-workspace'>
          <section class='world-setup-panel'>
            <h2>World Setup</h2>
            <div class='tuning-form'>
              <label class='seed-row'>
                <span>Map Size</span>
                <select data-map-size>
                  ${optionsFor(data.mapSizes, state.map.mapSize)}
                </select>
              </label>
              <label class='seed-row'>
                <span>World Shape</span>
                <select data-world-shape>
                  ${optionsFor(data.worldShapes, state.map.worldShape)}
                </select>
              </label>
              <p class='profile-note'>${escapeHtml(shape.description)}</p>
              <label class='seed-row'>
                <span>Climate</span>
                <select data-world-profile>
                  ${optionsFor(data.worldProfiles, state.map.worldProfile)}
                </select>
              </label>
              <p class='profile-note'>${escapeHtml(profile.description)}</p>
              <label class='seed-row'>
                <span>Map Seed</span>
                <span class='seed-pair'>
                  <input
                    type='text'
                    value='${escapeAttribute(state.map.seed)}'
                    data-map-seed
                  />
                  <button
                    type='button'
                    data-action='random-map-seed'
                    aria-label='New Map Seed'
                  >${namespace.uiNavigation.icon('refresh-cw')}</button>
                </span>
              </label>
              <label class='seed-row'>
                <span>Starting Seed</span>
                <span class='seed-pair'>
                  <input
                    type='text'
                    value='${escapeAttribute(state.startSeed)}'
                    data-start-seed
                  />
                  <button
                    type='button'
                    data-action='random-start-seed'
                    aria-label='New Starting Seed'
                  >${namespace.uiNavigation.icon('map-pin')}</button>
                </span>
              </label>
              <label class='seed-row'>
                <span>
                  Cluster Strength
                  <strong data-cluster-value>
                    ${state.map.clusterStrength}
                  </strong>
                </span>
                <input
                  type='range'
                  min='0'
                  max='100'
                  step='1'
                  value='${state.map.clusterStrength}'
                  data-cluster-strength
                />
              </label>
              <div class='full-seed-row'>
                <span>Full Game Seed</span>
                <input
                  type='text'
                  value='${escapeAttribute(fullGameSeed(state))}'
                  data-full-game-seed
                />
                <div class='seed-pair'>
                  <button type='button' data-action='copy-full-seed'>
                    Copy
                  </button>
                  <button type='button' data-action='apply-full-seed'>
                    Apply
                  </button>
                </div>
              </div>
              <div class='setup-actions'>
                <button type='button' data-action='generate-map'>
                  Generate World
                </button>
                <button
                  type='button'
                  class='primary-action'
                  data-action='start-game'
                >
                  Start Game
                </button>
              </div>
            </div>
          </section>
          <section class='setup-preview'>
            ${stateUi.worldGenerated ? `
              <div class='undiscovered-map-preview'>
                ${undiscoveredMapSvg(state, mapView)}
              </div>
            ` : `
              <div class='world-hidden-panel'>
                <div>
                  ${namespace.uiNavigation.icon('map')}
                  <h2>Undiscovered World</h2>
                  <p>Choose the world rules, then generate or start the game.</p>
                </div>
              </div>
            `}
            ${stateUi.developerMapPreview ? `
              <div class='developer-map-preview'>
                ${mapSvg(state, mapView, 'developer')}
              </div>
            ` : ''}
          </section>
        </main>
        ${namespace.uiNavigation.toastLayer(state)}
      </div>
    `;
  }

  function gameScreen(state) {
    const mapView = visibleMapViewBox(state);
    const setupActive = namespace.settlementFoundation.startingVillageSetupInProgress(state);
    return `
      <div class='game-shell'>
        ${namespace.uiNavigation.topHud(state)}
        <main class='game-world'>
          <section class='map-stage' aria-label='World map stage'>
            <div class='map-toolbar'>
              <span data-map-zoom>
                Zoom ${Math.round(mapView.zoom * 100)}%
              </span>
            </div>
            ${setupActive ? '' : namespace.uiExpansion.selectionBanner(state)}
            ${mapSvg(state, mapView)}
            ${setupActive ? '' : selectedRegionPopover(state)}
            ${setupActive ? namespace.uiRealm.startingVillageSetupPanel(state) : ''}
          </section>
          ${setupActive ? '' : namespace.uiNavigation.mainNavigation(state)}
          ${setupActive ? '' : namespace.uiNavigation.activityRail(state)}
          ${setupActive ? '' : namespace.uiNavigation.mainPanel(state)}
          ${namespace.uiNavigation.toastLayer(state)}
          ${setupActive ? '' : namespace.uiNavigation.criticalAlertModal(state)}
          ${setupActive ? '' : namespace.uiNavigation.seasonalReportModal(state)}
          ${setupActive ? '' : namespace.uiNavigation.constructionDetailsModal(state)}
          ${setupActive ? '' : namespace.uiNavigation.settlementDecisionModal(state)}
        </main>
      </div>
    `;
  }

  function controlIdentity(element, index) {
    const tokens = [element.tagName.toLowerCase(), element.type || '', element.name || '', element.getAttribute('aria-label') || ''];
    let cursor = element;
    let depth = 0;
    while (cursor && depth < 5) {
      Object.keys(cursor.dataset || {}).sort().forEach((key) => {
        if (key === 'tooltipTitle' || key === 'tooltipBody' || key === 'tooltipMaterials') return;
        tokens.push(key + '=' + cursor.dataset[key]);
      });
      cursor = cursor.parentElement;
      depth += 1;
    }
    const meaningful = tokens.some((token) => token.includes('Id=') || token.startsWith('action=') || token.includes('Form='));
    return tokens.join('|') + (meaningful ? '' : '|index=' + index);
  }

  function controlValue(element) {
    if (element.type === 'checkbox' || element.type === 'radio') return Boolean(element.checked);
    return element.value;
  }

  function controlDefaultValue(element) {
    if (element.type === 'checkbox' || element.type === 'radio') return Boolean(element.defaultChecked);
    if (element.tagName === 'SELECT') {
      const selected = Array.from(element.options).find((option) => option.defaultSelected);
      return selected ? selected.value : (element.options[0] ? element.options[0].value : '');
    }
    return element.defaultValue;
  }

  function scrollIdentity(element, state, index) {
    const ui = ensureUiState(state);
    if (element.classList.contains('province-tab-panel')) {
      return 'province:' + (state.map.selectedRegionId || 'none') + ':' + (ui.provincePopoverTab || 'info');
    }
    if (element.classList.contains('main-menu-panel-body')) {
      const panel = ui.activeMainPanel || 'none';
      const tab = (ui.mainPanelTabs && ui.mainPanelTabs[panel]) || 'default';
      return 'main:' + panel + ':' + tab;
    }
    return element.dataset.uiScrollKey || element.className + ':' + index;
  }

  function uiScrollableElements(root) {
    const explicit = '.province-tab-panel, .main-menu-panel-body, .storage-table-wrap, .hud-inventory-menu, [data-ui-scroll-key]';
    return Array.from(root.querySelectorAll('*')).filter((element) => {
      if (element.matches(explicit)) return true;
      if (typeof window.getComputedStyle !== 'function') return false;
      const style = window.getComputedStyle(element);
      const overflow = style.overflow + ' ' + style.overflowX + ' ' + style.overflowY;
      return /(auto|scroll|overlay)/.test(overflow) && (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth);
    });
  }

  function focusableElements(root) {
    return Array.from(root.querySelectorAll('input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])'));
  }

  function captureUiContinuity(root, state) {
    const ui = ensureUiState(state);
    ui.controlDrafts = ui.controlDrafts || {};
    const controls = Array.from(root.querySelectorAll('input, select, textarea'));
    let activeControl = null;
    controls.forEach((element, index) => {
      const key = controlIdentity(element, index);
      const current = controlValue(element);
      const baseline = controlDefaultValue(element);
      if (current !== baseline) ui.controlDrafts[key] = { value: current, checked: element.checked };
      else if (ui.controlDrafts[key] && document.activeElement !== element) delete ui.controlDrafts[key];
      if (document.activeElement === element) {
        activeControl = {
          key,
          start: typeof element.selectionStart === 'number' ? element.selectionStart : null,
          end: typeof element.selectionEnd === 'number' ? element.selectionEnd : null
        };
      }
    });
    const focusables = focusableElements(root);
    const activeFocusIndex = focusables.indexOf(document.activeElement);
    const activeFocus = activeFocusIndex >= 0
      ? { key: controlIdentity(document.activeElement, activeFocusIndex) } : null;
    const scroll = {};
    uiScrollableElements(root).forEach((element, index) => {
      scroll[scrollIdentity(element, state, index)] = { top: element.scrollTop, left: element.scrollLeft };
    });
    return { activeControl, activeFocus, scroll, tooltip: tooltipSnapshot() };
  }

  function restoreUiContinuity(root, state, continuity) {
    const ui = ensureUiState(state);
    const controls = Array.from(root.querySelectorAll('input, select, textarea'));
    controls.forEach((element, index) => {
      const key = controlIdentity(element, index);
      const draft = ui.controlDrafts && ui.controlDrafts[key];
      if (!draft) return;
      if (element.type === 'checkbox' || element.type === 'radio') element.checked = Boolean(draft.checked);
      else element.value = draft.value;
      if (controlValue(element) === controlDefaultValue(element)) delete ui.controlDrafts[key];
      if (continuity.activeControl && continuity.activeControl.key === key) {
        element.focus({ preventScroll: true });
        if (continuity.activeControl.start != null && typeof element.setSelectionRange === 'function') {
          element.setSelectionRange(continuity.activeControl.start, continuity.activeControl.end);
        }
      }
    });
    const focusables = focusableElements(root);
    if (continuity.activeFocus) {
      const focusTarget = focusables.find((element, index) => controlIdentity(element, index) === continuity.activeFocus.key);
      if (focusTarget && document.activeElement !== focusTarget) focusTarget.focus({ preventScroll: true });
    }

    const restoreScroll = () => {
      uiScrollableElements(root).forEach((element, index) => {
        const saved = continuity.scroll[scrollIdentity(element, state, index)];
        if (!saved) return;
        element.scrollTop = saved.top;
        element.scrollLeft = saved.left;
      });
    };
    restoreScroll();
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(restoreScroll);
    restoreTooltip(root, continuity.tooltip);
  }
  function render(root, state) {
    const pinnedInventoryIndex = Array.from(root.querySelectorAll('.hud-inventory-group')).findIndex((group) => group.contains(document.activeElement));
    const continuity = captureUiContinuity(root, state);
    namespace.workforce.recalculateAll(state);
    root.innerHTML = namespace.uiRealm.isGameStarted(state)
      ? gameScreen(state)
      : setupScreen(state);
    const sidebar = root.querySelector('.game-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('pinned', Boolean(ensureUiState(state).sidebarPinned));
    }
    bindEvents(root, state);
    if (pinnedInventoryIndex >= 0) { const trigger = root.querySelectorAll('.hud-inventory-trigger')[pinnedInventoryIndex]; if (trigger) trigger.focus(); }
    positionProvincePopover(root, state);
    restoreUiContinuity(root, state, continuity);
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
    namespace.currentState = state;
  }

  function mount(root) {
    const state = namespace.createInitialState();
    namespace.currentState = state;
    render(root, state);
    namespace.timeController.start(root, state);
  }

  namespace.mountApp = mount;
  namespace.uiApp = Object.freeze({ render, mount });
})(window.EcoRuler = window.EcoRuler || {});
