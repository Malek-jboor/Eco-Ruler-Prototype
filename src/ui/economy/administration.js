(function initializeAdministrationUi(namespace) {
  const { escapeHtml, escapeAttribute } = namespace.uiCore;

  function icon(name) {
    return `<i data-lucide='${escapeAttribute(name)}' aria-hidden='true'></i>`;
  }

  function number(value, digits = 1) {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function percent(value) {
    return `${number(Math.max(0, Math.min(1, Number(value) || 0)) * 100, 1)}%`;
  }

  function stats(items) {
    return `<dl class='admin-stat-band'>${items.map((item) => (
      `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(String(item.value))}</dd></div>`
    )).join('')}</dl>`;
  }

  function outputLabel(definition, level = 1) {
    const maximum = (definition.baseOutput + definition.bookBonus) * level;
    const base = definition.baseOutput * level;
    return definition.bookBonus
      ? `${base} base / ${maximum} with Books ${definition.controlType === 'country' ? 'Country' : 'Local'} Control`
      : `${base} ${definition.controlType === 'country' ? 'Country' : 'Local'} Control`;
  }

  function constructionCards(state, mode) {
    return namespace.administrationData.officeList.map((definition) => {
      const active = mode && mode.kind === 'administrative-building' && mode.buildingId === definition.id;
      return `<button type='button' class='build-card ${active ? 'active' : ''}'
        data-action='select-build-type' data-kind='administrative-building'
        data-building-id='${escapeAttribute(definition.id)}' data-label='${escapeAttribute(definition.label)}'
        data-search-text='${escapeAttribute(`${definition.label} Administration Control`)}'>
        ${icon('landmark')}<span><strong>${escapeHtml(definition.label)}</strong><small>
        ${definition.workers} workers | Dev ${number(definition.construction.footprint, 1)} | ${escapeHtml(outputLabel(definition))}
        </small></span></button>`;
    }).join('');
  }

  function projectProgress(state, city, definition) {
    const projects = namespace.administration.officeProjects(
      namespace.administration.settlementRegion(state, city), city.id, definition.id
    );
    if (!projects.length) return '';
    return `<div class='processing-project-list'>${projects.map((project) => {
      const progress = project.status === 'waiting' ? 0 : Math.max(0, Math.min(100, project.progressDays / project.durationDays * 100));
      return `<div class='processing-project'><div><strong>Level ${project.targetLevel}</strong><span>
        ${escapeHtml(project.status)} | ${number(project.progressDays, 1)} / ${number(project.durationDays, 1)} Days
        </span></div><span class='site-progress-track'><i style='width:${progress}%'></i></span></div>`;
    }).join('')}</div>`;
  }

  function officeCard(state, city, definition, showUnbuilt = false, compact = false) {
    const building = namespace.administration.officeById(city, definition.id);
    const projects = namespace.administration.officeProjects(
      namespace.administration.settlementRegion(state, city), city.id, definition.id
    );
    if (!showUnbuilt && !building && !projects.length) return '';
    const region = namespace.administration.settlementRegion(state, city);
    const availability = namespace.administration.buildAvailability(state, region.id, definition.id);
    const reduction = namespace.administration.reducePreview(state, city.id, definition.id);
    const level = building ? building.level : 0;
    const active = building ? namespace.administration.activeLevels(building) : 0;
    const required = building ? namespace.administration.requiredWorkers(state, building) : 0;
    const cap = building
      ? (Number.isFinite(building.pendingWorkerCap) ? building.pendingWorkerCap : building.workerCap)
      : 0;
    const last = building && building.lastAdministration;
    const maintenance = building
      ? (building.pendingMaintenancePriority || building.maintenancePriority || 'normal')
      : 'normal';
    const buildTooltip = namespace.uiProvince.materialTooltipAttributes(state, definition.label,
      [availability.reason, 'Required / Available materials are listed below.'].filter(Boolean).join('\n'),
      availability.preview ? availability.preview.materials : {});
    const maintenanceControl = building ? `<label class='admin-office-setting'>Maintenance
      <select data-action='set-admin-maintenance' data-city-id='${escapeAttribute(city.id)}'
        data-building-id='${escapeAttribute(definition.id)}'>
        ${namespace.developmentData.priorities.map((value) => `<option value='${value}'${maintenance === value ? ' selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>`).join('')}
      </select></label>` : '';
    const workerControl = building ? `<label class='admin-office-setting'>Worker Limit
      <input type='number' min='0' max='${required}' step='1' value='${cap}'
        data-action='set-admin-worker-cap' data-city-id='${escapeAttribute(city.id)}'
        data-building-id='${escapeAttribute(definition.id)}'></label>` : '';
    if (compact) {
      const actualWorkers = building ? Number(building.actualWorkers) || 0 : 0;
      const shortage = Math.max(0, cap - actualWorkers);
      const maximumOutput = (definition.baseOutput + definition.bookBonus) * active;
      const actualOutput = last ? Number(last.output) || 0 : 0;
      const productivity = maximumOutput > 0 ? Math.max(0, Math.min(100, actualOutput / maximumOutput * 100)) : 0;
      return `<article class='settlement-building-card administrative-office-card compact-building-row building-list-row ${building || projects.length ? 'built' : 'available'}'><header><span><small>${escapeHtml(definition.controlType === 'country' ? 'Country Administration' : 'Local Administration')}</small><strong>${escapeHtml(definition.label)}</strong></span><span>Level ${level}${projects.length ? ` / ${level + projects.length}` : ''} | ${escapeHtml(building ? building.status : (projects.length ? 'Construction Queued' : 'Eligible'))}</span>${icon('landmark')}</header>${building ? `<dl class='building-row-facts'><div><dt>Productivity</dt><dd>${number(productivity, 1)}%</dd></div><div><dt>Workers</dt><dd>${number(actualWorkers, 1)} / ${required}</dd></div><div class='${shortage > 0 ? 'worker-shortage' : ''}'><dt>Shortage</dt><dd>${number(shortage, 1)}</dd></div><div><dt>Output</dt><dd>${number(actualOutput, 1)} / ${number(maximumOutput, 1)} Control</dd></div></dl><label class='compact-worker-slider building-row-worker'><span>Worker Cap <b>${cap} / ${required}</b></span><span class='worker-coverage-track'><i style='width:${required ? actualWorkers / required * 100 : 0}%'></i><b style='left:${required ? actualWorkers / required * 100 : 0}%;width:${required ? shortage / required * 100 : 0}%'></b></span><input type='range' min='0' max='${required}' step='1' value='${cap}' data-action='quick-admin-worker-cap' data-city-id='${escapeAttribute(city.id)}' data-building-id='${escapeAttribute(definition.id)}'></label>` : `<p class='building-eligibility-copy'>Eligible administrative office. Open details for construction requirements.</p>`}${projectProgress(state, city, definition)}<div class='resource-card-actions'><button type='button' data-action='set-province-tab' data-tab='administration'>Open Details</button><button type='button' class='primary-action' data-action='queue-administrative-building' data-region-id='${escapeAttribute(region.id)}' data-building-id='${escapeAttribute(definition.id)}' ${buildTooltip} ${availability.allowed ? '' : 'disabled'}>${availability.allowed ? icon('plus') : icon('lock-keyhole')}${level || projects.length ? 'Expand' : 'Build'}</button><button type='button' data-action='reduce-administrative-building' data-city-id='${escapeAttribute(city.id)}' data-building-id='${escapeAttribute(definition.id)}' ${reduction.allowed ? '' : 'disabled'}>${icon('minus')}${building && building.level === 1 ? 'Remove Building' : 'Reduce'}</button></div></article>`;
    }    return `<article class='settlement-building-card administrative-office-card'>
      <header><span><small>${escapeHtml(definition.controlType === 'country' ? 'Country Administration' : 'Local Administration')}</small>
      <strong>${escapeHtml(definition.label)}</strong></span>${icon('landmark')}</header>
      <dl>
        <div><dt>Level</dt><dd>${level}${projects.length ? ` / ${level + projects.length}` : ''}</dd></div>
        <div><dt>Active</dt><dd>${active}</dd></div>
        <div><dt>Workers</dt><dd>${building ? number(building.actualWorkers, 1) : '0.0'} / ${required}</dd></div>
        <div><dt>Dev Capacity</dt><dd>${number(definition.construction.footprint, 1)} per level | ${number(level * definition.construction.footprint, 1)} total</dd></div>
        <div class='wide'><dt>Output</dt><dd>${last ? `${number(last.output, 1)} ${definition.controlType === 'country' ? 'Country' : 'Local'} Control` : escapeHtml(outputLabel(definition, active || 1))}</dd></div>
        <div class='wide'><dt>Daily Inputs</dt><dd>${Object.entries(definition.inputs).map(([id, amount]) => `${amount} ${id === 'paper' ? 'Paper' : 'Books'}`).join(' + ')}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(building ? building.status : (projects.length ? 'Construction Queued' : 'Not Built'))}</dd></div>
      </dl>
      <div class='admin-office-controls'>${workerControl}${maintenanceControl}</div>
      ${projectProgress(state, city, definition)}
      <div class='resource-card-actions'>
        <button type='button' class='primary-action' data-action='queue-administrative-building'
          data-region-id='${escapeAttribute(region.id)}' data-building-id='${escapeAttribute(definition.id)}'
          ${buildTooltip}
          ${availability.allowed ? '' : 'disabled'}>${availability.allowed ? icon('plus') : icon('lock-keyhole')}${level || projects.length ? 'Expand' : 'Build'}</button>
        <button type='button' data-action='reduce-administrative-building'
          data-city-id='${escapeAttribute(city.id)}' data-building-id='${escapeAttribute(definition.id)}'
          ${reduction.allowed ? '' : 'disabled'}>${icon('minus')}Reduce</button>
      </div>
    </article>`;
  }

  function settlementSection(state, city, showUnbuilt = false, compact = false) {
    if (!city || city.settlementKind === 'village' || city.settlementIdentity === 'village') return '';
    const cards = namespace.administrationData.officeList
      .filter((definition) => namespace.administration.locationAvailability(city, definition).allowed)
      .map((definition) => officeCard(state, city, definition, showUnbuilt, compact))
      .filter(Boolean);
    return `<section class='settlement-building-section administrative-offices-section'>
      <div class='province-section-title'><h3>Administrative Offices</h3><span>${cards.length} ${showUnbuilt ? 'Available' : 'Active or Queued'}</span></div>
      ${cards.length ? `<div class='settlement-building-grid'>${cards.join('')}</div>` : `<p class='empty-state-copy'>No Administrative Offices built or queued.</p>`}
    </section>`;
  }

  function countryPanel(state) {
    const administration = namespace.administration.reconcile(state);
    const country = administration.country;
    const branches = Object.values(country.branches);
    return `${stats([
      { label: 'Country Capacity', value: number(country.capacity, 1) },
      { label: 'Conversion Reservations', value: number(country.reserved, 1) },
      { label: 'Saved Requests', value: number(country.requested, 1) },
      { label: 'Effective Allocation', value: number(country.allocated, 1) },
      { label: 'Spare', value: number(country.spare, 1) }
    ])}
    <section class='admin-section'>
      <div class='admin-section-heading'><div><h3>Country Control Allocation</h3><p>Requests use whole points. Production shortages scale every saved request proportionally.</p></div>
      <span>${country.founderActive ? 'Founder Capacity Active' : 'Produced Capacity'}</span></div>
      ${branches.length ? `<div class='control-branch-list'>${branches.map((row) => {
        const center = namespace.administration.cityById(state, row.centerId);
        const demand = row.demand;
        return `<article class='control-branch-card'>
          <header><div><strong>${escapeHtml(center.name)}</strong><small>${escapeHtml((center.settlementTier || center.level || 'town').toUpperCase())} | Distance ${Number.isFinite(demand.provinceDistance) ? demand.provinceDistance : 'N/A'}</small></div>
          <b class='control-coverage ${row.coverage < 1 ? 'short' : ''}'>${percent(row.coverage)}</b></header>
          <dl><div><dt>Demand</dt><dd>${demand.total}</dd></div><div><dt>Effective</dt><dd>${number(row.allocation, 1)}</dd></div>
          <div><dt>Tier</dt><dd>${demand.tier}</dd></div><div><dt>Distance</dt><dd>${demand.distance}</dd></div>
          <div><dt>Population</dt><dd>${demand.population}</dd></div><div><dt>Coordination</dt><dd>${demand.coordination}</dd></div></dl>
          <div class='country-request-control'><label>Saved Request
            <input type='number' min='0' max='${demand.total}' step='1' value='${row.requested}' data-country-control-input data-center-id='${escapeAttribute(center.id)}'>
          </label><button type='button' data-action='apply-country-control' data-center-id='${escapeAttribute(center.id)}'>Apply</button></div>
        </article>`;
      }).join('')}</div>` : `<p class='empty-state-copy'>No secondary Town or City branches require Country Control.</p>`}
    </section>`;
  }

  function localPanel(state) {
    const administration = namespace.administration.reconcile(state);
    const centers = Object.values(administration.localByCenter);
    const totalCapacity = centers.reduce((sum, row) => sum + row.capacity, 0);
    const totalDemand = centers.reduce((sum, row) => sum + row.demand, 0);
    return `${stats([
      { label: 'Local Capacity', value: number(totalCapacity, 1) },
      { label: 'Village Demand', value: number(totalDemand, 1) },
      { label: 'Attached Villages', value: centers.reduce((sum, row) => sum + Object.keys(row.villages).length, 0) },
      { label: 'Allocation', value: 'Automatic Equal Coverage' }
    ])}
    <section class='admin-section'>
      <div class='admin-section-heading'><div><h3>Local Control By Parent Center</h3><p>Each center automatically gives equal coverage to all attached Villages.</p></div></div>
      <div class='control-branch-list'>${centers.map((row) => {
        const center = namespace.administration.cityById(state, row.centerId);
        const villages = Object.values(row.villages);
        return `<article class='control-branch-card'><header><div><strong>${escapeHtml(center.name)}</strong><small>${villages.length} attached Villages</small></div>
          <b class='control-coverage ${row.coverage < 1 ? 'short' : ''}'>${percent(row.coverage)}</b></header>
          <dl><div><dt>Capacity</dt><dd>${number(row.capacity, 1)}</dd></div><div><dt>Demand</dt><dd>${number(row.demand, 1)}</dd></div>
          <div><dt>Reserved</dt><dd>${number(row.reserved, 1)}</dd></div><div><dt>Spare</dt><dd>${number(row.spare, 1)}</dd></div></dl>
          ${row.founderActive ? `<p class='founder-control-note'>Founder Local Capacity is active until real production first reaches 150.</p>` : ''}
          ${villages.length ? `<div class='control-village-list'>${villages.map((villageRow) => {
            const village = namespace.administration.cityById(state, villageRow.villageId);
            return `<span><strong>${escapeHtml(village.name)}</strong><small>${escapeHtml(villageRow.demand.specialtyId || 'No Specialty')} | Distance ${villageRow.demand.distance} | Demand ${villageRow.demand.total}</small><b>${percent(villageRow.coverage)}</b></span>`;
          }).join('')}</div>` : `<p class='empty-state-copy'>No attached Villages.</p>`}
        </article>`;
      }).join('')}</div>
    </section>`;
  }

  function officesPanel(state) {
    const cities = (state.player.cities || []).filter(namespace.settlementHierarchy.isTownCenter);
    return `${stats([
      { label: 'Office Types', value: namespace.administrationData.officeList.length },
      { label: 'Completed Levels', value: namespace.administration.allOffices(state).reduce((sum, row) => sum + row.building.level, 0) },
      { label: 'Country Production', value: number(namespace.administration.reconcile(state).country.produced, 1) },
      { label: 'Paper Rule', value: 'Beginning of Day' }
    ])}${cities.map((city) => `<section class='admin-section'><div class='admin-section-heading'><h3>${escapeHtml(city.name)}</h3>
      <button type='button' data-action='focus-province' data-region-id='${escapeAttribute(city.regionId)}'>Open Settlement</button></div>
      ${settlementSection(state, city, true)}</section>`).join('')}`;
  }

  function settlementAdministration(state, city) {
    const administration = namespace.administration.reconcile(state);
    if (city.settlementKind === 'village' || city.settlementIdentity === 'village') {
      const parent = namespace.settlementHierarchy.parentTown(state, city);
      const local = parent && administration.localByCenter[parent.id];
      const country = parent && !parent.isCapital ? administration.country.branches[parent.id] : null;
      return `<div class='settlement-grid'><section class='settlement-card'><h4>Village Control</h4><dl class='province-fact-list'>
        <div><dt>Parent Town</dt><dd>${parent ? escapeHtml(parent.name) : 'None'}</dd></div>
        <div><dt>Local Demand</dt><dd>${number(city.localControlDemand, 1)}</dd></div>
        <div><dt>Local Coverage</dt><dd>${percent(city.localCoverage)}</dd></div>
        <div><dt>Country Coverage</dt><dd>${country ? percent(country.coverage) : 'Not Required'}</dd></div>
        <div><dt>Collected Output</dt><dd>${percent(city.collectionCoverage)}</dd></div>
      </dl></section></div>`;
    }
    const local = administration.localByCenter[city.id];
    const country = city.isCapital ? null : administration.country.branches[city.id];
    return `<div class='settlement-grid'>
      <section class='settlement-card'><h4>Country Control</h4><dl class='province-fact-list'>
        <div><dt>Role</dt><dd>${city.isCapital ? 'Producer / No Demand' : 'Capital Branch'}</dd></div>
        <div><dt>Demand</dt><dd>${country ? country.demand.total : 0}</dd></div>
        <div><dt>Saved Request</dt><dd>${country ? country.requested : 0}</dd></div>
        <div><dt>Coverage</dt><dd>${country ? percent(country.coverage) : '100.0%'}</dd></div>
      </dl></section>
      <section class='settlement-card'><h4>Local Control</h4><dl class='province-fact-list'>
        <div><dt>Capacity</dt><dd>${local ? number(local.capacity, 1) : '0.0'}</dd></div>
        <div><dt>Reserved</dt><dd>${local ? number(local.reserved, 1) : '0.0'}</dd></div>
        <div><dt>Village Demand</dt><dd>${local ? number(local.demand, 1) : '0.0'}</dd></div>
        <div><dt>Coverage</dt><dd>${local ? percent(local.coverage) : '100.0%'}</dd></div>
        <div><dt>Spare</dt><dd>${local ? number(local.spare, 1) : '0.0'}</dd></div>
      </dl></section></div>`;
  }

  function branchesPanel(state) {
    return countryPanel(state) + localPanel(state);
  }

  namespace.uiAdministration = Object.freeze({
    number,
    percent,
    outputLabel,
    constructionCards,
    projectProgress,
    officeCard,
    settlementSection,
    countryPanel,
    localPanel,
    officesPanel,
    settlementAdministration,
    branchesPanel
  });
})(window.EcoRuler = window.EcoRuler || {});
