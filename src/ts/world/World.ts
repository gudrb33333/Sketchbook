import * as THREE from 'three';
import * as CANNON from 'cannon';
import Swal from 'sweetalert2';
import * as $ from 'jquery';

import { CameraOperator } from '../core/CameraOperator';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { FXAAShader  } from 'three/examples/jsm/shaders/FXAAShader';

import { Detector } from '../../lib/utils/Detector';
import { Stats } from '../../lib/utils/Stats';
import * as GUI from '../../lib/utils/dat.gui';
import { CannonDebugRenderer } from '../../lib/cannon/CannonDebugRenderer';
import * as _ from 'lodash';

import { InputManager } from '../core/InputManager';
import * as Utils from '../core/FunctionLibrary';
import { LoadingManager } from '../core/LoadingManager';
import { InfoStack } from '../core/InfoStack';
import { UIManager } from '../core/UIManager';
import { IWorldEntity } from '../interfaces/IWorldEntity';
import { IUpdatable } from '../interfaces/IUpdatable';
import { Character } from '../characters/Character';
import { Path } from './Path';
import { CollisionGroups } from '../enums/CollisionGroups';
import { BoxCollider } from '../physics/colliders/BoxCollider';
import { TrimeshCollider } from '../physics/colliders/TrimeshCollider';
import { Vehicle } from '../vehicles/Vehicle';
import { Scenario } from './Scenario';
import { Sky } from './Sky';
import { Ocean } from './Ocean';

import { Socket, Channel, Presence } from 'phoenix'; 
import { Vector3 } from 'three';
import { CharacterSpawnPoint } from './CharacterSpawnPoint';
import { DialogAdapter } from '../core/DialogAdapter';

import * as mediasoupClient from 'mediasoup-client';
import { io } from 'socket.io-client';

export class World
{
	public renderer: THREE.WebGLRenderer;
	public camera: THREE.PerspectiveCamera;
	public composer: any;
	public stats: Stats;
	public graphicsWorld: THREE.Scene;
	public sky: Sky;
	public physicsWorld: CANNON.World;
	public parallelPairs: any[];
	public physicsFrameRate: number;
	public physicsFrameTime: number;
	public physicsMaxPrediction: number;
	public clock: THREE.Clock;
	public renderDelta: number;
	public logicDelta: number;
	public requestDelta: number;
	public sinceLastFrame: number;
	public justRendered: boolean;
	public params: any;
	public inputManager: InputManager;
	public cameraOperator: CameraOperator;
	public timeScaleTarget: number = 1;
	public console: InfoStack;
	public cannonDebugRenderer: CannonDebugRenderer;
	public scenarios: Scenario[] = [];
	public characters: Character[] = [];
	public vehicles: Vehicle[] = [];
	public paths: Path[] = [];
	public scenarioGUIFolder: any;
	public updatables: IUpdatable[] = [];

	private lastScenarioID: string;
	private socket: Socket;
	private channel: Channel;
	private socketPushTime: number = 1;
	private afterPosition: Vector3;
	private beforePosition: Vector3;
	private presence: Presence;
	private sessionId: string;
	private myCharacter: Character = null;
	public characterMap = new Map<string, Character>()
	public AnimationMap = new Map<string, Array<any>>()
	private idleState: number = 0

		
	private mediasoupSocket;
	private device
	private rtpCapabilities
	private producerTransport
	private consumerTransports = []
	private micProducer
	private webcamProducer
	private shareProducer
	private consumer
	private isProducer = false
	private micParams
	private webcamParams
	private shareParams
	private roomName = 'abc'
	// custom global variables
	private localWebcam
	private localWebcamImage
	private localWebcamImageContext
	private localWebcamTexture
	private localWebcamScreen

	private remoteWebCamList = []
	
	// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerOptions
	// https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
	
	
	private micDefaultParams;
	private webcamDefalutParams = {
	  // mediasoup params
	  encodings: [
	    {
	      rid: 'r0',
	      maxBitrate: 100000,
	      scalabilityMode: 'S1T3',
	    },
	    {
	      rid: 'r1',
	      maxBitrate: 300000,
	      scalabilityMode: 'S1T3',
	    },
	    {
	      rid: 'r2',
	      maxBitrate: 900000,
	      scalabilityMode: 'S1T3',
	    },
	  ],
	  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
	  codecOptions: {
	    videoGoogleStartBitrate: 1000
	  }
	};
	private consumingTransports = [];

	constructor(worldScenePath?: any)
	{
		const scope = this;

		// WebGL not supported
		if (!Detector.webgl)
		{
			Swal.fire({
				icon: 'warning',
				title: 'WebGL compatibility',
				text: 'This browser doesn\'t seem to have the required WebGL capabilities. The application may not work correctly.',
				footer: '<a href="https://get.webgl.org/" target="_blank">Click here for more information</a>',
				showConfirmButton: false,
				buttonsStyling: false
			});
		}

		// Renderer
		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.0;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		this.generateHTML();

		// Auto window resize
		function onWindowResize(): void
		{
			scope.camera.aspect = window.innerWidth / window.innerHeight;
			scope.camera.updateProjectionMatrix();
			scope.renderer.setSize(window.innerWidth, window.innerHeight);
			fxaaPass.uniforms['resolution'].value.set(1 / (window.innerWidth * pixelRatio), 1 / (window.innerHeight * pixelRatio));
			scope.composer.setSize(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
		}
		window.addEventListener('resize', onWindowResize, false);

		// Three.js scene
		this.graphicsWorld = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1010);

		// Passes
		let renderPass = new RenderPass( this.graphicsWorld, this.camera );
		let fxaaPass = new ShaderPass( FXAAShader );

		// FXAA
		let pixelRatio = this.renderer.getPixelRatio();
		fxaaPass.material['uniforms'].resolution.value.x = 1 / ( window.innerWidth * pixelRatio );
		fxaaPass.material['uniforms'].resolution.value.y = 1 / ( window.innerHeight * pixelRatio );

		// Composer
		this.composer = new EffectComposer( this.renderer );
		this.composer.addPass( renderPass );
		this.composer.addPass( fxaaPass );

		// Physics
		this.physicsWorld = new CANNON.World();
		this.physicsWorld.gravity.set(0, -9.81, 0);
		this.physicsWorld.broadphase = new CANNON.SAPBroadphase(this.physicsWorld);
		this.physicsWorld.solver.iterations = 10;
		this.physicsWorld.allowSleep = true;

		this.parallelPairs = [];
		this.physicsFrameRate = 60;
		this.physicsFrameTime = 1 / this.physicsFrameRate;
		this.physicsMaxPrediction = this.physicsFrameRate;

		// RenderLoop
		this.clock = new THREE.Clock();
		this.renderDelta = 0;
		this.logicDelta = 0;
		this.sinceLastFrame = 0;
		this.justRendered = false;

		// Stats (FPS, Frame time, Memory)
		this.stats = Stats();
		// Create right panel GUI
		this.createParamsGUI(scope);

		//AnimationMap Initialization
		this.AnimationMap.set("idle",["idle", 0.1])
		this.AnimationMap.set("drop_idle",["drop_idle", 0.1])
		this.AnimationMap.set("drop_running_roll",["drop_running_roll", 0.03])
		this.AnimationMap.set("drop_running",["drop_running", 0.1])
		this.AnimationMap.set("stop",["stop", 0.1])
		this.AnimationMap.set("falling",["falling", 0.3])
		this.AnimationMap.set("jump_idle",["jump_idle", 0.1])
		this.AnimationMap.set("jump_running",["jump_running", 0.03])
		this.AnimationMap.set("sprint",["sprint", 0.1])
		this.AnimationMap.set("run",["run", 0.1])

		// Initialization
		this.inputManager = new InputManager(this, this.renderer.domElement);
		this.cameraOperator = new CameraOperator(this, this.camera, this.params.Mouse_Sensitivity);
		this.sky = new Sky(this);
		
		// Load scene if path is supplied
		if (worldScenePath !== undefined)
		{
			let loadingManager = new LoadingManager(this);
			let loadingManager2 = new LoadingManager(this);
			loadingManager.onFinishedCallback = () =>
			{
				this.update(1, 1);
				this.setTimeScale(1);
	
				Swal.fire({
					title: 'Welcome to Sketchbook!',
					text: 'Feel free to explore the world and interact with available vehicles. There are also various scenarios ready to launch from the right panel.',
					footer: '<a href="https://github.com/swift502/Sketchbook" target="_blank">GitHub page</a><a href="https://discord.gg/fGuEqCe" target="_blank">Discord server</a>',
					confirmButtonText: 'Okay',
					buttonsStyling: false,
					onClose: () => {
						UIManager.setUserInterfaceVisible(true);
					}
				});

				const profile = {
					avatarIdPath: "build/assets/female/readyFemale.glb",
					avatarName: "TEST"
				}

				//this.socket = new Socket("wss://hubs.local:4000/socket")		
				this.socket = new Socket("wss://server.meta-world.gudrb33333.click/socket")

				
				this.channel = this.socket.channel("hub:42232", {"profile" : profile})
				this.presence = new Presence(this.channel)

				this.presence.onJoin((id, beforeJoin, afterJoin) =>{
					if (beforeJoin === undefined) {
						console.log(id ,":", afterJoin.metas[0])
						if(id != this.sessionId){
							const characterSpawnPoint = new CharacterSpawnPoint(new THREE.Object3D)
							characterSpawnPoint.spawnAvatar(loadingManager2 ,this, id)
						}
					}
				})

				this.presence.onLeave((id, remaining, afteremovedrJoin) =>{
					let leaveCharacter:Character;
					this.characters.forEach((character) => {
						if(character.sessionId == id){
							leaveCharacter = character
							this.characterMap.delete(id)
						}
					});

					this.remove(leaveCharacter)
					//console.log("onLeave:id", id)
					//console.log("onLeave:remaining", remaining)
					//console.log("onLeave:afteremovedrJoin", afteremovedrJoin)
				})


				this.presence.onSync(() => {
					this.presence.list((id, {metas: [first, ...rest]}) => {
						console.log("onSync:",id)
					})
				})


				this.socket.connect()
				this.channel
					.join()
						.receive("ok", resp => { 
							console.log("Joined successfully", resp)
							this.sessionId = resp
							this.characters[0].sessionId = this.sessionId
							this.myCharacter = this.characters[0]
							this.characterMap.set(this.sessionId, this.myCharacter)
							this.channel.on("naf", this.handleIncomingNAF)
							//console.log(this.myCharacter.charState.constructor.name.toLocaleLowerCase())
							//this.myCharacter.setAnimation("idle", 0.1)

							// const dialog = new DialogAdapter();
							// dialog.disconnect();
							// dialog.connect({
							// 	//serverUrl: `wss://hubs.local:4443`,
							// 	serverUrl: `wss://stream.meta-world.gudrb33333.click`,
							// 	roomId: "42232",
							// 	//joinToken: permsToken,
							// 	serverParams: { host: "stream.meta-world.gudrb33333.click", port: "443", turn: {credential: 't0yyUhwV1OsDw/teLOB/DwUTnME=', enabled: true, transports: [{port: 5349}], username: '1659089316:coturn'} },
							// 	//scene,
							// 	clientId: this.sessionId,
							// 	forceTcp: null,
							// 	forceTurn: null,
							// 	iceTransportPolicy: "all"
							// });
							this.connectWebRtc();
						})
						.receive("error", resp => { console.log("Unable to join", resp) })	

			};
			loadingManager.loadGLTF(worldScenePath, (gltf) =>
				{
					this.loadScene(loadingManager, gltf);
				}
			);
		}
		else
		{
			UIManager.setUserInterfaceVisible(true);
			UIManager.setLoadingScreenVisible(false);
			Swal.fire({
				icon: 'success',
				title: 'Hello world!',
				text: 'Empty Sketchbook world was succesfully initialized. Enjoy the blueness of the sky.',
				buttonsStyling: false
			});
		}

		this.render(this);
	}

	// Update
	// Handles all logic updates.
	public update(timeStep: number, unscaledTimeStep: number): void
	{
		this.updatePhysics(timeStep);

		// Update registred objects
		this.updatables.forEach((entity) => {
			entity.update(timeStep, unscaledTimeStep);
		});

		// Lerp time scale
		this.params.Time_Scale = THREE.MathUtils.lerp(this.params.Time_Scale, this.timeScaleTarget, 0.2);

		// Physics debug
		if (this.params.Debug_Physics) this.cannonDebugRenderer.update();
	}

	public updatePhysics(timeStep: number): void
	{
		// Step the physics world
		this.physicsWorld.step(this.physicsFrameTime, timeStep);

		this.characters.forEach((char) => {
			if (this.isOutOfBounds(char.characterCapsule.body.position))
			{
				this.outOfBoundsRespawn(char.characterCapsule.body);
			}
		});

		this.vehicles.forEach((vehicle) => {
			if (this.isOutOfBounds(vehicle.rayCastVehicle.chassisBody.position))
			{
				let worldPos = new THREE.Vector3();
				vehicle.spawnPoint.getWorldPosition(worldPos);
				worldPos.y += 1;
				this.outOfBoundsRespawn(vehicle.rayCastVehicle.chassisBody, Utils.cannonVector(worldPos));
			}
		});
	}

	public isOutOfBounds(position: CANNON.Vec3): boolean
	{
		let inside = position.x > -211.882 && position.x < 211.882 &&
					position.z > -169.098 && position.z < 153.232 &&
					position.y > 0.107;
		let belowSeaLevel = position.y < 14.989;

		return !inside && belowSeaLevel;
	}

	public outOfBoundsRespawn(body: CANNON.Body, position?: CANNON.Vec3): void
	{
		let newPos = position || new CANNON.Vec3(0, 16, 0);
		let newQuat = new CANNON.Quaternion(0, 0, 0, 1);

		body.position.copy(newPos);
		body.interpolatedPosition.copy(newPos);
		body.quaternion.copy(newQuat);
		body.interpolatedQuaternion.copy(newQuat);
		body.velocity.setZero();
		body.angularVelocity.setZero();
	}

	/**
	 * Rendering loop.
	 * Implements fps limiter and frame-skipping
	 * Calls world's "update" function before rendering.
	 * @param {World} world 
	 */
	public render(world: World): void
	{
		this.requestDelta = this.clock.getDelta();

		requestAnimationFrame(() =>
		{
			world.render(world);
		});

		// Getting timeStep
		let unscaledTimeStep = (this.requestDelta + this.renderDelta + this.logicDelta) ;
		let timeStep = unscaledTimeStep * this.params.Time_Scale;
		timeStep = Math.min(timeStep, 1 / 30);    // min 30 fps

		// Logic
		world.update(timeStep, unscaledTimeStep);

		// Measuring logic time
		this.logicDelta = this.clock.getDelta();

		// Frame limiting
		let interval = 1 / 60;
		this.sinceLastFrame += this.requestDelta + this.renderDelta + this.logicDelta;
		this.sinceLastFrame %= interval;

		// Stats end
		this.stats.end();
		this.stats.begin();

		// Actual rendering with a FXAA ON/OFF switch
		if (this.params.FXAA) this.composer.render();
		else this.renderer.render(this.graphicsWorld, this.camera);

		// Measuring render time
		this.renderDelta = this.clock.getDelta();
			
			if(this.myCharacter != null && this.myCharacter.characterAnimationState ==='idle' && this.idleState < 61){
				this.channel.push("naf", { 
					"sessionId" : this.myCharacter.sessionId,
					"positionX" : this.myCharacter.position.x,
					"positionY" : this.myCharacter.position.y,
					"positionZ" : this.myCharacter.position.z,
					"animation" : this.myCharacter.characterAnimationState,
					"orientationX" : this.myCharacter.orientation.x,
					"orientationY" : this.myCharacter.orientation.y,
					"orientationZ" : this.myCharacter.orientation.z,
				})
				this.idleState ++;
				//console.log("idleState:",this.idleState)
			}else if(this.myCharacter != null && this.myCharacter.characterAnimationState !='idle'){
				this.channel.push("naf", { 
					"sessionId" : this.myCharacter.sessionId,
					"positionX" : this.myCharacter.position.x,
					"positionY" : this.myCharacter.position.y,
					"positionZ" : this.myCharacter.position.z,
					"animation" : this.myCharacter.characterAnimationState,
					"orientationX" : this.myCharacter.orientation.x,
					"orientationY" : this.myCharacter.orientation.y,
					"orientationZ" : this.myCharacter.orientation.z,
				})
				this.idleState = 0
				//console.log("idleState:",this.idleState)
			}

			if(this.localWebcam && this.localWebcam.readyState === this.localWebcam.HAVE_ENOUGH_DATA){
				console.log('11111111111111111111111')
				this.localWebcamImageContext.drawImage( this.localWebcam, 0, 0, this.localWebcamImage.width, this.localWebcamImage.height );
				if ( this.localWebcamTexture ) {
					this.localWebcamTexture.needsUpdate = true;
					this.localWebcamScreen.position.set(
						this.myCharacter.characterCapsule.body.interpolatedPosition.x + 1,
						this.myCharacter.characterCapsule.body.interpolatedPosition.y + 1,
						this.myCharacter.characterCapsule.body.interpolatedPosition.z 
					);
					this.localWebcamScreen.lookAt(this.myCharacter.characterCapsule.body.interpolatedPosition.x + 1 + this.myCharacter.orientation.x, this.myCharacter.characterCapsule.body.interpolatedPosition.y + 1 + this.myCharacter.orientation.y, this.myCharacter.characterCapsule.body.interpolatedPosition.z + this.myCharacter.orientation.z);
				}
			}
	}

	public setTimeScale(value: number): void
	{
		this.params.Time_Scale = value;
		this.timeScaleTarget = value;
	}

	public add(worldEntity: IWorldEntity): void
	{
		worldEntity.addToWorld(this);
		this.registerUpdatable(worldEntity);
	}

	public registerUpdatable(registree: IUpdatable): void
	{
		this.updatables.push(registree);
		this.updatables.sort((a, b) => (a.updateOrder > b.updateOrder) ? 1 : -1);
	}

	public remove(worldEntity: IWorldEntity): void
	{
		worldEntity.removeFromWorld(this);
		this.unregisterUpdatable(worldEntity);
	}

	public unregisterUpdatable(registree: IUpdatable): void
	{
		_.pull(this.updatables, registree);
	}

	public loadScene(loadingManager: LoadingManager, gltf: any): void
	{
		gltf.scene.traverse((child) => {
			if (child.hasOwnProperty('userData'))
			{
				if (child.type === 'Mesh')
				{
					Utils.setupMeshProperties(child);
					this.sky.csm.setupMaterial(child.material);

					if (child.material.name === 'ocean')
					{
						this.registerUpdatable(new Ocean(child, this));
					}
				}

				if (child.userData.hasOwnProperty('data'))
				{
					if (child.userData.data === 'physics')
					{
						if (child.userData.hasOwnProperty('type')) 
						{
							// Convex doesn't work! Stick to boxes!
							if (child.userData.type === 'box')
							{
								let phys = new BoxCollider({size: new THREE.Vector3(child.scale.x, child.scale.y, child.scale.z)});
								phys.body.position.copy(Utils.cannonVector(child.position));
								phys.body.quaternion.copy(Utils.cannonQuat(child.quaternion));
								phys.body.computeAABB();

								phys.body.shapes.forEach((shape) => {
									shape.collisionFilterMask = ~CollisionGroups.TrimeshColliders;
								});

								this.physicsWorld.addBody(phys.body);
							}
							else if (child.userData.type === 'trimesh')
							{
								let phys = new TrimeshCollider(child, {});
								this.physicsWorld.addBody(phys.body);
							}

							child.visible = false;
						}
					}

					if (child.userData.data === 'path')
					{
						this.paths.push(new Path(child));
					}

					if (child.userData.data === 'scenario')
					{
						this.scenarios.push(new Scenario(child, this));
					}
				}
			}
		});

		this.graphicsWorld.add(gltf.scene);

		// Launch default scenario
		let defaultScenarioID: string;
		for (const scenario of this.scenarios) {
			if (scenario.default) {
				defaultScenarioID = scenario.id;
				break;
			}
		}
		if (defaultScenarioID !== undefined) this.launchScenario(defaultScenarioID, loadingManager);
	}
	
	public launchScenario(scenarioID: string, loadingManager?: LoadingManager): void
	{
		this.lastScenarioID = scenarioID;

		this.clearEntities();

		// Launch default scenario
		if (!loadingManager) loadingManager = new LoadingManager(this);
		for (const scenario of this.scenarios) {
			if (scenario.id === scenarioID || scenario.spawnAlways) {
				scenario.launch(loadingManager, this);
			}
		}
	}

	public restartScenario(): void
	{
		if (this.lastScenarioID !== undefined)
		{
			document.exitPointerLock();
			this.launchScenario(this.lastScenarioID);
		}
		else
		{
			console.warn('Can\'t restart scenario. Last scenarioID is undefined.');
		}
	}

	public clearEntities(): void
	{
		for (let i = 0; i < this.characters.length; i++) {
			this.remove(this.characters[i]);
			i--;
		}

		for (let i = 0; i < this.vehicles.length; i++) {
			this.remove(this.vehicles[i]);
			i--;
		}
	}

	public scrollTheTimeScale(scrollAmount: number): void
	{
		// Changing time scale with scroll wheel
		const timeScaleBottomLimit = 0.003;
		const timeScaleChangeSpeed = 1.3;
	
		if (scrollAmount > 0)
		{
			this.timeScaleTarget /= timeScaleChangeSpeed;
			if (this.timeScaleTarget < timeScaleBottomLimit) this.timeScaleTarget = 0;
		}
		else
		{
			this.timeScaleTarget *= timeScaleChangeSpeed;
			if (this.timeScaleTarget < timeScaleBottomLimit) this.timeScaleTarget = timeScaleBottomLimit;
			this.timeScaleTarget = Math.min(this.timeScaleTarget, 1);
		}
	}

	public updateControls(controls: any): void
	{
		let html = '';
		html += '<h2 class="controls-title">Controls:</h2>';

		controls.forEach((row) =>
		{
			html += '<div class="ctrl-row">';
			row.keys.forEach((key) => {
				if (key === '+' || key === 'and' || key === 'or' || key === '&') html += '&nbsp;' + key + '&nbsp;';
				else html += '<span class="ctrl-key">' + key + '</span>';
			});

			html += '<span class="ctrl-desc">' + row.desc + '</span></div>';
		});

		document.getElementById('controls').innerHTML = html;
	}

	private generateHTML(): void
	{
		// Fonts
		$('head').append('<link href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&display=swap" rel="stylesheet">');
		$('head').append('<link href="https://fonts.googleapis.com/css2?family=Solway:wght@400;500;700&display=swap" rel="stylesheet">');
		$('head').append('<link href="https://fonts.googleapis.com/css2?family=Cutive+Mono&display=swap" rel="stylesheet">');

		// Loader
		$(`	<div id="loading-screen">
				<div id="loading-screen-background"></div>
				<h1 id="main-title" class="sb-font">Sketchbook 0.4</h1>
				<div class="cubeWrap">
					<div class="cube">
						<div class="faces1"></div>
						<div class="faces2"></div>     
					</div> 
				</div> 
				<div id="loading-text">Loading...</div>
			</div>
		`).appendTo('body');

		// UI
		$(`	<div id="ui-container" style="display: none;">

				<div id="ui-control" class="left-panel active-on">
					<div id="controls" class="panel-segment flex-bottom"></div>
				</div>
			</div>
		`).appendTo('body');

		// Footer
		$(`	<footer>
			  <div class="footer-button">
				<ul>
				  <li>
					<!-- mic -->
					<a id="button-mic" class="active-off">
					<svg class="glow" version="1.0" xmlns="http://www.w3.org/2000/svg"
					 width="512.000000pt" height="745.000000pt" viewBox="0 0 512.000000 745.000000"
						preserveAspectRatio="xMidYMid meet">

					<g transform="translate(0.000000,745.000000) scale(0.100000,-0.100000)"
					fill="#000000" stroke="none">
					<path d="M2382 7439 c-538 -73 -987 -448 -1151 -962 -68 -212 -64 -135 -68
					-1497 -3 -839 -1 -1275 7 -1361 54 -634 493 -1129 1120 -1265 121 -27 419 -27
					540 0 292 63 526 192 729 401 232 239 362 525 391 864 8 86 10 522 7 1361 -3
					1105 -5 1244 -20 1317 -40 196 -123 396 -229 551 -72 106 -263 295 -368 363
					-160 106 -316 171 -498 209 -114 24 -350 34 -460 19z"/>
					<path d="M185 4651 c-78 -20 -156 -90 -174 -158 -14 -50 -14 -729 -1 -883 48
					-536 246 -1040 578 -1469 160 -207 460 -474 684 -609 123 -75 354 -183 478
					-226 120 -40 321 -91 404 -101 l56 -7 0 -249 0 -249 -416 0 c-270 0 -431 -4
					-459 -11 -54 -14 -118 -67 -148 -123 -20 -38 -22 -54 -22 -216 0 -161 2 -178
					22 -216 29 -54 93 -110 140 -123 53 -15 2413 -15 2466 0 47 13 111 69 140 123
					20 38 22 55 22 216 0 162 -2 178 -22 216 -30 56 -94 109 -148 123 -28 7 -189
					11 -459 11 l-416 0 0 245 0 244 38 6 c563 97 1039 339 1422 725 396 398 632
					870 726 1450 22 134 33 1048 14 1119 -13 51 -68 114 -124 144 -38 20 -55 22
					-216 22 -160 0 -178 -2 -215 -22 -47 -25 -85 -64 -111 -113 -18 -32 -19 -73
					-25 -525 -6 -531 -8 -558 -69 -775 -16 -58 -51 -157 -77 -220 -346 -815 -1223
					-1277 -2087 -1099 -670 139 -1231 685 -1415 1379 -61 232 -64 257 -70 750 -6
					441 -7 456 -28 495 -25 47 -64 86 -113 111 -29 15 -62 19 -190 21 -85 1 -168
					-2 -185 -6z"/>
					</g>
					</svg>
					<svg version="1.0" xmlns="http://www.w3.org/2000/svg"
					 width="512.000000pt" height="745.000000pt" viewBox="0 0 512.000000 745.000000"
					 preserveAspectRatio="xMidYMid meet">

					<g transform="translate(0.000000,745.000000) scale(0.100000,-0.100000)"
					fill="#000000" stroke="none">
					<path d="M2382 7439 c-538 -73 -987 -448 -1151 -962 -68 -212 -64 -135 -68
					-1497 -3 -839 -1 -1275 7 -1361 54 -634 493 -1129 1120 -1265 121 -27 419 -27
					540 0 292 63 526 192 729 401 232 239 362 525 391 864 8 86 10 522 7 1361 -3
					1105 -5 1244 -20 1317 -40 196 -123 396 -229 551 -72 106 -263 295 -368 363
					-160 106 -316 171 -498 209 -114 24 -350 34 -460 19z"/>
					<path d="M185 4651 c-78 -20 -156 -90 -174 -158 -14 -50 -14 -729 -1 -883 48
					-536 246 -1040 578 -1469 160 -207 460 -474 684 -609 123 -75 354 -183 478
					-226 120 -40 321 -91 404 -101 l56 -7 0 -249 0 -249 -416 0 c-270 0 -431 -4
					-459 -11 -54 -14 -118 -67 -148 -123 -20 -38 -22 -54 -22 -216 0 -161 2 -178
					22 -216 29 -54 93 -110 140 -123 53 -15 2413 -15 2466 0 47 13 111 69 140 123
					20 38 22 55 22 216 0 162 -2 178 -22 216 -30 56 -94 109 -148 123 -28 7 -189
					11 -459 11 l-416 0 0 245 0 244 38 6 c563 97 1039 339 1422 725 396 398 632
					870 726 1450 22 134 33 1048 14 1119 -13 51 -68 114 -124 144 -38 20 -55 22
					-216 22 -160 0 -178 -2 -215 -22 -47 -25 -85 -64 -111 -113 -18 -32 -19 -73
					-25 -525 -6 -531 -8 -558 -69 -775 -16 -58 -51 -157 -77 -220 -346 -815 -1223
					-1277 -2087 -1099 -670 139 -1231 685 -1415 1379 -61 232 -64 257 -70 750 -6
					441 -7 456 -28 495 -25 47 -64 86 -113 111 -29 15 -62 19 -190 21 -85 1 -168
					-2 -185 -6z"/>
					</g>
					</svg>
					</a>
				  </li>
				  <li>
					<!-- webcam -->
					<a id="button-webcam" class="active-off">
					  <svg class="glow" version="1.0" xmlns="http://www.w3.org/2000/svg"
					  width="512.000000pt" height="512.000000pt" viewBox="0 0 512.000000 512.000000"
					  preserveAspectRatio="xMidYMid meet">
					     
				   	  <g transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)"
				   	  fill="#000000" stroke="none">
				   	  <path d="M730 4384 c-205 -32 -330 -91 -468 -219 -110 -102 -192 -235 -234
				   	  -382 l-23 -78 0 -1145 0 -1145 23 -78 c68 -237 234 -430 457 -533 158 -73 80
				   	  -69 1350 -69 l1140 0 90 28 c320 100 548 369 585 693 5 49 10 197 10 329 l0
				   	  240 593 -592 c531 -530 596 -593 635 -603 76 -20 164 14 203 77 l24 38 0 1616
				   	  0 1615 -25 38 c-43 64 -127 95 -202 76 -39 -10 -104 -73 -635 -603 l-593 -592
				   	  0 240 c0 132 -5 280 -10 329 -37 324 -265 593 -585 693 l-90 28 -1110 1 c-610
				   	  1 -1121 0 -1135 -2z"/>
				   	  </g>
				   	  </svg>
					  <svg version="1.0" xmlns="http://www.w3.org/2000/svg"
					   width="512.000000pt" height="512.000000pt" viewBox="0 0 512.000000 512.000000"
					   preserveAspectRatio="xMidYMid meet">
						  
					  <g transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)"
					  fill="#000000" stroke="none">
					  <path d="M730 4384 c-205 -32 -330 -91 -468 -219 -110 -102 -192 -235 -234
					  -382 l-23 -78 0 -1145 0 -1145 23 -78 c68 -237 234 -430 457 -533 158 -73 80
					  -69 1350 -69 l1140 0 90 28 c320 100 548 369 585 693 5 49 10 197 10 329 l0
					  240 593 -592 c531 -530 596 -593 635 -603 76 -20 164 14 203 77 l24 38 0 1616
					  0 1615 -25 38 c-43 64 -127 95 -202 76 -39 -10 -104 -73 -635 -603 l-593 -592
					  0 240 c0 132 -5 280 -10 329 -37 324 -265 593 -585 693 l-90 28 -1110 1 c-610
					  1 -1121 0 -1135 -2z"/>
					  </g>
					  </svg>
					</a>
				  </li>
				  <li>
					<!-- share -->
					<a href="#">
					  <svg class="glow" version="1.0" xmlns="http://www.w3.org/2000/svg"
					  width="512.000000pt" height="512.000000pt" viewBox="0 0 512.000000 512.000000"
					  preserveAspectRatio="xMidYMid meet">
				   
				   	  <g transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)"
				   	  fill="#000000" stroke="none">
				   	  <path d="M348 4770 c-112 -19 -245 -117 -297 -218 -53 -104 -51 -39 -51 -1643
				   	  0 -962 4 -1505 10 -1540 28 -148 138 -271 295 -328 34 -12 165 -15 808 -18
				   	  l768 -4 -7 -47 c-11 -79 -43 -171 -105 -303 -62 -133 -71 -177 -45 -228 22
				   	  -41 81 -89 118 -96 18 -3 353 -5 744 -3 l710 3 37 25 c45 31 77 87 77 136 0
				   	  25 -19 79 -59 163 -62 132 -94 224 -105 303 l-7 47 768 4 c643 3 774 6 808 18
				   	  158 58 268 180 295 330 7 36 9 565 8 1565 l-3 1509 -23 58 c-44 109 -140 205
				   	  -250 249 l-57 23 -2195 1 c-1207 1 -2216 -2 -2242 -6z m4371 -341 c64 -23 61
				   	  45 61 -1193 l0 -1124 -26 -31 -26 -31 -2168 0 -2168 0 -26 31 -26 31 0 1123
				   	  c0 866 3 1130 12 1151 26 56 -100 53 2204 54 1535 0 2140 -3 2163 -11z"/>
				   	  </g>
				   	  </svg>
				   
					  <svg version="1.0" xmlns="http://www.w3.org/2000/svg"
					   width="512.000000pt" height="512.000000pt" viewBox="0 0 512.000000 512.000000"
					   preserveAspectRatio="xMidYMid meet">
						  
					  <g transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)"
					  fill="#000000" stroke="none">
					  <path d="M348 4770 c-112 -19 -245 -117 -297 -218 -53 -104 -51 -39 -51 -1643
					  0 -962 4 -1505 10 -1540 28 -148 138 -271 295 -328 34 -12 165 -15 808 -18
					  l768 -4 -7 -47 c-11 -79 -43 -171 -105 -303 -62 -133 -71 -177 -45 -228 22
					  -41 81 -89 118 -96 18 -3 353 -5 744 -3 l710 3 37 25 c45 31 77 87 77 136 0
					  25 -19 79 -59 163 -62 132 -94 224 -105 303 l-7 47 768 4 c643 3 774 6 808 18
					  158 58 268 180 295 330 7 36 9 565 8 1565 l-3 1509 -23 58 c-44 109 -140 205
					  -250 249 l-57 23 -2195 1 c-1207 1 -2216 -2 -2242 -6z m4371 -341 c64 -23 61
					  45 61 -1193 l0 -1124 -26 -31 -26 -31 -2168 0 -2168 0 -26 31 -26 31 0 1123
					  c0 866 3 1130 12 1151 26 56 -100 53 2204 54 1535 0 2140 -3 2163 -11z"/>
					  </g>
					  </svg>

					</a>
				  </li>
				  <li>
					<!-- control -->
					<a id="button-control" class="active-on">
					<svg class="glow" version="1.0" xmlns="http://www.w3.org/2000/svg"
					width="512.000000pt" height="94.000000pt" viewBox="0 0 256.000000 47.000000"
					preserveAspectRatio="xMidYMid meet">
				   
				   <g transform="translate(0.000000,94.000000) scale(0.100000,-0.100000)"
				   fill="#000000" stroke="none">
				   <path d="M365 926 c-220 -55 -380 -269 -362 -486 28 -336 374 -536 677 -391
				   72 35 171 128 206 195 l28 55 29 -52 c58 -107 179 -201 301 -233 105 -28 238
				   -11 340 44 68 36 154 124 193 197 l32 60 1 -147 0 -148 105 0 105 0 2 249 3
				   250 181 -247 181 -247 92 -3 91 -3 0 451 0 450 -175 0 -175 0 0 -105 0 -105
				   70 0 70 0 0 -146 c0 -116 -3 -144 -12 -136 -7 6 -92 119 -188 251 l-175 240
				   -87 1 -88 0 0 -147 -1 -148 -31 59 c-18 32 -58 84 -89 115 -221 222 -577 174
				   -741 -100 l-34 -56 -28 53 c-15 29 -53 77 -85 107 -121 116 -282 161 -436 123z
				   m1110 -243 c51 -27 79 -57 104 -113 74 -162 -45 -344 -224 -344 -165 1 -287
				   171 -230 321 20 52 75 117 118 139 68 36 160 34 232 -3z m-900 8 c22 -10 59
				   -39 83 -64 l42 -47 98 0 97 0 0 -110 0 -110 -100 0 -100 0 -27 -38 c-40 -57
				   -118 -96 -193 -95 -33 0 -76 7 -96 15 -184 79 -201 332 -29 436 47 27 63 32
				   120 32 41 0 80 -7 105 -19z"/>
				   <path d="M4043 925 c-124 -34 -246 -127 -300 -231 -30 -58 -43 -67 -43 -31 0
				   41 -46 121 -96 168 -83 76 -115 84 -359 84 l-210 0 0 -445 0 -445 107 -3 107
				   -3 3 150 3 150 104 -150 103 -149 135 0 135 0 -28 37 c-15 21 -63 84 -106 141
				   -43 57 -78 106 -78 110 0 4 23 22 51 40 27 18 63 53 79 78 l29 46 6 -39 c21
				   -134 54 -203 136 -289 186 -192 483 -192 673 1 28 29 63 76 78 105 l27 53 3
				   -139 3 -139 258 -3 257 -2 0 100 0 100 -150 0 -150 0 -2 348 -3 347 -105 0
				   -105 0 -5 -137 -5 -138 -29 55 c-94 180 -327 282 -523 230z m-620 -227 c27
				   -14 57 -69 57 -106 0 -81 -55 -122 -164 -122 l-66 0 0 119 0 120 43 3 c52 4
				   106 -2 130 -14z m826 -5 c93 -37 151 -124 151 -224 0 -146 -138 -266 -281
				   -243 -61 10 -139 62 -172 115 -124 201 83 442 302 352z"/>
				   <path d="M2607 913 c-4 -3 -7 -206 -7 -450 l0 -443 104 0 c99 0 104 1 110 22
				   3 13 6 168 6 344 l0 321 90 7 90 8 0 99 0 99 -193 0 c-107 0 -197 -3 -200 -7z"/>
				   </g>
				   </svg>
					  <svg version="1.0" xmlns="http://www.w3.org/2000/svg"
					   width="512.000000pt" height="94.000000pt" viewBox="0 0 256.000000 47.000000"
					   preserveAspectRatio="xMidYMid meet">
						  
					  <g transform="translate(0.000000,94.000000) scale(0.100000,-0.100000)"
					  fill="#000000" stroke="none">
					  <path d="M365 926 c-220 -55 -380 -269 -362 -486 28 -336 374 -536 677 -391
					  72 35 171 128 206 195 l28 55 29 -52 c58 -107 179 -201 301 -233 105 -28 238
					  -11 340 44 68 36 154 124 193 197 l32 60 1 -147 0 -148 105 0 105 0 2 249 3
					  250 181 -247 181 -247 92 -3 91 -3 0 451 0 450 -175 0 -175 0 0 -105 0 -105
					  70 0 70 0 0 -146 c0 -116 -3 -144 -12 -136 -7 6 -92 119 -188 251 l-175 240
					  -87 1 -88 0 0 -147 -1 -148 -31 59 c-18 32 -58 84 -89 115 -221 222 -577 174
					  -741 -100 l-34 -56 -28 53 c-15 29 -53 77 -85 107 -121 116 -282 161 -436 123z
					  m1110 -243 c51 -27 79 -57 104 -113 74 -162 -45 -344 -224 -344 -165 1 -287
					  171 -230 321 20 52 75 117 118 139 68 36 160 34 232 -3z m-900 8 c22 -10 59
					  -39 83 -64 l42 -47 98 0 97 0 0 -110 0 -110 -100 0 -100 0 -27 -38 c-40 -57
					  -118 -96 -193 -95 -33 0 -76 7 -96 15 -184 79 -201 332 -29 436 47 27 63 32
					  120 32 41 0 80 -7 105 -19z"/>
					  <path d="M4043 925 c-124 -34 -246 -127 -300 -231 -30 -58 -43 -67 -43 -31 0
					  41 -46 121 -96 168 -83 76 -115 84 -359 84 l-210 0 0 -445 0 -445 107 -3 107
					  -3 3 150 3 150 104 -150 103 -149 135 0 135 0 -28 37 c-15 21 -63 84 -106 141
					  -43 57 -78 106 -78 110 0 4 23 22 51 40 27 18 63 53 79 78 l29 46 6 -39 c21
					  -134 54 -203 136 -289 186 -192 483 -192 673 1 28 29 63 76 78 105 l27 53 3
					  -139 3 -139 258 -3 257 -2 0 100 0 100 -150 0 -150 0 -2 348 -3 347 -105 0
					  -105 0 -5 -137 -5 -138 -29 55 c-94 180 -327 282 -523 230z m-620 -227 c27
					  -14 57 -69 57 -106 0 -81 -55 -122 -164 -122 l-66 0 0 119 0 120 43 3 c52 4
					  106 -2 130 -14z m826 -5 c93 -37 151 -124 151 -224 0 -146 -138 -266 -281
					  -243 -61 10 -139 62 -172 115 -124 201 83 442 302 352z"/>
					  <path d="M2607 913 c-4 -3 -7 -206 -7 -450 l0 -443 104 0 c99 0 104 1 110 22
					  3 13 6 168 6 344 l0 321 90 7 90 8 0 99 0 99 -193 0 c-107 0 -197 -3 -200 -7z"/>
					  </g>
					  </svg>
					</a>
				  </li>
				</ul>
			  </div>
			</footer>
		`).appendTo('body');

		// Canvas
		document.body.appendChild(this.renderer.domElement);
		this.renderer.domElement.id = 'canvas';
	}

	private createParamsGUI(scope: World): void
	{
		this.params = {
			Pointer_Lock: true,
			Mouse_Sensitivity: 0.3,
			Time_Scale: 1,
			Shadows: true,
			FXAA: true,
			Debug_Physics: false,
			Debug_FPS: false,
			Sun_Elevation: 50,
			Sun_Rotation: 145,
		};

		const gui = new GUI.GUI();

		// Scenario
		this.scenarioGUIFolder = gui.addFolder('Scenarios');
		this.scenarioGUIFolder.open();

		// World
		let worldFolder = gui.addFolder('World');
		worldFolder.add(this.params, 'Time_Scale', 0, 1).listen()
			.onChange((value) =>
			{
				scope.timeScaleTarget = value;
			});
		worldFolder.add(this.params, 'Sun_Elevation', 0, 180).listen()
			.onChange((value) =>
			{
				scope.sky.phi = value;
			});
		worldFolder.add(this.params, 'Sun_Rotation', 0, 360).listen()
			.onChange((value) =>
			{
				scope.sky.theta = value;
			});

		// Input
		let settingsFolder = gui.addFolder('Settings');
		settingsFolder.add(this.params, 'FXAA');
		settingsFolder.add(this.params, 'Shadows')
			.onChange((enabled) =>
			{
				if (enabled)
				{
					this.sky.csm.lights.forEach((light) => {
						light.castShadow = true;
					});
				}
				else
				{
					this.sky.csm.lights.forEach((light) => {
						light.castShadow = false;
					});
				}
			});
		settingsFolder.add(this.params, 'Pointer_Lock')
			.onChange((enabled) =>
			{
				scope.inputManager.setPointerLock(enabled);
			});
		settingsFolder.add(this.params, 'Mouse_Sensitivity', 0, 1)
			.onChange((value) =>
			{
				scope.cameraOperator.setSensitivity(value, value * 0.8);
			});
		settingsFolder.add(this.params, 'Debug_Physics')
			.onChange((enabled) =>
			{
				if (enabled)
				{
					this.cannonDebugRenderer = new CannonDebugRenderer( this.graphicsWorld, this.physicsWorld );
				}
				else
				{
					this.cannonDebugRenderer.clearMeshes();
					this.cannonDebugRenderer = undefined;
				}

				scope.characters.forEach((char) =>
				{
					char.raycastBox.visible = enabled;
				});
			});
		settingsFolder.add(this.params, 'Debug_FPS')
			.onChange((enabled) =>
			{
				UIManager.setFPSVisible(enabled);
			});

		gui.open();
	}

	handleIncomingNAF = data => {
		let moveCharacter: Character = this.characterMap.get(data.sessionId)
		if(moveCharacter){
			moveCharacter.setPosition(data.positionX, data.positionY, data.positionZ)
			moveCharacter.setAnimation2(this.AnimationMap.get(data.animation)[0], this.AnimationMap.get(data.animation)[1])
			moveCharacter.orientation.x = data.orientationX
			moveCharacter.orientation.y = data.orientationY
			moveCharacter.orientation.z = data.orientationZ
			moveCharacter.setCameraRelativeOrientationTarget()


				


		}
	};
	
	public connectWebRtc = () => {
	    //const roomName = window.location.pathname.split('/')[2]
	
	    //socket = io("wss://hubs.local:3000/mediasoup", {transports: ['websocket']})
	    this.mediasoupSocket = io("wss://stream.meta-world.gudrb33333.click/mediasoup", {transports: ['websocket']})
	
	    this.mediasoupSocket.on('connection-success', ({ socketId }) => {
	      console.log(socketId)
	      this.getLocalAudioStream()
		
	      // server informs the client of a new producer just joined
		  this.mediasoupSocket.on('new-producer', ({ producerId }) => this.signalNewConsumerTransport(producerId))
		
		  this.mediasoupSocket.on('producer-closed', ({ remoteProducerId }) => {
	        // server notification is received when a producer is closed
	        // we need to close the client-side consumer and associated transport
	        const producerToClose = this.consumerTransports.find(transportData => transportData.producerId === remoteProducerId)
	        producerToClose.consumerTransport.close()
	        producerToClose.consumer.close()
		
	        // remove the consumer transport from the list
	        this.consumerTransports = this.consumerTransports.filter(transportData => transportData.producerId !== remoteProducerId)
		
	        // remove the video div element
	        const videoContainer = document.getElementById('videoContainer')
	        videoContainer.removeChild(document.getElementById(`td-${remoteProducerId}`))
	      })
	    })
	
	    document.getElementById('button-mic').className = 'active-on'
	}
	
	public audioStreamSuccess = (stream) => {
	  const localAudio = document.getElementById('localAudio') as HTMLAudioElement
	  localAudio.srcObject = stream
	
	  this.micParams = { track: stream.getAudioTracks()[0], ...this.micDefaultParams };
	  //webcamParams = { track: stream.getVideoTracks()[0], ...webcamDefalutParams };
	
	  this.joinRoom()
	}
	
	public joinRoom = () => {
	  console.log('joinRoom():', this.roomName)
	  let roomName = this.roomName
	  this.mediasoupSocket.emit('joinRoom', { roomName }, (data) => {
	    console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`)
	    // we assign to local variable and will be used when
	    // loading the client Device (see createDevice above)
	    this.rtpCapabilities = data.rtpCapabilities
	
	    // once we have rtpCapabilities from the Router, create Device
	    this.createDevice()
	  })
	}
	public getLocalAudioStream = () => {
	  console.log('getLocalAudioStream()')
	  navigator.mediaDevices.getUserMedia({
	    audio: true,
	    // video: {
	    //   width: {
	    //     min: 640,
	    //     max: 1920,
	    //   },
	    //   height: {
	    //     min: 400,
	    //     max: 1080,
	    //   }
	    // }
	  })
	  .then(this.audioStreamSuccess)
	  .catch(error => {
	    console.log(error.message)
	  })
	}
	// A device is an endpoint connecting to a Router on the
	// server side to send/recive media
	public createDevice = async () => {
	  try {
	    this.device = new mediasoupClient.Device()
	
	    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
	    // Loads the device with RTP capabilities of the Router (server side)
	    await this.device.load({
	      // see getRtpCapabilities() below
	      routerRtpCapabilities: this.rtpCapabilities
	    })
	
	    console.log('Device RTP Capabilities', this.device.rtpCapabilities)
	
	    // once the device loads, create transport
	    this.createSendTransport()
	
	  } catch (error) {
	    console.log(error)
	    if (error.name === 'UnsupportedError')
	      console.warn('browser not supported')
	  }
	}
	public createSendTransport = () => {
	  // see server's socket.on('createWebRtcTransport', sender?, ...)
	  // this is a call from Producer, so sender = true
	  this.mediasoupSocket.emit('createWebRtcTransport', { consumer: false }, ({ params }) => {
	    // The server sends back params needed 
	    // to create Send Transport on the client side
	    if (params.error) {
	      console.log(params.error)
	      return
	    }
	
	    console.log(params)
	
	    // creates a new WebRTC Transport to send media
	    // based on the server's producer transport params
	    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
	    this.producerTransport = this.device.createSendTransport(params)
	
	    // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
	    // this event is raised when a first call to transport.produce() is made
	    // see connectSendTransport() below
	    this.producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
	      try {
	        // Signal local DTLS parameters to the server side transport
	        // see server's socket.on('transport-connect', ...)
	        await this.mediasoupSocket.emit('transport-connect', {
	          dtlsParameters,
	        })
		
	        // Tell the transport that parameters were transmitted.
	        callback()
		
	      } catch (error) {
	        errback(error)
	      }
	    })
	
	    this.producerTransport.on('produce', async (parameters, callback, errback) => {
	      console.log(parameters)
		
	      try {
	        // tell the server to create a Producer
	        // with the following parameters and produce
	        // and expect back a server side producer id
	        // see server's socket.on('transport-produce', ...)
	        await this.mediasoupSocket.emit('transport-produce', {
	          kind: parameters.kind,
	          rtpParameters: parameters.rtpParameters,
	          appData: parameters.appData,
	        }, ({ id, producersExist }) => {
	          // Tell the transport that parameters were transmitted and provide it with the
	          // server side producer's id.
	          callback({ id })
			
	          // if producers exist, then join room
	          if (producersExist) this.getProducers()
	        })
	      } catch (error) {
	        errback(error)
	      }
	    })
	
	    //connectSendTransport
	    this.enableMic()
	  })
	}
	public connectSendTransport = async () => {
	  // we now call produce() to instruct the producer transport
	  // to send media to the Router
	  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
	  // this action will trigger the 'connect' and 'produce' events above
	
	  this.micProducer = await this.producerTransport.produce(this.micParams);
	  this.webcamProducer = await this.producerTransport.produce(this.webcamParams);
	
	  this.micProducer.on('trackended', () => {
	    console.log('audio track ended')
	
	    // close audio track
	  })
	
	  this.micProducer.on('transportclose', () => {
	    console.log('audio transport ended')
	
	    // close audio track
	  })
	  this.webcamProducer.on('trackended', () => {
	    console.log('video track ended')
	
	    // close video track
	  })
	
	  this.webcamProducer.on('transportclose', () => {
	    console.log('video transport ended')
	
	    // close video track
	  })
	}
	public signalNewConsumerTransport = async (remoteProducerId) => {
	  //check if we are already consuming the remoteProducerId
	  if (this.consumingTransports.includes(remoteProducerId)) return;
	  this.consumingTransports.push(remoteProducerId);
	
	  await this.mediasoupSocket.emit('createWebRtcTransport', { consumer: true }, ({ params }) => {
	    // The server sends back params needed 
	    // to create Send Transport on the client side
	    if (params.error) {
	      console.log(params.error)
	      return
	    }
	    console.log(`PARAMS... ${params}`)
	
	    let consumerTransport
	    try {
	      consumerTransport = this.device.createRecvTransport(params)
	    } catch (error) {
	      // exceptions: 
	      // {InvalidStateError} if not loaded
	      // {TypeError} if wrong arguments.
	      console.log(error)
	      return
	    }
	
	    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
	      try {
	        // Signal local DTLS parameters to the server side transport
	        // see server's socket.on('transport-recv-connect', ...)
	        await this.mediasoupSocket.emit('transport-recv-connect', {
	          dtlsParameters,
	          serverConsumerTransportId: params.id,
	        })
		
	        // Tell the transport that parameters were transmitted.
	        callback()
	      } catch (error) {
	        // Tell the transport that something was wrong
	        errback(error)
	      }
	    })
	
	    this.connectRecvTransport(consumerTransport, remoteProducerId, params.id)
	  })
	}
	
	public getProducers = () => {
		this.mediasoupSocket.emit('getProducers', producerIds => {
	    console.log(producerIds)
	    // for each of the producer create a consumer
	    // producerIds.forEach(id => signalNewConsumerTransport(id))
	    producerIds.forEach(this.signalNewConsumerTransport)
	  })
	}
	public connectRecvTransport = async (consumerTransport, remoteProducerId, serverConsumerTransportId) => {
	  // for consumer, we need to tell the server first
	  // to create a consumer based on the rtpCapabilities and consume
	  // if the router can consume, it will send back a set of params as below
	  await this.mediasoupSocket.emit('consume', {
	    rtpCapabilities: this.device.rtpCapabilities,
	    remoteProducerId,
	    serverConsumerTransportId,
	  }, async ({ params }) => {
	    if (params.error) {
	      console.log('Cannot Consume')
	      return
	    }
	
	    console.log(`Consumer Params ${params}`)
	    // then consume with the local consumer transport
	    // which creates a consumer
	    const consumer = await consumerTransport.consume({
	      id: params.id,
	      producerId: params.producerId,
	      kind: params.kind,
	      rtpParameters: params.rtpParameters
	    })
	
	    this.consumerTransports = [
	      ...this.consumerTransports,
	      {
	        consumerTransport,
	        serverConsumerTransportId: params.id,
	        producerId: remoteProducerId,
	        consumer,
	      },
	    ]
	
	    // create a new div element for the new consumer media
	    const newElem = document.createElement('div')
	    newElem.setAttribute('id', `td-${remoteProducerId}`)
	
	    if (params.kind == 'audio') {
	      //append to the audio container
	      newElem.innerHTML = '<audio id="' + remoteProducerId + '" autoplay style="visibility: hidden; float:left; position: absolute;"></audio>'

		  const videoContainer = document.getElementById('videoContainer')
		  videoContainer.appendChild(newElem)
	    } else {
	      //append to the video container
	      newElem.setAttribute('class', 'remoteVideo')
	      newElem.innerHTML = '<video id="' + remoteProducerId + '" autoplay class="video" style="visibility: hidden; float:left; position: absolute;" ></video>'
		  newElem.innerHTML = '<canvas id="' + remoteProducerId + '" width="1920" height="1080" style="visibility: hidden; float:left; position: absolute;" ></video>'	

		  const videoContainer = document.getElementById('videoContainer')
		  videoContainer.appendChild(newElem)
  
		  const remoteWebCam = document.getElementById(remoteProducerId) as HTMLVideoElement
		  this.remoteWebCamList.push(remoteWebCam)
	  

		  const videoImage = document.getElementById( remoteProducerId ).getElementsByTagName('canvas')
		  const videoTexture = new THREE.Texture( videoImage[0] );
		  videoTexture.minFilter = THREE.LinearFilter;
		  videoTexture.magFilter = THREE.LinearFilter;
		
		  let movieMaterial = new THREE.MeshBasicMaterial( { map: videoTexture, side:THREE.DoubleSide } );
		  // the geometry on which the movie will be displayed;
		  // 		movie image will be scaled to fit these dimensions.
		  let movieGeometry = new THREE.PlaneGeometry( 1, 0.5, 0.1, 0.1 );
		  let movieScreen = new THREE.Mesh( movieGeometry, movieMaterial );

		  const rand_0_9 = Math.floor(Math.random() * 10);

		  movieScreen.position.set(0,rand_0_9,0);
		  this.graphicsWorld.add(movieScreen)
	
		}
	

	    // destructure and retrieve the video track from the producer
	    const { track } = consumer
	
	    const remoteProducerIdEle =  document.getElementById(remoteProducerId) as HTMLMediaElement
	    remoteProducerIdEle.srcObject = new MediaStream([track])
	
	    // the server consumer started with media paused
	    // so we need to inform the server to resume
	    this.mediasoupSocket.emit('consumer-resume', { serverConsumerId: params.serverConsumerId })
	  })
	}
	
	public enableMic = async () => {
	  // we now call produce() to instruct the producer transport
	  // to send media to the Router
	  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
	  // this action will trigger the 'connect' and 'produce' events above
	
	  if (this.micProducer)
	  return;
	
	  this.micProducer = await this.producerTransport.produce(this.micParams);
	
	  this.micProducer.on('trackended', () => {
	    console.log('audio track ended')
	
	    // close audio track
	  })

	  this.micProducer.on('transportclose', () => {
	    console.log('audio transport ended')
	
	    // close audio track
	  })
	}
	
	public buttonMicClicked = async () => {
	  const micStatus = document.getElementById('button-mic').className
	  if(micStatus === "active-on")
	  	this.muteMic()
	  else
	  	this.unmuteMic()
	}
	
	public muteMic = async () => {
	  console.log('muteMic()');
	  this.micProducer.pause();
	  try {
	      await this.mediasoupSocket.emit('pauseProducer', { producerId: this.micProducer.id });
	      //store.dispatch(stateActions.setProducerPaused(this._micProducer.id));
	      document.getElementById('button-mic').className = 'active-off'
	  }
	  catch (error) {
	      console.error('muteMic() | failed: %o', error);
	      document.getElementById('button-mic').className = 'active-on'
	  }
	}
	public unmuteMic = async () => {
	  console.log('unmuteMic()');
	  this.micProducer.resume();
	  try {
	      //await this._protoo.request('resumeProducer', { producerId: this._micProducer.id });
	      await this.mediasoupSocket.emit('resumeProducer', { producerId: this.micProducer.id });
	      document.getElementById('button-mic').className = 'active-on'
	      //store.dispatch(stateActions.setProducerResumed(this._micProducer.id));
	  }
	  catch (error) {
	      console.error('unmuteMic() | failed: %o', error);
	      document.getElementById('button-mic').className = 'active-off'
	  }
	}
	public disableMic = async () => {
	  console.log('disableMic()');
	  console.log(this.micProducer.id);
	  //await socket.emit('closeProducer', { producerId: micProducer.id })
	
	  // if (!micProducer)
	  //     return;
	  // micProducer.close();
	  // try {
	  //   await socket.emit('closeProducer', { producerId: micProducer,id })
	  // }
	  // catch (error) {
	  //     logger.error(`Error closing server-side mic Producer: ${error}`);
	  // }
	  // micProducer = null;
	}

	public buttonWebcamClicked = () => {
		const webcamStatus = document.getElementById('button-webcam').className
		if(webcamStatus === "active-on")
			this.disableWebcam()
		else
			this.enableWebcam()
	}

	public enableWebcam = async () => {
	  console.log('enableWebcam()')
	  if (this.webcamProducer){
	  	document.getElementById('button-webcam').className = 'active-on'
	    return;
	  }
	  // if (!this._mediasoupDevice.canProduce('video')) {
	  //     logger.error('enableWebcam() | cannot produce video');
	  //     return;
	  // }
	  // store.dispatch(stateActions.setWebcamInProgress(true));
	  //let stream;
	  try {
	
	    const mediaDevices = navigator.mediaDevices as any;
	    mediaDevices.getDisplayMedia({
			audio : false,
			video :
			{
			  width: 720 * (screen.width / screen.height),
			  height: 720,
			  frameRate: 30
			}
		  }).then(async (stream) =>{
	      // const localWebcam = document.getElementById('localWebcam') as HTMLVideoElement
	      // localWebcam.srcObject = stream
		
	      // create the video element
		  this.localWebcam = document.getElementById('localWebcam') as HTMLVideoElement;
	      this.localWebcam.srcObject = stream;

		  console.log('this.localWebcam:', this.localWebcam)
		
		  this.localWebcamImage = document.getElementById( 'localWebcamImage' ) as HTMLCanvasElement;
		  this.localWebcamImageContext = this.localWebcamImage.getContext( '2d' );
		  // background color if no video present
		  this.localWebcamImageContext.fillStyle = '#000000';
		  this.localWebcamImageContext.fillRect( 0, 0, this.localWebcamImage.width, this.localWebcamImage.height );
		
		  this.localWebcamTexture = new THREE.Texture( this.localWebcamImage );
		  this.localWebcamTexture.minFilter = THREE.LinearFilter;
		  this.localWebcamTexture.magFilter = THREE.LinearFilter;
		
	      let movieMaterial = new THREE.MeshBasicMaterial( { map: this.localWebcamTexture, side:THREE.DoubleSide } );
	      // the geometry on which the movie will be displayed;
	      // movie image will be scaled to fit these dimensions.
	      let movieGeometry = new THREE.PlaneGeometry( 1, 0.5, 0.1, 0.1 );
	      this.localWebcamScreen = new THREE.Mesh( movieGeometry, movieMaterial );
	      this.localWebcamScreen.position.set(
			this.myCharacter.characterCapsule.body.interpolatedPosition.x,
			this.myCharacter.characterCapsule.body.interpolatedPosition.y,
			this.myCharacter.characterCapsule.body.interpolatedPosition.z
			);

	      this.graphicsWorld.add(this.localWebcamScreen)		
		
	      this.webcamParams = { track: stream.getVideoTracks()[0], ...this.webcamDefalutParams }
		
	      this.webcamProducer = await this.producerTransport.produce(this.webcamParams);
		
	      this.webcamProducer.on('transportclose', () => {
	        this.webcamProducer = null;
	      });
	      this.webcamProducer.on('trackended', () => {
	        console.log('Webcam disconnected!');
	        this.disableWebcam()
	            // eslint-disable-next-line @typescript-eslint/no-empty-function
	            .catch(() => { });
	      });

		  document.getElementById('button-webcam').className = 'active-on'
	    })
	    .catch(error => {
	      console.log(error.message)
		  document.getElementById('button-webcam').className = 'active-off'
	    })
	
	
	    // if (!this._externalVideo) {
	    //     stream = await this._worker.getUserMedia({
	    //         video: { source: 'device' }
	    //     });
	    // }
	    // else {
	    //     stream = await this._worker.getUserMedia({
	    //         video: {
	    //             source: this._externalVideo.startsWith('http') ? 'url' : 'file',
	    //             file: this._externalVideo,
	    //             url: this._externalVideo
	    //         }
	    //     });
	    // }
	    // TODO: For testing.
	    //global.videoStream = stream;
	
	    //webcamProducer = await producerTransport.produce(webcamParams);
	    // TODO.
	    // const device = {
	    //     label: 'rear-xyz'
	    // };
	    // store.dispatch(stateActions.addProducer({
	    //     id: this._webcamProducer.id,
	    //     deviceLabel: device.label,
	    //     type: this._getWebcamType(device),
	    //     paused: this._webcamProducer.paused,
	    //     track: this._webcamProducer.track,
	    //     rtpParameters: this._webcamProducer.rtpParameters,
	    //     codec: this._webcamProducer.rtpParameters.codecs[0].mimeType.split('/')[1]
	    // }));
	    //webcamProducer.on('transportclose', () => {
	    //    webcamProducer = null;
	    //});
	    //webcamProducer.on('trackended', () => {
	    //    console.log('Webcam disconnected!');
	        // this.disableWebcam()
	        //     // eslint-disable-next-line @typescript-eslint/no-empty-function
	        //     .catch(() => { });
	    //});
	  }
	  catch (error) {
		document.getElementById('button-webcam').className = 'active-off'
	    console.error('enableWebcam() | failed:%o', error);
	    console.error('enabling Webcam!');
	      // if (track)
	      //     track.stop();
	  }
	  //store.dispatch(stateActions.setWebcamInProgress(false));
	}
	public disableWebcam = async () => {
	  console.log('disableWebcam()');
	  if (!this.webcamProducer){
		document.getElementById('button-webcam').className = 'active-off'
	    return;
	  }  
	  this.webcamProducer.close();
	  //store.dispatch(stateActions.removeProducer(this._webcamProducer.id));
	  try {
	    await this.mediasoupSocket.emit('closeProducer', { producerId: this.webcamProducer.id });
		this.graphicsWorld.remove(this.localWebcamScreen);
		document.getElementById('button-webcam').className = 'active-off'
	  }
	  catch (error) {
	      console.error(`Error closing server-side webcam Producer: ${error}`);
		  document.getElementById('button-webcam').className = 'active-off'
	  }
	  this.webcamProducer = null;
	}

	public enableShare = async () => {
	  console.log('enableShare()')
	  if (this.webcamProducer)
	      return;
	  // if (!this._mediasoupDevice.canProduce('video')) {
	  //     logger.error('enableWebcam() | cannot produce video');
	  //     return;
	  // }
	  // store.dispatch(stateActions.setWebcamInProgress(true));
	  //let stream;
	  try {
	
	    const mediaDevices = navigator.mediaDevices as any;
	    mediaDevices.getDisplayMedia({
			audio : false,
			video :
			{
			  width: 720 * (screen.width / screen.height),
			  height: 720,
			  frameRate: 30
			}
		  }).then(async (stream) =>{
	      const localShare = document.getElementById('localShare') as HTMLVideoElement
	      localShare.srcObject = stream
	      this.shareParams = { track: stream.getVideoTracks()[0], ...this.webcamDefalutParams }
		
	      this.shareProducer = await this.producerTransport.produce(this.shareParams);
		
	      this.shareProducer.on('transportclose', () => {
	        this.shareProducer = null;
	      });
	      this.shareProducer.on('trackended', () => {
	        console.log('Webcam disconnected!');
	        this.disableShare()
	            // eslint-disable-next-line @typescript-eslint/no-empty-function
	            .catch(() => { });
	      });
	    })
	    .catch(error => {
	      console.log(error.message)
	    })
	
	
	    // if (!this._externalVideo) {
	    //     stream = await this._worker.getUserMedia({
	    //         video: { source: 'device' }
	    //     });
	    // }
	    // else {
	    //     stream = await this._worker.getUserMedia({
	    //         video: {
	    //             source: this._externalVideo.startsWith('http') ? 'url' : 'file',
	    //             file: this._externalVideo,
	    //             url: this._externalVideo
	    //         }
	    //     });
	    // }
	    // TODO: For testing.
	    //global.videoStream = stream;
	
	    //webcamProducer = await producerTransport.produce(webcamParams);
	    // TODO.
	    // const device = {
	    //     label: 'rear-xyz'
	    // };
	    // store.dispatch(stateActions.addProducer({
	    //     id: this._webcamProducer.id,
	    //     deviceLabel: device.label,
	    //     type: this._getWebcamType(device),
	    //     paused: this._webcamProducer.paused,
	    //     track: this._webcamProducer.track,
	    //     rtpParameters: this._webcamProducer.rtpParameters,
	    //     codec: this._webcamProducer.rtpParameters.codecs[0].mimeType.split('/')[1]
	    // }));
	    //webcamProducer.on('transportclose', () => {
	    //    webcamProducer = null;
	    //});
	    //webcamProducer.on('trackended', () => {
	    //    console.log('Webcam disconnected!');
	        // this.disableWebcam()
	        //     // eslint-disable-next-line @typescript-eslint/no-empty-function
	        //     .catch(() => { });
	    //});
	  }
	  catch (error) {
	      console.error('enableWebcam() | failed:%o', error);
	      console.error('enabling Webcam!');
	      // if (track)
	      //     track.stop();
	  }
	  //store.dispatch(stateActions.setWebcamInProgress(false));
	}
	public disableShare = async () => {
	  console.log('disableWebcam()');
	  if (!this.shareProducer)
	      return;
		  this.shareProducer.close();
	  //store.dispatch(stateActions.removeProducer(this._webcamProducer.id));
	  try {
	    await this.mediasoupSocket.emit('closeProducer', { producerId: this.shareProducer.id });
	  }
	  catch (error) {
	      console.error(`Error closing server-side webcam Producer: ${error}`);
	  }
	  this.shareProducer = null;
	}
	
	public buttonControlClicked = () => {
	  const uiControlStatus = document.getElementById('ui-control').className
	  if(uiControlStatus === "left-panel active-on"){
	    document.getElementById('button-control').className = "active-off"
	    document.getElementById('ui-control').className = "left-panel active-off"
	  } else {
	    document.getElementById('button-control').className = "active-on"
	    document.getElementById('ui-control').className = "left-panel active-on"
	  }
	}

}