// script.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";

// SET UP VARIABLES
const SEPARATION = 3;
const AMOUNTX = 32;
const AMOUNTY = 40;
const audioDataHistory = [];
const maxHistorySize = AMOUNTY;
let analyser, sound, audioLoader, audioListener;

// Three.js setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.x = 70;
camera.position.y = 50;
camera.position.z = 20;

// RENDERER SETUP
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("canvasThree"),
  antialias: true,
});
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Make sure the scene adjusts to the browser window size
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  bloomComposer.setSize(window.innerWidth, window.innerHeight);
  finalComposer.setSize(window.innerWidth, window.innerHeight);
  camera.updateProjectionMatrix();
});

// CONTROLS FOR NAVIGATION
// Here the camera is given OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);

// GUI SETUP
const gui = new GUI();
const params = {
  threshold: 3.0,
  strength: 0.345,
  radius: 0.1,
  exposure: 1,
  song: "./a_ha_Take_On_Me.mp3",
};
const bloomFolder = gui.addFolder("bloom");
const songFolder = gui.addFolder("song");

songFolder
  .add(params, "song", {
    TakeOnMe: "./a_ha_Take_On_Me.mp3",
    HarlemRiver: "./Monolink_Harlem_River.mp3",
  })
  .onChange(function (value) {
    sound.stop();
    audioSetup(params.song);
    render();
  });

bloomFolder.add(params, "threshold", 0.0, 30).onChange(function (value) {
  render();
});

bloomFolder.add(params, "strength", 0.0, 3).onChange(function (value) {
  bloomPass.strength = Number(value);
  render();
});

bloomFolder
  .add(params, "radius", 0.0, 1.0)
  .step(0.01)
  .onChange(function (value) {
    bloomPass.radius = Number(value);
    render();
  });
bloomFolder.add(params, "exposure", 0.1, 2).onChange(function (value) {
  renderer.toneMappingExposure = Math.pow(value, 4.0);
  render();
});

// BACKGROUND SETUP
scene.background = new THREE.Color(0x000000);

// AUDIO SETUP
function audioSetup(song) {
  audioListener = new THREE.AudioListener();
  camera.add(audioListener);

  sound = new THREE.Audio(audioListener);
  audioLoader = new THREE.AudioLoader();
  audioLoader.load(song, function (buffer) {
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setVolume(0.5);
    sound.play();
  });

  analyser = new THREE.AudioAnalyser(sound, 64);
}

audioSetup(params.song);

// cube grid
let cubes = [];
for (let iy = 0; iy < AMOUNTY; iy++) {
  for (let ix = 0; ix < AMOUNTX; ix++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    const cube = new THREE.Mesh(geometry, material);

    cube.position.x = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2;
    cube.position.z = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2;

    cube.isBloomCube = true;

    scene.add(cube);
    cubes.push(cube);
  }
}

// BLOOM EFFECT
const BLOOM_SCENE = 1;
const darkMaterial = new THREE.MeshBasicMaterial({ color: "black" });
const materials = {};

const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_SCENE);
const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,
  0.4,
  0.85
);
bloomPass.threshold = 0.3;
bloomPass.strength = params.strength;
bloomPass.radius = params.radius;

const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(renderScene);
bloomComposer.addPass(bloomPass);

const mixPass = new ShaderPass(
  new THREE.ShaderMaterial({
    uniforms: {
      baseTexture: { value: null },
      bloomTexture: { value: bloomComposer.renderTarget2.texture },
    },
    vertexShader: document.getElementById("vertexshader").textContent,
    fragmentShader: document.getElementById("fragmentshader").textContent,
    defines: {},
  }),
  "baseTexture"
);
mixPass.needsSwap = true;

const outputPass = new OutputPass();
const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(renderScene);
finalComposer.addPass(mixPass);
finalComposer.addPass(outputPass);

function animate() {
  requestAnimationFrame(animate);

  // Get the frequency data from the analyser
  const frequencyData = analyser.getFrequencyData();

  // Streaming Effect - data is added to an array, so that the history can be used to update the cubes
  audioDataHistory.unshift([...frequencyData]); // Add new data at the start of the array

  if (audioDataHistory.length > maxHistorySize) {
    audioDataHistory.pop(); // Remove the oldest data to maintain the history size
  }

  // Update cubes based on audio data history
  updateCubes(audioDataHistory);

  controls.update();
  renderer.render(scene, camera);
  render();
}

function render() {
  // Render bloom layers
  scene.traverse(darkenNonBloomed);
  bloomComposer.render();
  scene.traverse(restoreMaterial);

  // Render final scene
  finalComposer.render();
}

function darkenNonBloomed(obj) {
  if (obj.isMesh && obj.isBloomCube && bloomLayer.test(obj.layers) === false) {
    materials[obj.uuid] = obj.material;
    obj.material = darkMaterial;
  }
}

function restoreMaterial(obj) {
  if (obj.isMesh && obj.isBloomCube && materials[obj.uuid]) {
    obj.material = materials[obj.uuid];
    delete materials[obj.uuid];
  }
}

function updateCubes(history) {
  // Iterate over each row in the history, and each cube in the row
  for (let r = 0; r < history.length && r < AMOUNTY; r++) {
    const row = history[r];
    const cubeRow = AMOUNTY - 1 - r;
    for (let i = 0; i < row.length && i < AMOUNTX; i++) {
      const cubeIndex = cubeRow * AMOUNTX + i;
      const cube = cubes[cubeIndex];
      if (!cube) continue;

      // Update cube based on the frequency data
      const freqValue = row[i];
      const scale = freqValue / 80; //freqValue / 128.0; // Normalize the frequency data
      cube.scale.y = scale * scale * 5; //Math.max(1, scale * scale) * 5;

      // Update cube color (you can create a color mapping function)
      cube.material.color.setHSL(freqValue / 256.0, 1.0, 0.5);

      // Toggle visibility based on scale
      const scaleThreshold = 5;
      cube.visible = cube.scale.y > scaleThreshold;

      // Enable bloom based on scale
      if (cube.scale.y >= params.threshold) {
        cube.layers.enable(BLOOM_SCENE);
      } else {
        cube.layers.disable(BLOOM_SCENE);
      }
    }
  }
}

animate();
