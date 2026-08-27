"use strict";
const test = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");

test("screensaver presence source controller", () => {
  const { runScreensaverPresenceSourceControllerTests } = loadTypescriptTest(
    "tests/web/screensaver_presence_source_controller.test.ts",
  );
  runScreensaverPresenceSourceControllerTests();
});
