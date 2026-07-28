(function initializeRealmUi(namespace) {
  const {
    ensureUiState,
    lockProvincePopoverPosition,
    selectedRegion,
    regionById
  } = namespace.uiViewport;
  const playerRevealRadius = 3;
  const outpostBuildRange = 3;
  const playerRealmColor = '#d9468f';
  function ensurePlayerState(state) {
    state.player = state.player || {};
    state.player.cities = Array.isArray(state.player.cities) ? state.player.cities : [];
    state.player.outposts = Array.isArray(state.player.outposts) ? state.player.outposts : [];
    state.player.armies = Array.isArray(state.player.armies) ? state.player.armies : [];
    state.player.realm = state.player.realm || {
      id: 'player',
      name: 'Player Realm',
      color: playerRealmColor
    };
    state.player.gameStarted = Boolean(state.player.gameStarted);
    namespace.settlementFoundation.migratePlayer(state);
    return state.player;
  }

  function playerCities(state) {
    return ensurePlayerState(state).cities;
  }

  function playerOutposts(state) {
    return ensurePlayerState(state).outposts;
  }

  function isGameStarted(state) {
    return Boolean(ensurePlayerState(state).gameStarted);
  }

  function isPlayerControlled(region) {
    return Boolean(region && (region.ownerId === 'player' || region.controllerId === 'player'));
  }

  function cityAtRegion(state, regionId) {
    return playerCities(state).find((city) => city.regionId === regionId) || null;
  }

  function outpostForRegion(state, regionId) {
    return playerOutposts(state).find((outpost) => outpost.regionId === regionId) || null;
  }

  function nextOutpostName(state) {
    return `Outpost ${playerOutposts(state).length + 1}`;
  }

  function hashUnit(seed, key) {
    const text = `${seed}:${key}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function graphDistancesFrom(state, startIds, maxDistance, options = {}) {
    const distances = new Map();
    const queue = [];
    startIds.forEach((regionId) => {
      const region = regionById(state, regionId);
      if (!region || (options.landOnly && region.isWater)) {
        return;
      }
      distances.set(regionId, 0);
      queue.push(region);
    });

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const distance = distances.get(current.id) || 0;
      if (distance >= maxDistance) {
        continue;
      }
      current.neighbors.forEach((neighborId) => {
        if (distances.has(neighborId)) {
          return;
        }
        const neighbor = regionById(state, neighborId);
        if (!neighbor || (options.landOnly && neighbor.isWater)) {
          return;
        }
        distances.set(neighborId, distance + 1);
        queue.push(neighbor);
      });
    }

    return distances;
  }

  function playerControlledRegionIds(state) {
    return state.map.regions
      .filter((region) => isPlayerControlled(region))
      .map((region) => region.id);
  }

  function playerControlledLandRegionIds(state) {
    return state.map.regions
      .filter((region) => isPlayerControlled(region) && !region.isWater)
      .map((region) => region.id);
  }

  function refreshPlayerVisibility(state) {
    if (!isGameStarted(state)) {
      return;
    }

    state.map.regions.forEach((region) => {
      region.discovered = false;
    });

    const distances = graphDistancesFrom(state, playerControlledRegionIds(state), playerRevealRadius);
    distances.forEach((distance, regionId) => {
      const region = regionById(state, regionId);
      if (region) {
        region.discovered = true;
      }
    });
  }

  function isRegionRevealed(state, region) {
    if (!region) {
      return false;
    }
    if (!isGameStarted(state)) {
      return true;
    }
    return Boolean(region.discovered || isPlayerControlled(region));
  }

  function regionStartScore(state, region) {
    const terrainScore = {
      plains: 14,
      forests: 10,
      hills: 8,
      swamps: 5,
      desert: 3,
      mountains: 2
    }[region.terrainId] || 4;
    const traitScore = region.traits.reduce((sum, traitId) => {
      const weights = {
        river: 5,
        lake: 5,
        coast: 2,
        oasis: 3,
        'high-fertility': 6,
        'forest-density': 2,
        'mineral-vein': 1,
        'precious-vein': 1,
        'gem-vein': 1,
        volcanic: -1,
        'god-bless': 8
      };
      return sum + (weights[traitId] || 0);
    }, 0);
    const landNeighbors = region.neighbors
      .map((neighborId) => regionById(state, neighborId))
      .filter((neighbor) => neighbor && !neighbor.isWater).length;
    const resourceScore = namespace.uiProvince.eligibleResourceCandidates(region).filter((candidate) => {
      return ['wheat', 'vegetables', 'fruit', 'fish', 'cattle', 'sheep', 'wood', 'clay', 'stone'].includes(candidate.resourceId);
    }).length * 0.8;
    return terrainScore + traitScore + landNeighbors * 1.4 + resourceScore;
  }

  function bestStartingRegion(state) {
    const landRegions = state.map.regions.filter((region) => !region.isWater);
    const candidatesWithNeighbors = landRegions.filter((region) => {
      const landNeighbors = region.neighbors
        .map((neighborId) => regionById(state, neighborId))
        .filter((neighbor) => neighbor && !neighbor.isWater).length;
      return landNeighbors >= 2;
    });
    const candidates = candidatesWithNeighbors.length ? candidatesWithNeighbors : landRegions;
    const ranked = candidates
      .map((region) => ({
        region,
        score: regionStartScore(state, region)
          + hashUnit(state.startSeed || namespace.data.mapDefaults.startSeed, region.id) * 5
      }))
      .sort((first, second) => second.score - first.score);
    return ranked[0]?.region || null;
  }

  function resetRegionControlAndSites(region) {
    region.ownerId = null;
    region.controllerId = null;
    region.discovered = false;
    region.resourceSites = [];
    region.construction = namespace.models.createProvinceConstruction();
    region.resourceCapacityUsed = 0;
    region.waterCapacityUsed = 0;
  }

  function claimRegionForPlayer(region) {
    region.ownerId = 'player';
    region.controllerId = 'player';
    region.discovered = true;
  }

  function startingControlledRegions(state, startRegion) {
    const neighbors = startRegion.neighbors
      .map((neighborId) => regionById(state, neighborId))
      .filter((neighbor) => neighbor && !neighbor.isWater)
      .map((region) => ({ region, score: regionStartScore(state, region) }))
      .sort((first, second) => second.score - first.score)
      .slice(0, 2)
      .map((item) => item.region);
    return [startRegion, ...neighbors];
  }

  function startGame(root, state) {
    const player = ensurePlayerState(state);
    if (player.gameStarted) {
      namespace.uiProvince.addLog(state, 'Game already started. Generate a new map to restart the prototype setup.');
      namespace.uiApp.render(root, state);
      return;
    }

    state.map.regions.forEach(resetRegionControlAndSites);
    player.cities = [];
    player.outposts = [];
    player.armies = [];
    player.capitalSettlementId = null;
    player.capitalId = null;
    const startRegion = bestStartingRegion(state);
    if (!startRegion) {
      namespace.uiProvince.addLog(state, 'No valid land province was found for the starting city.');
      namespace.uiApp.render(root, state);
      return;
    }

    const cityNumber = player.cities.length + 1;
    const city = namespace.models.createCity({
      id: 'city-' + cityNumber,
      name: 'State Capital',
      level: 'town',
      settlementTier: 'town',
      isCapital: true,
      regionId: startRegion.id,
      controlledRegionIds: [startRegion.id],
      population: namespace.settlementFoundation.STARTING_CAPITAL_POPULATION,
      commoners: namespace.settlementFoundation.STARTING_CAPITAL_POPULATION - 4,
      nobles: 4,
      workforceTotal: namespace.settlementFoundation.STARTING_CAPITAL_WORKFORCE,
      workforceAvailable: namespace.settlementFoundation.STARTING_CAPITAL_WORKFORCE,
      housingCapacity: namespace.settlementFoundation.STARTING_CAPITAL_HOUSING,
      founderHousing: namespace.settlementFoundation.STARTING_CAPITAL_HOUSING
    });

    claimRegionForPlayer(startRegion);
    player.cities.push(city);
    player.gameStarted = true;
    namespace.settlementFoundation.migratePlayer(state);
    namespace.settlementFoundation.beginStartingVillageSetup(state, city.id);
    const storageSummary = namespace.storageLedger.loadFounderReserve(state.storage);
    state.administration = {
      founderCountryRetired: false, founderLocalRetired: false, countryRequests: {},
      producedCountry: 0, producedLocalByCenter: {}, alertIds: {},
      countryReservations: {}, localReservations: {}
    };
    state.expansion = { nextOrderNumber: 1, settlerOrders: [] };
    namespace.developmentEconomy.reconcileAll(state);
    namespace.administration.reconcile(state);
    namespace.administration.applyCollectionModifiers(state);
    namespace.flowEconomy.ensureSeasonTracker(state);
    refreshPlayerVisibility(state);
    state.map.selectedRegionId = null;
    const ui = ensureUiState(state);
    ui.provincePopoverTab = 'overview';
    delete ui.resourceBuildMenu;
    namespace.uiTooltips.hideTooltip(true);
    namespace.uiProvince.addLog(state, `Game started. ${city.name} founded automatically in ${startRegion.name}. Choose two adjacent starting Villages before time can run. Founder Reserve occupies ${storageSummary.occupied.toLocaleString('en-US')} of ${storageSummary.capacity.toLocaleString('en-US')} storage points.`);
    namespace.uiApp.render(root, state);
  }

  function readableIdentifier(value) {
    return String(value || '')
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function startingVillageSelectionPresentation(state, region) {
    const setup = namespace.settlementFoundation.startingVillageSetup(state);
    if (!setup || setup.status !== 'active' || !region) return null;
    const chosenIndex = setup.entries.findIndex((entry) => entry.regionId === region.id);
    if (chosenIndex >= 0) {
      return {
        preview: { allowed: false, reason: 'Already selected as Starting Village ' + (chosenIndex + 1) + '.' },
        title: 'Starting Village ' + (chosenIndex + 1),
        body: 'Already selected. Use the setup summary to change this province.',
        materialRows: [],
        className: ' starting-village-selected'
      };
    }
    if (setup.draftRegionId === region.id) {
      return {
        preview: { allowed: false, reason: 'Choose this province\'s specialty.' },
        title: 'Village Province Selected',
        body: 'Choose one of the four Village specialties.',
        materialRows: [],
        className: ' starting-village-draft'
      };
    }
    if (setup.stage !== 'province') return null;
    const preview = namespace.settlementFoundation.provinceEligibility(state, region.id);
    const resources = (preview.resources || []).map((candidate) => {
      const resource = namespace.resources.resourceById[candidate.resourceId];
      return resource ? resource.label : readableIdentifier(candidate.resourceId);
    });
    const lines = [preview.reason];
    if (preview.allowed) {
      lines.push('Available Resources: ' + (resources.length ? resources.join(', ') : 'None'));
      lines.push('Select this province, then choose its specialty.');
    }
    return {
      preview,
      title: 'Starting Village Province',
      body: lines.join('\n'),
      materialRows: [],
      className: preview.allowed ? ' starting-village-eligible' : ' starting-village-ineligible'
    };
  }

  function startingVillageSummaryCard(state, entry, index, allowEditing = true) {
    const region = regionById(state, entry.regionId);
    const card = namespace.settlementFoundation.startingVillageSpecialtyCards(state, entry.regionId)
      .find((item) => item.id === entry.specialtyId);
    return `<article class='starting-village-summary-card'>
      <header><span>Village ${index + 1}</span><strong>${namespace.uiCore.escapeHtml(region ? region.name : 'Unknown Province')}</strong></header>
      <dl class='province-fact-list'>
        <div><dt>Specialty</dt><dd>${namespace.uiCore.escapeHtml(card ? card.label : readableIdentifier(entry.specialtyId))}</dd></div>
        <div><dt>Population</dt><dd>50</dd></div>
        <div><dt>Workforce</dt><dd>30</dd></div>
        <div><dt>Founder Housing</dt><dd>500</dd></div>
        <div><dt>Local Control</dt><dd>${card ? card.localDemand : 0}</dd></div>
      </dl>
      ${allowEditing ? `<div class='starting-village-edit-actions'>
        <button type='button' data-action='edit-starting-village-province' data-index='${index}'>Change Province</button>
        <button type='button' data-action='edit-starting-village-specialty' data-index='${index}'>Change Specialty</button>
      </div>` : ''}
    </article>`;
  }

  function startingVillageSetupPanel(state) {
    const setup = namespace.settlementFoundation.startingVillageSetup(state);
    if (!setup || setup.status !== 'active') return '';
    const escapeHtml = namespace.uiCore.escapeHtml;
    const chosen = setup.entries.map((entry, index) => startingVillageSummaryCard(state, entry, index, false)).join('');
    if (setup.stage === 'province') {
      const number = Number.isInteger(setup.editIndex) ? setup.editIndex + 1 : setup.entries.length + 1;
      return `<aside class='starting-village-setup-panel province-step' data-starting-village-setup data-setup-stage='province'>
        <header><span>New Realm Setup</span><h2>Choose Village ${number} Province</h2></header>
        <p>Select one highlighted land province directly adjacent to the State Capital. The province is not free of recurring obligations: its normal Local Control begins after confirmation.</p>
        <div class='starting-village-progress'><b>${setup.entries.length}</b><span>of 2 Villages prepared</span></div>
        ${chosen ? `<div class='starting-village-mini-list'>${chosen}</div>` : ''}
        ${setup.editOriginal ? `<button type='button' data-action='back-starting-village-setup'>Back to Summary</button>` : ''}
      </aside>`;
    }
    if (setup.stage === 'specialty') {
      const region = regionById(state, setup.draftRegionId);
      const cards = namespace.settlementFoundation.startingVillageSpecialtyCards(state, setup.draftRegionId).map((card) => {
        const reason = card.eligible
          ? 'Eligible in this province.'
          : 'This province has no matching eligible raw resource.';
        const allowed = card.allowedBuildings.map(readableIdentifier).join(', ');
        return `<article class='starting-specialty-card ${card.eligible ? '' : 'disabled'}' data-starting-specialty-card='${namespace.uiCore.escapeAttribute(card.id)}'>
          <header><h3>${escapeHtml(card.label)}</h3><span>${card.eligible ? 'Available' : 'Locked'}</span></header>
          <dl class='province-fact-list'>
            <div><dt>Development Capacity</dt><dd>${namespace.uiStorage.formatNumber(card.developmentCapacity, 1)}</dd></div>
            <div><dt>General Resource</dt><dd>${namespace.uiStorage.formatNumber(card.generalResourceCapacity, 1)}</dd></div>
            <div><dt>Matching Bonus</dt><dd>+${namespace.uiStorage.formatNumber(card.matchingResourceBonus, 1)}</dd></div>
            <div><dt>Local Control</dt><dd>${card.localDemand}</dd></div>
          </dl>
          <p><strong>Allowed:</strong> ${escapeHtml(allowed)}</p>
          <button type='button' data-action='select-starting-village-specialty' data-specialty-id='${namespace.uiCore.escapeAttribute(card.id)}' ${card.eligible ? '' : 'disabled'}>Select ${escapeHtml(card.label)}</button>
          <small>${escapeHtml(reason)}</small>
        </article>`;
      }).join('');
      return `<aside class='starting-village-setup-panel specialty-step' data-starting-village-setup data-setup-stage='specialty'>
        <header><span>Selected Province</span><h2>${escapeHtml(region ? region.name : 'Village Province')}</h2></header>
        <p>Choose one permanent specialty. Agricultural and Extractive depend on this province's resources; Trade and Military are always available.</p>
        <div class='starting-specialty-grid'>${cards}</div>
        <button type='button' data-action='back-starting-village-setup'>Back</button>
      </aside>`;
    }
    const cards = setup.entries.map((entry, index) => startingVillageSummaryCard(state, entry, index)).join('');
    const localTotal = setup.entries.reduce((sum, entry) => {
      const card = namespace.settlementFoundation.startingVillageSpecialtyCards(state, entry.regionId)
        .find((item) => item.id === entry.specialtyId);
      return sum + (card ? card.localDemand : 0);
    }, 0);
    return `<aside class='starting-village-setup-panel review-step' data-starting-village-setup data-setup-stage='review'>
      <header><span>Final Summary</span><h2>Confirm Starting Villages</h2></header>
      <p>Review both permanent specialty choices. No Resource Sites or production buildings are granted.</p>
      <div class='starting-village-review-grid'>${cards}</div>
      <dl class='province-fact-list starting-village-totals'>
        <div><dt>Total Population</dt><dd>1,000</dd></div>
        <div><dt>Total Workforce</dt><dd>600</dd></div>
        <div><dt>Local Control Used</dt><dd>${localTotal} / 150</dd></div>
      </dl>
      <button type='button' class='primary-action' data-action='confirm-starting-villages'>Confirm Start</button>
    </aside>`;
  }

  function outpostDistance(state, region) {
    const distances = graphDistancesFrom(state, playerControlledLandRegionIds(state), outpostBuildRange, { landOnly: true });
    return distances.has(region.id) ? distances.get(region.id) : Infinity;
  }

  function foundingSourcePreviews(state, region = selectedRegion(state)) {
    return playerCities(state)
      .filter((city) => city.settlementKind !== 'village')
      .map((city) => namespace.outpostLifecycle.foundingPreview(state, city.id, region && region.id))
      .sort((first, second) => (
        (first.allowed === second.allowed ? 0 : first.allowed ? -1 : 1)
        || (Number(first.distance) || Infinity) - (Number(second.distance) || Infinity)
        || first.source.name.localeCompare(second.source.name)
      ));
  }

  function outpostAvailability(state, region = selectedRegion(state), sourceId = null) {
    if (!isGameStarted(state)) return { allowed: false, reason: 'Start the game before founding Outposts.', previews: [] };
    if (!region) return { allowed: false, reason: 'Select a revealed land province first.', previews: [] };
    if (!isRegionRevealed(state, region)) return { allowed: false, reason: 'This province is still hidden by fog of war.', previews: [] };
    if (region.isWater) return { allowed: false, reason: 'Ocean provinces cannot hold Outposts.', previews: [] };
    if (isPlayerControlled(region) || cityForRegion(state, region.id) || outpostForRegion(state, region.id)) {
      return { allowed: false, reason: 'This province is already controlled.', previews: [] };
    }
    const foundingProject = namespace.constructionQueue.ensureQueue(region).projects
      .find((project) => project.kind === 'outpost-founding');
    if (foundingProject) return { allowed: false, reason: 'An Outpost founding project is already active here.', previews: [], project: foundingProject };
    const previews = foundingSourcePreviews(state, region);
    const selected = sourceId
      ? previews.find((preview) => preview.source && preview.source.id === sourceId)
      : previews.find((preview) => preview.allowed) || previews[0];
    return {
      allowed: Boolean(selected && selected.allowed),
      reason: selected ? selected.reason : 'No owned Town, City, or Capital can reach this province.',
      previews,
      preview: selected || null
    };
  }
  function buildOutpostButton(state) {
    const availability = outpostAvailability(state);
    const disabled = availability.allowed ? '' : ' disabled';
    return `<button type='button' data-action='build-outpost' ${namespace.uiProvince.tooltipAttributes('Build Outpost', availability.reason)}${disabled}>Build Outpost</button>`;
  }

  function startGameButton(state) {
    const started = isGameStarted(state);
    const disabled = started ? ' disabled' : '';
    const reason = started
      ? 'The prototype game has already started. Generate a new map to restart.'
      : 'Automatically founds the State Capital, then asks you to choose two adjacent starting Villages.';
    return `<button type='button' class='primary-action' data-action='start-game' ${namespace.uiProvince.tooltipAttributes('Start Game', reason)}${disabled}>${started ? 'Started' : 'Start Game'}</button>`;
  }

  function nearestCityForRegion(state, region) {
    const ranked = playerCities(state).map((city) => {
      const starts = city.controlledRegionIds && city.controlledRegionIds.length
        ? city.controlledRegionIds
        : [city.regionId];
      const distances = graphDistancesFrom(state, starts, outpostBuildRange, {
        landOnly: true
      });
      return {
        city,
        distance: distances.has(region.id)
          ? distances.get(region.id)
          : Infinity
      };
    }).sort((first, second) => first.distance - second.distance);
    return ranked[0] && Number.isFinite(ranked[0].distance)
      ? ranked[0].city
      : null;
  }

  function buildOutpost(root, state, sourceId = null) {
    lockProvincePopoverPosition(root, state);
    const region = selectedRegion(state);
    const availability = outpostAvailability(state, region, sourceId);
    if (!region || !availability.allowed || !availability.preview) {
      namespace.uiProvince.addLog(state, availability.reason);
      namespace.uiApp.render(root, state);
      return { ok: false, reason: availability.reason };
    }

    const result = namespace.outpostLifecycle.queueFounding(
      state,
      availability.preview.source.id,
      region.id
    );
    if (result.ok) {
      const ui = ensureUiState(state);
      ui.provincePopoverTab = 'overview';
      delete ui.resourceBuildMenu;
      namespace.uiTooltips.hideTooltip(true);
      namespace.uiProvince.addLog(
        state,
        'Outpost founding started in ' + region.name + ' from ' + availability.preview.source.name + '.'
      );
    } else {
      namespace.uiProvince.addLog(state, result.reason || 'Outpost founding failed.');
    }
    namespace.uiApp.render(root, state);
    return result;
  }
  function canManageResourceSites(state, region) {
    return Boolean(isGameStarted(state) && region && isPlayerControlled(region) && isRegionRevealed(state, region));
  }

  function cityForRegion(state, regionId) {
    return playerCities(state).find((city) => (
      city.regionId === regionId
      || (Array.isArray(city.controlledRegionIds) && city.controlledRegionIds.includes(regionId))
    )) || null;
  }

  function nextCityName(state) {
    return 'Town ' + (playerCities(state).length + 1);
  }

  function foundCityAvailability(state) {
    const region = selectedRegion(state);
    if (!region) {
      return { allowed: false, reason: 'Select a land province first.' };
    }
    if (region.isWater) {
      return { allowed: false, reason: 'Ocean provinces cannot be settled.' };
    }
    if (region.ownerId || cityForRegion(state, region.id)) {
      return { allowed: false, reason: 'This province is already owned.' };
    }
    return { allowed: true, reason: 'Found a free prototype city here.' };
  }

  function foundCityButton(state) {
    const availability = foundCityAvailability(state);
    const disabled = availability.allowed ? '' : ' disabled';
    return `<button type='button' data-action='found-city' ${namespace.uiProvince.tooltipAttributes('Found City', availability.reason)}${disabled}>Found City</button>`;
  }

  function foundCity(root, state) {
    lockProvincePopoverPosition(root, state);
    const region = selectedRegion(state);
    const availability = foundCityAvailability(state);
    if (!region || !availability.allowed) {
      namespace.uiProvince.addLog(state, availability.reason);
      namespace.uiApp.render(root, state);
      return;
    }

    const cityNumber = playerCities(state).length + 1;
    const city = namespace.models.createCity({
      id: 'city-' + cityNumber,
      name: nextCityName(state),
      level: 'town',
      settlementTier: 'town',
      capitalId: state.player.capitalSettlementId || null,
      regionId: region.id
    });

    region.ownerId = 'player';
    region.controllerId = 'player';
    playerCities(state).push(city);
    namespace.settlementFoundation.migratePlayer(state);
    const ui = ensureUiState(state);
    ui.provincePopoverTab = 'overview';
    delete ui.resourceBuildMenu;
    namespace.uiTooltips.hideTooltip(true);
    namespace.uiProvince.addLog(state, `${city.name} founded in ${region.name}. The city currently owns its province only.`);
    namespace.uiApp.render(root, state);
  }

  namespace.uiRealm = Object.freeze({
    ensurePlayerState,
    playerCities,
    playerOutposts,
    isGameStarted,
    isPlayerControlled,
    cityAtRegion,
    outpostForRegion,
    nextOutpostName,
    hashUnit,
    graphDistancesFrom,
    playerControlledRegionIds,
    playerControlledLandRegionIds,
    refreshPlayerVisibility,
    isRegionRevealed,
    regionStartScore,
    bestStartingRegion,
    resetRegionControlAndSites,
    claimRegionForPlayer,
    startingControlledRegions,
    startGame,
    startingVillageSelectionPresentation,
    startingVillageSetupPanel,
    outpostDistance,
    foundingSourcePreviews,
    outpostAvailability,
    buildOutpostButton,
    startGameButton,
    nearestCityForRegion,
    buildOutpost,
    canManageResourceSites,
    cityForRegion,
    nextCityName,
    foundCityAvailability,
    foundCityButton,
    foundCity
  });
})(window.EcoRuler = window.EcoRuler || {});
