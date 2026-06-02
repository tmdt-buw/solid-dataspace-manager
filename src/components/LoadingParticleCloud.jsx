import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const POINT_COUNT = 92;
const POD_RADIUS = 1.58;
const CLOUD_SCALE = 1.38;
const NODE_COLORS = [0x0f172a, 0x1e3a8a, 0x1d4ed8, 0x2563eb, 0x60a5fa];
const SELF_DIRECTION = new THREE.Vector3(-1, 0.04, 0.1).normalize();

const getSourceRadius = (index) =>
  POD_RADIUS * (0.92 + ((index * 17) % 19) / 100);

const getEllipsoidPoint = (direction, radius) =>
  new THREE.Vector3(
    direction.x * radius * 1.18,
    direction.y * radius * 0.74,
    direction.z * radius * 0.98
  );

const getPointDirection = (index, total) => {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(total - 1, 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * goldenAngle + 0.72;
  const direction = new THREE.Vector3(
    Math.cos(theta) * radius,
    y * 0.64,
    Math.sin(theta) * radius
  ).normalize();

  if (direction.dot(SELF_DIRECTION) > 0.68) {
    direction.x = Math.abs(direction.x);
    direction.y *= -0.8;
    direction.normalize();
  }

  return direction;
};

const disposeObject = (object) => {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
};

export default function LoadingParticleCloud() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      host.classList.add("loading-particle-cloud--fallback");
      return () => host.classList.remove("loading-particle-cloud--fallback");
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 6.1);

    const cloud = new THREE.Group();
    cloud.scale.setScalar(CLOUD_SCALE);
    scene.add(cloud);

    const pointGroups = [];
    const nodeGeometry = new THREE.SphereGeometry(0.021, 16, 10);
    const glowGeometry = new THREE.SphereGeometry(0.043, 16, 10);

    const createMaterial = (color, opacity, additive = false) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });

    for (let index = 0; index < POINT_COUNT; index += 1) {
      const direction = getPointDirection(index, POINT_COUNT);
      const position = getEllipsoidPoint(direction, getSourceRadius(index));
      const color = NODE_COLORS[index % NODE_COLORS.length];
      const group = new THREE.Group();
      group.position.copy(position);
      group.userData = {
        basePosition: position.clone(),
        phase: index * 0.87,
        baseScale: index % 13 === 0 ? 1.22 : 1,
      };

      group.add(
        new THREE.Mesh(glowGeometry, createMaterial(color, 0.08, true))
      );
      group.add(
        new THREE.Mesh(nodeGeometry, createMaterial(color, 0.88))
      );
      cloud.add(group);
      pointGroups.push(group);
    }

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const worldPosition = new THREE.Vector3();

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      camera.aspect = width / height;
      camera.position.z = width < 520 ? 7.0 : 6.1;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
    }
    window.addEventListener("resize", resize);
    resize();

    const startedAt = performance.now();
    let animationFrame = 0;

    const render = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const reducedMotion = Boolean(motionQuery?.matches);
      const spin = reducedMotion ? 0 : elapsed;

      cloud.rotation.x = -0.08 + Math.sin(spin * 0.52) * 0.055;
      cloud.rotation.y = 0.22 + spin * 0.42;
      cloud.rotation.z = reducedMotion ? 0 : Math.sin(spin * 0.24) * 0.025;

      pointGroups.forEach((group) => {
        const { basePosition, phase, baseScale } = group.userData;
        const pulse = reducedMotion ? 1 : 1 + Math.sin(elapsed * 1.4 + phase) * 0.055;
        const orbit = reducedMotion ? 0 : Math.sin(elapsed * 0.72 + phase) * 0.008;
        group.position.copy(basePosition).multiplyScalar(1 + orbit);
        group.scale.setScalar(baseScale * pulse);
      });

      cloud.updateMatrixWorld(true);
      pointGroups.forEach((group) => {
        group.getWorldPosition(worldPosition);
        group.visible = worldPosition.z >= -0.04;
      });

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();
      disposeObject(cloud);
      nodeGeometry.dispose();
      glowGeometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="loading-particle-cloud" ref={hostRef} aria-hidden="true" />;
}
