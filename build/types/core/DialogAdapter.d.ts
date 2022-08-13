import { EventEmitter } from "eventemitter3";
export declare const DIALOG_CONNECTION_CONNECTED = "dialog-connection-connected";
export declare const DIALOG_CONNECTION_ERROR_FATAL = "dialog-connection-error-fatal";
export declare class DialogAdapter extends EventEmitter {
    private _micShouldBeEnabled;
    private _micProducer;
    private _cameraProducer;
    private _shareProducer;
    private _localMediaStream;
    private _consumers;
    private _pendingMediaRequests;
    private _blockedClients;
    private _forceTcp;
    private _forceTurn;
    private _iceTransportPolicy;
    private scene;
    private _serverParams;
    private _consumerStats;
    private _downlinkBwe;
    private _serverUrl;
    private _roomId;
    private _joinToken;
    private _clientId;
    private _protoo;
    private _sendTransport;
    private _recvTransport;
    private _mediasoupDevice;
    private _device;
    private _useDataChannel;
    constructor();
    get consumerStats(): {};
    get downlinkBwe(): any;
    connect({ serverUrl, roomId, serverParams, clientId, forceTcp, forceTurn, iceTransportPolicy }: {
        serverUrl: any;
        roomId: any;
        serverParams: any;
        clientId: any;
        forceTcp: any;
        forceTurn: any;
        iceTransportPolicy: any;
    }): Promise<void>;
    _joinRoom(): Promise<void>;
    createSendTransport(iceServers: any): Promise<void>;
    /**
    * Checks the Send Transport ICE status and restarts it in case is in failed state.
    * This is called by the Send Transport "connectionstatechange" event listener.
    * @param {boolean} connectionState The transport connnection state (ICE connection state)
    */
    checkSendIceStatus(connectionState: any): void;
    createRecvTransport(iceServers: any): Promise<void>;
    /**
    * Checks the ReeceiveReeceive Transport ICE status and restarts it in case is in failed state.
    * This is called by the Reeceive Transport "connectionstatechange" event listener.
    * @param {boolean} connectionState The transport connection state (ICE connection state)
    */
    checkRecvIceStatus(connectionState: any): void;
    getIceServers(host: any, port: any, turn: any): any[];
    emitRTCEvent(level: any, tag: any, msgFunc: any): void;
    cleanUpLocalState(): void;
    _retryConnectWithNewHost(): Promise<void>;
    removeConsumer(consumerId: any): void;
    resolvePendingMediaRequestForTrack(clientId: any, track: any): void;
    disconnect(): void;
}
