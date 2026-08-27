import {
  buildExternalTargetUrl,
  UNCONFIGURED_DATASPACE_ID,
} from "./externalTargetUrl";

const environmentalLink = {
  slug: "environmental-monitoring",
  url: "/environmental-monitoring/",
};

test("partitions the embedded Environmental Monitoring URL", () => {
  expect(
    buildExternalTargetUrl({
      activeLink: environmentalLink,
      language: "de",
      origin: "https://dataspace.example",
      dataspaceId: "stadt-wuppertal",
    })
  ).toBe(
    "https://dataspace.example/environmental-monitoring/?lang=de&dataspaceId=stadt-wuppertal"
  );
});

test("fails closed when the embedded dataspace partition is not configured", () => {
  const target = new URL(
    buildExternalTargetUrl({
      activeLink: environmentalLink,
      language: "en",
      origin: "https://dataspace.example",
      dataspaceId: "",
    })
  );
  expect(target.searchParams.get("dataspaceId")).toBe(
    UNCONFIGURED_DATASPACE_ID
  );
});

test.each(["../../private", "test?combined=true", "__unconfigured__", 42])(
  "fails closed for an invalid embedded dataspace partition: %p",
  (dataspaceId) => {
    const target = new URL(
      buildExternalTargetUrl({
        activeLink: environmentalLink,
        language: "en",
        origin: "https://dataspace.example",
        dataspaceId,
      })
    );
    expect(target.searchParams.get("dataspaceId")).toBe(
      UNCONFIGURED_DATASPACE_ID
    );
  }
);

test("trims a configured embedded dataspace partition", () => {
  const target = new URL(
    buildExternalTargetUrl({
      activeLink: environmentalLink,
      language: "en",
      origin: "https://dataspace.example",
      dataspaceId: " stadt-wuppertal ",
    })
  );
  expect(target.searchParams.get("dataspaceId")).toBe("stadt-wuppertal");
});

test("does not add a dataspace partition to unrelated applications", () => {
  const target = new URL(
    buildExternalTargetUrl({
      activeLink: { slug: "solid-tours", url: "/solid-tours/" },
      language: "en",
      origin: "https://dataspace.example",
      dataspaceId: "test",
    })
  );
  expect(target.searchParams.get("dataspaceId")).toBeNull();
});
