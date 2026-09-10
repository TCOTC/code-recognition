const assert = require("node:assert/strict");
const test = require("node:test");

const {
    DEFAULT_CONFIG,
    normalizeConfig,
} = require("../.test-dist/src/config/index.js");

test("optional entry buttons are disabled by default", () => {
    assert.equal(DEFAULT_CONFIG.showTopBarButton, false);
    assert.equal(DEFAULT_CONFIG.showBreadcrumbButton, false);
});

test("normalizes persisted entry button settings", () => {
    assert.deepEqual(
        normalizeConfig({
            enabled: false,
            detectOnPaste: false,
            showTopBarButton: true,
            showBreadcrumbButton: true,
        }),
        {
            enabled: false,
            detectOnPaste: false,
            showTopBarButton: true,
            showBreadcrumbButton: true,
        },
    );
});
