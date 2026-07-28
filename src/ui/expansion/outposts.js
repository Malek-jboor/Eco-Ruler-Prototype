(function initializeOutpostExpansionUi(namespace) {
  const { escapeHtml, escapeAttribute, resourceById } = namespace.uiCore;
  const { ensureUiState } = namespace.uiViewport;

  const format = (value, digits = 0) => namespace.uiStorage.formatNumber(Number(value) || 0, digits);
  const icon = (name) => `<i data-lucide='${escapeAttribute(name)}' aria-hidden='true'></i>`;

  function activeOrders(state) {
    return namespace.outpostLifecycle.ensureState(state).settlerOrders
      .filter((order) => ['departure-pending', 'in-transit'].includes(order.status));
  }

  function materialRows(state, materials, shortages = {}) {
    return Object.entries(materials || {}).map(([resourceId, amount]) => {
      const item = namespace.storageLedger.storageItemById[resourceId];
      const available = Number(state.storage.available[resourceId]) || 0;
      const enough = !shortages[resourceId] && available + 0.000001 >= amount;
      return `<div class='expansion-cost-row ${enough ? 'enough' : 'short'}'><span>${escapeHtml(item ? item.label : resourceId)}</span><b>${format(amount)} / ${format(available)}</b></div>`;
    }).join('');
  }

  function foodRows(state, food) {
    if (!food) return '';
    const proteinAvailable = namespace.expansionData.PROTEIN_RESOURCES
      .reduce((sum, id) => sum + (Number(state.storage.available[id]) || 0), 0);
    const rows = [
      ['Bread', food.required.bread, Number(state.storage.available.bread) || 0],
      ['Protein', food.required.protein, proteinAvailable],
      ['Vegetables', food.required.vegetables, Number(state.storage.available.vegetables) || 0],
      ['Fruit', food.required.fruit, Number(state.storage.available.fruit) || 0]
    ];
    return rows.map(([label, required, available]) => (
      `<div class='expansion-cost-row ${available + 0.000001 >= required ? 'enough' : 'short'}'><span>${label}</span><b>${format(required)} / ${format(available)}</b></div>`
    )).join('');
  }

  function projectProgress(project) {
    if (!project) return '';
    const percent = Math.min(100, Math.max(0, project.progressDays / project.durationDays * 100));
    return `<div class='expansion-project'>
      <div><strong>${escapeHtml(project.label)}</strong><span>${format(project.progressDays)} / ${format(project.durationDays)} Days</span></div>
      <div class='project-progress-track'><span style='width:${percent}%'></span></div>
      <small>${project.blockedReason ? escapeHtml(project.blockedReason) : escapeHtml(project.status)}</small>
    </div>`;
  }

  function foundingPanel(state, region) {
    const ui = ensureUiState(state);
    ui.outpostFoundingSources = ui.outpostFoundingSources || {};
    const base = namespace.uiRealm.outpostAvailability(state, region);
    const selectedId = ui.outpostFoundingSources[region.id]
      || (base.preview && base.preview.source && base.preview.source.id)
      || '';
    const availability = namespace.uiRealm.outpostAvailability(state, region, selectedId);
    const preview = availability.preview;
    if (availability.project) {
      return `<section class='settlement-outpost-action'>${projectProgress(availability.project)}
        <button type='button' data-action='cancel-construction' data-region-id='${escapeAttribute(region.id)}' data-project-id='${escapeAttribute(availability.project.id)}'>Cancel Founding</button>
      </section>`;
    }
    const options = availability.previews.map((item) => (
      `<option value='${escapeAttribute(item.source.id)}' ${item.source.id === selectedId ? 'selected' : ''}>${escapeHtml(item.source.name)} | ${Number.isFinite(item.distance) ? item.distance + ' Provinces' : 'Out of Range'}</option>`
    )).join('');
    return `<section class='settlement-outpost-action expansion-action-card'>
      <label>Expedition Source<select data-action='select-outpost-source' data-region-id='${escapeAttribute(region.id)}'>${options}</select></label>
      ${preview ? `<dl class='province-fact-list'>
        <div><dt>Settlers</dt><dd>50</dd></div>
        <div><dt>Distance</dt><dd>${format(preview.distance)} Provinces</dd></div>
        <div><dt>Effort</dt><dd>${format(preview.profile && preview.profile.effort * 100, 2)}%</dd></div>
        <div><dt>Duration</dt><dd>${format(preview.profile && preview.profile.durationDays)} Days</dd></div>
        <div><dt>Food</dt><dd>${format(preview.food && preview.food.required.total)}</dd></div>
      </dl><div class='expansion-costs'><h5>Founding Materials</h5>${materialRows(state, preview.materials, preview.shortages)}<h5>Expedition Food</h5>${foodRows(state, preview.food)}</div>` : ''}
      <button type='button' class='primary-action' data-action='build-outpost' data-source-id='${escapeAttribute(selectedId)}' ${availability.allowed ? '' : 'disabled'}>${availability.allowed ? icon('flag') : icon('lock-keyhole')}Start Founding</button>
      <p>${escapeHtml(availability.reason)}</p>
    </section>`;
  }

  function orderRows(state, outpostId = null) {
    const orders = namespace.outpostLifecycle.ensureState(state).settlerOrders
      .filter((order) => !outpostId || order.outpostId === outpostId)
      .slice().reverse();
    if (!orders.length) return `<p class='empty-state-copy'>No settler or relocation orders.</p>`;
    return `<div class='admin-row-list expansion-order-list'>${orders.map((order) => {
      const source = namespace.outpostLifecycle.settlementById(state, order.sourceId)
        || namespace.outpostLifecycle.outpostById(state, order.sourceId);
      const destination = namespace.outpostLifecycle.settlementById(state, order.destinationId)
        || namespace.outpostLifecycle.outpostById(state, order.destinationId);
      return `<article class='admin-select-row expansion-order-row'>
        ${icon(order.kind === 'relocation' ? 'move-right' : 'users')}
<span><strong>${format(order.amount)} Residents</strong><small>${escapeHtml(source ? source.name : 'Frontier')} &rarr; ${escapeHtml(destination ? destination.name : 'Destination')} | ${escapeHtml(order.status)}${order.status === 'in-transit' ? ' | ' + format(order.remainingDays) + ' Days' : ''}</small></span>
        ${order.status === 'departure-pending' ? `<button type='button' data-action='cancel-settler-order' data-order-id='${escapeAttribute(order.id)}'>Cancel</button>` : ''}
      </article>`;
    }).join('')}</div>`;
  }

  function populationPanel(state, outpost) {
    const incoming = namespace.outpostLifecycle.incomingSettlers(state, outpost.id);
    return `<div class='settlement-grid'>
      <section class='settlement-card'><h4>Population</h4><dl class='province-fact-list'>
        <div><dt>Residents</dt><dd>${format(outpost.population)}</dd></div>
        <div><dt>Incoming</dt><dd>${format(incoming)}</dd></div>
        <div><dt>Player-Sent Cap</dt><dd>500</dd></div>
        <div><dt>Temporary Camp</dt><dd>Automatic</dd></div>
      </dl></section>
      <section class='settlement-card'><h4>Send Settlers</h4>
        <label class='expansion-number'>Amount<input type='number' min='1' step='1' value='50' data-settler-amount data-outpost-id='${escapeAttribute(outpost.id)}'></label>
        <button type='button' class='primary-action' data-action='choose-settler-source' data-outpost-id='${escapeAttribute(outpost.id)}'>${icon('map-pin')}Choose Source on Map</button>
        <p>Each order uses one source. Repeat orders to use more settlements.</p>
      </section>
    </div>
    <section class='expansion-list-section'><h4>Orders</h4>${orderRows(state, outpost.id)}</section>`;
  }

  function specialtyCards(state, outpost, parentId) {
    const region = namespace.outpostLifecycle.regionById(state, outpost.regionId);
    const draftCity = { settlementKind: 'village', settlementIdentity: 'village', settlementTier: 'village', specialtyId: null };
    const cards = namespace.developmentEconomy.specialtyCards(draftCity, region);
    return cards.map((card) => {
      const preview = parentId
        ? namespace.outpostLifecycle.villageConversionPreview(state, outpost.id, parentId, card.id)
        : null;
      const demand = preview && preview.demand ? preview.demand.total : 'Not Available';
      const compatibility = preview && preview.compatibility;
      const reason = preview ? preview.reason : 'Choose a parent Town first.';
      const selectTooltip = preview
        ? namespace.uiProvince.materialTooltipAttributes(state, 'Select ' + card.label,
          reason + '\nLocal Control Required: ' + format(preview.demand.total) + '\nLocal Control Available: ' + format(preview.localSpare), preview.materials)
        : namespace.uiProvince.tooltipAttributes('Select ' + card.label, reason);
      return `<article class='settlement-card specialty-conversion-card ${card.eligible ? '' : 'disabled'}' data-specialty-card='${escapeAttribute(card.id)}'>
        <header><h4>${escapeHtml(card.label)}</h4><span>${card.eligible ? 'Eligible' : 'Ineligible'}</span></header>
        <dl class='province-fact-list'>
          <div><dt>Development</dt><dd>${format(card.developmentCapacity, 1)}</dd></div>
          <div><dt>General Resource</dt><dd>${format(card.generalResourceCapacity, 1)}</dd></div>
          <div><dt>Matching Bonus</dt><dd>+${format(card.matchingResourceBonus, 1)}</dd></div>
          <div><dt>Local Demand</dt><dd>${format(demand)}</dd></div>
          <div><dt>Current Site</dt><dd>${compatibility ? escapeHtml(compatibility.reason) : 'Choose parent'}</dd></div>
        </dl>
        ${preview ? `<details><summary>Cost & Buildings</summary><div class='expansion-costs'>${materialRows(state, preview.materials, preview.shortages)}</div><p>${escapeHtml(card.allowedBuildings.join(', '))}</p></details>` : ''}
        <button type='button' data-action='select-outpost-specialty' data-outpost-id='${escapeAttribute(outpost.id)}' data-specialty-id='${escapeAttribute(card.id)}' ${selectTooltip} ${card.eligible && parentId ? '' : 'disabled'}>${icon('check')}Select</button>
        <small>${escapeHtml(reason)}</small>
      </article>`;
    }).join('');
  }

  function conversionPanel(state, outpost) {
    const region = namespace.outpostLifecycle.regionById(state, outpost.regionId);
    const project = namespace.constructionQueue.ensureQueue(region).projects
      .find((item) => item.kind === 'outpost-conversion');
    if (project) {
      return `${projectProgress(project)}<div class='expansion-costs'>${materialRows(state, project.materials)}</div>
        <button type='button' data-action='cancel-construction' data-region-id='${escapeAttribute(region.id)}' data-project-id='${escapeAttribute(project.id)}'>Cancel Conversion</button>`;
    }
    const ui = ensureUiState(state);
    ui.outpostConversionDrafts = ui.outpostConversionDrafts || {};
    const draft = ui.outpostConversionDrafts[outpost.id] || (ui.outpostConversionDrafts[outpost.id] = {});
    const parent = namespace.outpostLifecycle.settlementById(state, draft.parentTownId);
    const villagePreview = parent && draft.specialtyId
      ? namespace.outpostLifecycle.villageConversionPreview(state, outpost.id, parent.id, draft.specialtyId)
      : null;
    const townPreview = namespace.outpostLifecycle.townConversionPreview(state, outpost.id);
    return `<section class='conversion-choice'>
      <div class='province-section-title'><h4>Convert to Village</h4><span>120 Days</span></div>
      <div class='conversion-parent-row'><span>Parent Town: <strong>${escapeHtml(parent ? parent.name : 'Not Chosen')}</strong></span><button type='button' data-action='choose-village-parent' data-outpost-id='${escapeAttribute(outpost.id)}'>${icon('map-pin')}Choose on Map</button></div>
      <div class='settlement-grid village-specialty-grid'>${specialtyCards(state, outpost, parent && parent.id)}</div>
      <button type='button' class='primary-action' data-action='start-outpost-village-conversion' data-outpost-id='${escapeAttribute(outpost.id)}' ${villagePreview && villagePreview.allowed ? '' : 'disabled'}>${icon('house')}Start Village Conversion</button>
      <p>${escapeHtml(villagePreview ? villagePreview.reason : 'Choose a parent Town and specialty.')}</p>
    </section>
    <section class='conversion-choice'>
      <div class='province-section-title'><h4>Convert to Town</h4><span>240 Days</span></div>
      <dl class='province-fact-list'>
        <div><dt>Population</dt><dd>${format(outpost.population)} / 500</dd></div>
        <div><dt>Country Demand</dt><dd>${format(townPreview.demand && townPreview.demand.total)}</dd></div>
        <div><dt>Country Spare</dt><dd>${format(townPreview.countrySpare)}</dd></div>
        <div><dt>Founder Housing</dt><dd>1,200</dd></div>
      </dl>
      <div class='expansion-costs'>${materialRows(state, townPreview.materials, townPreview.shortages)}</div>
      <button type='button' class='primary-action' data-action='start-outpost-town-conversion' data-outpost-id='${escapeAttribute(outpost.id)}' ${townPreview.allowed ? '' : 'disabled'}>${icon('building-2')}Start Town Conversion</button>
      <p>${escapeHtml(townPreview.reason)}</p>
    </section>`;
  }

  function dismantlePanel(state, outpost) {
    const incoming = namespace.outpostLifecycle.incomingSettlers(state, outpost.id);
    return `<section class='conversion-choice danger-zone'>
      <div class='province-section-title'><h4>Relocate Residents</h4><span>Optional Groups</span></div>
      <label class='expansion-number'>Amount<input type='number' min='1' max='${Math.max(1, Number(outpost.population) || 1)}' step='1' value='${Math.min(50, Math.max(1, Number(outpost.population) || 1))}' data-relocation-amount data-outpost-id='${escapeAttribute(outpost.id)}'></label>
      <button type='button' data-action='choose-relocation-destination' data-outpost-id='${escapeAttribute(outpost.id)}' ${outpost.population > 0 ? '' : 'disabled'}>${icon('map-pin')}Choose Destination</button>
    </section>
    <section class='conversion-choice danger-zone'>
      <div class='province-section-title'><h4>Dismantle Outpost</h4><span>No Site Refund</span></div>
      <p>All remaining residents evacuate to one owned settlement. The Resource Site is removed and the province becomes unowned.</p>
      <p>Incoming groups: <strong>${format(incoming)}</strong></p>
      <button type='button' class='danger-action' data-action='choose-dismantle-destination' data-outpost-id='${escapeAttribute(outpost.id)}' ${incoming > 0 ? 'disabled' : ''}>${icon('trash-2')}Choose Evacuation Destination</button>
    </section>`;
  }

  function beginSelection(state, mode) {
    const ui = ensureUiState(state);
    ui.expansionSelectionMode = { ...mode };
    ui.activeMainPanel = null;
    state.map.selectedRegionId = null;
    return ui.expansionSelectionMode;
  }

  function selectionAvailability(state, region, mode = ensureUiState(state).expansionSelectionMode) {
    if (!mode || !region) return null;
    const settlement = (state.player.cities || []).find((city) => city.regionId === region.id) || null;
    if (mode.type === 'internal-transfer-select-source') {
      if (!settlement) return { allowed: false, reason: 'Choose an owned settlement source.' };
      const availability = namespace.outpostLifecycle.internalTransferAvailability(settlement);
      return {
        allowed: availability.maxTransferable > 0,
        reason: availability.maxTransferable > 0 ? 'Eligible population source.' : 'No unassigned 60/40 resident group is available.',
        source: settlement,
        ...availability
      };
    }
    if (mode.type === 'internal-transfer-select-destination') {
      if (!settlement || settlement.id === mode.sourceId) return { allowed: false, reason: 'Choose a different owned settlement destination.' };
      return namespace.outpostLifecycle.internalTransferPreview(state, mode.sourceId, settlement.id, mode.amount);
    }
    if (mode.type === 'internal-transfer-source') {
      if (!settlement) return { allowed: false, reason: 'Choose an owned settlement source.' };
      return namespace.outpostLifecycle.internalTransferPreview(state, settlement.id, mode.destinationId, mode.amount);
    }
    if (mode.type === 'settler-source') {
      if (!settlement) return { allowed: false, reason: 'Choose an owned settlement center.' };
      return namespace.outpostLifecycle.transferPreview(state, settlement.id, mode.outpostId, mode.amount);
    }
    if (mode.type === 'village-parent') {
      if (!settlement || !namespace.settlementHierarchy.isTownCenter(settlement)) return { allowed: false, reason: 'Choose a Town, City, or the Capital.' };
      const outpost = namespace.outpostLifecycle.outpostById(state, mode.outpostId);
      const distance = outpost ? namespace.outpostLifecycle.landDistance(state, settlement.regionId, outpost.regionId, 3) : Infinity;
      const local = namespace.administration.reconcile(state).localByCenter[settlement.id];
      const allowed = Number.isFinite(distance) && distance >= 1 && distance <= 3;
      return { allowed, reason: allowed ? 'Eligible parent center.' : 'The parent must be within three land provinces.', parent: settlement, distance, localSpare: Number(local && local.spare) || 0 };
    }
    if (mode.type === 'village-reparent') {
      if (!settlement || !namespace.settlementHierarchy.isTownCenter(settlement)) return { allowed: false, reason: 'Choose a Town, City, or the Capital.' };
      return namespace.settlementLifecycle.parentTransferPreview(state, mode.villageId, settlement.id);
    }    if (mode.type === 'relocation-destination' || mode.type === 'dismantle-destination') {
      if (!settlement) return { allowed: false, reason: 'Choose an owned settlement center.' };
      return mode.type === 'dismantle-destination'
        ? namespace.outpostLifecycle.dismantlePreview(state, mode.outpostId, settlement.id)
        : namespace.outpostLifecycle.relocationPreview(state, mode.outpostId, settlement.id, mode.amount);
    }
    return { allowed: false, reason: 'Unknown map-selection mode.' };
  }

  function selectionPresentation(state, region) {
    const mode = ensureUiState(state).expansionSelectionMode;
    if (!mode) return null;
    const preview = selectionAvailability(state, region, mode);
    const title = {
      'internal-transfer-source': 'Population Transfer Source',
      'settler-source': 'Settler Source',
      'internal-transfer-select-source': 'Population Transfer Source',
      'internal-transfer-select-destination': 'Population Transfer Destination',
      'village-parent': 'Village Parent',
      'village-reparent': 'Transfer Village Parent',
      'relocation-destination': 'Relocation Destination',
      'dismantle-destination': 'Evacuation Destination'
    }[mode.type] || 'Expansion Selection';
    const lines = [preview.reason];
    if (Number.isFinite(preview.distance)) lines.push('Distance: ' + preview.distance + ' Provinces');
    if (preview.durationDays) lines.push('Travel: ' + preview.durationDays + ' Days');
    if (preview.food && preview.food.required) lines.push('Food: ' + format(preview.food.required.total));
    if (preview.sourcePopulationAfter !== undefined) lines.push('Source Population: ' + format(preview.sourcePopulationAfter));
    if (preview.sourceWorkforceAfter !== undefined) lines.push('Source Workforce: ' + format(preview.sourceWorkforceAfter));
    if (preview.sourceHousingCapacity !== undefined) lines.push('Source Housing: ' + format(preview.sourcePopulationAfter) + ' / ' + format(preview.sourceHousingCapacity));
    if (preview.population !== undefined) lines.push('Population: ' + format(preview.population));
    if (preview.workforce !== undefined) lines.push('Workforce: ' + format(preview.workforce));
    if (preview.assignedWorkforce !== undefined) lines.push('Assigned Workers: ' + format(preview.assignedWorkforce));
    if (preview.availableWorkforce !== undefined) lines.push('Available Workers: ' + format(preview.availableWorkforce));
    if (preview.nonWorkforce !== undefined) lines.push('Non-workforce: ' + format(preview.nonWorkforce));
    if (preview.maxTransferable !== undefined) lines.push('Maximum Transferable: ' + format(preview.maxTransferable));
    if (preview.sourceAvailable !== undefined) lines.push('Maximum Transferable: ' + format(preview.sourceAvailable));
    if (preview.projectedPopulation !== undefined) lines.push('Outpost After Arrival: ' + format(preview.projectedPopulation));
    if (preview.destinationPopulationAfter !== undefined) lines.push('Destination Population: ' + format(preview.destinationPopulationAfter));
    if (preview.destinationWorkforceAfter !== undefined) lines.push('Destination Workforce: ' + format(preview.destinationWorkforceAfter));
    if (preview.destinationHousingCapacity !== undefined) {
      lines.push('Housing: ' + format(preview.destinationPopulationAfter) + ' / ' + format(preview.destinationHousingCapacity));
      if (preview.destinationHousingShortageAfter > 0) lines.push('Housing Shortage: ' + format(preview.destinationHousingShortageAfter));
    }
    if (preview.localSpare !== undefined) lines.push('Local Control Spare: ' + format(preview.localSpare));
    if (preview.demand !== undefined) lines.push('Local Control Demand: ' + format(preview.demand));
    if (preview.paperCost !== undefined) lines.push('Paper Cost: ' + format(preview.paperCost));
    if (preview.countryPreview) {
      lines.push('Old Parent Country Demand: ' + format(preview.countryPreview.oldParentBefore) + ' -> ' + format(preview.countryPreview.oldParentAfter));
      lines.push('New Parent Country Demand: ' + format(preview.countryPreview.newParentBefore) + ' -> ' + format(preview.countryPreview.newParentAfter));
    }
    const materialRows = [];
    if (preview.paperCost !== undefined) materialRows.push({ label: 'Paper', required: preview.paperCost, available: preview.paperAvailable, enough: preview.paperAvailable + 0.000001 >= preview.paperCost });
    if (preview.food && preview.food.required) {
      const proteinAvailable = namespace.expansionData.PROTEIN_RESOURCES
        .reduce((sum, id) => sum + (Number(state.storage.available[id]) || 0), 0);
      [
        ['Bread', preview.food.required.bread, Number(state.storage.available.bread) || 0],
        ['Protein', preview.food.required.protein, proteinAvailable],
        ['Vegetables', preview.food.required.vegetables, Number(state.storage.available.vegetables) || 0],
        ['Fruit', preview.food.required.fruit, Number(state.storage.available.fruit) || 0]
      ].forEach(([label, required, available]) => materialRows.push({
        label,
        required,
        available,
        enough: available + 0.000001 >= required
      }));
    }
    return {
      preview,
      title,
      body: lines.join('\n'),
      materialRows,
      className: preview.allowed ? ' selection-eligible' : ' selection-ineligible'
    };
  }
  function selectionBanner(state) {
    const mode = ensureUiState(state).expansionSelectionMode;
    if (!mode) return '';
    const label = {
      'internal-transfer-source': 'Choose Source on Map',
      'settler-source': 'Choose one settlement source',
      'village-parent': 'Choose a parent Town within 3 provinces',
      'village-reparent': 'Choose a new parent Town within 3 provinces',
      'internal-transfer-select-source': 'Choose the population source',
      'internal-transfer-select-destination': 'Choose the destination',
      'relocation-destination': 'Choose a relocation destination',
      'dismantle-destination': 'Choose the final evacuation destination'
    }[mode.type] || 'Choose a province';
    return `<div class='map-selection-banner'>${icon('map-pin')}<span><strong>${escapeHtml(label)}</strong><small>Eligible choices are green. Right-click or Cancel to exit.</small></span><button type='button' data-action='cancel-expansion-selection'>Cancel</button></div>`;
  }

  function selectMapTarget(state, regionId) {
    const ui = ensureUiState(state);
    const mode = ui.expansionSelectionMode;
    const region = namespace.outpostLifecycle.regionById(state, regionId);
    const preview = selectionAvailability(state, region, mode);
    if (!mode || !preview || !preview.allowed) return { ok: false, reason: preview ? preview.reason : 'No expansion selection is active.' };
    const settlement = (state.player.cities || []).find((city) => city.regionId === regionId) || null;
    if (mode.type === 'internal-transfer-select-source') {
      const availability = namespace.outpostLifecycle.internalTransferAvailability(settlement);
      ui.expansionSelectionMode = {
        type: 'internal-transfer-select-destination',
        sourceId: settlement.id,
        amount: Math.max(1, Math.min(50, availability.maxTransferable))
      };
      return { ok: true, reason: settlement.name + ' selected. Choose the destination.' };
    }
    if (mode.type === 'internal-transfer-select-destination') {
      ui.internalTransferDraft = {
        sourceId: mode.sourceId,
        destinationId: settlement.id,
        amount: mode.amount
      };
      delete ui.expansionSelectionMode;
      ui.activeMainPanel = 'people';
      ui.mainPanelTabs = ui.mainPanelTabs || {};
      ui.mainPanelTabs.people = 'overview';
      return { ok: true, reason: 'Destination selected. Review and confirm the transfer.' };
    }
    if (mode.type === 'village-parent') {
      ui.outpostConversionDrafts = ui.outpostConversionDrafts || {};
      ui.outpostConversionDrafts[mode.outpostId] = { ...(ui.outpostConversionDrafts[mode.outpostId] || {}), parentTownId: settlement.id };
      delete ui.expansionSelectionMode;
      const outpost = namespace.outpostLifecycle.outpostById(state, mode.outpostId);
      state.map.selectedRegionId = outpost && outpost.regionId;
      if (outpost) {
        ui.settlementDetailTabs = ui.settlementDetailTabs || {};
        ui.settlementDetailTabs[outpost.id] = 'conversion';
      }
      return { ok: true, reason: `${settlement.name} selected as parent Town.` };
    }
    if (mode.type === 'village-reparent') {
      const result = namespace.settlementLifecycle.transferParent(state, mode.villageId, settlement.id);
      if (result.ok) delete ui.expansionSelectionMode;
      const village = namespace.settlementLifecycle.settlementById(state, mode.villageId);
      state.map.selectedRegionId = village ? village.regionId : settlement.regionId;
      return result;
    }    let result;
    if (mode.type === 'internal-transfer-source') result = namespace.outpostLifecycle.sendInternalResidents(state, settlement.id, mode.destinationId, mode.amount);
    if (mode.type === 'settler-source') result = namespace.outpostLifecycle.sendSettlers(state, settlement.id, mode.outpostId, mode.amount);
    if (mode.type === 'relocation-destination') result = namespace.outpostLifecycle.relocateResidents(state, mode.outpostId, settlement.id, mode.amount);
    if (mode.type === 'dismantle-destination') result = namespace.outpostLifecycle.dismantleOutpost(state, mode.outpostId, settlement.id, { confirmOverflow: true });
    if (result && result.ok) delete ui.expansionSelectionMode;
    const outpost = namespace.outpostLifecycle.outpostById(state, mode.outpostId);
    state.map.selectedRegionId = outpost ? outpost.regionId : settlement.regionId;
    return result || { ok: false, reason: 'Selection action failed.' };
  }

  function frontierPanel(state) {
    const projects = state.map.regions.flatMap((region) => namespace.constructionQueue.ensureQueue(region).projects
      .filter((project) => project.kind === 'outpost-founding').map((project) => ({ region, project })));
    return `<section class='admin-section'><div class='admin-section-heading'><h3>Frontier Overview</h3><span>${projects.length} Projects</span></div>
      <p class='empty-state-copy'>Select a revealed unowned province and open Settlement to start an Outpost expedition.</p>
      ${projects.map(({ region, project }) => `<button type='button' class='admin-select-row' data-action='focus-province' data-region-id='${escapeAttribute(region.id)}'>${icon('flag')}<span><strong>${escapeHtml(region.name)}</strong><small>${format(project.progressDays)} / ${format(project.durationDays)} Days</small></span>${icon('chevron-right')}</button>`).join('')}
    </section>`;
  }

  function outpostsPanel(state) {
    const outposts = state.player.outposts || [];
    return `<section class='admin-section'><div class='admin-section-heading'><h3>Outposts</h3><span>${outposts.length}</span></div>${outposts.length ? `<div class='admin-row-list'>${outposts.map((outpost) => `<button type='button' class='admin-select-row' data-action='focus-province' data-region-id='${escapeAttribute(outpost.regionId)}'>${icon('tent')}<span><strong>${escapeHtml(outpost.name)}</strong><small>${format(outpost.population)} residents | ${format(namespace.outpostLifecycle.incomingSettlers(state, outpost.id))} incoming</small></span>${icon('chevron-right')}</button>`).join('')}</div>` : `<p class='empty-state-copy'>No completed Outposts.</p>`}</section>`;
  }

  function transfersPanel(state) {
    return `<section class='admin-section'><div class='admin-section-heading'><h3>Settler Transfers</h3><span>${activeOrders(state).length} Active</span></div>${orderRows(state)}</section>`;
  }

  namespace.uiExpansion = Object.freeze({
    foundingPanel,
    populationPanel,
    conversionPanel,
    dismantlePanel,
    beginSelection,
    selectionAvailability,
    selectionPresentation,
    selectionBanner,
    selectMapTarget,
    frontierPanel,
    outpostsPanel,
    transfersPanel
  });
})(window.EcoRuler = window.EcoRuler || {});
