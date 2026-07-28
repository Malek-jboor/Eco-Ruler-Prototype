(function initializeProvincePanel(namespace) {
  const {
    escapeHtml,
    escapeAttribute,
    terrainById,
    traitById,
    resourceById,
    siteForResource
  } = namespace.uiCore;
  const { ensureUiState, selectedRegion, regionById } = namespace.uiViewport;
  const { outpostForRegion, isRegionRevealed, canManageResourceSites, cityForRegion } = namespace.uiRealm;
  const maxLogEntries = 8;

  function addLog(state, message) {
    state.log = [message, ...state.log].slice(0, maxLogEntries);
  }

  function tooltipAttributes(title, body) {
    return `data-tooltip-title='${escapeAttribute(title)}' data-tooltip-body='${escapeAttribute(body)}'`;
  }

  function tooltipTrigger(label, title, body, className = '') {
    return `<span class='tooltip-trigger ${className}' ${tooltipAttributes(title, body)}>${escapeHtml(label)}</span>`;
  }

  function icon(name) {
    return `<i data-lucide='${escapeAttribute(name)}' aria-hidden='true'></i>`;
  }

  function terrainLegend(terrainTypes) {
    return terrainTypes.map((terrain) => `
      <li class='legend-item'>
        <span class='terrain-swatch' style='background:${terrain.color}'></span>
        <span>${escapeHtml(terrain.label)}</span>
      </li>
    `).join('');
  }

  function categoryRows(categories, resources) {
    return categories.map((category) => {
      const count = resources.filter((resource) => resource.category === category.id).length;
      return `<div><dt>${escapeHtml(category.label)}</dt><dd>${count}</dd></div>`;
    }).join('');
  }

  function resourceCatalog(categories, resources) {
    return categories.map((category) => {
      const items = resources.filter((resource) => resource.category === category.id);
      return `
        <details class='resource-category' open>
          <summary><span>${escapeHtml(category.label)}</span><strong>${items.length}</strong></summary>
          <ul class='resource-list'>
            ${items.map((resource) => `
              <li class='resource-item'>
                <strong>${escapeHtml(resource.label)}</strong>
                <span>${escapeHtml(resource.role)}</span>
              </li>
            `).join('')}
          </ul>
        </details>
      `;
    }).join('');
  }

  function optionsFor(items, selectedId) {
    return items.map((item) => `
      <option value='${item.id}' ${selectedId === item.id ? 'selected' : ''}>${escapeHtml(item.label)}</option>
    `).join('');
  }

  function terrainSummaryRows(state) {
    const total = state.map.summary.totalRegions || 1;
    const landTotal = state.map.summary.landRegions || 1;
    return namespace.data.terrainTypes.map((terrain) => {
      const count = state.map.summary.terrainCounts[terrain.id] || 0;
      const basis = terrain.id === 'ocean' ? total : landTotal;
      return `<div><dt>${escapeHtml(terrain.label)}</dt><dd>${count} / ${Math.round((count / basis) * 100)}%</dd></div>`;
    }).join('');
  }

  function traitSummaryTooltipBody(state) {
    return namespace.resources.naturalTraits
      .map((trait) => `${trait.label}: ${state.map.summary.traitCounts[trait.id] || 0}`)
      .join(' | ');
  }

  function modelSummaryTooltipBody(state) {
    return [
      `Terrain Types: ${state.modelSummary.terrainTypes}`,
      `Resources: ${state.modelSummary.resourceTypes}`,
      `Resource Sites: ${state.modelSummary.resourceSites}`,
      `Natural Traits: ${state.modelSummary.naturalTraits}`,
      `Factories: ${state.modelSummary.factories.length}`
    ].join(' | ');
  }

  function formatNumber(value) {
    const rounded = Math.round((Number(value) || 0) * 2) / 2;
    return rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function formatEfficiency(value) {
    return `${Math.round((Number(value) || 0) * 100)}%`;
  }

  function eligibleResourceCandidates(region) {
    return (region.resourceCandidates || []).filter((candidate) => candidate.available);
  }

  function candidateByResourceId(region, resourceId) {
    return eligibleResourceCandidates(region).find((candidate) => candidate.resourceId === resourceId) || null;
  }

  function candidateDetail(candidate) {
    const resource = resourceById(candidate.resourceId) || { label: candidate.resourceId };
    const site = siteForResource(candidate.resourceId);
    const effects = candidate.activeEffects && candidate.activeEffects.length
      ? candidate.activeEffects.map((effect) => {
        const trait = traitById(effect.traitId);
        return (trait ? trait.label : effect.traitId) + ': +' + formatEfficiency(effect.value);
      })
      : ['No active trait buffs'];
    return [
      'Site: ' + site.label,
      'Resource: ' + resource.label,
      'Natural Potential: Level ' + candidate.naturalPotential,
      'Abundance: ' + (candidate.abundanceLabel || 'Unavailable'),
      'Capacity: ' + candidate.capacityPerLevel + ' ' + candidate.capacityType + ' points per level',
      'Base Geography: ' + formatEfficiency(candidate.baseEfficiency),
      'Trait Buffs: ' + formatEfficiency(candidate.traitBonus),
      ...effects,
      'Final Efficiency: ' + formatEfficiency(candidate.finalEfficiency)
    ].join('\n');
  }

  function traitPills(traits) {
    if (!traits.length) return "<span class='muted-text'>None</span>";
    return traits.map((traitId) => {
      const trait = traitById(traitId);
      const label = trait ? trait.label : traitId;
      return `<span class='trait-pill' ${tooltipAttributes(label, trait ? trait.role : '')}>${escapeHtml(label)}</span>`;
    }).join('');
  }

  function provinceResourceInfoList(region) {
    const available = eligibleResourceCandidates(region);
    if (!available.length) return "<p class='muted-text small-copy'>No eligible resources.</p>";
    return `
      <ul class='province-resource-list info-resource-list'>
        ${available.map((candidate) => {
          const resource = resourceById(candidate.resourceId) || { label: candidate.resourceId };
          return `
            <li class='province-resource-row available' ${tooltipAttributes(resource.label, candidateDetail(candidate))}>
              <strong>${escapeHtml(resource.label)}</strong>
              <span class='resource-potential-values'><b>Level ${candidate.naturalPotential}</b><b>${formatEfficiency(candidate.finalEfficiency)}</b></span>
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }

  function regionRuleNotes(region) {
    const notes = [];
    if (region.isWater) return ['Water province. It blocks settlement and land Resource Sites.'];
    if (region.terrainId === 'desert') notes.push('Desert may carry a River but never receives High Fertility.');
    if (region.terrainId === 'mountains') notes.push('Mountains block High Fertility.');
    if (region.traits.includes('coast')) notes.push('Coast is created by direct adjacency to Ocean provinces.');
    if (region.traits.includes('god-bless')) notes.push('God Bless adds +100% to primary production only.');
    return notes.length ? notes : ['No special rule notes.'];
  }

  function ruleNoteList(region) {
    return `<ul class='rule-note-list'>${regionRuleNotes(region).map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`;
  }

  function provinceInfoPanel(region, terrain, layerText, state) {
    const city = cityForRegion(state, region.id);
    const outpost = outpostForRegion(state, region.id);
    const ownerLabel = region.ownerId === 'player' ? 'Player Realm' : 'Unclaimed';
    const settlementLabel = city ? city.name : (outpost ? outpost.name : 'None');
    return `
      <div class='province-info-grid'>
        <section class='province-section province-info-card'>
          <div class='province-section-title'><h3>Geography</h3><span>${escapeHtml(terrain.label)}</span></div>
          <dl class='province-fact-list'>
            <div><dt>Province</dt><dd>${escapeHtml(region.name)}</dd></div>
            <div><dt>Terrain</dt><dd>${escapeHtml(terrain.label)}</dd></div>
            <div><dt>Map Layer</dt><dd>${escapeHtml(layerText)}</dd></div>
            <div><dt>Position</dt><dd>${Math.round(region.center.x)}, ${Math.round(region.center.y)}</dd></div>
            <div><dt>Approx. Area</dt><dd>${region.isWater ? 'Water' : `${(Math.round(region.areaKm2 / 100) * 100).toLocaleString('en-US')} km2`}</dd></div>
            <div><dt>Resource Capacity</dt><dd>${region.resourceCapacityUsed} / ${region.resourceCapacity}</dd></div>
            <div><dt>Water Capacity</dt><dd>${region.waterCapacityUsed} / ${region.waterCapacity}</dd></div>
            <div><dt>Combined Potential</dt><dd>${region.combinedNaturalPotential}</dd></div>
            <div><dt>Neighbors</dt><dd>${region.neighbors.length}</dd></div>
            <div><dt>Owner</dt><dd>${escapeHtml(ownerLabel)}</dd></div>
            <div><dt>Settlement</dt><dd>${escapeHtml(settlementLabel)}</dd></div>
            <div><dt>Settlement Role</dt><dd>${city ? escapeHtml(city.isCapital ? 'State Capital' : city.settlementIdentity === 'village' ? 'Village' : 'Regional Center') : (outpost ? 'Outpost' : 'None')}</dd></div>
            <div><dt>Settlement Tier</dt><dd>${city ? escapeHtml((city.settlementTier || city.level || 'town').replace(/^./, (letter) => letter.toUpperCase())) : 'None'}</dd></div>
            <div><dt>Resource Sites</dt><dd>${(region.resourceSites || []).length}</dd></div>
            <div><dt>Projects</dt><dd>${namespace.constructionQueue.ensureQueue(region).projects.length}</dd></div>
            <div><dt>Population</dt><dd>${city ? formatNumber(city.population, 0) : (outpost ? 'Outpost' : 'Unsettled')}</dd></div>
          </dl>
        </section>
        <section class='province-section province-info-card'>
          <div class='province-section-title'><h3>Natural Traits</h3><span>${region.traits.length}</span></div>
          <div class='province-traits'>${traitPills(region.traits)}</div>
        </section>
        <section class='province-section province-info-card resource-card'>
          <div class='province-section-title'><h3>Eligible Resources</h3><span>${eligibleResourceCandidates(region).length}</span></div>
          ${provinceResourceInfoList(region)}
        </section>
        <section class='province-section province-info-card'>
          <div class='province-section-title'><h3>Rules</h3><span>${regionRuleNotes(region).length}</span></div>
          ${ruleNoteList(region)}
        </section>
      </div>
    `;
  }

  function resourceSummary(region, state) {
    const city = namespace.workforce.cityForRegion(state, region.id);
    const siteCount = (region.resourceSites || []).length;
    const projectCount = namespace.constructionQueue.ensureQueue(region).projects
      .filter((project) => project.kind === 'resource-site-level').length;
    return `
      <dl class='resource-summary-strip'>
        <div><dt>Resource Capacity</dt><dd>${region.resourceCapacityUsed} / ${region.resourceCapacity}</dd></div>
        <div><dt>Water Capacity</dt><dd>${region.waterCapacityUsed} / ${region.waterCapacity}</dd></div>
        <div><dt>Available Workforce</dt><dd>${city ? formatNumber(city.workforceAvailable, 0) : 0}</dd></div>
        <div><dt>Sites / Projects</dt><dd>${siteCount} / ${projectCount}</dd></div>
      </dl>
    `;
  }

  function siteStatus(region, site) {
    if (site.pendingRemoval) return 'Removal Pending';
    const project = namespace.resourceSites.pendingProjects(region, site.resourceId)[0];
    if (project) return `Level ${project.targetLevel} ${project.status}`;
    return site.status;
  }

  function outputSummary(region, site) {
    const preview = namespace.workforce.outputPreview(region, site);
    if (!preview || !preview.outputs.length) return 'Pending';
    return preview.outputs.map((item) => `${formatNumber(item.annualAmount)} ${item.label}`).join(' + ');
  }

  function materialsText(materials) {
    return Object.entries(materials || {}).map(([resourceId, amount]) => {
      const item = namespace.storageLedger.storageItemById[resourceId];
      return formatNumber(amount, 0) + ' ' + (item ? item.label : resourceId);
    }).join(' | ');
  }

  function constructionMaterialRows(state, preview) {
    return Object.entries((preview && preview.materials) || {}).map(([resourceId, amount]) => {
      const item = namespace.storageLedger.storageItemById[resourceId];
      const available = Number(state.storage.available[resourceId]) || 0;
      return {
        label: item ? item.label : resourceId,
        required: Number(amount) || 0,
        available,
        enough: available >= Number(amount || 0)
      };
    });
  }

  function buildTooltipAttributes(state, availability, actionLabel) {
    const preview = availability.preview;
    const rows = constructionMaterialRows(state, preview);
    const body = [
      availability.reason || '',
      preview ? 'Duration: ' + preview.days + ' Days' : '',
      preview ? 'Target Level: ' + preview.targetLevel : '',
      rows.length ? 'Materials are listed below.' : ''
    ].filter(Boolean).join('\n');
    return tooltipAttributes(actionLabel, body)
      + " data-tooltip-materials='" + escapeAttribute(JSON.stringify(rows)) + "'";
  }

  function materialTooltipAttributes(state, title, body, materials) {
    const rows = constructionMaterialRows(state, { materials: materials || {} });
    return tooltipAttributes(title, body)
      + " data-tooltip-materials='" + escapeAttribute(JSON.stringify(rows)) + "'";
  }

  function reduceTooltipBody(preview) {
    if (!preview) return 'No level can be reduced.';
    return [
      preview.reason || '',
      Number.isFinite(preview.targetLevel) ? 'Result: Level ' + preview.targetLevel : '',
      'Capacity Released: ' + formatNumber(preview.capacityReleased || 0, 0),
      'Worker Capacity Released: ' + formatNumber(preview.workersReleased || 0, 0),
      'Material Refund: 0',
      'Cash Refund: 0'
    ].filter(Boolean).join('\n');
  }

  function projectProgress(region, resourceId) {
    const ordered = namespace.constructionQueue.orderedProjects(region);
    const projects = namespace.resourceSites.pendingProjects(region, resourceId);
    if (!projects.length) return '';
    return '<div class="site-project-list">' + projects.map((project) => {
      const percent = Math.max(0, Math.min(100, (project.progressDays / project.durationDays) * 100));
      const position = ordered.findIndex((item) => item.id === project.id) + 1;
      const label = project.status === 'waiting'
        ? 'Queue Position ' + position
        : project.status === 'paused' ? 'Paused' : 'Active';
      return '<div class="site-project-progress">'
        + '<div><strong>Level ' + project.targetLevel + ' ' + label + '</strong><span>'
        + project.progressDays + ' / ' + project.durationDays + ' Days | ' + Math.round(percent) + '%</span></div>'
        + '<span class="site-progress-track"><i style="width:' + percent + '%"></i></span>'
        + '</div>';
    }).join('') + '</div>';
  }

  function resourceSiteCard(region, state, candidate) {
    const resourceId = candidate.resourceId;
    const resource = resourceById(resourceId) || { label: resourceId };
    const definition = siteForResource(resourceId);
    const site = namespace.resourceSites.siteByResource(region, resourceId);
    const projectedLevel = namespace.resourceSites.projectedLevel(region, resourceId);
    const availability = namespace.resourceSites.buildAvailability(state, region, resourceId);
    const reduce = namespace.resourceSites.reducePreview(state, region, resourceId);
    const economy = namespace.economyData.rawSiteEconomy[resourceId];
    const level = site ? site.level : 0;
    const required = site ? namespace.workforce.requiredWorkers(site) : 0;
    const displayedCap = site
      ? (Number.isFinite(site.pendingWorkerCap) ? site.pendingWorkerCap : site.workerCap)
      : 0;
    const allocation = required > 0 ? Math.round((displayedCap / required) * 100) : 0;
    const preview = site ? namespace.workforce.outputPreview(region, site) : null;
    const output = preview && preview.outputs.length
      ? preview.outputs.map((item) => formatNumber(item.annualAmount) + ' ' + item.label).join(' + ')
      : 'No Output';
    const status = site ? siteStatus(region, site) : (projectedLevel > 0 ? 'Construction Queued' : 'Not Built');
    const header = site
      ? '<button type="button" class="resource-card-open" data-action="open-resource-site" data-region-id="' + escapeAttribute(region.id) + '" data-resource-id="' + escapeAttribute(resourceId) + '"><span><small>Resource Site</small><strong>' + escapeHtml(definition.label) + '</strong></span>' + icon('chevron-right') + '</button>'
      : '<div class="resource-card-open static"><span><small>Resource Site</small><strong>' + escapeHtml(definition.label) + '</strong></span></div>';
    const workerControl = site
      ? '<div class="resource-card-workers"><div><span>Worker Cap</span><strong>' + displayedCap + ' / ' + required + ' | ' + allocation + '%</strong></div>'
        + '<div class="worker-cap-control compact">'
        + '<span class="worker-coverage-track" title="' + formatNumber(site.actualWorkers) + ' assigned; ' + formatNumber(Math.max(0, displayedCap - site.actualWorkers)) + ' shortage"><i style="width:' + (required ? site.actualWorkers / required * 100 : 0) + '%"></i><b style="left:' + (required ? site.actualWorkers / required * 100 : 0) + '%;width:' + (required ? Math.max(0, displayedCap - site.actualWorkers) / required * 100 : 0) + '%"></b></span>'
        + '<input type="range" min="0" max="' + required + '" step="1" value="' + displayedCap + '" data-action="set-worker-cap" data-region-id="' + escapeAttribute(region.id) + '" data-resource-id="' + escapeAttribute(resourceId) + '" aria-label="Worker limit" />'
        + '</div></div>'
      : '<div class="resource-card-workers empty"><span>Worker Limit</span><strong>0 / 0</strong></div>';

    return '<article class="resource-site-card ' + (site ? 'built' : 'unbuilt') + '">'
      + header
      + '<dl class="resource-card-facts">'
      + '<div><dt>Resource</dt><dd>' + escapeHtml(resource.label) + '</dd></div>'
      + '<div><dt>Level</dt><dd>' + level + ' / ' + candidate.naturalPotential + '</dd></div>'
      + '<div><dt>Productivity</dt><dd><span class="tooltip-trigger" ' + tooltipAttributes('Productivity Breakdown', candidateDetail(candidate)) + '>' + formatEfficiency(candidate.finalEfficiency) + '</span></dd></div>'
      + '<div><dt>Actual Workers</dt><dd>' + (site ? site.actualWorkers : 0) + '</dd></div>'
      + '<div><dt>Requested Workers</dt><dd>' + displayedCap + '</dd></div>'
      + '<div class="' + (site && Math.max(0, displayedCap - site.actualWorkers) > 0 ? 'worker-shortage' : '') + '"><dt>Worker Shortage</dt><dd>' + (site ? formatNumber(Math.max(0, displayedCap - site.actualWorkers)) : 0) + '</dd></div>'
      + '<div class="wide"><dt>Output / Year</dt><dd>' + escapeHtml(output) + '</dd></div>'
      + '<div class="wide"><dt>Status</dt><dd>' + escapeHtml(status) + '</dd></div>'
      + '</dl>'
      + workerControl
      + projectProgress(region, resourceId)
      + '<div class="resource-card-actions">'
      + '<button type="button" class="primary-action" data-action="queue-resource-site" data-region-id="' + escapeAttribute(region.id) + '" data-resource-id="' + escapeAttribute(resourceId) + '" '
      + buildTooltipAttributes(state, availability, projectedLevel > 0 ? 'Expand Site' : 'Build Site') + ' ' + (availability.allowed ? '' : 'disabled') + '>'
      + (availability.allowed ? icon('plus') : icon('lock-keyhole')) + 'Expand</button>'
      + '<button type="button" data-action="remove-resource-level" data-region-id="' + escapeAttribute(region.id) + '" data-resource-id="' + escapeAttribute(resourceId) + '" '
      + tooltipAttributes('Reduce Site', reduceTooltipBody(reduce)) + ' ' + (reduce.allowed ? '' : 'disabled') + '>'
      + icon('minus') + 'Reduce</button>'
      + '</div></article>';
  }

  function provinceResourcesPanel(region, state) {
    const canBuild = canManageResourceSites(state, region);
    const specialization = namespace.resourceSites.outpostSpecialization(state, region);
    const allCandidates = eligibleResourceCandidates(region);
    const candidates = (specialization
      ? allCandidates.filter((candidate) => candidate.resourceId === specialization)
      : allCandidates).sort((a, b) => { const rank = (candidate) => { const site = namespace.resourceSites.siteByResource(region, candidate.resourceId); if (site && site.level > 0) return 0; if (namespace.resourceSites.pendingProjects(region, candidate.resourceId).length) return 1; return namespace.resourceSites.buildAvailability(state, region, candidate.resourceId).allowed ? 2 : 3; }; return rank(a) - rank(b); });
    const specializationResource = specialization ? resourceById(specialization) : null;

    return '<section class="province-section resources-panel">'
      + resourceSummary(region, state)
      + '<div class="province-section-title resource-title-row"><h3>Resources</h3><span>' + candidates.length + ' Eligible</span></div>'
      + (specialization ? '<div class="outpost-specialization-banner"><strong>Outpost Specialization</strong><span>' + escapeHtml(specializationResource ? specializationResource.label : specialization) + '</span></div>' : '')
      + (!canBuild && !region.isWater ? '<p class="muted-text small-copy">Resource Sites require Player Realm control.</p>' : '')
      + (candidates.length ? '<div class="resource-site-card-grid">' + candidates.map((candidate) => resourceSiteCard(region, state, candidate)).join('') + '</div>' : '<p class="empty-state-copy">No eligible Resource Sites in this province.</p>')
      + '</section>';
  }

  function siteDetailPanel(region, state, resourceId) {
    const site = namespace.resourceSites.siteByResource(region, resourceId);
    if (!site) return provinceResourcesPanel(region, state);
    const definition = siteForResource(resourceId);
    const candidate = candidateByResourceId(region, resourceId);
    const preview = namespace.workforce.outputPreview(region, site);
    const expansion = namespace.resourceSites.buildAvailability(state, region, resourceId);
    const required = namespace.workforce.requiredWorkers(site);
    const displayedCap = Number.isFinite(site.pendingWorkerCap) ? site.pendingWorkerCap : site.workerCap;
    const removalLabel = 'Reduce One Level';
    const reduction = namespace.resourceSites.reducePreview(state, region, resourceId);
    const active = namespace.developmentEconomy.activeLevels(site);
    const maintenancePriority = site.pendingMaintenancePriority || site.maintenancePriority || 'normal';
    const toolPriority = site.pendingToolPriority || site.toolPriority || 'normal';
    const toolMode = site.pendingToolMode || site.toolMode || 'no-tools';
    const priorityOptions = (selected) => namespace.developmentData.priorities.map((value) => (
      "<option value='" + value + "'" + (selected === value ? ' selected' : '') + ">"
      + value.charAt(0).toUpperCase() + value.slice(1) + "</option>"
    )).join('');
    const toolModeOptions = namespace.developmentData.toolModes.map((value) => (
      "<option value='" + value + "'" + (toolMode === value ? ' selected' : '') + ">"
      + ({ 'best-available': 'Best Available', 'simple-only': 'Simple Tools Only', 'bronze-only': 'Bronze Tools Only', 'no-tools': 'No Tools' })[value]
      + "</option>"
    )).join('');

    return `
      <section class='resource-site-detail'>
        <div class='detail-heading'>
          <button type='button' class='icon-text-button' data-action='back-to-resources' aria-label='Back to Resources'>${icon('arrow-left')}</button>
          <div><p class='eyebrow'>Resource Site</p><h3>${escapeHtml(definition.label)} &middot; Level ${site.level}</h3></div>
          <b class='status-pill'>${escapeHtml(siteStatus(region, site))}</b>
        </div>
        <div class='site-detail-grid'>
          <section class='site-detail-section'>
            <h4>Production</h4>
            <dl class='province-fact-list'>
              <div><dt>Inputs</dt><dd>None</dd></div>
              <div><dt>Timing</dt><dd>${preview.productionTiming === 'seasonal' ? `${preview.harvestSeason} Harvest` : 'Continuous'}</dd></div>
              <div><dt>Productivity</dt><dd>${formatEfficiency(preview.environmentalEfficiency * preview.staffingRatio * preview.factors.tools * preview.factors.technology * preview.factors.maintenance * preview.factors.controller)}</dd></div>
              <div><dt>Active Levels</dt><dd>${active} / ${site.level}</dd></div>
              <div><dt>Staffing</dt><dd>${formatEfficiency(preview.staffingRatio)}</dd></div>
              <div><dt>Maintenance</dt><dd>${formatEfficiency(site.maintenanceCoverage ?? 1)}</dd></div>
              <div><dt>Tool Coverage</dt><dd>${formatEfficiency(site.toolCoverage || 0)}</dd></div>
              <div><dt>Controller</dt><dd>${formatEfficiency(preview.factors.controller)}</dd></div>
            </dl>
            <div class='output-list'>
              ${preview.outputs.map((item) => `
                <div><strong>${escapeHtml(item.label)}</strong><span>${formatNumber(item.annualAmount)} / year</span><small>${preview.productionTiming === 'seasonal' ? `${formatNumber(item.harvestAmount)} in ${preview.harvestSeason}` : `${formatNumber(item.dailyAmount, 3)} / day`}</small></div>
              `).join('')}
            </div>
          </section>
          <section class='site-detail-section'>
            <h4>Workforce</h4>
            <dl class='province-fact-list'>
              <div><dt>Required Workers</dt><dd>${required}</dd></div>
              <div><dt>Worker Limit</dt><dd>${displayedCap}</dd></div>
              <div><dt>Actual Workers</dt><dd>${site.actualWorkers}</dd></div>
              <div><dt>Change</dt><dd>${Number.isFinite(site.pendingWorkerCap) ? 'Next Daily Tick' : 'Applied'}</dd></div>
            </dl>
            <div class='worker-cap-control'>
              <button type='button' data-action='adjust-worker-cap' data-delta='-1' aria-label='Reduce worker limit'>${icon('minus')}</button>
              <input type='range' min='0' max='${required}' step='1' value='${displayedCap}' data-action='set-worker-cap' data-region-id='${escapeAttribute(region.id)}' data-resource-id='${escapeAttribute(resourceId)}' aria-label='Worker limit' />
              <input type='number' min='0' max='${required}' step='1' value='${displayedCap}' data-worker-cap-number aria-label='Exact worker limit' />
              <button type='button' data-action='adjust-worker-cap' data-delta='1' aria-label='Increase worker limit'>+</button>
            </div>
          </section>
          <section class='site-detail-section'>
            <h4>Operating Priorities</h4>
            <p class='muted-text small-copy'>Changes apply on the next daily tick.</p>
            <div class='economic-setting-grid'>
              <label>Maintenance
                <select data-action='set-economic-setting' data-region-id='${escapeAttribute(region.id)}' data-resource-id='${escapeAttribute(resourceId)}' data-setting='maintenancePriority'>${priorityOptions(maintenancePriority)}</select>
              </label>
              <label>Tool Mode
                <select data-action='set-economic-setting' data-region-id='${escapeAttribute(region.id)}' data-resource-id='${escapeAttribute(resourceId)}' data-setting='toolMode'>${toolModeOptions}</select>
              </label>
              <label>Tool Priority
                <select data-action='set-economic-setting' data-region-id='${escapeAttribute(region.id)}' data-resource-id='${escapeAttribute(resourceId)}' data-setting='toolPriority'>${priorityOptions(toolPriority)}</select>
              </label>
            </div>
          </section>
          <section class='site-detail-section'>
            <h4>Productivity</h4>
            <dl class='province-fact-list'>
              <div><dt>Base Efficiency</dt><dd>${formatEfficiency(candidate.baseEfficiency)}</dd></div>
              <div><dt>Trait Buff</dt><dd>${formatEfficiency(candidate.traitBonus)}</dd></div>
              <div><dt>Final Productivity</dt><dd>${formatEfficiency(candidate.finalEfficiency * preview.staffingRatio * preview.factors.tools * preview.factors.technology * preview.factors.maintenance * preview.factors.controller)}</dd></div>
              <div><dt>Natural Potential</dt><dd>${site.level} / ${candidate.naturalPotential}</dd></div>
              <div><dt>Capacity Used</dt><dd>${candidate.capacityPerLevel} per level | ${candidate.capacityPerLevel * site.level} total ${candidate.capacityType}</dd></div>
            </dl>
          </section>
          <section class='site-detail-section expansion-section'>
            <h4>Site Expansion</h4>
            ${expansion.preview ? `
              <dl class='province-fact-list'>
                <div><dt>Next Level</dt><dd>${expansion.preview.targetLevel}</dd></div>
                <div><dt>Duration</dt><dd>${expansion.preview.days} Days</dd></div>
                <div><dt>Capacity</dt><dd>+${candidate.capacityPerLevel} ${candidate.capacityType}</dd></div>
                <div><dt>Workers</dt><dd>+${namespace.economyData.rawSiteEconomy[resourceId].workersPerLevel}</dd></div>
              </dl>
              <p class='material-line'>${escapeHtml(materialsText(expansion.preview.materials))}</p>
            ` : ''}
            <div class='detail-actions'>
              <button
                type='button'
                class='primary-action'
                data-action='queue-resource-site'
                data-region-id='${escapeAttribute(region.id)}'
                data-resource-id='${escapeAttribute(resourceId)}'
                ${buildTooltipAttributes(state, expansion, 'Expand Site')}
                ${expansion.allowed ? '' : 'disabled'}
              >
                ${expansion.allowed
                  ? ''
                  : namespace.uiNavigation.icon('lock-keyhole')}
                Expand Site
              </button>
              <button
                type='button'
                data-action='remove-resource-level'
                data-region-id='${escapeAttribute(region.id)}'
                data-resource-id='${escapeAttribute(resourceId)}'
                ${tooltipAttributes('Reduce Site', reduceTooltipBody(reduction))}
                ${reduction.allowed ? '' : 'disabled'}
              >${removalLabel}</button>
            </div>
          </section>
        </div>
      </section>
    `;
  }


  function warehouseProgress(region) {
    const ordered = namespace.constructionQueue.orderedProjects(region);
    const projects = namespace.storageLedger.warehouseProjects(region);
    if (!projects.length) return '';
    return '<div class="site-project-list">' + projects.map((project) => {
      const percent = Math.max(0, Math.min(100, (project.progressDays / project.durationDays) * 100));
      const position = ordered.findIndex((item) => item.id === project.id) + 1;
      const label = project.status === 'waiting'
        ? 'Queue Position ' + position
        : project.status === 'paused' ? 'Paused' : 'Active';
      return '<div class="site-project-progress"><div><strong>Level ' + project.targetLevel + ' ' + label + '</strong><span>'
        + project.progressDays + ' / ' + project.durationDays + ' Days | ' + Math.round(percent) + '%</span></div>'
        + '<span class="site-progress-track"><i style="width:' + percent + '%"></i></span></div>';
    }).join('') + '</div>';
  }

  function buildingGroupOpen(state, cityId, groupId) {
    const ui = ensureUiState(state);
    ui.provinceBuildingGroupsOpen = ui.provinceBuildingGroupsOpen || {};
    ui.provinceBuildingGroupsOpen[cityId] = ui.provinceBuildingGroupsOpen[cityId] || {};
    if (ui.provinceBuildingGroupsOpen[cityId][groupId] == null) ui.provinceBuildingGroupsOpen[cityId][groupId] = true;
    return ui.provinceBuildingGroupsOpen[cityId][groupId];
  }

  function buildingAvailableOpen(state, cityId, groupId) {
    const ui = ensureUiState(state);
    ui.provinceBuildingAvailableOpen = ui.provinceBuildingAvailableOpen || {};
    ui.provinceBuildingAvailableOpen[cityId] = ui.provinceBuildingAvailableOpen[cityId] || {};
    return Boolean(ui.provinceBuildingAvailableOpen[cityId][groupId]);
  }


  function buildingGroupSection(state, city, groupId, label, builtRows, availableRows) {
    if (!builtRows.length && !availableRows.length) return '';
    const open = buildingGroupOpen(state, city.id, groupId);
    const availableOpen = buildingAvailableOpen(state, city.id, groupId);
    return `<section class='settlement-building-section building-list-group' data-building-group='${escapeAttribute(groupId)}'>
      <button type='button' class='province-section-title building-group-heading building-group-toggle ${open ? 'open' : ''}' data-action='toggle-province-building-group' data-city-id='${escapeAttribute(city.id)}' data-group-id='${escapeAttribute(groupId)}' aria-expanded='${open}'><h3>${escapeHtml(label)}</h3><span>${builtRows.length} Built or Queued | ${availableRows.length} Available</span><b>${open ? '&minus;' : '+'}</b></button>
      ${open ? `<div class='building-group-content'><div class='province-building-list built-building-list'>${builtRows.length ? builtRows.join('') : `<p class='empty-state-copy'>No built or queued ${escapeHtml(label)}.</p>`}</div>${availableRows.length ? `<button type='button' class='available-building-toggle ${availableOpen ? 'open' : ''}' data-action='toggle-province-building-available' data-city-id='${escapeAttribute(city.id)}' data-group-id='${escapeAttribute(groupId)}' aria-expanded='${availableOpen}'><span>Available to Build</span><b>${availableRows.length}</b><i>${availableOpen ? '&minus;' : '+'}</i></button>${availableOpen ? `<div class='province-building-list available-building-list'>${availableRows.join('')}</div>` : ''}` : ''}</div>` : ''}
    </section>`;
  }

  function warehouseBuildingRow(state, city, region) {
    const levels = Math.max(0, Number(state.storage.warehouseLevelsByRegion[region.id]) || 0);
    const activeLevels = namespace.developmentEconomy.activeWarehouseLevels(state, region.id);
    const projects = namespace.storageLedger.warehouseProjects(region);
    const availability = namespace.storageLedger.warehouseBuildAvailability(state, region.id);
    const reduce = namespace.storageLedger.warehouseReducePreview(state, region.id);
    const capacity = namespace.storageLedger.warehouseCapacityForSettlement(city);
    const projected = namespace.storageLedger.projectedWarehouseLevel(state, region);
    const priority = state.storage.pendingWarehouseMaintenancePriorityByRegion[region.id]
      || state.storage.warehouseMaintenancePriorityByRegion[region.id] || 'normal';
    return `<article class='settlement-building-card compact-building-row building-list-row ${levels || projects.length ? 'built' : 'available'}'>
      <header><span><small>Civic &amp; Housing</small><strong>Warehouse</strong></span><span>Level ${levels}${projected !== levels ? ` / ${projected}` : ''} | ${projects.length ? 'Construction Queued' : (levels ? 'Active' : 'Eligible')}</span>${icon('warehouse')}</header>
      <dl class='building-row-facts'><div><dt>Active Levels</dt><dd>${activeLevels}</dd></div><div><dt>Capacity / Level</dt><dd>${formatNumber(capacity)}</dd></div><div><dt>Total Capacity</dt><dd>${formatNumber(activeLevels * capacity)}</dd></div><div><dt>Dev Footprint</dt><dd>0.2 / Level</dd></div></dl>
      ${levels ? `<label class='building-row-setting'>Maintenance <select data-action='set-warehouse-maintenance' data-region-id='${escapeAttribute(region.id)}'>${namespace.developmentData.priorities.map((value) => `<option value='${value}' ${priority === value ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>`).join('')}</select></label>` : ''}
      ${warehouseProgress(region)}
      <div class='resource-card-actions'><button type='button' class='primary-action' data-action='open-construction-details' data-kind='warehouse' data-region-id='${escapeAttribute(region.id)}' ${buildTooltipAttributes(state, availability, (levels || projects.length ? 'Expand' : 'Build') + ' Warehouse')}>${levels || projects.length ? 'Expand' : 'Build'}</button><button type='button' data-action='reduce-warehouse' data-region-id='${escapeAttribute(region.id)}' ${reduce.allowed ? '' : 'disabled'}>Reduce</button></div>
    </article>`;
  }

  function residentialBuildingRow(state, city) {
    const housing = namespace.developmentEconomy.housingSummary(city);
    const levels = housing.completedLevels;
    const region = regionById(state, city.regionId);
    const projects = region ? namespace.developmentEconomy.residentialProjects(region, city.id) : [];
    const availability = namespace.developmentEconomy.residentialBuildAvailability(state, city.id);
    return `<article class='settlement-building-card compact-building-row building-list-row ${levels || projects.length ? 'built' : 'available'}'>
      <header><span><small>Civic &amp; Housing</small><strong>Residential District</strong></span><span>Level ${levels}${projects.length ? ` / ${levels + projects.length}` : ''} | ${projects.length ? 'Construction Queued' : (levels ? 'Active' : 'Eligible')}</span>${icon('house')}</header>
      <dl class='building-row-facts'><div><dt>Housing Capacity</dt><dd>${formatNumber(housing.capacity)}</dd></div><div><dt>Housing / Level</dt><dd>600.0</dd></div><div><dt>Coverage</dt><dd>${formatNumber(housing.coverage * 100)}%</dd></div><div><dt>Dev Footprint</dt><dd>0.2 / Level</dd></div></dl>
      <div class='resource-card-actions'><button type='button' class='primary-action' data-action='open-construction-details' data-kind='residential' data-city-id='${escapeAttribute(city.id)}' ${buildTooltipAttributes(state, availability, (levels || projects.length ? 'Expand' : 'Build') + ' Residential District')}>${levels || projects.length ? 'Expand' : 'Build'}</button><button type='button' data-action='reduce-residential-district' data-city-id='${escapeAttribute(city.id)}' ${levels || projects.length ? '' : 'disabled'}>Reduce</button></div>
    </article>`;
  }

  function medicalBuildingRow(state, city, region, definition) {
    const building = namespace.health.facilityById(city, definition.id);
    const projects = namespace.health.facilityProjects(region, city.id, definition.id);
    const level = building ? building.level : 0;
    const projected = namespace.health.projectedLevel(state, city, definition.id);
    const required = building ? namespace.health.requiredWorkers(state, building) : 0;
    const cap = building ? (building.pendingWorkerCap == null ? building.workerCap : building.pendingWorkerCap) : 0;
    const actual = building ? Number(building.actualWorkers) || 0 : 0;
    const shortage = Math.max(0, cap - actual);
    const reduction = namespace.health.reducePreview(state, city.id, definition.id);
    const availability = namespace.health.buildAvailability(state, region.id, definition.id);
    return `<article class='settlement-building-card compact-building-row building-list-row ${building || projects.length ? 'built' : 'available'}'>
      <header><span><small>Medical Building</small><strong>${escapeHtml(definition.label)}</strong></span><span>Level ${level}${projected !== level ? ` / ${projected}` : ''} | ${building ? escapeHtml(building.status) : (projects.length ? 'Construction Queued' : 'Eligible')}</span>${icon('heart-pulse')}</header>
      ${building ? `<dl class='building-row-facts'><div><dt>Population Capacity</dt><dd>${formatNumber(definition.populationCapacity * level)}</dd></div><div><dt>Workers</dt><dd>${formatNumber(actual)} / ${required}</dd></div><div class='${shortage > 0 ? 'worker-shortage' : ''}'><dt>Shortage</dt><dd>${formatNumber(shortage)}</dd></div><div><dt>Maintenance</dt><dd>${formatNumber((building.maintenanceCoverage == null ? 1 : building.maintenanceCoverage) * 100)}%</dd></div></dl><label class='compact-worker-slider building-row-worker'><span>Worker Cap <b>${cap} / ${required}</b></span><span class='worker-coverage-track'><i style='width:${required ? actual / required * 100 : 0}%'></i><b style='left:${required ? actual / required * 100 : 0}%;width:${required ? shortage / required * 100 : 0}%'></b></span><input type='range' min='0' max='${required}' step='1' value='${cap}' data-action='set-medical-worker-cap' data-city-id='${escapeAttribute(city.id)}' data-building-id='${escapeAttribute(definition.id)}'></label>` : `<p class='building-eligibility-copy'>Eligible medical facility for this settlement.</p>`}
      <div class='resource-card-actions'><button type='button' class='primary-action' data-action='open-construction-details' data-kind='medical' data-region-id='${escapeAttribute(region.id)}' data-city-id='${escapeAttribute(city.id)}' data-building-id='${escapeAttribute(definition.id)}' ${buildTooltipAttributes(state, availability, (level || projects.length ? 'Expand' : 'Build') + ' ' + definition.label)}>${level || projects.length ? 'Expand' : 'Build'}</button><button type='button' data-action='reduce-medical-building' data-city-id='${escapeAttribute(city.id)}' data-building-id='${escapeAttribute(definition.id)}' ${reduction.allowed ? '' : 'disabled'}>Reduce</button></div>
    </article>`;
  }

  function settlementBuildingSections(state, region) {
    const city = cityForRegion(state, region.id);
    if (!city || region.id !== city.regionId) return `<p class='empty-state-copy'>Buildings are managed from the settlement center province.</p>`;
    const processingDefinitions = namespace.manufacturingData.processingBuildingList
      .filter((definition) => definition.category !== 'military' && namespace.developmentEconomy.canBuildProcessing(city, definition.id).allowed);
    const militaryDefinitions = namespace.manufacturingData.processingBuildingList
      .filter((definition) => definition.category === 'military' && namespace.developmentEconomy.canBuildProcessing(city, definition.id).allowed);
    const splitProcessing = (definitions) => definitions.reduce((result, definition) => {
      const building = namespace.manufacturing.buildingById(city, definition.id);
      const projects = namespace.manufacturing.buildingProjects(region, city.id, definition.id);
      result[building || projects.length ? 'built' : 'available'].push(namespace.uiManufacturing.buildingCard(state, city, definition, true));
      return result;
    }, { built: [], available: [] });
    const processing = splitProcessing(processingDefinitions);
    const military = splitProcessing(militaryDefinitions);
    const administration = namespace.administrationData.officeList
      .filter((definition) => namespace.administration.locationAvailability(city, definition).allowed)
      .reduce((result, definition) => {
        const building = namespace.administration.officeById(city, definition.id);
        const projects = namespace.administration.officeProjects(region, city.id, definition.id);
        result[building || projects.length ? 'built' : 'available'].push(namespace.uiAdministration.officeCard(state, city, definition, true, true));
        return result;
      }, { built: [], available: [] });
    const medical = namespace.healthData.facilityList
      .filter((definition) => namespace.health.locationAvailability(city, definition).allowed)
      .reduce((result, definition) => {
        const building = namespace.health.facilityById(city, definition.id);
        const projects = namespace.health.facilityProjects(region, city.id, definition.id);
        result[building || projects.length ? 'built' : 'available'].push(medicalBuildingRow(state, city, region, definition));
        return result;
      }, { built: [], available: [] });
    const civicRows = [warehouseBuildingRow(state, city, region), residentialBuildingRow(state, city)];
    const civic = civicRows.reduce((result, row) => {
      result[row.includes("building-list-row built") ? 'built' : 'available'].push(row);
      return result;
    }, { built: [], available: [] });
    return [
      buildingGroupSection(state, city, 'processing', 'Processing', processing.built, processing.available),
      buildingGroupSection(state, city, 'administration', 'Administration', administration.built, administration.available),
      buildingGroupSection(state, city, 'civic', 'Civic & Housing', civic.built, civic.available),
      buildingGroupSection(state, city, 'medical', 'Medical', medical.built, medical.available),
      buildingGroupSection(state, city, 'military', 'Military', military.built, military.available)
    ].filter(Boolean).join('');
  }
  function settlementWorkforceSummary(state, settlement) {
    const isOutpost = (state.player.outposts || []).some((outpost) => outpost.id === settlement.id);
    const entries = isOutpost
      ? namespace.workforcePriority.outpostEntries(state, settlement)
      : namespace.workforcePriority.cityEntries(state, settlement);
    const byType = {};
    entries.forEach((entry) => {
      const demand = namespace.workforcePriority.requestedWorkers(state, entry);
      if (namespace.workforcePriority.isFullyDisabled(entry) || demand.cap <= 0) return;
      const typeId = namespace.workforcePriority.typeIdForEntry(entry);
      const definition = namespace.workforcePriority.definition(typeId);
      const row = byType[typeId] || (byType[typeId] = { label: definition.label, requested: 0, assigned: 0, shortage: 0 });
      row.requested += demand.cap;
      row.assigned += Math.max(0, Number(entry.target.actualWorkers) || 0);
    });
    const rows = Object.values(byType).map((row) => ({ ...row, shortage: Math.max(0, row.requested - row.assigned) }))
      .sort((a, b) => b.shortage - a.shortage || b.requested - a.requested || a.label.localeCompare(b.label));
    const requested = rows.reduce((sum, row) => sum + row.requested, 0);
    const assigned = Math.max(0, Number(settlement.workforceAssigned) || rows.reduce((sum, row) => sum + row.assigned, 0));
    return {
      population: Math.max(0, Number(settlement.population) || 0),
      total: Math.max(0, Number(settlement.workforceTotal) || 0),
      requested,
      assigned,
      available: Math.max(0, Number(settlement.workforceAvailable) || 0),
      shortage: rows.reduce((sum, row) => sum + row.shortage, 0),
      rows
    };
  }

  function provinceWorkforceStrip(state, region) {
    const settlement = cityForRegion(state, region.id) || outpostForRegion(state, region.id);
    if (!settlement) return '';
    const summary = settlementWorkforceSummary(state, settlement);
    const ui = ensureUiState(state);
    ui.provinceWorkforceExpanded = ui.provinceWorkforceExpanded || {};
    const expanded = Boolean(ui.provinceWorkforceExpanded[settlement.id]);
    const ledger = summary.rows.length
      ? summary.rows.map((row) => row.label + ': ' + formatNumber(row.assigned) + ' assigned / ' + formatNumber(row.requested) + ' required / ' + formatNumber(row.shortage) + ' shortage').join('\n')
      : 'No local jobs request workers.';
    return `<section class='province-workforce-summary'>
      <dl>
        <div><dt>Population</dt><dd>${formatNumber(summary.population)}</dd></div>
        <div><dt>Workforce</dt><dd>${formatNumber(summary.total)}</dd></div>
        <div><dt>Assigned</dt><dd>${formatNumber(summary.assigned)}</dd></div>
        <div class='workforce-available'><dt>Available</dt><dd>${formatNumber(summary.available)}</dd></div>
        <button type='button' class='workforce-shortage-summary ${summary.shortage > 0 ? 'has-shortage' : ''}' data-action='toggle-province-workforce-breakdown' data-settlement-id='${escapeAttribute(settlement.id)}' ${tooltipAttributes('Workforce Ledger', ledger)}><dt>Shortage</dt><dd>${formatNumber(summary.shortage)}</dd></button>
      </dl>
      ${expanded ? `<div class='province-workforce-breakdown'>${summary.rows.filter((row) => row.shortage > 0).map((row) => `<div><strong>${escapeHtml(row.label)}</strong><span>${formatNumber(row.assigned)} / ${formatNumber(row.requested)} assigned</span><b>${formatNumber(row.shortage)} shortage</b></div>`).join('') || `<p>No worker shortage.</p>`}</div>` : ''}
    </section>`;
  }

  function activePopulationTab(state, cityId) {
    const ui = ensureUiState(state);
    ui.populationDetailTabs = ui.populationDetailTabs || {};
    const selected = ui.populationDetailTabs[cityId];
    const active = ['overview', 'health', 'satisfaction'].includes(selected) ? selected : 'overview';
    ui.populationDetailTabs[cityId] = active;
    return active;
  }
  function activeSettlementDetailTab(state, settlementId, kind) {
    const ui = ensureUiState(state);
    ui.settlementDetailTabs = ui.settlementDetailTabs || {};
    const tabs = kind === 'outpost'
      ? ['overview', 'buildings', 'population-transfers', 'administration', 'development']
      : ['overview', 'buildings', 'population', 'administration', 'development'];
    const selected = ui.settlementDetailTabs[settlementId];
    const active = tabs.includes(selected) ? selected : tabs[0];
    ui.settlementDetailTabs[settlementId] = active;
    return active;
  }

  function settlementDetailTabs(state, settlementId, kind) {
    const tabs = kind === 'outpost'
      ? [['overview', 'Overview'], ['population-transfers', 'Population & Transfers'], ['conversion', 'Conversion'], ['dismantle', 'Dismantle']]
      : [['overview', 'Overview'], ['buildings', 'Buildings'], ['population', 'Population'], ['administration', 'Administration'], ['development', 'Development']];
    const active = activeSettlementDetailTab(state, settlementId, kind);
    return "<nav class='construction-tabs settlement-detail-tabs' aria-label='Settlement detail tabs'>"
      + tabs.map(([id, label]) => "<button type='button' class='" + (active === id ? 'active' : '')
        + "' data-action='set-settlement-detail-tab' data-settlement-id='" + escapeAttribute(settlementId)
        + "' data-tab='" + escapeAttribute(id) + "'>" + escapeHtml(label) + "</button>").join('')
      + '</nav>';
  }

  function provinceSettlementPanel(region, state) {
    const city = cityForRegion(state, region.id);
    const outpost = outpostForRegion(state, region.id);
    if (outpost && !city) {
      const specialization = namespace.resourceSites.outpostSpecialization(state, region);
      const resource = specialization ? resourceById(specialization) : null;
      const activeTab = activeSettlementDetailTab(state, outpost.id, 'outpost');
      const overview = `
        <dl class='province-fact-list'>
          <div><dt>Name</dt><dd>${escapeHtml(outpost.name)}</dd></div>
          <div><dt>Owner</dt><dd>Player Realm</dd></div>
          <div><dt>Specialization</dt><dd>${specialization ? escapeHtml(resource ? resource.label : specialization) : 'Not Chosen'}</dd></div>
          <div><dt>Population</dt><dd>${formatNumber(outpost.population, 0)}</dd></div>
          <div><dt>Workforce</dt><dd>${formatNumber(outpost.workforceAssigned, 0)} / ${formatNumber(outpost.workforceTotal, 0)}</dd></div>
          <div><dt>Worker Housing</dt><dd>${formatNumber(outpost.housingCapacity, 0)}</dd></div>
          <div><dt>Output Modifier</dt><dd>${specialization ? '75%' : 'Awaiting Specialization'}</dd></div>
        </dl>`;
      const population = namespace.uiExpansion.populationPanel(state, outpost);
      const bodies = {
        overview,
        'population-transfers': population,
        buildings: `<p class='empty-state-copy'>Outposts use Resource Sites. Open Resources to manage local production.</p>`,
        administration: `<p class='empty-state-copy'>Outposts have no Control demand or administrative offices.</p>`,
        development: namespace.uiExpansion.conversionPanel(state, outpost) + namespace.uiExpansion.dismantlePanel(state, outpost)
      };
      return `
        <section class='province-section settlement-panel'>
          <div class='province-section-title'><h3>Outpost</h3><span>Frontier</span></div>
          ${bodies[activeTab]}
        </section>`;
    }

    if (!city) {
      return "<section class='province-section settlement-panel empty'>"
        + "<div class='province-section-title'><h3>Settlement</h3><span>Unclaimed</span></div>"
        + "<p class='muted-text small-copy'>Founding requires one owned source, 50 available settlers, prepaid food, and 40 days per province.</p>"
        + namespace.uiExpansion.foundingPanel(state, region)
        + "</section>";
    }
    const activeTab = activeSettlementDetailTab(state, city.id, 'city');
    const tier = city.settlementTier || city.level || 'town';
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    const roleLabel = city.isCapital ? 'State Capital' : (city.settlementIdentity === 'village' ? 'Village' : 'Regional Center');
    const developmentSummary = namespace.developmentEconomy.developmentSummary(state, city.id);
    const localResourceSummary = namespace.developmentEconomy.resourceSummary(state, city.id);
    const specialty = namespace.developmentEconomy.specialtyFor(city);
    const specialtyOptions = city.settlementIdentity === 'village' && specialty
      ? namespace.developmentEconomy.specialtyCards(city, region).filter((option) => option.id === city.specialtyId)
      : [];
    const specialtyCards = specialtyOptions.length
      ? `<div class='settlement-grid village-specialty-grid'>${specialtyOptions.map((option) => `
          <article class='settlement-card ${city.specialtyId === option.id ? 'selected' : ''} ${option.eligible ? '' : 'disabled'}'>
            <h4>${escapeHtml(option.label)}</h4>
            <dl class='province-fact-list'>
              <div><dt>Development</dt><dd>${formatNumber(option.developmentCapacity, 1)}</dd></div>
              <div><dt>General Resources</dt><dd>${formatNumber(option.generalResourceCapacity, 1)}</dd></div>
              <div><dt>Matching Pool</dt><dd>+${formatNumber(option.matchingResourceBonus, 1)}</dd></div>
              <div><dt>Eligibility</dt><dd>${option.eligible ? 'Available' : 'No Matching Resource'}</dd></div>
              <div><dt>Key Buildings</dt><dd>${escapeHtml(option.allowedBuildings.join(', '))}</dd></div>
            </dl>
          </article>`).join('')}</div>`
      : '';
    const parent = city.parentTownId
      ? (state.player.cities || []).find((settlement) => settlement.id === city.parentTownId)
      : null;
    const satisfactionPreview = namespace.satisfaction.previewSettlement(state, city.id);
    const healthPreview = namespace.health.previewSettlement(state, city.id);
    const housingPreview = namespace.developmentEconomy.housingSummary(city);
    const administrationState = namespace.administration.reconcile(state);
    const localCenter = administrationState.localByCenter[city.id]
      || (city.parentTownId ? administrationState.localByCenter[city.parentTownId] : null);
    const localCoverage = localCenter
      ? (localCenter.villages && localCenter.villages[city.id] ? localCenter.villages[city.id].coverage : localCenter.coverage)
      : 1;
    const localProjects = namespace.constructionQueue.orderedProjects(region);
    const activeProject = localProjects.find((project) => project.status === 'active') || localProjects[0] || null;
    const severityOrder = { critical: 3, warning: 2, info: 1 };
    const localAlerts = (state.alerts || []).filter((alert) => !alert.resolved && (
      alert.cityId === city.id || alert.settlementId === city.id || String(alert.message || '').includes(city.name)
    )).sort((a, b) => (b.critical ? 4 : (severityOrder[b.severity] || 0)) - (a.critical ? 4 : (severityOrder[a.severity] || 0)) || (b.createdDay || b.day || 0) - (a.createdDay || a.day || 0)).slice(0, 3);
    const overview = `<div class='settlement-overview-dashboard'>
      <section class='settlement-identity-strip'><div><small>${escapeHtml(roleLabel)}</small><h3>${escapeHtml(city.name)}</h3></div><span>${escapeHtml(tierLabel)} | ${city.controlledRegionIds.length} Provinces</span></section>
      <div class='settlement-overview-cards'>
        <button type='button' data-action='set-province-tab' data-tab='population'><span>Population</span><strong>${formatNumber(city.population)}</strong><small>${formatNumber(city.workforceAvailable)} workforce available</small></button>
        <button type='button' data-action='set-province-tab' data-tab='population'><span>Satisfaction</span><strong>${formatNumber(satisfactionPreview.actual)}</strong><small>Target ${formatNumber(satisfactionPreview.target)} | ${satisfactionPreview.movement > 0 ? '+' : ''}${formatNumber(satisfactionPreview.movement)} / Day</small></button>
        <button type='button' data-action='set-province-tab' data-tab='population'><span>Health</span><strong>${formatNumber(healthPreview.actual)}</strong><small>Target ${formatNumber(healthPreview.target)} | ${healthPreview.movement > 0 ? '+' : ''}${formatNumber(healthPreview.movement)} / Day</small></button>
        <button type='button' data-action='set-province-tab' data-tab='population'><span>Housing</span><strong>${formatNumber(city.population)} / ${formatNumber(housingPreview.capacity)}</strong><small>${formatNumber(housingPreview.coverage * 100)}% coverage${housingPreview.shortage > 0 ? ' | Immigration Blocked' : ''}</small></button>
        <button type='button' data-action='set-province-tab' data-tab='administration'><span>Local Control</span><strong>${formatNumber(localCoverage * 100)}%</strong><small>${localCenter ? `${formatNumber(localCenter.spare)} spare` : 'No local demand'}</small></button>
      </div>
      <section class='settlement-overview-projects'><div class='province-section-title'><h3>Construction</h3><span>${localProjects.length} Queued</span></div>${activeProject ? `<div class='compact-project-row'><strong>${escapeHtml(activeProject.label || activeProject.kind)}</strong><span>${escapeHtml(activeProject.status)} | ${formatNumber(activeProject.progressDays)} / ${formatNumber(activeProject.durationDays)} Days</span></div>` : `<p class='empty-state-copy'>No local construction projects.</p>`}<button type='button' data-action='set-province-tab' data-tab='buildings'>Open Buildings</button></section>
      <section class='settlement-overview-alerts'><div class='province-section-title'><h3>Priority Alerts</h3><span>${localAlerts.length}</span></div>${localAlerts.length ? localAlerts.map((alert) => `<button type='button' class='overview-alert-row ${escapeAttribute(alert.critical ? 'critical' : (alert.severity || 'info'))}' data-action='open-main-panel' data-panel='alerts'><strong>${escapeHtml(alert.title || alert.type || 'Alert')}</strong><span>${escapeHtml(alert.message || '')}</span></button>`).join('') : `<p class='empty-state-copy'>No active settlement alerts.</p>`}</section>
    </div>`;
    const housing = namespace.developmentEconomy.housingSummary(city);
    const founderHousing = housing.founderHousing;
    const residentialLevels = housing.completedLevels;
    const residentialCapacity = housing.activeLevels * 600;
    const housingUsed = Math.min(Number(city.population) || 0, housing.capacity);
    const residentialPriority = city.pendingResidentialMaintenancePriority || city.residentialMaintenancePriority || 'normal';
    const residentialPriorityOptions = namespace.developmentData.priorities.map((value) => `<option value='${value}' ${residentialPriority === value ? 'selected' : ''}>${value.charAt(0).toUpperCase() + value.slice(1)}</option>`).join('');
    const cityTransferOrders = namespace.outpostLifecycle.ensureState(state).settlerOrders
      .filter((order) => order.kind === 'internal-transfer' && ['departure-pending', 'in-transit'].includes(order.status));
    const incomingPopulation = cityTransferOrders.filter((order) => order.destinationId === city.id).reduce((sum, order) => sum + order.amount, 0);
    const outgoingPopulation = cityTransferOrders.filter((order) => order.sourceId === city.id).reduce((sum, order) => sum + order.amount, 0);
    const workforceSummary = settlementWorkforceSummary(state, city);
    const populationActiveTab = activePopulationTab(state, city.id);
    const populationOverview = `
      <div class='population-overview-grid'>
        <section class='settlement-card'><h4>Population &amp; Workforce</h4><dl class='province-fact-list'><div><dt>Current Population</dt><dd>${formatNumber(city.population, 0)}</dd></div><div><dt>Workforce</dt><dd>${formatNumber(workforceSummary.total, 0)}</dd></div><div><dt>Non-workforce</dt><dd>${formatNumber(Math.max(0, city.population - workforceSummary.total), 0)}</dd></div><div><dt>Required Workforce</dt><dd>${formatNumber(workforceSummary.requested, 0)}</dd></div><div><dt>Assigned Workforce</dt><dd>${formatNumber(workforceSummary.assigned, 0)}</dd></div><div><dt>Available Workforce</dt><dd class='workforce-available'>${formatNumber(workforceSummary.available, 0)}</dd></div><div><dt>Worker Shortage</dt><dd class='${workforceSummary.shortage > 0 ? 'worker-shortage' : ''}'>${formatNumber(workforceSummary.shortage, 0)}</dd></div></dl></section>
        <section class='settlement-card'><h4>Housing</h4><dl class='province-fact-list'><div><dt>Housing Capacity</dt><dd>${formatNumber(housing.capacity, 0)}</dd></div><div><dt>Used / Free</dt><dd>${formatNumber(housingUsed, 0)} / ${formatNumber(Math.max(0, housing.capacity - city.population), 0)}</dd></div><div><dt>Shortage</dt><dd>${formatNumber(housing.shortage, 0)}</dd></div><div><dt>Founder Housing</dt><dd>${formatNumber(founderHousing, 0)}</dd></div><div><dt>Residential District</dt><dd>${formatNumber(residentialCapacity, 0)} (${housing.activeLevels} active / ${residentialLevels} built)</dd></div><div><dt>Housing Coverage</dt><dd>${formatNumber(housing.coverage * 100, 1)}%</dd></div><div><dt>Maintenance Coverage</dt><dd>${formatNumber(housing.maintenanceCoverage * 100, 1)}%</dd></div></dl></section>
        <section class='settlement-card'><h4>In-Transit Population</h4><dl class='province-fact-list'><div><dt>Incoming</dt><dd>+${formatNumber(incomingPopulation, 0)}</dd></div><div><dt>Outgoing</dt><dd>-${formatNumber(outgoingPopulation, 0)}</dd></div><div><dt>Projected Population</dt><dd>${formatNumber(city.population + incomingPopulation - outgoingPopulation, 0)}</dd></div></dl><button type='button' class='primary-action' data-action='begin-internal-transfer'>Transfer Settlers</button></section>
        <button type='button' class='population-summary-link' data-action='set-local-population-tab' data-city-id='${escapeAttribute(city.id)}' data-tab='health'><span>Health</span><strong>${formatNumber(healthPreview.actual)}</strong><small>Target ${formatNumber(healthPreview.target)} | ${healthPreview.movement > 0 ? '+' : ''}${formatNumber(healthPreview.movement)} / Day</small></button>
        <button type='button' class='population-summary-link' data-action='set-local-population-tab' data-city-id='${escapeAttribute(city.id)}' data-tab='satisfaction'><span>Satisfaction</span><strong>${formatNumber(satisfactionPreview.actual)}</strong><small>Target ${formatNumber(satisfactionPreview.target)} | ${satisfactionPreview.movement > 0 ? '+' : ''}${formatNumber(satisfactionPreview.movement)} / Day</small></button>
        ${namespace.uiHealth.localDemographicsPanel(state, city)}
      </div>`;
    const populationBodies = {
      overview: populationOverview,
      health: namespace.uiHealth.settlementHealth(state, city),
      satisfaction: namespace.uiSatisfaction.localPanel(state, city)
    };
    const population = `<nav class='construction-tabs population-detail-tabs' aria-label='Population details'>${[['overview','Overview'],['health','Health'],['satisfaction','Satisfaction']].map(([id, label]) => `<button type='button' class='${populationActiveTab === id ? 'active' : ''}' data-action='set-local-population-tab' data-city-id='${escapeAttribute(city.id)}' data-tab='${id}'>${label}</button>`).join('')}</nav><div class='population-detail-panel'>${populationBodies[populationActiveTab]}</div>`;
    const administration = namespace.uiAdministration.settlementAdministration(state, city)
      + (region.id === city.regionId ? namespace.uiAdministration.settlementSection(state, city) : '');
    const advancement = namespace.settlementLifecycle.advancementPreview(state, city.id);
    const downgrade = namespace.settlementLifecycle.downgradePreview(state, city.id);
    const lifecycleProject = namespace.settlementLifecycle.activeLifecycleProject(state, city);
    const lifecyclePenalty = city.satisfactionPenalty;
    const advancementCard = advancement.profile ? `
      <section class='settlement-card compact-development-row lifecycle-development-card'><h4>${escapeHtml(advancement.profile.label)}</h4><dl class='province-fact-list'><div><dt>Current Tier</dt><dd>${escapeHtml(tierLabel)}</dd></div><div><dt>Status</dt><dd>${escapeHtml(lifecycleProject ? lifecycleProject.status : advancement.reason)}</dd></div></dl><div class='resource-card-actions'><button type='button' class='primary-action' data-action='open-settlement-decision' data-kind='advancement' data-city-id='${escapeAttribute(city.id)}'>View Advancement</button></div></section>` : '';
    const downgradeCard = downgrade.profile ? `
      <section class='settlement-card compact-development-row lifecycle-development-card'><h4>${escapeHtml(downgrade.profile.label)}</h4><dl class='province-fact-list'><div><dt>Current Tier</dt><dd>${escapeHtml(tierLabel)}</dd></div><div><dt>Status</dt><dd>${escapeHtml(lifecycleProject ? lifecycleProject.status : downgrade.reason)}</dd></div></dl><div class='resource-card-actions'><button type='button' data-action='open-settlement-decision' data-kind='downgrade' data-city-id='${escapeAttribute(city.id)}'>View Downgrade</button></div></section>` : '';
    const parentTransferCard = city.settlementTier === 'village' ? `
      <section class='settlement-card compact-development-row lifecycle-development-card'><h4>Village Parent</h4><dl class='province-fact-list'><div><dt>Current Parent</dt><dd>${parent ? escapeHtml(parent.name) : 'Unavailable'}</dd></div><div><dt>Transfer</dt><dd>Manual Only</dd></div></dl><div class='resource-card-actions'><button type='button' data-action='open-parent-transfer-details' data-city-id='${escapeAttribute(city.id)}'>Switch Parent</button></div></section>` : '';
    const penaltyCard = lifecyclePenalty ? `<section class='settlement-card'><h4>Active Satisfaction Penalty</h4><dl class='province-fact-list'><div><dt>Source</dt><dd>${escapeHtml(lifecyclePenalty.kind)}</dd></div><div><dt>Modifier</dt><dd>${formatNumber(namespace.settlementLifecycle.penaltyModifier(city), 0)}</dd></div><div><dt>Remaining</dt><dd>${formatNumber(lifecyclePenalty.remainingDays, 0)} Days</dd></div></dl></section>` : '';
    const development = `
      <div class='settlement-grid'>
        <section class='settlement-card'><h4>Development</h4><dl class='province-fact-list'>
          <div><dt>Current Tier</dt><dd>${escapeHtml(tierLabel)}</dd></div>
          <div><dt>Province Area</dt><dd>${formatNumber(region.areaKm2 || 5500, 1)} km&sup2;</dd></div>
          <div><dt>Reference Dev Capacity</dt><dd>${formatNumber(namespace.developmentEconomy.profile(city).referenceDevelopmentCapacity, 1)} at 5,500 km&sup2;</dd></div>
          <div><dt>Development Capacity</dt><dd>${formatNumber(developmentSummary.used, 1)} / ${formatNumber(developmentSummary.total, 1)}</dd></div>
          <div><dt>Land Resource Capacity</dt><dd>${formatNumber(localResourceSummary.used, 1)} / ${formatNumber(localResourceSummary.total, 1)}</dd></div>
          <div><dt>General Resource Pool</dt><dd>${formatNumber(localResourceSummary.general, 1)}</dd></div>
          <div><dt>Specialty Pool</dt><dd>${formatNumber(localResourceSummary.specialtyBonus, 1)}</dd></div>
          ${city.settlementIdentity === 'village' ? `<div><dt>Village Specialty</dt><dd>${specialty ? escapeHtml(specialty.label) : 'Not Chosen'}</dd></div>` : ''}
        </dl></section>
      </div>
      ${city.settlementIdentity === 'village' ? specialtyCards : ''}
      <div class='settlement-grid'>${advancementCard}${downgradeCard}${penaltyCard}</div>
      <p class='profile-note'>Build and manage Warehouse and Residential District levels from Buildings &gt; Civic &amp; Housing.</p>`;
    const bodies = {
      overview,
      buildings: settlementBuildingSections(state, region),
      population,
      administration: administration + parentTransferCard,
      development
    };

    return `      <section class='province-section settlement-panel'>
        <div class='province-section-title'><h3>Settlement</h3><span>${escapeHtml(roleLabel)} &middot; ${escapeHtml(tierLabel)}</span></div>
        ${bodies[activeTab]}
      </section>`;
  }

  function activeProvinceTab(state, region) {
    const ui = ensureUiState(state);
    const validTabs = ['info', 'resources', 'overview', 'buildings', 'population', 'administration', 'development'];
    const settlementExists = region && (cityForRegion(state, region.id) || outpostForRegion(state, region.id));
    const fallback = settlementExists ? 'overview' : 'info';
    if (!validTabs.includes(ui.provincePopoverTab)) ui.provincePopoverTab = fallback;
    return ui.provincePopoverTab;
  }

  function provinceTabPanel(activeTab, region, state, terrain, layerText) {
    if (activeTab === 'resources') {
      const detail = ensureUiState(state).resourceSiteDetail;
      if (detail && detail.regionId === region.id) return siteDetailPanel(region, state, detail.resourceId);
      return provinceResourcesPanel(region, state);
    }
    if (['overview', 'buildings', 'population', 'administration', 'development'].includes(activeTab)) {
      const detail = ensureUiState(state).processingBuildingDetail;
      if (activeTab === 'buildings' && detail && detail.regionId === region.id) {
        return namespace.uiManufacturing.detailPanel(state, detail.cityId, detail.buildingId);
      }
      const city = cityForRegion(state, region.id);
      const outpost = outpostForRegion(state, region.id);
      const settlement = city || outpost;
      if (settlement) {
        const ui = ensureUiState(state);
        ui.settlementDetailTabs = ui.settlementDetailTabs || {};
        const outpostMap = { overview: 'overview', buildings: 'buildings', population: 'population-transfers', administration: 'administration', development: 'development' };
        ui.settlementDetailTabs[settlement.id] = outpost && !city ? outpostMap[activeTab] : activeTab;
      }
      return provinceSettlementPanel(region, state);
    }
    return provinceInfoPanel(region, terrain, layerText, state);
  }

  function selectedRegionPopover(state) {
    const region = selectedRegion(state);
    if (!region || !isRegionRevealed(state, region)) return '';
    namespace.resourceSites.ensureRegionState(region);
    const terrain = terrainById(region.terrainId);
    const layerText = region.isWater ? 'Water' : region.notes.replace(' climate band', '');
    const activeTab = activeProvinceTab(state, region);
    const city = cityForRegion(state, region.id);
    const outpost = outpostForRegion(state, region.id);
    const siteCount = region.resourceSites.length;
    const projectCount = region.construction.projects.length;
    const titleType = city && city.regionId === region.id ? (city.isCapital ? 'CAPITAL' : city.level === 'city' ? 'CITY' : 'TOWN') : 'PROVINCE';
    const titleName = ['CAPITAL', 'TOWN', 'CITY'].includes(titleType) ? city.name : region.name;
    return `
      <aside class='province-popover province-popover-tabbed' aria-label='Selected province details' data-province-popover data-active-tab='${activeTab}'>
        <nav class='province-popover-tabs' aria-label='Province detail tabs'>
          ${[['info','Region Info'],['resources','Resources'],['overview','Overview'],['buildings','Buildings'],['population','Population'],['administration','Administration'],['development','Development']].map(([id,label]) => `<button type='button' class='province-tab-button ${activeTab === id ? 'active' : ''}' data-action='set-province-tab' data-tab='${id}'>${label}</button>`).join('')}
        </nav>
        <div class='province-popover-main'>
          <div class='province-popover-header' data-province-drag-handle>
            <div><p class='eyebrow'>${titleType}</p><h2>${escapeHtml(titleName)}</h2></div>
            <div class='province-window-actions'>
              <button type='button' class='province-popover-maximize' data-action='toggle-province-maximize' aria-label='Maximize province details'>${icon('maximize-2')}</button>
              <button type='button' class='province-popover-close' data-action='close-province' aria-label='Close province details'>${icon('x')}</button>
            </div>
          </div>
          ${provinceWorkforceStrip(state, region)}
          <div class='province-tab-panel'>${provinceTabPanel(activeTab, region, state, terrain, layerText)}</div>
        </div>
        ${['n','s','e','w','ne','nw','se','sw'].map((direction) => `<span class='province-resize-handle ${direction}' data-province-resize='${direction}'></span>`).join('')}
      </aside>
    `;
  }

  namespace.uiProvince = Object.freeze({
    addLog,
    tooltipAttributes,
    materialTooltipAttributes,
    tooltipTrigger,
    terrainLegend,
    categoryRows,
    resourceCatalog,
    optionsFor,
    terrainSummaryRows,
    traitSummaryTooltipBody,
    modelSummaryTooltipBody,
    formatNumber,
    formatEfficiency,
    eligibleResourceCandidates,
    candidateByResourceId,
    candidateDetail,
    selectedRegionPopover
  });
})(window.EcoRuler = window.EcoRuler || {});
