import type { CardConfig, SavedConfigField } from "../contracts/types";

export const LOCAL_SENSOR_SOURCE = "local";

export type SensorDisplayMode = "numeric" | "time" | "text" | "icon" | "binary";
export type LocalSensorValueKind = "numeric" | "text" | "binary";

export interface LocalSensorDiscovery {
  readonly key: string;
  readonly name: string;
  readonly unit?: string;
  readonly type: LocalSensorValueKind;
  readonly internal?: boolean;
  readonly device_class?: string;
}

export interface LocalBinarySensorIcons {
  readonly off: string;
  readonly on: string;
}

export interface SensorCardModeControllerOptions {
  readonly normalizeOptions: (options: string, precision: string) => string;
  readonly localSensorSource?: string;
}

export interface SensorCardTransition {
  readonly mode: SensorDisplayMode;
  readonly fields: readonly SavedConfigField[];
}

const sourceFields: readonly SavedConfigField[] = [
  "type", "entity", "label", "sensor", "unit", "icon", "icon_on", "precision", "options",
];

const modeFields: Readonly<Record<SensorDisplayMode, readonly SavedConfigField[]>> = {
  numeric: ["precision", "icon", "icon_on", "options"],
  time: ["precision", "unit", "icon", "icon_on", "options"],
  text: ["precision", "label", "unit", "icon_on", "options"],
  icon: ["precision", "unit", "options"],
  binary: ["precision", "unit", "options"],
};

export function localSensorModeForType(type: string): "numeric" | "text" | "binary" {
  return type === "text" || type === "binary" ? type : "numeric";
}

export function localSensorEntriesForMode(
  entries: readonly LocalSensorDiscovery[],
  mode: SensorDisplayMode,
  showInternal: boolean,
): readonly LocalSensorDiscovery[] {
  const kind = localSensorModeForType(mode);
  return entries.filter((entry) => entry.type === kind && (showInternal || !entry.internal));
}

export function localBinarySensorDefaultIcons(deviceClass: string | null | undefined): LocalBinarySensorIcons {
  const value = String(deviceClass || "").trim().toLowerCase();
  const motionDeviceClass = `motion`;
  const smokeDeviceClass = `smoke`;
  if (value === "window") return { off: "Window Closed", on: "Window Open" };
  if (value === "door" || value === "garage_door" || value === "opening") {
    return { off: "Door", on: "Door Open" };
  }
  if (value === "lock") return { off: "Lock", on: "Lock Open" };
  if (value === "moisture") return { off: "Water", on: "Water Alert" };
  if (value === smokeDeviceClass || value === "gas" || value === "carbon_monoxide") {
    return { off: "Smoke Detector", on: "Smoke Detector" };
  }
  if (value === motionDeviceClass || value === "moving" || value === "occupancy" ||
      value === "presence" || value === "vibration") {
    return { off: "Motion Sensor Off", on: "Motion Sensor" };
  }
  return { off: "Circle Outline", on: "Check" };
}

/** Owns the sensor editor's source and display-mode field transitions. */
export class SensorCardModeController {
  private readonly localSensorSource: string;

  constructor(private readonly options: SensorCardModeControllerOptions) {
    this.localSensorSource = options.localSensorSource || LOCAL_SENSOR_SOURCE;
  }

  isLocal(button: CardConfig | null | undefined): boolean {
    return !!button && (button.type === "local_sensor" ||
      (button.type === "sensor" && button.sensor === this.localSensorSource));
  }

  displayMode(button: CardConfig): SensorDisplayMode {
    if (button.precision === "icon" || button.precision === "time" ||
        button.precision === "text" || button.precision === "binary") {
      return button.precision;
    }
    return "numeric";
  }

  selectSource(button: CardConfig, source: string): readonly SavedConfigField[] {
    const local = source === this.localSensorSource;
    if (local === this.isLocal(button)) return [];
    button.type = "sensor";
    button.entity = "";
    button.label = "";
    button.sensor = local ? this.localSensorSource : "";
    button.unit = "";
    button.icon = "Auto";
    button.icon_on = "Auto";
    button.precision = "";
    button.options = "";
    return sourceFields;
  }

  selectDisplayMode(button: CardConfig, requested: string): SensorCardTransition {
    const mode: SensorDisplayMode = requested === "time" || requested === "text" ||
      requested === "icon" || requested === "binary"
      ? requested
      : "numeric";
    if (mode === "time") {
      button.precision = "time";
      button.unit = "";
      button.icon = "Auto";
      button.icon_on = "Auto";
    } else if (mode === "text") {
      button.precision = "text";
      button.label = "";
      button.unit = "";
      button.icon_on = "Auto";
    } else if (mode === "icon") {
      button.precision = "icon";
      button.unit = "";
    } else if (mode === "binary") {
      button.precision = "binary";
      button.unit = "";
    } else {
      button.precision = "";
      button.icon = "Auto";
      button.icon_on = "Auto";
    }
    button.options = this.options.normalizeOptions(button.options, button.precision);
    return { mode, fields: modeFields[mode] };
  }
}

export function createSensorCardModeController(options: SensorCardModeControllerOptions): SensorCardModeController {
  return new SensorCardModeController(options);
}
