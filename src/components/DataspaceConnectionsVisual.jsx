import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const POD_RADIUS = 1.58;
const DATASPACE_EDGE_RADIUS = 0.92;
const NETWORK_SCALE = 1.54;
const NODE_COLORS = {
  self: 0xffb366,
  source: 0xcbd5e1,
  incoming: 0x93c5fd,
  outgoing: 0xf8fafc,
  mixed: 0xe2e8f0,
};
const SELF_DIRECTION = new THREE.Vector3(-1, 0.04, 0.1).normalize();

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getPodDirection = (index, total) => {
  if (total <= 1) {
    return new THREE.Vector3(1, 0.05, 0.08).normalize();
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(total - 1, 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * goldenAngle + 0.72;

  return new THREE.Vector3(
    Math.cos(theta) * radius,
    y * 0.64,
    Math.sin(theta) * radius
  ).normalize();
};

const getPartnerDirection = (index, total) => {
  const direction = getPodDirection(index, total);
  if (direction.dot(SELF_DIRECTION) > 0.68) {
    direction.x = Math.abs(direction.x);
    direction.y *= -0.8;
    direction.normalize();
  }
  return direction;
};

const getSourceRadius = (index) =>
  POD_RADIUS * (0.92 + ((index * 17) % 19) / 100);

const getEllipsoidPoint = (direction, radius) =>
  new THREE.Vector3(
    direction.x * radius * 1.18,
    direction.y * radius * 0.74,
    direction.z * radius * 0.98
  );

const createConnectionMesh = (start, end, radius, color, opacity) => {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 12, 1, true);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);

  geometry.translate(0, length / 2, 0);
  mesh.position.copy(start);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );
  mesh.userData.baseOpacity = opacity;

  return mesh;
};

const disposeObject = (object) => {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
};

const shortenRoot = (root) => {
  if (!root) return "";
  try {
    const url = new URL(root);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length ? `${url.hostname}/${parts[0]}` : url.hostname;
  } catch {
    return root;
  }
};

export default function DataspaceConnectionsVisual({
  pods = [],
  dataSourceCount = 0,
  selfLabel,
  selfRoot,
}) {
  const hostRef = useRef(null);
  const tooltipRef = useRef(null);

  const normalizedPods = useMemo(
    () =>
      pods.map((pod, index) => ({
        ...pod,
        id: pod.id || pod.root || `pod-${index}`,
        label: pod.label || shortenRoot(pod.root),
        detail: pod.detail || "",
        direction: pod.direction || "mixed",
        connectionCount: pod.connectionCount || 1,
        datasetCount: pod.datasetCount || 0,
      })),
    [pods]
  );

  const sourcePointCount = useMemo(
    () =>
      Math.max(
        normalizedPods.length,
        Number.isFinite(Number(dataSourceCount))
          ? Math.max(0, Math.floor(Number(dataSourceCount)))
          : 0
      ),
    [dataSourceCount, normalizedPods.length]
  );

  const sourceEntries = useMemo(() => {
    const activeBySourceIndex = new Map();
    const usedIndexes = new Set();

    normalizedPods.forEach((pod, index) => {
      const target =
        normalizedPods.length <= 1
          ? Math.floor(sourcePointCount * 0.58)
          : Math.round((index * (sourcePointCount - 1)) / (normalizedPods.length - 1));
      let sourceIndex = clamp(target, 0, Math.max(0, sourcePointCount - 1));
      while (usedIndexes.has(sourceIndex) && sourceIndex < sourcePointCount - 1) {
        sourceIndex += 1;
      }
      while (usedIndexes.has(sourceIndex) && sourceIndex > 0) {
        sourceIndex -= 1;
      }
      usedIndexes.add(sourceIndex);
      activeBySourceIndex.set(sourceIndex, pod);
    });

    return Array.from({ length: sourcePointCount }, (_, index) => {
        const connection = activeBySourceIndex.get(index);
        if (connection) {
          return {
            ...connection,
            connected: true,
            sourceIndex: index,
          };
        }

        return {
          id: `catalog-source-${index}`,
          root: "",
          label: `Data source ${index + 1}`,
          detail: "Catalog data source",
          direction: "source",
          connected: false,
          connectionCount: 0,
          datasetCount: 1,
          sourceIndex: index,
        };
      });
  }, [normalizedPods, sourcePointCount]);

  const nodeEntries = useMemo(
    () => [
      {
        id: "__self-pod",
        root: selfRoot,
        label: selfLabel || "Your Pod",
        direction: "self",
        connectionCount: normalizedPods.length,
        datasetCount: normalizedPods.reduce(
          (total, pod) => total + (pod.datasetCount || 0),
          0
        ),
      },
      ...sourceEntries,
    ],
    [normalizedPods, selfLabel, selfRoot, sourceEntries]
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      });
    } catch {
      host.classList.add("dataspace-connections-visual--fallback");
      return () => host.classList.remove("dataspace-connections-visual--fallback");
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 6.5);

    const network = new THREE.Group();
    network.scale.setScalar(NETWORK_SCALE);
    scene.add(network);

    const nodeGroups = [];
    const hitTargets = [];
    const lineMeshes = [];
    const nodeGeometry = new THREE.SphereGeometry(0.023, 16, 10);
    const glowGeometry = new THREE.SphereGeometry(0.046, 16, 10);
    const hitGeometry = new THREE.SphereGeometry(0.12, 12, 8);
    const selfNodeGeometry = new THREE.SphereGeometry(0.036, 20, 12);
    const selfGlowGeometry = new THREE.SphereGeometry(0.086, 20, 12);
    let selfPosition = getEllipsoidPoint(SELF_DIRECTION, POD_RADIUS);

    nodeEntries.forEach((pod, index) => {
      const isSelf = pod.direction === "self";
      const sourceIndex = Math.max(0, index - 1);
      const direction = isSelf
        ? SELF_DIRECTION
        : getPartnerDirection(sourceIndex, sourceEntries.length);
      const nodeRadius = isSelf ? POD_RADIUS : getSourceRadius(sourceIndex);
      const nodePosition = getEllipsoidPoint(direction, nodeRadius);
      if (isSelf) {
        selfPosition = nodePosition.clone();
      }

      const group = new THREE.Group();
      group.position.copy(nodePosition);
      group.userData = {
        basePosition: nodePosition.clone(),
        phase: index * 0.87,
        baseScale: isSelf ? 1.2 : 1,
        pod,
      };

      const color = NODE_COLORS[pod.direction] || NODE_COLORS.mixed;
      const glow = new THREE.Mesh(
        (isSelf ? selfGlowGeometry : glowGeometry).clone(),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: isSelf ? 0.24 : pod.connected ? 0.16 : 0.08,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      const core = new THREE.Mesh(
        (isSelf ? selfNodeGeometry : nodeGeometry).clone(),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
        })
      );
      const hitTarget = new THREE.Mesh(
        hitGeometry.clone(),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        })
      );

      group.add(glow);
      group.add(core);
      group.add(hitTarget);
      network.add(group);
      nodeGroups.push(group);
      glow.userData.nodeGroup = group;
      core.userData.nodeGroup = group;
      hitTarget.userData.nodeGroup = group;
      if (isSelf || pod.connected) {
        hitTargets.push(hitTarget);
      }
    });

    sourceEntries.filter((pod) => pod.connected).forEach((pod) => {
      const sourceIndex = pod.sourceIndex || 0;
      const partnerDirection = getPartnerDirection(sourceIndex, sourceEntries.length);
      const partnerPosition = getEllipsoidPoint(
        partnerDirection,
        getSourceRadius(sourceIndex)
      );
      const selfStart = selfPosition.clone().addScaledVector(SELF_DIRECTION, -0.09);
      const partnerEnd = partnerPosition.clone().addScaledVector(partnerDirection, -0.08);
      const selfEdge = getEllipsoidPoint(SELF_DIRECTION, DATASPACE_EDGE_RADIUS);
      const partnerEdge = getEllipsoidPoint(partnerDirection, DATASPACE_EDGE_RADIUS);
      const path = [selfStart, selfEdge, partnerEdge, partnerEnd];

      for (let pathIndex = 0; pathIndex < path.length - 1; pathIndex += 1) {
        const start = path[pathIndex];
        const end = path[pathIndex + 1];
        const line = createConnectionMesh(start, end, 0.014, 0xff9f43, 0.94);
        line.renderOrder = 3;
        network.add(line);
        lineMeshes.push(line);
      }
    });

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredGroup = null;
    const state = {
      currentX: -0.06,
      currentY: 0.22,
      targetX: -0.06,
      targetY: 0.22,
      pointerX: 0,
      pointerY: 0,
      hovered: false,
      dragging: false,
      lastX: 0,
      lastY: 0,
    };

    const hideTooltip = () => {
      hoveredGroup = null;
      const tooltip = tooltipRef.current;
      if (tooltip) tooltip.style.opacity = "0";
    };

    const updateTooltip = (event) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;

      pointer.set(state.pointerX, -state.pointerY);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargets, false)[0];
      hoveredGroup = hit?.object?.userData?.nodeGroup || null;

      if (!hoveredGroup) {
        tooltip.style.opacity = "0";
        return;
      }

      const { pod } = hoveredGroup.userData;
      const title = tooltip.querySelector("[data-title]");
      const detail = tooltip.querySelector("[data-detail]");
      const meta = tooltip.querySelector("[data-meta]");
      if (title) {
        title.textContent =
          pod.direction === "self" ? pod.root || pod.label || "Own pod" : pod.root || pod.label || "Solid Pod";
      }
      if (detail) {
        detail.textContent =
          pod.direction === "self"
            ? "Own pod"
            : pod.detail || pod.root || "Active connection";
      }
      if (meta) {
        if (pod.direction === "self") {
          meta.textContent = "";
          meta.style.display = "none";
        } else {
          meta.textContent = "Active connection";
          meta.style.display = "block";
        }
      }

      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      tooltip.style.opacity = "1";
      tooltip.style.transform = `translate3d(${x + 14}px, ${y + 14}px, 0)`;
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      camera.aspect = width / height;
      camera.position.z = width < 640 ? 7.6 : 6.5;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const setPointer = (event) => {
      const rect = host.getBoundingClientRect();
      state.pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      state.pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };

    const handlePointerEnter = (event) => {
      state.hovered = true;
      setPointer(event);
    };

    const handlePointerMove = (event) => {
      setPointer(event);
      updateTooltip(event);

      if (!state.dragging) return;

      const deltaX = event.clientX - state.lastX;
      const deltaY = event.clientY - state.lastY;
      state.targetY += deltaX * 0.0075;
      state.targetX = clamp(state.targetX + deltaY * 0.005, -0.82, 0.82);
      state.lastX = event.clientX;
      state.lastY = event.clientY;
    };

    const handlePointerDown = (event) => {
      state.dragging = true;
      state.hovered = true;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      host.classList.add("is-dragging");
      host.setPointerCapture?.(event.pointerId);
    };

    const stopDragging = (event) => {
      state.dragging = false;
      host.classList.remove("is-dragging");
      if (event?.pointerId) {
        host.releasePointerCapture?.(event.pointerId);
      }
    };

    const handlePointerLeave = (event) => {
      state.hovered = false;
      state.pointerX = 0;
      state.pointerY = 0;
      hideTooltip();
      stopDragging(event);
    };

    host.addEventListener("pointerenter", handlePointerEnter);
    host.addEventListener("pointermove", handlePointerMove);
    host.addEventListener("pointerdown", handlePointerDown);
    host.addEventListener("pointerup", stopDragging);
    host.addEventListener("pointercancel", stopDragging);
    host.addEventListener("pointerleave", handlePointerLeave);

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
    }
    window.addEventListener("resize", resize);
    resize();

    const startedAt = performance.now();
    const worldPosition = new THREE.Vector3();
    let animationFrame = 0;

    const render = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const reducedMotion = Boolean(motionQuery?.matches);
      const hoverStrength = state.hovered ? 1 : 0;

      if (!reducedMotion) {
        state.targetY += state.hovered ? 0.00075 : 0.00054;
      }

      const desiredX =
        state.targetX + (state.dragging ? 0 : state.pointerY * 0.18 * hoverStrength);
      const desiredY =
        state.targetY + (state.dragging ? 0 : state.pointerX * 0.3 * hoverStrength);

      state.currentX += (desiredX - state.currentX) * 0.075;
      state.currentY += (desiredY - state.currentY) * 0.075;

      network.rotation.x = state.currentX;
      network.rotation.y = state.currentY;
      network.rotation.z = reducedMotion ? 0 : Math.sin(elapsed * 0.2) * 0.025;

      nodeGroups.forEach((group) => {
        const { basePosition, phase, baseScale } = group.userData;
        const hoverScale = hoveredGroup === group ? 1.28 : 1;
        group.position.copy(basePosition);
        group.scale.setScalar(
          baseScale * hoverScale * (1 + Math.sin(elapsed * 1.4 + phase) * 0.055)
        );
      });

      network.updateMatrixWorld(true);
      nodeGroups.forEach((group) => {
        group.getWorldPosition(worldPosition);
        group.visible = worldPosition.z >= -0.04;
      });

      if (hoveredGroup && !hoveredGroup.visible) {
        hideTooltip();
      }

      lineMeshes.forEach((mesh) => {
        mesh.material.opacity = mesh.userData.baseOpacity;
      });

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();
      host.removeEventListener("pointerenter", handlePointerEnter);
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerdown", handlePointerDown);
      host.removeEventListener("pointerup", stopDragging);
      host.removeEventListener("pointercancel", stopDragging);
      host.removeEventListener("pointerleave", handlePointerLeave);
      disposeObject(network);
      nodeGeometry.dispose();
      glowGeometry.dispose();
      hitGeometry.dispose();
      selfNodeGeometry.dispose();
      selfGlowGeometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [nodeEntries, normalizedPods, sourceEntries]);

  return (
    <div className="dataspace-connections-visual" ref={hostRef}>
      <div className="dataspace-connections-core" aria-hidden="true">
        <div className="dataspace-connections-core__title">Solid Dataspace</div>
      </div>
      {normalizedPods.length === 0 && (
        <div className="dataspace-connections-empty">No active connections</div>
      )}
      <div className="dataspace-hover-tooltip" ref={tooltipRef} aria-hidden="true">
        <strong data-title>Solid Pod</strong>
        <span data-detail>Active connection</span>
        <small data-meta>Active connection</small>
      </div>
      <div className="dataspace-connections-legend" aria-hidden="true">
        <span className="dataspace-legend-item">
          <span className="dataspace-legend-dot dataspace-legend-dot--own" />
          Own pod
        </span>
        <span className="dataspace-legend-item">
          <span className="dataspace-legend-line" />
          Active connection
        </span>
      </div>
    </div>
  );
}
