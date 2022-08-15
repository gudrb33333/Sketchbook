import '../css/main.css';
import { World } from './world/World';

const world = new World("build/assets/building_trimesh_final.glb")

document.addEventListener("DOMContentLoaded", () => {
  //const btnConnectWebRtc = document.getElementById('btnConnectWebRtc')
  const buttonMic = document.getElementById('button-mic')
  const buttonControl = document.getElementById('button-control')
  const buttonWebcam = document.getElementById('button-webcam')

  buttonMic.addEventListener('click',world.buttonMicClicked)
  buttonControl.addEventListener('click',world.buttonControlClicked)
  buttonWebcam.addEventListener('click',world.buttonWebcamClicked)

});