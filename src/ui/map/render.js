(function initializeMapRendering(namespace) {
  const { escapeHtml, escapeAttribute, terrainById, clamp } = namespace.uiCore;
  const { selectedRegion, regionById } = namespace.uiViewport;
  const {
    isGameStarted,
    isPlayerControlled,
    cityAtRegion,
    outpostForRegion,
    isRegionRevealed
  } = namespace.uiRealm;
  const {
    tooltipAttributes,
    traitPills,
    traitDetailList,
    candidateDetail,
    resourceCandidateSummary,
    resourceCandidateList,
    productionSlotSummary,
    productionSlotRows,
    neighborPills,
    ruleNoteList
  } = namespace.uiProvince;
  const rareMapMarkerLimit = 2;
  const rareMapMarkerDefinitions = [
    { id: 'god-bless', kind: 'trait', label: 'God Bless', className: 'god-bless' },
    { id: 'diamonds', kind: 'resource', label: 'Diamonds', className: 'diamonds' },
    { id: 'gold', kind: 'resource', label: 'Gold', className: 'gold' },
    { id: 'silver', kind: 'resource', label: 'Silver', className: 'silver' },
    { id: 'sulfur', kind: 'resource', label: 'Sulfur', className: 'sulfur' },
    { id: 'pearls', kind: 'resource', label: 'Pearls', className: 'pearls' }
  ];
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

  function polygonBounds(points) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY)
    };
  }

  function clampMarkerCenter(value, min, max) {
    if (max < min) {
      return (min + max) / 2;
    }
    return clamp(value, min, max);
  }
  function riverLines(state) {
    const rivers = state.map.rivers || [];
    const lines = [];
    rivers.forEach((river) => {
      if (!river.points || river.points.length < 2) {
        return;
      }
      if (!isGameStarted(state)) {
        lines.push(`<polyline class='river-line' data-river-id='${escapeAttribute(river.id)}' points='${polygonPoints(river.points)}'></polyline>`);
        return;
      }

      let run = [];
      river.regionIds.forEach((regionId, index) => {
        const region = regionById(state, regionId);
        if (region && isRegionRevealed(state, region)) {
          run.push(river.points[index]);
          return;
        }
        if (run.length > 1) {
          lines.push(`<polyline class='river-line' data-river-id='${escapeAttribute(river.id)}' points='${polygonPoints(run)}'></polyline>`);
        }
        run = [];
      });
      if (run.length > 1) {
        lines.push(`<polyline class='river-line' data-river-id='${escapeAttribute(river.id)}' points='${polygonPoints(run)}'></polyline>`);
      }
    });

    return lines.length ? `<g class='river-layer' aria-hidden='true'>${lines.join('')}</g>` : '';
  }

  function rareMarkersForRegion(region) {
    if (region.isWater) {
      return [];
    }

    return rareMapMarkerDefinitions
      .map((definition) => {
        if (definition.kind === 'trait') {
          return region.traits.includes(definition.id)
            ? {
              ...definition,
              detail: 'God Bless adds +100% to primary resource production in this province.'
            }
            : null;
        }

        const candidate = (region.resourceCandidates || [])
          .find((item) => item.resourceId === definition.id && item.available);
        return candidate
          ? {
            ...definition,
            detail: candidateDetail(candidate)
          }
          : null;
      })
      .filter(Boolean);
  }

  function rareMarkerShape(marker) {
    if (marker.id === 'god-bless') {
      return `<polygon class='rare-marker-shape' points='0,-6 1.8,-1.9 6.2,-1.9 2.6,0.9 4,5.4 0,3 -4,5.4 -2.6,0.9 -6.2,-1.9 -1.8,-1.9'></polygon>`;
    }
    if (marker.id === 'diamonds') {
      return `<polygon class='rare-marker-shape' points='0,-6 5.4,0 0,6 -5.4,0'></polygon>`;
    }
    if (marker.id === 'sulfur') {
      return `<polygon class='rare-marker-shape' points='0,-6 5.7,5.2 -5.7,5.2'></polygon>`;
    }
    if (marker.id === 'pearls') {
      return `<circle class='rare-marker-ring' r='5.8'></circle><circle class='rare-marker-shape' r='3.9'></circle>`;
    }
    return `<circle class='rare-marker-shape' r='5.5'></circle>`;
  }

  function rareMarkerElement(marker, x, y, scale) {
    return `
      <g class='rare-marker rare-marker-${marker.className}' transform='translate(${x} ${y}) scale(${scale})' ${tooltipAttributes(marker.label, marker.detail)} aria-label='${escapeAttribute(marker.label)}'>
        ${rareMarkerShape(marker)}
      </g>
    `;
  }

  function rareMarkerMoreElement(hiddenMarkers, x, y, scale) {
    const title = `${hiddenMarkers.length} More Rare Markers`;
    const body = hiddenMarkers.map((marker) => `${marker.label}: ${marker.detail}`).join(' | ');
    return `
      <g class='rare-marker rare-marker-more' transform='translate(${x} ${y}) scale(${scale})' ${tooltipAttributes(title, body)} aria-label='${escapeAttribute(title)}'>
        <circle class='rare-marker-more-shape' r='5.8'></circle>
        <circle class='rare-marker-more-dot' cx='-2.4' cy='0' r='0.9'></circle>
        <circle class='rare-marker-more-dot' cx='0' cy='0' r='0.9'></circle>
        <circle class='rare-marker-more-dot' cx='2.4' cy='0' r='0.9'></circle>
      </g>
    `;
  }

  function rareMarkerLayout(region, displayCount) {
    const bounds = polygonBounds(region.polygon);
    const smallRegion = bounds.width < 42 || bounds.height < 38;
    const baseRadius = 6;
    const requestedWidth = (displayCount * baseRadius * 2) + ((displayCount - 1) * 2.5);
    const scale = clamp(Math.min(
      0.92,
      (bounds.width * 0.58) / requestedWidth,
      (bounds.height * 0.42) / (baseRadius * 2)
    ), smallRegion ? 0.46 : 0.58, smallRegion ? 0.68 : 0.92);
    const spacing = baseRadius * 2.35 * scale;
    const rowHalfWidth = ((displayCount - 1) * spacing) / 2 + baseRadius * scale;
    const rowHalfHeight = baseRadius * scale;
    const centerX = clampMarkerCenter(region.center.x, bounds.minX + rowHalfWidth, bounds.maxX - rowHalfWidth);
    const centerY = clampMarkerCenter(region.center.y, bounds.minY + rowHalfHeight, bounds.maxY - rowHalfHeight);

    return {
      startX: centerX - ((displayCount - 1) * spacing) / 2,
      y: centerY,
      scale,
      spacing
    };
  }

  function rareMapMarkers(region) {
    const markers = rareMarkersForRegion(region);
    if (!markers.length) {
      return '';
    }

    const bounds = polygonBounds(region.polygon);
    const visibleLimit = bounds.width < 42 || bounds.height < 38 ? 1 : rareMapMarkerLimit;
    const visibleMarkers = markers.slice(0, visibleLimit);
    const hiddenMarkers = markers.slice(visibleLimit);
    const displayCount = visibleMarkers.length + (hiddenMarkers.length ? 1 : 0);
    const layout = rareMarkerLayout(region, displayCount);
    const markerElements = visibleMarkers
      .map((marker, index) => rareMarkerElement(marker, layout.startX + index * layout.spacing, layout.y, layout.scale));

    if (hiddenMarkers.length) {
      markerElements.push(rareMarkerMoreElement(hiddenMarkers, layout.startX + visibleMarkers.length * layout.spacing, layout.y, layout.scale));
    }

    return `<g class='rare-marker-row'>${markerElements.join('')}</g>`;
  }

  function cityMapMarker(region, city) {
    if (!city) {
      return '';
    }

    const bounds = polygonBounds(region.polygon);
    const scale = clamp(Math.min(bounds.width / 56, bounds.height / 50), 0.42, 0.82);
    const halfWidth = 12 * scale;
    const halfHeight = 11 * scale;
    const x = clampMarkerCenter(region.center.x, bounds.minX + halfWidth, bounds.maxX - halfWidth);
    const y = clampMarkerCenter(region.center.y, bounds.minY + halfHeight, bounds.maxY - halfHeight);
    const controlledCount = Array.isArray(city.controlledRegionIds) ? city.controlledRegionIds.length : 1;

    return `
      <g class='city-marker' transform='translate(${x} ${y}) scale(${scale})' ${tooltipAttributes(city.name, `Village marker. Controls ${controlledCount} provinces in the current prototype.`)} aria-label='${escapeAttribute(city.name)}'>
        <path class='city-marker-shadow' d='M-12 7h24l-2 3h-20z'></path>
        <path class='city-marker-roof' d='M-12 -1L0 -11L12 -1Z'></path>
        <rect class='city-marker-wall' x='-8' y='-1' width='16' height='12' rx='1'></rect>
        <rect class='city-marker-door' x='-2.5' y='3' width='5' height='8' rx='0.8'></rect>
        <path class='city-marker-beam' d='M-6 2h12M-6 6h12'></path>
      </g>
    `;
  }

  function outpostMapMarker(region, outpost) {
    if (!outpost) {
      return '';
    }

    const bounds = polygonBounds(region.polygon);
    const scale = clamp(Math.min(bounds.width / 50, bounds.height / 48), 0.38, 0.72);
    const halfWidth = 10 * scale;
    const halfHeight = 12 * scale;
    const x = clampMarkerCenter(region.center.x, bounds.minX + halfWidth, bounds.maxX - halfWidth);
    const y = clampMarkerCenter(region.center.y, bounds.minY + halfHeight, bounds.maxY - halfHeight);

    return `
      <g class='outpost-marker' transform='translate(${x} ${y}) scale(${scale})' ${tooltipAttributes(outpost.name, `Outpost marker. Controls ${region.name} and opens one Resource Site.`)} aria-label='${escapeAttribute(outpost.name)}'>
        <path class='outpost-marker-shadow' d='M-10 9h20l-2 3h-16z'></path>
        <path class='outpost-marker-flag' d='M0 -15v8M0 -15h9l-2 3l2 3h-9'></path>
        <path class='outpost-marker-roof' d='M-9 -3L0 -10L9 -3Z'></path>
        <rect class='outpost-marker-tower' x='-6' y='-3' width='12' height='14' rx='1'></rect>
        <path class='outpost-marker-beam' d='M-4 1h8M-4 5h8'></path>
      </g>
    `;
  }

  function constructionMapMarker(region) {
    const projects = namespace.constructionQueue.orderedProjects(region);
    if (!projects.length) return '';
    const active = namespace.constructionQueue.activeProject(region);
    const waiting = namespace.constructionQueue.waitingProjects(region).length;
    const project = active || projects[0];
    const percent = active ? Math.min(100, project.progressDays / project.durationDays * 100) : 0;
    const bounds = polygonBounds(region.polygon);
    const x = clampMarkerCenter(region.center.x + bounds.width * 0.22, bounds.minX + 9, bounds.maxX - 9);
    const y = clampMarkerCenter(region.center.y + bounds.height * 0.22, bounds.minY + 9, bounds.maxY - 9);
    const circumference = 43.98;
    const detail = `${project.label}: ${project.status}. ${project.progressDays} / ${project.durationDays} days. ${waiting} waiting.`;
    return `<g class='construction-marker ${project.status === 'paused' ? 'paused' : ''}' data-construction-marker data-region-id='${escapeAttribute(region.id)}' transform='translate(${x} ${y})' ${tooltipAttributes('Construction Projects', detail)}><circle class='marker-bg' r='8'></circle><circle class='marker-progress' r='7' stroke-dasharray='${circumference}' stroke-dashoffset='${circumference * (1 - percent / 100)}'></circle><text class='hammer-symbol' y='0.5'>&#9874;</text><text class='progress-label' y='13'>${percent.toFixed(1)}%</text>${waiting ? `<g transform='translate(7 -7)'><circle r='4.5' fill='#b84355'></circle><text fill='#fff'>${waiting}</text></g>` : ''}</g>`;
  }
  function realmClaimOverlay(region) {
    if (!isPlayerControlled(region)) {
      return '';
    }
    return `<polygon class='realm-claim-overlay' points='${polygonPoints(region.polygon)}'></polygon>`;
  }

  function buildModeTooltip(state, region, mode, availability) {
    const preview = availability && availability.preview;
    const rows = Object.entries((preview && preview.materials) || {}).map(([resourceId, amount]) => {
      const item = namespace.storageLedger.storageItemById[resourceId];
      const available = Number(state.storage.available[resourceId]) || 0;
      return { label: item ? item.label : resourceId, required: Number(amount) || 0, available, enough: available >= Number(amount || 0) };
    });
    const candidate = mode.kind === 'resource-site'
      ? (region.resourceCandidates || []).find((item) => item.resourceId === mode.resourceId && item.available)
      : null;
    const productivity = candidate ? Math.round((Number(candidate.finalEfficiency) || 0) * 1000) / 10 : null;
    const body = [
      availability.allowed ? 'Eligible. Left-click to queue.' : availability.reason,
      productivity === null ? 'Productivity: Not applicable' : 'Productivity: ' + productivity.toFixed(1) + '%',
      preview ? 'Duration: ' + preview.days + ' Days' : '',
      preview && preview.targetLevel ? 'Target Level: ' + preview.targetLevel : '',
      rows.length ? 'Required / Available materials:' : ''
    ].filter(Boolean).join('\n');
    return tooltipAttributes(mode.label + ' Placement', body)
      + " data-tooltip-materials='" + escapeAttribute(JSON.stringify(rows)) + "'";
  }
  function regionPolygons(state) {
    return state.map.regions
      .map((region) => {
        const terrain = terrainById(region.terrainId);
        const isSelected = region.id === state.map.selectedRegionId;
        const revealed = isRegionRevealed(state, region);
        const startingSelection = namespace.uiRealm ? namespace.uiRealm.startingVillageSelectionPresentation(state, region) : null;
        const selection = startingSelection || (namespace.uiExpansion ? namespace.uiExpansion.selectionPresentation(state, region) : null);
        const mode = !selection && state.ui && state.ui.constructionBuildMode;
        const availability = !mode
          ? null
          : mode.kind === 'warehouse'
            ? namespace.storageLedger.warehouseBuildAvailability(state, region.id)
            : mode.kind === 'processing-building'
              ? namespace.manufacturing.buildAvailability(state, region.id, mode.buildingId)
              : mode.kind === 'administrative-building'
                ? namespace.administration.buildAvailability(state, region.id, mode.buildingId)
                : mode.kind === 'medical-building'
                  ? namespace.health.buildAvailability(state, region.id, mode.buildingId)
                  : namespace.resourceSites.buildAvailability(state, region, mode.resourceId);
        const buildClass = selection
          ? selection.className
          : availability ? (availability.allowed ? ' build-eligible' : ' build-ineligible') : '';
        const buildTooltip = selection
          ? tooltipAttributes(selection.title, selection.body)
            + " data-tooltip-materials='" + escapeAttribute(JSON.stringify(selection.materialRows || [])) + "'"
          : availability ? buildModeTooltip(state, region, mode, availability) : '';
        const ariaLabel = revealed ? `${region.name}, ${terrain.label}` : 'Unknown province, hidden by fog of war';
        return `
          <g
            class='region-cell${isSelected ? ' selected' : ''}${isPlayerControlled(region) ? ' owned' : ''}${outpostForRegion(state, region.id) ? ' outpost-owned' : ''}${revealed ? ' revealed' : ' fogged'}${region.isWater ? ' water' : ' land'}${buildClass}' ${buildTooltip}
            data-region-id='${region.id}'
            role='button'
            tabindex='0'
            aria-label='${escapeAttribute(ariaLabel)}'
          >
            <polygon class='region-shape' points='${polygonPoints(region.polygon)}' fill='${revealed ? terrain.color : '#edf1ea'}'></polygon>
            ${revealed ? realmClaimOverlay(region) : ''}
            ${revealed ? rareMapMarkers(region) : ''}
            ${revealed ? cityMapMarker(region, cityAtRegion(state, region.id)) : ''}
            ${revealed ? outpostMapMarker(region, outpostForRegion(state, region.id)) : ''}
            ${revealed ? constructionMapMarker(region) : ''}
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
        <div><dt>Resource Sites</dt><dd>0 / 3</dd></div>
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
      <div><dt>Resource Sites</dt><dd>${productionSlotSummary(region)}</dd></div>
      <div><dt>Resources</dt><dd>${resourceCandidateSummary(region)}</dd></div>
      <div><dt>Neighbors</dt><dd>${region.neighbors.length}</dd></div>
      <div class='detail-wide'><dt>Trait Detail</dt><dd>${traitDetailList(region.traits)}</dd></div>
      <div class='detail-wide'><dt>Resource Candidates</dt><dd>${resourceCandidateList(region)}</dd></div>
      <div class='detail-wide'><dt>Resource Site Detail</dt><dd>${productionSlotRows(region)}</dd></div>
      <div class='detail-wide'><dt>Neighbor Regions</dt><dd>${neighborPills(state, region)}</dd></div>
      <div class='detail-wide'><dt>Rule Notes</dt><dd>${ruleNoteList(region)}</dd></div>
    `;
  }

  namespace.uiMapRender = Object.freeze({
    mapQualityWarnings,
    warningList,
    logRows,
    polygonPoints,
    polygonBounds,
    clampMarkerCenter,
    riverLines,
    rareMarkersForRegion,
    rareMarkerShape,
    rareMarkerElement,
    rareMarkerMoreElement,
    rareMarkerLayout,
    rareMapMarkers,
    cityMapMarker,
    outpostMapMarker,
    realmClaimOverlay,
    regionPolygons,
    selectedRegionRows
  });
})(window.EcoRuler = window.EcoRuler || {});
