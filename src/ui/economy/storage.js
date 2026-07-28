(function initializeStorageUi(namespace) {
  const { escapeHtml, escapeAttribute } = namespace.uiCore;

  function formatNumber(value) {
    const rounded = Math.round((Number(value) || 0) * 2) / 2;
    return rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function signedNumber(value, digits = 2) {
    const numeric = Number(value || 0);
    if (!numeric) return '0';
    return (numeric > 0 ? '+' : '') + formatNumber(numeric, digits);
  }

  function flowClass(value) {
    const numeric = Number(value || 0);
    return numeric > 0 ? 'positive' : numeric < 0 ? 'negative' : 'neutral';
  }

  function flowGroups(row, period) {
    const contributors = period === 'daily'
      ? row.dailyContributors
      : row.seasonalContributors;
    return contributors.map((entry) => ({
      label: entry.label,
      amount: Number(entry.amount || 0),
      details: (entry.details || []).map((detail) => ({ label: detail.label, amount: Number(detail.amount || 0) }))
    }));
  }

  function flowTooltip(row, period) {
    const contributors = flowGroups(row, period);
    const finalValue = period === 'daily' ? row.dailyNet : row.seasonalNet;
    const lines = contributors.length ? ['Hover a group to view contributors.'] : ['No known changes.'];
    lines.push('Final: ' + signedNumber(finalValue, 4));
    return lines.join('\n');
  }

  function netValue(row, period) {
    const value = period === 'daily' ? row.dailyNet : row.seasonalNet;
    const title = period === 'daily' ? 'Daily Net' : 'Seasonal Forecast';
    return '<span class="inventory-net ' + flowClass(value) + '" '
      + namespace.uiProvince.tooltipAttributes(title, flowTooltip(row, period)) + ' '
      + 'data-tooltip-groups="' + escapeAttribute(JSON.stringify(flowGroups(row, period))) + '"'
      + '>' + signedNumber(value, 4) + '</span>';
  }

  function ledgerItemIds() {
    return namespace.storageLedger.storageItems.map((item) => item.id);
  }

  function stockStatus(state, row) {
    const cap = namespace.storageLedger.productCapAvailability(state.storage, row.resourceId);
    const pending = namespace.storageLedger.productCapFor(state.storage, row.resourceId, true);
    return {
      cap,
      pending,
      negative: row.dailyNet < 0,
      out: row.current <= 0,
      near: cap.max != null && cap.max > 0 && row.current >= cap.max * 0.9,
      stopped: cap.stopped
    };
  }

  function stockFilters(state) {
    const ui = namespace.uiViewport.ensureUiState(state);
    ui.inventoryFilters = ui.inventoryFilters || {};
    return ui.inventoryFilters;
  }

  function rowMatchesFilters(status, filters) {
    if (filters.negative && !status.negative) return false;
    if (filters.out && !status.out) return false;
    if (filters.near && !status.near) return false;
    if (filters.stopped && !status.stopped) return false;
    return true;
  }

  function capEditor(state, row, status) {
    const ledger = state.storage;
    const pendingReservations = ledger.pendingStorageReservations || ledger.storageReservations || {};
    const activeReserve = Number((ledger.storageReservations || {})[row.resourceId]) || 0;
    const pendingReserve = Number(pendingReservations[row.resourceId]) || 0;
    const pendingChanged = (ledger.pendingProductCaps != null
      && JSON.stringify(status.pending) !== JSON.stringify(status.cap))
      || (ledger.pendingStorageReservations != null && pendingReserve !== activeReserve);
    const stateUi = namespace.uiViewport.ensureUiState(state);
    stateUi.inventoryCapDrafts = stateUi.inventoryCapDrafts || {};
    stateUi.inventoryPolicyConfirmations = stateUi.inventoryPolicyConfirmations || {};
    const draft = stateUi.inventoryCapDrafts[row.resourceId];
    const minValue = draft ? draft.min : status.pending.min;
    const autoMin = draft ? Boolean(draft.autoMin) : Boolean(status.pending.autoMin);
    const maxValue = draft ? draft.max : (status.pending.max == null ? '' : status.pending.max);
    const reserveValue = draft ? draft.reserve : pendingReserve;
    const item = namespace.storageLedger.storageItemById[row.resourceId];
    const otherReservedPoints = Object.entries(pendingReservations).reduce((sum, [resourceId, units]) => (
      resourceId === row.resourceId
        ? sum
        : sum + (Number(units) || 0) * namespace.storageLedger.storageItemById[resourceId].coefficient
    ), 0);
    const maxReservableUnits = Math.max(0, ledger.capacity - otherReservedPoints) / item.coefficient;
    const warningMax = maxValue === '' ? null : Number(maxValue);
    const capacityWarning = warningMax != null && warningMax * item.coefficient > ledger.capacity
      ? '<small class="product-cap-warning">Max is unreachable with current total storage.</small>'
      : '';
    const applied = stateUi.inventoryPolicyConfirmations[row.resourceId] && !pendingChanged
      ? '<small class="product-policy-applied">Applied — Min ' + formatNumber(status.cap.min)
        + ' | Max ' + (status.cap.max == null ? 'Unlimited' : formatNumber(status.cap.max))
        + ' | Reserve ' + formatNumber(activeReserve) + '</small>'
      : '';
    return '<div class="product-cap-editor" data-product-cap-row data-resource-id="' + escapeAttribute(row.resourceId) + '">'
      + '<label>Min ' + (autoMin ? '<small>Auto 80%</small>' : '') + '<input type="number" min="0" step="0.5" value="' + escapeAttribute(minValue) + '" data-product-cap-min></label>'
      + '<label>Max <input type="number" min="0" step="0.5" placeholder="Unlimited" value="' + escapeAttribute(maxValue) + '" data-product-cap-max></label>'
      + '<label class="product-reserve-field">Reserve <small>' + formatNumber(reserveValue) + ' / ' + formatNumber(maxReservableUnits) + ' units</small><input type="number" min="0" max="' + escapeAttribute(maxReservableUnits) + '" step="0.5" value="' + escapeAttribute(reserveValue) + '" data-product-reserve></label>'
      + '<button type="button" data-action="apply-product-cap">Apply</button>'
      + '<small class="product-cap-stock">Cap Stock ' + formatNumber(status.cap.current) + ' = Current ' + formatNumber(row.current) + ' + Project ' + formatNumber(state.storage.reserved[row.resourceId]) + '</small>'
      + (pendingChanged ? '<small class="priority-pending-banner">Pending next tick</small>' : applied)
      + capacityWarning + '</div>';
  }
  function ledgerRows(state) {
    const snapshot = namespace.flowEconomy.inventorySnapshot(state);
    const filters = stockFilters(state);
    const collapsed = namespace.uiViewport.ensureUiState(state).inventoryCollapsedCategories || {};
    return namespace.flowEconomy.FLOW_GROUPS.map((group) => {
      const allRows = snapshot.groups.find((entry) => entry.id === group.id).rows;
      const statuses = allRows.map((row) => ({ row, status: stockStatus(state, row) }));
      const warningCount = statuses.filter((entry) => entry.status.negative || entry.status.out || entry.status.stopped).length;
      const rows = statuses.filter((entry) => rowMatchesFilters(entry.status, filters));
      const body = !collapsed[group.id] && rows.length
        ? rows.map(({ row, status }) => {
          const item = namespace.storageLedger.storageItemById[row.resourceId];
          const statusLabel = status.stopped ? 'Stopped by Max Cap' : status.near ? 'Near Max Cap' : status.out ? 'Out of Stock' : '';
          return '<tr class="' + (status.stopped ? 'inventory-row-stopped' : '') + '">'
            + '<th><strong>' + escapeHtml(item.label) + '</strong>' + (statusLabel ? '<small>' + escapeHtml(statusLabel) + '</small>' : '') + '</th>'
            + '<td>' + formatNumber(row.current, 4) + '</td>'
            + '<td>' + netValue(row, 'daily') + '</td>'
            + '<td>' + netValue(row, 'seasonal') + '</td>'
            + '<td>' + formatNumber(state.storage.reserved[row.resourceId], 4) + '</td>'
            + '<td>' + capEditor(state, row, status) + '</td>'
            + '</tr>';
        }).join('')
        : (!collapsed[group.id] ? '<tr class="storage-empty-group"><td colspan="6">No items match the active filters.</td></tr>' : '');
      return '<tr class="storage-category-row"><th colspan="6"><button type="button" data-action="toggle-inventory-category" data-category-id="' + escapeAttribute(group.id) + '"><span>' + escapeHtml(group.label) + '</span><b>' + warningCount + ' Warnings</b><i>' + (collapsed[group.id] ? '+' : '-') + '</i></button></th></tr>' + body;
    }).join('');
  }

  function inventoryTable(state) {
    return '<div class="storage-table-wrap">'
      + '<table class="storage-table inventory-flow-table">'
      + '<thead><tr><th>Item</th><th>Current Stock</th><th>Daily Net</th><th>Seasonal Forecast</th><th>Project Stock</th><th>Stock Policy</th></tr></thead>'
      + '<tbody>' + ledgerRows(state) + '</tbody>'
      + '</table></div>';
  }

  function inventoryFilterBar(state) {
    const filters = stockFilters(state);
    const definitions = [['negative', 'Negative Daily Net'], ['out', 'Out of Stock'], ['near', 'Near Capacity'], ['stopped', 'Stopped by Max Cap']];
    return '<nav class="realm-filter-bar" aria-label="Inventory filters">' + definitions.map(([id, label]) => '<button type="button" data-action="toggle-inventory-filter" data-filter="' + id + '" class="' + (filters[id] ? 'active' : '') + '">' + label + '</button>').join('') + '</nav>';
  }

  function storagePanel(state) {
    const ledger = state.storage;
    const summary = namespace.storageLedger.storageSummary(ledger);
    const status = ledger.founderReserveLoaded ? 'Central Stockpile' : 'Awaiting Start';
    const ui = namespace.uiViewport.ensureUiState(state);
    const locationPicker = ui.inventoryWarehousePicker
      ? '<section class="inventory-warehouse-locations"><div class="panel-title-row"><h3>Select Warehouse Location</h3><button type="button" data-action="cancel-warehouse-location">Cancel</button></div>'
        + '<div class="admin-row-list">' + (state.player.cities || []).map((city) => '<button type="button" class="admin-select-row" data-action="open-construction-details" data-kind="warehouse" data-region-id="' + escapeAttribute(city.regionId) + '"><span><strong>' + escapeHtml(city.name) + '</strong><small>' + escapeHtml(city.settlementTier === 'village' ? 'Village ? +3,000 Storage' : 'Urban ? +7,500 Storage') + '</small></span></button>').join('') + '</div></section>'
      : '';
    return '<section class="panel-block storage-ledger-panel">'
      + '<div class="panel-title-row"><h2>Inventory</h2><span><strong>' + escapeHtml(status) + '</strong><button type="button" data-action="choose-warehouse-location">Build Warehouse</button></span></div>'
      + '<div class="storage-meter" role="meter" aria-label="Storage occupancy" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + summary.occupancyPercent + '"><span style="width:' + Math.min(100, summary.occupancyPercent) + '%"></span></div>'
      + '<dl class="storage-summary-grid">'
      + '<div><dt>Occupied</dt><dd>' + formatNumber(summary.occupied) + '</dd></div>'
      + '<div><dt>Capacity</dt><dd>' + formatNumber(summary.capacity) + '</dd></div>'
      + '<div><dt>Free</dt><dd>' + formatNumber(summary.free) + '</dd></div>'
      + '<div><dt>Warehouses</dt><dd>' + formatNumber(ledger.warehouseLevels || 0, 0) + '</dd></div>'
      + '</dl>'
      + locationPicker
      + '<p class="inventory-forecast-note">Seasonal Forecast projects stock change through the end of ' + escapeHtml(state.clock.season) + '.</p>'
      + inventoryFilterBar(state)
      + inventoryTable(state)
      + '<p class="profile-note">Treasury is separate from physical storage. Starting cash remains deferred.</p>'
      + '</section>';
  }

  function hudInventoryDropdown(state) {
    const snapshot = namespace.flowEconomy.inventorySnapshot(state);
    return '<div class="hud-inventory-groups" aria-label="Inventory groups">'
      + snapshot.groups.map((group) => {
        const rows = group.rows;
        const menuRows = rows.length
          ? rows.map((row) => '<div class="hud-inventory-row">'
            + '<strong>' + escapeHtml(row.label) + '</strong>'
            + '<span>' + formatNumber(row.current, 2) + '</span>'
            + netValue(row, 'daily')
            + '</div>').join('')
          : '<p>No items defined yet.</p>';
        return '<div class="hud-inventory-group">'
          + '<button type="button" class="hud-inventory-trigger" aria-label="' + escapeAttribute(group.label) + '">'
          + namespace.uiNavigation.icon(group.icon)
          + '<span>' + escapeHtml(group.label) + '</span>'
          + '</button>'
          + '<div class="hud-inventory-menu"><header><strong>' + escapeHtml(group.label) + '</strong><span>Stock / Daily Net</span></header>' + menuRows + '</div>'
          + '</div>';
      }).join('')
      + '</div>';
  }

  namespace.uiStorage = Object.freeze({
    formatNumber,
    signedNumber,
    flowClass,
    flowTooltip,
    netValue,
    ledgerItemIds,
    ledgerRows,
    inventoryTable,
    inventoryFilterBar,
    storagePanel,
    hudInventoryDropdown
  });
})(window.EcoRuler = window.EcoRuler || {});
