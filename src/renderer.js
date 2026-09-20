// src/renderer.js
import * as THREE from 'three';

// Procedural helpers to generate canvas texture maps at runtime (zero-asset design)
function createGlowTexture(colorStr) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, colorStr);
    grad.addColorStop(0.3, colorStr.replace('1)', '0.5)'));
    grad.addColorStop(0.6, colorStr.replace('1)', '0.1)'));
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

function createAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111113';
    ctx.fillRect(0, 0, 128, 128);
    // Draw fine asphalt grain noise
    for (let i = 0; i < 3000; i++) {
        const x = Math.random() * 128;
        const y = Math.random() * 128;
        const size = Math.random() * 1.5;
        const shade = Math.floor(Math.random() * 20) + 12;
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade + 2}, 0.22)`;
        ctx.fillRect(x, y, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
    return texture;
}

function createCurbStripeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffbe00'; // Vibrant retro caution yellow
    ctx.fillRect(0, 0, 64, 16);
    ctx.fillStyle = '#18181b'; // Carbon dark grey
    // Draw diagonal warnings stripes
    for (let i = 0; i < 64; i += 16) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 8, 0);
        ctx.lineTo(i + 16, 16);
        ctx.lineTo(i + 8, 16);
        ctx.closePath();
        ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(13, 1);
    return texture;
}

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;

        // A. Setup WebGL Context
        this.webGLRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.webGLRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.webGLRenderer.setSize(canvas.clientWidth, canvas.clientHeight);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x040407);

        // B. Setup Camera
        this.camera = new THREE.PerspectiveCamera(46, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
        this.camera.position.set(0, 9.0, 18.0);

        // Reusable structures for performance
        this.dummy = new THREE.Object3D();
        this.tempVector = new THREE.Vector3();
        this.prevPlayerZ = 12;

        this.glowCyan = createGlowTexture('rgba(0, 240, 255, 1)');
        this.glowPink = createGlowTexture('rgba(255, 0, 127, 1)');
        this.glowOrange = createGlowTexture('rgba(255, 120, 0, 1)');

        // Screen Shake properties
        this.screenShakeIntensity = 0.0;
        this.hasTriggeredShake = false;

        // C. Populate Scene Elements
        this.initLights();
        this.initEnvironment();
        this.initPlayer();
        this.initPortals();
        this.initInstancedMeshes();
        this.initParticlePool();

        // Screen resize observer
        window.addEventListener('resize', () => this.handleResize());
    }

    initLights() {
        const ambient = new THREE.AmbientLight(0x0e0e1a);
        this.scene.add(ambient);

        const directional = new THREE.DirectionalLight(0x00f0ff, 1.4);
        directional.position.set(6, 14, 8);
        this.scene.add(directional);

        const backlight = new THREE.DirectionalLight(0xff007f, 1.0);
        backlight.position.set(-6, 8, -8);
        this.scene.add(backlight);
    }

    initEnvironment() {
        // Glowing cyan wireframe grid representing retro synthwave ground
        this.gridHelper = new THREE.GridHelper(30, 30, 0x00f0ff, 0x142838);
        this.gridHelper.position.set(0, -0.01, 6);
        this.gridHelper.material.opacity = 0.16;
        this.gridHelper.material.transparent = true;
        this.scene.add(this.gridHelper);

        // 1. Authentic Asphalt Road Surface
        const roadGeo = new THREE.BoxGeometry(13, 0.08, 5);
        const roadMat = new THREE.MeshStandardMaterial({
            color: 0x18181c,
            map: createAsphaltTexture(),
            roughness: 0.9,
            metalness: 0.05
        });
        
        // Highway asphalt road lanes (Z = 7 to 11)
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.position.set(0, -0.04, 9);
        this.scene.add(road);

        // 2. Concrete Curb Hazards with Caution Stripes
        const curbGeo = new THREE.BoxGeometry(13, 0.22, 0.25);
        const curbMat = new THREE.MeshStandardMaterial({
            map: createCurbStripeTexture(),
            roughness: 0.8,
            metalness: 0.1
        });

        // Curbs splitting start-road and road-rest junction
        const curb1 = new THREE.Mesh(curbGeo, curbMat);
        curb1.position.set(0, 0.07, 11.6);
        this.scene.add(curb1);

        const curb2 = new THREE.Mesh(curbGeo, curbMat.clone());
        curb2.position.set(0, 0.07, 6.4);
        this.scene.add(curb2);

        // 3. Lane Divider Dashed Lines
        const dashGeo = new THREE.BoxGeometry(0.3, 0.005, 0.08);
        const dashMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, opacity: 0.8, transparent: true });
        this.dashedLines = [];
        const laneZs = [8, 9, 10, 11];
        for (const lZ of laneZs) {
            for (let xPos = -6; xPos <= 6; xPos += 1.5) {
                const dash = new THREE.Mesh(dashGeo, dashMat);
                dash.position.set(xPos, 0.005, lZ - 0.5);
                this.scene.add(dash);
                this.dashedLines.push(dash);
            }
        }

        // 4. Side Skyline Monoliths (Framing background skyscrapers)
        const towerGeo = new THREE.BoxGeometry(1.5, 10.0, 1.5);
        const towerMat = new THREE.MeshStandardMaterial({
            color: 0x07070b,
            roughness: 0.9,
            metalness: 0.9,
            flatShading: true
        });
        const edgeWindowMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.6 });

        this.towers = [];
        // Place skyscrapers at X = -7.5 and X = 7.5 down the road sides
        const towerPositions = [
            { x: -7.5, z: 1 }, { x: -7.5, z: 4 }, { x: -7.5, z: 7 }, { x: -7.5, z: 10 },
            { x: 7.5, z: 1 }, { x: 7.5, z: 4 }, { x: 7.5, z: 7 }, { x: 7.5, z: 10 }
        ];

        towerPositions.forEach(t => {
            const h = 4.0 + Math.random() * 6.0;
            const tower = new THREE.Mesh(towerGeo, towerMat);
            tower.scale.set(1.0, h / 10.0, 1.0);
            tower.position.set(t.x, h / 2 - 0.1, t.z);
            this.scene.add(tower);
            this.towers.push(tower);

            // Add simple glowing window outlines
            const decGeo = new THREE.BoxGeometry(1.52, 0.12, 1.52);
            const dec = new THREE.Mesh(decGeo, edgeWindowMat);
            dec.position.set(t.x, h - 0.6, t.z);
            this.scene.add(dec);
        });
    }

    initPlayer() {
        // Group hierarchy assembling a Cute, Detailed 3D Frog
        this.playerMesh = new THREE.Group();
        this.playerMesh.position.set(0, 0.35, 12);
        this.scene.add(this.playerMesh);

        const greenMat = new THREE.MeshStandardMaterial({
            color: 0x27ae60, // Realistic Frog Green
            roughness: 0.4,
            metalness: 0.15,
            flatShading: true
        });
        const yellowMat = new THREE.MeshStandardMaterial({
            color: 0xf1c40f, // Pale Chest belly
            roughness: 0.6,
            metalness: 0.05
        });
        const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
        const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0e });
        const metalNozzleMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.8, roughness: 0.2 });

        // A. Torso Body
        const torsoGeo = new THREE.DodecahedronGeometry(0.3, 1);
        torsoGeo.scale(1.2, 0.85, 1.25);
        const torso = new THREE.Mesh(torsoGeo, greenMat);
        torso.position.y = 0.05;
        this.playerMesh.add(torso);

        // B. Underbelly yellow plate
        const bellyGeo = new THREE.SphereGeometry(0.2, 8, 8);
        bellyGeo.scale(0.9, 0.55, 1.1);
        const belly = new THREE.Mesh(bellyGeo, yellowMat);
        belly.position.set(0, -0.05, 0.08);
        this.playerMesh.add(belly);

        // C. Head
        const headGeo = new THREE.DodecahedronGeometry(0.22, 1);
        headGeo.scale(1.15, 0.8, 1.15);
        const head = new THREE.Mesh(headGeo, greenMat);
        head.position.set(0, 0.18, -0.12);
        this.playerMesh.add(head);

        // D. Bulging Frog Eyes (Large Yellow Spheres + Black Pupils)
        const eyeSocketGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeBallGeo = new THREE.SphereGeometry(0.065, 8, 8);
        const pupilGeo = new THREE.SphereGeometry(0.035, 8, 8);
        pupilGeo.scale(1, 1, 0.4);

        // Left Eye Assembly
        const leftSocket = new THREE.Mesh(eyeSocketGeo, greenMat);
        leftSocket.position.set(-0.13, 0.28, -0.18);
        this.playerMesh.add(leftSocket);

        const leftBall = new THREE.Mesh(eyeBallGeo, eyeWhiteMat);
        leftBall.position.set(-0.13, 0.3, -0.22);
        this.playerMesh.add(leftBall);

        const leftPupil = new THREE.Mesh(pupilGeo, eyePupilMat);
        leftPupil.position.set(-0.13, 0.31, -0.28);
        leftPupil.rotation.x = Math.PI / 10;
        this.playerMesh.add(leftPupil);

        // Right Eye Assembly
        const rightSocket = new THREE.Mesh(eyeSocketGeo, greenMat);
        rightSocket.position.set(0.13, 0.28, -0.18);
        this.playerMesh.add(rightSocket);

        const rightBall = new THREE.Mesh(eyeBallGeo, eyeWhiteMat);
        rightBall.position.set(0.13, 0.3, -0.22);
        this.playerMesh.add(rightBall);

        const rightPupil = new THREE.Mesh(pupilGeo, eyePupilMat);
        rightPupil.position.set(0.13, 0.31, -0.28);
        rightPupil.rotation.x = Math.PI / 10;
        this.playerMesh.add(rightPupil);

        // E. Folded Crouching Hind Legs
        const thighGeo = new THREE.BoxGeometry(0.12, 0.22, 0.3);
        const footGeo = new THREE.BoxGeometry(0.08, 0.04, 0.16);

        // Left Hind Leg
        const leftThigh = new THREE.Mesh(thighGeo, greenMat);
        leftThigh.position.set(-0.25, -0.02, 0.12);
        leftThigh.rotation.set(0.15, 0.2, -0.35);
        this.playerMesh.add(leftThigh);

        const leftFoot = new THREE.Mesh(footGeo, greenMat);
        leftFoot.position.set(-0.26, -0.12, 0.18);
        leftFoot.rotation.y = 0.2;
        this.playerMesh.add(leftFoot);

        // Right Hind Leg
        const rightThigh = new THREE.Mesh(thighGeo, greenMat);
        rightThigh.position.set(0.25, -0.02, 0.12);
        rightThigh.rotation.set(0.15, -0.2, 0.35);
        this.playerMesh.add(rightThigh);

        const rightFoot = new THREE.Mesh(footGeo, greenMat);
        rightFoot.position.set(0.26, -0.12, 0.18);
        rightFoot.rotation.y = -0.2;
        this.playerMesh.add(rightFoot);

        // F. Front Legs
        const frontLegGeo = new THREE.BoxGeometry(0.08, 0.18, 0.08);
        const leftFrontLeg = new THREE.Mesh(frontLegGeo, greenMat);
        leftFrontLeg.position.set(-0.16, -0.07, -0.2);
        leftFrontLeg.rotation.set(-0.15, 0.05, 0.05);
        this.playerMesh.add(leftFrontLeg);

        const rightFrontLeg = new THREE.Mesh(frontLegGeo, greenMat);
        rightFrontLeg.position.set(0.16, -0.07, -0.2);
        rightFrontLeg.rotation.set(-0.15, -0.05, -0.05);
        this.playerMesh.add(rightFrontLeg);

        // G. Mini Thruster Ports on Back (Nozzles)
        const nozzleGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.06, 8);
        const nozzleL = new THREE.Mesh(nozzleGeo, metalNozzleMat);
        nozzleL.position.set(-0.12, -0.1, 0.1);
        nozzleL.rotation.x = Math.PI / 6;
        this.playerMesh.add(nozzleL);

        const nozzleR = new THREE.Mesh(nozzleGeo, metalNozzleMat);
        nozzleR.position.set(0.12, -0.1, 0.1);
        nozzleR.rotation.x = Math.PI / 6;
        this.playerMesh.add(nozzleR);

        // Splash highlight under the player
        const splashGeom = new THREE.PlaneGeometry(1.6, 1.6);
        const splashMat = new THREE.MeshBasicMaterial({
            map: createGlowTexture('rgba(40, 220, 40, 1)'),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.playerSplash = new THREE.Mesh(splashGeom, splashMat);
        this.playerSplash.rotation.x = -Math.PI / 2;
        this.playerSplash.position.set(0, 0.015, 12);
        this.scene.add(this.playerSplash);
    }

    initPortals() {
        const archGeom = new THREE.TorusGeometry(0.5, 0.08, 12, 32, Math.PI);
        this.portalMeshes = [];
        const xs = [-4, -2, 0, 2, 4];
        xs.forEach(xPos => {
            const mat = new THREE.MeshStandardMaterial({
                color: 0x00f0ff,
                emissive: 0x00f0ff,
                emissiveIntensity: 0.5
            });
            const arch = new THREE.Mesh(archGeom, mat);
            arch.position.set(xPos, 0, 0);
            this.scene.add(arch);
            this.portalMeshes.push(arch);
        });
    }

    initInstancedMeshes() {
        const maxCars = 15;
        const maxTrucks = 5;
        const maxLogs = 15;

        // Synchronized sub-components for Sports Cars
        const carBodyGeo = new THREE.BoxGeometry(1.6, 0.22, 0.8);
        const carBodyMat = new THREE.MeshStandardMaterial({
            color: 0xff0044, // Vibrant Red Body
            roughness: 0.25,
            metalness: 0.7,
            flatShading: true
        });
        this.instancedCarsChassis = new THREE.InstancedMesh(carBodyGeo, carBodyMat, maxCars);
        this.scene.add(this.instancedCarsChassis);

        const carCabinGeo = new THREE.BoxGeometry(0.7, 0.2, 0.65);
        const carCabinMat = new THREE.MeshStandardMaterial({
            color: 0x00f0ff, // Translucent Cyan Windshield Canopy
            roughness: 0.1,
            metalness: 0.9,
            transparent: true,
            opacity: 0.75
        });
        this.instancedCarsCabin = new THREE.InstancedMesh(carCabinGeo, carCabinMat, maxCars);
        this.scene.add(this.instancedCarsCabin);

        const carWheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8);
        carWheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({
            color: 0x1f1f23, // Black Rubber Tires
            roughness: 0.75,
            metalness: 0.4
        });
        this.instancedCarsWheels = new THREE.InstancedMesh(carWheelGeo, wheelMat, maxCars * 4);
        this.scene.add(this.instancedCarsWheels);

        // Synchronized sub-components for Cargo Heavy Trucks
        const truckCabGeo = new THREE.BoxGeometry(0.75, 0.8, 0.85);
        const truckCabMat = new THREE.MeshStandardMaterial({
            color: 0x9400d3, // Purple tractor cab
            roughness: 0.3,
            metalness: 0.6,
            flatShading: true
        });
        this.instancedTrucksCab = new THREE.InstancedMesh(truckCabGeo, truckCabMat, maxTrucks);
        this.scene.add(this.instancedTrucksCab);

        const truckTrailerGeo = new THREE.BoxGeometry(2.1, 0.85, 0.95);
        const truckTrailerMat = new THREE.MeshStandardMaterial({
            color: 0x222226, // Textured metal cargo trailer
            roughness: 0.45,
            metalness: 0.8,
            flatShading: true
        });
        this.instancedTrucksTrailer = new THREE.InstancedMesh(truckTrailerGeo, truckTrailerMat, maxTrucks);
        this.scene.add(this.instancedTrucksTrailer);

        const grilGeo = new THREE.BoxGeometry(0.04, 0.4, 0.65);
        const grilMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.1 });
        this.instancedTrucksGrille = new THREE.InstancedMesh(grilGeo, grilMat, maxTrucks);
        this.scene.add(this.instancedTrucksGrille);

        this.instancedTrucksWheels = new THREE.InstancedMesh(carWheelGeo, wheelMat, maxTrucks * 6);
        this.scene.add(this.instancedTrucksWheels);

        // 3. Binary Hover streams (Hover-platforms)
        const logBaseGeo = new THREE.BoxGeometry(1.0, 0.08, 0.8);
        const logBaseMat = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            roughness: 0.15,
            metalness: 0.85,
            transparent: true,
            opacity: 0.65
        });
        this.instancedLogs = new THREE.InstancedMesh(logBaseGeo, logBaseMat, maxLogs);
        this.scene.add(this.instancedLogs);

        // 4. Zero-Lighting Additive Glowing Billboards
        const glowGeo = new THREE.PlaneGeometry(3.0, 3.0);
        const glowMat = new THREE.MeshBasicMaterial({
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.glowCarsInst = new THREE.InstancedMesh(glowGeo, glowMat.clone(), maxCars + maxTrucks);
        this.glowCarsInst.material.map = this.glowPink;
        this.scene.add(this.glowCarsInst);

        this.glowLogsInst = new THREE.InstancedMesh(glowGeo, glowMat.clone(), maxLogs);
        this.glowLogsInst.material.map = this.glowCyan;
        this.scene.add(this.glowLogsInst);

        // Set dynamic usage
        this.instancedCarsChassis.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedCarsCabin.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedCarsWheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedTrucksCab.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedTrucksTrailer.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedTrucksGrille.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedTrucksWheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedLogs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.glowCarsInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.glowLogsInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }

    initParticlePool() {
        // Zero-Allocation pre-allocated Particle Pool
        this.maxParticles = 120;
        this.particles = [];
        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push({
                active: false,
                x: 0,
                y: 0,
                z: 0,
                vx: 0,
                vy: 0,
                vz: 0,
                colorType: 'pink', // 'pink', 'cyan', 'orange'
                size: 1.0,
                age: 0,
                maxAge: 1.0
            });
        }

        const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        const particleMat = new THREE.MeshBasicMaterial({
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.instancedParticles = new THREE.InstancedMesh(particleGeo, particleMat, this.maxParticles);
        this.scene.add(this.instancedParticles);
        this.instancedParticles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedParticles.count = 0;
    }

    spawnParticles(x, z, type, count = 15) {
        let spawned = 0;
        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.particles[i];
            if (!p.active) {
                p.active = true;
                p.x = x;
                p.z = z;
                p.age = 0;

                if (type === 'thruster') {
                    // Orange thrust flames shooting back
                    p.y = 0.25;
                    p.vx = (Math.random() - 0.5) * 0.5;
                    p.vy = -1.5 - Math.random() * 1.5;
                    p.vz = 2.0 + Math.random() * 2.0; // Shoot backward
                    p.colorType = 'orange';
                    p.maxAge = 0.25 + Math.random() * 0.2;
                    p.size = 0.6 + Math.random() * 0.5;
                } else if (type === 'crash') {
                    // Magenta laser explosion debris
                    p.y = 0.3 + (Math.random() - 0.5) * 0.3;
                    const theta = Math.random() * Math.PI * 2;
                    const speed = 2.0 + Math.random() * 4.0;
                    p.vx = Math.cos(theta) * speed;
                    p.vz = Math.sin(theta) * speed;
                    p.vy = 1.5 + Math.random() * 3.5;
                    p.colorType = 'pink';
                    p.maxAge = 0.5 + Math.random() * 0.4;
                    p.size = 1.0 + Math.random() * 1.0;
                } else if (type === 'drown') {
                    // Cyan ripples floating out
                    p.y = 0.02;
                    const theta = Math.random() * Math.PI * 2;
                    const speed = 0.8 + Math.random() * 1.2;
                    p.vx = Math.cos(theta) * speed;
                    p.vz = Math.sin(theta) * speed;
                    p.vy = 0;
                    p.colorType = 'cyan';
                    p.maxAge = 0.6 + Math.random() * 0.3;
                    p.size = 0.8 + Math.random() * 0.6;
                }

                spawned++;
                if (spawned >= count) break;
            }
        }
    }

    handleResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        this.webGLRenderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    render(game, alpha) {
        const dt = 1 / 60; // Approximate step

        // --- 1. GAMEPLAY TIMER HUD ELEMENT UPDATE ---
        const timerBar = document.getElementById('timer-bar');
        if (timerBar) {
            const timePct = Math.max(0, game.countdownTimer / 30) * 100;
            timerBar.style.width = `${timePct}%`;
            
            // Neon color warning shifts
            timerBar.className = '';
            if (game.countdownTimer <= 5) {
                timerBar.classList.add('critical');
            } else if (game.countdownTimer <= 10) {
                timerBar.classList.add('warning');
            }
        }

        // --- 2. RETRO CAMERA SCREEN SHAKE ---
        if (game.player.deathType !== null) {
            if (!this.hasTriggeredShake) {
                this.screenShakeIntensity = 0.38;
                this.hasTriggeredShake = true;
                
                // Spawn crash or drown particles once on death trigger
                const deathZ = game.player.currPosition.z;
                const deathX = game.player.currPosition.x;
                if (game.player.deathType === 'crash') {
                    this.spawnParticles(deathX, deathZ, 'crash', 35);
                } else if (game.player.deathType === 'drown') {
                    this.spawnParticles(deathX, deathZ, 'drown', 25);
                }
            }
        } else {
            this.hasTriggeredShake = false;
        }

        // --- 3. INTERPOLATE PLAYER TRANSFORMS ---
        const player = game.player;
        const renderX = player.prevPosition.x + (player.currPosition.x - player.prevPosition.x) * alpha;
        const renderZ = player.prevPosition.z + (player.currPosition.z - player.prevPosition.z) * alpha;
        let renderY = 0.35;
        let playerRotZ = 0;
        let playerRotY = 0;

        // Apply Hop height parabolas & squash-stretch scaling
        if (player.isHopping) {
            const p = player.hopProgress;
            renderY += Math.sin(p * Math.PI) * 0.55; 
            
            const scaleY = 1.0 + Math.sin(p * Math.PI) * 0.3;
            const scaleXZ = 1.0 - Math.sin(p * Math.PI) * 0.12;
            this.playerMesh.scale.set(scaleXZ, scaleY, scaleXZ);

            // Forward roll rotation
            playerRotZ = -Math.sin(p * Math.PI) * 0.15;

            // Emit thruster trails in mid-hop
            if (Math.random() < 0.25) {
                this.spawnParticles(renderX, renderZ, 'thruster', 1);
            }
        } else {
            this.playerMesh.scale.set(1, 1, 1);
            
            // Death state animations
            if (player.deathType === 'drown') {
                renderY -= 0.6 * Math.min(1, alpha * 2);
                this.playerMesh.scale.set(1 - alpha, 1 - alpha, 1 - alpha);
            } else if (player.deathType === 'crash') {
                this.playerMesh.scale.set(1 + alpha * 1.4, 0.12, 1 + alpha * 1.4);
                renderY = 0.08;
                playerRotY = alpha * Math.PI * 4;
            }
        }

        this.playerMesh.position.set(renderX, renderY, renderZ);
        this.playerMesh.rotation.z = playerRotZ;
        this.playerMesh.rotation.y = playerRotY;

        // Re-scale player outline splash
        const splashOpacity = player.isHopping ? 0.2 : 0.6;
        this.playerSplash.position.set(renderX, 0.015, renderZ);
        this.playerSplash.material.opacity = splashOpacity;

        // --- 4. UPDATE MULTI-PART INSTANCED VEHICLES & BILLBOARD REFLECTIONS ---
        let carIndex = 0;
        let truckIndex = 0;
        let wheelCarIndex = 0;
        let wheelTruckIndex = 0;
        let glowVehIndex = 0;
        let logIndex = 0;

        for (let i = 0; i < game.obstacles.length; i++) {
            const obs = game.obstacles[i];
            const obsX = obs.prevX + (obs.x - obs.prevX) * alpha;

            if (obs.type === 'car') {
                // A. Car Chassis
                this.dummy.position.set(obsX, 0.2, obs.laneZ);
                this.dummy.scale.set(1, 1, 1);
                this.dummy.rotation.set(0, 0, 0);
                this.dummy.updateMatrix();
                this.instancedCarsChassis.setMatrixAt(carIndex, this.dummy.matrix);

                // B. Car Windshield Cabin
                this.dummy.position.set(obsX + (obs.speed > 0 ? 0.2 : -0.2), 0.38, obs.laneZ);
                this.dummy.updateMatrix();
                this.instancedCarsCabin.setMatrixAt(carIndex, this.dummy.matrix);

                // C. Car Wheels (4 Wheels rotating in sync with X velocity)
                const wheelRot = -obsX * 3.5;
                const wheelsOffsets = [
                    { x: -0.45, z: 0.35 }, { x: 0.45, z: 0.35 },
                    { x: -0.45, z: -0.35 }, { x: 0.45, z: -0.35 }
                ];
                wheelsOffsets.forEach(w => {
                    this.dummy.position.set(obsX + w.x, 0.1, obs.laneZ + w.z);
                    this.dummy.rotation.set(0, 0, wheelRot);
                    this.dummy.updateMatrix();
                    this.instancedCarsWheels.setMatrixAt(wheelCarIndex++, this.dummy.matrix);
                });

                carIndex++;

                // D. Pink underglow billboard reflections
                this.dummy.position.set(obsX, 0.012, obs.laneZ);
                this.dummy.scale.set(obs.length * 1.1, 1.1, 1.0);
                this.dummy.rotation.set(-Math.PI / 2, 0, 0);
                this.dummy.updateMatrix();
                this.glowCarsInst.setMatrixAt(glowVehIndex++, this.dummy.matrix);

            } else if (obs.type === 'truck') {
                const isRight = obs.speed > 0;
                
                // A. Truck Cab Front
                const cabX = obsX + (isRight ? 1.0 : -1.0);
                this.dummy.position.set(cabX, 0.4, obs.laneZ);
                this.dummy.scale.set(1, 1, 1);
                this.dummy.rotation.set(0, 0, 0);
                this.dummy.updateMatrix();
                this.instancedTrucksCab.setMatrixAt(truckIndex, this.dummy.matrix);

                // B. Front Grille
                this.dummy.position.set(cabX + (isRight ? 0.38 : -0.38), 0.35, obs.laneZ);
                this.dummy.updateMatrix();
                this.instancedTrucksGrille.setMatrixAt(truckIndex, this.dummy.matrix);

                // C. Cargo Trailer Container
                const trailX = obsX - (isRight ? 0.35 : -0.35);
                this.dummy.position.set(trailX, 0.48, obs.laneZ);
                this.dummy.updateMatrix();
                this.instancedTrucksTrailer.setMatrixAt(truckIndex, this.dummy.matrix);

                // D. 6 Truck Tires rotating
                const wheelRot = -obsX * 3.0;
                const wheelsTruckOffsets = [
                    { x: -0.9, z: 0.42 }, { x: 0.1, z: 0.42 }, { x: 1.0, z: 0.42 },
                    { x: -0.9, z: -0.42 }, { x: 0.1, z: -0.42 }, { x: 1.0, z: -0.42 }
                ];
                wheelsTruckOffsets.forEach(w => {
                    this.dummy.position.set(obsX + w.x, 0.12, obs.laneZ + w.z);
                    this.dummy.rotation.set(0, 0, wheelRot);
                    this.dummy.updateMatrix();
                    this.instancedTrucksWheels.setMatrixAt(wheelTruckIndex++, this.dummy.matrix);
                });

                truckIndex++;

                // E. Pink underglow
                this.dummy.position.set(obsX, 0.012, obs.laneZ);
                this.dummy.scale.set(obs.length * 1.0, 1.1, 1.0);
                this.dummy.rotation.set(-Math.PI / 2, 0, 0);
                this.dummy.updateMatrix();
                this.glowCarsInst.setMatrixAt(glowVehIndex++, this.dummy.matrix);

            } else if (obs.type === 'log') {
                // Hover data raft platform
                this.dummy.position.set(obsX, 0.1, obs.laneZ);
                this.dummy.scale.set(obs.length, 1.0, 1.0);
                this.dummy.rotation.set(0, 0, 0);
                this.dummy.updateMatrix();
                this.instancedLogs.setMatrixAt(logIndex, this.dummy.matrix);

                // Hover glowing blue cyan billboard under raft
                this.dummy.position.y = 0.015;
                this.dummy.scale.set(obs.length * 1.2, 1.2, 1.0);
                this.dummy.rotation.set(-Math.PI / 2, 0, 0);
                this.dummy.updateMatrix();
                this.glowLogsInst.setMatrixAt(logIndex++, this.dummy.matrix);
            }
        }

        // Notify Three.js to push update vectors to the GPU buffers
        this.instancedCarsChassis.count = carIndex;
        this.instancedCarsChassis.instanceMatrix.needsUpdate = true;

        this.instancedCarsCabin.count = carIndex;
        this.instancedCarsCabin.instanceMatrix.needsUpdate = true;

        this.instancedCarsWheels.count = wheelCarIndex;
        this.instancedCarsWheels.instanceMatrix.needsUpdate = true;

        this.instancedTrucksCab.count = truckIndex;
        this.instancedTrucksCab.instanceMatrix.needsUpdate = true;

        this.instancedTrucksTrailer.count = truckIndex;
        this.instancedTrucksTrailer.instanceMatrix.needsUpdate = true;

        this.instancedTrucksGrille.count = truckIndex;
        this.instancedTrucksGrille.instanceMatrix.needsUpdate = true;

        this.instancedTrucksWheels.count = wheelTruckIndex;
        this.instancedTrucksWheels.instanceMatrix.needsUpdate = true;

        this.instancedLogs.count = logIndex;
        this.instancedLogs.instanceMatrix.needsUpdate = true;

        this.glowCarsInst.count = glowVehIndex;
        this.glowCarsInst.instanceMatrix.needsUpdate = true;

        this.glowLogsInst.count = logIndex;
        this.glowLogsInst.instanceMatrix.needsUpdate = true;

        // --- 5. UPDATE AND ANIME DYNAMIC PARTICLES ---
        let activePartIdx = 0;
        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.particles[i];
            if (p.active) {
                p.age += dt;
                if (p.age >= p.maxAge) {
                    p.active = false;
                    continue;
                }

                // Apply physics velocities
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.z += p.vz * dt;
                if (p.colorType === 'pink' || p.colorType === 'orange') {
                    p.vy -= 4.0 * dt; // Gravity pull for sparks
                }

                const lifeLeft = 1.0 - (p.age / p.maxAge);
                this.dummy.position.set(p.x, p.y, p.z);
                const currentScale = p.size * lifeLeft;
                this.dummy.scale.set(currentScale, currentScale, currentScale);
                this.dummy.rotation.set(Math.random() * 2, Math.random() * 2, 0);
                this.dummy.updateMatrix();

                this.instancedParticles.setMatrixAt(activePartIdx++, this.dummy.matrix);
            }
        }
        this.instancedParticles.count = activePartIdx;
        this.instancedParticles.instanceMatrix.needsUpdate = true;

        // --- 6. PULSING RETRO GATES (PORTALS) COLOR SHIFTS ---
        const pulseRatio = 0.85 + Math.sin(performance.now() * 0.005) * 0.15;
        game.portals.forEach((p, idx) => {
            const arch = this.portalMeshes[idx];
            if (p.filled) {
                // Filled portal: Hot Synth Pink
                arch.material.color.setHex(0xff007f);
                arch.material.emissive.setHex(0xff007f);
                arch.material.emissiveIntensity = 1.1 * pulseRatio;
                arch.scale.set(1.0, 1.0, 1.0);
            } else {
                // Empty portal: Pulsing Cyber Cyan
                arch.material.color.setHex(0x00f0ff);
                arch.material.emissive.setHex(0x00f0ff);
                arch.material.emissiveIntensity = 0.45 * pulseRatio;
                arch.scale.set(1.0, 0.85 + Math.sin(performance.now() * 0.003 + idx) * 0.1, 1.0);
            }
        });

        // --- 7. DYNAMIC HORIZON SKYLINE & FLOOR GRID WAVE ---
        const timeNow = performance.now() * 0.001;
        // Undulate wireframe helper to simulate synthwave digital grid
        this.gridHelper.position.y = -0.01 + Math.sin(timeNow * 1.5) * 0.015;

        // --- 8. CAMERA CONTROLS AND CAMERA SHAKE INJECT ---
        const targetCamZ = renderZ + 4.5;
        this.camera.position.x = 0;
        this.camera.position.y = 9.0;
        this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetCamZ + 5.0, 0.1);

        // Apply dynamic camera shake offset
        if (this.screenShakeIntensity > 0.01) {
            const shakeX = (Math.random() - 0.5) * this.screenShakeIntensity;
            const shakeY = (Math.random() - 0.5) * this.screenShakeIntensity;
            const shakeZ = (Math.random() - 0.5) * this.screenShakeIntensity;
            this.camera.position.x += shakeX;
            this.camera.position.y += shakeY;
            this.camera.position.z += shakeZ;
            // Decay screen shake
            this.screenShakeIntensity *= 0.88;
        }

        this.tempVector.set(0, 0, renderZ - 1.25);
        this.camera.lookAt(this.tempVector);

        // --- 9. SUBMIT DRAW CALL ---
        this.webGLRenderer.render(this.scene, this.camera);
    }
}
