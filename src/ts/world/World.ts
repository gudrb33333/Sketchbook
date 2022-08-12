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
		this.AnimationMap.set("Idle",["idle", 0.1])
		this.AnimationMap.set("DropIdle",["drop_idle", 0.1])
		this.AnimationMap.set("DropRolling",["drop_running_roll", 0.03])
		this.AnimationMap.set("DropRunning",["drop_running", 0.1])
		this.AnimationMap.set("EndWalk",["stop", 0.1])
		this.AnimationMap.set("Falling",["falling", 0.3])
		this.AnimationMap.set("JumpIdle",["jump_idle", 0.1])
		this.AnimationMap.set("JumpRunning",["jump_running", 0.03])
		this.AnimationMap.set("Sprint",["sprint", 0.1])
		this.AnimationMap.set("Walk",["run", 0.1])

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

				//this.socket = new Socket("wss://hubs.local:4001/socket")		
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


							const roomName = window.location.pathname.split('/')[2]

							//const socket = io("wss://hubs.local:3000/mediasoup")
							const socket = io("wss://stream.meta-world.gudrb33333.click/mediasoup")

							socket.on('connection-success', ({ socketId }) => {
							  console.log(socketId)
							  getLocalAudioStream()
							})

							let device
							let rtpCapabilities
							let producerTransport
							let consumerTransports = []
							let micProducer
							let webcamProducer
							let shareProducer
							let consumer
							let isProducer = false
							let micParams
							let webcamParams
							let shareParams

							// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerOptions
							// https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce


							let micDefaultParams;
							let webcamDefalutParams = {
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
							let consumingTransports = [];

							const audioStreamSuccess = (stream) => {
							  const localAudio = document.getElementById('localAudio') as HTMLAudioElement
							  localAudio.srcObject = stream
							
							  micParams = { track: stream.getAudioTracks()[0], ...micDefaultParams };
							  //webcamParams = { track: stream.getVideoTracks()[0], ...webcamDefalutParams };
							
							  joinRoom()
							}

							const joinRoom = () => {
							  socket.emit('joinRoom', { roomName }, (data) => {
							    console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`)
							    // we assign to local variable and will be used when
							    // loading the client Device (see createDevice above)
							    rtpCapabilities = data.rtpCapabilities
							
							    // once we have rtpCapabilities from the Router, create Device
							    createDevice()
							  })
							}

							const getLocalAudioStream = () => {
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
							  .then(audioStreamSuccess)
							  .catch(error => {
							    console.log(error.message)
							  })
							}

							// A device is an endpoint connecting to a Router on the
							// server side to send/recive media
							const createDevice = async () => {
							  try {
							    device = new mediasoupClient.Device()
							
							    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
							    // Loads the device with RTP capabilities of the Router (server side)
							    await device.load({
							      // see getRtpCapabilities() below
							      routerRtpCapabilities: rtpCapabilities
							    })
							
							    console.log('Device RTP Capabilities', device.rtpCapabilities)
							
							    // once the device loads, create transport
							    createSendTransport()
							
							  } catch (error) {
							    console.log(error)
							    if (error.name === 'UnsupportedError')
							      console.warn('browser not supported')
							  }
							}

							const createSendTransport = () => {
							  // see server's socket.on('createWebRtcTransport', sender?, ...)
							  // this is a call from Producer, so sender = true
							  socket.emit('createWebRtcTransport', { consumer: false }, ({ params }) => {
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
							    producerTransport = device.createSendTransport(params)
							
							    // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
							    // this event is raised when a first call to transport.produce() is made
							    // see connectSendTransport() below
							    producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
							      try {
							        // Signal local DTLS parameters to the server side transport
							        // see server's socket.on('transport-connect', ...)
							        await socket.emit('transport-connect', {
							          dtlsParameters,
							        })
								
							        // Tell the transport that parameters were transmitted.
							        callback()
								
							      } catch (error) {
							        errback(error)
							      }
							    })
							
							    producerTransport.on('produce', async (parameters, callback, errback) => {
							      console.log(parameters)
								
							      try {
							        // tell the server to create a Producer
							        // with the following parameters and produce
							        // and expect back a server side producer id
							        // see server's socket.on('transport-produce', ...)
							        await socket.emit('transport-produce', {
							          kind: parameters.kind,
							          rtpParameters: parameters.rtpParameters,
							          appData: parameters.appData,
							        }, ({ id, producersExist }) => {
							          // Tell the transport that parameters were transmitted and provide it with the
							          // server side producer's id.
							          callback({ id })
									
							          // if producers exist, then join room
							          if (producersExist) getProducers()
							        })
							      } catch (error) {
							        errback(error)
							      }
							    })
							
							    //connectSendTransport
							    enableMic()
							  })
							}

							const connectSendTransport = async () => {
							  // we now call produce() to instruct the producer transport
							  // to send media to the Router
							  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
							  // this action will trigger the 'connect' and 'produce' events above
							
							  micProducer = await producerTransport.produce(micParams);
							  webcamProducer = await producerTransport.produce(webcamParams);
							
							  micProducer.on('trackended', () => {
							    console.log('audio track ended')
							
							    // close audio track
							  })
						  
							  micProducer.on('transportclose', () => {
							    console.log('audio transport ended')
							
							    // close audio track
							  })

							  webcamProducer.on('trackended', () => {
							    console.log('video track ended')
							
							    // close video track
							  })
						  
							  webcamProducer.on('transportclose', () => {
							    console.log('video transport ended')
							
							    // close video track
							  })
							}

							const signalNewConsumerTransport = async (remoteProducerId) => {
							  //check if we are already consuming the remoteProducerId
							  if (consumingTransports.includes(remoteProducerId)) return;
							  consumingTransports.push(remoteProducerId);
							
							  await socket.emit('createWebRtcTransport', { consumer: true }, ({ params }) => {
							    // The server sends back params needed 
							    // to create Send Transport on the client side
							    if (params.error) {
							      console.log(params.error)
							      return
							    }
							    console.log(`PARAMS... ${params}`)
							
							    let consumerTransport
							    try {
							      consumerTransport = device.createRecvTransport(params)
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
							        await socket.emit('transport-recv-connect', {
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
							
							    connectRecvTransport(consumerTransport, remoteProducerId, params.id)
							  })
							}

							// server informs the client of a new producer just joined
							socket.on('new-producer', ({ producerId }) => signalNewConsumerTransport(producerId))

							const getProducers = () => {
							  socket.emit('getProducers', producerIds => {
							    console.log(producerIds)
							    // for each of the producer create a consumer
							    // producerIds.forEach(id => signalNewConsumerTransport(id))
							    producerIds.forEach(signalNewConsumerTransport)
							  })
							}

							const connectRecvTransport = async (consumerTransport, remoteProducerId, serverConsumerTransportId) => {
							  // for consumer, we need to tell the server first
							  // to create a consumer based on the rtpCapabilities and consume
							  // if the router can consume, it will send back a set of params as below
							  await socket.emit('consume', {
							    rtpCapabilities: device.rtpCapabilities,
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
							
							    consumerTransports = [
							      ...consumerTransports,
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
							      newElem.innerHTML = '<audio id="' + remoteProducerId + '" autoplay></audio>'
							    } else {
							      //append to the video container
							      newElem.setAttribute('class', 'remoteVideo')
							      newElem.innerHTML = '<video id="' + remoteProducerId + '" autoplay class="video" ></video>'
							    }
								
								const videoContainer = document.getElementById('videoContainer')
							    videoContainer.appendChild(newElem)
							
							    // destructure and retrieve the video track from the producer
							    const { track } = consumer
							
								const remoteProducerIdEle =  document.getElementById(remoteProducerId) as HTMLMediaElement
							    remoteProducerIdEle.srcObject = new MediaStream([track])
							
							    // the server consumer started with media paused
							    // so we need to inform the server to resume
							    socket.emit('consumer-resume', { serverConsumerId: params.serverConsumerId })
							  })
							}

							socket.on('producer-closed', ({ remoteProducerId }) => {
							  // server notification is received when a producer is closed
							  // we need to close the client-side consumer and associated transport
							  const producerToClose = consumerTransports.find(transportData => transportData.producerId === remoteProducerId)
							  producerToClose.consumerTransport.close()
							  producerToClose.consumer.close()
							
							  // remove the consumer transport from the list
							  consumerTransports = consumerTransports.filter(transportData => transportData.producerId !== remoteProducerId)
							
							  // remove the video div element
							  const videoContainer = document.getElementById('videoContainer')
							  videoContainer.removeChild(document.getElementById(`td-${remoteProducerId}`))
							})

							const enableMic = async () => {
							  // we now call produce() to instruct the producer transport
							  // to send media to the Router
							  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
							  // this action will trigger the 'connect' and 'produce' events above
							
							  if (micProducer)
							  return;
							
							  micProducer = await producerTransport.produce(micParams);
							
							  micProducer.on('trackended', () => {
							    console.log('audio track ended')
							
							    // close audio track
							  })
						  
							  micProducer.on('transportclose', () => {
							    console.log('audio transport ended')
							
							    // close audio track
							  })
							}

							const muteMic = async () => {
							  console.log('muteMic()');
							  micProducer.pause();
							  try {
							      await socket.emit('pauseProducer', { producerId: micProducer.id });
							      //store.dispatch(stateActions.setProducerPaused(this._micProducer.id));
							  }
							  catch (error) {
							      console.error('muteMic() | failed: %o', error);
							  }
							}

							const unmuteMic = async () => {
							  console.log('unmuteMic()');
							  micProducer.resume();
							  try {
							      //await this._protoo.request('resumeProducer', { producerId: this._micProducer.id });
							      await socket.emit('resumeProducer', { producerId: micProducer.id });
							      //store.dispatch(stateActions.setProducerResumed(this._micProducer.id));
							  }
							  catch (error) {
							      console.error('unmuteMic() | failed: %o', error);
							  }
							}

							const disableMic = async () => {
							  console.log('disableMic()');
							  console.log(micProducer.id);
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

							const enableWebcam = async () => {
							  console.log('enableWebcam()')
							  if (webcamProducer)
							      return;
							  // if (!this._mediasoupDevice.canProduce('video')) {
							  //     logger.error('enableWebcam() | cannot produce video');
							  //     return;
							  // }
							  // store.dispatch(stateActions.setWebcamInProgress(true));
							  //let stream;
							  try {
							
							    navigator.mediaDevices.getUserMedia({
							      audio: false,
							      video: {
							        width: {
							          min: 640,
							          max: 1920,
							        },
							        height: {
							          min: 400,
							          max: 1080,
							        }
							      }
							    }).then(async (stream) =>{
								  const localWebcam = document.getElementById('localWebcam') as HTMLVideoElement
							      localWebcam.srcObject = stream
							      webcamParams = { track: stream.getVideoTracks()[0], ...webcamDefalutParams }
								
							      webcamProducer = await producerTransport.produce(webcamParams);
								
							      webcamProducer.on('transportclose', () => {
							        webcamProducer = null;
							      });
							      webcamProducer.on('trackended', () => {
							        console.log('Webcam disconnected!');
							        disableWebcam()
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

							const disableWebcam = async () => {
							  console.log('disableWebcam()');
							  if (!webcamProducer)
							      return;
							  webcamProducer.close();
							  //store.dispatch(stateActions.removeProducer(this._webcamProducer.id));
							  try {
							    await socket.emit('closeProducer', { producerId: webcamProducer.id });
							  }
							  catch (error) {
							      console.error(`Error closing server-side webcam Producer: ${error}`);
							  }
							  webcamProducer = null;
							}


							const enableShare = async () => {
							  console.log('enableShare()')
							  if (webcamProducer)
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
							        displaySurface : 'monitor',
							        logicalSurface : true,
							        cursor         : true,
							        width          : { max: 1920 },
							        height         : { max: 1080 },
							        frameRate      : { max: 30 }
							      }
							    }).then(async (stream) =>{
								  const localShare = document.getElementById('localShare') as HTMLVideoElement
							      localShare.srcObject = stream
							      shareParams = { track: stream.getVideoTracks()[0], ...webcamDefalutParams }
								
							      shareProducer = await producerTransport.produce(shareParams);
								
							      shareProducer.on('transportclose', () => {
							        shareProducer = null;
							      });
							      shareProducer.on('trackended', () => {
							        console.log('Webcam disconnected!');
							        disableShare()
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

							const disableShare= async () => {
							  console.log('disableWebcam()');
							  if (!shareProducer)
							      return;
							  shareProducer.close();
							  //store.dispatch(stateActions.removeProducer(this._webcamProducer.id));
							  try {
							    await socket.emit('closeProducer', { producerId: shareProducer.id });
							  }
							  catch (error) {
							      console.error(`Error closing server-side webcam Producer: ${error}`);
							  }
							  shareProducer = null;
							}


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

			
			if(this.myCharacter != null && this.myCharacter.charState.constructor.name ==='Idle' && this.idleState < 61){
				this.channel.push("naf", { 
					"sessionId" : this.myCharacter.sessionId,
					"positionX" : this.myCharacter.position.x,
					"positionY" : this.myCharacter.position.y,
					"positionZ" : this.myCharacter.position.z,
					"animation" : this.myCharacter.charState.constructor.name,
					"orientationX" : this.myCharacter.orientation.x,
					"orientationY" : this.myCharacter.orientation.y,
					"orientationZ" : this.myCharacter.orientation.z,
				})
				this.idleState ++;
				//console.log("idleState:",this.idleState)
			}else if(this.myCharacter != null && this.myCharacter.charState.constructor.name !='Idle'){
				this.channel.push("naf", { 
					"sessionId" : this.myCharacter.sessionId,
					"positionX" : this.myCharacter.position.x,
					"positionY" : this.myCharacter.position.y,
					"positionZ" : this.myCharacter.position.z,
					"animation" : this.myCharacter.charState.constructor.name,
					"orientationX" : this.myCharacter.orientation.x,
					"orientationY" : this.myCharacter.orientation.y,
					"orientationZ" : this.myCharacter.orientation.z,
				})
				this.idleState = 0
				//console.log("idleState:",this.idleState)
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
				<div class="github-corner">
					<a href="https://github.com/swift502/Sketchbook" target="_blank" title="Fork me on GitHub">
						<svg viewbox="0 0 100 100" fill="currentColor">
							<title>Fork me on GitHub</title>
							<path d="M0 0v100h100V0H0zm60 70.2h.2c1 2.7.3 4.7 0 5.2 1.4 1.4 2 3 2 5.2 0 7.4-4.4 9-8.7 9.5.7.7 1.3 2
							1.3 3.7V99c0 .5 1.4 1 1.4 1H44s1.2-.5 1.2-1v-3.8c-3.5 1.4-5.2-.8-5.2-.8-1.5-2-3-2-3-2-2-.5-.2-1-.2-1
							2-.7 3.5.8 3.5.8 2 1.7 4 1 5 .3.2-1.2.7-2 1.2-2.4-4.3-.4-8.8-2-8.8-9.4 0-2 .7-4 2-5.2-.2-.5-1-2.5.2-5
							0 0 1.5-.6 5.2 1.8 1.5-.4 3.2-.6 4.8-.6 1.6 0 3.3.2 4.8.7 2.8-2 4.4-2 5-2z"></path>
						</svg>
					</a>
				</div>
				<div class="left-panel">
					<div id="controls" class="panel-segment flex-bottom"></div>
				</div>
			</div>
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
		//console.log(data)
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
}