import { state } from "../state/app_instance";
import type { LocalSensorDiscovery } from "../features/sensor_card_mode_controller";
import {
  createScreensaverPresenceSourceController,
  screensaverPresenceBinarySensors,
  supportsLocalScreensaverPresence,
  type ScreensaverPresenceSource,
} from "../features/screensaver_presence_source_controller";
import type { ConfigCodecFeature } from "./config_codec";
import type { UiRuntimeState } from "./state";
import type { EntityStateFeature } from "./entity_state";
import type { ArtworkPostApiFeature } from "./artwork_post_api";
import type { ControlsFieldsFeature } from "./controls_fields";

export interface ScreensaverPresenceSourceFeature {
  build(): HTMLElement;
  localSupported(): Promise<boolean>;
  sync(value?: unknown): void;
}

export function createScreensaverPresenceSourceFeature(
  runtime: UiRuntimeState,
  codec: Pick<ConfigCodecFeature, "bindTextPost">,
  entityState: Pick<EntityStateFeature, "entityName" | "entityInput">,
  artworkPostApi: Pick<ArtworkPostApiFeature, "postPresenceSensorEntity">,
  fields: Pick<ControlsFieldsFeature, "fieldLabel" | "segmentControl" | "textInput" | "toggleRow">,
): ScreensaverPresenceSourceFeature {
  const controller = createScreensaverPresenceSourceController(state.presenceEntity);
  const { bindTextPost } = codec;
  const { entityName, entityInput } = entityState;
  const { postPresenceSensorEntity } = artworkPostApi;
  const { fieldLabel, segmentControl, textInput, toggleRow } = fields;
  const els = runtime.els;
  let localSensors: readonly LocalSensorDiscovery[] | null = null;
  let localLoadFailed = false;
  let showInternal = false;
  let localSourceSupported = false;
  let localCapabilityRequest: Promise<boolean> | null = null;

  function persist(value: string): void {
    state.presenceEntity = value;
    controller.applyStoredValue(value);
    postPresenceSensorEntity(value);
    sync(value);
  }

  function syncSourceButtons(source: ScreensaverPresenceSource): void {
    const buttons = els.setPresenceSourceButtons || {};
    for (const key in buttons) {
      buttons[key].classList.toggle("active", key === source);
    }
  }

  function syncLocalSourceAvailability(): void {
    const button = els.setPresenceSourceButtons?.local;
    if (!button) return;
    button.hidden = !localSourceSupported;
    button.disabled = !localSourceSupported;
  }

  function discoverLocalSupport(attempt = 0): Promise<boolean> {
    return fetch("/api/v1/capabilities", { cache: "no-store" })
      .then((response) => {
        if ((response.status === 404 || response.status === 503) && attempt < 20) {
          return new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(discoverLocalSupport(attempt + 1)), 250);
          });
        }
        if (!response.ok) return false;
        return response.json().then(supportsLocalScreensaverPresence);
      })
      .catch(() => {
        if (attempt >= 20) return false;
        return new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(discoverLocalSupport(attempt + 1)), 250);
        });
      });
  }

  function localSupported(): Promise<boolean> {
    if (!localCapabilityRequest) {
      localCapabilityRequest = discoverLocalSupport().then((supported) => {
        localSourceSupported = supported;
        sync(state.presenceEntity);
        return supported;
      });
    }
    return localCapabilityRequest;
  }

  function renderLocalPicker(): void {
    const container = els.setPresenceLocalPicker;
    if (!container) return;
    container.innerHTML = "";
    if (localSensors === null && !localLoadFailed) {
      const loading = document.createElement("div");
      loading.className = "sp-field";
      loading.textContent = "Loading sensors…";
      container.appendChild(loading);
      return;
    }

    if (localLoadFailed) {
      const error = document.createElement("div");
      error.className = "sp-banner sp-error";
      error.textContent = "Could not reach device. Enter sensor key manually.";
      container.appendChild(error);
      const keyField = document.createElement("div");
      keyField.className = "sp-field";
      keyField.appendChild(fieldLabel("Sensor Key", "sp-set-presence-local-key"));
      const input = textInput(
        "sp-set-presence-local-key",
        controller.uiState().localKey,
        "e.g. radar_presence",
      );
      keyField.appendChild(input);
      container.appendChild(keyField);
      els.setPresenceLocalInput = input;
      bindTextPost(input, entityName("presence_sensor_entity"), {
        post(value: unknown) {
          persist(controller.setLocalKey(value));
        },
      });
      return;
    }

    const sensors = screensaverPresenceBinarySensors(localSensors || [], showInternal);
    const selection = controller.uiState();
    const pickerField = document.createElement("div");
    pickerField.className = "sp-field";
    pickerField.appendChild(fieldLabel("Local Sensor", "sp-set-presence-local"));
    const select = document.createElement("select");
    select.className = "sp-select";
    select.id = "sp-set-presence-local";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a binary sensor…";
    select.appendChild(placeholder);
    sensors.forEach((sensor) => {
      const option = document.createElement("option");
      option.value = sensor.key;
      option.textContent = sensor.name;
      select.appendChild(option);
    });
    if (selection.localKey && !sensors.some((sensor) => sensor.key === selection.localKey)) {
      const current = document.createElement("option");
      current.value = selection.localKey;
      current.textContent = selection.localKey + " (current)";
      select.appendChild(current);
    }
    select.value = selection.localKey;
    select.addEventListener("change", function (this: HTMLSelectElement) {
      persist(controller.setLocalKey(this.value));
    });
    pickerField.appendChild(select);
    container.appendChild(pickerField);
    els.setPresenceLocalSelect = select;

    const internal = toggleRow(
      "Show internal sensors",
      "sp-set-presence-show-internal",
      showInternal,
    );
    internal.input.addEventListener("change", function (this: HTMLInputElement) {
      showInternal = this.checked;
      renderLocalPicker();
    });
    container.appendChild(internal.row);
    els.setPresenceShowInternalToggle = internal.input;
  }

  function sync(value: unknown = state.presenceEntity): void {
    state.presenceEntity = String(value == null ? "" : value);
    const ui = controller.applyStoredValue(state.presenceEntity);
    const visibleSource =
      ui.source === "local" && !localSourceSupported ? "home_assistant" : ui.source;
    syncSourceButtons(visibleSource);
    syncLocalSourceAvailability();
    if (els.setPresenceHomeAssistantField) {
      els.setPresenceHomeAssistantField.style.display =
        visibleSource === "home_assistant" ? "" : "none";
    }
    if (els.setPresenceLocalField) {
      els.setPresenceLocalField.style.display = visibleSource === "local" ? "" : "none";
    }
    if (els.setPresence) els.setPresence.value = ui.homeAssistantValue;
    if (visibleSource === "local") renderLocalPicker();
  }

  function build(): HTMLElement {
    const root = document.createElement("div");
    root.appendChild(fieldLabel("Source"));
    const source = segmentControl([
      ["home_assistant", "Home Assistant"],
      ["local", "Local Sensor"],
    ], controller.uiState().source, (selected: ScreensaverPresenceSource) => {
      persist(controller.selectSource(selected));
    }, "sp-segment sp-screensaver-presence-source");
    root.appendChild(source.segment);
    els.setPresenceSourceButtons = source.buttons;

    const homeAssistantField = document.createElement("div");
    homeAssistantField.className = "sp-field";
    homeAssistantField.appendChild(fieldLabel("Presence Entity", "sp-set-presence"));
    const homeAssistantInput = entityInput(
      "sp-set-presence",
      controller.uiState().homeAssistantValue,
      "Presence sensor entity",
      ["binary_sensor", "sensor"],
    );
    homeAssistantField.appendChild(homeAssistantInput);
    root.appendChild(homeAssistantField);
    els.setPresenceHomeAssistantField = homeAssistantField;
    els.setPresence = homeAssistantInput;
    bindTextPost(homeAssistantInput, entityName("presence_sensor_entity"), {
      post(value: unknown) {
        persist(controller.setHomeAssistantValue(value));
      },
    });

    const localField = document.createElement("div");
    const localPicker = document.createElement("div");
    localField.appendChild(localPicker);
    root.appendChild(localField);
    els.setPresenceLocalField = localField;
    els.setPresenceLocalPicker = localPicker;
    renderLocalPicker();
    void localSupported();
    fetch("/local_sensors")
      .then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then((data: unknown) => {
        if (!Array.isArray(data)) throw new Error("Invalid local sensor response");
        localSensors = data as LocalSensorDiscovery[];
        localLoadFailed = false;
        renderLocalPicker();
      })
      .catch(() => {
        localLoadFailed = true;
        localSensors = null;
        renderLocalPicker();
      });
    sync(state.presenceEntity);
    return root;
  }

  return { build, localSupported, sync };
}
