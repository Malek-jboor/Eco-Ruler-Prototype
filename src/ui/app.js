(function initializeApp(namespace) {
  const maxLogEntries = 8;
  const tooltipPinDelayMs = 5000;
  let tooltipElement = null;
  let tooltipTimer = null;
  let tooltipPinned = false;
  let tooltipTarget = null;
  let tooltipPinnedAt = 0;
  let globalTooltipDismissBound = false;

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

  function worldProfileById(profileId) {
    return namespace.data.worldProfiles.find((profile) => profile.id === profileId) || namespace.data.worldProfiles[0];
  }

  function worldShapeById(shapeId) {
    return namespace.data.worldShapes.find((shape) => shape.id === shapeId) || namespace.data.worldShapes[0];
  }

  function mapSizeById(sizeId) {
    return namespace.data.mapSizes.find((size) => size.id === sizeId) || namespace.data.mapSizes[0];
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

  function productionSlotSummary(region) {
    const openSlots = region.productionSlots.filter((slot) => slot.status === 'open').length;
    const lockedSlots = region.productionSlots.length - openSlots;
    return `${openSlots} open, ${lockedSlots} locked`;
  }

  function productionSlotRows(region) {
    return `<ol class='slot-list'>${region.productionSlots.map((slot) => `
      <li class='slot-row ${slot.status}'>
        <span>Slot ${slot.index}</span>
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
      notes.push('Water province. It blocks rivers, settlement, and production slots in this prototype.');
      return notes;
    }
    if (region.terrainId === 'desert') {
      notes.push('Desert blocks River and Lake. Water appears through Oasis or Coast only.');
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
    if (region.traits.includes('rich-deposit')) {
      notes.push('Rich Deposit means one existing deposit trait has higher strategic value.');
    }
    return notes.length ? notes : ['No special rule notes yet.'];
  }

  function ruleNoteList(region) {
    return `<ul class='rule-note-list'>${regionRuleNotes(region).map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`;
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
        <div><dt>Production Slots</dt><dd>0 / 3</dd></div>
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
      <div><dt>Production Slots</dt><dd>${productionSlotSummary(region)}</dd></div>
      <div><dt>Neighbors</dt><dd>${region.neighbors.length}</dd></div>
      <div class='detail-wide'><dt>Trait Detail</dt><dd>${traitDetailList(region.traits)}</dd></div>
      <div class='detail-wide'><dt>Slot Detail</dt><dd>${productionSlotRows(region)}</dd></div>
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
    const profile = worldProfileById(worldProfile);
    const shape = worldShapeById(worldShape);
    addLog(state, `Generated ${state.map.summary.totalRegions} regions: ${state.map.summary.landRegions} land, ${state.map.summary.waterRegions} water, ${shape.label}, ${profile.label}.`);
    render(root, state);
  }

  function selectRegion(root, state, regionId) {
    state.map.selectedRegionId = regionId;
    const region = selectedRegion(state);
    if (region) {
      const terrain = terrainById(region.terrainId);
      addLog(state, `Selected ${region.name}: ${terrain.label}, ${region.traits.length} natural traits, ${region.neighbors.length} neighbors.`);
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
    element.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
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

    root.querySelectorAll('[data-region-id]').forEach((regionElement) => {
      regionElement.addEventListener('click', () => selectRegion(root, state, regionElement.dataset.regionId));
      regionElement.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectRegion(root, state, regionElement.dataset.regionId);
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

    bindTooltips(root);
  }

  function render(root, state) {
    const { data, resources } = namespace;
    const profile = worldProfileById(state.map.worldProfile);
    const shape = worldShapeById(state.map.worldShape);
    const size = mapSizeById(state.map.mapSize);
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
            </div>
            <div class='toolbar-actions'>
              <button type='button' data-action='generate-map'>Generate</button>
              <button type='button' disabled>Found City</button>
            </div>
          </div>
          <div class='region-map-shell'>
            <svg class='region-map' viewBox='0 0 ${state.map.viewBox.width} ${state.map.viewBox.height}' aria-label='Generated region map'>
              <polygon class='map-boundary' points='${polygonPoints(state.map.boundary)}'></polygon>
              ${regionPolygons(state)}
              ${riverLines(state)}
            </svg>
          </div>
        </section>

        <aside class='inspector-panel'>
          <section class='panel-block'>
            <h2>Region Inspector</h2>
            <dl class='stat-list'>${selectedRegionRows(state)}</dl>
          </section>
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
          <section class='panel-block'>
            <h2>Natural Traits</h2>
            <dl class='stat-list compact-traits'>${traitSummaryRows(state)}</dl>
          </section>
          <section class='panel-block'>
            <h2>Model Summary</h2>
            <dl class='stat-list'>
              <div><dt>Terrain Types</dt><dd>${state.modelSummary.terrainTypes}</dd></div>
              <div><dt>Resources</dt><dd>${state.modelSummary.resourceTypes}</dd></div>
              <div><dt>Natural Traits</dt><dd>${state.modelSummary.naturalTraits}</dd></div>
              <div><dt>Factories</dt><dd>${state.modelSummary.factories.length}</dd></div>
            </dl>
          </section>
          <section class='panel-block'>
            <h2>Event Log</h2>
            <ol class='event-log'>${logRows(state.log)}</ol>
          </section>
        </aside>
      </main>
    `;

    bindEvents(root, state);
  }

  function mount(root) {
    const state = namespace.createInitialState();
    render(root, state);
  }

  namespace.mountApp = mount;
})(window.EcoRuler = window.EcoRuler || {});
