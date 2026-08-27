import type { LocalSensorDiscovery } from "./sensor_card_mode_controller";

export const LOCAL_PRESENCE_SENSOR_PREFIX = "local:";

export type ScreensaverPresenceSource = "home_assistant" | "local";

export interface ScreensaverPresenceSelection {
  readonly source: ScreensaverPresenceSource;
  readonly key: string;
}

export interface ScreensaverPresenceSourceUiState {
  readonly source: ScreensaverPresenceSource;
  readonly homeAssistantValue: string;
  readonly localKey: string;
  readonly homeAssistantVisible: boolean;
  readonly localVisible: boolean;
}

interface ScreensaverPresenceCapabilities {
  readonly screensaver?: {
    readonly local_binary_sensor?: unknown;
  };
}

const preferredBinaryDeviceClasses: Readonly<Record<string, number>> = {
  presence: 0,
  occupancy: 1,
  motion: 2,
  moving: 3,
};

export function decodeScreensaverPresenceSource(value: unknown): ScreensaverPresenceSelection {
  const stored = String(value == null ? "" : value);
  if (stored.startsWith(LOCAL_PRESENCE_SENSOR_PREFIX)) {
    return {
      source: "local",
      key: stored.slice(LOCAL_PRESENCE_SENSOR_PREFIX.length),
    };
  }
  return { source: "home_assistant", key: stored };
}

export function encodeScreensaverPresenceSource(
  source: ScreensaverPresenceSource,
  key: unknown,
): string {
  const value = String(key == null ? "" : key);
  return source === "local" ? LOCAL_PRESENCE_SENSOR_PREFIX + value : value;
}

export function screensaverPresenceBinarySensors(
  entries: readonly LocalSensorDiscovery[],
  showInternal: boolean,
): readonly LocalSensorDiscovery[] {
  return entries
    .filter((entry) => entry.type === "binary" && (showInternal || !entry.internal))
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftClass = String(left.entry.device_class || "").toLowerCase();
      const rightClass = String(right.entry.device_class || "").toLowerCase();
      const leftPriority = preferredBinaryDeviceClasses[leftClass] ?? 4;
      const rightPriority = preferredBinaryDeviceClasses[rightClass] ?? 4;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      const nameOrder = left.entry.name.toLowerCase().localeCompare(right.entry.name.toLowerCase());
      if (nameOrder !== 0) return nameOrder;
      const keyOrder = left.entry.key.localeCompare(right.entry.key);
      return keyOrder !== 0 ? keyOrder : left.index - right.index;
    })
    .map(({ entry }) => entry);
}

export function supportsLocalScreensaverPresence(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const capabilities = value as ScreensaverPresenceCapabilities;
  return capabilities.screensaver?.local_binary_sensor === true;
}

/** Keeps source-specific drafts separate while one opaque setting is edited. */
export class ScreensaverPresenceSourceController {
  private source: ScreensaverPresenceSource = "home_assistant";
  private homeAssistantValue = "";
  private localKey = "";

  constructor(initialValue: unknown = "") {
    this.applyStoredValue(initialValue);
  }

  applyStoredValue(value: unknown): ScreensaverPresenceSourceUiState {
    const selection = decodeScreensaverPresenceSource(value);
    this.source = selection.source;
    if (selection.source === "local") this.localKey = selection.key;
    else this.homeAssistantValue = selection.key;
    return this.uiState();
  }

  selectSource(source: ScreensaverPresenceSource): string {
    this.source = source;
    return this.storedValue();
  }

  setHomeAssistantValue(value: unknown): string {
    this.source = "home_assistant";
    this.homeAssistantValue = String(value == null ? "" : value);
    return this.storedValue();
  }

  setLocalKey(value: unknown): string {
    this.source = "local";
    this.localKey = String(value == null ? "" : value);
    return this.storedValue();
  }

  storedValue(): string {
    return encodeScreensaverPresenceSource(
      this.source,
      this.source === "local" ? this.localKey : this.homeAssistantValue,
    );
  }

  uiState(): ScreensaverPresenceSourceUiState {
    return {
      source: this.source,
      homeAssistantValue: this.homeAssistantValue,
      localKey: this.localKey,
      homeAssistantVisible: this.source === "home_assistant",
      localVisible: this.source === "local",
    };
  }
}

export function createScreensaverPresenceSourceController(
  initialValue: unknown = "",
): ScreensaverPresenceSourceController {
  return new ScreensaverPresenceSourceController(initialValue);
}
