const { parseBooleanValue } = require("../../scripts/runtime-config-utils");

describe("runtime config boolean values", () => {
  test.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["invalid", false],
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["yes", true],
    ["on", true],
  ])("parses %p as %p", (value, expected) => {
    expect(parseBooleanValue(value)).toBe(expected);
  });
});
