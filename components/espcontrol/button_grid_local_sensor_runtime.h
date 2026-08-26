#pragma once

#include <cmath>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

enum class LocalSensorValueKind {
  NUMERIC,
  TEXT,
  BINARY,
};

struct LocalSensorControl {
  std::string key;
  LocalSensorValueKind kind = LocalSensorValueKind::NUMERIC;
  int precision = 0;
  lv_obj_t *sensor_lbl = nullptr;
  lv_obj_t *text_lbl = nullptr;
  lv_obj_t *icon_lbl = nullptr;
  lv_obj_t *owner = nullptr;
  std::string label;
  std::string device_class;
  const char *icon_off = nullptr;
  const char *icon_on = nullptr;
  bool active_color = false;
};

inline std::vector<LocalSensorControl> &local_sensor_registry() {
  static std::vector<LocalSensorControl> sensors;
  return sensors;
}

inline void clear_local_sensor_controls() {
  local_sensor_registry().clear();
}

struct LocalSensorCallbackBinding {
  std::string key;
  LocalSensorValueKind kind = LocalSensorValueKind::NUMERIC;
};

inline std::vector<LocalSensorCallbackBinding> &local_sensor_callback_bindings() {
  static std::vector<LocalSensorCallbackBinding> bindings;
  return bindings;
}

inline bool local_sensor_callback_registered(const std::string &key,
                                             LocalSensorValueKind kind) {
  for (const auto &binding : local_sensor_callback_bindings()) {
    if (binding.key == key && binding.kind == kind) return true;
  }
  local_sensor_callback_bindings().push_back({key, kind});
  return false;
}

inline void local_sensor_register_control(const LocalSensorControl &control) {
  auto &registry = local_sensor_registry();
  size_t write_index = 0;
  for (size_t read_index = 0; read_index < registry.size(); read_index++) {
    if (registry[read_index].owner == control.owner) continue;
    if (write_index != read_index) registry[write_index] = registry[read_index];
    write_index++;
  }
  registry.resize(write_index);
  registry.push_back(control);
}

inline bool local_sensor_apply_value(const std::string &key, float value) {
  if (std::isnan(value)) return false;
  bool applied = false;
  for (const auto &control : local_sensor_registry()) {
    if (control.key != key || control.kind != LocalSensorValueKind::NUMERIC ||
        !control.sensor_lbl) {
      continue;
    }
    char buffer[32];
    if (control.precision == 1) snprintf(buffer, sizeof(buffer), "%.1f", value);
    else if (control.precision == 2) snprintf(buffer, sizeof(buffer), "%.2f", value);
    else snprintf(buffer, sizeof(buffer), "%.0f", value);
    lv_label_set_text(control.sensor_lbl, buffer);
    applied = true;
  }
  return applied;
}

inline bool local_sensor_apply_text(const std::string &key,
                                    const std::string &value) {
  bool applied = false;
  for (const auto &control : local_sensor_registry()) {
    if (control.key != key || control.kind != LocalSensorValueKind::TEXT ||
        !control.text_lbl) {
      continue;
    }
    set_wrapped_button_label_text(control.text_lbl, value);
    applied = true;
  }
  return applied;
}

inline const char *local_binary_default_off_icon_name(
    const std::string &device_class) {
  if (device_class == "window") return "Window Closed";
  if (device_class == "door" || device_class == "garage_door" ||
      device_class == "opening") {
    return "Door";
  }
  if (device_class == "lock") return "Lock";
  if (device_class == "moisture") return "Water";
  if (device_class == "smoke" || device_class == "gas" ||
      device_class == "carbon_monoxide") {
    return "Smoke Detector";
  }
  if (device_class == "motion" || device_class == "moving" ||
      device_class == "occupancy" || device_class == "presence" ||
      device_class == "vibration") {
    return "Motion Sensor Off";
  }
  return "Circle Outline";
}

inline const char *local_binary_default_on_icon_name(
    const std::string &device_class) {
  if (device_class == "window") return "Window Open";
  if (device_class == "door" || device_class == "garage_door" ||
      device_class == "opening") {
    return "Door Open";
  }
  if (device_class == "lock") return "Lock Open";
  if (device_class == "moisture") return "Water Alert";
  if (device_class == "smoke" || device_class == "gas" ||
      device_class == "carbon_monoxide") {
    return "Smoke Detector";
  }
  if (device_class == "motion" || device_class == "moving" ||
      device_class == "occupancy" || device_class == "presence" ||
      device_class == "vibration") {
    return "Motion Sensor";
  }
  return "Check";
}

inline std::string local_binary_state_text(const LocalSensorControl &control,
                                           bool state) {
  std::string value = espcontrol_i18n(std::string(state ? "On" : "Off"));
  return control.label.empty() ? value : control.label + ": " + value;
}

inline bool local_sensor_apply_binary(const std::string &key, bool value) {
  bool applied = false;
  for (const auto &control : local_sensor_registry()) {
    if (control.key != key || control.kind != LocalSensorValueKind::BINARY) continue;
    set_card_checked_state(control.owner, control.active_color && value);
    if (control.icon_lbl) {
      const char *icon = value ? control.icon_on : control.icon_off;
      if (icon) lv_label_set_text(control.icon_lbl, icon);
    }
    if (control.text_lbl) {
      set_wrapped_button_label_text(
        control.text_lbl, local_binary_state_text(control, value));
    }
    applied = true;
  }
  return applied;
}

inline bool local_sensor_dispatch_binary_update(const std::string &key,
                                                bool value) {
  return local_sensor_apply_binary(key, value);
}

template<typename BinarySensor>
inline void local_sensor_bind_binary_source(const std::string &key,
                                            BinarySensor *sensor) {
  if (!sensor) return;
  if (!local_sensor_callback_registered(key, LocalSensorValueKind::BINARY)) {
    sensor->add_on_state_callback([key](bool value) {
      local_sensor_apply_binary(key, value);
    });
  }
  if (sensor->has_state()) local_sensor_apply_binary(key, sensor->state);
}

inline std::string local_endpoint_json_escape(const std::string &value) {
  std::string out;
  out.reserve(value.size() + 4);
  static const char hex[] = "0123456789abcdef";
  for (unsigned char c : value) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          out += "\\u00";
          out += hex[(c >> 4) & 0x0F];
          out += hex[c & 0x0F];
        } else {
          out += static_cast<char>(c);
        }
    }
  }
  return out;
}

inline void append_local_sensor_json_entry(
    std::string &json, bool &first, const std::string &key,
    const std::string &name, const std::string &unit, const char *type,
    bool internal, const std::string &device_class = "") {
  if (!first) json += ",";
  first = false;
  json += "{\"key\":\"" + local_endpoint_json_escape(key) +
          "\",\"name\":\"" + local_endpoint_json_escape(name) +
          "\",\"unit\":\"" + local_endpoint_json_escape(unit) +
          "\",\"type\":\"" + local_endpoint_json_escape(type ? type : "") + "\"";
  if (internal) json += ",\"internal\":true";
  if (!device_class.empty()) {
    json += ",\"device_class\":\"" +
            local_endpoint_json_escape(device_class) + "\"";
  }
  json += "}";
}
