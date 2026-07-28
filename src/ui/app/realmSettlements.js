(function initializeRealmSettlements(namespace) {
  const { escapeHtml: esc, escapeAttribute: attr } = namespace.uiCore;
  const fmt = (value, digits = 1) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const ui = (state) => namespace.uiViewport.ensureUiState(state);
  const ledger = (label, value, contributors = []) => attr(
    [label + ': ' + fmt(value)].concat(contributors).join(String.fromCharCode(10))
  );

  function availableResources(region) {
    return (region.resourceCandidates || []).filter((candidate) => candidate.available).map((candidate) => {
      const definition = namespace.uiCore.resourceById(candidate.resourceId);
      return { id: candidate.resourceId, label: definition ? definition.label : candidate.resourceId };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }

  function componentLedger(label, row) {
    const components = Object.entries(row.components || {}).map(([key, value]) => key + ': +' + fmt(value));
    return ledger(label, row.actual, ['Current: ' + fmt(row.actual), 'Target contributors:'].concat(components, ['Final target: ' + fmt(row.target)]));
  }

  function metrics(state, city) {
    const satisfaction = namespace.satisfaction.previewSettlement(state, city.id);
    const health = namespace.health.previewSettlement(state, city.id);
    const housing = namespace.developmentEconomy.housingSummary(city);
    const admin = namespace.administration.reconcile(state);
    const parent = city.parentTownId ? namespace.administration.cityById(state, city.parentTownId) : null;
    const local = admin.localByCenter[city.id] || (parent && admin.localByCenter[parent.id]);
    const country = city.isCapital ? null : admin.country.branches[city.id] || (parent && admin.country.branches[parent.id]);
    return {
      population: Number(city.population || 0), satisfaction: satisfaction.actual, health: health.actual,
      housing: housing.coverage * 100, control: Math.min(local ? local.coverage : 1, country ? country.coverage : 1) * 100,
      satisfactionDetail: satisfaction, healthDetail: health, housingDetail: housing, local, country
    };
  }

  function hierarchy(state) {
    return '<section class="admin-section"><div class="admin-section-heading"><div><h3>Settlement Hierarchy</h3>'
      + '<p>Centers contain direct Villages only. Secondary centers remain separate Capital branches.</p></div></div>'
      + namespace.uiRealmBranches.branchList(state, 'settlements') + '<h3>Independent Outposts</h3>'
      + ((state.player.outposts || []).length ? '<div class="admin-row-list">' + state.player.outposts.map((outpost) =>
        '<button type="button" class="admin-select-row" data-action="focus-province" data-region-id="' + attr(outpost.regionId)
        + '"><span><strong>' + esc(outpost.name) + '</strong><small>Independent Outpost</small></span></button>').join('') + '</div>'
        : '<p class="empty-state-copy">No Outposts founded.</p>') + '</section>';
  }

  function development(state) {
    const stateUi = ui(state);
    const selectedId = stateUi.settlementDevelopmentSelection || ((state.player.cities || [])[0] || {}).id;
    const city = namespace.administration.cityById(state, selectedId);
    if (city) stateUi.settlementDevelopmentSelection = city.id;
    const summary = city && namespace.developmentEconomy.developmentSummary(state, city.id);
    return '<section class="admin-section"><div class="admin-section-heading"><div><h3>Settlement Development</h3>'
      + '<p>Select one settlement; local decisions open their full province detail flow.</p></div>'
      + '<select data-action="select-settlement-development">' + (state.player.cities || []).map((item) =>
        '<option value="' + attr(item.id) + '" ' + (city && item.id === city.id ? 'selected' : '') + '>' + esc(item.name) + '</option>').join('')
      + '</select></div>' + (city ? '<button type="button" class="settlement-summary-row" data-action="focus-province" data-region-id="'
        + attr(city.regionId) + '"><span><strong>' + esc(city.name) + '</strong><small>' + esc(namespace.uiRealmBranches.role(city))
        + '</small></span><span><small>Population</small><b>' + fmt(city.population, 0) + '</b></span><span><small>Development</small><b>'
        + fmt(summary.used) + ' / ' + fmt(summary.total) + '</b></span><span>Open Settlement Decisions</span></button>' : '') + '</section>';
  }

  function table(state) {
    const stateUi = ui(state);
    const sort = stateUi.settlementTableSort || { key: 'population', direction: 'desc' };
    const rows = (state.player.cities || []).map((city) => ({ city, metrics: metrics(state, city) }));
    rows.sort((a, b) => {
      const first = sort.key === 'name' ? a.city.name : a.metrics[sort.key];
      const second = sort.key === 'name' ? b.city.name : b.metrics[sort.key];
      const difference = typeof first === 'string' ? first.localeCompare(second) : Number(first) - Number(second);
      return sort.direction === 'asc' ? difference : -difference;
    });
    const headings = [['name', 'Settlement'], ['population', 'Population'], ['satisfaction', 'Satisfaction'],
      ['health', 'Health'], ['housing', 'Housing'], ['control', 'Control']];
    return '<section class="admin-section"><div class="admin-section-heading"><div><h3>Settlement Table</h3>'
      + '<p>Flat sortable realm comparison. Capital is not pinned.</p></div><button type="button" data-action="reset-settlement-sort">Reset Sort</button></div>'
      + '<div class="realm-table-wrap"><table class="realm-table"><thead><tr>' + headings.map((heading) =>
        '<th><button type="button" data-action="sort-settlement-table" data-sort-key="' + heading[0] + '">' + heading[1]
        + (sort.key === heading[0] ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '') + '</button></th>').join('')
      + '</tr></thead><tbody>' + rows.map((row) => {
        const warning = namespace.uiRealmBranches.warningFor(state, row.city, 'living-standards')
          || namespace.uiRealmBranches.warningFor(state, row.city, 'health')
          || namespace.uiRealmBranches.warningFor(state, row.city, 'administration');
        const local = row.metrics.local;
        const country = row.metrics.country;
        return '<tr class="' + (warning ? 'has-warning' : '') + '" data-action="focus-province" data-region-id="' + attr(row.city.regionId)
          + '"><th>' + esc(row.city.name) + '<small>' + esc(namespace.uiRealmBranches.role(row.city)) + '</small>'
          + (warning ? '<b class="realm-warning severity-' + warning[0] + '">' + esc(warning[1]) + '</b>' : '') + '</th><td title="'
          + ledger('Population', row.metrics.population, ['Source: settlement population record']) + '">' + fmt(row.metrics.population, 0)
          + '</td><td title="' + componentLedger('Satisfaction', row.metrics.satisfactionDetail) + '">' + fmt(row.metrics.satisfaction)
          + '</td><td title="' + componentLedger('Health', row.metrics.healthDetail) + '">' + fmt(row.metrics.health)
          + '</td><td title="' + ledger('Housing coverage', row.metrics.housing, ['Occupied: ' + fmt(row.city.population, 0),
            'Capacity: ' + fmt(row.metrics.housingDetail.capacity, 0)]) + '">' + fmt(row.metrics.housing, 0)
          + '%</td><td title="' + ledger('Control coverage', row.metrics.control, [
            'Country: ' + fmt((country ? country.coverage : 1) * 100) + '%',
            'Local: ' + fmt((local ? local.coverage : 1) * 100) + '%',
            'Final: lower coverage'
          ]) + '">' + fmt(row.metrics.control, 0) + '%</td></tr>';
      }).join('')
      + '</tbody></table></div></section>';
  }
  function settlementsPanel(state, tab) {
    return tab === 'hierarchy' ? hierarchy(state) : tab === 'development' ? development(state) : table(state);
  }

  function frontierRows(state) {
    const source = (state.player.cities || []).find((city) => city.isCapital) || (state.player.cities || [])[0];
    const stateUi = ui(state);
    const sort = stateUi.frontierSort || 'eligibility';
    const rows = state.map.regions.filter((region) => !region.isWater && !namespace.uiRealm.isPlayerControlled(region))
      .map((region) => {
        const availability = namespace.uiRealm.outpostAvailability(state, region, source && source.id);
        const preview = availability.preview || {};
        const resources = availableResources(region);
        const foodCost = Number(preview.food && preview.food.required && preview.food.required.total || 0);
        const materialCost = Object.values(preview.materials || {}).reduce((sum, value) => sum + Number(value || 0), 0);
        return {
          region, availability, preview,
          distance: Number.isFinite(preview.distance) ? preview.distance : Number.POSITIVE_INFINITY,
          cost: foodCost + materialCost, foodCost, materialCost, resources,
          resource: resources.map((item) => item.label).join(', ')
        };
      });
    rows.sort((a, b) => {
      if (sort === 'distance') return a.distance - b.distance || a.region.name.localeCompare(b.region.name);
      if (sort === 'cost') return a.cost - b.cost || a.distance - b.distance;
      if (sort === 'resource') return a.resource.localeCompare(b.resource) || a.region.name.localeCompare(b.region.name);
      return Number(b.availability.allowed) - Number(a.availability.allowed) || a.cost - b.cost || a.distance - b.distance;
    });
    return rows;
  }

  function frontier(state) {
    const stateUi = ui(state);
    const sort = stateUi.frontierSort || 'eligibility';
    const rows = frontierRows(state);
    return '<section class="admin-section"><div class="admin-section-heading"><div><h3>Frontier Overview</h3>'
      + '<p>Eligible provinces appear first by default; ineligible rows remain visible with their reasons.</p></div><label>Sort <select data-action="set-frontier-sort">'
      + [['eligibility', 'Eligibility'], ['cost', 'Cost'], ['distance', 'Distance'], ['resource', 'Resource']]
        .map((item) => '<option value="' + item[0] + '" ' + (sort === item[0] ? 'selected' : '') + '>' + item[1] + '</option>').join('')
      + '</select></label></div><div class="frontier-table">' + rows.map((row) =>
        '<button type="button" class="realm-settlement-row ' + (row.availability.allowed ? '' : 'ineligible')
        + '" data-action="focus-province" data-region-id="' + attr(row.region.id) + '"><span><strong>' + esc(row.region.name)
        + '</strong><small>' + esc(row.resource || 'No available resource') + ' | Distance '
        + (Number.isFinite(row.distance) ? row.distance : 'N/A') + '</small></span><span title="Food: ' + fmt(row.foodCost, 0)
        + '&#10;Materials: ' + fmt(row.materialCost, 0) + '">Cost ' + fmt(row.cost, 0) + '</span><b>'
        + (row.availability.allowed ? 'Eligible' : esc(row.availability.reason || 'Ineligible')) + '</b></button>').join('')
      + (rows.length ? '' : '<p class="empty-state-copy">No frontier provinces are currently visible.</p>') + '</div></section>';
  }
  function outposts(state) {
    const stateUi = ui(state);
    const sort = stateUi.outpostSort || 'name';
    const source = (state.player.cities || []).find((city) => city.isCapital) || (state.player.cities || [])[0];
    const rows = (state.player.outposts || []).map((outpost) => {
      const region = namespace.uiViewport.regionById(state, outpost.regionId);
      const resources = region ? availableResources(region) : [];
      const explicit = outpost.resourceId && namespace.uiCore.resourceById(outpost.resourceId);
      return {
        outpost, region,
        resource: explicit ? explicit.label : resources.map((item) => item.label).join(', ') || 'Unassigned',
        population: Number(outpost.population || 0),
        workforce: Number(outpost.workforceAvailable || 0),
        output: Number(outpost.lastOutput || 0),
        distance: source ? namespace.outpostLifecycle.landDistance(state, source.regionId, outpost.regionId) : 0
      };
    }).sort((a, b) => {
      const first = sort === 'name' ? a.outpost.name : a[sort];
      const second = sort === 'name' ? b.outpost.name : b[sort];
      return typeof first === 'string' ? first.localeCompare(second) : Number(second) - Number(first);
    });
    return '<section class="admin-section"><div class="admin-section-heading"><h3>Outposts</h3><label>Sort <select data-action="set-outpost-sort">'
      + [['name', 'Name'], ['resource', 'Resource'], ['population', 'Population'], ['workforce', 'Workforce'], ['output', 'Output'], ['distance', 'Distance']]
        .map((item) => '<option value="' + item[0] + '" ' + (sort === item[0] ? 'selected' : '') + '>' + item[1] + '</option>').join('')
      + '</select></label></div><div class="realm-table-wrap"><table class="realm-table"><thead><tr><th>Outpost</th><th>Resource</th>'
      + '<th>Population</th><th>Workforce</th><th>Output</th><th>Distance</th><th>Eligibility</th></tr></thead><tbody>'
      + rows.map((row) => '<tr data-action="focus-province" data-region-id="' + attr(row.outpost.regionId) + '"><th>' + esc(row.outpost.name)
        + '</th><td>' + esc(row.resource) + '</td><td>' + fmt(row.population, 0) + '</td><td>' + fmt(row.workforce, 0)
        + '</td><td>' + fmt(row.output) + '</td><td>' + row.distance + '</td><td>Active</td></tr>').join('')
      + '</tbody></table></div></section>';
  }

  function transfers(state) {
    const stateUi = ui(state);
    const showCompleted = Boolean(stateUi.showCompletedTransfers);
    const rank = { 'in-transit': 0, 'departure-pending': 1, arrived: 2, cancelled: 3 };
    const orders = namespace.outpostLifecycle.ensureState(state).settlerOrders
      .filter((order) => showCompleted || !['arrived', 'cancelled'].includes(order.status))
      .sort((a, b) => (rank[a.status] == null ? 9 : rank[a.status]) - (rank[b.status] == null ? 9 : rank[b.status]));
    return '<section class="admin-section"><div class="admin-section-heading"><div><h3>Settler Transfers</h3>'
      + '<p>Active first, waiting second, completed last.</p></div><label><input type="checkbox" data-action="toggle-completed-transfers" '
      + (showCompleted ? 'checked' : '') + '> Show Completed</label></div><div class="transfer-compact-list">'
      + orders.map((order) => {
        const from = namespace.outpostLifecycle.settlementById(state, order.sourceId);
        const to = namespace.outpostLifecycle.settlementById(state, order.destinationId)
          || (state.player.outposts || []).find((item) => item.id === order.outpostId);
        return '<div class="realm-settlement-row"><span><strong>' + esc((from && from.name) || 'Frontier') + ' → '
          + esc((to && to.name) || 'Destination') + '</strong><small>' + fmt(order.amount, 0) + ' Settlers</small></span><span>'
          + esc(order.status) + (order.status === 'in-transit' ? ' | ' + order.remainingDays + ' Days' : '') + '</span></div>';
      }).join('') + (orders.length ? '' : '<p class="empty-state-copy">No transfers in this view.</p>') + '</div></section>';
  }

  function expansionPanel(state, tab) {
    return tab === 'frontier' ? frontier(state) : tab === 'outposts' ? outposts(state) : transfers(state);
  }

  namespace.uiRealmSettlements = Object.freeze({ metrics, settlementsPanel, frontierRows, expansionPanel });
})(window.EcoRuler = window.EcoRuler || {});