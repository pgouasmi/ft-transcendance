import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    BloomEffect, ChromaticAberrationEffect, EffectComposer, EffectPass, GodRaysEffect,
    KernelSize, RenderPass, SMAAEffect, SMAAPreset
} from 'postprocessing';
import { RoundedBoxGeometry } from 'three/examples/jsm/Addons.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toggleMenu, togglePopover } from '../ui/ui.js';
import { makeItGrain } from '../threeEffects/MakeItGrain.js';
import { announceWinner } from './matchUi.js';
import { setISFINISHED } from './tournament.js';

import { getCookie } from "../auth/cookies.js";
import { handleOutsideClick, hideAllPopovers } from '../ui/eventListeners.js';
import { urlChange } from '../ui/router.js';
import { LoadingPopover } from '../components/LoadingPopover.js';
import { displayPlayerNames } from '../components/PlayerNamePopover.js';
import { showBootstrapAlert } from '../ui/ui.js';

const scene = new THREE.Scene();

//VAR

//Classes

class InputHandler {
    #inputs;
    #inputMap;
    #active;
    #inputValues;
    #inputSettings;
    #messageQueue;
    #queueSize;
    static #instance;
    constructor(inputs = { p1Up: 'w', p1Down: 's', p2Up: 'ArrowUp', p2Down: 'ArrowDown' }) {
        if (InputHandler.#instance) {
            return InputHandler.#instance;
        }
        this.#active = false;
        this.#inputs = inputs;
        this.#inputValues = { p1: 0, p2: 0 };
        this.#inputSettings = this.#initInputSettings();
        this.#inputMap = this.#initInputMap(this.#inputs);
        this.#messageQueue = [];
        this.#queueSize = 3;
        window.addEventListener('keydown', this.#activateInput.bind(this));
        window.addEventListener('keyup', this.#deactivateInput.bind(this));
        setInterval(() => this.#processQueue(), 16);
        InputHandler.#instance = this;
    }
    #initInputSettings() {
        const settings = {};
        const inputs = ['p1Up', 'p1Down', 'p2Up', 'p2Down'];
        inputs.forEach(input => {
            settings[input] = {
                player: input.startsWith('p1') ? 'p1' : 'p2',
                active: false,
                justMod: false,
            };
        });
        return settings;
    }
    #initInputMap(inputs) {
        const inputMap = new Map();

        inputMap.set(inputs.p1Up, this.#inputSettings["p1Up"]);
        inputMap.set(inputs.p1Down, this.#inputSettings["p1Down"]);
        inputMap.set(inputs.p2Up, this.#inputSettings["p2Up"]);
        inputMap.set(inputs.p2Down, this.#inputSettings["p2Down"]);

        return inputMap;
    }
    #processQueue() {
        if (this.#active && this.#messageQueue.length > 0) {
            sendMessage(this.#messageQueue.shift());
        }
    }
    #checkInputValues(message) {
        const player = message.player;
        const previousValue = this.#inputValues[player];
        this.#inputValues[player] = this.#inputMap.get(this.#inputs[`${player}Up`]).active - this.#inputMap.get(this.#inputs[`${player}Down`]).active;
        return this.#inputValues[player] !== previousValue;
    }
    #activateInput(event) {
        if (!this.#active) return;
        const message = this.#inputMap.get(event.key);
        if (message && !message.active) {
            message.active = true;
            message.justMod = true;
        }
    }
    #deactivateInput(event) {
        if (!this.#active) return;
        const message = this.#inputMap.get(event.key);
        if (message && message.active) {
            message.active = false;
            message.justMod = true;
        }
    }
    #prepareMessage(player) {
        return {
            type: 'keyDown',
            player: player,
            value: [this.#inputValues.p1, this.#inputValues.p2],
            active: true,
            sender: 'front'
        };
    }
    sendActiveInputs() {
        if (!this.#active) return;
        for (const settings of this.#inputMap.values()) {
            if (settings.justMod && this.#checkInputValues(settings)) {
                const message = this.#prepareMessage(settings.player);
                if (this.#messageQueue.length >= this.#queueSize) {
                    this.#messageQueue[this.#queueSize - 1] = message;
                }
                else {
                    this.#messageQueue.push(message);
                }
            }
            settings.justMod = false;
        }
    }
    isActive() {
        return this.#active;
    }
    activate() {
        this.#active = true;
    }
    deactivate() {
        this.#active = false;
    }
    static getInstance() {
        return InputHandler.#instance ? InputHandler.#instance : new InputHandler();
    }
}

class destructibleBorder {
    constructor(position, id) {
        if (new.target === destructibleBorder) {
            throw new TypeError("Cannot construct destructibleBorder instances directly");
        }
        this.id = id;
        this.hit = false;
        this.sideHit = 0;
        this.speed = 0;
        this.position = new THREE.Vector3(position.x, position.y, position.z);
        this.rotation = new THREE.Vector3(0, 0, 0);
        this.matrix = new THREE.Matrix4();
        this.rotationMatrix = new THREE.Matrix4();
        this.positionMatrix = new THREE.Matrix4();
        this.matrix.identity();
    }
    setHit(hit) {
        this.hit = hit;
    }
    calculateSpeed(ballSpeed) {
        this.speed = ballSpeed * 0.003;
    }
    getHit() {
        return this.hit;
    }
}

class destructibleBorderP1 extends destructibleBorder {
    constructor(position, id) {
        super(position, id);
    }
    setSideHit(ballX) {
        ballX++;
        if (ballX - round05(ballX) > 0) {
            this.sideHit = -1;
        }
        else {
            this.sideHit = 1;
        }
    }
    moveBorder(borderInstance) {
        if (this.hit) {
            this.matrix.identity();
            this.positionMatrix.identity();
            this.rotationMatrix.identity();
            if (this.sideHit === 1) {
                this.rotation.z -= this.speed;
                this.rotation.y -= this.speed;
                this.position.y -= 0.0005;
            }
            else if (this.sideHit === -1) {
                this.rotation.z += this.speed;
                this.rotation.y += this.speed;
                this.position.y += 0.0005;
            }
            this.position.z -= 0.003;
            this.rotationMatrix.makeRotationFromEuler(new THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z));
            this.positionMatrix.setPosition(new THREE.Vector3(this.position.x, this.position.y, this.position.z));
            this.matrix.multiplyMatrices(this.positionMatrix, this.rotationMatrix);
            borderInstance.setMatrixAt(this.id, this.matrix);
            borderInstance.instanceMatrix.needsUpdate = true;
        }

    }
}

class destructibleBorderP2 extends destructibleBorder {
    constructor(position, id) {
        super(position, id);
    }
    setSideHit(ballX) {
        ballX++;
        if (ballX - round05(ballX) < 0) {
            this.sideHit = -1;
        }
        else {
            this.sideHit = 1;
        }
    }
    moveBorder(borderInstance) {
        if (this.hit) {
            this.matrix.identity();
            this.positionMatrix.identity();
            this.rotationMatrix.identity();
            if (this.sideHit === 1) {
                this.rotation.z += this.speed;
                this.rotation.y += this.speed;
                this.position.y += 0.0005;
            }
            else if (this.sideHit === -1) {
                this.rotation.z -= this.speed;
                this.rotation.y -= this.speed;
                this.position.y -= 0.0005;
            }
            this.position.z += 0.003;
            this.rotationMatrix.makeRotationFromEuler(new THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z));
            this.positionMatrix.setPosition(new THREE.Vector3(this.position.x, this.position.y, this.position.z));
            this.matrix.multiplyMatrices(this.positionMatrix, this.rotationMatrix);
            borderInstance.setMatrixAt(this.id, this.matrix);
            borderInstance.instanceMatrix.needsUpdate = true;
        }
    }
}

RectAreaLightUniformsLib.init();
let link = document.querySelector("link[rel~='icon']");
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    link.href = "/images/astropong-icon-light.svg";
} else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    link.href = "/images/astropong-icon-dark.svg";
}

//Loader//
const textureLoader = new THREE.TextureLoader();
const fontLoader = new FontLoader();
const gltfLoader = new GLTFLoader();

// Game Variables
let socket = null;
let userId = "1234";

let gameData = null;
let oldGameData = null;
let gameModeG = null;
let tournamentB = false

let isGameOver = false;

let ejectBallLeft = false;
let ejectBallRight = false;
let ejectVectorX = 0;
let ejectSpeed = 0;
let lastBallPos = new THREE.Vector3(0, 0, 0);
let t = 0;
let transitionColor = new THREE.Color('white');
let increasePlayer1Light = false;
let decreasePlayer1Light = false;
let increasePlayer2Light = false;
let decreasePlayer2Light = false;
let p1Touched = false;
let p2Touched = false;
let wallHit = false;
let moveProgress = 0.0001;
let transShaker = 0.0001;
let blackBarTop = document.querySelector('#black-bar-top');
let blackBarBottom = document.querySelector('#black-bar-bottom');
let positionTarget;
const startMessage = {
    type: 'start',
    data: 'init',
}
const resumeGoalMessage = { type: 'resumeOnGoal', sender: 'front' };
let transitionBorderColor = new THREE.Color('white');
const whiteColor = new THREE.Color('white');
let tBorder = 0;
let borderLightIntensity = 2;
let increaseBorderLight = true;
let decreaseBorderLight = false;
let score1 = 0;
let player1Name = 'Player 1';
let score2 = 0;
let player2Name = 'Player 2';

const namesEvent = new Event('namesReceived');

let waitingForNames = false;

let gameStateMap = new Map();
gameStateMap.set(0, 'LOADING');
gameStateMap.set(1, 'PRESS_START');
gameStateMap.set(2, 'MAIN_MENU');
gameStateMap.set(3, 'IN_GAME');
gameStateMap.set(4, 'GOAL');
let waitingForBack = false;
let matchmakingStatus = 'waiting';

//Colors//
const blueColor = new THREE.Color(0x9aeadd);
const yellowColor = new THREE.Color(0xf8bc04);

//Earth textures
const albedoEarth = setTexture('/assets/textures/Earth/Albedo.jpg');
const bumpEarth = setTexture('/assets/textures/Earth/Bump.jpg');
const nightMap = setTexture('/assets/textures/Earth/Night.png');
const oceanMap = setTexture('/assets/textures/Earth/Ocean.png');
const cloudsMap = setTexture('/assets/textures/Earth/Clouds.png');

//Moon textures
const baseMoon = setTexture('/assets/textures/Moon/Base.jpg');
const bumpMoon = setTexture('/assets/textures/Moon/Bump.jpg');

//Positions//
const mainMenuPos = new THREE.Vector3(-14069703.335312193, 16848469.744036343, 8.615208577271458e-10);
const terrainPos = new THREE.Vector3(-11, 12, 0);

//Stats//
let loadingProgress = 0;
//Enums//
export const gameStateEnum = {
    LOADING: 0,
    PRESS_START: 1,
    MAIN_MENU: 2,
    IN_GAME: 3,
    GOAL: 4
}
export let gameState = gameStateEnum.LOADING;
export function setGameState(state) {
    gameState = state;
}
export function getGameState() {
    return gameState;
}

let gamePause = false;

//Camera//
let camera;
let shakeCamera = 0;
let movingToTerrain = false;
export function getMovingToTerrain() { return movingToTerrain; }
let movingToMainMenu = false;
export function getMovingToMainMenu() { return movingToMainMenu; }

//Angles//
let terrainAngle = 0;
let earthAngle = 0;
let moonAngle = 0;
let issAngle = 0;

let sideG = null;

//Meshes//
let terrainMesh;
let player1Mesh;
let player2Mesh;
let cylinderMesh;
let textMesh;
let textMesh2;
let topHorizontalBorderMesh;
let bottomHorizontalBorderMesh;
let centralBorderMesh;
let moonMesh;
let atmosphereMesh;
let earthMesh;
let cloudsMesh;
let ejectedBallMesh;

//Font//
let loadedFont;

//Lights//
let ballLight;
let player1Light;
let player2Light;
let topHorizontalBorderLight;
let bottomHorizontalBorderLight;
let sunLight;
let ejectedBallLight;

//Groups//
const terrainGroup = new THREE.Group();
const earthGroup = new THREE.Group();
const sunGroup = new THREE.Group();

//Models//
let iss;
let sun;

//SunLight
sunLight = new THREE.PointLight('white', 6, Infinity);
sunLight.decay = 0;

const uniforms = {
    lightColor: { value: new THREE.Color(0xffddaa) }
};
uniforms.lightColor.value = new THREE.Color(0xffddaa).multiplyScalar(0.5);

//Materials//
let borderMaterial;
const textMaterial = new THREE.MeshPhysicalMaterial({
    metalness: 0,
    roughness: 0.3,
    transmission: 0.7,
    thickness: 0.5,
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0
});
const ballMaterial = new THREE.MeshPhysicalMaterial({
    metalness: 0,
    roughness: 0.1,
    transmission: 1,
    thickness: 0.5,
    color: 'white',
    emissive: 'white',
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 1
});
const ejectedBallMaterial = new THREE.MeshPhysicalMaterial({
    metalness: 0,
    roughness: 0.1,
    transmission: 1,
    thickness: 0.5,
    color: 'white',
    emissive: 'white',
    emissiveIntensity: 1,
    visible: false
});

// Geometry
const cylinderGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 64);
let shakeIntensity = 0.002;

//Destructible Borders
const borderData = new Array(40).fill(0);

// DOM Elements
let loadingScreen = document.querySelector('.loading-screen');
let gameRenderer = document.querySelector('#game-renderer');
let loadingBar = document.querySelector('#loading-bar');

const close_loading = (event) => {
    if (gameState === gameStateEnum.PRESS_START) {
        accessMainMenu();
        window.removeEventListener(event.type, close_loading);
    }
}

window.addEventListener('keypress', close_loading);
window.addEventListener('click', close_loading);
document.addEventListener('wheel', function (event) {
    if (event.ctrlKey) {
        event.preventDefault();
    }
}, { passive: false });

document.addEventListener('keydown', function (event) {
    if (event.ctrlKey && (event.key === '+' || event.key === '-' || event.key === '0' || event.key === '_' || event.key === '=')) {
        event.preventDefault();
    }
});
window.addEventListener('resize', function () {
    const aspectRatio = { width: window.innerWidth, height: window.innerHeight };
    if (aspectRatio.width > 426 && aspectRatio.height > 240 && aspectRatio.width < 3840 && aspectRatio.height < 2160) {
        camera.aspect = aspectRatio.width / aspectRatio.height;
        camera.updateProjectionMatrix();

        renderer.setSize(aspectRatio.width, aspectRatio.height);
        composer.setSize(aspectRatio.width, aspectRatio.height);
    }
});

//Renderer//
const player1 = new RoundedBoxGeometry(1.67, 0.1, 0.1, 10, 0.2);
const player1Material = new THREE.MeshPhysicalMaterial({
    metalness: 0,
    roughness: 0.1,
    transmission: 1,
    thickness: 0.5,
    color: yellowColor,
    emissive: yellowColor,
    emissiveIntensity: 1,
});
player1Mesh = new THREE.Mesh(player1, player1Material);
player1Mesh.position.y = 0.005;
player1Mesh.position.x = 0;
player1Mesh.position.z = -7;
player1Light = new THREE.RectAreaLight(player1Material.color, 10, 1.66, 0.5);
player1Light.position.copy(player1Mesh.position);
player1Light.position.z -= 0.05;
player1Light.lookAt(player1Mesh.position.x, player1Mesh.position.y, player1Mesh.position.z + 1);
const player2 = new RoundedBoxGeometry(1.67, 0.1, 0.1, 10, 0.2);
const player2Material = new THREE.MeshPhysicalMaterial({
    metalness: 0,
    roughness: 0.1,
    transmission: 1,
    thickness: 0.5,
    color: blueColor,
    emissive: blueColor,
    emissiveIntensity: 1,
});
player2Mesh = new THREE.Mesh(player2, player2Material);
player2Mesh.position.y = 0.005;
player2Mesh.position.x = 0;
player2Mesh.position.z = 7;
player2Light = new THREE.RectAreaLight(player2Material.color, 10, 1.66, 0.5);
player2Light.position.copy(player2Mesh.position);
player2Light.position.z += 0.05;
player2Light.lookAt(player2Mesh.position.x, player2Mesh.position.y, player2Mesh.position.z - 1);
cylinderMesh = new THREE.Mesh(cylinderGeometry, ballMaterial);
cylinderMesh.position.y = 0.025;
ejectedBallMesh = new THREE.Mesh(cylinderGeometry, ejectedBallMaterial);
ejectedBallLight = new THREE.PointLight('white', 0.5, 2);
const ambientLight = new THREE.AmbientLight(0xffffff)
ambientLight.intensity = 0.01;
ballLight = new THREE.PointLight('white', 0.5, 2);
ballLight.position.copy(cylinderMesh.position);
borderMaterial = new THREE.MeshPhysicalMaterial({
    metalness: 0,
    roughness: 0.2,
    transmission: 0.7,
    thickness: 0.5,
    color: 'white',
});
const destructibleBorderGeometry = new THREE.BoxGeometry(0.5, 0.05, 0.1);
const destructibleBorderInstance = new THREE.InstancedMesh(destructibleBorderGeometry, borderMaterial.clone(), 40);
camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 40000000);
camera.position.set(mainMenuPos.x, mainMenuPos.y, mainMenuPos.z);
camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();

const starsCount = 4000;
const starGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(starsCount * 3);
for (let i = 0; i < starsCount * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 100000000;
}
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.1,
    sizeAttenuation: false,
});
const stars = new THREE.Points(starGeometry, starMaterial);


const sphereGeometry = new THREE.SphereGeometry(1500, 64, 64);
const sphereMaterial = new THREE.MeshBasicMaterial({
    color: 0xFFFBD6,
});
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

earthGroup.position.set(70000, 0, 0);
sunGroup.position.set(0, -50, 0);

const earthGeometry = new THREE.SphereGeometry(400, 256, 256);
const earthMaterial = new THREE.MeshStandardMaterial({
    map: albedoEarth,
    bumpMap: bumpEarth,
    bumpScale: 2.5,
    roughnessMap: oceanMap,
    metalness: 0.1,
    roughness: 0.9,
    metalnessMap: oceanMap,
    emissiveMap: nightMap,
    emissive: 0xffd66e,
    emissiveIntensity: 1.5,
});

const cloudsGeometry = new THREE.SphereGeometry(402, 256, 256);
const cloudsMaterial = new THREE.MeshStandardMaterial({
    alphaMap: cloudsMap,
    bumpMap: cloudsMap,
    bumpScale: 0.4,
    transparent: true,
    blending: THREE.NormalBlending,
    alphaTest: 0,
});

earthMaterial.onBeforeCompile = function (shader) {

    shader.uniforms.tClouds = { value: cloudsMap }
    shader.uniforms.tClouds.value.wrapS = THREE.RepeatWrapping;
    shader.uniforms.uv_xOffset = { value: 0 }
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;

        #ifdef USE_ROUGHNESSMAP

            vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
            texelRoughness = vec4(1.0) - texelRoughness;

            roughnessFactor *= clamp(texelRoughness.g, 0.5, 1.0);

        #endif
        `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        float cloudsMapValue = texture2D(tClouds, vec2(vMapUv.x - uv_xOffset, vMapUv.y)).r;
        diffuseColor.rgb *= max(1.0 - cloudsMapValue, 0.2 );
        vec3 atmosphere = vec3( 0.3, 0.6, 1.0 ) * pow(0.8, 5.0);

        diffuseColor.rgb += atmosphere;
        `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
        #include <common>
        uniform sampler2D tClouds;
        uniform float uv_xOffset;
        `);

    earthMaterial.userData.shader = shader
}

const vertexShader2 = `
    varying vec3 vNormal;
    void main() {
        vNormal = normalize( normalMatrix * normal );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`;

const fragmentShader2 = `
    varying vec3 vNormal;
    void main() {
        float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );
        gl_FragColor = vec4( 0.4, 0.6, 1, 1.0 ) * intensity;
    }`;

const atmosphereGeometry = new THREE.SphereGeometry(400, 64, 64);
const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: vertexShader2,
    fragmentShader: fragmentShader2,
    side: THREE.BackSide,
    blending: THREE.NormalBlending,
    depthWrite: false,
    transparent: true,
});

atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
atmosphereMesh.scale.set(1.1, 1.1, 1.1);
earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
cloudsMesh = new THREE.Mesh(cloudsGeometry, cloudsMaterial);

const moonGeometry = new THREE.SphereGeometry(150, 64, 64);
const moonMaterial = new THREE.MeshStandardMaterial({
    map: baseMoon,
    bumpMap: bumpMoon,
    bumpScale: 3,
});
moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
moonMesh.position.set(earthGroup.position.x + 600, 0, 0);

if (sun) {
    sunLight.position.set(sun.position.x, sun.position.y, sun.position.z);
    sphere.position.set(sun.position.x, sun.position.y, sun.position.z);
}

const renderer = new THREE.WebGLRenderer({
    antialias: false,
    outputEncoding: THREE.SRGBColorSpace,
    powerPreference: 'high-performance',
    canvas: document.querySelector('#game-renderer'),
});
renderer.setPixelRatio(window.devicePixelRatio * 0.7);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 2;
renderer.gammaOutput = true;
renderer.physicallyCorrectLights = true;

const earthGodRaysEffect = new GodRaysEffect(camera, atmosphereMesh, {
    height: 480,
    kernelSize: KernelSize.SMALL,
    density: 0.5,
    decay: 0.92,
    weight: 0.4,
    exposure: 0.04,
    samples: 60,
    clampMax: 0.1
});

const godRaysEffect = new GodRaysEffect(camera, sphere, {
    height: 480,
    kernelSize: KernelSize.SMALL,
    density: 0.99,
    decay: 0.92,
    weight: 0.6,
    exposure: 1.0,
    samples: 60,
    clampMax: 1.0
});

const bloomEffect = new BloomEffect({
    kernelSize: KernelSize.LARGE,
    useLuminanceFilter: true,
    luminanceThreshold: 0.3,
    luminanceSmoothing: 0.5,
});
bloomEffect.intensity = 0.8;

const smaaEffect = new SMAAEffect();
smaaEffect.edgeDetectionMaterial.edgeDetectionMode = 1;
smaaEffect.applyPreset(SMAAPreset.ULTRA);
smaaEffect.edgeDetectionMaterial.edgeDetectionThreshold = 0.1;

const chromaticAberrationEffect = new ChromaticAberrationEffect({
    offset: new THREE.Vector2(0.0004, 0.0004),
    amount: 0.00015,
});

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const smaaPass = new EffectPass(camera, smaaEffect);
composer.addPass(smaaPass);
const effectPass = new EffectPass(camera, chromaticAberrationEffect, bloomEffect, godRaysEffect, earthGodRaysEffect);
composer.addPass(effectPass);
effectPass.renderToScreen = true;
makeItGrain(THREE, camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enabled = false;
controls.minDistance = 11;
controls.update();


// FUNCTIONS

function waitForSocketConnection(socket) {
    return new Promise((resolve, reject) => {
        socket.onopen = () => {
            resolve();
        };

        socket.onerror = (error) => {
            reject(error);
        };
    });
}

export async function initWebSocket(mode, option, names) {
    let uid;
    if (mode === 'PVP' && option === 1) {
        uid = await joinUID(mode, option);
        if (uid === 'error') {
            uid = await createUID(mode, option);
        }
    } else {
        uid = await createUID(mode, option);
    }

    let authorization = getCookie('jwt_token') ? getCookie('jwt_token') : getCookie('guest_token');

    const clear_token = authorization.replace('Bearer ', '').trim();
    try {
        socket = new WebSocket(
            `wss://${window.location.hostname}:7777/ws/pong/${uid}/`,
            [`token_${clear_token}`]
        );
        await waitForSocketConnection(socket);
        socket.send(JSON.stringify({ type: "greetings", sender: "front", name: names }));

        socket.onmessage = function (event) {
            gameData = JSON.parse(event.data);

            if (gameData.type === "opponent_connected" || gameData.type === "timeout") {
                matchmakingStatus = gameData.type;
            }

            if (gameData.type === "gameover") {
                showBootstrapAlert('Le joueur adverse a quitté la partie', 'danger');
                ErrorInGame();
            }
        };

        socket.onclose = function (event) {
            if (isGameOver !== true) {
                resetGame();
            }
        };
    } catch (error) {
        console.log('Error opening WebSocket:', error);
        throw error;
    }
}

async function joinUID(mode, option) {
    try {
        const joinResponse = await fetch(`https://${window.location.hostname}:7777/game/join/?mode=${mode}&option=${option}`, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'Accept': 'application/json',
                'Authorization': getCookie('jwt_token') ? getCookie('jwt_token') : getCookie('guest_token')
            },
            credentials: 'include',
            mode: 'cors'
        }).catch(error => {
            error.preventDefault();
        });


        let data = await joinResponse.json();

        let gameUID = data.uid;

        if (joinResponse.status !== 200 && joinResponse.status !== 404) {
            throw new Error(data.error)
        }

        return gameUID;
    } catch (error) {
        console.log('Error joining game:', error);
        throw error;
    }
}

async function createUID(mode, option) {
    try {
        const joinResponse = await fetch(`https://${window.location.hostname}:7777/game/create/?mode=${mode}&option=${option}`, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'Accept': 'application/json',
                'Authorization': getCookie('jwt_token') ? getCookie('jwt_token') : getCookie('guest_token')
            },
            credentials: 'include',
            mode: 'cors'
        }).catch(error => {
            error.preventDefault();
        });


        let data = await joinResponse.json();

        let gameUID = data.uid;

        if (joinResponse.status !== 200) {
            throw new Error(data.error)
        }

        return gameUID;
    } catch (error) {
        console.log('Error creating game :', error);
        throw error;
    }
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function renderLoadingScreen(loadingStep) {
    while (loadingProgress < loadingStep) {
        loadingProgress += 0.01;
        loadingBar.style.width = (30 * loadingProgress) + 'rem';
        await sleep(12);
    }
    if (loadingStep === 1.0) {
        let loadingEnd = document.querySelector('#loading-end');
        for (let index = loadingEnd.style.opacity; index < 100; index++) {
            loadingEnd.style.opacity = index + '%';
            await sleep(25);
        }
        let clickToStartText = document.querySelector('#press-to-start');
        clickToStartText.style.animation = 'fadeInOut 2s infinite alternate';
        clickToStartText.style.display = 'block';
        gameState = gameStateEnum.PRESS_START;
    }
}

function setTexture(path, repeat = 1) {
    const texture = textureLoader.load(path);
    texture.anisotropy = 16;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    return texture;
}

export function sendMessage(message) {
    // add "sender" field to message with value "front"
    message["sender"] = "front"
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

async function loadModels() {
    // ISS Model
    await gltfLoader.load('/assets/models/ISS.glb', function (gltf) {
        gltf.scene.scale.set(0.10, 0.10, 0.10);
        iss = gltf.scene;
        scene.add(iss);
        iss.position.set(70000, 500, 0);
    }, undefined, (error) => {
        console.log(error);
    });
    //Sun Model
    await gltfLoader.load('/assets/models/Sun.glb', function (gltf) {
        gltf.scene.scale.set(2.4, 2.4, 2.4);
        sun = gltf.scene;
        sun.position.set(0, -50, 0);
        sunGroup.add(sun);
    },
        undefined,
        (error) => {
            console.log(error);
        }
    );

    //Font Model
    await fontLoader.load('fonts/LCDscreen.json', function (font) {
        loadedFont = font;
        const player1Score = font.generateShapes('0', 3.5);
        const player2Score = font.generateShapes('0', 3.5);
        const textGeometry = new THREE.ShapeGeometry(player1Score);
        textGeometry.computeBoundingBox();
        const textGeometry2 = new THREE.ShapeGeometry(player2Score);
        textGeometry2.computeBoundingBox();
        textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.y = 10000;
        textMesh.position.x = -1.8;
        textMesh.position.z = -4.5;
        textMesh.rotation.x = Math.PI * 0.5;
        textMesh.rotation.y = Math.PI;
        textMesh.rotation.z = Math.PI * 0.5;
        textMesh2 = new THREE.Mesh(textGeometry2, textMaterial);
        textMesh2.position.y = 10000;
        textMesh2.position.x = -1.8;
        textMesh2.position.z = 1.8;
        textMesh2.rotation.x = Math.PI * 0.5;
        textMesh2.rotation.y = Math.PI;
        textMesh2.rotation.z = Math.PI * 0.5;
        terrainGroup.add(textMesh);
        terrainGroup.add(textMesh2);
    }, undefined, (error) => {
        console.log(error);
    });
    //End LoadModels()
}

function updateTextMesh(newText, textMesh) {
    if (loadedFont) {
        const playerScore = loadedFont.generateShapes(newText, 3.5);
        const textGeometry = new THREE.ShapeGeometry(playerScore);
        textGeometry.computeBoundingBox();
        textMesh.geometry = textGeometry;
    }
    else {
    }
}

function cameraShaker(savedIntensity = 0.002) {
    camera.rotation.x += shakeIntensity * (Math.random() - 0.5);
    camera.rotation.y += shakeIntensity * (Math.random() - 0.5);
    camera.rotation.z += shakeIntensity * (Math.random() - 0.5);
    shakeIntensity -= savedIntensity * 0.05;
    shakeCamera--;
    if (!shakeCamera) {
        shakeIntensity = savedIntensity;
    }
}

function rotateISS() {
    issAngle += 0.0004;
    const radius = 500;
    const issX = earthGroup.position.x + radius * Math.cos(issAngle);
    const issZ = earthGroup.position.z + radius * Math.sin(issAngle);
    iss.position.set(issX, 0, issZ);
    iss.rotation.x += 0.0001;
    iss.rotation.z += 0.0001;
    iss.rotation.y += 0.0001;
}

function rotateTerrain() {
    terrainAngle += 0.0009;
    const radius = 1000;
    const terrainX = earthGroup.position.x + radius * Math.cos(terrainAngle);
    const terrainZ = earthGroup.position.z + radius * Math.sin(terrainAngle);


    terrainGroup.position.set(terrainX, earthGroup.position.y + 200, terrainZ);
    terrainGroup.remove(camera);
    terrainGroup.lookAt(new THREE.Vector3(earthGroup.position.x, earthGroup.position.y + 1200, earthGroup.position.z));
    controls.update();
    camera.lookAt(terrainMesh.position.x, terrainMesh.position.y, terrainMesh.position.z);
    terrainGroup.add(camera);
    terrainGroup.rotateY(Math.PI * 1.5);
}

function rotateMoon() {
    moonAngle += 0.0005;
    const radius = 8300;
    const moonX = earthGroup.position.x + radius * Math.cos(moonAngle);
    const moonZ = earthGroup.position.z + radius * Math.sin(moonAngle);

    moonMesh.position.set(moonX, 0, moonZ);
    moonMesh.rotation.y += 0.0002;
}

function rotateEarth() {
    earthAngle += 0.0003;
    const radius = 110000;
    const earthX = sunGroup.position.x + radius * Math.cos(earthAngle);
    const earthZ = sunGroup.position.z + radius * Math.sin(earthAngle);

    earthGroup.position.set(earthX, 0, earthZ);

    earthMesh.rotation.y += 0.0001;
    cloudsMesh.rotation.y += 0.0002;
    cloudsMesh.rotation.x += 0.0002;
}

export function resetTerrain() {
    setDestructibleBorders(false);
    topHorizontalBorderLight.color = new THREE.Color('white');
    bottomHorizontalBorderLight.color = new THREE.Color('white');
    topHorizontalBorderLight.intensity = 5;
    bottomHorizontalBorderLight.intensity = 5;
    topHorizontalBorderMesh.material.color = new THREE.Color('white');
    bottomHorizontalBorderMesh.material.color = new THREE.Color('white');
    cylinderMesh.material = new THREE.MeshPhysicalMaterial({
        metalness: 0,
        roughness: 0.1,
        transmission: 1,
        thickness: 0.5,
        color: 'white',
        emissive: 'white',
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 1
    });
    ejectedBallMesh.visible = true;
    cylinderMesh.visible = true;
    ballLight.visible = true;
    ballLight.color = new THREE.Color('white');
    ballLight.intensity = 0.5;
    player1Light.intensity = 10;
    player2Light.intensity = 10;
    player1Mesh.position.set(0, 0.005, -7);
    player2Mesh.position.set(0, 0.005, 7);
    cylinderMesh.position.set(0, 0.025, 0);
    player1Light.position.copy(player1Mesh.position);
    player2Light.position.copy(player2Mesh.position);
    ballLight.position.copy(cylinderMesh.position);
    updateTextMesh("0", textMesh);
    updateTextMesh("0", textMesh2);
    waitingForBack = false;
    waitingForNames = false;
    increaseBorderLight = true;
    decreaseBorderLight = false;
}

function setDestructibleBorders(firstInit = true) {
    let position = 0;
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < 40; index++) {
        if (index < 20) {
            const vectorPos = new THREE.Vector3(-4.75 + position, 0.025, -7.55);
            matrix.setPosition(vectorPos);
            destructibleBorderInstance.setMatrixAt(index, matrix);
            borderData[index] = new destructibleBorderP1(vectorPos, index);
        } else {
            if (index === 20) {
                position = 0;
            }
            const vectorPos = new THREE.Vector3(-4.75 + position, 0.025, 7.55);
            matrix.setPosition(vectorPos);
            destructibleBorderInstance.setMatrixAt(index, matrix);
            borderData[index] = new destructibleBorderP2(vectorPos, index);
        }
        position += 0.5;
    }
    if (firstInit) {
        scene.add(destructibleBorderInstance);
        terrainGroup.add(destructibleBorderInstance);
    }
    else {
        destructibleBorderInstance.instanceMatrix.needsUpdate = true;
    }
}

function makeTerrain() {
    const terrainGeometry = new THREE.BoxGeometry(10.2, 0.05, 15.2);
    const terrainMaterial = new THREE.MeshPhysicalMaterial({
        metalness: 0,
        roughness: 0.4,
        transmission: 0.7,
        thickness: 0.5,
        color: 0xAAAAAA,
    });
    terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrainMesh.position.y = -0.025;
    terrainMesh.position.z = 0;
    terrainMesh.position.x = 0;
    const horizontalBorderGeometry = new THREE.BoxGeometry(0.1, 0.05, 15.2);
    const centralBorderGeometry = new THREE.BoxGeometry(10, 0.01, 0.05);
    const centralBorderMaterial = new THREE.MeshPhysicalMaterial({
        metalness: 0,
        roughness: 0,
        transmission: 1,
        thickness: 0.5,
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.7,
    });
    topHorizontalBorderMesh = new THREE.Mesh(horizontalBorderGeometry, borderMaterial);
    topHorizontalBorderMesh.position.set(5.05, 0.025, 0);
    bottomHorizontalBorderMesh = new THREE.Mesh(horizontalBorderGeometry, borderMaterial);
    bottomHorizontalBorderMesh.position.set(-5.05, 0.025, 0);
    centralBorderMesh = new THREE.Mesh(centralBorderGeometry, centralBorderMaterial);
    centralBorderMesh.position.set(0, 0, 0);
    topHorizontalBorderLight = new THREE.RectAreaLight(borderMaterial.color, 5, 16 - 0.9, 0.5);
    topHorizontalBorderLight.position.copy(topHorizontalBorderMesh.position);
    topHorizontalBorderLight.position.x += 0.5;
    topHorizontalBorderLight.lookAt(topHorizontalBorderMesh.position.x - 1, topHorizontalBorderMesh.position.y, topHorizontalBorderMesh.position.z);
    bottomHorizontalBorderLight = new THREE.RectAreaLight(borderMaterial.color, 5, 16 - 0.9, 0.5);
    bottomHorizontalBorderLight.position.copy(bottomHorizontalBorderMesh.position);
    bottomHorizontalBorderLight.position.x -= 0.5;
    bottomHorizontalBorderLight.lookAt(bottomHorizontalBorderMesh.position.x + 1, bottomHorizontalBorderMesh.position.y, bottomHorizontalBorderMesh.position.z);
    setDestructibleBorders();
    scene.add(topHorizontalBorderLight);
    scene.add(bottomHorizontalBorderLight);
    scene.add(centralBorderMesh);
    scene.add(topHorizontalBorderMesh);
    scene.add(bottomHorizontalBorderMesh);
    scene.add(terrainMesh);
}

async function accessMainMenu() {
    loadingScreen.style.animation = 'fadeOut 1.5s forwards';
    if (!document.getElementById('main-menu').classList.contains('visible')) toggleMenu();
    gameRenderer.style.animation = 'gameFadeIn 4.5s forwards';
    gameState = gameStateEnum.MAIN_MENU;
    urlChange(null, '/home');
}

export function zoomInGame(tournament) {
    if (tournament === true) {
        tournamentB = true;
    }
    movingToTerrain = true;
    movingToMainMenu = false;
    moveProgress = 0.0001;
    transShaker = 0.0001;
    const blackBarTop = document.getElementById('black-bar-top');
    const blackBarBottom = document.getElementById('black-bar-bottom');
    blackBarTop.style.animation = 'barSlideIn 1.5s forwards';
    blackBarBottom.style.animation = 'barSlideIn 1.5s forwards';

    hideAllPopovers();
}

export function zoomOutGame() {
    controls.enabled = false;
    movingToMainMenu = true;
    movingToTerrain = false;
    moveProgress = 0.0001;
    transShaker = 0.0001;
    InputHandler.getInstance().deactivate();

    blackBarTop.style.animation = 'barSlideOut 1s forwards';
    blackBarBottom.style.animation = 'barSlideOut 1s forwards';
}

export async function startGameTournament(diff, mode, names) {
    let option_dict = {
        'easy': 1,
        'medium': 2,
        'hard': 3,
        'easy_p1': 11,
        'medium_p1': 21,
        'hard_p1': 31
    };

    let option = option_dict[diff];
    if (option === undefined) option = 2;

    try {
        waitingForNames = true;
        await initWebSocket(mode, option, names);
        await sleep(60)
        cylinderMesh.visible = true;
        gameState = gameStateEnum.IN_GAME;
        controls.enabled = true;
        await new Promise(resolve => {
            document.addEventListener('namesReceived', resolve, { once: true });
        });
        await sleep(1000);
        displayPlayerNames(player1Name, player2Name);
        sendMessage(startMessage);
        InputHandler.getInstance().activate();
    } catch (error) {
        console.log('Error starting game:', error);
    }
}


let cleanupInProgress = false;
let currentLoadingPopover = null;
let cleanupPromise = Promise.resolve();

async function cleanupCurrentGame() {
    if (cleanupInProgress) {
        await cleanupPromise;
        return;
    }

    cleanupInProgress = true;
    cleanupPromise = (async () => {
        try {
            if (socket?.readyState === WebSocket.OPEN) {
                socket.onmessage = null;
                await socket.close();
            }
            socket = null;

            if (currentLoadingPopover) {
                currentLoadingPopover.hide();
                currentLoadingPopover.destroy();
                currentLoadingPopover = null;
            }

            matchmakingStatus = null;
        } finally {
            cleanupInProgress = false;
        }
    })();

    await cleanupPromise;
}

export async function startGame(element) {
    await cleanupCurrentGame();

    let option;
    let mode;
    let popover;
    let button;

    try {
        document.removeEventListener('click', handleOutsideClick);

        if (element.classList.contains('difficulty-button')) {
            mode = 'PVE';
            gameModeG = mode;
            popover = '#difficulty-popover';
            button = '#single-player-button';
            player1Name = 'You';
            player2Name = 'AI';
            if (element.id === "easy_button") {
                option = 1;
            } else if (element.id === "medium_button") {
                option = 2;
            } else if (element.id === "hard_button") {
                option = 3;
            }
        } else if (element.classList.contains('mp-mode-button')) {
            mode = 'PVP';
            player1Name = 'Player 1';
            player2Name = 'Player 2';
            popover = '#multiplayer-popover';
            button = '#multi-player-button';
            if (element.id === "lan_button") {
                option = 1;
                gameModeG = 'PVP_LAN';
            } else if (element.id === "shared_screen_button") {
                option = 2;
                gameModeG = 'PVP_keyboard';
            }
        }

        await initWebSocket(mode, option);
        togglePopover(popover, button);

        if (mode === 'PVE' || (mode === 'PVP' && option === 1)) {
            currentLoadingPopover = new LoadingPopover(mode);
            currentLoadingPopover.render();

            try {
                await new Promise((resolve, reject) => {
                    const interval = setInterval(() => {
                        console.log(window.location.pathname);
                        if (window.location.pathname === '/multiplayer' || window.location.pathname === '/singleplayer') {
                            clearInterval(interval);
                            reject(new Error("Connexion perdue"));
                        }

                        if (!socket || socket.readyState !== WebSocket.OPEN) {
                            clearInterval(interval);
                            reject(new Error("Connexion perdue"));
                        }

                        if (matchmakingStatus === 'timeout' || matchmakingStatus === 'same_jwt') {
                            clearInterval(interval);
                            reject(new Error(mode === 'PVP' ? "Pas d'adversaire trouvé" : "IA n'a pas pu se connecter"));
                        } else if (matchmakingStatus === 'opponent_connected') {
                            clearInterval(interval);
                            currentLoadingPopover?.hide();
                            currentLoadingPopover?.destroy();
                            resolve();
                        }
                        matchmakingStatus = null;
                    }, 250);

                    setTimeout(() => {
                        clearInterval(interval);
                        reject(new Error("Timeout"));
                    }, 10000);
                });

            } catch (error) {
                throw error;
            }
        }

        if (document.getElementById('main-menu').classList.contains('visible')) toggleMenu();
        zoomInGame();
        cylinderMesh.visible = true;

    } catch (error) {
        await cleanupCurrentGame();
        if (!document.getElementById('main-menu').classList.contains('visible')) toggleMenu();
        urlChange(null, '/home');
        showBootstrapAlert("Une erreur s'est produite: " + error.message, 'danger');
    }
}

function lightIntensity() {
    if (gameData && gameState !== gameStateEnum.GOAL) {
        let intensity = Math.pow(gameData.ball.speed, 2) * 5;
        if (intensity < 0.3)
            intensity = 0.3;
        cylinderMesh.material.emissiveIntensity = intensity;
        ballLight.intensity = intensity;
    }
    player1Material.emissiveIntensity = player1Light.intensity * 0.1;
    player2Material.emissiveIntensity = player2Light.intensity * 0.1;
}

function round05(value) {
    return Math.round(value * 2) * 0.5;
}

function checkBorders() {
    for (let index = 0; index < 40; index++) {
        borderData[index].moveBorder(destructibleBorderInstance);
    }
}

function animateVictory() {
    if (gameData && gameData.gameover !== null && gameState !== gameStateEnum.MAIN_MENU) {
        const winningColor = gameData?.goal === "1" ? player1Material.color : player2Material.color;
        let intensity;
        const maxIntensity = 20;
        let startTime = Date.now();

        const currentTime = Date.now();
        const elapsed = currentTime - startTime;
        intensity = (Math.sin(elapsed * 0.003) + 1) * maxIntensity;

        topHorizontalBorderLight.color = winningColor;
        bottomHorizontalBorderLight.color = winningColor;
        topHorizontalBorderLight.intensity = intensity;
        bottomHorizontalBorderLight.intensity = intensity;
        cylinderMesh.visible = false;
        ballLight.visible = false;
        return requestAnimationFrame(animateVictory);
    }
    else {
        return null;
    }
}

export async function gameOver(winner, gameMode) {

    await new Promise(resolve => {
        let interval = setInterval(() => {
            if (gameState !== gameStateEnum.GOAL) {
                clearInterval(interval);
                resolve();
            }
        }, 250);
    });

    if (socket === null) return;

    isGameOver = true; // Marquer que le jeu est terminé

    let announceWinnerString;

    if (tournamentB === true) {
        if (winner === '1') {
            announceWinnerString = "Victoire de " + player1Name + " !";
        }
        else {
            announceWinnerString = "Victoire de " + player2Name + " !";
        }
    }
    else {
        if (gameMode === 'PVE') {
            if (sideG === winner) {
                announceWinnerString = "Victoire !";
            }
            else {
                announceWinnerString = "Défaite !";
            }
        } else if (gameMode === 'PVP_keyboard') {
            if (winner - '0' === 1) {
                announceWinnerString = "Victoire du Joueur 1 !";
            }
            else {
                announceWinnerString = "Victoire du Joueur 2 !";
            }
        }
        else if (gameMode === 'PVP_LAN') {
            if (sideG === winner) {
                if (sideG === '1' && player2Name !== 'Adversaire') {
                    announceWinnerString = "Victoire contre " + player2Name + " !"
                }
                else if (sideG === '2' && player1Name !== 'Adversaire') {
                    announceWinnerString = "Victoire contre " + player1Name + " !"
                }
                else {
                    announceWinnerString = "Victoire!";
                }
            }
            else {
                if (sideG === '1' && player2Name !== 'Adversaire') {
                    announceWinnerString = "Defaite contre " + player2Name + " !"
                }
                else if (sideG === '2' && player1Name !== 'Adversaire') {
                    announceWinnerString = "Defaite contre " + player1Name + " !"
                }
                else {
                    announceWinnerString = "Defaite!";
                }
            }
        }
    }
    announceWinner(announceWinnerString);

    // Fermer proprement le socket
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
        socket = null;
    }

    let animationFrameId = animateVictory();

    // Ne pas mettre gameData à null tout de suite
    oldGameData = gameData;

    return new Promise((resolve) => {
        const handleClick = async () => {
            document.body.removeEventListener("click", handleClick);
            window.removeEventListener("popstate", handleClick);
            isGameOver = false;
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }

            updateTextMesh("0", textMesh);
            updateTextMesh("0", textMesh2);

            const announcement = document.getElementById("winner-announcement");
            announcement?.classList.remove("visible");
            await sleep(300);
            announcement?.remove();

            if (window.location.pathname !== '/tournament/ongoing') {
                zoomOutGame();
                gameState = gameStateEnum.MAIN_MENU;
                if (!document.getElementById('main-menu').classList.contains('visible')) toggleMenu();
                if (window.location.pathname !== '/singleplayer' || window.location.pathname !== '/multiplayer') urlChange(null, '/home');
                document.addEventListener("click", handleOutsideClick);
            } else {
                setISFINISHED(gameData.winner);
            }

            gameData = null;
            oldGameData = null;
            score1 = 0;
            score2 = 0;

            // Reinitialiser les paddles et de la balle
            setTimeout(() => {
                player1Mesh.position.set(0, 0.005, -7);
                player2Mesh.position.set(0, 0.005, 7);
                cylinderMesh.position.set(0, 0.025, 0);

                player1Light.position.copy(player1Mesh.position);
                player2Light.position.copy(player2Mesh.position);
                ballLight.position.copy(cylinderMesh.position);
            }, 2000);

            resolve();
        };

        document.body.addEventListener("click", handleClick);
        window.addEventListener("popstate", handleClick);
    });
}

function decodeJWT(token) {
    // Séparer les parties du token
    const [header, payload, signature] = token.split('.');

    // Décoder la partie payload (base64)
    const decodedPayload = JSON.parse(atob(payload));

    return decodedPayload;
}

function updateGame() {
    if (gameData) {
        if (gameData.type === "greetings") {
            if (gameModeG === 'PVP_LAN' || gameModeG === 'PVE')
                if (gameData.side === 'p1') {
                    sideG = '1';
                    player1Name = 'Vous';
                    player2Name = 'Adversaire';
                }
                else {
                    sideG = '2';
                    player1Name = 'Adversaire';
                    player2Name = 'Vous';
                }
            gameData = null;
            return;
        }

        if (gameData.type === "timeout" || gameData.type === "opponent_connected" || gameData.type === "same_jwt") {
            matchmakingStatus = gameData.type;
            gameData = null;
            return;
        }

        if (gameData.type === 'names') {
            let client_name
            // decode jwt from cookie and get username
            let token = getCookie('jwt_token')
            if (!token) {
                token = getCookie('guest_token')
            }
            client_name = decodeJWT(token).username
            if (gameData.p1 !== 'AI' && gameData.p1 !== client_name) {
                player1Name = gameData.p1 || player1Name
            }
            if (gameData.p2 !== 'AI' && gameData.p2 !== client_name) {
                player2Name = gameData.p2 || player2Name
            }
            document.dispatchEvent(namesEvent);
            gameData = null;
            return;
        }


        if (gameData.ball.lastTouch === "1" && !p1Touched && gameData.goal === 'None') {
            increasePlayer1Light = true;
            p1Touched = true;
            shakeCamera = 10;
        }
        if (gameData.ball.lastTouch === "2" && !p2Touched && gameData.goal === 'None') {
            increasePlayer2Light = true;
            p2Touched = true;
            shakeCamera = 10;
        }
        if (gameData.ball.lastTouch === "1") {
            t += 0.025;
            p2Touched = false;
            transitionColor.lerpColors(transitionColor, player1Mesh.material.color, t)
            cylinderMesh.material.color = transitionColor;
            cylinderMesh.material.emissive = transitionColor;
            ballLight.color = transitionColor;
        } else if (gameData.ball.lastTouch === "2") {
            t += 0.025;
            p1Touched = false;
            transitionColor.lerpColors(transitionColor, player2Mesh.material.color, t)
            cylinderMesh.material.color = transitionColor;
            cylinderMesh.material.emissive = transitionColor;
            ballLight.color = transitionColor;
        }
        if (t > 1) {
            t = 0;
        }
        if (increasePlayer1Light) {
            player1Light.intensity += gameData.ball.speed * 5;
            player1Mesh.material.emissiveIntensity += gameData.ball.speed * 0.5;
            if (player1Light.intensity >= 30) {
                increasePlayer1Light = false;
                decreasePlayer1Light = true;
            }
        } else if (decreasePlayer1Light) {
            player1Light.intensity -= gameData.ball.speed * 5;
            player1Mesh.material.emissiveIntensity -= gameData.ball.speed * 0.5;
            if (player1Light.intensity <= 10) {
                decreasePlayer1Light = false;
            }
        }
        if (increasePlayer2Light) {
            player2Light.intensity += gameData.ball.speed * 5;
            player2Mesh.material.emissiveIntensity += gameData.ball.speed * 0.5;
            if (player2Light.intensity >= 30) {
                increasePlayer2Light = false;
                decreasePlayer2Light = true;
            }
        } else if (decreasePlayer2Light) {
            player2Light.intensity -= gameData.ball.speed * 5;
            player2Mesh.material.emissiveIntensity -= gameData.ball.speed * 0.5;
            if (player2Light.intensity <= 10) {
                decreasePlayer2Light = false;
            }
        }
        player1Mesh.position.x = ((10 * gameData.paddle1.y) - 5) * -1;
        player1Light.position.copy(player1Mesh.position);
        player1Light.position.z -= 0.05;
        player2Mesh.position.x = ((10 * gameData.paddle2.y) - 5) * -1;
        player2Light.position.copy(player2Mesh.position);
        player2Light.position.z += 0.05;
        if (gameState !== gameStateEnum.GOAL) {
            cylinderMesh.position.x = ((10 * gameData.ball.y) - 5) * -1;
            cylinderMesh.position.z = (15 * gameData.ball.x) - 7.5;
            ballLight.position.copy(cylinderMesh.position);
        }
        if (gameData.goal !== "None") {
            if (gameData.goal === '1') {
                if (gameState === gameStateEnum.IN_GAME) {
                    if (cylinderMesh.position.x + 5 < 9.75 && gameData.ball.speed > 0.45) {
                        if (borderData[(round05(cylinderMesh.position.x + 5) * 2) + 20].getHit() === false) {
                            borderData[(round05(cylinderMesh.position.x + 5) * 2) + 20].setHit(true);
                            borderData[(round05(cylinderMesh.position.x + 5) * 2) + 20].setSideHit(cylinderMesh.position.x + 5);
                            borderData[(round05(cylinderMesh.position.x + 5) * 2) + 20].calculateSpeed(gameData.ball.speed);
                            wallHit = true;
                        }
                    }
                    else if (borderData[39].getHit() === false && gameData.ball.speed > 0.45) {
                        borderData[39].setHit(true);
                        borderData[39].setSideHit(cylinderMesh.position.x + 5);
                        borderData[39].calculateSpeed(gameData.ball.speed);
                        wallHit = true;
                    }
                    else {
                        wallHit = false;
                    }
                }
                ejectBallRight = true;
                ejectBallLeft = false;
                p1Touched = false;
                p2Touched = false;
            } else if (gameData.goal === '2') {
                if (gameState === gameStateEnum.IN_GAME) {
                    if (cylinderMesh.position.x + 5 < 9.75 && gameData.ball.speed > 0.45) {
                        if (borderData[round05(cylinderMesh.position.x + 5) * 2].getHit() === false) {
                            borderData[round05(cylinderMesh.position.x + 5) * 2].setHit(true);
                            borderData[round05(cylinderMesh.position.x + 5) * 2].setSideHit(cylinderMesh.position.x + 5);
                            borderData[round05(cylinderMesh.position.x + 5) * 2].calculateSpeed(gameData.ball.speed);
                            wallHit = true;
                        }
                    }
                    else if (borderData[19].getHit() === false && gameData.ball.speed > 0.45) {
                        borderData[19].setHit(true);
                        borderData[19].setSideHit(cylinderMesh.position.x + 5);
                        borderData[19].calculateSpeed(gameData.ball.speed);
                        wallHit = true;
                    }
                    else {
                        wallHit = false;
                    }
                }
                ejectBallLeft = true;
                ejectBallRight = false;
                p1Touched = false;
                p2Touched = false;
            }
            if (gameData.goal !== oldGameData.goal) {
                ejectSpeed = gameData.ball.speed;
                ejectVectorX = lastBallPos.x - cylinderMesh.position.x;
                ejectedBallMesh.material = cylinderMesh.material.clone();
                ejectedBallLight = ballLight.clone();
                ejectedBallMesh.position.copy(cylinderMesh.position);
                ejectedBallLight.position.copy(ejectedBallMesh);
                shakeCamera = 20;
            }
        }
        if (ejectBallRight) {
            ejectedBallMesh.position.z += ejectSpeed * 0.09;
            ejectedBallMesh.position.x -= ejectVectorX * 0.45;
            if (wallHit) {
                ejectedBallMesh.position.y += 0.01;
                ejectedBallMesh.rotation.x += ejectSpeed * 0.1;
            }
            ejectedBallMesh.material.emissiveIntensity -= 0.02;
            ejectedBallLight.position.copy(ejectedBallMesh.position);
        }
        if (ejectBallLeft) {
            ejectedBallMesh.position.z -= ejectSpeed * 0.09;
            ejectedBallMesh.position.x -= ejectVectorX * 0.45;
            if (wallHit) {
                ejectedBallMesh.position.y += 0.01;
                ejectedBallMesh.rotation.x -= ejectSpeed * 0.1;
            }
            ejectedBallMesh.material.emissiveIntensity -= 0.02;
            ejectedBallLight.position.copy(ejectedBallMesh.position);
        }
    }
    lastBallPos.copy(cylinderMesh.position);
    oldGameData = gameData;

    if (gameData || isGameOver) {
        if (ejectBallRight) {
            ejectedBallMesh.position.z += ejectSpeed * 0.2;
            ejectedBallMesh.position.x -= ejectVectorX * 0.45;
            if (wallHit) {
                ejectedBallMesh.position.y += 0.01;
                ejectedBallMesh.rotation.x += ejectSpeed * 0.1;
            }
            ejectedBallMesh.material.emissiveIntensity -= 0.02;
            ejectedBallLight.position.copy(ejectedBallMesh.position);
        }
        if (ejectBallLeft) {
            ejectedBallMesh.position.z -= ejectSpeed * 0.2;
            ejectedBallMesh.position.x -= ejectVectorX * 0.45;
            if (wallHit) {
                ejectedBallMesh.position.y += 0.01;
                ejectedBallMesh.rotation.x -= ejectSpeed * 0.1;
            }
            ejectedBallMesh.material.emissiveIntensity -= 0.02;
            ejectedBallLight.position.copy(ejectedBallMesh.position);
        }
    }
    lastBallPos.copy(cylinderMesh.position);
    oldGameData = gameData;
}

async function cameraTransition() {
    if (movingToTerrain) {
        positionTarget = terrainPos;

        if (camera.position.distanceTo(positionTarget) < 0.5) {
            movingToTerrain = false;
            moveProgress = 0.0001;
            transShaker = 0.0001;
            gameState = gameStateEnum.IN_GAME;
            controls.maxDistance = 100;
            controls.enabled = true;
            if (tournamentB === false) {
                displayPlayerNames(player1Name, player2Name);
            }
            sendMessage(startMessage);
            InputHandler.getInstance().activate();
        } else {
            camera.position.lerp(positionTarget, moveProgress);
            camera.rotation.x += transShaker * (Math.random() - 0.5);
            camera.rotation.y += transShaker * (Math.random() - 0.5);
            camera.rotation.z += transShaker * (Math.random() - 0.5);
        }
        if (camera.position.distanceTo(positionTarget) > 100) {
            if (moveProgress < 0.025) {
                moveProgress += 0.0003;
            }
            if (transShaker < 0.005) {
                transShaker += 0.0005;
            }
        } else {
            if (moveProgress > 0) {
                moveProgress -= 0.00003;
            }
            if (transShaker > 0) {
                transShaker -= 0.00005;
            }
        }
    } else if (movingToMainMenu) {
        positionTarget = mainMenuPos;
        if (controls.maxDistance !== Infinity) {
            controls.maxDistance = Infinity;
        }
        if (camera.position.distanceTo(positionTarget) < 550000) {
            movingToMainMenu = false;
            gameState = gameStateEnum.MAIN_MENU;
            resetTerrain();
        } else {
            camera.position.lerp(positionTarget, 0.02);
        }
    }
}

function goalAnimation(scorer) {
    cylinderMesh.visible = false;
    ballLight.intensity = 0;
    if (increaseBorderLight) {
        tBorder += 0.025;
        if (scorer === '1') {
            if (gameData.paddle1.score !== score1) {
                updateTextMesh(gameData.paddle1.score.toString(), textMesh);
                score1 = gameData.paddle1.score;
                if (score1 > 9) {
                    textMesh.position.z = -7;
                }
            }
            transitionBorderColor.lerpColors(transitionBorderColor, player1Mesh.material.color, tBorder);
        }
        else if (scorer === '2') {
            if (gameData.paddle2.score !== score2) {
                updateTextMesh(gameData.paddle2.score.toString(), textMesh2);
                score2 = gameData.paddle2.score;
                if (score2 > 9) {
                    textMesh2.position.z = 0.5;
                }
            }
            transitionBorderColor.lerpColors(transitionBorderColor, player2Mesh.material.color, tBorder);
        }
        topHorizontalBorderLight.color = transitionBorderColor;
        bottomHorizontalBorderLight.color = transitionBorderColor;
        borderMaterial.color = transitionBorderColor;
        borderLightIntensity += 0.10;
        topHorizontalBorderLight.intensity = borderLightIntensity;
        bottomHorizontalBorderLight.intensity = borderLightIntensity;
        if (textMesh.material.opacity < 1) {
            textMesh.material.opacity += 0.015;
            textMesh2.material.opacity += 0.015;
            textMesh.position.y = 0.03;
            textMesh2.position.y = 0.03;
        }
        if (borderLightIntensity >= 15) {
            increaseBorderLight = false;
            decreaseBorderLight = true;
            cylinderMesh.material.opacity = 0;
            cylinderMesh.position.x = 0;
            cylinderMesh.position.z = 0;
            ballLight.position.x = 0;
            ballLight.position.z = 0;
            tBorder = 0;
        }
    }
    else if (decreaseBorderLight) {
        cylinderMesh.visible = true;
        borderLightIntensity -= 0.2;
        tBorder += 0.001;
        cylinderMesh.material.opacity += 0.015;
        ballLight.intensity += 0.01;
        transitionBorderColor.lerpColors(transitionBorderColor, whiteColor, tBorder);
        topHorizontalBorderLight.color = transitionBorderColor;
        bottomHorizontalBorderLight.color = transitionBorderColor;
        borderMaterial.color = transitionBorderColor;
        topHorizontalBorderLight.intensity = borderLightIntensity;
        bottomHorizontalBorderLight.intensity = borderLightIntensity;
        if (textMesh.material.opacity > 0.1) {
            textMesh.material.opacity -= 0.02;
            textMesh2.material.opacity -= 0.02;
        }
        else {
            textMesh.position.y = 1000;
            textMesh2.position.y = 1000;
        }
        if (borderLightIntensity <= 5) {
            topHorizontalBorderLight.color = whiteColor;
            bottomHorizontalBorderLight.color = whiteColor;
            cylinderMesh.material.opacity = 1;
            ballLight.intensity = 0.5;
            increaseBorderLight = true;
            decreaseBorderLight = false;
            gameState = gameStateEnum.IN_GAME;
            sendMessage(resumeGoalMessage);
            waitingForBack = true;
        }
    }
    if (tBorder > 1) {
        tBorder = 0;
    }
}

function makeGroups() {
    terrainGroup.add(terrainMesh);
    terrainGroup.add(topHorizontalBorderMesh);
    terrainGroup.add(bottomHorizontalBorderMesh);
    terrainGroup.add(centralBorderMesh);
    terrainGroup.add(topHorizontalBorderLight);
    terrainGroup.add(bottomHorizontalBorderLight);
    terrainGroup.add(player1Mesh);
    terrainGroup.add(player2Mesh);
    terrainGroup.add(player1Light);
    terrainGroup.add(player2Light);
    terrainGroup.add(cylinderMesh);
    terrainGroup.add(ballLight);
    terrainGroup.add(ejectedBallMesh);
    terrainGroup.add(ejectedBallLight);

    sunGroup.add(sunLight);
    sunGroup.add(sphere);

    earthGroup.add(earthMesh);
    earthGroup.add(cloudsMesh);
    earthGroup.add(atmosphereMesh);
}

function renderFrame() {
    rotateTerrain();
    rotateMoon();
    rotateEarth();
    if (iss) {
        rotateISS();
    }
    updateGame();
    checkBorders();
    lightIntensity();
    if (gameData && gameData.playing && waitingForBack) {
        waitingForBack = false;
    }
    if (gameData && gameData.gameover !== null) {
        gameOver(gameData.winner, gameData.game_mode);
    }
    if (gameData && gameData.goal !== 'None' && !waitingForBack) {
        gameState = gameStateEnum.GOAL;
        goalAnimation(gameData.goal);
    }
    if (shakeCamera && gameData && !gameData.gameover && gameState === gameStateEnum.IN_GAME) {
        cameraShaker(gameData.ball.speed * 0.01);
    }
    cameraTransition();
    composer.render();
    InputHandler.getInstance().sendActiveInputs();
    requestAnimationFrame(renderFrame);
}

export async function resetGame() {
    if (gameState === gameStateEnum.MAIN_MENU && !movingToTerrain && !movingToMainMenu) {
        return;
    }
    // Clean up WebSocket connection
    if (socket && socket.readyState === WebSocket.OPEN) {
        await socket.send(JSON.stringify({
            type: 'disconnect',
            sender: 'front'
        }));
        socket.onmessage = null;
        socket.onclose = null;
        socket.close();
        socket = null;
    }

    sideG = 0;
    tournamentB = false;
    player1Name = "Joueur 1";
    player2Name = "Joueur 2";

    // gameModeG = null;


    // Reset game states only if they're different
    if (isGameOver || gamePause || waitingForBack) {
        isGameOver = false;
        gamePause = false;
        waitingForBack = false;
    }

    if (score1 !== 0 || score2 !== 0) {
        score1 = 0;
        score2 = 0;
    }

    if (gameData || oldGameData) {
        gameData = null;
        oldGameData = null;
    }

    // Reset text meshes only if they're different
    if (textMesh.position.y !== 1000) {
        updateTextMesh("0", textMesh);
        textMesh.position.y = 1000;
    }
    if (textMesh2.position.y !== 1000) {
        updateTextMesh("0", textMesh2);
        textMesh2.position.y = 1000;
    }

    // Reset controls and camera only if needed
    controls.enabled = false;
    movingToMainMenu = true;
    movingToTerrain = false;
    moveProgress = 0.0001;
    transShaker = 0.0001;
    InputHandler.getInstance().deactivate();
    blackBarTop.style.animation = 'barSlideOut 1s forwards';
    blackBarBottom.style.animation = 'barSlideOut 1s forwards';

    resetTerrain();

    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            if (gameState === gameStateEnum.MAIN_MENU && !movingToTerrain && !movingToMainMenu) {
                clearInterval(interval);
                try {
                    const menu = document.querySelector('#main-menu');
                    if (!menu) {
                        throw new Error('Menu principal introuvable');
                    }
                    menu.style.transition = "opacity 1s ease-in-out";
                    menu.style.transitionDelay = "0s";
                    menu.style.display = 'flex';
                    menu.offsetHeight;
                    menu.classList.add('visible');
                } catch (error) {
                    console.log('Error toggling main menu:', error);
                }
                resolve();
                document.addEventListener("click", handleOutsideClick);
            }
        }, 200);
    });
}

export async function ErrorInGame() {
    isGameOver = true;

    // Fermer proprement le socket
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
        socket = null;
    }

    // Ne pas mettre gameData à null tout de suite
    oldGameData = gameData;

    return new Promise(async (resolve) => {
        isGameOver = false;

        updateTextMesh("0", textMesh);
        updateTextMesh("0", textMesh2);

        zoomOutGame();
        gameState = gameStateEnum.MAIN_MENU;
        if (!document.getElementById('main-menu').classList.contains('visible')) toggleMenu();
        urlChange(null, '/home');
        document.addEventListener("click", handleOutsideClick);

        gameData = null;
        oldGameData = null;
        score1 = 0;
        score2 = 0;

        await sleep(2000);

        // Reinitialiser les paddles et de la balle
        player1Mesh.position.set(0, 0.005, -7);
        player2Mesh.position.set(0, 0.005, 7);
        cylinderMesh.position.set(0, 0.025, 0);
        ejectedBallMesh.visible = false;
        ejectedBallLight.visible = false;

        player1Light.position.copy(player1Mesh.position);
        player2Light.position.copy(player2Mesh.position);
        ballLight.position.copy(cylinderMesh.position);

        resolve();
    });
}

// MAIN

export async function gameLoop() {
    makeTerrain();
    makeGroups();
    scene.add(sunGroup);
    await renderLoadingScreen(0.2);
    scene.add(ambientLight);
    scene.add(stars);
    scene.add(earthGroup);
    scene.add(sunLight);
    await renderLoadingScreen(0.6);
    scene.add(moonMesh);
    scene.add(terrainGroup);
    await renderLoadingScreen(0.8);
    await loadModels();
    await renderLoadingScreen(1.0);

    document.body.appendChild(renderer.domElement);
    renderFrame();
}
