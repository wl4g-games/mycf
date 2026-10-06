import QRCode from "qrcode";
import { strFromU8, strToU8, unzlibSync, zlibSync } from "fflate";

import {
  LAN_PROTOCOL_VERSION, LAN_SIGNAL_TTL_MS,
  type LanSignalEnvelope, type LanSignalKind,
} from "./protocol.ts";

const SIGNAL_PREFIX = "MYCF-LAN1:";
const MAX_SIGNAL_CHARACTERS = 2900;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x4000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x4000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64ToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function validateSignal(signal: unknown, expectedKind?: LanSignalKind): LanSignalEnvelope {
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) throw new Error("The scanned LAN signal is invalid.");
  const candidate = signal as Partial<LanSignalEnvelope>;
  if (candidate.version !== LAN_PROTOCOL_VERSION) throw new Error("The scanned LAN signal uses an unsupported protocol version.");
  if (candidate.kind !== "offer" && candidate.kind !== "answer") throw new Error("The scanned LAN signal type is invalid.");
  if (expectedKind && candidate.kind !== expectedKind) throw new Error(`Expected a LAN ${expectedKind} QR code.`);
  if (!candidate.roomId || !candidate.slotId || !Number.isFinite(candidate.createdAt)) throw new Error("The scanned LAN signal is incomplete.");
  if (Math.abs(Date.now() - Number(candidate.createdAt)) > LAN_SIGNAL_TTL_MS) throw new Error("The scanned LAN signal has expired.");
  const description = candidate.description;
  if (!description || typeof description.sdp !== "string" || description.type !== candidate.kind) {
    throw new Error("The scanned LAN session description is invalid.");
  }
  return candidate as LanSignalEnvelope;
}

export function encodeLanSignal(signal: LanSignalEnvelope): string {
  const encoded = bytesToBase64(zlibSync(strToU8(JSON.stringify(validateSignal(signal))), { level: 9 }));
  const value = `${SIGNAL_PREFIX}${encoded}`;
  if (value.length > MAX_SIGNAL_CHARACTERS) {
    throw new Error("The complete LAN session description is too large for one QR code.");
  }
  return value;
}

export function decodeLanSignal(value: string, expectedKind?: LanSignalKind): LanSignalEnvelope {
  const text = String(value || "").trim();
  if (!text.startsWith(SIGNAL_PREFIX)) throw new Error("This QR code is not a MyCF LAN invitation.");
  try {
    const json = strFromU8(unzlibSync(base64ToBytes(text.slice(SIGNAL_PREFIX.length))));
    return validateSignal(JSON.parse(json), expectedKind);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The scanned LAN")) throw error;
    throw new Error("The MyCF LAN QR payload could not be decoded.");
  }
}

export async function renderLanQr(canvas: HTMLCanvasElement, value: string): Promise<void> {
  await QRCode.toCanvas(canvas, value, {
    errorCorrectionLevel: "L",
    margin: 2,
    width: Math.min(420, Math.max(260, Math.round(globalThis.innerWidth * .72 || 320))),
    color: { dark: "#173049", light: "#fff7d6" },
  });
}

export class LanQrScanner {
  private scanner: import("html5-qrcode").Html5Qrcode | null = null;
  private decoding = false;
  private readonly elementId: string;

  constructor(elementId: string) {
    this.elementId = elementId;
  }

  async start(onDecoded: (value: string) => void, onError: (error: Error) => void = () => {}): Promise<void> {
    await this.stop();
    const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
    this.scanner = new Html5Qrcode(this.elementId, {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported: true,
    });
    this.decoding = false;
    await this.scanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: (width, height) => {
          const edge = Math.max(180, Math.min(300, Math.floor(Math.min(width, height) * .72)));
          return { width: edge, height: edge };
        },
        aspectRatio: 1,
      },
      value => {
        if (this.decoding) return;
        this.decoding = true;
        void this.stop().then(() => onDecoded(value)).catch(error => onError(error as Error));
      },
      () => {},
    );
  }

  async scanFile(file: File): Promise<string> {
    await this.stop();
    const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
    this.scanner = new Html5Qrcode(this.elementId, {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported: true,
    });
    return this.scanner.scanFile(file, false);
  }

  async stop(): Promise<void> {
    const scanner = this.scanner;
    this.scanner = null;
    this.decoding = false;
    if (!scanner) return;
    if (scanner.isScanning) await scanner.stop().catch(() => {});
    try { scanner.clear(); } catch {}
  }
}
