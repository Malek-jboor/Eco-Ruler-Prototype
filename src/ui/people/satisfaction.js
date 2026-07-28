(function initializeSatisfactionUi(namespace) {
  const { escapeHtml, escapeAttribute } = namespace.uiCore;

  function number(value, digits = 1) {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function direction(result) {
    if (result.movement > 0) return { label: `+${number(result.movement)} / Day`, className: 'rising' };
    if (result.movement < 0) return { label: `${number(result.movement)} / Day`, className: 'falling' };
    return { label: 'Stable', className: 'stable' };
  }

  function component(label, value, maximum, note = '') {
    const coverage = maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 100;
    return `<div class='satisfaction-component'>
      <span><strong>${escapeHtml(label)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</span>
      <span class='satisfaction-component-bar'><i style='width:${coverage}%'></i></span>
      <b>${number(value)} / ${number(maximum, maximum % 1 ? 1 : 0)}</b>
    </div>`;
  }

  function serviceControl(city, serviceId, label) {
    const service = namespace.satisfaction.ensureService(city, serviceId);
    const displayed = service.pendingWorkerCap == null ? service.workerCap : service.pendingWorkerCap;
    const pending = service.pendingWorkerCap != null;
    return `<label class='living-setting service-cap-setting'>
      <span><strong>${escapeHtml(label)}</strong><small>${number(service.actualWorkers)} actual / ${service.requiredWorkers} required${pending ? ' | Pending' : ''}</small></span>
      <input type='range' min='0' max='${service.requiredWorkers}' step='1' value='${displayed}' data-action='set-satisfaction-service-cap' data-city-id='${escapeAttribute(city.id)}' data-service-id='${escapeAttribute(serviceId)}' />
      <output>${displayed}</output>
    </label>`;
  }

  function settings(city) {
    const standards = city.livingStandards;
    const meal = standards.pendingMealCount == null ? standards.mealCount : standards.pendingMealCount;
    const drinks = standards.pendingDrinkLevel == null ? standards.drinkLevel : standards.pendingDrinkLevel;
    return `<div class='living-settings'>
      <label class='living-setting'><span><strong>Meals</strong><small>Per resident / day</small></span><select data-action='set-satisfaction-meals' data-city-id='${escapeAttribute(city.id)}'>${[1, 2, 3].map((value) => `<option value='${value}' ${meal === value ? 'selected' : ''}>${value} Meal${value === 1 ? '' : 's'}</option>`).join('')}</select></label>
      <label class='living-setting'><span><strong>Drinks</strong><small>Equal realm coverage</small></span><select data-action='set-satisfaction-drinks' data-city-id='${escapeAttribute(city.id)}'>${namespace.satisfactionData.drinkLevelList.map((entry) => `<option value='${entry.id}' ${drinks === entry.id ? 'selected' : ''}>${escapeHtml(entry.label)}</option>`).join('')}</select></label>
      ${serviceControl(city, 'local-watch', 'Local Watch')}
      ${serviceControl(city, 'religious-services', 'Religious Services')}
    </div>`;
  }

  function breakdown(result) {
    const c = result.components;
    return `<div class='satisfaction-breakdown'>
      <section><h5>Needs <span>${number(result.needs)} / 60</span></h5>
        ${component('First Meal', c.firstMeal, 18, `${result.row.food.reserveDays} reserve days`)}
        ${component('Housing', c.housing, 15)}
        ${component('Basic Clothing', c.basicClothing, 10)}
        ${component('Security', c.security, 10)}
        ${component('Employment', c.employment, 5, `${number(result.employment.employed)} employed`)}
        ${component('War / Peace', c.warPeace, 2, 'Prototype Default')}
      </section>
      <section><h5>Wants <span>${number(result.wants)} / 40</span></h5>
        ${component('Extra Meals', c.extraMeals, 7)}
        ${component('Food Variety', c.foodVariety, 5)}
        ${component('Drinks', c.drinks, 6)}
        ${component('Better Clothing', c.betterClothing, 5, 'Prototype Default')}
        ${component('Religion', c.religion, 7)}
        ${component('Military Power', c.militaryPower, 5, 'Prototype Default')}
        ${component('Country Admin Excess', c.countryExcess, 2.5)}
        ${component('Local Admin Excess', c.localExcess, 2.5)}
      </section>
    </div>`;
  }

  function settlementCard(state, city, options = {}) {
    const result = namespace.satisfaction.previewSettlement(state, city.id);
    const move = direction(result);
    return `<article class='living-settlement-card ${options.compact ? 'compact' : ''}'>
      <header><span><small>${escapeHtml(city.settlementIdentity || city.settlementTier)}</small><h3>${escapeHtml(city.name)}</h3></span><div class='satisfaction-score'><strong>${number(result.actual)}</strong><span>&rarr; ${number(result.target)}</span><small class='${move.className}'>${escapeHtml(move.label)}</small></div></header>
      <div class='satisfaction-projection'><span>Next Day <b>${number(result.nextDay)}</b></span><span>30 Days <b>${number(result.projection30)}</b></span><span>Food Reserve <b>${result.row.food.reserveDays} Days</b></span></div>
      ${settings(city)}
      ${breakdown(result)}
    </article>`;
  }

  function realmPanel(state) {
    const summary = namespace.satisfaction.realmSummary(state);
    return `<section class='satisfaction-summary-strip'>
      <div><span>Realm Satisfaction</span><strong>${number(summary.actual)}</strong></div>
      <div><span>Realm Target</span><strong>${number(summary.target)}</strong></div>
      <div><span>Settlements</span><strong>${summary.settlements.length}</strong></div>
      <div><span>Allocation</span><strong>Equal Coverage</strong></div>
      <div><button type='button' data-action='set-all-satisfaction-service' data-service-id='religious-services'>Set All Religion</button></div>
    </section>
    <section class='living-standards-list'>${(state.player.cities || []).map((city) => settlementCard(state, city)).join('')}</section>`;
  }

  function securityPanel(state) {
    namespace.satisfaction.ensureState(state);
    const rows = (state.player.cities || []).map((city) => {
      const result = namespace.satisfaction.previewSettlement(state, city.id);
      const service = namespace.satisfaction.ensureService(city, 'local-watch');
      return `<article class='security-service-row'><span><small>${escapeHtml(city.settlementIdentity)}</small><strong>${escapeHtml(city.name)}</strong></span><span><small>Security</small><b>${number(result.components.security)} / 10</b></span><span><small>Workers</small><b>${number(service.actualWorkers)} / ${service.requiredWorkers}</b></span>${serviceControl(city, 'local-watch', 'Worker Cap')}</article>`;
    }).join('');
    return `<section class='admin-section'><div class='admin-section-heading'><div><h3>Local Watch</h3><p>Caps apply on the next daily tick and use Realm Workforce Priority.</p></div><span class='admin-heading-actions'><button type='button' data-action='set-all-satisfaction-service' data-service-id='local-watch'>Set All Local Watch</button><button type='button' data-action='open-workforce-priority'>Workforce Priority</button></span></div><div class='security-service-list'>${rows}</div></section>`;
  }

  function localPanel(state, city) {
    return `<section class='settlement-card local-satisfaction-card'><h4>Living Standards</h4>${settlementCard(state, city, { compact: true })}</section>`;
  }

  namespace.uiSatisfaction = Object.freeze({ realmPanel, securityPanel, localPanel, settlementCard });
})(window.EcoRuler = window.EcoRuler || {});
