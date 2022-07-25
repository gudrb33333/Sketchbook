import { ISpawnPoint } from '../interfaces/ISpawnPoint';
import * as THREE from 'three';
import { World } from './World';
import { Character } from '../characters/Character';
import { LoadingManager } from '../core/LoadingManager';
import * as Utils from '../core/FunctionLibrary';
import {Socket} from "phoenix"

export class CharacterSpawnPoint implements ISpawnPoint
{
	private object: THREE.Object3D;

	constructor(object: THREE.Object3D)
	{
		this.object = object;
	}
	
	public spawn(loadingManager: LoadingManager, world: World): void
	{
		loadingManager.loadGLTF('build/assets/female/readyFemale.glb', (model) =>
		{

			let mixer = new THREE.AnimationMixer(model.scene);
			let test = new Array<THREE.AnimationClip>()
	
			loadingManager.loadGLTF('build/assets/female/readyIdleFemale.glb', (gltf) => {
				const animationAction = mixer.clipAction((gltf as any).animations[0])
				animationAction.getClip().name = "idle"
				test.push(animationAction.getClip())

				loadingManager.loadGLTF('build/assets/female/readySlowRunFemaleInPlace.glb', (gltf) => {
					const animationAction = mixer.clipAction((gltf as any).animations[0])
					animationAction.getClip().name = "run"
					test.push(animationAction.getClip())
				})

					loadingManager.loadGLTF('build/assets/female/readyRunToStopFemaleInPlace.glb', (gltf) => {
						const animationAction = mixer.clipAction((gltf as any).animations[0])
						animationAction.getClip().name = "stop"
						test.push(animationAction.getClip())

						loadingManager.loadGLTF('build/assets/female/readyFastRunFemale.glb', (gltf) => {
							const animationAction = mixer.clipAction((gltf as any).animations[0])
							animationAction.getClip().name = "sprint"
							test.push(animationAction.getClip())

							loadingManager.loadGLTF('build/assets/female/readyDropIdleFemale_66.glb', (gltf) => {
								const animationAction = mixer.clipAction((gltf as any).animations[0])
								animationAction.getClip().name = "drop_idle"
								test.push(animationAction.getClip())

								loadingManager.loadGLTF('build/assets/female/readyJumpIdleFemale.glb', (gltf) => {
									const animationAction = mixer.clipAction((gltf as any).animations[0])
									animationAction.getClip().name = "jump_idle"
									test.push(animationAction.getClip())

									loadingManager.loadGLTF('build/assets/female/readyJumpingIdleFemale_55.glb', (gltf) => {
										const animationAction = mixer.clipAction((gltf as any).animations[0])
										animationAction.getClip().name = "falling"
										test.push(animationAction.getClip())

										loadingManager.loadGLTF('build/assets/female/readyJumpIdleFemale.glb', (gltf) => {
											const animationAction = mixer.clipAction((gltf as any).animations[0])
											animationAction.getClip().name = "jump_running"
											test.push(animationAction.getClip())

											loadingManager.loadGLTF('build/assets/female/readyRunningDropFemale_77.glb', (gltf) => {
												const animationAction = mixer.clipAction((gltf as any).animations[0])
												animationAction.getClip().name = "drop_running"
												test.push(animationAction.getClip())
												
												loadingManager.loadGLTF('build/assets/female/readySprintingForwardRollFemaleOveride91.glb', (gltf) => {
													const animationAction = mixer.clipAction((gltf as any).animations[0])
													animationAction.getClip().name = "drop_running_roll"
													test.push(animationAction.getClip())
																			 
												
												let socket = new Socket("ws://localhost:4000/socket", {params: {}})		
												socket.connect()

												let hubPhxChannel = socket.channel("hub:42232", {})
												hubPhxChannel.join()
  													.receive("ok", resp => { console.log("Joined successfully", resp) })
  													.receive("error", resp => { console.log("Unable to join", resp) })

												const test11111 = () => {
												  return new Promise((resolve, reject) => {
													hubPhxChannel
												        .push("ping",{"test":"1111"})
												        .receive("ok", res => {
												          console.log(res)
												          resolve(res);
												        })
												        .receive("error", reject);
												  });
												}
												
												test11111()

												model.animations = test
												let player = new Character(model);
										
												let worldPos = new THREE.Vector3();
												this.object.getWorldPosition(worldPos);
												player.setPosition(worldPos.x, worldPos.y, worldPos.z);
										
												let forward = Utils.getForward(this.object);
												player.setOrientation(forward, true);
										
												world.add(player);
												player.takeControl();
												
												})


												
											
											})

																			

										})


									})

								
								})

							})


						})
	
					})
			});

			// loadingManager.loadGLTF('build/assets/female/readySlowRunFemaleInPlace.glb', (gltf) => {
			// 	const animationAction = mixer.clipAction((gltf as any).animations[0])
			// 	animationAction.getClip().name = "run"
			// 	test.push(animationAction.getClip())
			// });

			// loadingManager.loadGLTF('build/assets/female/readyFallingFemale.glb', (gltf) => {
			// 	const animationAction = mixer.clipAction((gltf as any).animations[0])
			// 	animationAction.getClip().name = "falling"
			// 	test.push(animationAction.getClip())
			// });
		});
	}
}