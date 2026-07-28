(function initializeTimeEngine(namespace) {
  const SPEEDS = Object.freeze([1, 2, 4]);

  function ensureClock(state) {
    state.clock = state.clock || {};
    state.clock.day = Math.max(1, Math.min(30, Math.floor(Number(state.clock.day) || 1)));
    state.clock.season = namespace.data.timeScale.seasons.includes(state.clock.season)
      ? state.clock.season
      : 'Spring';
    state.clock.year = Math.max(1, Math.floor(Number(state.clock.year) || 1));
    state.clock.speed = SPEEDS.includes(Number(state.clock.speed)) ? Number(state.clock.speed) : 0;
    state.clock.previousSpeed = SPEEDS.includes(Number(state.clock.previousSpeed))
      ? Number(state.clock.previousSpeed)
      : 1;
    state.clock.elapsedRealMs = Math.max(0, Number(state.clock.elapsedRealMs) || 0);
    state.clock.processedDays = Math.max(0, Math.floor(Number(state.clock.processedDays) || 0));
    return state.clock;
  }

  function resetClock(state) {
    state.clock = {
      day: 1,
      season: 'Spring',
      year: 1,
      speed: 0,
      previousSpeed: 1,
      elapsedRealMs: 0,
      processedDays: 0
    };
    return state.clock;
  }

  function speedLabel(clock) {
    return clock.speed === 0 ? 'Paused' : `${clock.speed}x`;
  }
  function startingSetupInProgress(state) {
    return Boolean(namespace.settlementFoundation
      && namespace.settlementFoundation.startingVillageSetupInProgress(state));
  }

  function setSpeed(state, speed) {
    const clock = ensureClock(state);
    if (startingSetupInProgress(state)) {
      pause(state);
      return false;
    }
    const requested = Number(speed);
    if (!SPEEDS.includes(requested)) return false;
    clock.speed = requested;
    clock.previousSpeed = requested;
    return true;
  }

  function pause(state) {
    const clock = ensureClock(state);
    if (clock.speed > 0) clock.previousSpeed = clock.speed;
    clock.speed = 0;
    return clock;
  }

  function togglePause(state) {
    const clock = ensureClock(state);
    if (clock.speed > 0) return pause(state);
    if (startingSetupInProgress(state)) return pause(state);
    clock.speed = SPEEDS.includes(clock.previousSpeed) ? clock.previousSpeed : 1;
    return clock;
  }

  function advanceDate(state) {
    const clock = ensureClock(state);
    clock.processedDays += 1;
    if (clock.day < namespace.data.timeScale.seasonLengthDays) {
      clock.day += 1;
      return clock;
    }

    clock.day = 1;
    const seasonIndex = namespace.data.timeScale.seasons.indexOf(clock.season);
    if (seasonIndex < namespace.data.timeScale.seasons.length - 1) {
      clock.season = namespace.data.timeScale.seasons[seasonIndex + 1];
      return clock;
    }

    clock.season = namespace.data.timeScale.seasons[0];
    clock.year += 1;
    return clock;
  }

  function completionAlerts(state, completed) {
    completed.forEach(({ region, project }) => {
      namespace.dailyEconomy.createAlert(state, {
        type: 'construction-complete',
        title: 'Construction Complete',
        message: `${project.label} completed in ${region.name}.`,
        critical: false
      });
    });
  }

  function processDay(state) {
    const processedDate = namespace.dailyEconomy.currentDate(state);
    if (startingSetupInProgress(state)) {
      pause(state);
      return { blocked: true, reason: 'Complete Starting Village setup first.', paused: true };
    }
    const seasonEnds = state.clock.day === namespace.data.timeScale.seasonLengthDays;
    const yearEnds = seasonEnds && state.clock.season === namespace.data.timeScale.seasons[namespace.data.timeScale.seasons.length - 1];
    namespace.flowEconomy.ensureSeasonTracker(state);

    const expansion = namespace.outpostLifecycle ? namespace.outpostLifecycle.processDay(state) : null;
    if (namespace.satisfaction) namespace.satisfaction.applyPending(state);
    if (namespace.health) namespace.health.applyPending(state);
    if (namespace.storageLedger.applyPendingReservations) namespace.storageLedger.applyPendingReservations(state.storage);
    if (namespace.storageLedger.applyPendingProductCaps) namespace.storageLedger.applyPendingProductCaps(state.storage);
    const development = namespace.developmentEconomy
      ? namespace.developmentEconomy.processDay(state)
      : null;
    const administration = namespace.administration ? namespace.administration.processDay(state) : null;
    const livingStandards = namespace.satisfaction ? namespace.satisfaction.consumeDaily(state) : null;
    const food = livingStandards ? livingStandards.food : namespace.dailyEconomy.consumeFood(state);
    const clothes = livingStandards ? livingStandards.clothing : namespace.dailyEconomy.consumeAnnualClothes(state);
    const health = namespace.health ? namespace.health.processDay(state, livingStandards) : null;
    const spoilage = namespace.dailyEconomy.applySpoilage(state, 1);
    const lifecycle = namespace.settlementLifecycle ? namespace.settlementLifecycle.processDay(state) : null;
    if (namespace.storageLedger.refreshProductCapStates) namespace.storageLedger.refreshProductCapStates(state.storage);
    if (namespace.outpostLifecycle) namespace.outpostLifecycle.refreshConversionBlocks(state);
    const manufacturing = namespace.manufacturing ? namespace.manufacturing.processDay(state) : null;
    if (namespace.storageLedger.refreshProductCapStates) namespace.storageLedger.refreshProductCapStates(state.storage);
    const production = namespace.dailyEconomy.processProduction(state);
    const completed = namespace.constructionQueue.processConstructionProgressDay(state);
    namespace.constructionQueue.applyDelayedChanges(state);
    completionAlerts(state, completed);
    const seasonalReport = yearEnds ? namespace.flowEconomy.finishSeason(state) : null;
    advanceDate(state);
    if (yearEnds) namespace.flowEconomy.startNextSeason(state);

    if (food.critical && food.newEpisode) {
      pause(state);
      const ui = state.ui || (state.ui = {});
      ui.criticalAlertModalId = food.alertId;
    }

    return {
      date: processedDate,
      expansion,
      food,
      clothes,
      livingStandards,
      health,
      spoilage,
      development,
      lifecycle,
      administration,
      manufacturing,
      production,
      completed,
      seasonalReport,
      paused: state.clock.speed === 0
    };
  }

  function processDays(state, count, options = {}) {
    const total = Math.max(0, Math.floor(Number(count) || 0));
    const results = [];
    for (let index = 0; index < total; index += 1) {
      const result = processDay(state);
      results.push(result);
      if (result.paused && options.stopOnPause !== false) break;
    }
    return results;
  }

  function advanceRealTime(state, elapsedMs) {
    const clock = ensureClock(state);
    if (clock.speed <= 0) {
      clock.elapsedRealMs = 0;
      return [];
    }

    clock.elapsedRealMs += Math.max(0, Number(elapsedMs) || 0) * clock.speed;
    const millisecondsPerDay = namespace.data.timeScale.normalSecondsPerDay * 1000;
    const results = [];
    while (clock.elapsedRealMs >= millisecondsPerDay && clock.speed > 0) {
      clock.elapsedRealMs -= millisecondsPerDay;
      const result = processDay(state);
      results.push(result);
      if (result.paused) {
        clock.elapsedRealMs = 0;
        break;
      }
    }
    return results;
  }

  namespace.timeEngine = Object.freeze({
    SPEEDS,
    ensureClock,
    resetClock,
    speedLabel,
    setSpeed,
    pause,
    togglePause,
    advanceDate,
    processDay,
    processDays,
    advanceRealTime
  });
})(window.EcoRuler = window.EcoRuler || {});
