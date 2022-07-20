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
		loadingManager.loadGLTF('https://d1a370nemizbjq.cloudfront.net/a50b4fe2-4330-4b6b-90be-173ac4df5cc4.glb', (model) =>
		{

			let mixer = new THREE.AnimationMixer(model.scene);
			let test = new Array<THREE.AnimationClip>()
	
			loadingManager.loadGLTF('build/assets/male/readyIdleMale.glb', (gltf) => {
				const animationAction = mixer.clipAction((gltf as any).animations[0])
				animationAction.getClip().name = "idle"
				test.push(animationAction.getClip())

				loadingManager.loadGLTF('build/assets/male/readySlowRunMale.glb', (gltf) => {
					const animationAction = mixer.clipAction((gltf as any).animations[0])
					animationAction.getClip().name = "run"
					test.push(animationAction.getClip())
				})

				loadingManager.loadGLTF('build/assets/female/readyFallingFemale.glb', (gltf) => {
					const animationAction = mixer.clipAction((gltf as any).animations[0])
					animationAction.getClip().name = "falling"
					test.push(animationAction.getClip())


					loadingManager.loadGLTF('build/assets/female/readyRunToStopFemaleInPlace.glb', (gltf) => {
						const animationAction = mixer.clipAction((gltf as any).animations[0])
						animationAction.getClip().name = "stop"
						test.push(animationAction.getClip())

						loadingManager.loadGLTF('build/assets/female/readyFastRunFemale.glb', (gltf) => {
							const animationAction = mixer.clipAction((gltf as any).animations[0])
							animationAction.getClip().name = "sprint"
							test.push(animationAction.getClip())

							loadingManager.loadGLTF('build/assets/female/readyFallingFemaleIdle.glb', (gltf) => {
								const animationAction = mixer.clipAction((gltf as any).animations[0])
								animationAction.getClip().name = "drop_idle"
								test.push(animationAction.getClip())

								loadingManager.loadGLTF('build/assets/female/readySlowRunFemaleInPlace.glb', (gltf) => {
									const animationAction = mixer.clipAction((gltf as any).animations[0])
									animationAction.getClip().name = "start_right"
									test.push(animationAction.getClip())

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