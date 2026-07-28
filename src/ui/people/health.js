(function initializeHealthUi(namespace) {
  const { escapeHtml, escapeAttribute } = namespace.uiCore;

  function number(value, digits = 1) {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function component(label, value, maximum) {
    const percent = maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 100;
    return `<div class='satisfaction-component'><span><strong>${escapeHtml(label)}</strong></span><span class='satisfaction-component-bar'><i style='width:${percent}%'></i></span><b>${number(value)} / ${maximum}</b></div>`;
  }

  function facilityRow(state, city, definition) {
    const building = namespace.health.facilityById(city, definition.id);
    const level = building ? building.level : 0;
    const required = building ? namespace.health.requiredWorkers(state, building) : 0;
    const displayed = building && building.pendingWorkerCap != null ? building.pendingWorkerCap : (building ? building.workerCap : 0);
    const summary = namespace.health.facilitySummary(state, city).rows.find((row) => row.definition.id === definition.id);
    const effectiveCapacity = summary ? summary.effectiveCapacity : 0;
    return `<article class='security-service-row'>
      <span><strong>${escapeHtml(definition.label)}</strong><small>Level ${level} | ${number(effectiveCapacity, 0)} effective / ${number(definition.populationCapacity * level, 0)} maximum</small></span>
      <span><small>Workers</small><b>${building ? number(building.actualWorkers) : '0.0'} / ${required}</b></span>
      <span><small>Maintenance</small><b>${building ? number((building.maintenanceCoverage == null ? 1 : building.maintenanceCoverage) * 100, 0) : 0}%</b></span>
      ${building ? `<label class='compact-worker-slider'><span>Worker Cap ${displayed} / ${required}</span><input type='range' min='0' max='${required}' step='1' value='${displayed}' data-action='set-medical-worker-cap' data-city-id='${escapeAttribute(city.id)}' data-building-id='${escapeAttribute(definition.id)}'></label>` : '<span><small>Not Built</small></span>'}
      <button type='button' data-action='open-construction-details' data-kind='medical' data-region-id='${escapeAttribute(city.regionId)}' data-city-id='${escapeAttribute(city.id)}' data-building-id='${escapeAttribute(definition.id)}'>Build / Expand</button>
    </article>`;
  }

  function settlementHealth(state, city) {
    const result = namespace.health.previewSettlement(state, city.id);
    const settings = city.healthSettings;
    const hasMedicalFacility = result.facility.capacity > 0;
    const direction = result.movement > 0 ? `+${number(result.movement)} / Day` : result.movement < 0 ? `${number(result.movement)} / Day` : 'Stable';
    const residentsCovered = Math.min(Number(city.population) || 0, result.facility.capacity);
    const facilityCoverage = city.population > 0 ? Math.min(100, residentsCovered / city.population * 100) : 100;
    return `<article class='living-settlement-card health-settlement-card'>
      <header><span><small>${escapeHtml(city.settlementIdentity)}</small><h3>${escapeHtml(city.name)} Health</h3></span><div class='satisfaction-score'><strong>${number(result.actual)}</strong><span>&rarr; ${number(result.target)}</span><small>${escapeHtml(direction)}</small></div></header>
      <div class='satisfaction-breakdown'><section><h5>Health Components <span>${number(result.target)} / 100</span></h5>
        ${component('Base', result.components.base, 30)}
        ${component('Housing', result.components.housing, 10)}
        ${component('First Meal', result.components.foodCoverage, 8)}
        ${component('Food Variety', result.components.foodVariety, 7)}
        ${component('Clothing Layers', result.components.clothing, 10)}
        ${component('Medical Products', result.components.medicalProducts, 20)}
        ${component('Medical Buildings', result.components.medicalBuildings, 15)}
      </section></div>
      <section class='admin-section'><div class='admin-section-heading'><div><h4>Medical Facilities</h4><p>Combined staffing and maintenance determine effective capacity.</p></div><span>${number(residentsCovered, 0)} / ${number(result.facility.capacity, 0)} Residents Covered</span></div><span class='worker-coverage-track' title='${number(facilityCoverage, 0)}% resident coverage'><i style='width:${facilityCoverage}%'></i></span>${namespace.healthData.facilityList.filter((definition) => namespace.health.locationAvailability(city, definition).allowed).map((definition) => facilityRow(state, city, definition)).join('')}</section>
      <div class='living-settings'><label class='living-setting'><span><strong>Clothing Layers</strong><small>Independent daily layers</small></span><select data-action='set-health-clothing-layers' data-city-id='${escapeAttribute(city.id)}'>${[1, 2, 3].map((value) => `<option value='${value}' ${settings.clothingLayers === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>
      <section class='admin-section medical-product-coverage'><div class='admin-section-heading'><div><h4>Medical Product Coverage</h4><p>Each Distribution Limit is independent and applies on the next daily tick.</p></div></div>
        ${namespace.healthData.medicalProducts.map((product) => {
          const value = settings.pendingMedicalDistribution[product.id] == null ? settings.medicalDistribution[product.id] : settings.pendingMedicalDistribution[product.id];
          const detail = result.medicalProducts[product.id];
          return `<label class='living-setting'><span><strong>${escapeHtml(product.label)}</strong><small>Distribution Limit ${value}% | Actual Coverage ${number(detail.effectiveCoverage * 100)}% | ${number(detail.points)} / ${product.points} Health points</small></span><input type='range' min='0' max='100' step='1' value='${value}' data-action='set-medical-distribution' data-city-id='${escapeAttribute(city.id)}' data-product-id='${escapeAttribute(product.id)}' ${hasMedicalFacility ? '' : `disabled title='Requires an active Clinic or Hospital.'`}><output>${value}%</output></label>`;
        }).join('')}
        ${hasMedicalFacility ? '' : `<p class='construction-blocker'>Requires an active Clinic or Hospital before Medical Product Coverage can be assigned.</p>`}
      </section>
    </article>`;
  }
  function localDemographicsPanel(state, city) {
    const result = namespace.health.previewSettlement(state, city.id);
    const summary = city.demographicSummary || { births: 0, deaths: 0, migration: 0, potentialImmigration: 0, rejectedImmigration: 0 };
    const enabled = city.demographics.allowImmigration !== false;
    return '<section class="settlement-card local-demographics-card"><h4>Demographics</h4><dl class="province-fact-list">'
      + '<div><dt>Annual Birth Rate</dt><dd>' + number(result.rates.birthRate * 100, 2) + '%</dd></div>'
      + '<div><dt>Annual Death Rate</dt><dd>' + number(result.rates.deathRate * 100, 2) + '%</dd></div>'
      + '<div><dt>Potential Immigration Today</dt><dd>' + (summary.potentialImmigration || 0) + '</dd></div>'
      + '<div><dt>Accepted Migration Today</dt><dd>' + (summary.migration || 0) + '</dd></div>'
      + '<div><dt>Housing Rejected Today</dt><dd>' + (summary.rejectedImmigration || 0) + '</dd></div>'
      + '<div><dt>30-Day Births / Deaths</dt><dd>+' + result.projections.days30.births + ' / -' + result.projections.days30.deaths + '</dd></div>'
      + '<div><dt>30-Day Migration / Rejected</dt><dd>' + (result.projections.days30.migration >= 0 ? '+' : '') + result.projections.days30.migration + ' / ' + result.projections.days30.rejectedMigration + '</dd></div>'
      + '<div><dt>30-Day Net / Population</dt><dd>' + (result.projections.days30.net >= 0 ? '+' : '') + result.projections.days30.net + ' / ' + result.projections.days30.population + '</dd></div>'
      + '<div><dt>360-Day Births / Deaths</dt><dd>+' + result.projections.days360.births + ' / -' + result.projections.days360.deaths + '</dd></div>'
      + '<div><dt>360-Day Migration / Rejected</dt><dd>' + (result.projections.days360.migration >= 0 ? '+' : '') + result.projections.days360.migration + ' / ' + result.projections.days360.rejectedMigration + '</dd></div>'
      + '<div><dt>360-Day Net / Population</dt><dd>' + (result.projections.days360.net >= 0 ? '+' : '') + result.projections.days360.net + ' / ' + result.projections.days360.population + '</dd></div>'
      + '</dl><label><input type="checkbox" data-action="set-allow-immigration" data-city-id="' + escapeAttribute(city.id) + '" ' + (enabled ? 'checked' : '') + '> Allow Immigration</label>'
      + (summary.rejectedImmigration ? '<p class="worker-shortage">Immigration Blocked: ' + summary.rejectedImmigration + ' rejected by Housing.</p>' : '')
      + '</section>';
  }
  function realmPanel(state) {
    const summary = namespace.health.realmSummary(state);
    return `<section class='satisfaction-summary-strip'><div><span>Realm Health</span><strong>${number(summary.actual)}</strong></div><div><span>Realm Target</span><strong>${number(summary.target)}</strong></div><div><span>Births Today</span><strong>${summary.daily.births}</strong></div><div><span>Deaths Today</span><strong>${summary.daily.deaths}</strong></div></section><section class='living-standards-list'>${(state.player.cities || []).map((city) => settlementHealth(state, city)).join('')}</section>`;
  }

  function demographicsPanel(state) {
    const rows = (state.player.cities || []).map((city) => {
      const result = namespace.health.previewSettlement(state, city.id);
      const summary = city.demographicSummary || { births: 0, deaths: 0, migration: 0, rejectedImmigration: 0 };
      const enabled = city.demographics.allowImmigration !== false;
      return `<article class='security-service-row'><span><small>${escapeHtml(city.settlementIdentity)}</small><strong>${escapeHtml(city.name)}</strong></span><span><small>Population</small><b>${number(city.population, 0)}</b></span><span><small>Annual Birth / Death</small><b>${number(result.rates.birthRate * 100, 2)}% / ${number(result.rates.deathRate * 100, 2)}%</b></span><span><small>Today</small><b>+${summary.births} / -${summary.deaths} / ${summary.migration >= 0 ? '+' : ''}${summary.migration}</b></span><span><small>30 Days</small><b>${result.projections.days30.net >= 0 ? '+' : ''}${result.projections.days30.net}</b></span><span><small>360 Days</small><b>${result.projections.days360.net >= 0 ? '+' : ''}${result.projections.days360.net}</b></span><label><input type='checkbox' data-action='set-allow-immigration' data-city-id='${escapeAttribute(city.id)}' ${enabled ? 'checked' : ''}> Allow Immigration</label>${summary.rejectedImmigration ? `<span class='worker-shortage'>${summary.rejectedImmigration} Rejected</span>` : ''}</article>`;
    }).join('');
    return `<section class='admin-section'><div class='admin-section-heading'><div><h3>Population Change</h3><p>Deterministic births, deaths, migration, Housing limits, and settlement floors.</p></div></div><div class='security-service-list'>${rows}</div></section>`;
  }

  function constructionCards(state, activeMode) {
    return namespace.healthData.facilityList.map((definition) => {
      const active = activeMode && activeMode.kind === 'medical-building' && activeMode.buildingId === definition.id;
      return `<button type='button' class='build-card ${active ? 'active' : ''}' data-action='select-build-type' data-kind='medical-building' data-building-id='${escapeAttribute(definition.id)}' data-label='${escapeAttribute(definition.label)}' data-search-text='${escapeAttribute(definition.label + ' Medical Health')}'><span><strong>${escapeHtml(definition.label)}</strong><small>${number(definition.populationCapacity, 0)} Population | ${definition.workers} Workers</small></span></button>`;
    }).join('');
  }

  namespace.uiHealth = Object.freeze({ realmPanel, demographicsPanel, settlementHealth, localDemographicsPanel, constructionCards });
})(window.EcoRuler = window.EcoRuler || {});
