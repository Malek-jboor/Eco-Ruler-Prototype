(function initializeRealmProduction(namespace) {
  const { escapeHtml: esc, escapeAttribute: attr } = namespace.uiCore;
  const fmt = (value, digits = 1) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const ui = (state) => namespace.uiViewport.ensureUiState(state);

  function statusFor(target, required, processing) {
    const requested = Math.min(required, Math.max(0, Number(target.pendingWorkerCap == null ? target.workerCap : target.pendingWorkerCap) || 0));
    const shortage = Math.max(0, requested - Number(target.actualWorkers || 0));
    const label = String(target.status || '');
    return {
      worker: shortage > 0,
      tool: Number(target.toolMultiplier == null ? 1 : target.toolMultiplier) < 0.999,
      maintenance: Number(target.maintenanceCoverage == null ? 1 : target.maintenanceCoverage) < 0.999,
      storage: label === 'Storage Full',
      input: processing && label === 'Input Shortage',
      inactive: ['Idle', 'Unstaffed', 'Capacity Disabled', 'Max Cap'].includes(label) || requested === 0,
      alerts: shortage > 0 || label.indexOf('Shortage') >= 0 || label === 'Storage Full' || label === 'Max Cap',
      requested,
      shortage
    };
  }

  function rows(state, tab) {
    const processing = tab === 'processing';
    const result = [];
    if (processing) {
      namespace.uiManufacturing.productionRows(state).forEach((row) => {
        const required = namespace.manufacturing.requiredWorkers(state, row.building);
        result.push({
          typeId: row.building.buildingId, label: row.label, location: row.city.name,
          regionId: row.city.regionId, cityId: row.city.id, target: row.building, required,
          status: statusFor(row.building, required, true)
        });
      });
    } else {
      state.map.regions.forEach((region) => (region.resourceSites || []).filter((site) => Number(site.level) > 0).forEach((site) => {
        const definition = namespace.uiCore.siteForResource(site.resourceId);
        const required = namespace.workforce.requiredWorkers(site);
        result.push({
          typeId: definition.id, label: definition.label, location: region.name,
          regionId: region.id, resourceId: site.resourceId, target: site, required,
          status: statusFor(site, required, false)
        });
      }));
    }
    return result;
  }

  function filterBar(state, tab) {
    const stateUi = ui(state);
    stateUi.productionFilters = stateUi.productionFilters || {};
    const selected = stateUi.productionFilters[tab] || (stateUi.productionFilters[tab] = {});
    const definitions = [['worker', 'Worker Shortage'], ['tool', 'Tool Shortage'], ['maintenance', 'Maintenance Shortage'],
      ['storage', 'Storage Blocked'], ['inactive', 'Inactive'], ['alerts', 'Has Alerts']];
    if (tab === 'processing') definitions.splice(4, 0, ['input', 'Input Shortage']);
    return '<nav class="realm-filter-bar" aria-label="Production filters">' + definitions.map((item) =>
      '<button type="button" data-action="toggle-production-filter" data-tab="' + attr(tab) + '" data-filter="' + item[0]
      + '" class="' + (selected[item[0]] ? 'active' : '') + '">' + item[1] + '</button>').join('') + '</nav>';
  }

  function batchFields(state, tab, typeId) {
    const standard = [
      ['worker-percent', 'Worker Cap', [['0', '0%'], ['25', '25%'], ['50', '50%'], ['75', '75%'], ['100', '100%']]],
      ['maintenance-priority', 'Maintenance Priority', namespace.developmentData.priorities.map((value) => [value, value])],
      ['tool-mode', 'Tool Mode', namespace.developmentData.toolModes.map((value) => [value, value])],
      ['tool-priority', 'Tool Priority', namespace.developmentData.priorities.map((value) => [value, value])]
    ];
    if (tab !== 'processing') return standard;
    const definition = namespace.manufacturing.definitionById(typeId);
    if (!definition || definition.recipes.length <= 1) return standard;
    const sources = rows(state, tab).filter((row) => row.typeId === typeId)
      .map((row) => [row.cityId, row.location + ' current allocation']);
    return standard.concat([['allocation-profile', 'Recipe / Output Allocation', sources]]);
  }

  function sortGroups(groups, sort) {
    return groups.sort((a, b) => {
      const first = sort.key === 'instances' ? a.rows.length : sort.key === 'warnings' ? a.warnings : a.label;
      const second = sort.key === 'instances' ? b.rows.length : sort.key === 'warnings' ? b.warnings : b.label;
      const difference = typeof first === 'string' ? first.localeCompare(second) : first - second;
      return sort.direction === 'desc' ? -difference : difference;
    });
  }

  function workerControl(row, processing) {
    const cap = Math.min(row.required, Math.max(0, Number(row.target.pendingWorkerCap == null ? row.target.workerCap : row.target.pendingWorkerCap) || 0));
    const action = processing ? 'quick-processing-worker-cap' : 'set-worker-cap';
    const data = processing ? ' data-city-id="' + attr(row.cityId) + '" data-building-id="' + attr(row.typeId) + '"'
      : ' data-region-id="' + attr(row.regionId) + '" data-resource-id="' + attr(row.resourceId) + '"';
    const pending = row.target.pendingWorkerCap != null;
    return '<div class="realm-instance-worker-control"><span><strong>Workers ' + fmt(row.target.actualWorkers) + ' / ' + cap + '</strong>'
      + '<small class="' + (row.status.shortage > 0 ? 'realm-warning' : 'realm-ok') + '">Shortage ' + fmt(row.status.shortage) + ' | Required ' + fmt(row.required) + '</small></span>'
      + '<input type="range" class="compact-worker-slider" data-action="' + action + '" min="0" max="' + row.required + '" step="1" value="' + cap + '"'
      + data + ' aria-label="Worker Cap for ' + attr(row.label + ' in ' + row.location) + '">'
      + '<small>' + (pending ? 'Pending next tick' : 'Applies next tick') + '</small></div>';
  }

  function productionPanel(state, tab) {
    if (tab === 'overview') return namespace.uiNavigation.productionPanel(state, 'overview');
    const stateUi = ui(state);
    const selected = (stateUi.productionFilters || {})[tab] || {};
    const allRows = rows(state, tab);
    const visible = allRows.filter((row) => Object.keys(selected).every((key) => !selected[key] || row.status[key]));
    stateUi.productionSort = stateUi.productionSort || {};
    const sort = stateUi.productionSort[tab] || { key: 'type', direction: 'asc' };
    const grouped = Object.values(visible.reduce((result, row) => {
      result[row.typeId] = result[row.typeId] || { id: row.typeId, label: row.label, rows: [] };
      result[row.typeId].rows.push(row);
      return result;
    }, {})).map((group) => ({ ...group, warnings: group.rows.filter((row) => row.status.alerts).length }));
    sortGroups(grouped, sort);
    stateUi.productionOpenTypes = stateUi.productionOpenTypes || {};
    const open = stateUi.productionOpenTypes[tab] || null;
    const processing = tab === 'processing';
    const sortButton = (key, label) => '<button type="button" data-action="sort-production-types" data-tab="' + attr(tab)
      + '" data-sort-key="' + key + '">' + label + (sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '') + '</button>';
    return filterBar(state, tab) + '<section class="admin-section"><div class="admin-section-heading"><div><h3>'
      + (processing ? 'Processing Buildings' : 'Resource Sites') + '</h3><p>Victoria-style type groups. Filters combine; default sort is alphabetical.</p></div>'
      + '<span>' + visible.length + ' / ' + allRows.length + '</span></div><div class="production-sort-heading">'
      + sortButton('type', 'Type') + sortButton('instances', 'Instances') + sortButton('warnings', 'Warnings') + '</div><div class="production-type-list">'
      + grouped.map((group) => {
        const expanded = open === group.id;
        const preview = stateUi.productionBatchPreview;
        const fields = batchFields(state, tab, group.id);
        const field = fields[0];
        return '<section class="production-type-group"><button type="button" class="realm-branch-heading" data-action="toggle-production-type" '
          + 'data-tab="' + attr(tab) + '" data-type-id="' + attr(group.id) + '"><span><strong>' + esc(group.label)
          + '</strong><small>' + group.rows.length + ' Instances</small></span><b class="' + (group.warnings ? 'realm-warning severity-2' : 'realm-ok')
          + '">' + group.warnings + ' Warnings</b><i>' + (expanded ? '−' : '+') + '</i></button>'
          + (expanded ? '<div class="production-instance-list">' + group.rows.map((row) =>
            '<div class="realm-production-instance-row"><button type="button" class="production-instance-link" data-action="' + (processing ? 'focus-processing-building' : 'focus-resource-site')
            + '" data-region-id="' + attr(row.regionId) + '" ' + (processing
              ? 'data-city-id="' + attr(row.cityId) + '" data-building-id="' + attr(row.typeId) + '"'
              : 'data-resource-id="' + attr(row.resourceId) + '"')
            + '><span><strong>' + esc(row.location) + '</strong><small>Level ' + Number(row.target.level || 0) + '</small></span>'
            + '<small>Workers ' + fmt(row.target.actualWorkers) + ' / ' + row.status.requested + ' | ' + esc(row.target.status || 'Active')
            + workerControl(row, processing)
            + (row.status.alerts ? '<b class="realm-warning severity-2">Needs Attention</b>' : '')
            + '</div>').join('')
            + '<div class="production-batch-control" data-production-batch-form data-tab="' + attr(tab) + '" data-type-id="' + attr(group.id)
            + '"><label>Setting<select data-production-batch-field>' + fields.map((entry) => '<option value="' + attr(entry[0]) + '">'
              + esc(entry[1]) + '</option>').join('') + '</select></label><label>Value<select data-production-batch-value>'
              + field[2].map((entry) => '<option value="' + attr(entry[0]) + '">' + esc(entry[1]) + '</option>').join('')
            + '</select></label><button type="button" data-action="preview-production-batch">Preview Type Batch</button></div>'
            + (preview && preview.tab === tab && preview.typeId === group.id
              ? '<div class="realm-batch-preview"><strong>' + preview.affected.length + ' affected; ' + preview.skipped.length
                + ' skipped</strong><small>Affected: ' + esc(preview.affected.map((row) => row.label).join(', ') || 'None')
                + (preview.skipped.length ? ' | Skipped: ' + esc(preview.skipped.map((row) => row.label + ': ' + row.reason).join(', ')) : '')
                + '. Only the compatible selected setting is copied. No inheritance.</small>'
                + '<button type="button" data-action="confirm-production-batch">Confirm Compatible Settings</button></div>' : '')
            + '</div>' : '') + '</section>';
      }).join('') + (grouped.length ? '' : '<p class="empty-state-copy">No building types match the active filters.</p>') + '</div></section>';
  }

  function previewBatch(state, tab, typeId, field, value) {
    const candidates = rows(state, tab).filter((row) => row.typeId === typeId);
    const source = field === 'allocation-profile' && candidates.find((row) => row.cityId === value);
    const compatible = source || field !== 'allocation-profile';
    const affected = compatible ? candidates.map((row) => ({
      id: row.cityId || row.regionId + ':' + row.resourceId,
      label: row.location
    })) : [];
    const skipped = compatible ? [] : candidates.map((row) => ({
      id: row.cityId || row.regionId + ':' + row.resourceId,
      label: row.location,
      reason: 'The selected allocation source is unavailable.'
    }));
    ui(state).productionBatchPreview = { tab, typeId, field, value, affected, skipped };
    return ui(state).productionBatchPreview;
  }

  function confirmBatch(state) {
    const draft = ui(state).productionBatchPreview;
    if (!draft) return false;
    const candidates = rows(state, draft.tab).filter((row) => row.typeId === draft.typeId);
    const source = draft.field === 'allocation-profile' && candidates.find((row) => row.cityId === draft.value);
    candidates.forEach((row) => {
      if (draft.field === 'worker-percent') {
        const cap = Math.round(row.required * Math.max(0, Math.min(100, Number(draft.value) || 0)) / 100);
        if (draft.tab === 'processing') namespace.manufacturing.requestWorkerCap(state, row.cityId, row.typeId, cap);
        else namespace.workforce.requestWorkerCap(state, row.regionId, row.resourceId, cap);
      } else if (draft.field === 'allocation-profile' && source) {
        namespace.manufacturing.requestAllocations(state, row.cityId, row.typeId,
          source.target.pendingAllocations || source.target.allocations);
      } else {
        const changes = {};
        if (draft.field === 'maintenance-priority') changes.maintenancePriority = draft.value;
        if (draft.field === 'tool-mode') changes.toolMode = draft.value;
        if (draft.field === 'tool-priority') changes.toolPriority = draft.value;
        namespace.developmentEconomy.requestSettings(row.target, changes);
      }
    });
    ui(state).productionBatchPreview = null;
    return true;
  }
  function projectStatus(project) {
    if (project.blockedReason) return 'blocked';
    if (project.status === 'waiting') return 'queued';
    return project.status;
  }

  function constructionProjects(state) {
    const stateUi = ui(state);
    stateUi.constructionProjectFilters = stateUi.constructionProjectFilters || {};
    const selected = stateUi.constructionProjectFilters;
    const definitions = [['active', 'Active'], ['queued', 'Queued'], ['paused', 'Paused'], ['blocked', 'Blocked']];
    const activeFilters = Object.keys(selected).filter((key) => selected[key]);
    const matches = (project) => !activeFilters.length || activeFilters.includes(projectStatus(project));
    const groups = state.map.regions.map((region) => ({
      region,
      projects: namespace.constructionQueue.orderedProjects(region).filter(matches)
    })).filter((group) => group.projects.length);
    const count = groups.reduce((sum, group) => sum + group.projects.length, 0);
    const outpostRegionIds = new Set((state.player.outposts || []).map((outpost) => outpost.regionId));
    const settlementGroups = groups.filter((group) => !outpostRegionIds.has(group.region.id));
    const outpostGroups = groups.filter((group) => outpostRegionIds.has(group.region.id));
    const renderGroups = (items) => items.map((group) => {
      const outpost = (state.player.outposts || []).find((item) => item.regionId === group.region.id);
      const label = outpost ? outpost.name + ' | ' + group.region.name : group.region.name;
      return '<section class="construction-province-group"><button type="button" class="province-group-heading" '
        + 'data-action="focus-province" data-region-id="' + attr(group.region.id) + '"><span>' + esc(label)
        + '</span></button>' + namespace.uiNavigation.queueProjectRows(group.region, matches) + '</section>';
    }).join('');
    return '<nav class="realm-filter-bar" aria-label="Construction project filters">' + definitions.map((item) =>
      '<button type="button" data-action="toggle-construction-filter" data-filter="' + item[0] + '" class="'
      + (selected[item[0]] ? 'active' : '') + '">' + item[1] + '</button>').join('')
      + '</nav><section class="admin-section"><div class="admin-section-heading"><div><h3>Construction Projects</h3>'
      + '<p>Filters change visibility only; every province keeps its independent queue and controls.</p></div><span>' + count + '</span></div>'
      + (groups.length ? '<h4>Settlement Provinces</h4>' + renderGroups(settlementGroups)
        + '<h4>Independent Outposts</h4>' + (outpostGroups.length ? renderGroups(outpostGroups) : '<p class="empty-state-copy">No Outpost projects.</p>')
        : '<p class="empty-state-copy">Nothing Under Construction.</p>') + '</section>';
  }

  namespace.uiRealmProduction = Object.freeze({
    statusFor, rows, filterBar, batchFields, productionPanel, previewBatch, confirmBatch, constructionProjects
  });
})(window.EcoRuler = window.EcoRuler || {});