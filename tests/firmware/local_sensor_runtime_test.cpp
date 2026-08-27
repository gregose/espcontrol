#include <cstdlib>
#include <functional>
#include <iostream>
#include <string>
#include <vector>

struct lv_obj_t {
  std::string text;
  bool checked = false;
};

inline void lv_label_set_text(lv_obj_t *object, const char *text) {
  if (object) object->text = text ? text : "";
}

inline void set_wrapped_button_label_text(lv_obj_t *object,
                                          const std::string &text) {
  if (object) object->text = text;
}

inline void set_card_checked_state(lv_obj_t *object, bool checked) {
  if (object) object->checked = checked;
}

inline std::string espcontrol_i18n(const std::string &value) {
  return value;
}

#include "button_grid_local_sensor_runtime.h"

namespace {

struct FakeBinarySensor {
  bool state = false;
  bool state_available = false;
  std::vector<std::function<void(bool)>> callbacks;

  bool has_state() const { return state_available; }

  void add_on_state_callback(std::function<void(bool)> callback) {
    callbacks.push_back(std::move(callback));
  }

  void publish(bool value) {
    state = value;
    state_available = true;
    for (auto &callback : callbacks) callback(value);
  }
};

bool expect(bool condition, const char *message) {
  if (condition) return true;
  std::cerr << message << "\n";
  return false;
}

LocalSensorControl binary_control(
    const std::string &key, lv_obj_t *owner, lv_obj_t *icon, lv_obj_t *label,
    bool active_color = true) {
  LocalSensorControl control;
  control.key = key;
  control.kind = LocalSensorValueKind::BINARY;
  control.owner = owner;
  control.icon_lbl = icon;
  control.text_lbl = label;
  control.label = "Radar Presence";
  control.device_class = "occupancy";
  control.icon_off = "off-glyph";
  control.icon_on = "on-glyph";
  control.active_color = active_color;
  return control;
}

}  // namespace

int main() {
  local_sensor_registry().clear();
  local_sensor_callback_bindings().clear();

  lv_obj_t owner;
  lv_obj_t icon;
  lv_obj_t label;
  label.text = "--";
  LocalSensorControl control =
    binary_control("radar_presence", &owner, &icon, &label);
  local_sensor_register_control(control);

  FakeBinarySensor sensor;
  sensor.state = false;
  sensor.state_available = true;
  local_sensor_bind_binary_source(control.key, &sensor);
  if (!expect(sensor.callbacks.size() == 1,
              "binary source should register one callback") ||
      !expect(label.text == "Radar Presence: Off",
              "initial false state should render as Off") ||
      !expect(icon.text == "off-glyph",
              "initial false state should use the off icon") ||
      !expect(!owner.checked,
              "initial false state should not activate the card")) {
    return EXIT_FAILURE;
  }

  sensor.publish(true);
  if (!expect(label.text == "Radar Presence: On",
              "true transition should render as On") ||
      !expect(icon.text == "on-glyph",
              "true transition should use the on icon") ||
      !expect(owner.checked,
              "true transition should activate an enabled active colour")) {
    return EXIT_FAILURE;
  }

  lv_obj_t numeric_owner;
  lv_obj_t numeric_label;
  numeric_label.text = "numeric unchanged";
  LocalSensorControl numeric_control;
  numeric_control.key = "radar_presence";
  numeric_control.kind = LocalSensorValueKind::NUMERIC;
  numeric_control.owner = &numeric_owner;
  numeric_control.sensor_lbl = &numeric_label;
  local_sensor_register_control(numeric_control);
  if (!expect(local_sensor_dispatch_binary_update("radar_presence", false),
              "bool fallback should find the binary card") ||
      !expect(label.text == "Radar Presence: Off",
              "bool dispatch should update the binary card") ||
      !expect(icon.text == "off-glyph",
              "bool dispatch should apply the binary off icon") ||
      !expect(numeric_label.text == "numeric unchanged",
              "bool dispatch should not update a numeric card with the same key")) {
    return EXIT_FAILURE;
  }

  clear_local_sensor_controls();
  if (!expect(!local_sensor_apply_binary("radar_presence", false),
              "a removed card should no longer receive local sensor updates") ||
      !expect(local_sensor_callback_bindings().size() == 1,
              "clearing controls should preserve callback deduplication")) {
    return EXIT_FAILURE;
  }

  lv_obj_t rebuilt_owner;
  lv_obj_t rebuilt_icon;
  lv_obj_t rebuilt_label;
  LocalSensorControl rebuilt =
    binary_control("radar_presence", &rebuilt_owner, &rebuilt_icon, &rebuilt_label);
  local_sensor_register_control(rebuilt);
  local_sensor_bind_binary_source(rebuilt.key, &sensor);
  if (!expect(local_sensor_registry().size() == 1,
              "dashboard rebuild should replace the owner's old control") ||
      !expect(sensor.callbacks.size() == 1,
              "dashboard rebuild should not duplicate callbacks") ||
      !expect(rebuilt_label.text == "Radar Presence: On",
              "dashboard rebuild should immediately render the current true state")) {
    return EXIT_FAILURE;
  }

  sensor.publish(false);
  if (!expect(rebuilt_label.text == "Radar Presence: Off",
              "rebuilt control should receive later transitions") ||
      !expect(!rebuilt_owner.checked,
              "rebuilt control should clear active colour on false")) {
    return EXIT_FAILURE;
  }

  local_sensor_registry().clear();
  local_sensor_callback_bindings().clear();
  lv_obj_t unavailable_owner;
  lv_obj_t unavailable_icon;
  lv_obj_t unavailable_label;
  unavailable_label.text = "--";
  LocalSensorControl unavailable = binary_control(
    "door", &unavailable_owner, &unavailable_icon, &unavailable_label, false);
  local_sensor_register_control(unavailable);
  FakeBinarySensor no_state;
  local_sensor_bind_binary_source(unavailable.key, &no_state);
  if (!expect(unavailable_label.text == "--",
              "a binary sensor without state should remain unavailable") ||
      !expect(no_state.callbacks.size() == 1,
              "a no-state binary sensor should still bind its callback")) {
    return EXIT_FAILURE;
  }
  no_state.publish(false);
  if (!expect(unavailable_label.text == "Radar Presence: Off",
              "first false state should be distinguishable from unavailable") ||
      !expect(!unavailable_owner.checked,
              "disabled active colour should remain off for all states")) {
    return EXIT_FAILURE;
  }
  no_state.publish(true);
  if (!expect(!unavailable_owner.checked,
              "disabled active colour should not light for true")) {
    return EXIT_FAILURE;
  }

  if (!expect(std::string(local_binary_default_off_icon_name("window")) ==
                "Window Closed",
              "window device class should use a closed icon") ||
      !expect(std::string(local_binary_default_on_icon_name("occupancy")) ==
                "Motion Sensor",
              "occupancy device class should use a detected icon") ||
      !expect(std::string(local_binary_default_off_icon_name("")) ==
                "Circle Outline",
              "unknown device classes should use a generic off icon")) {
    return EXIT_FAILURE;
  }

  std::string json = "[";
  bool first = true;
  append_local_sensor_json_entry(
    json, first, "temperature", "Room \"Temperature\"", "deg\nC",
    "numeric", false);
  append_local_sensor_json_entry(
    json, first, "status", "Status", "", "text", true);
  append_local_sensor_json_entry(
    json, first, "radar_presence", "Radar Presence", "", "binary", false,
    "occupancy");
  json += "]";
  const std::string expected_json =
    "[{\"key\":\"temperature\",\"name\":\"Room \\\"Temperature\\\"\","
    "\"unit\":\"deg\\nC\",\"type\":\"numeric\"},"
    "{\"key\":\"status\",\"name\":\"Status\",\"unit\":\"\",\"type\":\"text\","
    "\"internal\":true},"
    "{\"key\":\"radar_presence\",\"name\":\"Radar Presence\",\"unit\":\"\","
    "\"type\":\"binary\",\"device_class\":\"occupancy\"}]";
  if (!expect(json == expected_json,
              "local sensor JSON should include all kinds and escaped metadata")) {
    return EXIT_FAILURE;
  }

  return EXIT_SUCCESS;
}
