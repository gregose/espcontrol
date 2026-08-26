import type { CardConfig } from "../../src/webserver/contracts/types";
import {
  createSensorCardModeController,
  localBinarySensorDefaultIcons,
  localSensorEntriesForMode,
  localSensorModeForType,
} from "../../src/webserver/features/sensor_card_mode_controller";

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function card(overrides: Partial<CardConfig> = {}): CardConfig {
  return { entity: "sensor.room", label: "Room", icon: "mdi:home", icon_on: "mdi:home", sensor: "", unit: "°C", type: "sensor", precision: "2", options: "state_input=high", ...overrides };
}

export function runSensorCardModeControllerTests(): void {
  const controller = createSensorCardModeController({
    normalizeOptions: (options, precision) => `${precision}:${options}`,
  });

  const local = card();
  equal(controller.isLocal(local), false, "Home Assistant sensors are not local");
  equal(controller.selectSource(local, "local").join(","), "type,entity,label,sensor,unit,icon,icon_on,precision,options", "source changes persist every reset field");
  equal(local.sensor, "local", "local source uses the stable local marker");
  equal(local.entity, "", "source changes clear the previous entity");
  equal(controller.isLocal(local), true, "local source is detected after transition");

  const text = card();
  const textTransition = controller.selectDisplayMode(text, "text");
  equal(textTransition.mode, "text", "text display mode is selected");
  equal(text.precision, "text", "text mode stores its precision marker");
  equal(text.label, "", "text mode clears numeric labels");
  equal(text.unit, "", "text mode clears numeric units");
  equal(text.icon, "mdi:home", "text mode retains its display icon");
  equal(text.options, "text:state_input=high", "text mode normalizes state-label options");

  const time = card();
  controller.selectDisplayMode(time, "time");
  equal(time.precision, "time", "time mode stores its precision marker");
  equal(time.icon, "Auto", "time mode resets the icon");
  equal(time.icon_on, "Auto", "time mode resets the on icon");

  const numeric = card({ precision: "icon", options: "old" });
  const numericTransition = controller.selectDisplayMode(numeric, "unknown");
  equal(numericTransition.mode, "numeric", "unknown display modes use numeric mode");
  equal(numeric.precision, "", "numeric mode clears the mode marker");
  equal(numeric.icon, "Auto", "numeric mode resets the icon");
  equal(numeric.options, ":old", "numeric mode normalizes options with empty precision");

  const binary = card({ unit: "%", options: "active_color" });
  const binaryTransition = controller.selectDisplayMode(binary, "binary");
  equal(binaryTransition.mode, "binary", "binary display mode is selected");
  equal(binary.precision, "binary", "binary mode stores its stable precision marker");
  equal(binary.unit, "", "binary mode clears numeric units");
  equal(binary.icon, "mdi:home", "binary mode retains its off icon");
  equal(binary.icon_on, "mdi:home", "binary mode retains its on icon");
  equal(controller.displayMode(binary), "binary", "binary mode survives reload detection");
  equal(binary.options, "binary:active_color", "binary mode normalizes persisted options");

  const discovered = [
    { key: "temperature", name: "Temperature", unit: "°C", type: "numeric" as const },
    { key: "status", name: "Status", type: "text" as const },
    { key: "presence", name: "Presence", type: "binary" as const, device_class: "occupancy" },
    { key: "online", name: "Online", type: "binary" as const, internal: true },
  ];
  equal(localSensorEntriesForMode(discovered, "numeric", false).length, 1, "numeric discovery filters numeric values");
  equal(localSensorEntriesForMode(discovered, "text", false)[0]?.key, "status", "text discovery filters text values");
  equal(localSensorEntriesForMode(discovered, "binary", false)[0]?.key, "presence", "binary discovery filters binary values");
  equal(localSensorEntriesForMode(discovered, "binary", true).length, 2, "binary discovery can include internal values");
  equal(localSensorModeForType("binary"), "binary", "binary discovery selects binary mode");
  equal(localSensorModeForType("unexpected"), "numeric", "unknown discovery types remain numeric-compatible");

  const occupancyIcons = localBinarySensorDefaultIcons("occupancy");
  equal(occupancyIcons.off, "Motion Sensor Off", "occupancy uses a clear-state icon");
  equal(occupancyIcons.on, "Motion Sensor", "occupancy uses a detected-state icon");
  const genericIcons = localBinarySensorDefaultIcons("");
  equal(genericIcons.off, "Circle Outline", "generic binary values have a safe off icon");
  equal(genericIcons.on, "Check", "generic binary values have a safe on icon");
}
