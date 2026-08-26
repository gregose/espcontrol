---
title: Local Sensor Cards
description:
  How to display readings from ESPHome sensors on the panel itself.
---

# Local Sensor

Local Sensor is a **Sensor** card source for a numeric `sensor`, `text_sensor`, or `binary_sensor` running on the display device. It is read-only and continues to work while Home Assistant is unavailable.

## Set Up a Local Sensor

1. Define the sensor normally in the device's ESPHome YAML.
2. Select a card, change its type to **Sensor**, then set **Source** to **Local Sensor**.
3. Choose the sensor. Its display mode is selected automatically, and its label and unit are filled in when applicable.
4. Use **Numeric** for a number, **Text** for a live text state, or **Binary** for an off/on state.

The picker normally shows your own sensors. Turn on **Show internal sensors** to include diagnostics such as Wi-Fi signal strength. If the setup page cannot reach the panel, enter the ESPHome sensor `object_id` as the **Sensor Key**.

The card updates at the sensor's normal ESPHome update rate. It shows `--` until the first reading arrives. For a binary sensor, `Off` is a real state and remains distinguishable from this unavailable/no-state display. Binary cards can use separate off/on icons and can optionally light the active colour only while the sensor is on.

## Binary Sensor Examples

Binary mode works with generic ESPHome presence, PIR motion, occupancy, door/window, leak, smoke, vibration, and GPIO binary sensors. Device-class metadata supplies a suitable icon pair where supported; otherwise the card uses safe generic off/on icons and labels.

For example, a P4-86 display with the LD2410 addon can select **Radar Presence**, **Radar Moving Target**, **Radar Still Target**, or the optional **Radar Presence (OUT pin)** directly. No Home Assistant entity or template text-sensor bridge is required.

ESPHome `number`, `select`, `switch`, and `button` entities are controls or configuration surfaces rather than read-only sensor values. They are not available through Local Sensor.

For values already in Home Assistant, keep the standard [Sensor](/card-types/sensors) source instead.
