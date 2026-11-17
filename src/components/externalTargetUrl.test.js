import {
  buildExternalTargetUrl,
  UNCONFIGURED_DATASPACE_ID,
} from "./externalTargetUrl";

const environmentalLink = {
  slug: "urban-data-explorer",
  url: "/urban-data-explorer/",
};

test.each(["stadt-wuppertal", "dace", "timberconnect", "test"])(
  "partitions the embedded Urban Data Explorer URL for %s",
  (dataspaceId) => {
    expect(
      buildExternalTargetUrl({
        activeLink: environmentalLink,
        language: "de",
        origin: "https://dataspace.example",
        dataspaceId,
      })
    ).toBe(
      `https://dataspace.example/urban-data-explorer/?lang=de&dataspaceId=${dataspaceId}`
    );
  }
);

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
      activeLink: { slug: "city-tours", url: "/city-tours/" },
      language: "en",
      origin: "https://dataspace.example",
      dataspaceId: "test",
    })
  );
  expect(target.searchParams.get("dataspaceId")).toBeNull();
});


test("changes the embedded document URL when the displayed monitoring version changes", () => {
  const target = (version) => new URL(buildExternalTargetUrl({
    activeLink: { ...environmentalLink, version },
    language: "en",
    origin: "https://dataspace.example",
    dataspaceId: "test",
  }));
  expect(target("0.3.17").href).not.toBe(target("0.3.18").href);
  expect(target("0.3.18").searchParams.get("v")).toBe("0.3.18");
  expect(target("0.3.18").searchParams.get("dataspaceId")).toBe("test");
  expect(target("0.3.18").searchParams.get("lang")).toBe("en");
});
