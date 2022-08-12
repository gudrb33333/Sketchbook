import { EventEmitter } from "eventemitter3";
import * as protooClient from "protoo-client";
import * as mediasoupClient from "mediasoup-client";
//import { debug as newDebug } from "debug";

export const DIALOG_CONNECTION_CONNECTED = "dialog-connection-connected";
export const DIALOG_CONNECTION_ERROR_FATAL = "dialog-connection-error-fatal";

const PC_PROPRIETARY_CONSTRAINTS = {
  optional: [{ googDscp: true }]
};


//const debug = newDebug("naf-dialog-adapter:debug");
//const warn = newDebug("naf-dialog-adapter:warn");
//const error = newDebug("naf-dialog-adapter:error");
//const info = newDebug("naf-dialog-adapter:info");

export class DialogAdapter extends EventEmitter{
  private _micShouldBeEnabled: boolean;
  private _micProducer: any;
  private _cameraProducer: any;
  private _shareProducer: any;
  private _localMediaStream: any;
  private _consumers: Map<any, any>;
  private _pendingMediaRequests: Map<any, any>;
  private _blockedClients: Map<any, any>;
  private _forceTcp: boolean;
  private _forceTurn: boolean;
  private _iceTransportPolicy: any;
  private scene: any;
  private _serverParams: {};
  private _consumerStats: {};
  private _downlinkBwe: any;
  private _serverUrl: any;
  private _roomId: any;
  private _joinToken: any;
  private _clientId: any;
  private _protoo: any;
  private _sendTransport: any;
  private _recvTransport: any;
  private _mediasoupDevice: mediasoupClient.types.Device;
  private _device: any;
  private _useDataChannel: any;

  constructor() {
    super()
    this._micShouldBeEnabled = false;
    this._micProducer = null;
    this._cameraProducer = null;
    this._shareProducer = null;
    this._localMediaStream = null;
    this._consumers = new Map();
    this._pendingMediaRequests = new Map();
    this._blockedClients = new Map();
    this._forceTcp = false;
    this._forceTurn = false;
    this._iceTransportPolicy = null;
    this.scene = null;
    this._serverParams = {host:String, port:Number, };
    this._consumerStats = {};
  }

  get consumerStats() {
    return this._consumerStats;
  }
    
  get downlinkBwe() {
    return this._downlinkBwe;
  }

  async connect({
    serverUrl,
    roomId,
    //joinToken,
    serverParams,
    //scene,
    clientId,
    forceTcp,
    forceTurn,
    iceTransportPolicy
  }) {
    this._serverUrl = serverUrl;
    this._roomId = roomId;
    //this._joinToken = joinToken;
    this._serverParams = serverParams;
    this._clientId = clientId;
    //this.scene = scene;
    this._forceTcp = forceTcp;
    this._forceTurn = forceTurn;
    this._iceTransportPolicy = iceTransportPolicy
    const urlWithParams = new URL(this._serverUrl);
    urlWithParams.searchParams.append("roomId", this._roomId);
    urlWithParams.searchParams.append("peerId", this._clientId);

    // TODO: Establishing connection could take a very long time.
    //       Inform the user if we are stuck here.
    const protooTransport = new protooClient.WebSocketTransport(urlWithParams.toString(), {
        retry: { retries: 2 }
    });

    this._protoo = new protooClient.Peer(protooTransport);
    
    this._protoo.on("close", async () => {
      // We explicitly disconnect event handlers when closing the socket ourselves,
      // so if we get into here, we were not the ones closing the connection.
      this.emitRTCEvent("error", "Signaling", () => `Closed`);
      this._retryConnectWithNewHost();
    });

    this._protoo.on("request", async (request, accept, reject) => {
      this.emitRTCEvent("info", "Signaling", () => `Request [${request.method}]: ${request.data?.id}`);
        //debug('proto "request" event [method:%s, data:%o]', request.method, request.data?.id
        console.log("request.method:",request.method)
        switch (request.method) {
          case "newConsumer": {
            const {
              peerId,
              producerId,
              id,
              kind,
              rtpParameters,
              /*type, */ appData /*, producerPaused */
            } = request.data;
  
            try {
              const consumer = await this._recvTransport.consume({
                id,
                producerId,
                kind,
                rtpParameters,
                appData: { ...appData, peerId } // Trick.
              });
  
              // Store in the map.
              this._consumers.set(consumer.id, consumer);
  
              consumer.on("transportclose", () => {
                this.emitRTCEvent("error", "RTC", () => `Consumer transport closed`);
                this.removeConsumer(consumer.id);
              });
  
              if (kind === "video") {
                const { spatialLayers, temporalLayers } = mediasoupClient.parseScalabilityMode(
                  consumer.rtpParameters.encodings[0].scalabilityMode
                );
  
                this._consumerStats[consumer.id] = this._consumerStats[consumer.id] || {};
                this._consumerStats[consumer.id]["spatialLayers"] = spatialLayers;
                this._consumerStats[consumer.id]["temporalLayers"] = temporalLayers;
              }
  
              // We are ready. Answer the protoo request so the server will
              // resume this Consumer (which was paused for now if video).
              accept();
  
              this.resolvePendingMediaRequestForTrack(peerId, consumer.track);
  
              // Notify of an stream update event
              this.emit("stream_updated", peerId, kind);
            } catch (err) {
              this.emitRTCEvent("error", "Adapter", () => `Error: ${err}`);
              //error('"newConsumer" request failed:%o', err);
  
              throw err;
            }
  
            break;
          }
        }
    });

    return new Promise<void>((resolve, reject) => {
      this._protoo.on("open", async () => {
        this.emitRTCEvent("info", "Signaling", () => `Open`);

        try {
          await this._joinRoom();
          resolve();
          this.emit(DIALOG_CONNECTION_CONNECTED);
        } catch (err) {
          this.emitRTCEvent("warn", "Adapter", (error) => `Error during connect: ${error}`);
          reject(err);
          this.emit(DIALOG_CONNECTION_ERROR_FATAL);
        }
      });
    });
  }

  async _joinRoom() {
    //debug("_joinRoom()");

    this._mediasoupDevice = new mediasoupClient.Device({});

    const routerRtpCapabilities = await this._protoo.request("getRouterRtpCapabilities");

    await this._mediasoupDevice.load({ routerRtpCapabilities });

    //const { host, port, turn } = this._serverParams;

    const host = "hubs.local"
    const port = 4443
    const turn = {credential: 't0yyUhwV1OsDw/teLOB/DwUTnME=', enabled: true, transports: [{port: 5349}], username: '1659089316:coturn'}

    const iceServers = this.getIceServers(host, port, turn);

    await this.createSendTransport(iceServers);
    await this.createRecvTransport(iceServers);

    await this._protoo.request("join", {
      displayName: this._clientId,
      device: this._device,
      rtpCapabilities: this._mediasoupDevice.rtpCapabilities,
      sctpCapabilities: this._useDataChannel ? this._mediasoupDevice.sctpCapabilities : undefined,
      token: this._joinToken
    });

    if (this._localMediaStream) {
      // TODO: Refactor to be "Create producers"
      //await this.setLocalMediaStream(this._localMediaStream);
    }
  }

  async createSendTransport(iceServers) {
    // Create mediasoup Transport for sending (unless we don't want to produce).
    const sendTransportInfo = await this._protoo.request("createWebRtcTransport", {
      producing: true,
      consuming: false,
      sctpCapabilities: undefined
    });

    this._sendTransport = this._mediasoupDevice.createSendTransport({
      id: sendTransportInfo.id,
      iceParameters: sendTransportInfo.iceParameters,
      iceCandidates: sendTransportInfo.iceCandidates,
      dtlsParameters: sendTransportInfo.dtlsParameters,
      sctpParameters: sendTransportInfo.sctpParameters,
      iceServers,
      iceTransportPolicy: this._iceTransportPolicy,
      proprietaryConstraints: PC_PROPRIETARY_CONSTRAINTS
    });

    console.log("createSendTransport111111111111")

    this._sendTransport.on("connect", (
      { dtlsParameters },
      callback,
      errback // eslint-disable-line no-shadow
    ) => {
      // this.emitRTCEvent("info", "RTC", () => `Send transport [connect]`);
      // this._sendTransport.observer.on("close", () => {
      //   this.emitRTCEvent("info", "RTC", () => `Send transport [close]`);
      // });
      // this._sendTransport.observer.on("newproducer", producer => {
      //   this.emitRTCEvent("info", "RTC", () => `Send transport [newproducer]: ${producer.id}`);
      // });
      // this._sendTransport.observer.on("newconsumer", consumer => {
      //   this.emitRTCEvent("info", "RTC", () => `Send transport [newconsumer]: ${consumer.id}`);
      // });

      console.log("createSendTransport22222222222222")

      this._protoo
        .request("connectWebRtcTransport", {
          transportId: this._sendTransport.id,
          dtlsParameters,
          test: "createSendTransport"
        })
        .then(callback)
        .catch(errback);
    });

    this._sendTransport.on("connectionstatechange", connectionState => {
      let level = "info";
      if (connectionState === "failed" || connectionState === "disconnected") {
        level = "error";
      }
      this.emitRTCEvent(level, "RTC", () => `Send transport [connectionstatechange]: ${connectionState}`);

      this.checkSendIceStatus(connectionState);
    });

    this._sendTransport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
      this.emitRTCEvent("info", "RTC", () => `Send transport [produce]: ${kind}`);
      try {
        // eslint-disable-next-line no-shadow
        const { id } = await this._protoo.request("produce", {
          transportId: this._sendTransport.id,
          kind,
          rtpParameters,
          appData
        });

        callback({ id });
      } catch (error) {
        this.emitRTCEvent("error", "Signaling", () => `[produce] error: ${error}`);
        errback(error);
      }
    });
  }

  /**
  * Checks the Send Transport ICE status and restarts it in case is in failed state.
  * This is called by the Send Transport "connectionstatechange" event listener.
  * @param {boolean} connectionState The transport connnection state (ICE connection state)
  */
  checkSendIceStatus(connectionState) {
    // If the ICE connection state is failed, we force an ICE restart
    if (connectionState === "failed") {
      console.log("connectionState faild")
      //this.restartSendICE();
    }
  }

  async createRecvTransport(iceServers) {
    // Create mediasoup Transport for sending (unless we don't want to consume).
    const recvTransportInfo = await this._protoo.request("createWebRtcTransport", {
      producing: false,
      consuming: true,
      sctpCapabilities: undefined
    });

    this._recvTransport = this._mediasoupDevice.createRecvTransport({
      id: recvTransportInfo.id,
      iceParameters: recvTransportInfo.iceParameters,
      iceCandidates: recvTransportInfo.iceCandidates,
      dtlsParameters: recvTransportInfo.dtlsParameters,
      sctpParameters: recvTransportInfo.sctpParameters,
      iceServers,
      iceTransportPolicy: this._iceTransportPolicy
    });

    this._recvTransport.on("connect", (
      { dtlsParameters },
      callback,
      errback // eslint-disable-line no-shadow
    ) => {
      this.emitRTCEvent("info", "RTC", () => `Receive transport [connect]`);
      this._recvTransport.observer.on("close", () => {
        this.emitRTCEvent("info", "RTC", () => `Receive transport [close]`);
      });
      this._recvTransport.observer.on("newproducer", producer => {
        this.emitRTCEvent("info", "RTC", () => `Receive transport [newproducer]: ${producer.id}`);
      });
      this._recvTransport.observer.on("newconsumer", consumer => {
        this.emitRTCEvent("info", "RTC", () => `Receive transport [newconsumer]: ${consumer.id}`);
      });

      this._protoo
        .request("connectWebRtcTransport", {
          transportId: this._recvTransport.id,
          dtlsParameters
        })
        .then(callback)
        .catch(errback);
    });

    this._recvTransport.on("connectionstatechange", connectionState => {
      let level = "info";
      if (connectionState === "failed" || connectionState === "disconnected") {
        level = "error";
      }
      this.emitRTCEvent(level, "RTC", () => `Receive transport [connectionstatechange]: ${connectionState}`);

      this.checkRecvIceStatus(connectionState);
    });
  }

  /**
  * Checks the ReeceiveReeceive Transport ICE status and restarts it in case is in failed state.
  * This is called by the Reeceive Transport "connectionstatechange" event listener.
  * @param {boolean} connectionState The transport connection state (ICE connection state)
  */
  checkRecvIceStatus(connectionState) {
    // If the ICE connection state is failed, we force an ICE restart
    if (connectionState === "failed") {
      console.log("connectionState faild")
      //this.restartRecvICE();
    }
  }

  getIceServers(host, port, turn) {
    const iceServers = [];

    this._serverUrl = `wss://${host}:${port}`;

    if (turn && turn.enabled) {
      turn.transports.forEach(ts => {
        // Try both TURN DTLS and TCP/TLS
        if (!this._forceTcp) {
          iceServers.push({
            urls: `turns:${host}:${ts.port}`,
            username: turn.username,
            credential: turn.credential
          });
        }

        iceServers.push({
          urls: `turns:${host}:${ts.port}?transport=tcp`,
          username: turn.username,
          credential: turn.credential
        });
      });
      iceServers.push({ urls: "stun:stun1.l.google.com:19302" });
    } else {
      iceServers.push({ urls: "stun:stun1.l.google.com:19302" }, { urls: "stun:stun2.l.google.com:19302" });
    }

    return iceServers;
  }

  emitRTCEvent(level, tag, msgFunc) {
        //if (!window.APP.store.state.preferences.showRtcDebugPanel) return;
        const time = new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "numeric",
          minute: "numeric",
          second: "numeric"
        });
        //this.scene.emit("rtc_event", { level, tag, time, msg: msgFunc() });
  }

  cleanUpLocalState() {
        this._sendTransport && this._sendTransport.close();
        this._sendTransport = null;
        this._recvTransport && this._recvTransport.close();
        this._recvTransport = null;
        this._micProducer = null;
        this._shareProducer = null;
        this._cameraProducer = null;
  }

  async _retryConnectWithNewHost() {
        this.cleanUpLocalState();
        this._protoo.removeAllListeners();
        //const serverParams = await APP.hubChannel.getHost();
        const serverParams = {host:"https://hubs.local", port:4443}
        const { host, port } = serverParams;
        const newServerUrl = `wss://${host}:${port}`;
        if (this._serverUrl === newServerUrl) {
          console.error("Reconnect to dialog failed.");
          this.emit(DIALOG_CONNECTION_ERROR_FATAL);
          return;
        }
        console.log(`The Dialog server has changed to ${newServerUrl}, reconnecting with the new server...`);
        await this.connect({
          serverUrl: newServerUrl,
          roomId: this._roomId,
          //joinToken: APP.hubChannel.token,
          serverParams,
          //scene: this.scene,
          clientId: this._clientId,
          forceTcp: this._forceTcp,
          forceTurn: this._forceTurn,
          iceTransportPolicy: this._iceTransportPolicy
        });
  }

  removeConsumer(consumerId) {
    this.emitRTCEvent("info", "RTC", () => `Consumer removed: ${consumerId}`);
    this._consumers.delete(consumerId);
  }

  resolvePendingMediaRequestForTrack(clientId, track) {
        const requests = this._pendingMediaRequests.get(clientId);
    
        if (requests && requests[track.kind]) {
          const resolve = requests[track.kind].resolve;
          delete requests[track.kind];
          resolve(new MediaStream([track]));
        }
    
        if (requests && Object.keys(requests).length === 0) {
          this._pendingMediaRequests.delete(clientId);
        }
  }

  disconnect() {
        //debug("disconnect()");
        this.cleanUpLocalState();
        if (this._protoo) {
          this._protoo.removeAllListeners();
          if (this._protoo.connected) {
            this._protoo.close();
            this.emitRTCEvent("info", "Signaling", () => `[close]`);
          }
        }
  }
}