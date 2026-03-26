'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// types

export interface DataPoint {
  timestamp: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  sessionId: string;
  messageIndex: number;
  projectId?: string;
  projectName?: string;
}

export interface ProjectData {
  id: string;
  name: string;
  dataPoints: DataPoint[];
}

export interface TerrainData {
  projects: ProjectData[];
}

export interface TerrainVisualizationProps {
  data: TerrainData;
  onPointClick: (point: DataPoint) => void;
  onPointHover: (point: DataPoint | null) => void;
  className?: string;
}

// color helpers

const COLOR_BASE = new THREE.Color('#0f172a');
const COLOR_LOW = new THREE.Color('#1e3a5f');
const COLOR_MID = new THREE.Color('#0ea5e9');
const COLOR_HIGH = new THREE.Color('#22d3ee');
const COLOR_PEAK = new THREE.Color('#f0f9ff');

function heightColor(t: number): THREE.Color {
  // t in [0,1]
  if (t < 0.25) return COLOR_BASE.clone().lerp(COLOR_LOW, t / 0.25);
  if (t < 0.5) return COLOR_LOW.clone().lerp(COLOR_MID, (t - 0.25) / 0.25);
  if (t < 0.75) return COLOR_MID.clone().lerp(COLOR_HIGH, (t - 0.5) / 0.25);
  return COLOR_HIGH.clone().lerp(COLOR_PEAK, (t - 0.75) / 0.25);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// component

const TerrainVisualization: React.FC<TerrainVisualizationProps> = ({
  data,
  onPointClick,
  onPointHover,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef<number>(0);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2(-9999, -9999));
  const dataPointMeshesRef = useRef<THREE.Mesh[]>([]);
  const dataPointMapRef = useRef<Map<THREE.Mesh, DataPoint>>(new Map());
  const hoveredRef = useRef<THREE.Mesh | null>(null);
  const introProgressRef = useRef(0);
  const introStartRef = useRef(0);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const targetHeightsRef = useRef<Float32Array | null>(null);
  const autoRotateRef = useRef(true);
  const userInteractedRef = useRef(false);
  const interactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [labels, setLabels] = useState<
    Array<{ text: string; x: number; y: number; type: 'project' | 'time' }>
  >([]);

  // build the scene once data changes
  const buildScene = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // dispose previous
    if (rendererRef.current) {
      cancelAnimationFrame(frameRef.current);
      rendererRef.current.dispose();
      rendererRef.current.domElement.remove();
    }
    if (sceneRef.current) {
      sceneRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    dataPointMeshesRef.current = [];
    dataPointMapRef.current.clear();
    hoveredRef.current = null;

    // dimensions
    const width = container.clientWidth;
    const height = container.clientHeight;

    // renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a0a, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.018);
    sceneRef.current = scene;

    // background gradient sphere
    const bgGeo = new THREE.SphereGeometry(200, 32, 32);
    const bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        colorTop: { value: new THREE.Color('#1a0533') },
        colorBottom: { value: new THREE.Color('#0a0a0a') },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 colorTop;
        uniform vec3 colorBottom;
        varying vec3 vWorldPos;
        void main() {
          float t = clamp((vWorldPos.y + 50.0) / 150.0, 0.0, 1.0);
          gl_FragColor = vec4(mix(colorBottom, colorTop, t), 1.0);
        }
      `,
    });
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    scene.add(bgMesh);

    // camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 500);
    camera.position.set(25, 18, 30);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 8;
    controls.maxDistance = 80;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.target.set(0, 2, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controlsRef.current = controls;

    // stop auto-rotate on interaction, resume after inactivity
    const onInteractionStart = () => {
      userInteractedRef.current = true;
      autoRotateRef.current = false;
      controls.autoRotate = false;
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
    };
    const onInteractionEnd = () => {
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = setTimeout(() => {
        autoRotateRef.current = true;
        controls.autoRotate = true;
      }, 5000);
    };
    controls.addEventListener('start', onInteractionStart);
    controls.addEventListener('end', onInteractionEnd);

    // lighting
    const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xeef4ff, 1.4);
    dirLight.position.set(15, 30, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 80;
    dirLight.shadow.camera.left = -30;
    dirLight.shadow.camera.right = 30;
    dirLight.shadow.camera.top = 30;
    dirLight.shadow.camera.bottom = -30;
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x6366f1, 0.5);
    rimLight.position.set(-10, 8, -15);
    scene.add(rimLight);

    const pointLight = new THREE.PointLight(0x22d3ee, 0.6, 60);
    pointLight.position.set(0, 15, 0);
    scene.add(pointLight);

    // ground grid
    const gridSize = 60;
    const gridDivisions = 40;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x38bdf8, 0x38bdf8);
    gridHelper.position.y = -0.05;
    (gridHelper.material as THREE.Material).opacity = 0.07;
    (gridHelper.material as THREE.Material).transparent = true;
    scene.add(gridHelper);

    // ground plane
    const groundGeo = new THREE.PlaneGeometry(gridSize, gridSize);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    // build terrain from data
    const projects = data.projects;
    if (projects.length === 0) return;

    // gather all timestamps for normalization
    const allTimestamps: number[] = [];
    let maxTokens = 0;
    for (const proj of projects) {
      for (const dp of proj.dataPoints) {
        const ts = new Date(dp.timestamp).getTime();
        allTimestamps.push(ts);
        if (dp.totalTokens > maxTokens) maxTokens = dp.totalTokens;
      }
    }
    if (maxTokens === 0) maxTokens = 1;

    const minTime = Math.min(...allTimestamps);
    const maxTime = Math.max(...allTimestamps);
    const timeRange = maxTime - minTime || 1;

    // terrain dimensions
    const terrainWidth = 30;
    const terrainDepth = 20;
    const segmentsX = 128;
    const segmentsZ = Math.max(projects.length * 8, 32);
    const maxHeight = 10;

    const geometry = new THREE.PlaneGeometry(
      terrainWidth,
      terrainDepth,
      segmentsX,
      segmentsZ
    );
    geometry.rotateX(-Math.PI / 2);

    const posAttr = geometry.getAttribute('position');
    const vertexCount = posAttr.count;
    const targetHeights = new Float32Array(vertexCount);
    const colors = new Float32Array(vertexCount * 3);

    // for each vertex compute height based on nearby data points via gaussian splat
    for (let i = 0; i < vertexCount; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);

      // normalized coords [0,1]
      const normX = (vx + terrainWidth / 2) / terrainWidth;
      const normZ = (vz + terrainDepth / 2) / terrainDepth;

      let heightAccum = 0;

      for (let pi = 0; pi < projects.length; pi++) {
        const proj = projects[pi];
        const projZ = (pi + 0.5) / projects.length;

        for (const dp of proj.dataPoints) {
          const dpX = (new Date(dp.timestamp).getTime() - minTime) / timeRange;
          const dpHeight = (dp.totalTokens / maxTokens) * maxHeight;

          // gaussian influence
          const dx = normX - dpX;
          const dz = normZ - projZ;
          const sigmaX = 0.03;
          const sigmaZ = 0.6 / projects.length;
          const influence = Math.exp(
            -(dx * dx) / (2 * sigmaX * sigmaX) -
              (dz * dz) / (2 * sigmaZ * sigmaZ)
          );
          heightAccum += dpHeight * influence;
        }
      }

      // clamp height
      const h = Math.min(heightAccum, maxHeight * 1.2);
      targetHeights[i] = h;

      // start flat for intro animation
      posAttr.setY(i, 0);

      // vertex colour based on normalized height
      const t = Math.min(h / maxHeight, 1);
      const col = heightColor(t);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    targetHeightsRef.current = targetHeights;

    // solid terrain mesh
    const terrainMat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 40,
      specular: new THREE.Color(0x1e3a5f),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const terrain = new THREE.Mesh(geometry, terrainMat);
    terrain.castShadow = true;
    terrain.receiveShadow = true;
    scene.add(terrain);
    terrainMeshRef.current = terrain;

    // wireframe overlay
    const wireGeo = geometry.clone();
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    wireMesh.position.y = 0.01;
    scene.add(wireMesh);

    // data point spheres
    const sphereGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.5,
    });

    for (let pi = 0; pi < projects.length; pi++) {
      const proj = projects[pi];
      const projZ = (pi + 0.5) / projects.length;

      for (const dp of proj.dataPoints) {
        const dpX = (new Date(dp.timestamp).getTime() - minTime) / timeRange;
        const dpHeight = (dp.totalTokens / maxTokens) * maxHeight;

        const worldX = (dpX - 0.5) * terrainWidth;
        const worldZ = (projZ - 0.5) * terrainDepth;

        const sphere = new THREE.Mesh(sphereGeo, sphereMat.clone());
        sphere.position.set(worldX, 0, worldZ);
        sphere.userData.targetY = dpHeight;
        sphere.userData.baseScale = 1;
        sphere.castShadow = false;
        scene.add(sphere);

        dataPointMeshesRef.current.push(sphere);
        dataPointMapRef.current.set(sphere, {
          ...dp,
          projectId: proj.id,
          projectName: proj.name,
        });
      }
    }

    // glow ring at base of each sphere
    const ringGeo = new THREE.RingGeometry(0.22, 0.35, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    for (const sphere of dataPointMeshesRef.current) {
      const ring = new THREE.Mesh(ringGeo, ringMat.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.15;
      sphere.add(ring);
    }

    // post-processing bloom
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.6,
      0.4,
      0.85
    );
    composer.addPass(bloomPass);
    composerRef.current = composer;

    // start intro animation
    introProgressRef.current = 0;
    introStartRef.current = performance.now();

    // animate
    const clock = new THREE.Clock();

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // intro animation, 2 seconds
      const introDuration = 2000;
      const introElapsed = performance.now() - introStartRef.current;
      const introT = Math.min(introElapsed / introDuration, 1);
      const easedT = easeOutCubic(introT);

      // update terrain heights
      if (terrainMeshRef.current && targetHeightsRef.current) {
        const terrainPos = terrainMeshRef.current.geometry.getAttribute('position');
        const wirePos = wireMesh.geometry.getAttribute('position');
        for (let i = 0; i < terrainPos.count; i++) {
          const h = targetHeightsRef.current[i] * easedT;
          terrainPos.setY(i, h);
          wirePos.setY(i, h + 0.01);
        }
        terrainPos.needsUpdate = true;
        wirePos.needsUpdate = true;
        if (introT < 1) {
          terrainMeshRef.current.geometry.computeVertexNormals();
          wireMesh.geometry.computeVertexNormals();
        }
      }

      // update data point sphere positions
      for (const sphere of dataPointMeshesRef.current) {
        const targetY = sphere.userData.targetY as number;
        sphere.position.y = targetY * easedT;

        // subtle floating animation
        if (introT >= 1) {
          const floatOffset =
            Math.sin(elapsed * 1.5 + sphere.position.x * 0.5 + sphere.position.z * 0.3) *
            0.05;
          sphere.position.y = targetY + floatOffset;
        }
      }

      // hover highlight
      for (const sphere of dataPointMeshesRef.current) {
        if (sphere === hoveredRef.current) {
          sphere.scale.lerp(new THREE.Vector3(1.6, 1.6, 1.6), 0.15);
          const mat = sphere.material as THREE.MeshStandardMaterial;
          mat.emissive.lerp(new THREE.Color(0xfbbf24), 0.15);
          mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 1.2, 0.15);
        } else {
          sphere.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
          const mat = sphere.material as THREE.MeshStandardMaterial;
          mat.emissive.lerp(new THREE.Color(0x38bdf8), 0.1);
          mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.6, 0.1);
        }
      }

      controls.update();
      composer.render();
    };

    animate();

    // axis labels as css overlays
    const updateLabels = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      const cam = cameraRef.current;
      const size = new THREE.Vector2();
      rendererRef.current.getSize(size);

      const newLabels: Array<{
        text: string;
        x: number;
        y: number;
        type: 'project' | 'time';
      }> = [];

      // project labels on the left side
      for (let pi = 0; pi < projects.length; pi++) {
        const projZ = (pi + 0.5) / projects.length;
        const worldZ = (projZ - 0.5) * terrainDepth;
        const pos = new THREE.Vector3(-terrainWidth / 2 - 1.5, 0.5, worldZ);
        pos.project(cam);
        const screenX = ((pos.x + 1) / 2) * size.x;
        const screenY = ((-pos.y + 1) / 2) * size.y;
        if (pos.z < 1) {
          newLabels.push({
            text: projects[pi].name,
            x: screenX,
            y: screenY,
            type: 'project',
          });
        }
      }

      // time labels along x at ground level
      const timeSteps = 6;
      for (let ti = 0; ti <= timeSteps; ti++) {
        const frac = ti / timeSteps;
        const worldX = (frac - 0.5) * terrainWidth;
        const pos = new THREE.Vector3(worldX, -0.3, terrainDepth / 2 + 1.5);
        pos.project(cam);
        const screenX = ((pos.x + 1) / 2) * size.x;
        const screenY = ((-pos.y + 1) / 2) * size.y;
        if (pos.z < 1) {
          const ts = new Date(minTime + frac * timeRange);
          const label =
            ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
            '\n' +
            ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          newLabels.push({ text: label, x: screenX, y: screenY, type: 'time' });
        }
      }

      setLabels(newLabels);
    };

    // update labels periodically
    const labelInterval = setInterval(updateLabels, 100);

    // store cleanup for label interval
    renderer.domElement.dataset.labelInterval = String(labelInterval);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // mouse events
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container || !cameraRef.current || !sceneRef.current) return;

      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(
        dataPointMeshesRef.current,
        false
      );

      if (intersects.length > 0) {
        const mesh = intersects[0].object as THREE.Mesh;
        if (hoveredRef.current !== mesh) {
          hoveredRef.current = mesh;
          const dp = dataPointMapRef.current.get(mesh) || null;
          onPointHover(dp);
          if (container) container.style.cursor = 'pointer';
        }
      } else {
        if (hoveredRef.current !== null) {
          hoveredRef.current = null;
          onPointHover(null);
          if (container) container.style.cursor = 'grab';
        }
      }
    },
    [onPointHover]
  );

  const onPointerClick = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // only act on primary button, not orbit drag
      if (e.button !== 0) return;
      const container = containerRef.current;
      if (!container || !cameraRef.current) return;

      const rect = container.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(
        new THREE.Vector2(mx, my),
        cameraRef.current
      );
      const intersects = raycasterRef.current.intersectObjects(
        dataPointMeshesRef.current,
        false
      );

      if (intersects.length > 0) {
        const mesh = intersects[0].object as THREE.Mesh;
        const dp = dataPointMapRef.current.get(mesh);
        if (dp) onPointClick(dp);
      }
    },
    [onPointClick]
  );

  // lifecycle
  useEffect(() => {
    buildScene();

    const handleResize = () => {
      const container = containerRef.current;
      if (!container || !rendererRef.current || !cameraRef.current || !composerRef.current)
        return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      rendererRef.current.setSize(w, h);
      composerRef.current.setSize(w, h);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameRef.current);
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);

      // clear label interval
      if (rendererRef.current?.domElement.dataset.labelInterval) {
        clearInterval(
          Number(rendererRef.current.domElement.dataset.labelInterval)
        );
      }

      // dispose three.js resources
      if (sceneRef.current) {
        sceneRef.current.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material.dispose();
            }
          }
        });
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.domElement.remove();
      }
      if (composerRef.current) {
        composerRef.current.dispose();
      }
      controlsRef.current?.dispose();
    };
  }, [buildScene]);

  // render
  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 400,
        background: '#0a0a0a',
        overflow: 'hidden',
        cursor: 'grab',
        borderRadius: '8px',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerClick}
    >
      {/* css overlay labels */}
      {labels.map((label, idx) => (
        <div
          key={`${label.type}-${idx}`}
          style={{
            position: 'absolute',
            left: label.x,
            top: label.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            userSelect: 'none',
            whiteSpace: 'pre-line',
            textAlign: 'center',
            fontSize: label.type === 'project' ? '11px' : '9px',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            fontWeight: label.type === 'project' ? 600 : 400,
            color: label.type === 'project' ? '#94a3b8' : '#64748b',
            textShadow: '0 0 8px rgba(0,0,0,0.8)',
            letterSpacing: '0.02em',
            lineHeight: 1.3,
            opacity: 0.9,
          }}
        >
          {label.text}
        </div>
      ))}
    </div>
  );
};

export { TerrainVisualization };
export default TerrainVisualization;
