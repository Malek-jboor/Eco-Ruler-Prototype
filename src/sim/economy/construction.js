(function initializeConstructionQueue(namespace) {
  function ensureQueue(region) {
    return namespace.resourceSites.ensureRegionState(region).construction;
  }

  function activeProject(region) {
    return ensureQueue(region).projects.find((project) => (
      project.status === 'active' || project.status === 'paused'
    )) || null;
  }

  function waitingProjects(region) {
    return ensureQueue(region).projects.filter((project) => project.status === 'waiting');
  }

  function orderedProjects(region) {
    const projects = ensureQueue(region).projects;
    const active = activeProject(region);
    return active ? [active, ...projects.filter((project) => project !== active)] : projects.slice();
  }

  function reserveCapacity(region, reservation, multiplier = 1) {
    if (!reservation) return;
    const capacityKeyByType = {
      water: 'waterCapacityUsed',
      development: 'developmentCapacityUsed',
      infrastructure: 'infrastructureCapacityUsed'
    };
    const key = capacityKeyByType[reservation.type] || 'resourceCapacityUsed';
    region[key] = Math.max(0, Number(region[key] || 0) + reservation.points * multiplier);
  }

  function activateNext(region) {
    if (activeProject(region)) return activeProject(region);
    const next = waitingProjects(region).find((project) => !project.manualPaused && !project.blockedReason);
    if (!next) return null;
    next.status = 'active';
    return next;
  }

  function moneyAvailability(state, cashAmount) {
    if (cashAmount === null || cashAmount === undefined) {
      return { ok: true, status: 'Deferred' };
    }
    const amount = Math.max(0, Number(cashAmount) || 0);
    if (amount === 0) return { ok: true, status: 'Paid', amount: 0 };
    const balance = Number(state.treasury && state.treasury.balance);
    if (!Number.isFinite(balance)) {
      return { ok: false, reason: 'Construction money cannot be charged until fixed prices and Treasury balance are active.' };
    }
    if (balance < amount) {
      return { ok: false, reason: 'construction-money-shortage', shortage: amount - balance };
    }
    return { ok: true, status: 'Paid', amount };
  }

  function payMoney(state, cashAmount) {
    const availability = moneyAvailability(state, cashAmount);
    if (!availability.ok || !availability.amount) return availability;
    state.treasury.balance -= availability.amount;
    return availability;
  }

  function queueProject(state, region, definition) {
    const queue = ensureQueue(region);
    const moneyCheck = moneyAvailability(state, definition.cashAmount);
    if (!moneyCheck.ok) return moneyCheck;

    const payment = namespace.storageLedger.payMaterials(state.storage, definition.materials);
    if (!payment.ok) {
      return { ok: false, reason: 'construction-material-shortage', shortages: payment.shortages };
    }
    const moneyPayment = payMoney(state, definition.cashAmount);
    if (!moneyPayment.ok) {
      namespace.storageLedger.refundMaterials(state.storage, definition.materials, { confirmOverflow: true });
      return moneyPayment;
    }

    const projectNumber = queue.nextProjectNumber;
    queue.nextProjectNumber += 1;
    const project = {
      id: region.id + '-project-' + projectNumber,
      provinceId: region.id,
      kind: definition.kind,
      resourceId: definition.resourceId || null,
      buildingId: definition.buildingId || null,
      cityId: definition.cityId || null,
      label: definition.label,
      targetLevel: definition.targetLevel || null,
      status: 'waiting',
      progressDays: 0,
      durationDays: Math.max(1, Math.ceil(definition.durationDays)),
      materials: { ...definition.materials },
      cashPercent: definition.cashPercent,
      cashAmount: definition.cashAmount,
      moneyStatus: moneyPayment.status,
      capacityReservation: definition.capacityReservation ? { ...definition.capacityReservation } : null,
      modifiers: { ...(definition.modifiers || {}) },
      metadata: { ...(definition.metadata || {}) },
      manualPaused: false,
      blockedReason: null
    };

    queue.projects.push(project);
    reserveCapacity(region, project.capacityReservation, 1);
    activateNext(region);
    return { ok: true, project };
  }

  function setPaused(region, projectId, paused) {
    const project = ensureQueue(region).projects.find((item) => item.id === projectId);
    if (!project || !['active', 'paused'].includes(project.status)) {
      return { ok: false, reason: 'Only the active project can be paused or resumed.' };
    }
    project.manualPaused = Boolean(paused);
    project.status = paused ? 'paused' : 'active';
    return { ok: true, project };
  }

  function moveProject(region, projectId, direction) {
    const queue = ensureQueue(region);
    const ordered = orderedProjects(region);
    const index = ordered.findIndex((project) => project.id === projectId);
    if (index < 0) return { ok: false, reason: 'Construction project was not found.' };
    const targetIndex = index + (direction === 'up' ? -1 : 1);
    if (targetIndex < 0 || targetIndex >= ordered.length) {
      return { ok: false, reason: 'Project is already at the queue edge.' };
    }
    const current = ordered[index];
    const target = ordered[targetIndex];
    const active = activeProject(region);
    if (current === active || target === active) {
      const promoted = current === active ? target : current;
      const demoted = current === active ? current : target;
      promoted.status = 'active';
      promoted.manualPaused = false;
      demoted.status = 'waiting';
      demoted.manualPaused = false;
    }
    [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];
    queue.projects = ordered;
    current.reorderPending = true;
    target.reorderPending = true;
    return { ok: true, projects: orderedProjects(region) };
  }

  function moveWaiting(region, projectId, direction) {
    return moveProject(region, projectId, direction);
  }

  function unfinishedRatio(project) {
    const untouched = project.status === 'waiting' || project.progressDays <= 0;
    return untouched ? 1 : Math.max(0, 1 - (project.progressDays / project.durationDays));
  }

  function refundQuantities(project) {
    const ratio = unfinishedRatio(project);
    return Object.entries(project.materials).reduce((refund, [resourceId, amount]) => {
      const value = Math.round(amount * ratio * 10000) / 10000;
      if (value > 0) refund[resourceId] = value;
      return refund;
    }, {});
  }

  function refundMoney(state, project) {
    if (project.cashAmount === null || project.cashAmount === undefined) return null;
    const refund = Math.round(Math.max(0, Number(project.cashAmount) || 0) * unfinishedRatio(project) * 10000) / 10000;
    if (refund > 0 && Number.isFinite(Number(state.treasury && state.treasury.balance))) {
      state.treasury.balance += refund;
    }
    return refund;
  }

  function cancelProject(state, region, projectId, options = {}) {
    const queue = ensureQueue(region);
    const project = queue.projects.find((item) => item.id === projectId);
    if (!project) return { ok: false, reason: 'Construction project was not found.' };
    const previousStatus = project.status;
    const refund = refundQuantities(project);
    const refundResult = namespace.storageLedger.refundMaterials(state.storage, refund, {
      confirmOverflow: Boolean(options.confirmOverflow)
    });
    if (!refundResult.ok) return { ...refundResult, project, refund };

    const cashRefund = refundMoney(state, project);
    queue.projects = queue.projects.filter((item) => item.id !== projectId);
    reserveCapacity(region, project.capacityReservation, -1);
    project.status = 'cancelled';
    project.refund = refundResult;
    project.cashRefund = cashRefund;
    queue.history.unshift(project);
    const cancellationHandler = namespace.constructionProjectCancellationHandlers
      && namespace.constructionProjectCancellationHandlers[project.kind];
    if (typeof cancellationHandler === 'function') {
      cancellationHandler(state, region, project, { previousStatus });
    }
    activateNext(region);
    return { ok: true, project, refund: refundResult, cashRefund };
  }

  function discardProject(state, region, projectId, reason = 'reduced') {
    const queue = ensureQueue(region);
    const project = queue.projects.find((item) => item.id === projectId);
    if (!project) return { ok: false, reason: 'Construction project was not found.' };

    queue.projects = queue.projects.filter((item) => item !== project);
    reserveCapacity(region, project.capacityReservation, -1);
    project.status = 'discarded-no-refund';
    project.discardReason = reason;
    project.cashRefund = 0;
    project.refund = { accepted: {}, lost: {}, noRefund: true };
    queue.history.unshift(project);
    activateNext(region);
    return { ok: true, project, refund: project.refund, cashRefund: 0 };
  }
  function startProject(state, region, project) {
    if (!project || project.started) return { ok: true, project };
    const handler = namespace.constructionProjectStartHandlers
      && namespace.constructionProjectStartHandlers[project.kind];
    if (typeof handler === 'function') {
      const result = handler(state, region, project);
      if (result && result.ok === false) {
        project.blockedReason = result.reason || 'Project start requirements are no longer available.';
        project.startBlocked = true;
        project.status = 'paused';
        return result;
      }
    }
    if (project.startBlocked) {
      project.blockedReason = null;
      project.startBlocked = false;
    }
    project.started = true;
    return { ok: true, project };
  }

  function completeProject(state, region, project) {
    if (project.kind === 'resource-site-level') {
      namespace.resourceSites.completeProject(state, region, project);
      return;
    }
    const handler = namespace.constructionProjectHandlers && namespace.constructionProjectHandlers[project.kind];
    if (typeof handler === 'function') handler(state, region, project);
  }

  function processProvinceDay(state, region) {
    const queue = ensureQueue(region);
    queue.projects.forEach((project) => { project.reorderPending = false; });
    const project = activateNext(region);
    if (!project || project.status !== 'active') return null;
    const start = startProject(state, region, project);
    if (!start.ok || project.status !== 'active') return project;
    project.progressDays += 1;
    if (project.progressDays < project.durationDays) return project;

    completeProject(state, region, project);
    project.status = 'completed';
    queue.projects = queue.projects.filter((item) => item !== project);
    queue.history.unshift(project);
    activateNext(region);
    return project;
  }

  function processConstructionProgressDay(state) {
    const completed = [];
    state.map.regions.forEach((region) => {
      const project = processProvinceDay(state, region);
      if (project && project.status === 'completed') {
        completed.push({ region, project });
      }
    });
    return completed;
  }

  function applyDelayedChanges(state) {
    namespace.resourceSites.applyPendingRemovals(state);
    namespace.workforce.applyPendingWorkerCaps(state);
    if (namespace.manufacturing) namespace.manufacturing.applyPendingChanges(state);
    if (namespace.administration) namespace.administration.applyPendingChanges(state);
    if (namespace.developmentEconomy) namespace.developmentEconomy.applyPendingSettings(state);
    namespace.resourceSites.refreshControllerModifiers(state);
    if (namespace.developmentEconomy) namespace.developmentEconomy.reconcileAll(state);
    namespace.workforce.recalculateAll(state);
  }

  function processConstructionDay(state) {
    const completed = processConstructionProgressDay(state);
    applyDelayedChanges(state);
    return completed;
  }

  namespace.constructionQueue = Object.freeze({
    ensureQueue,
    activeProject,
    waitingProjects,
    orderedProjects,
    reserveCapacity,
    activateNext,
    moneyAvailability,
    queueProject,
    setPaused,
    moveWaiting,
    moveProject,
    unfinishedRatio,
    refundQuantities,
    cancelProject,
    discardProject,
    startProject,
    processProvinceDay,
    processConstructionProgressDay,
    applyDelayedChanges,
    processConstructionDay
  });
})(window.EcoRuler = window.EcoRuler || {});
