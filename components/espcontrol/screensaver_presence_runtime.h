#pragma once

#include <functional>
#include <string>
#include <vector>

enum class ScreensaverPresenceSource {
  NONE,
  HOME_ASSISTANT,
  LOCAL,
};

struct ScreensaverPresenceSelection {
  ScreensaverPresenceSource source = ScreensaverPresenceSource::NONE;
  std::string key;
};

inline ScreensaverPresenceSelection parse_screensaver_presence_selection(
    const std::string &value) {
  static const std::string local_prefix = "local:";
  if (value.compare(0, local_prefix.size(), local_prefix) == 0) {
    return {
      ScreensaverPresenceSource::LOCAL,
      value.substr(local_prefix.size()),
    };
  }
  if (!value.empty()) {
    return {ScreensaverPresenceSource::HOME_ASSISTANT, value};
  }
  return {};
}

class ScreensaverPresenceRouter {
 public:
  void refresh_targets(
      bool *presence_detected,
      std::function<void()> activity,
      std::function<void()> wake,
      std::function<void()> sleep) {
    presence_detected_ = presence_detected;
    activity_ = std::move(activity);
    wake_ = std::move(wake);
    sleep_ = std::move(sleep);
    if (presence_detected_ && initialized_) {
      *presence_detected_ = last_state_;
    }
  }

  bool select_home_assistant(const std::string &entity_id) {
    const bool local_presence_active =
      source_ == ScreensaverPresenceSource::LOCAL && initialized_ && last_state_;
    const bool changed =
      select(ScreensaverPresenceSource::HOME_ASSISTANT, entity_id, nullptr);
    if (local_presence_active) dispatch(false);
    return changed;
  }

  bool select_local(const std::string &key, const void *source) {
    return select(ScreensaverPresenceSource::LOCAL, key, source);
  }

  bool select_none() {
    const bool had_source = source_ != ScreensaverPresenceSource::NONE;
    const bool changed =
      select(ScreensaverPresenceSource::NONE, std::string(), nullptr);
    if (had_source) dispatch(false);
    return changed;
  }

  bool deliver_home_assistant(const std::string &entity_id, bool state) {
    if (source_ != ScreensaverPresenceSource::HOME_ASSISTANT ||
        active_key_ != entity_id) {
      return false;
    }
    return dispatch(state);
  }

  bool deliver_local(const std::string &key, bool state) {
    if (source_ != ScreensaverPresenceSource::LOCAL || active_key_ != key) {
      return false;
    }
    return dispatch(state);
  }

  bool fail_local(const std::string &key) {
    if (source_ != ScreensaverPresenceSource::LOCAL || active_key_ != key) {
      return false;
    }
    return dispatch(false);
  }

  ScreensaverPresenceSource source() const { return source_; }
  const std::string &active_key() const { return active_key_; }
  bool initialized() const { return initialized_; }
  bool last_state() const { return last_state_; }

  void reset() {
    source_ = ScreensaverPresenceSource::NONE;
    active_key_.clear();
    local_source_ = nullptr;
    initialized_ = false;
    last_state_ = false;
    presence_detected_ = nullptr;
    activity_ = nullptr;
    wake_ = nullptr;
    sleep_ = nullptr;
  }

 private:
  bool select(
      ScreensaverPresenceSource source,
      const std::string &key,
      const void *local_source) {
    const bool changed =
      source_ != source || active_key_ != key || local_source_ != local_source;
    source_ = source;
    active_key_ = key;
    local_source_ = local_source;
    if (changed) initialized_ = false;
    return changed;
  }

  bool dispatch(bool state) {
    if (initialized_ && last_state_ == state) return false;
    initialized_ = true;
    last_state_ = state;
    if (presence_detected_) *presence_detected_ = state;
    if (state) {
      if (activity_) activity_();
      if (wake_) wake_();
    } else if (sleep_) {
      sleep_();
    }
    return true;
  }

  ScreensaverPresenceSource source_ = ScreensaverPresenceSource::NONE;
  std::string active_key_;
  const void *local_source_ = nullptr;
  bool initialized_ = false;
  bool last_state_ = false;
  bool *presence_detected_ = nullptr;
  std::function<void()> activity_;
  std::function<void()> wake_;
  std::function<void()> sleep_;
};

inline ScreensaverPresenceRouter &screensaver_presence_router() {
  static ScreensaverPresenceRouter router;
  return router;
}

inline std::vector<std::string> &screensaver_presence_callback_registry() {
  static std::vector<std::string> keys;
  return keys;
}

inline bool screensaver_presence_register_callback(const std::string &key) {
  for (const auto &registered_key : screensaver_presence_callback_registry()) {
    if (registered_key == key) return false;
  }
  screensaver_presence_callback_registry().push_back(key);
  return true;
}

template<typename BinarySensor>
inline bool screensaver_presence_bind_local_source(
    const std::string &key,
    BinarySensor *sensor) {
  auto &router = screensaver_presence_router();
  const bool changed = router.select_local(key, sensor);
  if (!sensor) {
    if (changed || !router.initialized()) router.fail_local(key);
    return false;
  }
  if (screensaver_presence_register_callback(key)) {
    sensor->add_on_state_callback([key](bool state) {
      screensaver_presence_router().deliver_local(key, state);
    });
  }
  if (changed) {
    if (sensor->has_state()) {
      router.deliver_local(key, sensor->state);
    } else {
      router.fail_local(key);
    }
  }
  return true;
}
