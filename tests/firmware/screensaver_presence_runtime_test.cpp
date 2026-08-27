#include <cstdlib>
#include <functional>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

#include "screensaver_presence_runtime.h"

namespace {

struct FakeBinarySensor {
  bool state = false;
  bool available = false;
  std::vector<std::function<void(bool)>> callbacks;

  bool has_state() const { return available; }

  void add_on_state_callback(std::function<void(bool)> callback) {
    callbacks.push_back(std::move(callback));
  }

  void publish(bool value) {
    state = value;
    available = true;
    for (auto &callback : callbacks) callback(value);
  }
};

struct Counters {
  int activity = 0;
  int wake = 0;
  int sleep = 0;
};

bool expect(bool condition, const char *message) {
  if (condition) return true;
  std::cerr << message << "\n";
  return false;
}

void reset_runtime() {
  screensaver_presence_router().reset();
  screensaver_presence_callback_registry().clear();
}

void set_targets(bool &presence, Counters &counters) {
  screensaver_presence_router().refresh_targets(
    &presence,
    [&counters]() { counters.activity++; },
    [&counters]() { counters.wake++; },
    [&counters]() { counters.sleep++; });
}

}  // namespace

int main() {
  const auto local = parse_screensaver_presence_selection("local:radar_presence");
  const auto home_assistant =
    parse_screensaver_presence_selection("binary_sensor.hallway_presence");
  if (!expect(local.source == ScreensaverPresenceSource::LOCAL &&
              local.key == "radar_presence",
              "local selections should decode their object ID") ||
      !expect(home_assistant.source == ScreensaverPresenceSource::HOME_ASSISTANT,
              "legacy entity IDs should remain Home Assistant selections") ||
      !expect(parse_screensaver_presence_selection("local:").source ==
                ScreensaverPresenceSource::LOCAL,
              "an empty local key should remain a local selection")) {
    return EXIT_FAILURE;
  }

  reset_runtime();
  bool presence = true;
  Counters counters;
  set_targets(presence, counters);
  FakeBinarySensor radar;
  radar.available = true;
  radar.state = false;
  if (!expect(screensaver_presence_bind_local_source("radar", &radar),
              "available local source should bind") ||
      !expect(!presence, "initial false state should be applied") ||
      !expect(counters.sleep == 1 && counters.wake == 0,
              "initial false state should sleep once") ||
      !expect(radar.callbacks.size() == 1,
              "local source should register one screensaver callback")) {
    return EXIT_FAILURE;
  }

  radar.publish(true);
  radar.publish(true);
  radar.publish(false);
  if (!expect(!presence, "false transition should clear presence") ||
      !expect(counters.activity == 1 && counters.wake == 1 && counters.sleep == 2,
              "real transitions should wake and sleep without same-state replay")) {
    return EXIT_FAILURE;
  }

  Counters rebuilt_counters;
  set_targets(presence, rebuilt_counters);
  screensaver_presence_bind_local_source("radar", &radar);
  if (!expect(radar.callbacks.size() == 1,
              "same-source rebuild should not duplicate callbacks") ||
      !expect(rebuilt_counters.wake == 0 && rebuilt_counters.sleep == 0,
              "same-source rebuild should not replay unchanged state")) {
    return EXIT_FAILURE;
  }
  radar.publish(true);
  if (!expect(rebuilt_counters.wake == 1 && rebuilt_counters.activity == 1,
              "rebuilt targets should receive later transitions")) {
    return EXIT_FAILURE;
  }

  FakeBinarySensor doorway;
  doorway.available = true;
  doorway.state = false;
  if (!expect(screensaver_presence_bind_local_source("doorway", &doorway),
              "a different local source should bind") ||
      !expect(!presence && rebuilt_counters.sleep == 1,
              "selecting a different key should immediately apply false")) {
    return EXIT_FAILURE;
  }
  radar.publish(false);
  if (!expect(rebuilt_counters.sleep == 1,
              "stale callbacks from the old key should be rejected")) {
    return EXIT_FAILURE;
  }

  screensaver_presence_router().select_home_assistant(
    "binary_sensor.hallway_presence");
  doorway.publish(true);
  if (!expect(!presence && rebuilt_counters.wake == 1,
              "switching to Home Assistant should deactivate local delivery") ||
      !expect(screensaver_presence_router().deliver_home_assistant(
                "binary_sensor.hallway_presence", true),
              "active Home Assistant source should use the shared handler") ||
      !expect(presence && rebuilt_counters.wake == 2,
              "Home Assistant true should preserve wake behavior")) {
    return EXIT_FAILURE;
  }

  screensaver_presence_router().deliver_home_assistant(
    "binary_sensor.hallway_presence", true);
  if (!expect(rebuilt_counters.wake == 2,
              "same Home Assistant state should not replay after rebuild")) {
    return EXIT_FAILURE;
  }

  screensaver_presence_router().select_none();
  if (!expect(!presence && rebuilt_counters.sleep == 2,
              "an empty selection should fail safe as no presence")) {
    return EXIT_FAILURE;
  }

  if (!expect(!screensaver_presence_bind_local_source<FakeBinarySensor>(
                "missing", nullptr),
              "missing local key should fail binding") ||
      !expect(!presence && rebuilt_counters.sleep == 3,
              "missing local key should fail safe as no presence")) {
    return EXIT_FAILURE;
  }

  reset_runtime();
  bool source_change_presence = false;
  Counters source_change_counters;
  set_targets(source_change_presence, source_change_counters);
  FakeBinarySensor active_local;
  active_local.available = true;
  active_local.state = true;
  screensaver_presence_bind_local_source("active_local", &active_local);
  screensaver_presence_router().select_home_assistant(
    "binary_sensor.hallway_presence");
  if (!expect(!source_change_presence,
              "switching from active local presence should clear stale state") ||
      !expect(source_change_counters.wake == 1 &&
                source_change_counters.sleep == 1,
              "local to Home Assistant should wake then fail safe once")) {
    return EXIT_FAILURE;
  }

  reset_runtime();
  bool card_first_presence = false;
  Counters card_first_counters;
  set_targets(card_first_presence, card_first_counters);
  FakeBinarySensor card_first;
  int card_first_updates = 0;
  card_first.add_on_state_callback(
    [&card_first_updates](bool) { card_first_updates++; });
  screensaver_presence_bind_local_source("card_first", &card_first);
  card_first.publish(true);
  if (!expect(card_first.callbacks.size() == 2 &&
              card_first_updates == 1 && card_first_counters.wake == 1,
              "card callback first should remain independent")) {
    return EXIT_FAILURE;
  }

  reset_runtime();
  bool screensaver_first_presence = false;
  Counters screensaver_first_counters;
  set_targets(screensaver_first_presence, screensaver_first_counters);
  FakeBinarySensor screensaver_first;
  screensaver_presence_bind_local_source("screensaver_first", &screensaver_first);
  int screensaver_first_card_updates = 0;
  screensaver_first.add_on_state_callback(
    [&screensaver_first_card_updates](bool) {
      screensaver_first_card_updates++;
    });
  screensaver_first.publish(true);
  if (!expect(screensaver_first.callbacks.size() == 2 &&
              screensaver_first_card_updates == 1 &&
              screensaver_first_counters.wake == 1,
              "screensaver callback first should remain independent")) {
    return EXIT_FAILURE;
  }

  return EXIT_SUCCESS;
}
