(function initializeManufacturingUi(namespace) {
  const { escapeHtml, escapeAttribute } = namespace.uiCore;

  function icon(name) {
    return "<i data-lucide='" + escapeAttribute(name) + "' aria-hidden='true'></i>";
  }

  function tooltipAttributes(title, body) {
    return "data-tooltip-title='" + escapeAttribute(title)
      + "' data-tooltip-body='" + escapeAttribute(body) + "'";
  }

  function formatNumber(value) {
    const rounded = Math.round((Number(value) || 0) * 2) / 2;
    return rounded.toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
  }

  function formatPercent(value) {
    return formatNumber(value) + '%';
  }

  function itemLabel(resourceId) {
    const item = namespace.storageLedger.storageItemById[resourceId];
    return item ? item.label : resourceId;
  }

  function recipeLabel(recipe) {
    return recipe.routeLabel
      ? recipe.label + ' (' + recipe.routeLabel + ')'
      : recipe.label;
  }

  function materialDetails(state, preview) {
    if (!preview) return 'Construction preview is unavailable.';
    return Object.entries(preview.materials || {}).map(([resourceId, required]) => {
      const available = Number(state.storage.available[resourceId]) || 0;
      return itemLabel(resourceId) + ': ' + formatNumber(required) + ' / '
        + formatNumber(available) + (available >= required ? ' available' : ' missing');
    }).concat([
      'Duration: ' + preview.days + ' Days',
      'Cash: ' + preview.cashPercent + '% reference value (deferred)'
    ]).join('\n');
  }

  function buildTooltip(state, availability, title) {
    const preview = availability.preview || {};
    const body = [availability.reason, preview.days ? `Duration: ${preview.days} Days` : '',
      preview.targetLevel ? `Target Level: ${preview.targetLevel}` : '', 'Required / Available materials are listed below.']
      .filter(Boolean).join('\n');
    return namespace.uiProvince.materialTooltipAttributes(state, title, body, preview.materials);
  }

  function reduceTooltip(preview) {
    if (!preview || !preview.allowed) {
      return preview && preview.reason ? preview.reason : 'Nothing to reduce.';
    }
    return preview.reason || 'Removes one level. No refund.';
  }

  function constructionCards(state, category, mode) {
    return namespace.manufacturingData.processingBuildingList
      .filter((definition) => definition.category === category)
      .map((definition) => {
        const active = mode
          && mode.kind === 'processing-building'
          && mode.buildingId === definition.id;
        const locked = !namespace.manufacturing.unlockedRecipes(state, definition).length;
        return "<button type='button' class='build-card " + (active ? 'active ' : '')
          + (locked ? 'locked' : '') + "' data-action='select-build-type'"
          + " data-kind='processing-building'"
          + " data-building-id='" + escapeAttribute(definition.id) + "'"
          + " data-label='" + escapeAttribute(definition.label) + "'"
          + " data-search-text='" + escapeAttribute(definition.label + ' ' + category) + "'>"
          + icon(definition.category === 'military' ? 'shield' : 'factory')
          + "<span><strong>" + escapeHtml(definition.label) + "</strong><small>"
          + (locked ? 'Unavailable' : definition.recipes.length + ' recipe' + (definition.recipes.length === 1 ? '' : 's') + ' | Dev ' + formatNumber(definition.construction.footprint, 4) + ' per level | Tiers ' + Array.from(new Set(definition.recipes.map((recipe) => recipe.tier))).join('/'))
          + "</small></span></button>";
      }).join('');
  }

  function projectsFor(state, city, definition) {
    const region = namespace.manufacturing.settlementRegion(state, city);
    return namespace.manufacturing.buildingProjects(region, city.id, definition.id);
  }

  function projectProgress(state, city, definition) {
    const region = namespace.manufacturing.settlementRegion(state, city);
    if (!region) return '';
    const ordered = namespace.constructionQueue.orderedProjects(region);
    const projects = projectsFor(state, city, definition);
    if (!projects.length) return '';
    return "<div class='processing-project-list'>" + projects.map((project) => {
      const percent = Math.max(0, Math.min(100, (project.progressDays / project.durationDays) * 100));
      const position = ordered.findIndex((item) => item.id === project.id) + 1;
      const status = project.status === 'waiting'
        ? 'Queue ' + position
        : project.status === 'paused' ? 'Paused' : 'Active';
      return "<div class='processing-project'><div><strong>Level "
        + project.targetLevel + "</strong><span>" + status + " | "
        + formatNumber(project.progressDays) + " / " + formatNumber(project.durationDays)
        + " Days</span></div><span class='site-progress-track'><i data-project-progress='"
        + escapeAttribute(project.id) + "' data-progress-days='" + project.progressDays
        + "' data-duration-days='" + project.durationDays + "' style='width:" + percent
        + "%'></i></span></div>";
    }).join('') + '</div>';
  }

  function outputSummary(state, building, definition) {
    if (!building || building.level <= 0) return 'No Output';
    const allocations = building.pendingAllocations || building.allocations || {};
    const outputs = definition.recipes
      .filter((recipe) => namespace.manufacturing.recipeUnlocked(state, recipe))
      .map((recipe) => {
        const share = Number(allocations[recipe.id]) || 0;
        if (share <= 0) return null;
        return formatNumber(recipe.annualOutput * building.level * share / 100)
          + ' ' + itemLabel(recipe.outputId);
      }).filter(Boolean);
    return outputs.length ? outputs.join(' + ') : 'No Output';
  }

  function actualOutputSummary(building) {
    if (!building || !Array.isArray(building.lastProduction) || !building.lastProduction.length) return '0.0';
    const outputs = {};
    building.lastProduction.forEach((line) => {
      outputs[line.outputId] = (outputs[line.outputId] || 0) + (Number(line.output) || 0) * namespace.manufacturing.DAYS_PER_YEAR;
    });
    return Object.entries(outputs).map(([resourceId, amount]) => formatNumber(amount) + ' ' + itemLabel(resourceId)).join(' + ') || '0.0';
  }

  function buildingProductivity(building, definition) {
    if (!building || building.level <= 0) return 0;
    const allocations = building.allocations || {};
    const maximum = definition.recipes.reduce((sum, recipe) => (
      sum + recipe.annualOutput * building.level * (Number(allocations[recipe.id]) || 0) / 100
    ), 0);
    const actual = (building.lastProduction || []).reduce((sum, line) => (
      sum + (Number(line.output) || 0) * namespace.manufacturing.DAYS_PER_YEAR
    ), 0);
    return maximum > 0 ? Math.max(0, Math.min(100, actual / maximum * 100)) : 0;
  }
  function buildingCard(state, city, definition, showUnbuilt = false) {
    const building = namespace.manufacturing.buildingById(city, definition.id);
    const projects = projectsFor(state, city, definition);
    if (!showUnbuilt && !building && !projects.length) return '';
    const region = namespace.manufacturing.settlementRegion(state, city);
    const projected = namespace.manufacturing.projectedLevel(state, city, definition.id);
    const availability = namespace.manufacturing.buildAvailability(state, region.id, definition.id);
    const reduction = namespace.manufacturing.reducePreview(state, city.id, definition.id);
    const required = building ? namespace.manufacturing.requiredWorkers(state, building) : 0;
    const cap = building
      ? (Number.isFinite(building.pendingWorkerCap) ? building.pendingWorkerCap : building.workerCap)
      : 0;
    const status = building
      ? building.status
      : 'Construction Queued';

    if (showUnbuilt) {
      const actualWorkers = building ? Number(building.actualWorkers) || 0 : 0;
      const shortage = Math.max(0, cap - actualWorkers);
      const productivity = buildingProductivity(building, definition);
      const currentStatus = building ? building.status : (projects.length ? 'Construction Queued' : 'Eligible');
      const workerControl = building
        ? "<label class='compact-worker-slider building-row-worker'><span>Worker Cap <b>" + cap + " / " + required + "</b></span><span class='worker-coverage-track'><i style='width:" + (required ? actualWorkers / required * 100 : 0) + "%'></i><b style='left:" + (required ? actualWorkers / required * 100 : 0) + "%;width:" + (required ? shortage / required * 100 : 0) + "%'></b></span><input type='range' min='0' max='" + required + "' step='1' value='" + cap + "' data-action='quick-processing-worker-cap' data-city-id='" + escapeAttribute(city.id) + "' data-building-id='" + escapeAttribute(definition.id) + "'></label>"
        : '';
      return "<article class='processing-building-card compact-building-row building-list-row " + (building || projects.length ? 'built' : 'available') + "'>"
        + "<button type='button' class='processing-card-open' data-action='open-processing-building' data-city-id='" + escapeAttribute(city.id) + "' data-building-id='" + escapeAttribute(definition.id) + "'><span><small>" + escapeHtml(definition.category === 'military' ? 'Military Building' : 'Processing Building') + "</small><strong>" + escapeHtml(definition.label) + "</strong></span><span>Level " + (building ? building.level : 0) + (projected !== (building ? building.level : 0) ? " / " + projected : "") + " | " + escapeHtml(currentStatus) + "</span>" + icon('chevron-right') + "</button>"
        + (building ? "<dl class='building-row-facts'><div><dt>Productivity</dt><dd>" + formatPercent(productivity) + "</dd></div><div><dt>Workers</dt><dd>" + formatNumber(actualWorkers) + " / " + required + "</dd></div><div class='" + (shortage > 0 ? 'worker-shortage' : '') + "'><dt>Shortage</dt><dd>" + formatNumber(shortage) + "</dd></div><div><dt>Maximum / Year</dt><dd>" + escapeHtml(outputSummary(state, building, definition)) + "</dd></div><div><dt>Actual / Year</dt><dd>" + escapeHtml(actualOutputSummary(building)) + "</dd></div></dl>" : "<p class='building-eligibility-copy'>Eligible in this settlement. Open details for recipes and construction cost.</p>")
        + workerControl
        + projectProgress(state, city, definition)
        + "<div class='resource-card-actions'><button type='button' class='primary-action' data-action='queue-processing-building' data-region-id='" + escapeAttribute(region.id) + "' data-building-id='" + escapeAttribute(definition.id) + "' " + buildTooltip(state, availability, projected > 0 ? 'Expand Building' : 'Build Building') + (availability.allowed ? '' : ' disabled') + ">" + (availability.allowed ? icon('plus') : icon('lock-keyhole')) + (projected > 0 ? 'Expand' : 'Build') + "</button><button type='button' data-action='reduce-processing-building' data-city-id='" + escapeAttribute(city.id) + "' data-building-id='" + escapeAttribute(definition.id) + "' " + tooltipAttributes('Reduce Building', reduceTooltip(reduction)) + (reduction.allowed ? '' : ' disabled') + ">" + icon('minus') + (building && building.level === 1 ? 'Remove Building' : 'Reduce') + "</button></div></article>";
    }    return "<article class='processing-building-card'>"
      + "<button type='button' class='processing-card-open' data-action='open-processing-building'"
      + " data-city-id='" + escapeAttribute(city.id) + "' data-building-id='"
      + escapeAttribute(definition.id) + "'><span><small>"
      + escapeHtml(definition.category === 'military' ? 'Military Building' : 'Processing Building')
      + "</small><strong>" + escapeHtml(definition.label) + "</strong></span>"
      + icon('chevron-right') + "</button>"
      + "<dl><div><dt>Level</dt><dd>" + (building ? building.level : 0) + " / " + projected
      + "</dd></div><div><dt>Dev Capacity</dt><dd>" + formatNumber(definition.construction.footprint, 4) + " per level | " + formatNumber(definition.construction.footprint * (building ? building.level : 0), 4) + " total</dd></div><div><dt>Workers</dt><dd>" + (building ? building.actualWorkers : 0)
      + " / " + required + "</dd></div><div class='wide'><dt>Output / Year</dt><dd>"
      + escapeHtml(outputSummary(state, building, definition))
      + "</dd></div><div class='wide'><dt>Status</dt><dd>" + escapeHtml(status)
      + "</dd></div></dl>"
      + projectProgress(state, city, definition)
      + "<div class='resource-card-actions'><button type='button' class='primary-action'"
      + " data-action='queue-processing-building' data-region-id='" + escapeAttribute(region.id)
      + "' data-building-id='" + escapeAttribute(definition.id) + "' "
      + buildTooltip(state, availability, projected > 0 ? 'Expand Building' : 'Build Building')
      + (availability.allowed ? '' : ' disabled') + ">"
      + (availability.allowed ? icon('plus') : icon('lock-keyhole')) + "Expand</button>"
      + "<button type='button' data-action='reduce-processing-building' data-city-id='"
      + escapeAttribute(city.id) + "' data-building-id='" + escapeAttribute(definition.id)
      + "' " + tooltipAttributes('Reduce Building', reduceTooltip(reduction))
      + (reduction.allowed ? '' : ' disabled') + ">" + icon('minus') + "Reduce</button></div>"
      + "</article>";
  }

  function settlementSection(state, city, showUnbuilt = false) {
    if (!city) return '';
    const cards = namespace.manufacturingData.processingBuildingList
      .filter((definition) => namespace.developmentEconomy.canBuildProcessing(city, definition.id).allowed)
      .sort((a, b) => {
        const rank = (definition) => {
          const building = namespace.manufacturing.buildingById(city, definition.id);
          if (building || projectsFor(state, city, definition).length) return 0;
          const region = namespace.manufacturing.settlementRegion(state, city);
          return namespace.manufacturing.buildAvailability(state, region.id, definition.id).allowed ? 1 : 2;
        };
        return rank(a) - rank(b) || a.category.localeCompare(b.category) || a.label.localeCompare(b.label);
      })
      .map((definition) => buildingCard(state, city, definition, showUnbuilt))
      .filter(Boolean);
    return "<section class='settlement-building-section processing-buildings-section'>"
      + "<div class='province-section-title'><h3>Processing Buildings</h3><span>"
      + cards.length + (showUnbuilt ? " Available" : " Active or Queued") + "</span></div>"
      + (cards.length
        ? "<div class='processing-building-grid'>" + cards.join('') + "</div>"
        : "<p class='empty-state-copy'>No Processing Buildings built or queued.</p>")
      + "</section>";
  }

  function recipeFacts(recipe) {
    const inputs = Object.entries(recipe.inputs).map(([resourceId, amount]) => (
      formatNumber(amount) + ' ' + itemLabel(resourceId)
    )).join(' + ');
    return {
      inputs: inputs || 'None',
      output: formatNumber(recipe.annualOutput) + ' ' + itemLabel(recipe.outputId) + ' / year',
      workers: formatNumber(recipe.workers)
    };
  }

  function allocationRows(state, building, definition) {
    const allocations = building.pendingAllocations || building.allocations || {};
    return definition.recipes.map((recipe) => {
      const unlocked = namespace.manufacturing.recipeUnlocked(state, recipe);
      const value = Number(allocations[recipe.id]) || 0;
      const facts = recipeFacts(recipe);
      return "<article class='manufacturing-recipe " + (unlocked ? '' : 'locked') + "'>"
        + "<header><div><small>" + (recipe.routeLabel ? escapeHtml(recipe.routeLabel) : 'Tier 1 Recipe')
        + "</small><strong>" + escapeHtml(recipe.label) + "</strong></div>"
        + (unlocked ? "<b>" + formatPercent(value) + "</b>" : icon('lock-keyhole')) + "</header>"
        + "<dl><div><dt>Inputs</dt><dd>" + escapeHtml(facts.inputs)
        + "</dd></div><div><dt>Output</dt><dd>" + escapeHtml(facts.output)
        + "</dd></div><div><dt>Workers at 100%</dt><dd>" + facts.workers + "</dd></div></dl>"
        + (unlocked
          ? "<div class='allocation-control'><input type='range' min='0' max='100' step='0.1' value='"
            + value + "' data-allocation-range data-recipe-id='" + escapeAttribute(recipe.id)
            + "' aria-label='" + escapeAttribute(recipe.label + ' allocation') + "' />"
            + "<input type='number' min='0' max='100' step='0.1' value='" + value
            + "' data-allocation-number data-recipe-id='" + escapeAttribute(recipe.id)
            + "' aria-label='" + escapeAttribute(recipe.label + ' exact allocation') + "' /><span>%</span></div>"
          : "<p class='recipe-lock-note'>Requires research: " + escapeHtml(recipe.research) + "</p>")
        + "</article>";
    }).join('');
  }

  function detailPanel(state, cityId, buildingId) {
    const city = namespace.manufacturing.cityById(state, cityId);
    const definition = namespace.manufacturing.definitionById(buildingId);
    if (!city || !definition) return '';
    const building = namespace.manufacturing.buildingById(city, buildingId);
    const region = namespace.manufacturing.settlementRegion(state, city);
    const projected = namespace.manufacturing.projectedLevel(state, city, buildingId);
    const availability = namespace.manufacturing.buildAvailability(state, region.id, buildingId);
    const reduction = namespace.manufacturing.reducePreview(state, city.id, buildingId);
    const required = building ? namespace.manufacturing.requiredWorkers(state, building) : 0;
    const cap = building
      ? (Number.isFinite(building.pendingWorkerCap) ? building.pendingWorkerCap : building.workerCap)
      : 0;
    const total = building
      ? namespace.manufacturing.allocationTotal(building.pendingAllocations || building.allocations)
      : 0;
    const active = building ? namespace.developmentEconomy.activeLevels(building) : 0;
    const maintenancePriority = building
      ? (building.pendingMaintenancePriority || building.maintenancePriority || 'normal')
      : 'normal';
    const toolPriority = building
      ? (building.pendingToolPriority || building.toolPriority || 'normal')
      : 'normal';
    const toolMode = building
      ? (building.pendingToolMode || building.toolMode || 'no-tools')
      : 'no-tools';
    const priorityOptions = (selected) => namespace.developmentData.priorities.map((value) => (
      "<option value='" + value + "'" + (selected === value ? ' selected' : '') + ">"
      + value.charAt(0).toUpperCase() + value.slice(1) + "</option>"
    )).join('');
    const toolModeOptions = namespace.developmentData.toolModes.map((value) => (
      "<option value='" + value + "'" + (toolMode === value ? ' selected' : '') + ">"
      + ({ 'best-available': 'Best Available', 'simple-only': 'Simple Tools Only', 'bronze-only': 'Bronze Tools Only', 'no-tools': 'No Tools' })[value]
      + "</option>"
    )).join('');

    return "<section class='processing-building-detail'>"
      + "<div class='detail-heading'><button type='button' class='icon-text-button'"
      + " data-action='back-to-settlement' aria-label='Back to Settlement'>" + icon('arrow-left')
      + "</button><div><p class='eyebrow'>Processing Building</p><h3>"
      + escapeHtml(definition.label) + " &middot; Level " + (building ? building.level : 0)
      + "</h3></div><b class='status-pill'>" + escapeHtml(building ? building.status : 'Construction Queued')
      + "</b></div>"
      + projectProgress(state, city, definition)
      + (building ? "<form class='manufacturing-form' data-manufacturing-form data-city-id='"
        + escapeAttribute(city.id) + "' data-building-id='" + escapeAttribute(buildingId) + "'>"
        + "<section class='manufacturing-summary'><div><span>Level</span><strong>"
        + building.level + " / " + projected + "</strong></div><div><span>Active Levels</span><strong>"
        + active + " / " + building.level + "</strong></div><div><span>Workers</span><strong>"
        + building.actualWorkers + " / " + required + "</strong></div><div><span>Output / Year</span><strong>"
        + escapeHtml(outputSummary(state, building, definition)) + "</strong></div><div><span>Maintenance</span><strong>"
        + formatPercent((building.maintenanceCoverage ?? 1) * 100) + "</strong></div><div><span>Tools</span><strong>"
        + formatPercent((building.toolCoverage || 0) * 100) + "</strong></div><div><span>Allocation</span><strong data-allocation-total>"
        + formatPercent(total) + "</strong></div></section>"
        + "<section class='manufacturing-worker-section'><div><h4>Worker Limit</h4><p>Applies on the next daily tick.</p></div>"
        + "<div class='processing-worker-control slider-only'><output data-processing-worker-value>"
        + cap + " / " + required + "</output><span class='worker-coverage-track' title='" + building.actualWorkers + " assigned; " + Math.max(0, cap - building.actualWorkers) + " shortage'><i style='width:" + (required ? building.actualWorkers / required * 100 : 0) + "%'></i><b style='left:" + (required ? building.actualWorkers / required * 100 : 0) + "%;width:" + (required ? Math.max(0, cap - building.actualWorkers) / required * 100 : 0) + "%'></b></span><input type='range' min='0' max='" + required + "' step='1' value='"
        + cap + "' data-processing-worker-range /></div></section>"
        + "<section class='manufacturing-worker-section'><div><h4>Operating Priorities</h4><p>Changes apply on the next daily tick.</p></div>"
        + "<div class='economic-setting-grid'><label>Maintenance <select data-maintenance-priority>"
        + priorityOptions(maintenancePriority) + "</select></label><label>Tool Mode <select data-tool-mode>"
        + toolModeOptions + "</select></label><label>Tool Priority <select data-tool-priority>"
        + priorityOptions(toolPriority) + "</select></label></div></section>"
        + "<div class='manufacturing-recipe-grid'>" + allocationRows(state, building, definition) + "</div>"
        + "<footer class='manufacturing-form-footer'><span class='allocation-balance"
        + (total > 100 ? " overallocated" : "") + "' data-allocation-balance>"
        + (Math.abs(total - 100) < 0.0001 ? 'Ready to apply: 100.0%' : total < 100
          ? 'Remaining: ' + formatNumber(100 - total) + '%' : 'Overallocated: ' + formatNumber(total - 100) + '%') + "</span>"
        + "<button type='button' class='primary-action' data-action='apply-manufacturing-settings'"
        + (Math.abs(total - 100) < 0.0001 ? '' : ' disabled') + ">Apply Changes</button></footer></form>"
        : "<p class='empty-state-copy'>The first level is still in the construction queue. Production controls unlock when construction finishes.</p>")
      + "<div class='detail-actions processing-detail-actions'><button type='button' class='primary-action'"
      + " data-action='queue-processing-building' data-region-id='" + escapeAttribute(region.id)
      + "' data-building-id='" + escapeAttribute(buildingId) + "' "
      + buildTooltip(state, availability, 'Expand Building') + (availability.allowed ? '' : ' disabled')
      + ">" + (availability.allowed ? icon('plus') : icon('lock-keyhole')) + "Expand</button>"
      + "<button type='button' data-action='reduce-processing-building' data-city-id='"
      + escapeAttribute(city.id) + "' data-building-id='" + escapeAttribute(buildingId)
      + "' " + tooltipAttributes('Reduce Building', reduceTooltip(reduction))
      + (reduction.allowed ? '' : ' disabled') + ">" + icon('minus') + "Reduce</button></div>"
      + "</section>";
  }

  function categoryPanel(state, category, mode) {
    const definitions = namespace.manufacturingData.processingBuildingList
      .filter((definition) => definition.category === category);
    const settlementGroups = (state.player.cities || []).map((city) => {
      const cards = definitions.map((definition) => buildingCard(state, city, definition)).filter(Boolean);
      if (!cards.length) return '';
      return "<section class='admin-section'><div class='admin-section-heading'><h3>"
        + escapeHtml(city.name) + "</h3><span>" + cards.length
        + " Active or Queued</span></div><div class='processing-building-grid'>"
        + cards.join('') + "</div></section>";
    }).join('');
    const label = category === 'military' ? 'Military Production & Storage' : 'Processing Buildings';
    return "<section class='admin-section contextual-build-list'><div class='admin-section-heading'><h3>"
      + label + "</h3><span>Shared Construction</span></div>"
      + constructionCards(state, category, mode) + "</section>"
      + (settlementGroups || "<p class='empty-state-copy'>No " + label + " built or queued.</p>");
  }
  function productionRows(state) {
    return namespace.manufacturing.allBuildings(state).map(({ city, building }) => {
      const definition = namespace.manufacturing.definitionById(building.buildingId);
      return {
        city,
        building,
        definition,
        label: definition.label,
        detail: city.name + ' | Level ' + building.level,
        output: outputSummary(state, building, definition)
      };
    });
  }

  namespace.uiManufacturing = Object.freeze({
    formatNumber,
    materialDetails,
    buildTooltip,
    constructionCards,
    projectProgress,
    buildingCard,
    settlementSection,
    detailPanel,
    productionRows
  });
})(window.EcoRuler = window.EcoRuler || {});
