(function initializeApp(namespace) {
  const maxLogEntries = 8;

  function terrainById(terrainId) {
    return namespace.data.terrainTypes.find((terrain) => terrain.id === terrainId);
  }

  function traitById(traitId) {
    return namespace.resources.naturalTraitById[traitId];
  }

  function selectedRegion(state) {
    return state.map.regions.find((region) => region.id === state.map.selectedRegionId) || null;
  }

  function addLog(state, message) {
    state.log = [message, ...state.log].slice(0, maxLogEntries);
  }

  function terrainLegend(terrainTypes) {
    return terrainTypes
      .map((terrain) => `
        <li class='legend-item'>
          <span class='terrain-swatch' style='background:${terrain.color}'></span>
          <span>${terrain.label}</span>
        </li>
      `)
      .join('');
  }

  function categoryRows(categories, resources) {
    return categories
      .map((category) => {
        const count = resources.filter((resource) => resource.category === category.id).length;
        return `<div><dt>${category.label}</dt><dd>${count}</dd></div>`;
      })
      .join('');
  }

  function terrainWeightControls(terrainTypes, weights) {
    return terrainTypes
      .map((terrain) => `
        <label class='tuning-row'>
          <span>
            <i class='terrain-swatch' style='background:${terrain.color}'></i>
            ${terrain.label}
          </span>
          <input type='number' min='0' max='100' step='1' value='${weights[terrain.id]}' data-terrain-weight='${terrain.id}' />
        </label>
      `)
      .join('');
  }

  function terrainSummaryRows(state) {
    const total = state.map.summary.totalRegions || 1;
    return namespace.data.terrainTypes
      .map((terrain) => {
        const count = state.map.summary.terrainCounts[terrain.id] || 0;
        const percent = Math.round((count / total) * 100);
        return `<div><dt>${terrain.label}</dt><dd>${count} / ${percent}%</dd></div>`;
      })
      .join('');
  }

  function traitSummaryRows(state) {
    return namespace.resources.naturalTraits
      .map((trait) => {
        const count = state.map.summary.traitCounts[trait.id] || 0;
        return `<div><dt>${trait.label}</dt><dd>${count}</dd></div>`;
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
        return `<span class='trait-pill'>${trait ? trait.label : traitId}</span>`;
      })
      .join('');
  }

  function logRows(log) {
    return log.map((entry) => `<li>${entry}</li>`).join('');
  }

  function regionTiles(state) {
    return state.map.regions
      .map((region) => {
        const terrain = terrainById(region.terrainId);
        const isSelected = region.id === state.map.selectedRegionId;
        const traitMarkers = region.traitCodes.slice(0, 3).map((code) => `<span>${code}</span>`).join('');
        return `
          <button
            type='button'
            class='region-tile${isSelected ? ' selected' : ''}'
            style='background:${terrain.color}'
            data-region-id='${region.id}'
            title='${region.name} - ${terrain.label}'
            aria-label='${region.name}, ${terrain.label}'
          >
            <span class='region-code'>${region.terrainCode}</span>
            <span class='region-name'>${region.grid.x + 1},${region.grid.y + 1}</span>
            <span class='region-traits'>${traitMarkers}</span>
          </button>
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
    const openSlots = region.productionSlots.filter((slot) => slot.status === 'open').length;
    return `
      <div><dt>Selected Region</dt><dd>${region.name}</dd></div>
      <div><dt>Terrain</dt><dd>${terrain.label}</dd></div>
      <div><dt>Natural Traits</dt><dd><span class='trait-list'>${traitPills(region.traits)}</span></dd></div>
      <div><dt>Production Slots</dt><dd>${openSlots} / ${region.productionSlots.length}</dd></div>
      <div><dt>Neighbors</dt><dd>${region.neighbors.length}</dd></div>
      <div><dt>Climate Band</dt><dd>${region.notes.replace(' climate band', '')}</dd></div>
    `;
  }

  function readTerrainWeights(root) {
    const weights = {};
    namespace.data.terrainTypes.forEach((terrain) => {
      const input = root.querySelector(`[data-terrain-weight='${terrain.id}']`);
      weights[terrain.id] = input ? Number(input.value) : 0;
    });
    return namespace.mapGenerator.normalizeTerrainWeights(weights);
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
    const terrainWeights = readTerrainWeights(root);
    const clusterStrength = readClusterStrength(root);
    state.map = namespace.mapGenerator.generateRegionMap({
      width: namespace.data.mapDefaults.width,
      height: namespace.data.mapDefaults.height,
      seed,
      clusterStrength,
      terrainWeights
    });
    addLog(state, `Generated ${state.map.summary.totalRegions} regions, ${state.map.summary.traitBearingRegions} with natural traits.`);
    render(root, state);
  }

  function selectRegion(root, state, regionId) {
    state.map.selectedRegionId = regionId;
    const region = selectedRegion(state);
    if (region) {
      const terrain = terrainById(region.terrainId);
      addLog(state, `Selected ${region.name}: ${terrain.label}, ${region.traits.length} natural traits.`);
    }
    render(root, state);
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

    root.querySelectorAll('[data-region-id]').forEach((tile) => {
      tile.addEventListener('click', () => selectRegion(root, state, tile.dataset.regionId));
    });
  }

  function render(root, state) {
    const { data, resources } = namespace;
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
              ${data.prototypeMilestone.scope.map((item) => `<li>${item}</li>`).join('')}
            </ul>
          </section>

          <section class='panel-block'>
            <h2>Map Tuning</h2>
            <div class='tuning-form'>
              <label class='seed-row'>
                <span>Seed</span>
                <input type='text' value='${state.map.seed}' data-map-seed />
              </label>
              <label class='seed-row'>
                <span>Cluster Strength</span>
                <input type='number' min='0' max='100' step='1' value='${state.map.clusterStrength}' data-cluster-strength />
              </label>
              <div class='terrain-weight-list'>
                ${terrainWeightControls(data.terrainTypes, state.map.terrainWeights)}
              </div>
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
            <dl class='stat-list compact-list'>
              ${categoryRows(resources.resourceCategories, resources.resourceTypes)}
            </dl>
          </section>
        </aside>

        <section class='map-stage' aria-label='World map stage'>
          <div class='map-toolbar'>
            <div>
              <p class='eyebrow'>World Map</p>
              <h2>Natural Layer Map</h2>
            </div>
            <div class='map-toolbar-meta'>
              <span>${state.map.width} x ${state.map.height}</span>
              <span>${state.map.summary.totalRegions} regions</span>
              <span>${state.map.summary.traitBearingRegions} trait regions</span>
            </div>
            <div class='toolbar-actions'>
              <button type='button' data-action='generate-map'>Generate</button>
              <button type='button' disabled>Found City</button>
            </div>
          </div>
          <div class='region-grid-shell'>
            <div class='region-grid' style='--map-columns:${state.map.width}'>
              ${regionTiles(state)}
            </div>
          </div>
        </section>

        <aside class='inspector-panel'>
          <section class='panel-block'>
            <h2>Region Inspector</h2>
            <dl class='stat-list'>
              ${selectedRegionRows(state)}
            </dl>
          </section>
          <section class='panel-block'>
            <h2>Map Summary</h2>
            <dl class='stat-list'>
              <div><dt>Cluster Strength</dt><dd>${state.map.clusterStrength}</dd></div>
              <div><dt>Trait Regions</dt><dd>${state.map.summary.traitBearingRegions}</dd></div>
              ${terrainSummaryRows(state)}
            </dl>
          </section>
          <section class='panel-block'>
            <h2>Natural Traits</h2>
            <dl class='stat-list compact-traits'>
              ${traitSummaryRows(state)}
            </dl>
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
