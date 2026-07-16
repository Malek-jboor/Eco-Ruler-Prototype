(function initializeApp(namespace) {
  function terrainLegend(terrainTypes) {
    return terrainTypes
      .map((terrain) => `
        <li class="legend-item">
          <span class="terrain-swatch" style="background:${terrain.color}"></span>
          <span>${terrain.label}</span>
        </li>
      `)
      .join("");
  }

  function categoryRows(categories, resources) {
    return categories
      .map((category) => {
        const count = resources.filter((resource) => resource.category === category.id).length;
        return `<div><dt>${category.label}</dt><dd>${count}</dd></div>`;
      })
      .join("");
  }

  function logRows(log) {
    return log.map((entry) => `<li>${entry}</li>`).join("");
  }

  function render(root, state) {
    const { data, resources } = namespace;
    root.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">${data.prototypeMilestone.name}</p>
          <h1>Eco Ruler</h1>
        </div>
        <div class="clock-strip" aria-label="Simulation clock">
          <span>Year ${state.clock.year}</span>
          <span>${state.clock.season}</span>
          <span>Day ${state.clock.day}</span>
          <strong>${state.clock.speed}</strong>
        </div>
      </header>

      <main class="workspace">
        <aside class="side-panel">
          <section class="panel-block">
            <h2>Prototype Scope</h2>
            <ul class="scope-list">
              ${data.prototypeMilestone.scope.map((item) => `<li>${item}</li>`).join("")}
            </ul>
          </section>
          <section class="panel-block">
            <h2>Terrain Types</h2>
            <ul class="legend-list">${terrainLegend(data.terrainTypes)}</ul>
          </section>
          <section class="panel-block">
            <h2>Resource Groups</h2>
            <dl class="stat-list compact-list">
              ${categoryRows(resources.resourceCategories, resources.resourceTypes)}
            </dl>
          </section>
        </aside>

        <section class="map-stage" aria-label="World map stage">
          <div class="map-toolbar">
            <div>
              <p class="eyebrow">World Map</p>
              <h2>Region Map Shell</h2>
            </div>
            <div class="toolbar-actions">
              <button type="button" disabled>Generate</button>
              <button type="button" disabled>Found City</button>
            </div>
          </div>
          <div class="map-placeholder" role="img" aria-label="Empty map placeholder">
            <div class="continent-shape"></div>
            <div class="map-grid-lines"></div>
          </div>
        </section>

        <aside class="inspector-panel">
          <section class="panel-block">
            <h2>Region Inspector</h2>
            <dl class="stat-list">
              <div><dt>Selected Region</dt><dd>None</dd></div>
              <div><dt>Terrain</dt><dd>Pending</dd></div>
              <div><dt>Natural Traits</dt><dd>Pending</dd></div>
              <div><dt>Production Slots</dt><dd>0 / 3</dd></div>
            </dl>
          </section>
          <section class="panel-block">
            <h2>Model Summary</h2>
            <dl class="stat-list">
              <div><dt>Terrain Types</dt><dd>${state.modelSummary.terrainTypes}</dd></div>
              <div><dt>Resources</dt><dd>${state.modelSummary.resourceTypes}</dd></div>
              <div><dt>Natural Traits</dt><dd>${state.modelSummary.naturalTraits}</dd></div>
              <div><dt>Factories</dt><dd>${state.modelSummary.factories.length}</dd></div>
            </dl>
          </section>
          <section class="panel-block">
            <h2>Event Log</h2>
            <ol class="event-log">${logRows(state.log)}</ol>
          </section>
        </aside>
      </main>
    `;
  }

  function mount(root) {
    const state = namespace.createInitialState();
    render(root, state);
  }

  namespace.mountApp = mount;
})(window.EcoRuler = window.EcoRuler || {});
