(function initializeMapViewport(namespace) {
  const { clamp } = namespace.uiCore;
  const minMapZoom = 1;
  const maxMapZoom = 16;
  const uiLayoutStorageKey = 'eco-ruler-ui-layout-v1';
  let mapDragState = null;
  let provincePopoverDragState = null;
  let provincePopoverResizeState = null;
  let suppressRegionClick = false;
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
    namespace.uiTooltips.hideTooltip(true);
    namespace.uiApp.render(root, state);
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
        if (suppressRegionClick || event.target.closest('.region-cell[data-region-id]')) {
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
        namespace.uiProvince.addLog(state, 'Map view reset to 100% zoom.');
        namespace.uiApp.render(root, state);
      });
    });
  }
  function ensureUiState(state) {
    state.ui = state.ui || {};
    if (!state.ui.layoutLoaded) {
      state.ui.layoutLoaded = true;
      try {
        const saved = JSON.parse(window.localStorage.getItem(uiLayoutStorageKey) || 'null');
        if (saved && typeof saved === 'object') {
          if (saved.provincePopoverPosition) {
            state.ui.provincePopoverPosition = saved.provincePopoverPosition;
          }
          if (saved.provincePopoverSize) {
            state.ui.provincePopoverSize = saved.provincePopoverSize;
          }
          state.ui.sidebarPinned = Boolean(saved.sidebarPinned);
        }
      } catch (error) {
        window.localStorage.removeItem(uiLayoutStorageKey);
      }
    }
    return state.ui;
  }

  function persistUiLayout(state) {
    const ui = ensureUiState(state);
    const layout = {
      provincePopoverPosition: ui.provincePopoverPosition || null,
      provincePopoverSize: ui.provincePopoverSize || null,
      sidebarPinned: Boolean(ui.sidebarPinned)
    };
    try {
      window.localStorage.setItem(uiLayoutStorageKey, JSON.stringify(layout));
    } catch (error) {
      return false;
    }
    return true;
  }

  function resetInterfaceLayout(state) {
    const ui = ensureUiState(state);
    delete ui.provincePopoverPosition;
    delete ui.provincePopoverSize;
    delete ui.provincePopoverRestore;
    ui.provincePopoverMaximized = false;
    ui.sidebarPinned = false;
    try {
      window.localStorage.removeItem(uiLayoutStorageKey);
    } catch (error) {
      return false;
    }
    return true;
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

  function setProvincePopoverAnchor(root, state) {
    const ui = ensureUiState(state);
    if (ui.provincePopoverPosition && ui.provincePopoverPosition.mode === 'manual') {
      return;
    }
    ui.provincePopoverPosition = { mode: 'center' };
  }

  function positionProvincePopover(root, state) {
    const panel = root.querySelector('[data-province-popover]');
    const stage = root.querySelector('.map-stage');
    if (!panel || !stage) return;

    const ui = ensureUiState(state);
    const size = ui.provincePopoverSize;
    if (size) {
      panel.style.width = `${size.width}px`;
      panel.style.height = `${size.height}px`;
      panel.style.maxHeight = 'none';
    }

    const position = ui.provincePopoverPosition || { mode: 'center' };
    let left;
    let top;
    if (position.mode === 'manual') {
      left = position.x;
      top = position.y;
    } else {
      left = (stage.clientWidth - panel.offsetWidth) / 2;
      top = (stage.clientHeight - panel.offsetHeight) / 2;
    }

    const clamped = clampProvincePopoverPosition(root, panel, left, top);
    panel.style.left = `${clamped.left}px`;
    panel.style.top = `${clamped.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function lockProvincePopoverPosition(root, state) {
    const panel = root.querySelector('[data-province-popover]');
    const stage = root.querySelector('.map-stage');
    if (!panel || !stage || typeof panel.getBoundingClientRect !== 'function' || typeof stage.getBoundingClientRect !== 'function') {
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    ensureUiState(state).provincePopoverPosition = {
      mode: 'manual',
      x: panelRect.left - stageRect.left,
      y: panelRect.top - stageRect.top
    };
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
      state,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    panel.classList.add('dragging');
    namespace.uiTooltips.hideTooltip(true);
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
    persistUiLayout(provincePopoverDragState.state);
    provincePopoverDragState = null;
    event.stopPropagation();
  }
  function startProvincePopoverResize(root, state, event) {
    if (event.button !== 0) return;
    const panel = event.currentTarget.closest('[data-province-popover]');
    const stage = root.querySelector('.map-stage');
    if (!panel || !stage) return;
    const panelRect = panel.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    provincePopoverResizeState = {
      pointerId: event.pointerId,
      panel,
      state,
      direction: event.currentTarget.dataset.provinceResize,
      startClientX: event.clientX,
      startClientY: event.clientY,
      left: panelRect.left - stageRect.left,
      top: panelRect.top - stageRect.top,
      width: panelRect.width,
      height: panelRect.height,
      right: panelRect.right - stageRect.left,
      bottom: panelRect.bottom - stageRect.top
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    panel.classList.add('resizing');
    namespace.uiTooltips.hideTooltip(true);
    event.preventDefault();
    event.stopPropagation();
  }

  function moveProvincePopoverResize(root, state, event) {
    if (!provincePopoverResizeState || provincePopoverResizeState.pointerId !== event.pointerId) return;
    const stage = root.querySelector('.map-stage');
    const resize = provincePopoverResizeState;
    if (!stage || !resize.panel) return;
    const direction = resize.direction;
    const dx = event.clientX - resize.startClientX;
    const dy = event.clientY - resize.startClientY;
    const margin = 12;
    const maxWidth = Math.max(280, stage.clientWidth - margin * 2);
    const maxHeight = Math.max(260, stage.clientHeight - margin * 2);
    const minWidth = Math.min(620, maxWidth);
    const minHeight = Math.min(380, maxHeight);
    let width = resize.width;
    let height = resize.height;
    let left = resize.left;
    let top = resize.top;

    if (direction.includes('e')) width = clamp(resize.width + dx, minWidth, maxWidth);
    if (direction.includes('s')) height = clamp(resize.height + dy, minHeight, maxHeight);
    if (direction.includes('w')) {
      width = clamp(resize.width - dx, minWidth, maxWidth);
      left = resize.right - width;
    }
    if (direction.includes('n')) {
      height = clamp(resize.height - dy, minHeight, maxHeight);
      top = resize.bottom - height;
    }

    left = clamp(left, margin, Math.max(margin, stage.clientWidth - width - margin));
    top = clamp(top, margin, Math.max(margin, stage.clientHeight - height - margin));
    resize.panel.style.left = `${left}px`;
    resize.panel.style.top = `${top}px`;
    resize.panel.style.right = 'auto';
    resize.panel.style.bottom = 'auto';
    resize.panel.style.width = `${width}px`;
    resize.panel.style.height = `${height}px`;
    resize.panel.style.maxHeight = 'none';

    const ui = ensureUiState(state);
    ui.provincePopoverPosition = { mode: 'manual', x: left, y: top };
    ui.provincePopoverSize = { width, height };
    ui.provincePopoverMaximized = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function finishProvincePopoverResize(event) {
    if (!provincePopoverResizeState || provincePopoverResizeState.pointerId !== event.pointerId) return;
    provincePopoverResizeState.panel.classList.remove('resizing');
    persistUiLayout(provincePopoverResizeState.state);
    provincePopoverResizeState = null;
    event.stopPropagation();
  }
  function toggleProvincePopoverMaximize(root, state) {
    const panel = root.querySelector('[data-province-popover]');
    const stage = root.querySelector('.map-stage');
    if (!panel || !stage) return;
    const ui = ensureUiState(state);
    if (ui.provincePopoverMaximized) {
      ui.provincePopoverPosition = ui.provincePopoverRestore?.position || { mode: 'manual', x: 12, y: 84 };
      ui.provincePopoverSize = ui.provincePopoverRestore?.size || null;
      ui.provincePopoverMaximized = false;
      delete ui.provincePopoverRestore;
      return;
    }
    lockProvincePopoverPosition(root, state);
    ui.provincePopoverRestore = {
      position: ui.provincePopoverPosition ? { ...ui.provincePopoverPosition } : null,
      size: ui.provincePopoverSize ? { ...ui.provincePopoverSize } : { width: panel.offsetWidth, height: panel.offsetHeight }
    };
    ui.provincePopoverPosition = { mode: 'manual', x: 12, y: 12 };
    ui.provincePopoverSize = {
      width: Math.max(280, stage.clientWidth - 24),
      height: Math.max(260, stage.clientHeight - 24)
    };
    ui.provincePopoverMaximized = true;
  }
  function selectedRegion(state) {
    return state.map.regions.find((region) => region.id === state.map.selectedRegionId) || null;
  }

  function regionById(state, regionId) {
    return state.map.regions.find((region) => region.id === regionId) || null;
  }

  namespace.uiViewport = Object.freeze({
    resetMapViewport,
    normalizeMapViewport,
    visibleMapViewBox,
    formatViewBox,
    setMapViewport,
    svgPointFromEvent,
    updateMapViewDom,
    zoomMapAtEvent,
    startMapDrag,
    moveMapDrag,
    finishMapDrag,
    closeSelectedProvince,
    closeProvinceBeforeMapSelection,
    bindMapViewControls,
    ensureUiState,
    persistUiLayout,
    resetInterfaceLayout,
    clampProvincePopoverPosition,
    setProvincePopoverAnchor,
    positionProvincePopover,
    lockProvincePopoverPosition,
    startProvincePopoverDrag,
    moveProvincePopoverDrag,
    finishProvincePopoverDrag,
    startProvincePopoverResize,
    moveProvincePopoverResize,
    finishProvincePopoverResize,
    toggleProvincePopoverMaximize,
    selectedRegion,
    regionById,
    isRegionClickSuppressed: () => suppressRegionClick
  });
})(window.EcoRuler = window.EcoRuler || {});
