import type { LanPeerDebug } from "./protocol.ts";

export const LAN_RTC_CONFIGURATION: RTCConfiguration = Object.freeze({
  iceServers: [],
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
});

export interface LanDataChannels {
  state: RTCDataChannel;
  reliable: RTCDataChannel;
}

export type LanEventHandler = (payload: unknown) => void;

export class LanEventEmitter {
  private handlers = new Map<string, Set<LanEventHandler>>();

  on(type: string, handler: LanEventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  emit(type: string, payload: unknown = {}): void {
    for (const handler of this.handlers.get(type) || []) handler(payload);
  }

  clearHandlers(): void {
    this.handlers.clear();
  }
}

export function createLanPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection(LAN_RTC_CONFIGURATION);
}

export function createHostDataChannels(peer: RTCPeerConnection): LanDataChannels {
  return {
    state: peer.createDataChannel("state", { ordered: false, maxRetransmits: 0 }),
    reliable: peer.createDataChannel("reliable", { ordered: true }),
  };
}

export function collectClientDataChannels(
  peer: RTCPeerConnection,
  onReady: (channels: LanDataChannels) => void,
): () => void {
  const channels: Partial<LanDataChannels> = {};
  const listener = (event: RTCDataChannelEvent) => {
    if (event.channel.label === "state") channels.state = event.channel;
    if (event.channel.label === "reliable") channels.reliable = event.channel;
    if (channels.state && channels.reliable) onReady(channels as LanDataChannels);
  };
  peer.addEventListener("datachannel", listener);
  return () => peer.removeEventListener("datachannel", listener);
}

export function waitForIceGatheringComplete(peer: RTCPeerConnection, timeoutMs = 12000): Promise<RTCSessionDescriptionInit> {
  if (peer.iceGatheringState === "complete" && peer.localDescription) {
    return Promise.resolve({ type: peer.localDescription.type, sdp: peer.localDescription.sdp });
  }
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error("ICE gathering did not complete before the LAN signaling timeout."));
    }, timeoutMs);
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onChange);
    };
    const onChange = () => {
      if (peer.iceGatheringState !== "complete" || !peer.localDescription) return;
      const description = { type: peer.localDescription.type, sdp: peer.localDescription.sdp };
      cleanup();
      resolve(description);
    };
    peer.addEventListener("icegatheringstatechange", onChange);
    onChange();
  });
}

export async function createCompleteOffer(peer: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  await peer.setLocalDescription(await peer.createOffer());
  return waitForIceGatheringComplete(peer);
}

export async function createCompleteAnswer(peer: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  await peer.setLocalDescription(await peer.createAnswer());
  return waitForIceGatheringComplete(peer);
}

export function sendChannel(channel: RTCDataChannel | null | undefined, payload: string): boolean {
  if (!channel || channel.readyState !== "open") return false;
  channel.send(payload);
  return true;
}

export function closePeer(peer: RTCPeerConnection, channels?: Partial<LanDataChannels>): void {
  for (const channel of [channels?.state, channels?.reliable]) {
    if (channel && channel.readyState !== "closed") channel.close();
  }
  if (peer.signalingState !== "closed") peer.close();
}

export function peerDebug(
  id: string,
  alias: string,
  peer: RTCPeerConnection,
  channels: Partial<LanDataChannels>,
  rttMs: number | null,
): LanPeerDebug {
  return {
    id,
    alias,
    connectionState: peer.connectionState,
    iceState: peer.iceConnectionState,
    stateChannel: channels.state?.readyState || "closed",
    reliableChannel: channels.reliable?.readyState || "closed",
    rttMs,
  };
}
