(function initializeRealmBranches(namespace) {
  const { escapeHtml: esc, escapeAttribute: attr } = namespace.uiCore;
  const fmt = (value, digits = 1) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const ui = (state) => namespace.uiViewport.ensureUiState(state);

  function role(city) {
    if (city.isCapital) return 'State Capital';
    if (city.settlementIdentity === 'village') return 'Village';
    const tier = city.settlementTier || city.level || 'town';
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  }

  function branches(state) {
    const cities = state.player.cities || [];
    return cities.filter(namespace.settlementHierarchy.isTownCenter)
      .map((center) => {
        const villages = cities.filter((city) => city.settlementIdentity === 'village' && city.parentTownId === center.id)
          .sort((a, b) => Number(b.population || 0) - Number(a.population || 0) || a.name.localeCompare(b.name));
        return {
          center,
          villages,
          population: [center].concat(villages).reduce((sum, city) => sum + Number(city.population || 0), 0)
        };
      })
      .sort((a, b) => Number(b.center.isCapital) - Number(a.center.isCapital)
        || b.population - a.population || a.center.name.localeCompare(b.center.name));
  }
  function warningFor(state, city, page) {
    if (page === 'living-standards') {
      const value = namespace.satisfaction.previewSettlement(state, city.id).actual;
      return value < 40 ? [3, 'Critical Satisfaction'] : value < 60 ? [2, 'Low Satisfaction'] : null;
    }
    if (page === 'health') {
      const value = namespace.health.previewSettlement(state, city.id).actual;
      return value < 40 ? [3, 'Critical Health'] : value < 60 ? [2, 'Low Health'] : null;
    }
    if (page === 'demographics') {
      const summary = city.demographicSummary || {};
      return Number(summary.rejectedImmigration) > 0 ? [2, 'Immigration Blocked'] : Number(summary.net) < 0 ? [2, 'Population Decline'] : null;
    }
    if (page === 'security') {
      const value = namespace.satisfaction.previewSettlement(state, city.id).components.security;
      return value < 5 ? [3, 'Critical Security'] : value < 10 ? [2, 'Security Shortage'] : null;
    }
    const admin = namespace.administration.reconcile(state);
    const parent = city.parentTownId ? namespace.administration.cityById(state, city.parentTownId) : null;
    const local = admin.localByCenter[city.id] || (parent && admin.localByCenter[parent.id]);
    const country = city.isCapital ? null : admin.country.branches[city.id] || (parent && admin.country.branches[parent.id]);
    if (country && country.coverage < 1) return [country.coverage < 0.5 ? 3 : 2, 'Country Control Shortage'];
    if (local && local.coverage < 1) return [local.coverage < 0.5 ? 3 : 2, 'Local Control Shortage'];
    return null;
  }

  function summary(state, city, page) {
    if (page === 'living-standards') {
      const row = namespace.satisfaction.previewSettlement(state, city.id);
      return 'Satisfaction ' + fmt(row.actual) + ' → ' + fmt(row.target) + ' | Food ' + row.row.food.reserveDays + ' Days';
    }
    if (page === 'health') {
      const row = namespace.health.previewSettlement(state, city.id);
      return 'Health ' + fmt(row.actual) + ' → ' + fmt(row.target) + ' | Medical Capacity ' + fmt(row.facility.capacity, 0);
    }
    if (page === 'demographics') {
      const row = namespace.health.previewSettlement(state, city.id);
      const daily = city.demographicSummary || { births: 0, deaths: 0, migration: 0 };
      return 'Population ' + fmt(city.population, 0) + ' | Today +' + (daily.births || 0) + ' / -' + (daily.deaths || 0)
        + ' / ' + ((daily.migration || 0) >= 0 ? '+' : '') + (daily.migration || 0) + ' | 30d '
        + (row.projections.days30.net >= 0 ? '+' : '') + row.projections.days30.net;
    }
    if (page === 'security') {
      const row = namespace.satisfaction.previewSettlement(state, city.id);
      const service = namespace.satisfaction.ensureService(city, 'local-watch');
      return 'Security ' + fmt(row.components.security) + ' / 10 | Watch ' + fmt(service.actualWorkers) + ' / ' + service.requiredWorkers;
    }
    const admin = namespace.administration.reconcile(state);
    const parent = city.parentTownId ? namespace.administration.cityById(state, city.parentTownId) : null;
    const local = admin.localByCenter[city.id] || (parent && admin.localByCenter[parent.id]);
    const country = city.isCapital ? null : admin.country.branches[city.id] || (parent && admin.country.branches[parent.id]);
    return 'Country ' + (country ? fmt(country.coverage * 100, 0) + '%' : '100%') + ' | Local '
      + (local ? fmt(local.coverage * 100, 0) + '%' : '100%');
  }

  function summaryLedger(state, city, page) {
    const lines = [];
    if (page === 'living-standards') {
      const row = namespace.satisfaction.previewSettlement(state, city.id);
      lines.push('Current: ' + fmt(row.actual), 'Target contributors:');
      Object.entries(row.components || {}).forEach(([key, value]) => lines.push(key + ': +' + fmt(value)));
      if (Number(row.penalty)) lines.push('Penalty: ' + fmt(row.penalty));
      lines.push('Final target: ' + fmt(row.target));
    } else if (page === 'health') {
      const row = namespace.health.previewSettlement(state, city.id);
      lines.push('Current: ' + fmt(row.actual), 'Target contributors:');
      Object.entries(row.components || {}).forEach(([key, value]) => lines.push(key + ': +' + fmt(value)));
      lines.push('Final target: ' + fmt(row.target));
    } else if (page === 'demographics') {
      const daily = city.demographicSummary || {};
      lines.push('Population source: settlement record', 'Births: +' + fmt(daily.births, 0),
        'Deaths: -' + fmt(daily.deaths, 0), 'Migration: ' + (Number(daily.migration || 0) >= 0 ? '+' : '') + fmt(daily.migration, 0),
        'Final daily net: ' + (Number(daily.net || 0) >= 0 ? '+' : '') + fmt(daily.net, 0));
    } else if (page === 'security') {
      const row = namespace.satisfaction.previewSettlement(state, city.id);
      const service = namespace.satisfaction.ensureService(city, 'local-watch');
      lines.push('Base maximum: +10.0', 'Assigned Watch: ' + fmt(service.actualWorkers),
        'Required Watch: ' + fmt(service.requiredWorkers), 'Final: ' + fmt(row.components.security));
    } else {
      const admin = namespace.administration.reconcile(state);
      const parent = city.parentTownId ? namespace.administration.cityById(state, city.parentTownId) : null;
      const local = admin.localByCenter[city.id] || (parent && admin.localByCenter[parent.id]);
      const country = city.isCapital ? null : admin.country.branches[city.id] || (parent && admin.country.branches[parent.id]);
      lines.push('Country capacity: +' + fmt(admin.country.capacity), 'Country allocation: -' + fmt(country ? country.allocation : 0),
        'Country coverage: ' + fmt((country ? country.coverage : 1) * 100) + '%',
        'Local capacity: +' + fmt(local ? local.capacity : 0), 'Local demand: -' + fmt(local ? local.demand : 0),
        'Local coverage: ' + fmt((local ? local.coverage : 1) * 100) + '%');
    }
    return attr(lines.join(String.fromCharCode(10)));
  }

  function branchList(state, page) {
    const stateUi = ui(state);
    stateUi.realmOpenBranches = stateUi.realmOpenBranches || {};
    stateUi.realmBranchProblemFirst = stateUi.realmBranchProblemFirst || {};
    const openId = stateUi.realmOpenBranches[page] || null;
    return '<div class="realm-branch-list">' + branches(state).map((branch) => {
      const members = [branch.center].concat(branch.villages);
      const problems = members.map((city) => ({ city, warning: warningFor(state, city, page) }))
        .filter((row) => row.warning).sort((a, b) => b.warning[0] - a.warning[0]);
      const highest = problems[0] && problems[0].warning;
      const expanded = openId === branch.center.id;
      const problemFirst = expanded && stateUi.realmBranchProblemFirst[page];
      const ordered = problemFirst
        ? problems.map((row) => row.city).concat(members.filter((city) => !problems.some((row) => row.city.id === city.id)))
        : members;
      return '<section class="realm-branch ' + (expanded ? 'expanded' : '') + '"><div class="realm-branch-heading">'
        + '<button type="button" class="realm-branch-name" data-action="toggle-realm-branch" data-page="' + attr(page)
        + '" data-center-id="' + attr(branch.center.id) + '"><span><strong>' + esc(branch.center.name) + '</strong><small>'
        + esc(role(branch.center)) + ' | ' + branch.villages.length + ' Direct Villages | ' + fmt(branch.population, 0)
        + ' Population</small></span><i>' + (expanded ? '−' : '+') + '</i></button>'
        + (highest ? '<button type="button" class="realm-warning severity-' + highest[0]
          + '" data-action="open-realm-branch-warnings" data-page="' + attr(page) + '" data-center-id="' + attr(branch.center.id)
          + '">' + esc(highest[1]) + ' · ' + problems.length + ' affected</button>' : '<b class="realm-ok">No Warnings</b>') + '</div>'
        + (expanded ? '<div class="realm-branch-members">' + ordered.map((city) => {
          const warning = warningFor(state, city, page);
          return '<button type="button" class="realm-settlement-row ' + (warning ? 'has-warning' : '')
            + '" data-action="focus-realm-settlement" data-page="' + attr(page) + '" data-region-id="' + attr(city.regionId)
            + '" title="' + summaryLedger(state, city, page) + '"><span><strong>' + esc(city.name)
            + '</strong><small>' + esc(role(city)) + '</small></span><span>' + esc(summary(state, city, page)) + '</span>'
            + (warning ? '<b class="realm-warning severity-' + warning[0] + '">' + esc(warning[1]) + '</b>' : '') + '</button>';
        }).join('') + '</div>' : '') + '</section>';
    }).join('') + '</div>';
  }
  function fields(page) {
    if (page === 'living-standards') return [
      ['meal-count', 'Meals', [['1', '1 Meal'], ['2', '2 Meals'], ['3', '3 Meals']]],
      ['drink-level', 'Drinks', namespace.satisfactionData.drinkLevelList.map((item) => [item.id, item.label])],
      ['religious-services', 'Religious Services Worker Cap', [['0', '0'], ['10', '10'], ['20', '20'], ['40', '40']]]
    ];
    if (page === 'health') return namespace.healthData.medicalProducts.map((product) => [
      'medical:' + product.id, product.label + ' Distribution', [['0', '0%'], ['25', '25%'], ['50', '50%'], ['75', '75%'], ['100', '100%']]
    ]);
    if (page === 'demographics') return [['allow-immigration', 'Allow Immigration', [['true', 'Allowed'], ['false', 'Blocked']]]];
    return [['local-watch', 'Local Watch Worker Cap', [['0', '0'], ['10', '10'], ['20', '20'], ['40', '40']]]];
  }

  function batchPanel(state, page) {
    const list = fields(page);
    const draft = ui(state).realmBatchPreview && ui(state).realmBatchPreview.page === page ? ui(state).realmBatchPreview : null;
    const branchOptions = branches(state).map((row) => '<option data-target-scope="branch" value="' + attr(row.center.id) + '">' + esc(row.center.name) + '</option>').join('');
    const settlementOptions = (state.player.cities || []).map((city) => '<option data-target-scope="settlement" value="' + attr(city.id) + '">' + esc(city.name) + '</option>').join('');
    return '<section class="realm-batch-panel"><div class="admin-section-heading"><div><h3>One-Time Batch Control</h3>'
      + '<p>Copies one selected field to compatible settlements only. No inheritance.</p></div></div>'
      + '<div class="realm-batch-form" data-realm-batch-form data-page="' + attr(page) + '"><label>Scope<select data-batch-scope>'
      + '<option value="all">All Settlements</option><option value="branch">Administrative Branch</option><option value="settlement">One Settlement</option>'
      + '</select></label><label>Target<select data-batch-target disabled><optgroup label="Branches">' + branchOptions
      + '</optgroup><optgroup label="Settlements">' + settlementOptions + '</optgroup></select></label>'
      + '<label>Field<select data-batch-field>' + list.map((field) => '<option value="' + attr(field[0]) + '">' + esc(field[1]) + '</option>').join('')
      + '</select></label><label>Value<select data-batch-value>' + list[0][2].map((option) => '<option value="' + attr(option[0]) + '">'
        + esc(option[1]) + '</option>').join('') + '</select></label><button type="button" data-action="preview-realm-batch">Preview</button></div>'
      + (draft ? '<div class="realm-batch-preview"><strong>' + draft.affected.length + ' affected; ' + draft.skipped.length + ' skipped</strong>'
        + (draft.skipped.length ? '<small>' + esc(draft.skipped.map((row) => row.name + ': ' + row.reason).join(' | ')) + '</small>' : '')
        + '<button type="button" class="primary-action" data-action="confirm-realm-batch">Confirm One-Time Copy</button></div>' : '') + '</section>';
  }

  function targetCities(state, scope, targetId) {
    if (scope === 'settlement') return (state.player.cities || []).filter((city) => city.id === targetId);
    if (scope === 'branch') {
      const branch = branches(state).find((row) => row.center.id === targetId);
      return branch ? [branch.center].concat(branch.villages) : [];
    }
    return (state.player.cities || []).slice();
  }

  function previewBatch(state, draft) {
    const affected = [];
    const skipped = [];
    targetCities(state, draft.scope, draft.targetId).forEach((city) => {
      const needsFacility = draft.field.indexOf('medical:') === 0;
      const compatible = !needsFacility || namespace.health.facilitySummary(state, city).capacity > 0;
      if (compatible) affected.push(city.id);
      else skipped.push({ id: city.id, name: city.name, reason: 'No active medical facility' });
    });
    ui(state).realmBatchPreview = { ...draft, affected, skipped };
    return ui(state).realmBatchPreview;
  }

  function confirmBatch(state) {
    const draft = ui(state).realmBatchPreview;
    if (!draft) return false;
    draft.affected.forEach((cityId) => {
      if (draft.field === 'meal-count') namespace.satisfaction.requestMealCount(state, cityId, draft.value);
      else if (draft.field === 'drink-level') namespace.satisfaction.requestDrinkLevel(state, cityId, draft.value);
      else if (draft.field === 'allow-immigration') namespace.health.requestAllowImmigration(state, cityId, draft.value === 'true');
      else if (draft.field.indexOf('medical:') === 0) namespace.health.requestMedicalDistribution(state, cityId, draft.field.slice(8), draft.value);
      else {
        const city = namespace.satisfaction.cityById(state, cityId);
        const service = namespace.satisfaction.ensureService(city, draft.field);
        namespace.satisfaction.requestServiceCap(state, cityId, draft.field, Math.min(Number(draft.value), service.requiredWorkers));
      }
    });
    ui(state).realmBatchPreview = null;
    return true;
  }

  function peoplePanel(state, page) {
    const realm = page === 'health' ? namespace.health.realmSummary(state)
      : page === 'living-standards' ? namespace.satisfaction.realmSummary(state) : null;
    const stats = realm ? (() => {
      const population = realm.settlements.reduce((sum, row) => {
        const city = namespace.satisfaction.cityById(state, row.cityId);
        return sum + Math.max(0, Number(city && city.population) || 0);
      }, 0);
      const ledger = (field) => realm.settlements.map((row) => {
        const city = namespace.satisfaction.cityById(state, row.cityId);
        const cityPopulation = Math.max(0, Number(city && city.population) || 0);
        const weight = population > 0 ? cityPopulation / population : 0;
        return `${city ? city.name : row.cityId}: ${fmt(row[field])} x ${fmt(weight * 100)}% = ${fmt(Number(row[field] || 0) * weight)}`;
      }).join('\n');
      const label = page === 'health' ? 'Health' : 'Satisfaction';
      const actualBody = `Population-weighted ${label.toLowerCase()} across all settlements.\n${ledger('actual')}\nFinal: ${fmt(realm.actual)}`;
      const targetBody = `Population-weighted configured target.\n${ledger('target')}\nFinal: ${fmt(realm.target)}\nCurrent -> Target: ${fmt(realm.actual)} -> ${fmt(realm.target)} (${fmt(realm.target - realm.actual)})`;
      const settlementsBody = `Included settlements: ${realm.settlements.length}\n` + realm.settlements.map((row) => {
        const city = namespace.satisfaction.cityById(state, row.cityId);
        return `${city ? city.name : row.cityId}: ${fmt(city && city.population, 0)} residents`;
      }).join('\n');
      return '<dl class="admin-stat-band"><div ' + namespace.uiProvince.tooltipAttributes(`Realm ${label}`, actualBody) + '><dt>Realm '
        + label + '</dt><dd>' + fmt(realm.actual) + '</dd></div><div '
        + namespace.uiProvince.tooltipAttributes('Target', targetBody) + '><dt>Target</dt><dd>' + fmt(realm.target) + '</dd></div><div '
        + namespace.uiProvince.tooltipAttributes('Settlements', settlementsBody) + '><dt>Settlements</dt><dd>' + realm.settlements.length + '</dd></div></dl>';
    })() : '';
    return stats + batchPanel(state, page) + branchList(state, page);
  }

  function ledgerTitle(finalValue, contributors) {
    const separator = String.fromCharCode(10);
    return contributors.map((row) => row.label + ': ' + (row.value >= 0 ? '+' : '') + fmt(row.value)).join(separator)
      + separator + 'Final: ' + fmt(finalValue);
  }

  function countryControlCompact(state, admin) {
    const rows = Object.values(admin.country.branches);
    return '<dl class="admin-stat-band"><div title="' + attr(ledgerTitle(admin.country.capacity, [
        { label: 'Administrative production', value: admin.country.produced },
        { label: 'Founder support', value: admin.country.founderActive ? admin.country.capacity - admin.country.produced : 0 }
      ])) + '"><dt>Country Capacity</dt><dd>' + fmt(admin.country.capacity) + '</dd></div>'
      + '<div title="' + attr(ledgerTitle(admin.country.allocated, rows.map((row) => ({
        label: (namespace.administration.cityById(state, row.centerId) || {}).name || row.centerId,
        value: -row.allocation
      })))) + '"><dt>Effective Allocation</dt><dd>' + fmt(admin.country.allocated) + '</dd></div>'
      + '<div title="' + attr(ledgerTitle(admin.country.spare, [
        { label: 'Capacity', value: admin.country.capacity }, { label: 'Reserved', value: -admin.country.reserved },
        { label: 'Allocated', value: -admin.country.allocated }
      ])) + '"><dt>Spare</dt><dd>' + fmt(admin.country.spare) + '</dd></div></dl>'
      + '<section class="admin-section"><div class="admin-section-heading"><div><h3>Country Control</h3>'
      + '<p>Compact branch allocation. Saved requests remain independently editable.</p></div></div><div class="admin-row-list">'
      + rows.map((row) => {
        const center = namespace.administration.cityById(state, row.centerId);
        return '<div class="realm-settlement-row" title="' + attr(ledgerTitle(row.coverage * 100, [
          { label: 'Demand', value: -row.demand.total }, { label: 'Saved request', value: row.requested },
          { label: 'Effective allocation', value: row.allocation }
        ])) + '"><span><strong>' + esc(center.name) + '</strong><small>Demand ' + fmt(row.demand.total)
          + ' | Allocated ' + fmt(row.allocation) + '</small></span><b class="' + (row.coverage < 1 ? 'realm-warning severity-2' : 'realm-ok')
          + '">' + fmt(row.coverage * 100, 0) + '%</b><label>Request <input type="number" min="0" max="' + row.demand.total
          + '" step="1" value="' + row.requested + '" data-country-control-input data-center-id="' + attr(center.id)
          + '"></label><button type="button" data-action="apply-country-control" data-center-id="' + attr(center.id) + '">Apply</button></div>';
      }).join('') + (rows.length ? '' : '<p class="empty-state-copy">No secondary branches require Country Control.</p>')
      + '</div></section>';
  }

  function localControlCompact(state, admin) {
    const rows = Object.values(admin.localByCenter);
    const totalCapacity = rows.reduce((sum, row) => sum + row.capacity, 0);
    const totalDemand = rows.reduce((sum, row) => sum + row.demand, 0);
    const totalSpare = rows.reduce((sum, row) => sum + row.spare, 0);
    return '<dl class="admin-stat-band"><div title="Source: summed Local Control capacity by center."><dt>Local Capacity</dt><dd>'
      + fmt(totalCapacity) + '</dd></div><div title="Source: summed demand from directly attached Villages."><dt>Village Demand</dt><dd>'
      + fmt(totalDemand) + '</dd></div><div title="' + attr(ledgerTitle(totalSpare, [
        { label: 'Capacity', value: totalCapacity }, { label: 'Village demand', value: -totalDemand }
      ])) + '"><dt>Local Spare</dt><dd>' + fmt(totalSpare) + '</dd></div></dl>'
      + '<section class="admin-section"><div class="admin-section-heading"><div><h3>Local Control</h3>'
      + '<p>Each center distributes coverage equally across its directly attached Villages.</p></div></div><div class="admin-row-list">'
      + rows.map((row) => {
        const center = namespace.administration.cityById(state, row.centerId);
        return '<button type="button" class="realm-settlement-row" data-action="focus-province" data-region-id="' + attr(center.regionId)
          + '" title="' + attr(ledgerTitle(row.coverage * 100, [{ label: 'Capacity', value: row.capacity },
            { label: 'Reserved', value: -row.reserved }, { label: 'Village demand', value: -row.demand },
            { label: 'Spare', value: row.spare }])) + '"><span><strong>' + esc(center.name) + '</strong><small>'
          + Object.keys(row.villages).length + ' Direct Villages | Capacity ' + fmt(row.capacity) + ' | Demand ' + fmt(row.demand)
          + '</small></span><b class="' + (row.coverage < 1 ? 'realm-warning severity-2' : 'realm-ok') + '">'
          + fmt(row.coverage * 100, 0) + '%</b><span>Spare ' + fmt(row.spare) + '</span></button>';
      }).join('') + '</div></section>';
  }

  function adminOfficesCompact(state) {
    const stateUi = ui(state);
    const openId = stateUi.realmOpenBranches && stateUi.realmOpenBranches['admin-offices'];
    const center = openId && namespace.administration.cityById(state, openId);
    return branchList(state, 'admin-offices') + (center
      ? '<section class="admin-section"><div class="admin-section-heading"><div><h3>' + esc(center.name)
        + ' Administrative Offices</h3><p>Only the selected branch office catalog is expanded.</p></div></div>'
        + namespace.uiAdministration.settlementSection(state, center, true, true) + '</section>'
      : '<p class="empty-state-copy">Expand one administrative center to manage its offices.</p>');
  }

  function administrationPanel(state, tab) {
    const admin = namespace.administration.reconcile(state);
    if (tab === 'admin-offices') return adminOfficesCompact(state);
    if (tab === 'country-control') return branchList(state, 'administration-country') + countryControlCompact(state, admin);
    if (tab === 'local-control') return branchList(state, 'administration-local') + localControlCompact(state, admin);
    const country = admin.country;
    const locals = Object.values(admin.localByCenter);
    const warnings = branches(state).reduce((sum, branch) =>
      sum + [branch.center].concat(branch.villages).filter((city) => warningFor(state, city, 'administration')).length, 0);
    const stats = [
      ['Country Capacity', country.capacity, [{ label: 'Administrative production', value: country.produced }, { label: 'Founder support', value: country.founderActive ? country.capacity - country.produced : 0 }]],
      ['Country Allocation', country.allocated, Object.values(country.branches).map((row) => ({ label: (namespace.administration.cityById(state, row.centerId) || {}).name || row.centerId, value: -row.allocation }))],
      ['Country Spare', country.spare, [{ label: 'Capacity', value: country.capacity }, { label: 'Reservations', value: -country.reserved }, { label: 'Allocation', value: -country.allocated }]],
      ['Local Capacity', locals.reduce((sum, row) => sum + row.capacity, 0), locals.map((row) => ({ label: (namespace.administration.cityById(state, row.centerId) || {}).name || row.centerId, value: row.capacity }))],
      ['Local Spare', locals.reduce((sum, row) => sum + row.spare, 0), locals.map((row) => ({ label: (namespace.administration.cityById(state, row.centerId) || {}).name || row.centerId, value: row.spare }))]
    ];
    return '<dl class="admin-stat-band">' + stats.map((item) => '<div title="' + attr(ledgerTitle(item[1], item[2])) + '"><dt>'
      + esc(item[0]) + '</dt><dd>' + fmt(item[1]) + '</dd></div>').join('')
      + '<div title="Source: Town, City, and State Capital records."><dt>Administrative Centers</dt><dd>' + branches(state).length + '</dd></div>'
      + '<div title="Source: active Country and Local Control warnings."><dt>Warnings</dt><dd>' + warnings + '</dd></div></dl>'
      + '<section class="admin-section"><div class="admin-section-heading"><div><h3>Administration Overview</h3>'
      + '<p>Read-only control summary. Hover derived values for positive and negative contributor ledgers.</p></div></div>'
      + branchList(state, 'administration') + '</section>';
  }
  namespace.uiRealmBranches = Object.freeze({
    role, branches, warningFor, branchList, fields, batchPanel, previewBatch, confirmBatch, peoplePanel, administrationPanel
  });
})(window.EcoRuler = window.EcoRuler || {});