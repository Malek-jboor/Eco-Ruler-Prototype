(function initializeTooltips(namespace) {
  const { escapeHtml } = namespace.uiCore;
  const tooltipPinDelayMs = 5000;
  let tooltipElement = null;
  let tooltipTimer = null;
  let tooltipPinned = false;
  let tooltipHideTimer = null;
  let tooltipTarget = null;
  let tooltipPinnedAt = 0;
  let tooltipStartedAt = 0;
  let lastPointer = null;
  let globalTooltipDismissBound = false;
  function ensureTooltipElement() {
    if (typeof document === 'undefined') {
      return null;
    }
    if (tooltipElement && document.body.contains(tooltipElement)) {
      return tooltipElement;
    }
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'info-tooltip';
    tooltipElement.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipElement);
    tooltipElement.addEventListener('pointerenter', () => {
      if (tooltipHideTimer) window.clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    });
    tooltipElement.addEventListener('pointerleave', () => {
      if (!tooltipPinned) tooltipHideTimer = window.setTimeout(() => hideTooltip(true), 140);
    });
    return tooltipElement;
  }

  function positionTooltip(target, element) {
    const rect = target.getBoundingClientRect();
    const spacing = 10;
    const maxLeft = Math.max(12, window.innerWidth - element.offsetWidth - 12);
    const left = Math.min(maxLeft, Math.max(12, rect.left));
    let top = rect.bottom + spacing;
    if (top + element.offsetHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - element.offsetHeight - spacing);
    }
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.classList.toggle('flow-left', left + element.offsetWidth + 330 > window.innerWidth);
  }

  function clearTooltipTimer() {
    if (tooltipTimer) {
      window.clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
  }

  function clearTooltipHideTimer() {
    if (tooltipHideTimer) {
      window.clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    }
  }

  function signedFlow(value) {
    const numeric = Number(value || 0);
    if (!numeric) return '0';
    return (numeric > 0 ? '+' : '') + numeric.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  function flowGroupsMarkup(groups) {
    if (!groups.length) return '';
    return '<div class="tooltip-flow-groups">'
      + groups.map((group) => {
        const details = Array.isArray(group.details) ? group.details : [];
        const detailMarkup = details.length
          ? '<div class="tooltip-flow-details"><strong>Contributors</strong>' + details.map((detail) => '<div><span>' + escapeHtml(detail.label || 'Contributor') + '</span><b class="' + (Number(detail.amount) < 0 ? 'negative' : 'positive') + '">' + signedFlow(detail.amount) + '</b></div>').join('') + '</div>'
          : '';
        return '<div class="tooltip-flow-group" tabindex="0"><div class="tooltip-flow-summary"><strong>'
          + escapeHtml(group.label || 'Other') + '</strong><span class="' + (Number(group.amount) < 0 ? 'negative' : 'positive') + '">'
          + signedFlow(group.amount) + '</span></div>' + detailMarkup + '</div>';
      }).join('') + '</div>';
  }

  function showTooltip(target, elapsedMs = 0) {
    const element = ensureTooltipElement();
    if (!element) {
      return;
    }
    const title = escapeHtml(target.dataset.tooltipTitle || '');
    const body = escapeHtml(target.dataset.tooltipBody || '');
    let materialRows = [];
    try {
      materialRows = JSON.parse(target.dataset.tooltipMaterials || '[]');
    } catch (error) {
      materialRows = [];
    }
    let flowGroups = [];
    try {
      flowGroups = JSON.parse(target.dataset.tooltipGroups || '[]');
    } catch (error) {
      flowGroups = [];
    }
    const materials = materialRows.length
      ? '<div class="tooltip-material-list">' + materialRows.map((row) => (
        '<div class="' + (row.enough ? 'enough' : 'shortage') + '"><strong>'
        + escapeHtml(row.label) + '</strong><span>'
        + (Math.round(Number(row.required || 0) * 2) / 2).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' / '
        + (Math.round(Number(row.available || 0) * 2) / 2).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        + '</span></div>'
      )).join('') + '</div>'
      : '';
    tooltipTarget = target;
    clearTooltipHideTimer();
    tooltipPinned = false;
    tooltipPinnedAt = 0;
    const elapsed = Math.max(0, Math.min(tooltipPinDelayMs, Number(elapsedMs) || 0));
    const remaining = Math.max(1, tooltipPinDelayMs - elapsed);
    tooltipStartedAt = Date.now() - elapsed;
    element.style.setProperty('--tooltip-pin-ms', remaining + 'ms');
    const dashOffset = 43.98 * (1 - elapsed / tooltipPinDelayMs);
    element.innerHTML = '<div class="tooltip-head"><strong>' + title
      + '</strong><svg class="tooltip-pin-progress" viewBox="0 0 18 18" aria-hidden="true"><circle class="track" cx="9" cy="9" r="7"></circle><circle class="fill" cx="9" cy="9" r="7" style="stroke-dashoffset:' + dashOffset + ';animation-duration:' + remaining + 'ms"></circle></svg></div>'
      + '<span class="tooltip-body">' + body + '</span>' + materials + flowGroupsMarkup(flowGroups);
    element.classList.add('visible');
    element.classList.remove('pinned');
    element.dataset.tooltipState = 'open';
    element.classList.toggle('has-flow-groups', flowGroups.length > 0);
    positionTooltip(target, element);
  }

  function pinTooltip(target) {
    const element = ensureTooltipElement();
    if (!element || tooltipTarget !== target) {
      return;
    }
    tooltipPinned = true;
    tooltipPinnedAt = Date.now();
    element.classList.add('pinned');
    element.dataset.tooltipState = 'pinned';
    positionTooltip(target, element);
  }

  function hideTooltip(force = false) {
    if (tooltipPinned && !force) {
      return;
    }
    clearTooltipTimer();
    clearTooltipHideTimer();
    tooltipPinned = false;
    tooltipPinnedAt = 0;
    tooltipStartedAt = 0;
    tooltipTarget = null;
    if (tooltipElement) {
      tooltipElement.classList.remove('visible', 'pinned', 'has-flow-groups', 'flow-left');
      tooltipElement.dataset.tooltipState = 'closed';
    }
  }

  function scheduleTooltip(target, elapsedMs = 0) {
    if (tooltipPinned && tooltipTarget === target) return;
    clearTooltipTimer();
    const elapsed = Math.max(0, Math.min(tooltipPinDelayMs, Number(elapsedMs) || 0));
    clearTooltipHideTimer();
    showTooltip(target, elapsed);
    tooltipTimer = window.setTimeout(() => pinTooltip(target), Math.max(1, tooltipPinDelayMs - elapsed));
  }

  function tooltipSnapshot() {
    if (!tooltipTarget || !tooltipElement || !tooltipElement.classList.contains('visible')) return null;
    return {
      title: tooltipTarget.dataset.tooltipTitle || '',
      body: tooltipTarget.dataset.tooltipBody || '',
      materials: tooltipTarget.dataset.tooltipMaterials || '',
      pinned: tooltipPinned,
      groups: tooltipTarget.dataset.tooltipGroups || '',
      elapsed: tooltipPinned ? tooltipPinDelayMs : Math.max(0, Date.now() - tooltipStartedAt),
      pointer: lastPointer ? { ...lastPointer } : null
    };
  }

  function restoreTooltip(root, snapshot) {
    if (!snapshot || !root || typeof document === 'undefined') return;
    let target = null;
    if (snapshot.pointer) {
      const pointed = document.elementFromPoint(snapshot.pointer.x, snapshot.pointer.y);
      const candidate = pointed && pointed.closest ? pointed.closest('[data-tooltip-title]') : null;
      if (candidate && root.contains(candidate)
        && (candidate.dataset.tooltipTitle || '') === snapshot.title
        && (candidate.dataset.tooltipBody || '') === snapshot.body) target = candidate;
    }
    if (!target) {
      target = Array.from(root.querySelectorAll('[data-tooltip-title]')).find((candidate) => (
        (candidate.dataset.tooltipTitle || '') === snapshot.title
        && (candidate.dataset.tooltipBody || '') === snapshot.body
        && (candidate.dataset.tooltipMaterials || '') === snapshot.materials
        && (candidate.dataset.tooltipGroups || '') === snapshot.groups
      )) || null;
    }
    if (!target) {
      hideTooltip(true);
      return;
    }
    clearTooltipTimer();
    showTooltip(target, snapshot.elapsed);
    if (snapshot.pinned || snapshot.elapsed >= tooltipPinDelayMs) pinTooltip(target);
    else tooltipTimer = window.setTimeout(() => pinTooltip(target), Math.max(1, tooltipPinDelayMs - snapshot.elapsed));
  }

  function leaveTooltipTarget(target) {
    clearTooltipTimer();
    if (tooltipPinned && tooltipTarget === target) {
      return;
    }
    tooltipHideTimer = window.setTimeout(() => hideTooltip(true), 140);
  }

  function bindGlobalTooltipDismiss() {
    if (globalTooltipDismissBound || typeof document === 'undefined') {
      return;
    }
    document.addEventListener('pointermove', (event) => {
      lastPointer = { x: event.clientX, y: event.clientY };
    }, { passive: true });
    document.addEventListener('click', (event) => {
      if (!tooltipPinned) {
        return;
      }
      const clickedTooltip = tooltipElement && tooltipElement.contains(event.target);
      const clickedTrigger = event.target.closest && event.target.closest('[data-tooltip-title]');
      if (!clickedTooltip && !clickedTrigger) {
        hideTooltip(true);
      }
    }, true);
    globalTooltipDismissBound = true;
  }

  function bindTooltips(root) {
    if (typeof root.querySelectorAll !== 'function' || typeof window === 'undefined') {
      return;
    }
    bindGlobalTooltipDismiss();
    root.querySelectorAll('[data-tooltip-title]').forEach((element) => {
      element.addEventListener('pointerenter', () => scheduleTooltip(element));
      element.addEventListener('pointerleave', () => leaveTooltipTarget(element));
      element.addEventListener('focus', () => scheduleTooltip(element));
      element.addEventListener('blur', () => leaveTooltipTarget(element));
    });
  }

  namespace.uiTooltips = Object.freeze({
    ensureTooltipElement,
    positionTooltip,
    clearTooltipTimer,
    showTooltip,
    pinTooltip,
    hideTooltip,
    scheduleTooltip,
    leaveTooltipTarget,
    tooltipSnapshot,
    restoreTooltip,
    bindGlobalTooltipDismiss,
    bindTooltips
  });
})(window.EcoRuler = window.EcoRuler || {});
