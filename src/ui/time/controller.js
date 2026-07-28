(function initializeTimeController(namespace) {
  let intervalId = null;
  let activeRoot = null;
  let activeState = null;
  let lastTimestamp = null;
  let keyboardBound = false;
  let interactionFlushBound = false;
  let deferredDailyRender = false;

  function activeEditingControl() {
    if (!activeRoot || typeof document === 'undefined') return null;
    const active = document.activeElement;
    if (!active || !activeRoot.contains(active)) return null;
    return active.matches('input, textarea, select, [contenteditable="true"]') ? active : null;
  }

  function flushDeferredDailyRender() {
    if (!deferredDailyRender || !activeRoot || !activeState || namespace.currentState !== activeState) return;
    if (activeEditingControl()) return;
    deferredDailyRender = false;
    namespace.uiApp.render(activeRoot, activeState);
  }

  function bindInteractionFlush() {
    if (interactionFlushBound || typeof document === 'undefined') return;
    document.addEventListener('focusout', (event) => {
      if (!deferredDailyRender || !activeRoot || !activeRoot.contains(event.target)) return;
      window.setTimeout(flushDeferredDailyRender, 0);
    }, true);
    interactionFlushBound = true;
  }

  function tick() {
    if (!activeRoot || !activeState || !activeState.player.gameStarted) {
      lastTimestamp = Date.now();
      return;
    }
    const now = Date.now();
    const elapsed = lastTimestamp === null ? 0 : now - lastTimestamp;
    lastTimestamp = now;
    const results = namespace.timeEngine.advanceRealTime(activeState, elapsed);
    if (results.length && namespace.currentState === activeState) {
      if (activeEditingControl()) deferredDailyRender = true;
      else {
        deferredDailyRender = false;
        namespace.uiApp.render(activeRoot, activeState);
      }
    } else if (namespace.currentState === activeState) {
      const dayFraction = activeState.clock.speed > 0
        ? activeState.clock.elapsedRealMs / (namespace.data.timeScale.normalSecondsPerDay * 1000)
        : 0;
      activeRoot.querySelectorAll('[data-project-progress]').forEach((bar) => {
        const projectId = bar.dataset.projectProgress;
        let project = null;
        activeState.map.regions.some((region) => {
          project = namespace.constructionQueue.orderedProjects(region).find((item) => item.id === projectId) || null;
          return Boolean(project);
        });
        if (!project) return;
        const active = project.status === 'active';
        const visualDays = project.progressDays + (active ? dayFraction : 0);
        bar.style.width = Math.min(100, Math.max(0, visualDays / project.durationDays * 100)) + '%';
      });
      activeRoot.querySelectorAll('[data-project-progress-marker]').forEach((marker) => {
        let project = null;
        activeState.map.regions.some((region) => { project = namespace.constructionQueue.orderedProjects(region).find((item) => item.id === marker.dataset.projectProgressMarker) || null; return Boolean(project); });
        if (!project) return;
        const visualDays = project.progressDays + (project.status === 'active' ? dayFraction : 0);
        const percent = Math.min(100, Math.max(0, visualDays / project.durationDays * 100));
        const label = marker.querySelector('.progress-label'); if (label) label.textContent = percent.toFixed(1) + '%';
        const ring = marker.querySelector('.marker-progress'); if (ring) ring.setAttribute('stroke-dashoffset', String(43.98 * (1 - percent / 100)));
      });
    }
  }

  function keyboardHandler(event) {
    if (!activeState || !activeState.player.gameStarted) return;
    const target = event.target;
    if (target && (
      target.matches('input, textarea, select, button')
      || target.isContentEditable
    )) return;

    if (event.code === 'Space') {
      event.preventDefault();
      namespace.timeEngine.togglePause(activeState);
    } else if (event.key === '1') {
      namespace.timeEngine.setSpeed(activeState, 1);
    } else if (event.key === '2') {
      namespace.timeEngine.setSpeed(activeState, 2);
    } else if (event.key === '3') {
      namespace.timeEngine.setSpeed(activeState, 4);
    } else if (event.key === 'Escape') {
      const ui = activeState.ui || (activeState.ui = {});
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.hud-inventory-group')) { document.activeElement.blur(); }
      else if (ui.seasonalReportModalId) namespace.flowEconomy.closeSeasonReport(activeState);
      else if (ui.criticalAlertModalId) ui.criticalAlertModalId = null;
      else if (ui.resourceSiteDetail) delete ui.resourceSiteDetail;
      else if (activeState.map.selectedRegionId) activeState.map.selectedRegionId = null;
      else if (ui.activeMainPanel) ui.activeMainPanel = null;
      else if (ui.constructionBuildMode) delete ui.constructionBuildMode;
      else return;
    } else {
      return;
    }
    namespace.uiApp.render(activeRoot, activeState);
  }

  function start(root, state) {
    activeRoot = root;
    activeState = state;
    lastTimestamp = Date.now();
    if (!intervalId) intervalId = window.setInterval(tick, 100);
    bindInteractionFlush();
    if (!keyboardBound) {
      window.addEventListener('keydown', keyboardHandler);
      keyboardBound = true;
    }
  }

  function stop() {
    if (intervalId) window.clearInterval(intervalId);
    intervalId = null;
    activeRoot = null;
    activeState = null;
    lastTimestamp = null;
    deferredDailyRender = false;
  }

  namespace.timeController = Object.freeze({ start, stop, tick });
})(window.EcoRuler = window.EcoRuler || {});
