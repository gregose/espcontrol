import {
  createBackupEnvelope,
  normalizeBackupPanelSettings,
} from "../../src/webserver/model";
import {
  createScreensaverPresenceSourceController,
  decodeScreensaverPresenceSource,
  encodeScreensaverPresenceSource,
  screensaverPresenceBinarySensors,
  supportsLocalScreensaverPresence,
} from "../../src/webserver/features/screensaver_presence_source_controller";

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

export function runScreensaverPresenceSourceControllerTests(): void {
  equal(
    encodeScreensaverPresenceSource("local", "radar_presence"),
    "local:radar_presence",
    "local keys use the unambiguous prefix",
  );
  equal(
    decodeScreensaverPresenceSource("local:").key,
    "",
    "an empty local selection remains a local source",
  );
  equal(
    decodeScreensaverPresenceSource("binary_sensor.hallway_presence").source,
    "home_assistant",
    "legacy Home Assistant values remain Home Assistant sources",
  );
  equal(
    supportsLocalScreensaverPresence({
      screensaver: { local_binary_sensor: true },
    }),
    true,
    "new firmware advertises local screensaver presence",
  );
  equal(
    supportsLocalScreensaverPresence({
      configuration: { document_versions: [1] },
    }),
    false,
    "older firmware does not expose the unsupported local source",
  );

  const entries = [
    { key: "temperature", name: "Temperature", type: "numeric" as const },
    { key: "generic", name: "Generic Input", type: "binary" as const },
    { key: "motion", name: "Motion", type: "binary" as const, device_class: "motion" },
    { key: "occupancy", name: "Occupancy", type: "binary" as const, device_class: "occupancy" },
    { key: "presence", name: "Presence", type: "binary" as const, device_class: "presence" },
    { key: "moving", name: "Moving", type: "binary" as const, device_class: "moving" },
    { key: "internal", name: "Internal", type: "binary" as const, internal: true },
  ];
  equal(
    screensaverPresenceBinarySensors(entries, false).map((entry) => entry.key).join(","),
    "presence,occupancy,motion,moving,generic",
    "binary sensors are preferred by presence device class while generic inputs remain valid",
  );
  equal(
    screensaverPresenceBinarySensors(entries, true).some((entry) => entry.key === "internal"),
    true,
    "internal binary sensors appear only when requested",
  );

  const controller = createScreensaverPresenceSourceController("binary_sensor.hallway_presence");
  equal(controller.uiState().homeAssistantValue, "binary_sensor.hallway_presence", "HA input reloads its value");
  equal(controller.selectSource("local"), "local:", "switching to Local Sensor never copies an HA entity");
  equal(controller.setLocalKey("radar_presence"), "local:radar_presence", "local selection is encoded");
  equal(controller.selectSource("home_assistant"), "binary_sensor.hallway_presence", "source switching restores the HA draft");
  let reloaded = controller.applyStoredValue("local:out_pin");
  equal(reloaded.source, "local", "SSE reload switches the active source");
  equal(reloaded.localKey, "out_pin", "SSE reload selects the active local key");
  equal(reloaded.homeAssistantValue, "binary_sensor.hallway_presence", "local values never leak into HA autocomplete state");

  const backup = createBackupEnvelope({
    device: "esp32-p4-86",
    slots: 1,
    settings: { presence_sensor_entity: "local:radar_presence" },
  }, {
    buttons: [],
    subpages: {},
  });
  equal(
    String(backup.settings?.presence_sensor_entity),
    "local:radar_presence",
    "backup export preserves the opaque local source",
  );
  const imported = normalizeBackupPanelSettings(backup.settings || {}, {
    timezone: "UTC",
    language: "en",
    clockFormat: "24h",
    clockFormatOptions: ["12h", "24h"],
    ntpDefaults: ["0.pool.ntp.org", "1.pool.ntp.org", "2.pool.ntp.org"],
    ntpServer1: "0.pool.ntp.org",
    ntpServer2: "1.pool.ntp.org",
    ntpServer3: "2.pool.ntp.org",
    coverArtHomeAssistantProtocol: "http",
    coverArtHomeAssistantPort: 8123,
    autoUpdate: true,
    updateFrequency: "Daily",
    updateFrequencyOptions: ["Daily"],
    screenRotationOptions: ["0"],
  });
  equal(
    imported.presenceSensorEntity,
    "local:radar_presence",
    "backup import restores the opaque local source without a version change",
  );
}
