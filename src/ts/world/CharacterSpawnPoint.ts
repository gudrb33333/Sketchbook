import { ISpawnPoint } from '../interfaces/ISpawnPoint';
import * as THREE from 'three';
import { World } from './World';
import { Character } from '../characters/Character';
import { LoadingManager } from '../core/LoadingManager';
import * as Utils from '../core/FunctionLibrary';

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

												model.animations = test
												let player = new Character(model);
										
												let worldPos = new THREE.Vector3();
												//this.object.getWorldPosition(worldPos);
												//console.log(this.object.getWorldPosition(worldPos))
												player.setPosition(-0.08083007484674454, 2.3437719345092773, -0.27053260803222656);
										
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


	public spawnAvatar(loadingManager: LoadingManager, world: World, sessionId: string): void
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

												model.animations = test
												const player = new Character(model);
												player.sessionId = sessionId

												let worldPos = new THREE.Vector3();
												//this.object.getWorldPosition(worldPos);
												//console.log(this.object.getWorldPosition(worldPos))
												player.setPosition(-0.08083007484674454, 2.3437719345092773, -0.27053260803222656);
										
												let forward = Utils.getForward(this.object);
												player.setOrientation(forward, false);
										
												
												world.add(player);
												world.characterMap.set(sessionId, player)
												//player.takeControl();
												
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