(function initializeApp(namespace) {
  const maxLogEntries = 8;
  const tooltipPinDelayMs = 5000;
  let tooltipElement = null;
  let tooltipTimer = null;
  let tooltipPinned = false;
  let tooltipTarget = null;
  let tooltipPinnedAt = 0;
  let globalTooltipDismissBound = false;
  let mapDragState = null;
  let provincePopoverDragState = null;
  let suppressRegionClick = false;
  const minMapZoom = 1;
  const maxMapZoom = 16;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function terrainById(terrainId) {
    return namespace.data.terrainTypes.find((terrain) => terrain.id === terrainId);
  }

  function traitById(traitId) {
    return namespace.resources.naturalTraitById[traitId];
  }

  function resourceById(resourceId) {
    return namespace.resources.resourceById[resourceId];
  }

  function worldProfileById(profileId) {
    return namespace.data.worldProfiles.find((profile) => profile.id === profileId) || namespace.data.worldProfiles[0];
  }

  function worldShapeById(shapeId) {
    return namespace.data.worldShapes.find((shape) => shape.id === shapeId) || namespace.data.worldShapes[0];
  }

  function mapSizeById(sizeId) {
    return namespace.data.mapSizes.find((size) => size.id === sizeId) || namespace.data.mapSizes[0];
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function resetMapViewport(state) {
    state.mapViewport = { x: 0, y: 0, zoom: 1 };
    return state.mapViewport;
  }

  function normalizeMapViewport(state, viewport = state.mapViewport) {
    const base = state.map.viewBox || { width: 1120, height: 760 };
    const zoom = clamp(Number(viewport && viewport.zoom) || 1, minMapZoom, maxMapZoom);
    const width = base.width / zoom;
    const height = base.height / zoom;
    return {
      x: clamp(Number(viewport && viewport.x) || 0, 0, Math.max(0, base.width - width)),
      y: clamp(Number(viewport && viewport.y) || 0, 0, Math.max(0, base.height - height)),
      zoom
    };
  }

  function visibleMapViewBox(state) {
    const base = state.map.viewBox || { width: 1120, height: 760 };
    const viewport = normalizeMapViewport(state);
    state.mapViewport = viewport;
    return {
      x: viewport.x,
      y: viewport.y,
      width: base.width / viewport.zoom,
      height: base.height / viewport.zoom,
      zoom: viewport.zoom
    };
  }

  function formatViewBox(viewBox) {
    return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  }

  function setMapViewport(state, viewport) {
    state.mapViewport = normalizeMapViewport(state, viewport);
    return visibleMapViewBox(state);
  }

  function svgPointFromEvent(svg, viewBox, event) {
    const rect = svg.getBoundingClientRect();
    const xRatio = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
    const yRatio = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
    return {
      x: viewBox.x + clamp(xRatio, 0, 1) * viewBox.width,
      y: viewBox.y + clamp(yRatio, 0, 1) * viewBox.height
    };
  }

  function updateMapViewDom(root, state) {
    const svg = root.querySelector('[data-region-map]');
    const zoomLabel = root.querySelector('[data-map-zoom]');
    const viewBox = visibleMapViewBox(state);
    if (svg) {
      svg.setAttribute('viewBox', formatViewBox(viewBox));
    }
    if (zoomLabel) {
      zoomLabel.textContent = `Zoom ${Math.round(viewBox.zoom * 100)}%`;
    }
  }

  function zoomMapAtEvent(root, state, event) {
    const svg = root.querySelector('[data-region-map]');
    if (!svg) {
      return;
    }
    event.preventDefault();
    const before = visibleMapViewBox(state);
    const point = svgPointFromEvent(svg, before, event);
    const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
    const nextZoom = clamp(before.zoom * factor, minMapZoom, maxMapZoom);
    const base = state.map.viewBox;
    const nextWidth = base.width / nextZoom;
    const nextHeight = base.height / nextZoom;
    const xAnchor = before.width ? (point.x - before.x) / before.width : 0.5;
    const yAnchor = before.height ? (point.y - before.y) / before.height : 0.5;
    setMapViewport(state, {
      x: point.x - xAnchor * nextWidth,
      y: point.y - yAnchor * nextHeight,
      zoom: nextZoom
    });
    updateMapViewDom(root, state);
  }

  function startMapDrag(root, state, event) {
    if (event.button !== 0 || event.target.closest('button, input, select, textarea')) {
      return;
    }
    const svg = root.querySelector('[data-region-map]');
    if (!svg) {
      return;
    }
    mapDragState = {
      pointerId: event.pointerId,
      shell: event.currentTarget,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewBox: visibleMapViewBox(state),
      moved: false
    };
  }
  function moveMapDrag(root, state, event) {
    if (!mapDragState || mapDragState.pointerId !== event.pointerId) {
      return;
    }
    const svg = root.querySelector('[data-region-map]');
    if (!svg) {
      return;
    }
    const rect = svg.getBoundingClientRect();
    const dx = event.clientX - mapDragState.startClientX;
    const dy = event.clientY - mapDragState.startClientY;
    if (!mapDragState.moved && Math.abs(dx) + Math.abs(dy) > 5) {
      mapDragState.moved = true;
      mapDragState.shell.setPointerCapture(event.pointerId);
      mapDragState.shell.classList.add('dragging');
    }
    if (!mapDragState.moved) {
      return;
    }
    event.preventDefault();
    const view = mapDragState.startViewBox;
    const nextX = view.x - (rect.width ? dx / rect.width : 0) * view.width;
    const nextY = view.y - (rect.height ? dy / rect.height : 0) * view.height;
    setMapViewport(state, { x: nextX, y: nextY, zoom: view.zoom });
    updateMapViewDom(root, state);
  }
  function finishMapDrag(event) {
    if (!mapDragState || mapDragState.pointerId !== event.pointerId) {
      return;
    }
    if (mapDragState.moved) {
      suppressRegionClick = true;
      window.setTimeout(() => {
        suppressRegionClick = false;
      }, 120);
    }
    mapDragState.shell.classList.remove('dragging');
    mapDragState = null;
  }
  function closeSelectedProvince(root, state) {
    state.map.selectedRegionId = null;
    delete ensureUiState(state).provincePopoverPosition;
    hideTooltip(true);
    render(root, state);
  }

  function closeProvinceBeforeMapSelection(root, state, event) {
    if (!state.map.selectedRegionId || suppressRegionClick) {
      return;
    }
    if (event.target.closest && event.target.closest('[data-province-popover]')) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    closeSelectedProvince(root, state);
  }
  function bindMapViewControls(root, state) {
    const shell = root.querySelector('[data-map-shell]');
    if (shell) {
      shell.addEventListener('wheel', (event) => zoomMapAtEvent(root, state, event), { passive: false });
      shell.addEventListener('click', (event) => closeProvinceBeforeMapSelection(root, state, event), true);
      shell.addEventListener('pointerdown', (event) => startMapDrag(root, state, event));
      shell.addEventListener('pointermove', (event) => moveMapDrag(root, state, event));
      shell.addEventListener('pointerup', finishMapDrag);
      shell.addEventListener('pointercancel', finishMapDrag);
      shell.addEventListener('click', (event) => {
        if (suppressRegionClick || event.target.closest('[data-region-id]')) {
          return;
        }
        if (state.map.selectedRegionId) {
          closeSelectedProvince(root, state);
        }
      });
    }

    root.querySelectorAll('[data-action="reset-map-view"]').forEach((button) => {
      button.addEventListener('click', () => {
        resetMapViewport(state);
        addLog(state, 'Map view reset to 100% zoom.');
        render(root, state);
      });
    });
  }
  function ensureUiState(state) {
    state.ui = state.ui || {};
    return state.ui;
  }

  function clampProvincePopoverPosition(root, panel, left, top) {
    const stage = root.querySelector('.map-stage');
    if (!stage || !panel) {
      return { left, top };
    }
    const margin = 12;
    const maxLeft = Math.max(margin, stage.clientWidth - panel.offsetWidth - margin);
    const maxTop = Math.max(margin, stage.clientHeight - panel.offsetHeight - margin);
    return {
      left: clamp(left, margin, maxLeft),
      top: clamp(top, margin, maxTop)
    };
  }

  function setProvincePopoverAnchor(root, state, event, sourceElement) {
    const stage = root.querySelector('.map-stage');
    if (!stage) {
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    let clientX = event && Number.isFinite(event.clientX) ? event.clientX : null;
    let clientY = event && Number.isFinite(event.clientY) ? event.clientY : null;

    if ((clientX === null || clientY === null) && sourceElement && typeof sourceElement.getBoundingClientRect === 'function') {
      const sourceRect = sourceElement.getBoundingClientRect();
      clientX = sourceRect.left + sourceRect.width / 2;
      clientY = sourceRect.top + sourceRect.height / 2;
    }

    if (clientX === null || clientY === null) {
      return;
    }

    const ui = ensureUiState(state);
    ui.provincePopoverPosition = {
      mode: 'anchor',
      x: clamp(clientX - stageRect.left, 12, Math.max(12, stageRect.width - 12)),
      y: clamp(clientY - stageRect.top, 12, Math.max(12, stageRect.height - 12))
    };
  }

  function positionProvincePopover(root, state) {
    const panel = root.querySelector('[data-province-popover]');
    if (!panel) {
      return;
    }

    const ui = ensureUiState(state);
    const position = ui.provincePopoverPosition;
    if (!position) {
      return;
    }

    let left = position.x;
    let top = position.y;
    if (position.mode !== 'manual') {
      left = position.x - panel.offsetWidth / 2;
      top = position.y - panel.offsetHeight - 12;
    }

    const clamped = clampProvincePopoverPosition(root, panel, left, top);
    panel.style.left = `${clamped.left}px`;
    panel.style.top = `${clamped.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function startProvincePopoverDrag(root, state, event) {
    if (event.button !== 0 || event.target.closest('button')) {
      return;
    }
    const panel = event.currentTarget.closest('[data-province-popover]');
    const stage = root.querySelector('.map-stage');
    if (!panel || !stage) {
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    provincePopoverDragState = {
      pointerId: event.pointerId,
      panel,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    panel.classList.add('dragging');
    hideTooltip(true);
    event.preventDefault();
    event.stopPropagation();
  }

  function moveProvincePopoverDrag(root, state, event) {
    if (!provincePopoverDragState || provincePopoverDragState.pointerId !== event.pointerId) {
      return;
    }
    const stage = root.querySelector('.map-stage');
    const panel = provincePopoverDragState.panel;
    if (!stage || !panel) {
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const desiredLeft = event.clientX - stageRect.left - provincePopoverDragState.offsetX;
    const desiredTop = event.clientY - stageRect.top - provincePopoverDragState.offsetY;
    const clamped = clampProvincePopoverPosition(root, panel, desiredLeft, desiredTop);
    panel.style.left = `${clamped.left}px`;
    panel.style.top = `${clamped.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    ensureUiState(state).provincePopoverPosition = {
      mode: 'manual',
      x: clamped.left,
      y: clamped.top
    };
    event.preventDefault();
    event.stopPropagation();
  }

  function finishProvincePopoverDrag(event) {
    if (!provincePopoverDragState || provincePopoverDragState.pointerId !== event.pointerId) {
      return;
    }
    provincePopoverDragState.panel.classList.remove('dragging');
    provincePopoverDragState = null;
    event.stopPropagation();
  }
  function selectedRegion(state) {
    return state.map.regions.find((region) => region.id === state.map.selectedRegionId) || null;
  }

  function regionById(state, regionId) {
    return state.map.regions.find((region) => region.id === regionId) || null;
  }

  function addLog(state, message) {
    state.log = [message, ...state.log].slice(0, maxLogEntries);
  }

  function tooltipAttributes(title, body) {
    return `data-tooltip-title='${escapeAttribute(title)}' data-tooltip-body='${escapeAttribute(body)}'`;
  }

  function tooltipTrigger(label, title, body, className = '') {
    return `<span class='tooltip-trigger ${className}' ${tooltipAttributes(title, body)}>${escapeHtml(label)}</span>`;
  }

  function terrainLegend(terrainTypes) {
    return terrainTypes
      .map((terrain) => `
        <li class='legend-item'>
          <span class='terrain-swatch' style='background:${terrain.color}'></span>
          <span>${escapeHtml(terrain.label)}</span>
        </li>
      `)
      .join('');
  }

  function categoryRows(categories, resources) {
    return categories
      .map((category) => {
        const count = resources.filter((resource) => resource.category === category.id).length;
        return `<div><dt>${escapeHtml(category.label)}</dt><dd>${count}</dd></div>`;
      })
      .join('');
  }

  function resourceCatalog(categories, resources) {
    return categories
      .map((category) => {
        const categoryResources = resources.filter((resource) => resource.category === category.id);
        return `
          <details class='resource-category' open>
            <summary><span>${escapeHtml(category.label)}</span><strong>${categoryResources.length}</strong></summary>
            <ul class='resource-list'>
              ${categoryResources.map((resource) => {
                const outputs = resource.outputs && resource.outputs.length
                  ? `<em>Outputs: ${resource.outputs.map((output) => escapeHtml(output)).join(', ')}</em>`
                  : '';
                return `
                  <li class='resource-item'>
                    <strong>${escapeHtml(resource.label)}</strong>
                    <span>${escapeHtml(resource.role)}</span>
                    ${outputs}
                  </li>
                `;
              }).join('')}
            </ul>
          </details>
        `;
      })
      .join('');
  }
  function optionsFor(items, selectedId) {
    return items
      .map((item) => `<option value='${item.id}' ${selectedId === item.id ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
      .join('');
  }

  function terrainSummaryRows(state) {
    const total = state.map.summary.totalRegions || 1;
    const landTotal = state.map.summary.landRegions || 1;
    return namespace.data.terrainTypes
      .map((terrain) => {
        const count = state.map.summary.terrainCounts[terrain.id] || 0;
        const basis = terrain.id === 'ocean' ? total : landTotal;
        const percent = Math.round((count / basis) * 100);
        return `<div><dt>${escapeHtml(terrain.label)}</dt><dd>${count} / ${percent}%</dd></div>`;
      })
      .join('');
  }

  function traitSummaryRows(state) {
    return namespace.resources.naturalTraits
      .map((trait) => {
        const count = state.map.summary.traitCounts[trait.id] || 0;
        return `<div><dt>${tooltipTrigger(trait.label, trait.label, trait.role)}</dt><dd>${count}</dd></div>`;
      })
      .join('');
  }

  function traitSummaryTooltipBody(state) {
    return namespace.resources.naturalTraits
      .map((trait) => `${trait.label}: ${state.map.summary.traitCounts[trait.id] || 0}`)
      .join(' | ');
  }

  function modelSummaryTooltipBody(state) {
    return [
      `Terrain Types: ${state.modelSummary.terrainTypes}`,
      `Resources: ${state.modelSummary.resourceTypes}`,
      `Natural Traits: ${state.modelSummary.naturalTraits}`,
      `Factories: ${state.modelSummary.factories.length}`
    ].join(' | ');
  }
  function traitPills(traits) {
    if (!traits.length) {
      return `<span class='muted-text'>None</span>`;
    }

    return traits
      .map((traitId) => {
        const trait = traitById(traitId);
        const label = trait ? trait.label : traitId;
        const role = trait ? trait.role : 'No role defined yet.';
        return `<span class='trait-pill' ${tooltipAttributes(label, role)}>${escapeHtml(label)}</span>`;
      })
      .join('');
  }

  function traitDetailList(traits) {
    if (!traits.length) {
      return `<span class='muted-text'>None</span>`;
    }
    return `<ul class='trait-detail-list'>${traits.map((traitId) => {
      const trait = traitById(traitId);
      const label = trait ? trait.label : traitId;
      const role = trait ? trait.role : 'No role defined yet.';
      return `<li ${tooltipAttributes(label, role)}><strong>${escapeHtml(label)}</strong><span>${escapeHtml(role)}</span></li>`;
    }).join('')}</ul>`;
  }

  function formatEfficiency(value) {
    const percent = Math.round((Number(value) || 0) * 100);
    return `${percent}%`;
  }

  function traitLabelList(traitIds) {
    if (!traitIds.length) return 'None';
    return traitIds.map((traitId) => {
      const trait = traitById(traitId);
      return trait ? trait.label : traitId;
    }).join(', ');
  }

  function resourceToken(resource) {
    const words = resource.label.split(' ');
    const token = words.length > 1
      ? words.map((word) => word.charAt(0)).join('').slice(0, 3)
      : resource.label.slice(0, 3);
    return token.toUpperCase();
  }

  function candidateDetail(candidate) {
    const resource = resourceById(candidate.resourceId) || { label: candidate.resourceId, category: 'unknown' };
    const category = namespace.resources.resourceCategories.find((item) => item.id === resource.category);
    const active = candidate.activeEffects.length
      ? ` | Buffs: ${candidate.activeEffects.map((effect) => {
        const trait = traitById(effect.traitId);
        return `${trait ? trait.label : effect.traitId} +${formatEfficiency(effect.value)}`;
      }).join(', ')}`
      : '';
    return `Category: ${category ? category.label : 'Unknown'} | Final Efficiency: ${formatEfficiency(candidate.finalEfficiency)} | Base: ${formatEfficiency(candidate.baseEfficiency)} | Trait Buff: ${formatEfficiency(candidate.traitBonus)}${active}`;
  }

  function eligibleResourceCandidates(region) {
    return (region.resourceCandidates || []).filter((candidate) => candidate.available);
  }

  function resourceCandidateSummary(region) {
    const available = eligibleResourceCandidates(region).length;
    return `${available} eligible`;
  }

  function resourceCandidateList(region) {
    if (region.isWater) {
      return `<p class='muted-text small-copy'>Water province. No land resources.</p>`;
    }
    const available = eligibleResourceCandidates(region);
    if (!available.length) {
      return `<p class='muted-text small-copy'>No eligible resources.</p>`;
    }

    return `
      <ul class='resource-candidate-list'>
        ${available.map((candidate) => {
          const resource = resourceById(candidate.resourceId) || { label: candidate.resourceId, category: 'unknown' };
          return `
            <li class='resource-candidate available' ${tooltipAttributes(resource.label, candidateDetail(candidate))}>
              <span class='resource-candidate-main'>
                <strong>${escapeHtml(resource.label)}</strong>
              </span>
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }

  function compactResourceCandidateList(region) {
    if (region.isWater) {
      return `<p class='muted-text small-copy'>Water province. No land resources.</p>`;
    }
    const available = eligibleResourceCandidates(region);
    if (!available.length) {
      return `<p class='muted-text small-copy'>No eligible resources.</p>`;
    }

    return `
      <ul class='province-resource-list'>
        ${available.map((candidate) => {
          const resource = resourceById(candidate.resourceId) || { label: candidate.resourceId, category: 'unknown' };
          return `
            <li class='province-resource-row available' ${tooltipAttributes(resource.label, candidateDetail(candidate))}>
              <strong>${escapeHtml(resource.label)}</strong>
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }
  function productionSlotSummary(region) {
    const openSlots = region.productionSlots.filter((slot) => slot.status === 'open').length;
    const lockedSlots = region.productionSlots.length - openSlots;
    return `${openSlots} open, ${lockedSlots} locked`;
  }

  function productionSlotRows(region) {
    return `<ol class='slot-list'>${region.productionSlots.map((slot) => `
      <li class='slot-row ${slot.status}'>
        <span>Work Slot ${slot.index}</span>
        <strong>${slot.status}</strong>
      </li>
    `).join('')}</ol>`;
  }

  function neighborPills(state, region) {
    return `<span class='neighbor-list'>${region.neighbors.map((neighborId) => {
      const neighbor = regionById(state, neighborId);
      if (!neighbor) {
        return `<span>${escapeHtml(neighborId)}</span>`;
      }
      const terrain = terrainById(neighbor.terrainId);
      const title = `${neighbor.name} - ${terrain.label}`;
      return `<span ${tooltipAttributes(title, `Neighbor region with ${neighbor.traits.length} natural traits.`)}>#${neighbor.index + 1} ${neighbor.terrainCode}</span>`;
    }).join('')}</span>`;
  }

  function regionRuleNotes(region) {
    const notes = [];
    if (region.isWater) {
      notes.push('Water province. It blocks rivers, settlement, and work slots in this prototype.');
      return notes;
    }
    if (region.terrainId === 'desert') {
      notes.push('Desert can carry River in the prototype resource rules, but it never receives High Fertility. Lake is still blocked for Desert.');
    }
    if (region.terrainId === 'mountains') {
      notes.push('Mountains block High Fertility even when water is nearby.');
    }
    if (region.traits.includes('coast')) {
      notes.push('Coast is generated from direct adjacency to Ocean provinces.');
    }
    if (region.traits.includes('river') || region.traits.includes('lake')) {
      notes.push('River or Lake can create High Fertility unless terrain blocks it.');
    }
    if (region.traits.includes('god-bless')) {
      notes.push('God Bless adds +100% to primary resource production only. It does not improve settlement value or supply value.');
    }
    return notes.length ? notes : ['No special rule notes yet.'];
  }

  function ruleNoteList(region) {
    return `<ul class='rule-note-list'>${regionRuleNotes(region).map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`;
  }

  function provinceSlotDots(region) {
    return `<span class='province-slot-dots'>${region.productionSlots.map((slot) => `
      <span class='province-slot-dot ${slot.status}' ${tooltipAttributes(`Work Slot ${slot.index}`, `Work slot is ${slot.status}.`)}></span>
    `).join('')}</span>`;
  }

  function selectedRegionPopover(state) {
    const region = selectedRegion(state);
    if (!region) {
      return '';
    }

    const terrain = terrainById(region.terrainId);
    const layerText = region.isWater ? 'Water' : region.notes.replace(' climate band', '');
    const notes = regionRuleNotes(region);
    return `
      <aside class='province-popover' aria-label='Selected province details' data-province-popover>
        <div class='province-popover-header' data-province-drag-handle>
          <div>
            <p class='eyebrow'>Province</p>
            <h2>${escapeHtml(region.name)}</h2>
          </div>
          <button type='button' class='province-popover-close' data-action='close-province' aria-label='Close province details'>X</button>
        </div>

        <div class='province-chip-row'>
          <span ${tooltipAttributes('Terrain', terrain.role || terrain.label)}>${escapeHtml(terrain.label)}</span>
          <span ${tooltipAttributes('Map Layer', layerText)}>${escapeHtml(layerText)}</span>
          <span ${tooltipAttributes('Resources', resourceCandidateSummary(region))}>${resourceCandidateSummary(region)}</span>
          <span ${tooltipAttributes('Work Slots', productionSlotSummary(region))}>${productionSlotSummary(region)}</span>
        </div>

        <section class='province-section'>
          <div class='province-section-title'>
            <h3>Natural Traits</h3>
            <span>${region.traits.length}</span>
          </div>
          <div class='province-traits'>${traitPills(region.traits)}</div>
        </section>

        <section class='province-section'>
          <div class='province-section-title'>
            <h3>Eligible Resources</h3>
            <span>${eligibleResourceCandidates(region).length}</span>
          </div>
          ${compactResourceCandidateList(region)}
        </section>

        <section class='province-section province-quick-facts'>
          <div>
            <dt>Work Slots</dt>
            <dd>${provinceSlotDots(region)}</dd>
          </div>
          <div>
            <dt>Neighbors</dt>
            <dd ${tooltipAttributes('Neighbor Regions', `${region.neighbors.length} adjacent provinces.`)}>${region.neighbors.length}</dd>
          </div>
          <div>
            <dt>Position</dt>
            <dd ${tooltipAttributes('Map Position', `${Math.round(region.center.x)}, ${Math.round(region.center.y)}`)}>${Math.round(region.center.x)}, ${Math.round(region.center.y)}</dd>
          </div>
          <div>
            <dt>Rules</dt>
            <dd ${tooltipAttributes('Rule Notes', notes.join(' '))}>${notes.length}</dd>
          </div>
        </section>
      </aside>
    `;
  }
  function mapQualityWarnings(state) {
    const landTotal = state.map.summary.landRegions || 1;
    const waterTotal = state.map.summary.waterRegions || 0;
    const total = state.map.summary.totalRegions || 1;
    const desert = state.map.summary.terrainCounts.desert || 0;
    const plains = state.map.summary.terrainCounts.plains || 0;
    const coast = state.map.summary.traitCounts.coast || 0;
    const warnings = [];

    if (state.map.worldProfile !== 'arid' && desert / landTotal > 0.36) {
      warnings.push('Desert share is high for this climate.');
    }
    if (plains / landTotal < 0.1) {
      warnings.push('Plains are scarce; early settlement may be harder.');
    }
    if (coast < Math.max(4, Math.round(landTotal * 0.08))) {
      warnings.push('Coast access is limited for the current world shape.');
    }
    if (waterTotal / total < 0.18) {
      warnings.push('Ocean share is low; the map may feel too land-heavy.');
    }

    return warnings;
  }

  function warningList(state) {
    const warnings = mapQualityWarnings(state);
    if (!warnings.length) {
      return `<p class='muted-text small-copy'>No map warnings.</p>`;
    }
    return `<ul class='warning-list'>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`;
  }

  function logRows(log) {
    return log.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('');
  }

  function polygonPoints(points) {
    return points.map((point) => `${point.x},${point.y}`).join(' ');
  }

  function riverLines(state) {
    const rivers = state.map.rivers || [];
    const lines = rivers
      .filter((river) => river.points && river.points.length > 1)
      .map((river) => `<polyline class='river-line' data-river-id='${escapeAttribute(river.id)}' points='${polygonPoints(river.points)}'></polyline>`)
      .join('');

    return lines ? `<g class='river-layer' aria-hidden='true'>${lines}</g>` : '';
  }

  function regionPolygons(state) {
    return state.map.regions
      .map((region) => {
        const terrain = terrainById(region.terrainId);
        const isSelected = region.id === state.map.selectedRegionId;
        const traitText = region.traitCodes.slice(0, 2).join(' ');
        return `
          <g
            class='region-cell${isSelected ? ' selected' : ''}${region.isWater ? ' water' : ' land'}'
            data-region-id='${region.id}'
            role='button'
            tabindex='0'
            aria-label='${escapeAttribute(`${region.name}, ${terrain.label}`)}'
          >
            <polygon class='region-shape' points='${polygonPoints(region.polygon)}' fill='${terrain.color}'></polygon>
            <text class='region-svg-code' x='${region.center.x}' y='${region.center.y - 3}'>${region.terrainCode}</text>
            <text class='region-svg-traits' x='${region.center.x}' y='${region.center.y + 12}'>${escapeHtml(traitText)}</text>
          </g>
        `;
      })
      .join('');
  }

  function selectedRegionRows(state) {
    const region = selectedRegion(state);
    if (!region) {
      return `
        <div><dt>Selected Region</dt><dd>None</dd></div>
        <div><dt>Terrain</dt><dd>Pending</dd></div>
        <div><dt>Natural Traits</dt><dd>Pending</dd></div>
        <div><dt>Work Slots</dt><dd>0 / 3</dd></div>
      `;
    }

    const terrain = terrainById(region.terrainId);
    const layerText = region.isWater ? 'Water' : region.notes.replace(' climate band', '');
    return `
      <div><dt>Selected Region</dt><dd>${escapeHtml(region.name)}</dd></div>
      <div><dt>Map Position</dt><dd>${Math.round(region.center.x)}, ${Math.round(region.center.y)}</dd></div>
      <div><dt>Terrain</dt><dd>${escapeHtml(terrain.label)}</dd></div>
      <div><dt>Map Layer</dt><dd>${escapeHtml(layerText)}</dd></div>
      <div><dt>Natural Traits</dt><dd><span class='trait-list'>${traitPills(region.traits)}</span></dd></div>
      <div><dt>Work Slots</dt><dd>${productionSlotSummary(region)}</dd></div>
      <div><dt>Resources</dt><dd>${resourceCandidateSummary(region)}</dd></div>
      <div><dt>Neighbors</dt><dd>${region.neighbors.length}</dd></div>
      <div class='detail-wide'><dt>Trait Detail</dt><dd>${traitDetailList(region.traits)}</dd></div>
      <div class='detail-wide'><dt>Resource Candidates</dt><dd>${resourceCandidateList(region)}</dd></div>
      <div class='detail-wide'><dt>Work Slot Detail</dt><dd>${productionSlotRows(region)}</dd></div>
      <div class='detail-wide'><dt>Neighbor Regions</dt><dd>${neighborPills(state, region)}</dd></div>
      <div class='detail-wide'><dt>Rule Notes</dt><dd>${ruleNoteList(region)}</dd></div>
    `;
  }

  function readWorldProfile(root) {
    const input = root.querySelector('[data-world-profile]');
    return namespace.mapGenerator.normalizeWorldProfile(input ? input.value : namespace.data.mapDefaults.worldProfile);
  }

  function readWorldShape(root) {
    const input = root.querySelector('[data-world-shape]');
    return namespace.mapGenerator.normalizeWorldShape(input ? input.value : namespace.data.mapDefaults.worldShape);
  }

  function readMapSize(root) {
    const input = root.querySelector('[data-map-size]');
    return namespace.mapGenerator.normalizeMapSize(input ? input.value : namespace.data.mapDefaults.mapSize);
  }

  function readClusterStrength(root) {
    const input = root.querySelector('[data-cluster-strength]');
    return namespace.mapGenerator.normalizeClusterStrength(input ? input.value : namespace.data.mapDefaults.clusterStrength);
  }

  function readSeed(root) {
    const input = root.querySelector('[data-map-seed]');
    return input && input.value.trim() ? input.value.trim() : namespace.data.mapDefaults.seed;
  }

  function generateMap(root, state, options = {}) {
    const seed = options.randomSeed ? `seed-${Date.now().toString(36)}` : readSeed(root);
    const worldProfile = readWorldProfile(root);
    const worldShape = readWorldShape(root);
    const mapSize = readMapSize(root);
    const clusterStrength = readClusterStrength(root);
    state.map = namespace.mapGenerator.generateRegionMap({
      mapSize,
      worldShape,
      seed,
      worldProfile,
      clusterStrength
    });
    resetMapViewport(state);
    const profile = worldProfileById(worldProfile);
    const shape = worldShapeById(worldShape);
    addLog(state, `Generated ${state.map.summary.totalRegions} regions: ${state.map.summary.landRegions} land, ${state.map.summary.waterRegions} water, ${shape.label}, ${profile.label}.`);
    render(root, state);
  }

  function selectRegion(root, state, regionId, event = null, sourceElement = null) {
    state.map.selectedRegionId = regionId;
    setProvincePopoverAnchor(root, state, event, sourceElement);
    const region = selectedRegion(state);
    if (region) {
      const terrain = terrainById(region.terrainId);
      const availableResources = (region.resourceCandidates || []).filter((candidate) => candidate.available).length;
      addLog(state, `Selected ${region.name}: ${terrain.label}, ${region.traits.length} natural traits, ${availableResources} resources, ${region.neighbors.length} neighbors.`);
    }
    render(root, state);
  }

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
  }

  function clearTooltipTimer() {
    if (tooltipTimer) {
      window.clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
  }

  function showTooltip(target) {
    const element = ensureTooltipElement();
    if (!element) {
      return;
    }
    const title = escapeHtml(target.dataset.tooltipTitle || '');
    const body = escapeHtml(target.dataset.tooltipBody || '');
    tooltipTarget = target;
    tooltipPinned = false;
    tooltipPinnedAt = 0;
    element.style.setProperty('--tooltip-pin-ms', `${tooltipPinDelayMs}ms`);
    element.innerHTML = `<div class='tooltip-head'><strong>${title}</strong><svg class='tooltip-pin-progress' viewBox='0 0 18 18' aria-hidden='true'><circle class='track' cx='9' cy='9' r='7'></circle><circle class='fill' cx='9' cy='9' r='7'></circle></svg></div><span>${body}</span>`;
    element.classList.add('visible');
    element.classList.remove('pinned');
    element.dataset.tooltipState = 'open';
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
    tooltipPinned = false;
    tooltipPinnedAt = 0;
    tooltipTarget = null;
    if (tooltipElement) {
      tooltipElement.classList.remove('visible', 'pinned');
      tooltipElement.dataset.tooltipState = 'closed';
    }
  }

  function scheduleTooltip(target) {
    if (tooltipPinned && tooltipTarget === target) {
      return;
    }
    clearTooltipTimer();
    showTooltip(target);
    tooltipTimer = window.setTimeout(() => pinTooltip(target), tooltipPinDelayMs);
  }

  function leaveTooltipTarget(target) {
    clearTooltipTimer();
    if (tooltipPinned && tooltipTarget === target) {
      return;
    }
    hideTooltip(true);
  }

  function bindGlobalTooltipDismiss() {
    if (globalTooltipDismissBound || typeof document === 'undefined') {
      return;
    }
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

  function bindEvents(root, state) {
    if (typeof root.querySelectorAll !== 'function') {
      return;
    }

    root.querySelectorAll('[data-action="generate-map"]').forEach((button) => {
      button.addEventListener('click', () => generateMap(root, state));
    });

    root.querySelectorAll('[data-action="random-seed"]').forEach((button) => {
      button.addEventListener('click', () => generateMap(root, state, { randomSeed: true }));
    });

    root.querySelectorAll('[data-action="close-province"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        closeSelectedProvince(root, state);
      });
    });
    root.querySelectorAll('[data-region-id]').forEach((regionElement) => {
      regionElement.addEventListener('click', (event) => {
        if (suppressRegionClick) {
          event.preventDefault();
          return;
        }
        event.stopPropagation();
        selectRegion(root, state, regionElement.dataset.regionId, event, regionElement);
      });
      regionElement.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectRegion(root, state, regionElement.dataset.regionId, null, regionElement);
        }
      });
    });

    root.querySelectorAll('[data-cluster-strength]').forEach((input) => {
      input.addEventListener('input', () => {
        const output = root.querySelector('[data-cluster-value]');
        if (output) {
          output.textContent = input.value;
        }
      });
    });

    root.querySelectorAll('[data-province-drag-handle]').forEach((handle) => {
      handle.addEventListener('pointerdown', (event) => startProvincePopoverDrag(root, state, event));
      handle.addEventListener('pointermove', (event) => moveProvincePopoverDrag(root, state, event));
      handle.addEventListener('pointerup', finishProvincePopoverDrag);
      handle.addEventListener('pointercancel', finishProvincePopoverDrag);
    });

    root.querySelectorAll('[data-province-popover]').forEach((panel) => {
      panel.addEventListener('click', (event) => event.stopPropagation());
      panel.addEventListener('pointerdown', (event) => event.stopPropagation());
    });
    bindMapViewControls(root, state);
    bindTooltips(root);
  }

  function render(root, state) {
    const { data, resources } = namespace;
    const profile = worldProfileById(state.map.worldProfile);
    const shape = worldShapeById(state.map.worldShape);
    const size = mapSizeById(state.map.mapSize);
    const mapView = visibleMapViewBox(state);
    root.innerHTML = `
      <header class='topbar'>
        <div>
          <p class='eyebrow'>${data.prototypeMilestone.name}</p>
          <h1>Eco Ruler</h1>
        </div>
        <div class='clock-strip' aria-label='Simulation clock'>
          <span>Year ${state.clock.year}</span>
          <span>${state.clock.season}</span>
          <span>Day ${state.clock.day}</span>
          <strong>${state.clock.speed}</strong>
        </div>
      </header>

      <main class='workspace'>
        <aside class='side-panel'>
          <section class='panel-block'>
            <h2>Prototype Scope</h2>
            <ul class='scope-list'>
              ${data.prototypeMilestone.scope.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </section>

          <section class='panel-block'>
            <h2>Map Tuning</h2>
            <div class='tuning-form'>
              <label class='seed-row'>
                <span>Map Size</span>
                <select data-map-size>${optionsFor(data.mapSizes, state.map.mapSize)}</select>
              </label>
              <label class='seed-row'>
                <span>World Shape</span>
                <select data-world-shape>${optionsFor(data.worldShapes, state.map.worldShape)}</select>
              </label>
              <p class='profile-note'>${escapeHtml(shape.description)}</p>
              <label class='seed-row'>
                <span>Climate</span>
                <select data-world-profile>${optionsFor(data.worldProfiles, state.map.worldProfile)}</select>
              </label>
              <p class='profile-note'>${escapeHtml(profile.description)}</p>
              <label class='seed-row'>
                <span>Seed</span>
                <input type='text' value='${escapeAttribute(state.map.seed)}' data-map-seed />
              </label>
              <label class='seed-row'>
                <span>Cluster Strength <strong data-cluster-value>${state.map.clusterStrength}</strong></span>
                <input type='range' min='0' max='100' step='1' value='${state.map.clusterStrength}' data-cluster-strength />
              </label>
              <div class='tuning-actions'>
                <button type='button' data-action='generate-map'>Generate</button>
                <button type='button' data-action='random-seed'>New Seed</button>
              </div>
            </div>
          </section>

          <section class='panel-block'>
            <h2>Terrain Types</h2>
            <ul class='legend-list'>${terrainLegend(data.terrainTypes)}</ul>
          </section>

          <section class='panel-block'>
            <h2>Resource Groups</h2>
            <dl class='stat-list compact-list'>${categoryRows(resources.resourceCategories, resources.resourceTypes)}</dl>
          </section>
          <section class='panel-block resource-catalog-panel'>
            <h2>Resource Catalog</h2>
            <div class='resource-catalog'>${resourceCatalog(resources.resourceCategories, resources.resourceTypes)}</div>
            <p class='profile-note'>Meat, Milk, Leather, Wool, and Fur are animal outputs. Bronze is manufactured later from Copper and Tin.</p>
          </section>
        </aside>

        <section class='map-stage' aria-label='World map stage'>
          <div class='map-toolbar'>
            <div>
              <p class='eyebrow'>World Map</p>
              <h2>Water Region Map</h2>
            </div>
            <div class='map-toolbar-meta'>
              <span>${size.label}</span>
              <span>${shape.label}</span>
              <span>${profile.label}</span>
              <span>${state.map.summary.landRegions} land</span>
              <span>${state.map.summary.waterRegions} water</span>
              <span data-map-zoom>Zoom ${Math.round(mapView.zoom * 100)}%</span>
            </div>
            <div class='toolbar-actions'>
              <button type='button' data-action='generate-map'>Generate</button>
              <button type='button' data-action='reset-map-view'>Reset View</button>
              <button type='button' disabled>Found City</button>
            </div>
          </div>
          <div class='region-map-shell' data-map-shell>
            <svg class='region-map' data-region-map viewBox='${formatViewBox(mapView)}' aria-label='Generated region map'>
              <polygon class='map-boundary' points='${polygonPoints(state.map.boundary)}'></polygon>
              ${regionPolygons(state)}
              ${riverLines(state)}
            </svg>
          </div>
          ${selectedRegionPopover(state)}
        </section>

        <aside class='inspector-panel'>
          <section class='panel-block'>
            <h2>Map Summary</h2>
            <dl class='stat-list'>
              <div><dt>Map Size</dt><dd>${escapeHtml(size.label)}</dd></div>
              <div><dt>World Shape</dt><dd>${escapeHtml(shape.label)}</dd></div>
              <div><dt>Climate</dt><dd>${escapeHtml(profile.label)}</dd></div>
              <div><dt>Total Regions</dt><dd>${state.map.summary.totalRegions}</dd></div>
              <div><dt>Land / Water</dt><dd>${state.map.summary.landRegions} / ${state.map.summary.waterRegions}</dd></div>
              <div><dt>Cluster Strength</dt><dd>${state.map.clusterStrength}</dd></div>
              <div><dt>Trait Regions</dt><dd>${state.map.summary.traitBearingRegions}</dd></div>
              ${terrainSummaryRows(state)}
            </dl>
          </section>
          <section class='panel-block'>
            <h2>Map Warnings</h2>
            ${warningList(state)}
          </section>
          <section class='panel-block summary-icons-panel'>
            <h2>Quick Info</h2>
            <div class='summary-icon-row'>
              <button type='button' class='summary-icon-button' ${tooltipAttributes('Natural Traits', traitSummaryTooltipBody(state))} aria-label='Natural traits summary'>NT</button>
              <button type='button' class='summary-icon-button' ${tooltipAttributes('Model Summary', modelSummaryTooltipBody(state))} aria-label='Model summary'>MS</button>
            </div>
          </section>
          <section class='panel-block'>
            <h2>Event Log</h2>
            <ol class='event-log'>${logRows(state.log)}</ol>
          </section>
        </aside>
      </main>
    `;

    bindEvents(root, state);
    positionProvincePopover(root, state);
  }

  function mount(root) {
    const state = namespace.createInitialState();
    render(root, state);
  }

  namespace.mountApp = mount;
})(window.EcoRuler = window.EcoRuler || {});
