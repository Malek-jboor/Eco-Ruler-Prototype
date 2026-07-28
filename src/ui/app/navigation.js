(function initializeNavigation(namespace) {
  const {
    escapeHtml,
    escapeAttribute,
    worldProfileById,
    worldShapeById,
    mapSizeById
  } = namespace.uiCore;

  const menuSections = [
    {
      label: 'State',
      items: [
        { id: 'realm', label: 'Realm Overview', icon: 'landmark' },
        { id: 'administration', label: 'Administration', icon: 'scroll-text' },
        { id: 'people', label: 'People', icon: 'users' },
        { id: 'settlements', label: 'Settlements', icon: 'building-2' },
        { id: 'expansion', label: 'Expansion', icon: 'flag' }
      ]
    },
    {
      label: 'Management',
      items: [
        { id: 'production', label: 'Production', icon: 'factory' },
        { id: 'construction', label: 'Construction', icon: 'hammer' },
        { id: 'inventory', label: 'Inventory', icon: 'package' }
      ]
    },
    {
      label: 'Power',
      items: [
        { id: 'military', label: 'Military & Security', icon: 'shield' }
      ]
    }
  ];

  const utilityItems = [
    { id: 'alerts', label: 'Alerts', icon: 'bell' }
  ];

  const panelTabs = Object.freeze({
    administration: Object.freeze([['overview', 'Overview'], ['admin-offices', 'Admin Offices'], ['country-control', 'Country Control'], ['local-control', 'Local Control']]),
    people: Object.freeze([['overview', 'Overview'], ['living-standards', 'Living Standards'], ['health', 'Health'], ['demographics', 'Demographics']]),
    settlements: Object.freeze([['hierarchy', 'Hierarchy'], ['table', 'Table'], ['development', 'Development']]),
    expansion: Object.freeze([['frontier', 'Frontier Overview'], ['outposts', 'Outposts'], ['settler-transfers', 'Settler Transfers']]),
    production: Object.freeze([['overview', 'Overview'], ['resource-sites', 'Resource Sites'], ['processing', 'Processing'], ['workforce-priority', 'Workforce Priority']]),
    inventory: Object.freeze([['stock', 'Stock']]),
    military: Object.freeze([['security', 'Security'], ['forces', 'Forces']])
  });

  function icon(name, className = '') {
    return `<i data-lucide='${escapeAttribute(name)}' class='${escapeAttribute(className)}' aria-hidden='true'></i>`;
  }

  function ensureUiState(state) {
    return namespace.uiViewport.ensureUiState(state);
  }

  function availableAmount(state, resourceId) {
    return Number(state.storage && state.storage.available && state.storage.available[resourceId]) || 0;
  }

  function totalFood(state) {
    return ['bread', 'meat', 'fish', 'butter', 'cheese', 'spiced-meat', 'vegetables', 'fruit']
      .reduce((total, resourceId) => total + availableAmount(state, resourceId), 0);
  }

  function activeShortageAlert(state) {
    const episode = state.economy && state.economy.shortageEpisode;
    return episode && namespace.dailyEconomy
      ? namespace.dailyEconomy.alertById(state, episode.alertId)
      : null;
  }

  function realmPopulation(state) {
    return (state.player.cities || []).reduce((total, city) => total + Number(city.population || 0), 0)
      + (state.player.outposts || []).reduce((total, outpost) => total + Number(outpost.population || 0), 0);
  }

  function realmWorkforce(state) {
    return (state.player.cities || []).reduce((totals, city) => ({
      total: totals.total + Number(city.workforceTotal || 0),
      available: totals.available + Number(city.workforceAvailable || 0)
    }), { total: 0, available: 0 });
  }

  function topHud(state) {
    const setupLocked = Boolean(namespace.settlementFoundation
      && namespace.settlementFoundation.startingVillageSetupInProgress(state));
    const workforce = realmWorkforce(state);
    const workforceRows = namespace.workforcePriority.summaries(state);
    const workforceRequested = workforceRows.reduce((sum, row) => sum + row.requested, 0);
    const workforceActual = workforceRows.reduce((sum, row) => sum + row.actual, 0);
    const workforceShortage = workforceRows.reduce((sum, row) => sum + row.shortage, 0);
    const populationSummary = namespace.health.realmSummary(state);
    const foodReserve = namespace.satisfaction.livingStandards(state, false).reserveDays;
    const storageSummary = namespace.storageLedger.storageSummary(state.storage);
    const reservationSummary = namespace.storageLedger.reservationSummary(state.storage);
    const countryControl = namespace.administration.reconcile(state).country;
    const countryControlLabel = namespace.uiAdministration.number(countryControl.allocated, 0)
      + ' / ' + namespace.uiAdministration.number(countryControl.capacity, 0);
    const shortage = activeShortageAlert(state);
    const manufacturingEpisode = state.economy && state.economy.manufacturingShortageEpisode;
    const manufacturingAlert = manufacturingEpisode
      ? namespace.dailyEconomy.alertById(state, manufacturingEpisode.alertId)
      : null;
    const alertCount = (state.alerts || []).filter((alert) => !alert.resolved).length;
    return `
      <header class='game-hud'>
        <div class='game-brand'><span class='brand-mark'>ER</span><strong>Eco Ruler</strong></div>
        <dl class='hud-metrics'>
          <div title='Capacity ${countryControl.capacity}; allocated ${countryControl.allocated}; requested ${countryControl.requested}; reserved ${countryControl.reserved}; spare ${countryControl.spare}'>${icon('landmark')}<dt>Country Control</dt><dd>${escapeHtml(countryControlLabel)}</dd></div>
          <div title='${Math.round(totalFood(state)).toLocaleString('en-US')} stored civilian food units'>${icon('wheat')}<dt>Food Reserve</dt><dd>${foodReserve} Days</dd></div>
          <div title='Births ${populationSummary.daily.births}; deaths ${populationSummary.daily.deaths}; migration ${populationSummary.daily.migration}'>${icon('users')}<dt>Population</dt><dd>${realmPopulation(state).toLocaleString('en-US')} <small>${populationSummary.daily.net >= 0 ? '+' : ''}${populationSummary.daily.net}/day</small></dd></div>
          <div title='Requested ${workforceRequested}; actual ${workforceActual}; shortage ${workforceShortage}; total pool ${workforce.total}'>${icon('briefcase')}<dt>Workforce</dt><dd>${workforce.available.toLocaleString('en-US')} Free</dd></div>
          <div title='Occupied ${storageSummary.occupied}; free ${storageSummary.free}; reservations ${reservationSummary.totalPercent}%${reservationSummary.overCapacity ? '; over capacity' : ''}'>${icon('warehouse')}<dt>Storage</dt><dd>${namespace.uiStorage.formatNumber(storageSummary.occupied)} / ${namespace.uiStorage.formatNumber(storageSummary.capacity)}</dd></div>
        </dl>
        ${namespace.uiStorage.hudInventoryDropdown(state)}
        <div class='hud-clock'>
          ${icon('calendar-days')}
          <span>Year ${state.clock.year}</span>
          <span>${escapeHtml(state.clock.season)}</span>
          <span>Day ${state.clock.day}</span>
          <div class='time-controls' aria-label='Time controls'>
            <button type='button' data-action='toggle-time' class='${state.clock.speed === 0 ? 'active' : ''}' aria-label='${setupLocked ? 'Complete Starting Village setup first' : state.clock.speed === 0 ? 'Resume time' : 'Pause time'}' ${setupLocked ? 'disabled' : ''}>
              ${icon(state.clock.speed === 0 ? 'play' : 'pause')}
            </button>
            ${namespace.timeEngine.SPEEDS.map((speed) => `
              <button type='button' data-action='set-time-speed' data-speed='${speed}' class='${state.clock.speed === speed ? 'active' : ''}' aria-label='${setupLocked ? 'Complete Starting Village setup first' : `Set speed to ${speed}x`}' ${setupLocked ? 'disabled' : ''}>${speed}x</button>
            `).join('')}
          </div>
        </div>
        ${shortage && !shortage.iconDismissed ? `
          <button type='button' class='shortage-hud-alert' data-action='open-shortage-alert' data-alert-id='${escapeAttribute(shortage.id)}' aria-label='Open food shortage warning'>
            ${icon('triangle-alert')}
          </button>
        ` : ''}
        ${manufacturingAlert && !manufacturingAlert.iconDismissed ? `
          <button type='button' class='production-hud-alert' data-action='open-main-panel' data-panel='alerts' aria-label='Open production input shortage'>
            ${icon('factory')}
          </button>
        ` : ''}
        <button type='button' class='developer-population-button' data-action='add-capital-population'>+100 Capital Population</button>
        <button type='button' class='hud-alert-button' data-action='open-main-panel' data-panel='alerts' aria-label='Open alerts'>
          ${icon('bell')}<span>${Math.min(99, alertCount)}</span>
        </button>
      </header>
    `;
  }

  function menuButton(item, activeId) {
    return `
      <button type='button' class='game-menu-item ${activeId === item.id ? 'active' : ''}' data-action='open-main-panel' data-panel='${escapeAttribute(item.id)}' aria-label='${escapeAttribute(item.label)}'>
        ${icon(item.icon)}<span>${escapeHtml(item.label)}</span>
      </button>
    `;
  }

  function mainNavigation(state) {
    const ui = ensureUiState(state);
    return `
      <nav class='game-sidebar ${ui.sidebarPinned ? 'pinned' : ''}' aria-label='Main game menu'>
        <div class='sidebar-head'>
          <button type='button' class='sidebar-menu-mark' data-action='toggle-sidebar-pin' aria-label='${ui.sidebarPinned ? 'Unpin main menu' : 'Pin main menu'}'>
            ${icon(ui.sidebarPinned ? 'panel-left-close' : 'menu')}
          </button>
          <strong>Main Menu</strong>
        </div>
        <div class='sidebar-scroll'>
          ${menuSections.map((section) => `
            <section class='sidebar-section'>
              <p>${escapeHtml(section.label)}</p>
              ${section.items.map((item) => menuButton(item, ui.activeMainPanel)).join('')}
            </section>
          `).join('')}
        </div>
        <div class='sidebar-utilities'>${utilityItems.map((item) => menuButton(item, ui.activeMainPanel)).join('')}</div>
      </nav>
    `;
  }

  function panelItem(panelId) {
    return menuSections.flatMap((section) => section.items)
      .concat(utilityItems)
      .find((item) => item.id === panelId)
      || { id: panelId, label: 'Realm Overview', icon: 'landmark' };
  }

  function panelShell(panelId, body) {
    const item = panelItem(panelId);
    return `
      <aside class='main-menu-panel' data-main-panel data-panel-id='${escapeAttribute(panelId)}'>
        <header>
          <div>${icon(item.icon)}<span><small>Realm Management</small><strong>${escapeHtml(item.label)}</strong></span></div>
          <button type='button' data-action='close-main-panel' aria-label='Close'>${icon('x')}</button>
        </header>
        <div class='main-menu-panel-body'>${body}</div>
      </aside>
    `;
  }


  function activePanelTab(state, panelId) {
    const tabs = panelTabs[panelId] || [];
    const ui = ensureUiState(state);
    ui.mainPanelTabs = ui.mainPanelTabs || {};
    const selected = ui.mainPanelTabs[panelId];
    const active = tabs.some(([id]) => id === selected) ? selected : (tabs[0] && tabs[0][0]);
    if (active) ui.mainPanelTabs[panelId] = active;
    return active || null;
  }

  function panelTabsBar(state, panelId) {
    const tabs = panelTabs[panelId] || [];
    if (!tabs.length) return '';
    const active = activePanelTab(state, panelId);
    return "<nav class='construction-tabs main-panel-tabs' aria-label='" + escapeAttribute(panelItem(panelId).label) + " tabs'>"
      + tabs.map(([id, label]) => "<button type='button' class='" + (active === id ? 'active' : '')
        + "' data-action='set-main-panel-tab' data-panel='" + escapeAttribute(panelId)
        + "' data-tab='" + escapeAttribute(id) + "'>" + escapeHtml(label) + "</button>").join('')
      + '</nav>';
  }
  function statBand(items) {
    return `<dl class='admin-stat-band'>${items.map((item) => `<div class='${escapeAttribute(item.className || '')}' ${item.title ? `title='${escapeAttribute(item.title)}'` : ''}><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(String(item.value))}</dd></div>`).join('')}</dl>`;
  }

  function cityRows(state) {
    const settlements = state.player.cities.map((city) => `<button type='button' class='admin-select-row' data-action='focus-province' data-region-id='${escapeAttribute(city.regionId)}'>${icon('building-2')}<span><strong>${escapeHtml(city.name)}</strong><small>${city.controlledRegionIds.length} controlled provinces</small></span><b>${namespace.uiStorage.formatNumber(city.population)}</b>${icon('chevron-right')}</button>`).join('');
    const outposts = (state.player.outposts || []).map((outpost) => `<button type='button' class='admin-select-row' data-action='focus-province' data-region-id='${escapeAttribute(outpost.regionId)}'>${icon('flag')}<span><strong>${escapeHtml(outpost.name)}</strong><small>${escapeHtml((namespace.uiViewport.regionById(state, outpost.regionId) || {}).name || 'Province')} | ${namespace.uiStorage.formatNumber(outpost.workforceAvailable || 0)} available</small></span><b>${namespace.uiStorage.formatNumber(outpost.population)}</b>${icon('chevron-right')}</button>`).join('');
    return `<div class='people-groups'><h4>Settlements</h4><div class='admin-row-list'>${settlements || "<p class='empty-state-copy'>No settlements founded.</p>"}</div><h4>Outposts</h4><div class='admin-row-list'>${outposts || "<p class='empty-state-copy'>No Outposts founded.</p>"}</div></div>`;
  }

  function realmOverview(state) {
    const storage = namespace.storageLedger.storageSummary(state.storage);
    const health = namespace.health.realmSummary(state);
    const satisfaction = namespace.satisfaction.realmSummary(state);
    const control = namespace.administration.reconcile(state).country;
    const foodReserve = namespace.satisfaction.livingStandards(state, false).reserveDays;
    const population30 = health.settlements.reduce((sum, row) => sum + row.projections.days30.net, 0);
    const satisfaction30 = satisfaction.settlements.length
      ? satisfaction.settlements.reduce((sum, row) => sum + row.projection30, 0) / satisfaction.settlements.length : 0;
    const criticalAlerts = (state.alerts || []).filter((alert) => !alert.resolved && alert.critical).slice(0, 3);
    const projectRows = state.map.regions.map((region) => {
      const active = namespace.constructionQueue.activeProject(region);
      const waiting = namespace.constructionQueue.waitingProjects(region);
      return active || waiting.length ? { region, active, waiting } : null;
    }).filter(Boolean);
    return `${statBand([
      { label: 'Population', value: `${realmPopulation(state)} (${population30 >= 0 ? '+' : ''}${population30} / 30d)` },
      { label: 'Health', value: `${namespace.uiStorage.formatNumber(health.actual, 1)} / ${namespace.uiStorage.formatNumber(health.target, 1)}` },
      { label: 'Satisfaction', value: `${namespace.uiStorage.formatNumber(satisfaction.actual, 1)} (${namespace.uiStorage.formatNumber(satisfaction30, 1)} / 30d)` },
      { label: 'Country Control', value: `${namespace.uiStorage.formatNumber(control.spare, 1)} available / ${namespace.uiStorage.formatNumber(control.capacity, 1)}` },
      { label: 'Food Reserve', value: `${foodReserve} Days` },
      { label: 'Storage', value: `${namespace.uiStorage.formatNumber(storage.occupied)} / ${namespace.uiStorage.formatNumber(storage.capacity)}` }
    ])}
      <section class='admin-section'><div class='admin-section-heading'><h3>Critical Alerts</h3><span>${criticalAlerts.length}</span></div>${criticalAlerts.length ? criticalAlerts.map((alert) => `<button type='button' class='overview-alert-row critical' data-action='open-main-panel' data-panel='alerts'><strong>${escapeHtml(alert.title)}</strong><span>${escapeHtml(alert.message)}</span></button>`).join('') : `<p class='empty-state-copy'>No active critical alerts.</p>`}</section>
      <section class='admin-section'><div class='admin-section-heading'><h3>Realm Construction</h3><span>${projectRows.length} Provinces</span></div>${projectRows.length ? projectRows.map(({ region, active, waiting }) => `<button type='button' class='compact-project-row' data-action='open-main-panel' data-panel='construction'><strong>${escapeHtml(region.name)}</strong><span>${active ? escapeHtml(active.label || active.kind) : 'Next Project'} | ${waiting.length} Waiting</span></button>`).join('') : `<p class='empty-state-copy'>Nothing Under Construction.</p>`}</section>`;
  }
  function simplePanel(title, status, copy, stats = []) {
    return `
      ${stats.length ? statBand(stats) : ''}
      <section class='admin-section'>
        <div class='admin-section-heading'><h3>${escapeHtml(title)}</h3><span>${escapeHtml(status)}</span></div>
        <p class='empty-state-copy'>${escapeHtml(copy)}</p>
      </section>
    `;
  }

  function settlementsPanel(state, flat = false) {
    const orderedCities = (state.player.cities || []).slice().sort((a, b) => flat
      ? a.name.localeCompare(b.name)
      : Number(b.isCapital) - Number(a.isCapital) || String(a.parentTownId || a.id).localeCompare(String(b.parentTownId || b.id)) || a.name.localeCompare(b.name));
    const outposts = state.player.outposts || [];
    const administration = namespace.administration.reconcile(state);
    const settlementRows = orderedCities.map((city) => {
      const parent = city.parentTownId ? namespace.administration.cityById(state, city.parentTownId) : null;
      const satisfaction = namespace.satisfaction.previewSettlement(state, city.id);
      const health = namespace.health.previewSettlement(state, city.id);
      const housing = namespace.developmentEconomy.housingSummary(city);
      const center = administration.localByCenter[city.id] || (parent ? administration.localByCenter[parent.id] : null);
      const localCoverage = center && center.villages && center.villages[city.id] ? center.villages[city.id].coverage : (center ? center.coverage : 1);
      const role = city.isCapital ? 'State Capital' : city.settlementIdentity === 'village' ? 'Village' : (city.settlementTier || city.level || 'Town');
      return `<button type='button' class='settlement-summary-row' data-action='focus-province' data-region-id='${escapeAttribute(city.regionId)}'><span><strong>${escapeHtml(city.name)}</strong><small>${escapeHtml(role)}${parent ? ` | Parent: ${escapeHtml(parent.name)}` : ''}</small></span><span><small>Population</small><b>${namespace.uiStorage.formatNumber(city.population)}</b></span><span><small>Satisfaction / Health</small><b>${namespace.uiStorage.formatNumber(satisfaction.actual, 1)} / ${namespace.uiStorage.formatNumber(health.actual, 1)}</b></span><span><small>Housing / Control</small><b>${namespace.uiStorage.formatNumber(housing.coverage * 100, 0)}% / ${namespace.uiStorage.formatNumber(localCoverage * 100, 0)}%</b></span>${icon('chevron-right')}</button>`;
    }).join('');
    return `<section class='admin-section'><div class='admin-section-heading'><div><h3>${flat ? 'Settlement Table' : 'Settlement Hierarchy'}</h3><p>${flat ? 'Flat sortable-by-name comparison.' : 'Every Village shows its fixed parent; Towns and Cities remain direct branches of the State Capital.'}</p></div><span>${state.player.cities.length}</span></div><div class='settlement-summary-list'>${settlementRows || `<p class='empty-state-copy'>No settlements founded.</p>`}</div></section>
      <section class='admin-section'><div class='admin-section-heading'><h3>Independent Outposts</h3><span>${outposts.length}</span></div>${outposts.length ? `<div class='admin-row-list'>${outposts.map((outpost) => `<button type='button' class='admin-select-row' data-action='focus-province' data-region-id='${escapeAttribute(outpost.regionId)}'>${icon('tent')}<span><strong>${escapeHtml(outpost.name)}</strong><small>Independent frontier province | No Control demand</small></span>${icon('chevron-right')}</button>`).join('')}</div>` : `<p class='empty-state-copy'>No Outposts founded.</p>`}</section>`;
  }
  function legacyProductionPanel(state, tab = 'overview') {
    const sites = [];
    state.map.regions.forEach((region) => {
      if (!namespace.uiRealm.isPlayerControlled(region)) return;
      (region.resourceSites || []).filter((site) => Number(site.level) > 0).forEach((site) => sites.push({ region, site }));
    });
    const processing = namespace.uiManufacturing.productionRows(state);
    const workers = (required, target) => {
      const requested = Math.min(required, Math.max(0, Number(Number.isFinite(target.pendingWorkerCap) ? target.pendingWorkerCap : target.workerCap) || 0));
      const actual = Math.max(0, Number(target.actualWorkers) || 0);
      return { requested, actual, shortage: Math.max(0, requested - actual) };
    };
    const siteCards = sites.map(({ region, site }) => {
      const definition = namespace.uiCore.siteForResource(site.resourceId);
      const required = namespace.workforce.requiredWorkers(site);
      const labor = workers(required, site);
      const preview = namespace.workforce.outputPreview(region, site);
      const savedActual = site.actualWorkers;
      site.actualWorkers = labor.requested;
      const expectedPreview = namespace.workforce.outputPreview(region, site);
      site.actualWorkers = savedActual;
      const expected = (expectedPreview.outputs || []).map((item) => `${namespace.uiStorage.formatNumber(item.annualAmount)} ${item.label}`).join(' + ') || 'No Output';
      const actual = (preview.outputs || []).map((item) => `${namespace.uiStorage.formatNumber(item.annualAmount)} ${item.label}`).join(' + ') || 'No Output';
      return `<article class='processing-building-card production-management-card'><button type='button' class='processing-card-open' data-action='focus-resource-site' data-region-id='${escapeAttribute(region.id)}' data-resource-id='${escapeAttribute(site.resourceId)}'><span><small>${escapeHtml(region.name)}</small><strong>${escapeHtml(definition.label)}</strong></span>${icon('chevron-right')}</button><dl><div><dt>Productivity</dt><dd>${namespace.uiStorage.formatNumber((preview.environmentalEfficiency || 0) * 100, 1)}%</dd></div><div><dt>Expected Output</dt><dd>${escapeHtml(expected)}</dd></div><div><dt>Actual Output</dt><dd>${escapeHtml(actual)}</dd></div><div><dt>Required</dt><dd>${required}</dd></div><div><dt>Requested</dt><dd>${labor.requested}</dd></div><div><dt>Actual</dt><dd>${namespace.uiStorage.formatNumber(labor.actual, 1)}</dd></div><div><dt>Shortage</dt><dd>${namespace.uiStorage.formatNumber(labor.shortage, 1)}</dd></div></dl><label>Worker Cap <input type='number' min='0' max='${required}' step='1' value='${labor.requested}' data-action='set-worker-cap' data-region-id='${escapeAttribute(region.id)}' data-resource-id='${escapeAttribute(site.resourceId)}'></label></article>`;
    }).join('');
    const processingCards = processing.map((row) => {
      const required = namespace.manufacturing.requiredWorkers(state, row.building);
      const labor = workers(required, row.building);
      const productivity = required ? labor.actual / required * 100 : 0;
      const actualOutput = (row.building.lastProduction || []).map((line) => `${namespace.uiStorage.formatNumber((Number(line.output) || 0) * 120)} ${(namespace.storageLedger.storageItemById[line.outputId] || {}).label || line.outputId}`).join(' + ') || '0';
      return `<article class='processing-building-card production-management-card'><button type='button' class='processing-card-open' data-action='focus-processing-building' data-region-id='${escapeAttribute(row.city.regionId)}' data-city-id='${escapeAttribute(row.city.id)}' data-building-id='${escapeAttribute(row.building.buildingId)}'><span><small>${escapeHtml(row.city.name)}</small><strong>${escapeHtml(row.label)}</strong></span>${icon('chevron-right')}</button><dl><div><dt>Productivity</dt><dd>${namespace.uiStorage.formatNumber(productivity, 1)}%</dd></div><div><dt>Expected Output</dt><dd>${escapeHtml(row.output)}</dd></div><div><dt>Actual Output</dt><dd>${escapeHtml(actualOutput)}</dd></div><div><dt>Required</dt><dd>${required}</dd></div><div><dt>Requested</dt><dd>${labor.requested}</dd></div><div><dt>Actual</dt><dd>${namespace.uiStorage.formatNumber(labor.actual, 1)}</dd></div><div><dt>Shortage</dt><dd>${namespace.uiStorage.formatNumber(labor.shortage, 1)}</dd></div></dl><label>Worker Cap <input type='number' min='0' max='${required}' step='1' value='${labor.requested}' data-action='quick-processing-worker-cap' data-city-id='${escapeAttribute(row.city.id)}' data-building-id='${escapeAttribute(row.building.buildingId)}'></label><small>Open the card to edit product allocations. Resource Sites have a fixed output.</small></article>`;
    }).join('');
    if (tab === 'resource-sites') return `<section class='admin-section'><div class='admin-section-heading'><h3>Resource Sites</h3><span>${sites.length}</span></div><div class='processing-building-grid'>${siteCards || "<p class='empty-state-copy'>No Resource Sites completed.</p>"}</div></section>`;
    if (tab === 'processing') return `<section class='admin-section'><div class='admin-section-heading'><h3>Processing</h3><span>${processing.length}</span></div><div class='processing-building-grid'>${processingCards || "<p class='empty-state-copy'>No Processing Buildings completed.</p>"}</div></section>`;
    const assigned = sites.reduce((total, row) => total + Number(row.site.actualWorkers || 0), 0) + processing.reduce((total, row) => total + Number(row.building.actualWorkers || 0), 0);
    return `${statBand([{ label: 'Resource Sites', value: sites.length }, { label: 'Processing Buildings', value: processing.length }, { label: 'Assigned Workers', value: namespace.uiStorage.formatNumber(assigned, 1) }, { label: 'Available Workforce', value: namespace.uiStorage.formatNumber(realmWorkforce(state).available, 1) }])}<section class='admin-section'><div class='admin-section-heading'><h3>Production Overview</h3><span>Realm</span></div><p class='empty-state-copy'>Use Resource Sites for fixed raw outputs, Processing for manufacturing allocations, and Workforce Priority for realm-wide staffing order.</p></section>`;
  }
  function productionPanel(state, tab = 'overview') {
    const sites = [];
    state.map.regions.forEach((region) => {
      if (!namespace.uiRealm.isPlayerControlled(region)) return;
      (region.resourceSites || []).filter((site) => Number(site.level) > 0)
        .forEach((site) => sites.push({ region, site }));
    });
    const processing = namespace.uiManufacturing.productionRows(state);
    const laborFor = (required, target) => {
      const requested = Math.min(required, Math.max(0, Number(
        Number.isFinite(target.pendingWorkerCap) ? target.pendingWorkerCap : target.workerCap
      ) || 0));
      const actual = Math.max(0, Number(target.actualWorkers) || 0);
      return { requested, actual, shortage: Math.max(0, requested - actual) };
    };
    const siteRows = sites.map(({ region, site }) => {
      const definition = namespace.uiCore.siteForResource(site.resourceId);
      const required = namespace.workforce.requiredWorkers(site);
      const labor = laborFor(required, site);
      const actualPreview = namespace.workforce.outputPreview(region, site);
      const savedWorkers = site.actualWorkers;
      site.actualWorkers = required;
      const maximumPreview = namespace.workforce.outputPreview(region, site);
      site.actualWorkers = savedWorkers;
      const actualById = Object.fromEntries((actualPreview.outputs || []).map((item) => [item.resourceId, item]));
      const output = (maximumPreview.outputs || []).map((maximum) => {
        const actual = actualById[maximum.resourceId];
        return namespace.uiStorage.formatNumber(actual && actual.annualAmount || 0)
          + ' / ' + namespace.uiStorage.formatNumber(maximum.annualAmount)
          + ' ' + maximum.label + ' per Year';
      }).join(' + ') || '0 / 0 per Year';
      const productivity = required ? labor.actual / required * 100 : 0;
      return `<article class='processing-building-card production-management-card compact-production-row'>
        <button type='button' class='processing-card-open' data-action='focus-resource-site' data-region-id='${escapeAttribute(region.id)}' data-resource-id='${escapeAttribute(site.resourceId)}'><span><small>${escapeHtml(region.name)} &middot; Level ${site.level}</small><strong>${escapeHtml(definition.label)}</strong></span>${icon('chevron-right')}</button>
        <dl><div><dt>Product</dt><dd>${escapeHtml((maximumPreview.outputs || []).map((item) => item.label).join(' + '))}</dd></div><div><dt>Productivity</dt><dd>${namespace.uiStorage.formatNumber(productivity, 1)}%</dd></div><div class='wide'><dt>Actual / Maximum Output</dt><dd>${escapeHtml(output)}</dd></div><div><dt>Workers</dt><dd>${namespace.uiStorage.formatNumber(labor.actual, 1)} / ${labor.requested} requested</dd></div><div class='${labor.shortage > 0 ? 'worker-shortage' : ''}'><dt>Worker Shortage</dt><dd>${namespace.uiStorage.formatNumber(labor.shortage, 1)}</dd></div></dl>
        <label class='compact-worker-slider'><span>Worker Cap ${labor.requested} / ${required}</span><span class='worker-coverage-track' title='${namespace.uiStorage.formatNumber(labor.actual, 1)} assigned; ${namespace.uiStorage.formatNumber(labor.shortage, 1)} shortage'><i style='width:${required ? labor.actual / required * 100 : 0}%'></i><b style='left:${required ? labor.actual / required * 100 : 0}%;width:${required ? labor.shortage / required * 100 : 0}%'></b></span><input type='range' min='0' max='${required}' step='1' value='${labor.requested}' data-action='set-worker-cap' data-region-id='${escapeAttribute(region.id)}' data-resource-id='${escapeAttribute(site.resourceId)}'></label>
      </article>`;
    }).join('');
    const processingRows = processing.map((row) => {
      const required = namespace.manufacturing.requiredWorkers(state, row.building);
      const labor = laborFor(required, row.building);
      const productivity = required ? labor.actual / required * 100 : 0;
      const allocations = row.building.pendingAllocations || row.building.allocations || {};
      const selected = row.definition.recipes.filter((recipe) => Number(allocations[recipe.id]) > 0)
        .map((recipe) => recipe.label + ' ' + namespace.uiStorage.formatNumber(allocations[recipe.id], 1) + '%').join(' + ') || 'No Product';
      const actual = (row.building.lastProduction || []).map((line) => namespace.uiStorage.formatNumber((Number(line.output) || 0) * 120)
        + ' ' + ((namespace.storageLedger.storageItemById[line.outputId] || {}).label || line.outputId)).join(' + ') || '0';
      return `<article class='processing-building-card production-management-card compact-production-row'>
        <button type='button' class='processing-card-open' data-action='focus-processing-building' data-region-id='${escapeAttribute(row.city.regionId)}' data-city-id='${escapeAttribute(row.city.id)}' data-building-id='${escapeAttribute(row.building.buildingId)}'><span><small>${escapeHtml(row.city.name)} &middot; Level ${row.building.level}</small><strong>${escapeHtml(row.label)}</strong></span>${icon('chevron-right')}</button>
        <dl><div><dt>Selected Product</dt><dd>${escapeHtml(selected)}</dd></div><div><dt>Productivity</dt><dd>${namespace.uiStorage.formatNumber(productivity, 1)}%</dd></div><div class='wide'><dt>Actual / Maximum Output</dt><dd>${escapeHtml(actual)} / ${escapeHtml(row.output)} per Year</dd></div><div><dt>Workers</dt><dd>${namespace.uiStorage.formatNumber(labor.actual, 1)} / ${labor.requested} requested</dd></div><div class='${labor.shortage > 0 ? 'worker-shortage' : ''}'><dt>Worker Shortage</dt><dd>${namespace.uiStorage.formatNumber(labor.shortage, 1)}</dd></div></dl>
        <label class='compact-worker-slider'><span>Worker Cap ${labor.requested} / ${required}</span><span class='worker-coverage-track' title='${namespace.uiStorage.formatNumber(labor.actual, 1)} assigned; ${namespace.uiStorage.formatNumber(labor.shortage, 1)} shortage'><i style='width:${required ? labor.actual / required * 100 : 0}%'></i><b style='left:${required ? labor.actual / required * 100 : 0}%;width:${required ? labor.shortage / required * 100 : 0}%'></b></span><input type='range' min='0' max='${required}' step='1' value='${labor.requested}' data-action='quick-processing-worker-cap' data-city-id='${escapeAttribute(row.city.id)}' data-building-id='${escapeAttribute(row.building.buildingId)}'></label>
      </article>`;
    }).join('');
    if (tab === 'resource-sites') return `<section class='admin-section'><div class='admin-section-heading'><h3>Resource Sites</h3><span>${sites.length}</span></div><div class='processing-building-grid compact-production-list'>${siteRows || "<p class='empty-state-copy'>No Resource Sites completed.</p>"}</div></section>`;
    if (tab === 'processing') return `<section class='admin-section'><div class='admin-section-heading'><h3>Processing</h3><span>${processing.length}</span></div><div class='processing-building-grid compact-production-list'>${processingRows || "<p class='empty-state-copy'>No Processing Buildings completed.</p>"}</div><div class='contextual-build-list'><div class='admin-section-heading'><h3>Build Processing</h3><span>Shared Construction</span></div>${namespace.uiManufacturing.constructionCards(state, 'production', ensureUiState(state).constructionBuildMode)}</div></section>`;
    const assigned = sites.reduce((total, row) => total + Number(row.site.actualWorkers || 0), 0)
      + processing.reduce((total, row) => total + Number(row.building.actualWorkers || 0), 0);
    return `${statBand([{ label: 'Resource Sites', value: sites.length }, { label: 'Processing Buildings', value: processing.length }, { label: 'Assigned Workers', value: namespace.uiStorage.formatNumber(assigned, 1) }, { label: 'Available Workforce', value: namespace.uiStorage.formatNumber(realmWorkforce(state).available, 1) }])}<section class='admin-section'><div class='admin-section-heading'><h3>Production Overview</h3><span>Realm</span></div><p class='empty-state-copy'>Use Resource Sites for fixed raw outputs, Processing for manufacturing allocations, and Workforce Priority for realm-wide staffing order.</p></section>`;
  }
  function queueProjectRows(region, predicate = null) {
    const allProjects = namespace.constructionQueue.orderedProjects(region);
    const projects = predicate ? allProjects.filter(predicate) : allProjects;
    if (!projects.length) {
      return "<p class='empty-state-copy'>No projects in this province.</p>";
    }
    return `
      <ol class='global-queue-list'>
        ${projects.map((project, index) => {
          const active = ['active', 'paused'].includes(project.status);
          const level = project.targetLevel
            ? ` | Level ${project.targetLevel}`
            : '';
          return `
            <li class='${active ? 'active' : ''} ${escapeAttribute(project.status)}'>
              <span class='queue-index'>${index + 1}</span>
              <div class='queue-project-copy'>
                <strong>${escapeHtml(project.label)}${level}</strong>
                <span class='queue-project-progress' title='${Math.max(0, project.durationDays - project.progressDays)} / ${project.durationDays} Days'><i data-project-progress='${escapeAttribute(project.id)}' data-progress-days='${project.progressDays}' data-duration-days='${project.durationDays}' style='width:${active ? (project.progressDays / project.durationDays) * 100 : 0}%'></i></span>
                <small>
                  ${project.status === 'paused'
                    ? 'Paused'
                    : active ? 'Active' : 'Waiting'}
                </small>
              </div>
              <div class='queue-row-actions'>
                <button
                  type='button'
                  data-action='move-construction'
                  data-region-id='${escapeAttribute(region.id)}'
                  data-project-id='${escapeAttribute(project.id)}'
                  data-direction='up'
                  aria-label='Move project up'
                  ${index === 0 ? 'disabled' : ''}
                >${icon('arrow-up')}</button>
                <button
                  type='button'
                  data-action='move-construction'
                  data-region-id='${escapeAttribute(region.id)}'
                  data-project-id='${escapeAttribute(project.id)}'
                  data-direction='down'
                  aria-label='Move project down'
                  ${index === projects.length - 1 ? 'disabled' : ''}
                >${icon('arrow-down')}</button>
                ${active ? `
                  <button
                    type='button'
                    data-action='toggle-construction-pause'
                    data-region-id='${escapeAttribute(region.id)}'
                    data-project-id='${escapeAttribute(project.id)}'
                    aria-label='Pause or resume project'
                  >${icon(project.status === 'paused' ? 'play' : 'pause')}</button>
                ` : ''}
                <button
                  type='button'
                  data-action='cancel-construction'
                  data-region-id='${escapeAttribute(region.id)}'
                  data-project-id='${escapeAttribute(project.id)}'
                  aria-label='Cancel project'
                >${icon('x')}</button>
              </div>

            </li>
          `;
        }).join('')}
      </ol>
    `;
  }

  function constructionTabs(active) {
    return `<nav class='construction-tabs'><button type='button' class='${active === 'build' ? 'active' : ''}' data-action='set-construction-tab' data-tab='build'>Build</button><button type='button' class='${active === 'projects' ? 'active' : ''}' data-action='set-construction-tab' data-tab='projects'>Projects</button></nav>`;
  }

  function constructionBuildPanel(state) {
    const ui = ensureUiState(state);
    const mode = ui.constructionBuildMode;
    const expandedCategories = ui.constructionBuildCategories || {};
    const searchValue = String(ui.constructionBuildSearch || '');
    const resourceIds = Object.keys(namespace.economyData.rawSiteEconomy)
      .filter((resourceId) => namespace.economyData.rawSiteEconomy[resourceId].buildable);
    const resourceCards = resourceIds.map((resourceId) => {
      const site = namespace.uiCore.siteForResource(resourceId);
      const active = mode && mode.kind === 'resource-site' && mode.resourceId === resourceId;
      return `<button type='button' class='build-card ${active ? 'active' : ''}' data-action='select-build-type'
        data-kind='resource-site' data-resource-id='${escapeAttribute(resourceId)}' data-label='${escapeAttribute(site.label)}'
        data-search-text='${escapeAttribute(site.label + ' Resource Sites')}'>
        ${icon('pickaxe')}<span><strong>${escapeHtml(site.label)}</strong><small>Map placement</small></span>
      </button>`;
    }).join('');
    const productionCards = namespace.uiManufacturing.constructionCards(state, 'production', mode);
    const manufacturingAdministrationCards = namespace.uiManufacturing.constructionCards(state, 'administrative', mode);
    const officeCards = namespace.uiAdministration.constructionCards(state, mode);
    const administrationCards = manufacturingAdministrationCards + officeCards;
    const administrationCount = namespace.manufacturingData.processingBuildingList.filter((item) => item.category === 'administrative').length
      + namespace.administrationData.officeList.length;
    const militaryCards = namespace.uiManufacturing.constructionCards(state, 'military', mode);
    const medicalCards = namespace.uiHealth.constructionCards(state, mode);
    const empty = "<p class='empty-state-copy'>No active buildings in this prototype category.</p>";
    const category = (id, label, count, cards, defaultOpen = false) => {
      const isOpen = Object.prototype.hasOwnProperty.call(expandedCategories, id)
        ? Boolean(expandedCategories[id])
        : defaultOpen;
      return `
        <details class='build-category' data-build-category='${escapeAttribute(id)}'
          data-build-category-name='${escapeAttribute(label)}' ${isOpen ? 'open' : ''}>
          <summary>${escapeHtml(label)} <span data-build-count data-total-count='${count}'>${count}</span></summary>
          <div class='build-card-grid'>${cards || empty}</div>
        </details>`;
    };
    const warehouseCard = `
      <button type='button' class='build-card ${mode && mode.kind === 'warehouse' ? 'active' : ''}'
        data-action='select-build-type' data-kind='warehouse' data-label='Warehouse'
        data-search-text='Warehouse Storage'>
        ${icon('warehouse')}<span><strong>Warehouse</strong><small>Settlement placement</small></span>
      </button>`;
    const searchControls = `
      <div class='build-search'>
        ${icon('search')}
        <input type='search' value='${escapeAttribute(searchValue)}' data-action='filter-buildings'
          aria-label='Search buildings' placeholder='Search buildings&hellip;' autocomplete='off' spellcheck='false'>
        <button type='button' data-action='clear-building-search' aria-label='Clear building search'
          ${searchValue ? '' : 'hidden'}>${icon('x')}</button>
      </div>`;
    return `<section data-construction-build>
      ${searchControls}
      ${mode ? `<p class='build-mode-banner'>Build mode: ${escapeHtml(mode.label)}. Left-click repeatedly to queue. Esc or right-click exits.</p>` : ''}
      <p class='empty-state-copy build-search-empty' data-build-no-results hidden>No buildings match this search.</p>
      ${category('resource-sites', 'Resource Sites', resourceIds.length, resourceCards, true)}
      ${category('production', 'Production', namespace.manufacturingData.processingBuildingList.filter((item) => item.category === 'production').length, productionCards, true)}
      ${category('administration', 'Administration', administrationCount, administrationCards)}
      ${category('civic-housing', 'Civic & Housing', 0, '')}
      ${category('medical', 'Medical', namespace.healthData.facilityList.length, medicalCards)}
      ${category('storage', 'Storage', 1, warehouseCard)}
      ${category('military', 'Military', namespace.manufacturingData.processingBuildingList.filter((item) => item.category === 'military').length, militaryCards)}
    </section>`;
  }
  function constructionPanel(state) {
    const tab = ensureUiState(state).constructionTab === 'projects' ? 'projects' : 'build';
    if (tab === 'build') return constructionTabs(tab) + constructionBuildPanel(state);
    if (namespace.uiRealmProduction) return constructionTabs(tab) + namespace.uiRealmProduction.constructionProjects(state);
    const cityGroups = state.player.cities.filter((city) => city.controlledRegionIds.some((regionId) => {
      const region = namespace.uiViewport.regionById(state, regionId);
      return region && namespace.constructionQueue.orderedProjects(region).length;
    })).map((city) => {
      const provinces = city.controlledRegionIds
        .map((regionId) => namespace.uiViewport.regionById(state, regionId))
        .filter((region) => region && namespace.constructionQueue.orderedProjects(region).length);
      return `
        <section class='construction-city-group'>
          <div class='admin-section-heading'><h3>${escapeHtml(city.name)}</h3><span>${provinces.reduce((total, region) => total + namespace.constructionQueue.orderedProjects(region).length, 0)} Projects</span></div>
          ${provinces.length ? provinces.map((region) => `
            <div class='construction-province-group'>
              <button type='button' class='province-group-heading' data-action='focus-province' data-region-id='${escapeAttribute(region.id)}'><span>${escapeHtml(region.name)}</span>${icon('external-link')}</button>
              ${queueProjectRows(region)}
            </div>
          `).join('') : "<p class='empty-state-copy'>No city construction projects.</p>"}
        </section>
      `;
    }).join('');

    const outpostGroups = (state.player.outposts || []).map((outpost) => {
      const region = namespace.uiViewport.regionById(state, outpost.regionId);
      if (!region || !namespace.constructionQueue.orderedProjects(region).length) return '';
      return `
        <div class='construction-province-group'>
          <button type='button' class='province-group-heading' data-action='focus-province' data-region-id='${escapeAttribute(region.id)}'><span>${escapeHtml(outpost.name)} | ${escapeHtml(region.name)}</span>${icon('external-link')}</button>
          ${queueProjectRows(region)}
        </div>
      `;
    }).join('');

    return constructionTabs(tab) + `
      ${statBand([
        { label: 'Active Projects', value: state.map.regions.filter((region) => namespace.constructionQueue.activeProject(region)).length },
        { label: 'Queued Projects', value: state.map.regions.reduce((total, region) => total + namespace.constructionQueue.waitingProjects(region).length, 0) }
      ])}
      ${cityGroups}
      ${outpostGroups ? `<section class='construction-city-group'>
        <div class='admin-section-heading'><h3>Independent Outposts</h3><span>${state.player.outposts.length}</span></div>
        ${outpostGroups}
      </section>
      ` : ''}
      ${!cityGroups && !outpostGroups ? "<p class='empty-state-copy'>Nothing Under Construction.</p>" : ''}
    `;
  }

  function alertsPanel(state) {
    const ui = ensureUiState(state);
    const filter = ui.alertFilter || 'all';
    const categoryFilter = ui.alertCategoryFilter || 'all';
    const settlementFilter = ui.alertSettlementFilter || 'all';
    const severity = (alert) => alert.critical ? 3 : alert.severity === 'warning' ? 2 : 1;
    const allAlerts = (state.alerts || []).slice().sort((a, b) => {
      const activeDifference = Number(!a.resolved) - Number(!b.resolved);
      if (activeDifference) return -activeDifference;
      const severityDifference = severity(b) - severity(a);
      if (severityDifference) return severityDifference;
      return Number(b.sequence || b.createdAt && b.createdAt.absoluteDay || b.createdDay || 0)
        - Number(a.sequence || a.createdAt && a.createdAt.absoluteDay || a.createdDay || 0);
    });
    const alerts = allAlerts.filter((alert) => {
      const stateMatches = filter === 'all'
        || (filter === 'active' && !alert.resolved)
        || (filter === 'resolved' && alert.resolved)
        || (filter === 'critical' && alert.critical)
        || (filter === 'reports' && alert.type === 'annual-report');
      const categoryMatches = categoryFilter === 'all' || alert.type === categoryFilter;
      const settlement = settlementFilter === 'all' ? null : namespace.administration.cityById(state, settlementFilter);
      const settlementMatches = !settlement || alert.cityId === settlement.id || alert.settlementId === settlement.id || String(alert.message || '').includes(settlement.name);
      return stateMatches && categoryMatches && settlementMatches;
    });
    const rows = alerts.length ? alerts.map((alert) => {
      const action = alert.type === 'food-shortage'
        ? 'open-shortage-alert'
        : alert.type === 'annual-report' ? 'open-season-report' : '';
      const actionAttributes = action
        ? ' data-action="' + action + '" data-alert-id="' + escapeAttribute(alert.id) + '"'
        : '';
      const alertButton = '<button type="button" class="structured-alert '
        + (alert.critical ? 'critical ' : '')
        + (alert.resolved ? 'resolved' : '')
        + '"' + actionAttributes + '>'
        + icon(alert.type === 'annual-report' ? 'chart-column' : (alert.critical ? 'triangle-alert' : 'bell'))
        + '<span><strong>' + escapeHtml(alert.title) + '</strong><small>'
        + escapeHtml(alert.message) + ' | ' + escapeHtml(namespace.dailyEconomy.dateLabel(alert.createdAt))
        + '</small></span></button>';
      const deleteButton = alert.type === 'annual-report'
        ? '<button type="button" class="delete-alert-button" data-action="delete-alert" data-alert-id="' + escapeAttribute(alert.id) + '" aria-label="Delete report alert">' + icon('trash-2') + '</button>'
        : '';
      return '<div class="structured-alert-row">' + alertButton + deleteButton + '</div>';
    }).join('') : '<p class="empty-state-copy">No alerts match this filter.</p>';
    const filters = [['all', 'All'], ['active', 'Active'], ['resolved', 'Resolved'], ['critical', 'Critical'], ['reports', 'Reports']]
      .map(([id, label]) => `<button type='button' class='${filter === id ? 'active' : ''}' data-action='set-alert-filter' data-filter='${id}'>${label}</button>`).join('');
    return '<section class="admin-section">'
      + '<div class="admin-section-heading"><h3>Alerts</h3><span>' + alerts.length + ' / ' + allAlerts.length + '</span></div>'
      + '<nav class="alert-filters" aria-label="Alert filters">' + filters
      + `<select data-action='set-alert-category' aria-label='Alert category'><option value='all'>All Categories</option>${Array.from(new Set(allAlerts.map((alert) => alert.type))).sort().map((type) => `<option value='${escapeAttribute(type)}' ${categoryFilter === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select>`
      + `<select data-action='set-alert-settlement' aria-label='Alert settlement'><option value='all'>All Settlements</option>${(state.player.cities || []).map((city) => `<option value='${escapeAttribute(city.id)}' ${settlementFilter === city.id ? 'selected' : ''}>${escapeHtml(city.name)}</option>`).join('')}</select></nav>`
      + '<div class="structured-alert-list">' + rows + '</div>'
      + '</section>'
      + '<section class="admin-section"><div class="admin-section-heading"><h3>Event Log</h3><span>'
      + state.log.length + '</span></div><ol class="full-alert-list">'
      + namespace.uiMapRender.logRows(state.log) + '</ol></section>';
  }
  function constructionDetailsModal(state) {
    const details = ensureUiState(state).constructionDetails;
    if (!details) return '';
    const isWarehouse = details.kind === 'warehouse';
    const isResidential = details.kind === 'residential';
    const isMedical = details.kind === 'medical';
    const availability = isWarehouse
      ? namespace.storageLedger.warehouseBuildAvailability(state, details.regionId)
      : isResidential
        ? namespace.developmentEconomy.residentialBuildAvailability(state, details.cityId)
        : isMedical
          ? namespace.health.buildAvailability(state, details.regionId, details.buildingId)
          : null;
    if (!availability) return '';
    const city = availability.city;
    const preview = availability.preview;
    if (!city || !preview) return '';
    const region = availability.region || namespace.health.settlementRegion(state, city);
    const currentLevel = isWarehouse
      ? Math.max(0, Number(state.storage.warehouseLevelsByRegion[region.id]) || 0)
      : isResidential
        ? Math.max(0, Number(city.residentialDistrictLevels) || 0)
        : ((namespace.health.facilityById(city, details.buildingId) || {}).level || 0);
    const targetLevel = isWarehouse
      ? namespace.storageLedger.projectedWarehouseLevel(state, region) + 1
      : isResidential ? availability.targetLevel : preview.targetLevel;
    const capacity = availability.capacity && availability.capacity.summary;
    const materials = Object.entries(preview.materials || {}).map(([resourceId, required]) => {
      const item = namespace.storageLedger.storageItemById[resourceId];
      const available = Number(state.storage.available[resourceId]) || 0;
      const enough = available + 0.000001 >= required;
      return `<div class='construction-detail-material ${enough ? 'enough' : 'short'}'><span>${escapeHtml(item ? item.label : resourceId)}</span><b>${namespace.uiStorage.formatNumber(available)} / ${namespace.uiStorage.formatNumber(required)}</b></div>`;
    }).join('');
    const capacityAdded = isWarehouse
      ? `${preview.capacityAdded} Storage`
      : isResidential ? `${preview.housingAdded} Housing` : `${preview.populationCapacity} Medical Capacity`;
    const maintenance = isWarehouse
      ? `${preview.maintenancePercent}% material maintenance`
      : isResidential ? '5% material maintenance; quality only' : `${availability.definition.construction.maintenancePercent}% material maintenance`;
    let maintenanceControl = '';
    if (isWarehouse || isResidential) {
      const maintenancePriority = isWarehouse
        ? (state.storage.pendingWarehouseMaintenancePriorityByRegion[region.id]
          || state.storage.warehouseMaintenancePriorityByRegion[region.id] || 'normal')
        : (city.pendingResidentialMaintenancePriority || city.residentialMaintenancePriority || 'normal');
      const maintenanceOptions = namespace.developmentData.priorities.map((value) => `<option value='${value}' ${maintenancePriority === value ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>`).join('');
      maintenanceControl = isWarehouse
        ? `<label class='construction-maintenance-control'>Maintenance Priority <select data-action='set-warehouse-maintenance' data-region-id='${escapeAttribute(region.id)}'>${maintenanceOptions}</select></label>`
        : `<label class='construction-maintenance-control'>Maintenance Priority <select data-action='set-residential-maintenance' data-city-id='${escapeAttribute(city.id)}'>${maintenanceOptions}</select></label>`;
    }
    return `<div class='critical-alert-backdrop construction-details-backdrop'>
      <section class='construction-details-modal' role='dialog' aria-modal='true' aria-labelledby='construction-details-title'>
        <header><div>${icon('hammer')}<span><small>Construction Details</small><h2 id='construction-details-title'>${escapeHtml(preview.label)}</h2></span></div><button type='button' data-action='close-construction-details' aria-label='Close'>${icon('x')}</button></header>
        <div class='construction-details-body'>
          <dl class='admin-facts'><div><dt>Settlement</dt><dd>${escapeHtml(city.name)}</dd></div><div><dt>Level</dt><dd>${currentLevel} &rarr; ${targetLevel}</dd></div><div><dt>Result</dt><dd>+${escapeHtml(capacityAdded)}</dd></div><div><dt>Development Footprint</dt><dd>${preview.footprint || (availability.capacity && availability.capacity.footprint) || 0.2}</dd></div><div><dt>Development Capacity</dt><dd>${capacity ? namespace.uiStorage.formatNumber(capacity.used, 1) + ' / ' + namespace.uiStorage.formatNumber(capacity.total, 1) : 'Unavailable'}</dd></div><div><dt>Duration</dt><dd>${preview.days} Days</dd></div><div><dt>Maintenance</dt><dd>${escapeHtml(maintenance)}</dd></div></dl>
          ${maintenanceControl}
          <section><h3>Materials: Available / Required</h3><div class='construction-detail-materials'>${materials}</div></section>
          <p class='${availability.allowed ? 'construction-ready' : 'construction-blocker'}'>${escapeHtml(availability.reason)}</p>
        </div>
        <footer><button type='button' data-action='close-construction-details'>Back</button><button type='button' class='primary-action' data-action='confirm-construction-details' ${availability.allowed ? '' : 'disabled'}>Confirm Construction</button></footer>
      </section>
    </div>`;
  }
  function settlementDecisionModal(state) {
    const decision = ensureUiState(state).settlementDecision;
    if (!decision) return '';
    const city = namespace.settlementLifecycle.settlementById(state, decision.cityId);
    if (!city) return '';
    if (decision.kind === 'parent-transfer') {
      const parent = namespace.settlementHierarchy.parentTown(state, city);
      const rule = namespace.settlementLifecycleData.parentTransfer;
      return `<div class='critical-alert-backdrop construction-details-backdrop'>
        <section class='construction-details-modal' role='dialog' aria-modal='true' aria-labelledby='settlement-decision-title'>
          <header><div>${icon('route')}<span><small>Administrative Decision</small><h2 id='settlement-decision-title'>Switch Village Parent</h2></span></div><button type='button' data-action='close-settlement-decision' aria-label='Close'>${icon('x')}</button></header>
          <div class='construction-details-body'>
            <dl class='admin-facts'><div><dt>Village</dt><dd>${escapeHtml(city.name)}</dd></div><div><dt>Current Parent</dt><dd>${parent ? escapeHtml(parent.name) : 'None'}</dd></div><div><dt>Selection</dt><dd>Manual on Map</dd></div><div><dt>Maximum Distance</dt><dd>${rule.maxDistance} Land Provinces</dd></div><div><dt>Local Control</dt><dd>100% coverage required at the new parent</dd></div><div><dt>Paper Cost</dt><dd>${rule.paperPerLocalControl} per required Local Control</dd></div><div><dt>Time</dt><dd>Instant after confirmation</dd></div><div><dt>Satisfaction Penalty</dt><dd>-10 for 60 days, then -5 for 60 days</dd></div></dl>
            <p class='construction-ready'>Choose a valid Town, City, or State Capital on the map. Hovering a candidate shows its exact Control and Paper cost.</p>
          </div>
          <footer><button type='button' data-action='close-settlement-decision'>Back</button><button type='button' class='primary-action' data-action='confirm-settlement-decision'>Choose New Parent on Map</button></footer>
        </section>
      </div>`;
    }
    const preview = decision.kind === 'downgrade'
      ? namespace.settlementLifecycle.downgradePreview(state, city.id)
      : namespace.settlementLifecycle.advancementPreview(state, city.id);
    const profile = preview.profile;
    if (!profile) return '';
    const isDowngrade = decision.kind === 'downgrade';
    const materials = Object.entries(profile.materials || {}).map(([resourceId, required]) => {
      const item = namespace.storageLedger.storageItemById[resourceId];
      const available = Number(state.storage.available[resourceId]) || 0;
      const enough = available + 0.000001 >= required;
      return `<div class='construction-detail-material ${enough ? 'enough' : 'short'}'><span>${escapeHtml(item ? item.label : resourceId)}</span><b>${namespace.uiStorage.formatNumber(available)} / ${namespace.uiStorage.formatNumber(required)}</b></div>`;
    }).join('');
    const requirementRows = isDowngrade ? '' : `
      <div><dt>Population</dt><dd class='${preview.populationReady ? 'requirement-ready' : 'requirement-short'}'>${namespace.uiStorage.formatNumber(city.population)} / ${namespace.uiStorage.formatNumber(profile.population)}</dd></div>
      <div><dt>Satisfaction</dt><dd class='${preview.satisfactionReady ? 'requirement-ready' : 'requirement-short'}'>${namespace.uiStorage.formatNumber(preview.currentSatisfaction, 1)} / ${profile.satisfaction}</dd></div>
      ${profile.exactParentDistance ? `<div><dt>Parent Distance</dt><dd class='${preview.distanceReady ? 'requirement-ready' : 'requirement-short'}'>${Number.isFinite(preview.parentDistance) ? preview.parentDistance : 'Unavailable'} / exactly ${profile.exactParentDistance}</dd></div>` : ''}
      <div><dt>Country Control Reservation</dt><dd class='${preview.controlReady ? 'requirement-ready' : 'requirement-short'}'>${namespace.uiStorage.formatNumber(preview.countryReservation, 1)} required / ${namespace.uiStorage.formatNumber(preview.countrySpare, 1)} spare</dd></div>
      <div><dt>Control Interruption</dt><dd>Pauses below 100% reservation coverage; resumes when restored unless manually paused</dd></div>`;
    const development = preview.development || {};
    return `<div class='critical-alert-backdrop construction-details-backdrop'>
      <section class='construction-details-modal' role='dialog' aria-modal='true' aria-labelledby='settlement-decision-title'>
        <header><div>${icon(isDowngrade ? 'arrow-down' : 'landmark')}<span><small>Settlement Decision</small><h2 id='settlement-decision-title'>${escapeHtml(profile.label)}</h2></span></div><button type='button' data-action='close-settlement-decision' aria-label='Close'>${icon('x')}</button></header>
        <div class='construction-details-body'>
          <dl class='admin-facts'><div><dt>Settlement</dt><dd>${escapeHtml(city.name)}</dd></div><div><dt>Tier</dt><dd>${escapeHtml(profile.fromTier)} &rarr; ${escapeHtml(profile.toTier)}</dd></div><div><dt>Duration</dt><dd>${profile.durationDays} Days</dd></div>${isDowngrade ? `<div><dt>Refund</dt><dd>None</dd></div><div><dt>Tier During Project</dt><dd>Current tier remains active</dd></div><div><dt>Satisfaction Penalty</dt><dd>${profile.satisfactionPenalty} for ${profile.penaltyDays} days</dd></div>` : `<div><dt>Construction Effort</dt><dd>${profile.effortPercent}%</dd></div>`}${requirementRows}<div><dt>Projected Development</dt><dd>${namespace.uiStorage.formatNumber(development.used || 0, 1)} / ${namespace.uiStorage.formatNumber(development.projectedTotal || 0, 1)}</dd></div><div><dt>Disabled Excess Levels</dt><dd>${(development.disabled || []).length ? escapeHtml(development.disabled.join(', ')) : 'None'}</dd></div></dl>
          ${materials ? `<section><h3>Materials: Available / Required</h3><div class='construction-detail-materials'>${materials}</div></section>` : ''}
          <p class='${preview.allowed ? 'construction-ready' : 'construction-blocker'}'>${escapeHtml(preview.reason)}</p>
        </div>
        <footer><button type='button' data-action='close-settlement-decision'>Back</button><button type='button' class='primary-action' data-action='confirm-settlement-decision' ${preview.allowed ? '' : 'disabled'}>${isDowngrade ? 'Confirm Downgrade' : 'Confirm Advancement'}</button></footer>
      </section>
    </div>`;
  }


  function criticalAlertModal(state) {
    const modalId = ensureUiState(state).criticalAlertModalId;
    const alert = modalId ? namespace.dailyEconomy.alertById(state, modalId) : null;
    if (!alert || alert.type !== 'food-shortage') return '';
    return `
      <div class='critical-alert-backdrop' data-critical-alert-modal>
        <section class='critical-alert-modal' role='alertdialog' aria-modal='true' aria-labelledby='critical-alert-title'>
          <header>
            ${icon('triangle-alert')}
            <div><small>Realm Emergency</small><h2 id='critical-alert-title'>${escapeHtml(alert.title)}</h2></div>
            <button type='button' data-action='close-shortage-alert' aria-label='Close warning'>${icon('x')}</button>
          </header>
          <p>${escapeHtml(alert.message)}</p>
          <div class='shortage-detail-list'>
            ${alert.details.map((detail) => `
              <div><strong>${escapeHtml(detail.label)}</strong><span>Required ${Number(detail.required).toFixed(2)}</span><span>Available ${Number(detail.available).toFixed(2)}</span><b>Missing ${Number(detail.missing).toFixed(2)}</b></div>
            `).join('')}
          </div>
          <p class='critical-alert-note'>Time remains paused after this warning is closed.</p>
        </section>
      </div>
    `;
  }

  function seasonalReportModal(state) {
    const modalId = ensureUiState(state).seasonalReportModalId;
    const alert = modalId ? namespace.dailyEconomy.alertById(state, modalId) : null;
    if (!alert || alert.type !== 'annual-report' || !alert.report) return '';
    const report = alert.report;
    const body = namespace.flowEconomy.FLOW_GROUPS.map((group) => {
      const rows = report.rows.filter((row) => row.groupId === group.id).sort((a, b) => Number(a.net >= 0) - Number(b.net >= 0) || a.net - b.net || a.label.localeCompare(b.label));
      const rowHtml = rows.length ? rows.map((row) => {
        const breakdown = (row.contributors.length
          ? row.contributors.map((entry) => entry.label + ': ' + namespace.uiStorage.signedNumber(entry.amount, 4))
          : ['No changes.'])
          .concat(['Final: ' + namespace.uiStorage.signedNumber(row.net, 4)])
          .join('\n');
        return '<tr><th>' + escapeHtml(row.label) + '</th>'
          + '<td>' + namespace.uiStorage.formatNumber(row.starting, 4) + '</td>'
          + '<td>' + namespace.uiStorage.formatNumber(row.production, 4) + '</td>'
          + '<td>' + namespace.uiStorage.formatNumber(row.consumption, 4) + '</td>'
          + '<td>' + namespace.uiStorage.formatNumber(row.spoilage, 4) + '</td>'
          + '<td>' + namespace.uiStorage.formatNumber(row.constructionOther, 4) + '</td>'
          + '<td><span class="inventory-net ' + namespace.uiStorage.flowClass(row.net) + '" '
          + namespace.uiProvince.tooltipAttributes('Net Breakdown', breakdown) + '>'
          + namespace.uiStorage.signedNumber(row.net, 4) + '</span></td>'
          + '<td>' + namespace.uiStorage.formatNumber(row.ending, 4) + '</td>'
          + '<td><b class="report-status ' + namespace.uiStorage.flowClass(row.net) + '">' + escapeHtml(row.status) + '</b></td></tr>';
      }).join('') : '<tr><td colspan="9">No items are defined in this category yet.</td></tr>';
      return '<tr class="storage-category-row"><th colspan="9">' + escapeHtml(group.label) + '</th></tr>' + rowHtml;
    }).join('');

    return '<div class="critical-alert-backdrop seasonal-report-backdrop">'
      + '<section class="seasonal-report-modal" role="dialog" aria-modal="true" aria-labelledby="seasonal-report-title">'
      + '<header><div>' + icon('chart-column') + '<span><small>Year ' + report.year + '</small><h2 id="seasonal-report-title">' + escapeHtml(report.title) + '</h2></span></div>'
      + '<button type="button" data-action="close-season-report" aria-label="Close production report">' + icon('x') + '</button></header>'
      + '<div class="seasonal-report-table-wrap"><table class="seasonal-report-table">'
      + '<thead><tr><th>Item</th><th>Starting</th><th>Production</th><th>Consumption</th><th>Spoilage</th><th>Construction / Other</th><th>Net</th><th>Ending</th><th>Result</th></tr></thead>'
      + '<tbody>' + body + '</tbody></table></div>'
      + '<footer><p>Time runs at 1x while this report is open. Closing restores your previous speed.</p><button type="button" data-action="close-season-report">Close</button></footer>'
      + '</section></div>';
  }
  function workforcePriorityPanel(state) {
    const ui = ensureUiState(state);
    const priority = namespace.workforcePriority.ensureState(state);
    const rows = namespace.workforcePriority.summaries(state);
    const query = String(ui.workforcePriorityFilter || '').trim().toLowerCase();
    const totals = rows.reduce((result, row) => ({
      requested: result.requested + row.requested,
      actual: result.actual + row.actual,
      shortage: result.shortage + row.shortage
    }), { requested: 0, actual: 0, shortage: 0 });
    const pending = Boolean(priority.pendingOrder);
    return `
      ${statBand([
        { label: 'Requested', value: namespace.uiStorage.formatNumber(totals.requested, 1) },
        { label: 'Actual', value: namespace.uiStorage.formatNumber(totals.actual, 1) },
        { label: 'Shortage', value: namespace.uiStorage.formatNumber(totals.shortage, 1) },
        { label: 'Priority Types', value: rows.length }
      ])}
      <section class='admin-section workforce-priority-panel'>
        <div class='admin-section-heading'>
          <div><h3>Realm Workforce Priority</h3><p>Drag building types from highest to lowest priority.</p></div>
          <button type='button' data-action='reset-workforce-priority'>Reset Recommended</button>
        </div>
        ${pending ? `<div class='priority-pending-banner'>${icon('clock-3')}<span><strong>Pending Order</strong><small>Applies on the next daily tick.</small></span></div>` : ''}
        <label class='priority-search'>
          ${icon('search')}
          <input type='search' value='${escapeAttribute(ui.workforcePriorityFilter || '')}' data-action='filter-workforce-priority' placeholder='Filter building types' />
          <button type='button' data-action='clear-workforce-priority-filter' aria-label='Clear filter'>${icon('x')}</button>
        </label>
        <div class='workforce-priority-head' aria-hidden='true'>
          <span>Priority / Type</span><span>Requested</span><span>Actual</span><span>Shortage</span><span>Settlements</span>
        </div>
        <ol class='workforce-priority-list' data-workforce-priority-list>
          ${rows.map((row, index) => {
            const matches = !query || row.label.toLowerCase().includes(query);
            return `<li draggable='true' data-workforce-priority-id='${escapeAttribute(row.id)}' data-search-text='${escapeAttribute(row.label.toLowerCase())}' ${matches ? '' : 'hidden'}>
              <div class='priority-type'>
                <span class='priority-drag-handle' title='Drag to reorder'>${icon('grip-vertical')}</span>
                <b>${index + 1}</b>
                <span><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.kind)}</small></span>
                <span class='priority-move-buttons'>
                  <button type='button' data-action='move-workforce-priority' data-delta='-1' aria-label='Move ${escapeAttribute(row.label)} up'>${icon('chevron-up')}</button>
                  <button type='button' data-action='move-workforce-priority' data-delta='1' aria-label='Move ${escapeAttribute(row.label)} down'>${icon('chevron-down')}</button>
                </span>
              </div>
              <span>${namespace.uiStorage.formatNumber(row.requested, 1)}</span>
              <span>${namespace.uiStorage.formatNumber(row.actual, 1)}</span>
              <span class='${row.shortage > 0 ? 'priority-shortage' : ''}'>${namespace.uiStorage.formatNumber(row.shortage, 1)}</span>
              <span>${row.affectedSettlements}</span>
            </li>`;
          }).join('')}
        </ol>
      </section>`;
  }
  function settingsPanel(state) {
    const ui = ensureUiState(state);
    return `
      <section class='admin-section'>
        <div class='admin-section-heading'><h3>Interface Layout</h3></div>
        <div class='settings-command-list'>
          <button type='button' data-action='reset-map-view'>${icon('scan')}<span><strong>Reset Map View</strong><small>Return to 100% zoom.</small></span></button>
          <button type='button' data-action='reset-interface-layout'>${icon('panel-left')}<span><strong>Reset Interface Layout</strong><small>Restore the province window and menu.</small></span></button>
        </div>
        <dl class='admin-facts'>
          <div><dt>Main Menu</dt><dd>${ui.sidebarPinned ? 'Pinned' : 'Hover'}</dd></div>
          <div><dt>Province Window</dt><dd>${ui.provincePopoverPosition && ui.provincePopoverPosition.mode === 'manual' ? 'Custom Position' : 'Centered'}</dd></div>
        </dl>
      </section>
    `;
  }

  function mainPanel(state) {
    const panelId = ensureUiState(state).activeMainPanel;
    if (!panelId) return '';
    const workforce = realmWorkforce(state);
    const tab = activePanelTab(state, panelId);
    const placeholder = (title, copy) => simplePanel(title, 'Foundation', copy);
    const workforceRows = namespace.workforcePriority.summaries(state);
    const workforceTotals = workforceRows.reduce((result, row) => ({
      requested: result.requested + row.requested,
      assigned: result.assigned + row.actual,
      shortage: result.shortage + row.shortage
    }), { requested: 0, assigned: 0, shortage: 0 });
    const transferOrders = namespace.outpostLifecycle.ensureState(state).settlerOrders
      .filter((order) => order.kind === 'internal-transfer' && ['departure-pending', 'in-transit'].includes(order.status));
    const transferDraft = ensureUiState(state).internalTransferDraft;
    const transferDraftHtml = (() => {
      if (!transferDraft) return '';
      const source = namespace.outpostLifecycle.settlementById(state, transferDraft.sourceId);
      const destination = namespace.outpostLifecycle.settlementById(state, transferDraft.destinationId);
      if (!source || !destination) return '';
      const availability = namespace.outpostLifecycle.internalTransferAvailability(source);
      const amount = Math.min(Math.max(1, Number(transferDraft.amount) || 50), Math.max(1, availability.maxTransferable));
      const preview = namespace.outpostLifecycle.internalTransferPreview(state, source.id, destination.id, amount);
      return `<section class='admin-section transfer-review'>
        <div class='admin-section-heading'><div><h3>Review Settler Transfer</h3><p>${escapeHtml(source.name)} &rarr; ${escapeHtml(destination.name)}</p></div><button type='button' data-action='cancel-internal-transfer-draft'>Cancel</button></div>
        <label>Settlers <input type='number' min='1' max='${availability.maxTransferable}' step='1' value='${amount}' data-internal-transfer-draft-amount></label>
        <dl class='admin-facts'><div><dt>Workforce / Non-workforce</dt><dd>${namespace.uiStorage.formatNumber(preview.workforceAmount, 1)} / ${namespace.uiStorage.formatNumber(preview.nonWorkforceAmount, 1)}</dd></div><div><dt>Travel</dt><dd>${preview.durationDays} Days</dd></div><div><dt>Maximum Transferable</dt><dd>${availability.maxTransferable}</dd></div><div><dt>Housing After Arrival</dt><dd>${namespace.uiStorage.formatNumber(preview.destinationPopulationAfter)} / ${namespace.uiStorage.formatNumber(preview.destinationHousingCapacity)}</dd></div></dl>
        <button type='button' class='primary-action' data-action='confirm-internal-transfer' ${preview.allowed ? '' : 'disabled'}>Confirm Transfer</button>
        <p class='${preview.allowed ? 'profile-note' : 'worker-shortage'}'>${escapeHtml(preview.reason)}</p>
      </section>`;
    })();
    const inTransitHtml = transferOrders.length
      ? `<div class='compact-transit-list'>${transferOrders.map((order) => {
        const source = namespace.outpostLifecycle.settlementById(state, order.sourceId);
        const destination = namespace.outpostLifecycle.settlementById(state, order.destinationId);
        return `<div><strong>${escapeHtml(source ? source.name : 'Source')} &rarr; ${escapeHtml(destination ? destination.name : 'Destination')}</strong><span>${order.amount} Settlers</span><span>Outgoing -${order.amount}</span><span>Incoming +${order.amount}</span><span>Projected ${namespace.uiStorage.formatNumber((destination && destination.population || 0) + order.amount)}</span></div>`;
      }).join('')}</div>`
      : "<p class='empty-state-copy'>No population is currently in transit.</p>";
    const demographicSummary = namespace.health.realmSummary(state);
    const peopleOverview = () => statBand([
      { label: 'Population', value: realmPopulation(state) },
      { label: 'Births Today', value: demographicSummary.daily.births },
      { label: 'Deaths Today', value: demographicSummary.daily.deaths },
      { label: 'Net Migration', value: (demographicSummary.daily.migration >= 0 ? '+' : '') + demographicSummary.daily.migration },
      { label: 'Available Workforce', value: namespace.uiStorage.formatNumber(workforce.available, 1) },
      { label: 'Required Workforce', value: namespace.uiStorage.formatNumber(workforceTotals.requested, 1) },
      { label: 'Assigned Workforce', value: namespace.uiStorage.formatNumber(workforceTotals.assigned, 1) },
      { label: 'Worker Shortage', value: namespace.uiStorage.formatNumber(workforceTotals.shortage, 1), className: workforceTotals.shortage > 0 ? 'worker-shortage' : '' }
    ]) + "<section class='admin-section'><div class='admin-section-heading'><h3>Population By Settlement</h3><button type='button' class='primary-action' data-action='begin-internal-transfer'>Transfer Settlers</button></div>"
      + cityRows(state) + '</section>' + transferDraftHtml
      + "<section class='admin-section'><div class='admin-section-heading'><h3>In-Transit Population</h3><span>" + transferOrders.length + " Active</span></div>" + inTransitHtml + '</section>';
    const bodies = {
      realm: () => realmOverview(state),
      administration: () => namespace.uiRealmBranches.administrationPanel(state, tab),
      people: () => tab === 'overview'
        ? peopleOverview()
        : namespace.uiRealmBranches.peoplePanel(state, tab),
      settlements: () => namespace.uiRealmSettlements.settlementsPanel(state, tab),
      expansion: () => namespace.uiRealmSettlements.expansionPanel(state, tab),
      production: () => ['overview', 'resource-sites', 'processing'].includes(tab)
        ? namespace.uiRealmProduction.productionPanel(state, tab)
        : workforcePriorityPanel(state),
      construction: () => constructionPanel(state),
      inventory: () => namespace.uiStorage.storagePanel(state, tab),
      military: () => tab === 'forces'
        ? namespace.uiManufacturing.categoryPanel(state, 'military', ensureUiState(state).constructionBuildMode)
        : namespace.uiRealmBranches.peoplePanel(state, 'security'),
      alerts: () => alertsPanel(state)
    };
    const body = bodies[panelId] ? bodies[panelId]() : realmOverview(state);
    return panelShell(panelId, panelTabsBar(state, panelId) + body);
  }

  function activityRail(state) {
    const transfers = namespace.outpostLifecycle.ensureState(state).settlerOrders
      .filter((order) => order.kind === 'internal-transfer' && ['departure-pending', 'in-transit'].includes(order.status));
    const projectGroups = (state.map.regions || []).map((region) => ({
      region,
      projects: namespace.constructionQueue.orderedProjects(region)
    })).filter((group) => group.projects.length);
    const transferRows = transfers.length ? transfers.map((order) => {
      const source = namespace.outpostLifecycle.settlementById(state, order.sourceId);
      const destination = namespace.outpostLifecycle.settlementById(state, order.destinationId);
      const completed = Math.max(0, order.durationDays - order.remainingDays);
      const percent = order.durationDays > 0 ? Math.min(100, completed / order.durationDays * 100) : 100;
      return `<div class='activity-row'><span><strong>${escapeHtml(source ? source.name : 'Source')} &rarr; ${escapeHtml(destination ? destination.name : 'Destination')}</strong><small>${order.amount} Settlers</small></span><span class='activity-progress' title='${order.remainingDays} / ${order.durationDays} Days'><i style='width:${percent}%'></i></span></div>`;
    }).join('') : "<p class='activity-empty'>No Population In Transit</p>";
    const projectRows = projectGroups.length ? projectGroups.map(({ region, projects }) => `
      <div class='activity-province'><strong>${escapeHtml(region.name)}</strong>${projects.map((project) => {
        const remaining = Math.max(0, project.durationDays - project.progressDays);
        const percent = project.durationDays > 0 ? Math.min(100, project.progressDays / project.durationDays * 100) : 100;
        return `<div class='activity-row'><span><small>${escapeHtml(project.label)}</small></span><span class='activity-progress' title='${remaining} / ${project.durationDays} Days'><i style='width:${percent}%'></i></span></div>`;
      }).join('')}</div>`).join('') : "<p class='activity-empty'>Nothing Under Construction</p>";
    return `<aside class='activity-rail'>
      <section class='activity-panel'><button type='button' class='activity-panel-heading' data-action='open-main-panel' data-panel='people'><strong>In-Transit Population</strong><span>${transfers.length}</span></button>${transferRows}</section>
      <section class='activity-panel'><button type='button' class='activity-panel-heading' data-action='open-construction-projects'><strong>Construction Queue</strong><span>${projectGroups.reduce((sum, group) => sum + group.projects.length, 0)}</span></button>${projectRows}</section>
    </aside>`;
  }

  function toastLayer(state) {
    const toasts = ensureUiState(state).toasts || [];
    return `<div class='toast-layer' aria-live='polite'>${toasts.map((toast) => `
      <div class='game-toast ${escapeAttribute(toast.type || 'success')}' data-toast-id='${escapeAttribute(toast.id)}'>
        ${icon(toast.type === 'error' ? 'circle-alert' : 'circle-check')}<span>${escapeHtml(toast.message)}</span>
      </div>
    `).join('')}</div>`;
  }

  namespace.uiNavigation = Object.freeze({
    icon,
    menuSections,
    utilityItems,
    topHud,
    mainNavigation,
    mainPanel,
    productionPanel,
    activityRail,
    toastLayer,
    constructionDetailsModal,
    settlementDecisionModal,
    criticalAlertModal,
    seasonalReportModal,
    queueProjectRows
  });
})(window.EcoRuler = window.EcoRuler || {});
