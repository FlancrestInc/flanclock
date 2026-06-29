export const DEFAULT_CONFIG = {
  admin: {
    passwordHash: "",
    passwordChangedAt: null
  },
  display: {
    timezone: "America/Denver",
    hourMode: "12",
    showSeconds: true,
    showDate: true,
    dateFormat: "cccc, LLLL d",
    datePosition: "below",
    brightness: {
      enabled: false,
      dimStart: "22:00",
      dimEnd: "06:00",
      dimOpacity: 0.45
    }
  },
  face: {
    type: "sevenSegment",
    theme: "red",
    modern: {
      font: "systemSans",
      fontScale: 1,
      color: "#f6f7fb",
      backgroundColor: "#101418",
      density: "comfortable"
    },
    photo: {
      source: "local",
      localFolder: "./data/photos",
      icloudUrl: "",
      immichServerUrl: "",
      immichAlbumId: "",
      rotationIntervalSeconds: 30,
      overlayPosition: "bottom-left",
      overlayOpacity: 0.62,
      showDate: true,
      showWeather: true
    }
  },
  weather: {
    enabled: false,
    provider: "openMeteo",
    locationLabel: "Denver, CO",
    latitude: 39.7392,
    longitude: -104.9903,
    units: "fahrenheit",
    cacheTtlMinutes: 20
  },
  providers: {
    immich: {
      serverUrl: "",
      albumId: "",
      apiKey: ""
    },
    icloud: {
      publicAlbumUrl: ""
    }
  }
};

export const PUBLIC_CONFIG_KEYS = ["display", "face", "weather", "providers"];
