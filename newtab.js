const FAVORITES_KEY = "favorites";
const CUSTOM_NAMES_KEY = "customNames";
const FAVORITES_PER_PAGE = 8;
const WEATHER_CACHE_KEY = "weatherCache";
const WEATHER_OVERRIDE_KEY = "weatherOverride";
const WEATHER_CACHE_TTL = 15 * 60 * 1000;
const DISPLAY_NAME_KEY = "displayName";
const WHEEL_PAGE_COOLDOWN = 350;
const THEME_KEY = "themeSettings";

let modalMode = "add-favorite";
let editingTarget = null;
let openMenu = null;
let draggedFavoriteIndex = null;
let currentFavoritesPage = 0;
let totalFavoritesPages = 1;
let lastFavoritesWheelAt = 0;
let displayName = "";
let themeSettings = null;

const THEME_PRESETS = {
    midnight: {
        bg: "#0f1115",
        panel: "#171a21",
        panel2: "#1f2430",
        text: "#e8ecf1",
        muted: "#9aa4b2",
        accent: "#7aa2f7",
        border: "#2a3040"
    },
    dusk: {
        bg: "#11131f",
        panel: "#1a1d2a",
        panel2: "#222637",
        text: "#f0f2f7",
        muted: "#b4bbc8",
        accent: "#f0932b",
        border: "#2d3448"
    },
    forest: {
        bg: "#0c1611",
        panel: "#15211a",
        panel2: "#1e2b22",
        text: "#e9f2ec",
        muted: "#a0b3a7",
        accent: "#2ecc71",
        border: "#24352b"
    },
    sand: {
        bg: "#f6f1e6",
        panel: "#fffaf0",
        panel2: "#efe5d6",
        text: "#1f1a12",
        muted: "#6d6251",
        accent: "#c97b42",
        border: "#d9cbb7"
    }
};

const THEME_DEFAULT = {
    preset: "midnight",
    colors: { ...THEME_PRESETS.midnight },
    backgroundUrl: ""
};

const COMMAND_HINT_TEXT = "Try: yt cats, gh repo, mail, docs";
const COMMANDS = [
    {
        id: "youtube",
        label: "YouTube Search",
        aliases: ["yt", "youtube"],
        type: "search",
        template: "https://www.youtube.com/results?search_query={query}",
        baseUrl: "https://www.youtube.com/",
        description: "Search videos"
    },
    {
        id: "github",
        label: "GitHub Search",
        aliases: ["gh", "github"],
        type: "search",
        template: "https://github.com/search?q={query}",
        baseUrl: "https://github.com/",
        description: "Search repos/issues"
    },
    {
        id: "mail",
        label: "Gmail",
        aliases: ["mail", "gmail"],
        type: "url",
        url: "https://mail.google.com/",
        description: "Open inbox"
    },
    {
        id: "docs",
        label: "Google Docs",
        aliases: ["docs", "doc"],
        type: "url",
        url: "https://docs.google.com/document/u/0/",
        description: "Open documents"
    },
    {
        id: "drive",
        label: "Google Drive",
        aliases: ["drive"],
        type: "url",
        url: "https://drive.google.com/drive/u/0/my-drive",
        description: "Open Drive"
    },
    {
        id: "calendar",
        label: "Google Calendar",
        aliases: ["cal", "calendar"],
        type: "url",
        url: "https://calendar.google.com/calendar/u/0/r",
        description: "View calendar"
    },
    {
        id: "maps",
        label: "Maps Search",
        aliases: ["maps", "map"],
        type: "search",
        template: "https://www.google.com/maps/search/{query}",
        baseUrl: "https://www.google.com/maps",
        description: "Find a place"
    }
];

function $(id) {
    return document.getElementById(id);
}

function getGreetingMessage(name = "", date = new Date()) {
    const hour = date.getHours();
    const suffix = name ? `, ${name}` : "";
    if (hour < 12) {
        return `Good morning${suffix}.`;
    }
    if (hour < 18) {
        return `Good afternoon${suffix}.`;
    }
    return `Good evening${suffix}.`;
}

async function loadDisplayName() {
    const result = await chrome.storage.local.get([DISPLAY_NAME_KEY]);
    displayName = (result[DISPLAY_NAME_KEY] || "").trim();
    updateGreeting();
    updateNameUi();
}

async function saveDisplayName(name) {
    displayName = name.trim();
    await chrome.storage.local.set({ [DISPLAY_NAME_KEY]: displayName });
}

function getGreetingNote(date = new Date()) {
    const hour = date.getHours();
    if (hour < 12) {
        return "Start your day with a clear focus.";
    }
    if (hour < 18) {
        return "Keep the momentum going.";
    }
    return "Time to wind down and wrap up.";
}

function updateGreeting() {
    const greetingEl = $("greetingText");
    const noteEl = $("greetingNote");
    const fullGreeting = getGreetingMessage(displayName);
    if (greetingEl) {
        greetingEl.textContent = fullGreeting;
    }
    if (noteEl) {
        noteEl.textContent = getGreetingNote();
    }
}

function updateNameUi() {
    const trigger = $("nameMenuTrigger");
    if (trigger) {
        trigger.classList.remove("is-hidden");
    }
}

function normalizeColor(value, fallback) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
        return trimmed;
    }
    return fallback;
}

function sanitizeBackgroundUrl(value) {
    if (!value) return "";
    try {
        const parsed = new URL(value);
        if (!["http:", "https:"].includes(parsed.protocol)) {
            return "";
        }
        return parsed.toString();
    } catch {
        return "";
    }
}

function resolveThemeColors(settings) {
    const preset = settings?.preset || THEME_DEFAULT.preset;
    const base =
        preset !== "custom" && THEME_PRESETS[preset]
            ? THEME_PRESETS[preset]
            : THEME_PRESETS[THEME_DEFAULT.preset];

    if (preset !== "custom") {
        return { preset, colors: { ...base } };
    }

    const colors = settings?.colors || {};
    return {
        preset,
        colors: {
            bg: normalizeColor(colors.bg, base.bg),
            panel: normalizeColor(colors.panel, base.panel),
            panel2: normalizeColor(colors.panel2, base.panel2),
            text: normalizeColor(colors.text, base.text),
            muted: normalizeColor(colors.muted, base.muted),
            accent: normalizeColor(colors.accent, base.accent),
            border: normalizeColor(colors.border, base.border)
        }
    };
}

async function getThemeSettings() {
    const result = await chrome.storage.local.get([THEME_KEY]);
    const stored = result[THEME_KEY];
    if (!stored || typeof stored !== "object") {
        return { ...THEME_DEFAULT };
    }
    return {
        preset: stored.preset || THEME_DEFAULT.preset,
        colors: stored.colors || { ...THEME_DEFAULT.colors },
        backgroundUrl: stored.backgroundUrl || ""
    };
}

async function saveThemeSettings(settings) {
    await chrome.storage.local.set({ [THEME_KEY]: settings });
}

function applyThemeSettings(settings) {
    const resolved = resolveThemeColors(settings);
    const colors = resolved.colors;
    const root = document.documentElement;

    root.style.setProperty("--bg", colors.bg);
    root.style.setProperty("--panel", colors.panel);
    root.style.setProperty("--panel-2", colors.panel2);
    root.style.setProperty("--text", colors.text);
    root.style.setProperty("--muted", colors.muted);
    root.style.setProperty("--accent", colors.accent);
    root.style.setProperty("--border", colors.border);

    const backgroundUrl = sanitizeBackgroundUrl(settings?.backgroundUrl || "");
    root.style.setProperty(
        "--bg-image",
        backgroundUrl ? `url("${backgroundUrl}")` : "none"
    );
}

async function loadThemeSettings() {
    themeSettings = await getThemeSettings();
    applyThemeSettings(themeSettings);
}

function setThemeInputValues(colors) {
    const colorBg = $("colorBg");
    const colorPanel = $("colorPanel");
    const colorPanel2 = $("colorPanel2");
    const colorText = $("colorText");
    const colorMuted = $("colorMuted");
    const colorAccent = $("colorAccent");
    const colorBorder = $("colorBorder");

    const safeColors = {
        bg: normalizeColor(colors.bg, THEME_DEFAULT.colors.bg),
        panel: normalizeColor(colors.panel, THEME_DEFAULT.colors.panel),
        panel2: normalizeColor(colors.panel2, THEME_DEFAULT.colors.panel2),
        text: normalizeColor(colors.text, THEME_DEFAULT.colors.text),
        muted: normalizeColor(colors.muted, THEME_DEFAULT.colors.muted),
        accent: normalizeColor(colors.accent, THEME_DEFAULT.colors.accent),
        border: normalizeColor(colors.border, THEME_DEFAULT.colors.border)
    };

    if (colorBg) colorBg.value = safeColors.bg;
    if (colorPanel) colorPanel.value = safeColors.panel;
    if (colorPanel2) colorPanel2.value = safeColors.panel2;
    if (colorText) colorText.value = safeColors.text;
    if (colorMuted) colorMuted.value = safeColors.muted;
    if (colorAccent) colorAccent.value = safeColors.accent;
    if (colorBorder) colorBorder.value = safeColors.border;
}

function readCustomColorsFromInputs() {
    return {
        bg: $("colorBg")?.value || THEME_DEFAULT.colors.bg,
        panel: $("colorPanel")?.value || THEME_DEFAULT.colors.panel,
        panel2: $("colorPanel2")?.value || THEME_DEFAULT.colors.panel2,
        text: $("colorText")?.value || THEME_DEFAULT.colors.text,
        muted: $("colorMuted")?.value || THEME_DEFAULT.colors.muted,
        accent: $("colorAccent")?.value || THEME_DEFAULT.colors.accent,
        border: $("colorBorder")?.value || THEME_DEFAULT.colors.border
    };
}

function getSelectedThemePreset() {
    const selected = document.querySelector("input[name=\"themePreset\"]:checked");
    return selected ? selected.value : THEME_DEFAULT.preset;
}

function updateCustomFieldsVisibility(preset) {
    const container = $("themeCustomFields");
    if (!container) return;
    if (preset === "custom") {
        container.classList.remove("is-hidden");
    } else {
        container.classList.add("is-hidden");
    }
}

function applyThemePreview(colors, backgroundUrl) {
    const preview = $("themePreview");
    if (!preview) return;
    preview.style.setProperty("--panel", colors.panel);
    preview.style.setProperty("--text", colors.text);
    preview.style.setProperty("--border", colors.border);
    preview.style.backgroundColor = colors.panel;
    preview.style.color = colors.text;
    const sanitized = sanitizeBackgroundUrl(backgroundUrl);
    preview.style.backgroundImage = sanitized ? `url("${sanitized}")` : "none";
    preview.style.backgroundSize = "cover";
    preview.style.backgroundPosition = "center";
}

function updateThemePreviewFromForm() {
    const preset = getSelectedThemePreset();
    const backgroundInput = $("backgroundUrl");
    const backgroundUrl = backgroundInput ? backgroundInput.value.trim() : "";
    const colors =
        preset === "custom"
            ? readCustomColorsFromInputs()
            : THEME_PRESETS[preset] || THEME_PRESETS[THEME_DEFAULT.preset];

    applyThemePreview(colors, backgroundUrl);
}

function openCustomizeModal() {
    closeOpenMenu();
    const modal = $("customizeModal");
    const error = $("customizeError");
    if (error) {
        error.textContent = "";
    }

    const settings = themeSettings || THEME_DEFAULT;
    let preset = settings.preset || THEME_DEFAULT.preset;
    if (preset !== "custom" && !THEME_PRESETS[preset]) {
        preset = THEME_DEFAULT.preset;
    }
    const presetInput = document.querySelector(
        `input[name="themePreset"][value="${preset}"]`
    );
    if (presetInput) {
        presetInput.checked = true;
    }

    const customColors = resolveThemeColors({ preset: "custom", colors: settings.colors }).colors;
    setThemeInputValues(customColors);

    const backgroundInput = $("backgroundUrl");
    if (backgroundInput) {
        backgroundInput.value = settings.backgroundUrl || "";
    }

    updateCustomFieldsVisibility(preset);
    updateThemePreviewFromForm();

    if (modal) {
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }

    if (presetInput) {
        presetInput.focus();
    }
}

function closeCustomizeModal() {
    const modal = $("customizeModal");
    const error = $("customizeError");
    if (modal) {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }
    if (error) {
        error.textContent = "";
    }
}

async function handleCustomizeSubmit(event) {
    event.preventDefault();
    const error = $("customizeError");
    const backgroundInput = $("backgroundUrl");
    const backgroundValue = backgroundInput ? backgroundInput.value.trim() : "";
    const preset = getSelectedThemePreset();
    const colors = readCustomColorsFromInputs();

    if (backgroundValue) {
        const sanitized = sanitizeBackgroundUrl(backgroundValue);
        if (!sanitized) {
            if (error) {
                error.textContent = "Enter a valid http or https image URL.";
            }
            return;
        }
    }

    if (error) {
        error.textContent = "";
    }

    const nextSettings = {
        preset,
        colors,
        backgroundUrl: backgroundValue
    };

    await saveThemeSettings(nextSettings);
    themeSettings = nextSettings;
    applyThemeSettings(nextSettings);
    closeCustomizeModal();
}

function openNameModal() {
    const modal = $("nameModal");
    const input = $("nameModalInput");
    const error = $("nameModalError");
    if (error) {
        error.textContent = "";
    }
    if (input) {
        input.value = displayName || "";
    }
    if (modal) {
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }
    if (input) {
        input.focus();
        input.select();
    }
}

function closeNameModal() {
    const modal = $("nameModal");
    const error = $("nameModalError");
    if (modal) {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }
    if (error) {
        error.textContent = "";
    }
}

async function handleNameModalSubmit(event) {
    event.preventDefault();
    const input = $("nameModalInput");
    const error = $("nameModalError");
    const value = input ? input.value.trim() : "";

    if (!value) {
        if (error) {
            error.textContent = "Please enter a name.";
        }
        return;
    }

    if (error) {
        error.textContent = "";
    }

    await saveDisplayName(value);
    updateGreeting();
    updateNameUi();
    closeNameModal();
}

function scheduleGreetingRefresh() {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    const delay = nextHour.getTime() - now.getTime();
    window.setTimeout(() => {
        updateGreeting();
        scheduleGreetingRefresh();
    }, delay);
}

function formatUpdateTime(date) {
    return `Updated ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function getWeatherDescription(code) {
    if (code === 0) return "Clear sky";
    if (code >= 1 && code <= 3) return "Partly cloudy";
    if (code === 45 || code === 48) return "Fog";
    if (code >= 51 && code <= 57) return "Drizzle";
    if (code >= 61 && code <= 67) return "Rain";
    if (code >= 71 && code <= 77) return "Snow";
    if (code >= 80 && code <= 82) return "Rain showers";
    if (code >= 85 && code <= 86) return "Snow showers";
    if (code >= 95 && code <= 99) return "Thunderstorm";
    return "Unknown";
}

async function getWeatherOverride() {
    const result = await chrome.storage.local.get(WEATHER_OVERRIDE_KEY);
    return result[WEATHER_OVERRIDE_KEY] ?? null;
}

async function saveWeatherOverride(override) {
    await chrome.storage.local.set({ [WEATHER_OVERRIDE_KEY]: override });
}

async function clearWeatherOverride() {
    await chrome.storage.local.remove(WEATHER_OVERRIDE_KEY);
}

async function getWeatherCache() {
    const result = await chrome.storage.local.get(WEATHER_CACHE_KEY);
    return result[WEATHER_CACHE_KEY] ?? null;
}

async function saveWeatherCache(cache) {
    await chrome.storage.local.set({ [WEATHER_CACHE_KEY]: cache });
}

function setWeatherError(message) {
    const errorEl = $("weatherError");
    if (errorEl) {
        errorEl.textContent = message || "";
    }
}

function updateWeatherDisplay({
    locationName,
    temperatureText,
    conditionText,
    metaText
}) {
    if ($("weatherLocation")) {
        $("weatherLocation").textContent = locationName || "Unknown";
    }
    if ($("weatherTemp")) {
        $("weatherTemp").textContent = temperatureText || "--";
    }
    if ($("weatherCondition")) {
        $("weatherCondition").textContent = conditionText || "--";
    }
    if ($("weatherMeta")) {
        $("weatherMeta").textContent = metaText || "";
    }
}

async function geocodeLocation(name) {
    const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            name
        )}&count=1&language=en&format=json`
    );

    if (!response.ok) {
        throw new Error("Could not resolve that location.");
    }

    const data = await response.json();
    if (!data.results || !data.results.length) {
        throw new Error("Location not found.");
    }

    const result = data.results[0];
    return {
        name: result.name,
        latitude: result.latitude,
        longitude: result.longitude,
        region: result.admin1,
        country: result.country_code
    };
}

async function fetchWeather(latitude, longitude) {
    const useFahrenheit = navigator.language === "en-US";
    const temperatureUnit = useFahrenheit ? "fahrenheit" : "celsius";
    const unitLabel = useFahrenheit ? "°F" : "°C";

    const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=${temperatureUnit}&timezone=auto`
    );

    if (!response.ok) {
        throw new Error("Weather service is unavailable.");
    }

    const data = await response.json();
    if (!data.current) {
        throw new Error("Weather data missing.");
    }

    return {
        temperature: `${Math.round(data.current.temperature_2m)}${unitLabel}`,
        code: data.current.weather_code
    };
}

function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation not supported."));
            return;
        }

        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 60000
        });
    });
}

async function loadWeather({ forceDevice = false } = {}) {
    const override = forceDevice ? null : await getWeatherOverride();
    const cache = await getWeatherCache();
    const now = Date.now();

    const overrideInput = $("weatherOverrideModalInput");
    if (overrideInput) {
        overrideInput.value = override ? override.name : "";
    }

    const cacheIsFresh =
        cache &&
        now - cache.timestamp < WEATHER_CACHE_TTL &&
        ((override && cache.source === "override" && cache.locationName === override.name) ||
            (!override && cache.source === "device"));

    if (cacheIsFresh) {
        updateWeatherDisplay({
            locationName: cache.locationName,
            temperatureText: cache.temperature,
            conditionText: getWeatherDescription(cache.code),
            metaText: formatUpdateTime(new Date(cache.timestamp))
        });
    }

    try {
        setWeatherError("");

        let locationName = "";
        let latitude = 0;
        let longitude = 0;
        let source = "device";

        if (override) {
            ({ latitude, longitude } = override);
            locationName = override.name;
            source = "override";
        } else {
            updateWeatherDisplay({
                locationName: "Locating...",
                temperatureText: cacheIsFresh ? cache.temperature : "--",
                conditionText: cacheIsFresh ? getWeatherDescription(cache.code) : "--",
                metaText: "Requesting device location..."
            });

            const position = await getCurrentPosition();
            latitude = position.coords.latitude;
            longitude = position.coords.longitude;
            locationName = "Current location";
        }

        const weather = await fetchWeather(latitude, longitude);
        const updatedAt = new Date();

        updateWeatherDisplay({
            locationName,
            temperatureText: weather.temperature,
            conditionText: getWeatherDescription(weather.code),
            metaText: formatUpdateTime(updatedAt)
        });

        await saveWeatherCache({
            timestamp: updatedAt.getTime(),
            locationName,
            latitude,
            longitude,
            temperature: weather.temperature,
            code: weather.code,
            source
        });
    } catch (error) {
        setWeatherError(error.message || "Could not load weather.");
        updateWeatherDisplay({
            locationName: override ? override.name : "Location unavailable",
            temperatureText: "--",
            conditionText: "--",
            metaText: "" 
        });
    }
}

async function handleWeatherOverride(name, errorEl = null) {
    const value = (name || "").trim();

    if (!value) {
        const message = "Enter a city to override location.";
        setWeatherError(message);
        if (errorEl) {
            errorEl.textContent = message;
        }
        return false;
    }

    try {
        setWeatherError("");
        if (errorEl) {
            errorEl.textContent = "";
        }

        const result = await geocodeLocation(value);
        const locationLabel = [result.name, result.region, result.country]
            .filter(Boolean)
            .join(", ");

        await saveWeatherOverride({
            name: locationLabel,
            latitude: result.latitude,
            longitude: result.longitude
        });

        const overrideInput = $("weatherOverrideModalInput");
        if (overrideInput) {
            overrideInput.value = locationLabel;
        }

        await loadWeather();
        return true;
    } catch (error) {
        const message = error.message || "Could not set override location.";
        setWeatherError(message);
        if (errorEl) {
            errorEl.textContent = message;
        }
        return false;
    }
}

async function handleUseDeviceLocation() {
    await clearWeatherOverride();
    await loadWeather({ forceDevice: true });
}

async function openWeatherOverrideModal() {
    closeOpenMenu();
    const modal = $("weatherOverrideModal");
    const input = $("weatherOverrideModalInput");
    const error = $("weatherOverrideModalError");
    if (error) {
        error.textContent = "";
    }

    if (input) {
        const override = await getWeatherOverride();
        input.value = override ? override.name : "";
    }

    if (modal) {
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }

    if (input) {
        input.focus();
        input.select();
    }
}

function closeWeatherOverrideModal() {
    const modal = $("weatherOverrideModal");
    const error = $("weatherOverrideModalError");
    if (modal) {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }
    if (error) {
        error.textContent = "";
    }
}

async function handleWeatherOverrideSubmit(event) {
    event.preventDefault();
    const input = $("weatherOverrideModalInput");
    const error = $("weatherOverrideModalError");
    const success = await handleWeatherOverride(input ? input.value : "", error);
    if (success) {
        closeWeatherOverrideModal();
    }
}

function getCommandHintText() {
    return COMMAND_HINT_TEXT;
}

function findCommandByAlias(alias) {
    if (!alias) return null;
    const lower = alias.toLowerCase();
    return (
        COMMANDS.find((command) => command.aliases.includes(lower)) ||
        COMMANDS.find((command) => command.aliases.some((value) => lower.startsWith(value))) ||
        null
    );
}

function buildCommandUrl(command, query) {
    if (!command) return "";
    const trimmed = (query || "").trim();
    if (command.type === "search") {
        if (!trimmed) {
            return command.baseUrl || command.template.replace("{query}", "");
        }
        return command.template.replace("{query}", encodeURIComponent(trimmed));
    }
    return command.url;
}

function looksLikeUrl(value) {
    return /^(https?:\/\/|[\w-]+\.[\w.-]+)(\/|$)/i.test(value);
}

function findFavoriteMatch(query, favorites) {
    const normalized = query.toLowerCase();
    const exactMatch = favorites.find((favorite) => {
        const name = (favorite.name || "").toLowerCase();
        const host = getHostname(favorite.url).toLowerCase();
        return name === normalized || host === normalized;
    });
    if (exactMatch) return exactMatch;

    return favorites.find((favorite) => {
        const name = (favorite.name || "").toLowerCase();
        const host = getHostname(favorite.url).toLowerCase();
        return name.startsWith(normalized) || host.startsWith(normalized);
    });
}

function getAutocompleteSuggestion(value, favorites) {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const tokens = trimmed.split(/\s+/);
    const firstToken = tokens[0].toLowerCase();
    const rest = tokens.slice(1).join(" ");

    const commandMatch = COMMANDS.find((command) =>
        command.aliases.some((alias) => alias.startsWith(firstToken))
    );

    if (commandMatch && !rest) {
        const alias = commandMatch.aliases[0];
        if (alias.startsWith(firstToken) && alias !== firstToken) {
            return alias;
        }
    }

    if (!rest) {
        const favoriteMatch = favorites.find((favorite) => {
            const name = (favorite.name || "").toLowerCase();
            const host = getHostname(favorite.url).toLowerCase();
            return name.startsWith(firstToken) || host.startsWith(firstToken);
        });

        if (favoriteMatch) {
            return favoriteMatch.name || getHostname(favoriteMatch.url);
        }
    }

    return "";
}

function updateCommandGhost(value, favorites) {
    const ghost = $("commandGhost");
    if (!ghost) return;
    const suggestion = getAutocompleteSuggestion(value, favorites);
    if (!suggestion || suggestion.toLowerCase() === value.trim().toLowerCase()) {
        ghost.textContent = "";
        return;
    }
    ghost.textContent = suggestion;
}

async function resolveCommandInput(value) {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const tokens = trimmed.split(/\s+/);
    const command = findCommandByAlias(tokens[0]);
    if (command) {
        return buildCommandUrl(command, tokens.slice(1).join(" "));
    }

    if (looksLikeUrl(trimmed)) {
        try {
            return normalizeUrl(trimmed);
        } catch {
            return "";
        }
    }

    const favorites = await getFavorites();
    const favoriteMatch = findFavoriteMatch(trimmed, favorites);
    if (favoriteMatch?.url) {
        return favoriteMatch.url;
    }

    return `https://search.brave.com/search?q=${encodeURIComponent(trimmed)}`;
}

async function handleCommandSubmit(event) {
    event.preventDefault();
    const input = $("commandInput");
    if (!input) return;
    const url = await resolveCommandInput(input.value);
    if (!url) return;
    window.location.assign(url);
}

async function getFavorites() {
    const result = await chrome.storage.local.get(FAVORITES_KEY);
    return result[FAVORITES_KEY] ?? [
        { name: "Gmail", url: "https://mail.google.com/" },
        { name: "YouTube", url: "https://www.youtube.com/" },
        { name: "GitHub", url: "https://github.com/" }
    ];
}

async function saveFavorites(favorites) {
    await chrome.storage.local.set({ [FAVORITES_KEY]: favorites });
}

async function getCustomNames() {
    const result = await chrome.storage.local.get(CUSTOM_NAMES_KEY);
    return result[CUSTOM_NAMES_KEY] ?? {};
}

async function saveCustomNames(customNames) {
    await chrome.storage.local.set({ [CUSTOM_NAMES_KEY]: customNames });
}

function normalizeUrl(input) {
    let url = input.trim();
    if (!url) {
        throw new Error("Please enter a website URL.");
    }

    if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
    }

    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Only http and https URLs are supported.");
    }

    return parsed.toString();
}

function deriveDisplayName(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

function closeOpenMenu() {
    if (!openMenu) return;
    openMenu.menu.classList.remove("open");
    openMenu.trigger.classList.remove("open");
    openMenu = null;
}

function toggleMenu(menu, trigger) {
    const isOpen = menu.classList.contains("open");
    closeOpenMenu();

    if (!isOpen) {
        menu.classList.add("open");
        trigger.classList.add("open");
        openMenu = { menu, trigger };
    }
}

function makeCard(item, options = {}) {
    const wrap = document.createElement("div");
    wrap.className = "card-wrap";

    const a = document.createElement("a");
    a.className = "card";
    a.href = item.url;
    a.innerHTML = `
        <div class="title"></div>
        <div class="url"></div>
    `;
    a.querySelector(".title").textContent = item.name || item.title || item.url;
    a.querySelector(".url").textContent = item.url;

    const trigger = document.createElement("button");
    trigger.className = "card-menu-trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-label", "Open site menu");

    const menu = document.createElement("div");
    menu.className = "card-menu";

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        event.preventDefault();
        closeOpenMenu();
        openRenameModal(options.renameTarget);
    });
    menu.appendChild(renameBtn);

    if (options.canRemove) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "danger";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            event.preventDefault();
            closeOpenMenu();
            await removeFavorite(options.removeIndex);
        });
        menu.appendChild(removeBtn);
    }

    trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMenu(menu, trigger);
    });

    wrap.appendChild(a);
    wrap.appendChild(trigger);
    wrap.appendChild(menu);

    return wrap;
}

function makeAddCard() {
    const button = document.createElement("button");
    button.className = "card add-card";
    button.type = "button";
    button.innerHTML = `
        <div class="plus">+</div>
        <div class="label">Add New</div>
        <div class="subtext">Pin a favorite site</div>
    `;
    button.addEventListener("click", openAddFavoriteModal);
    return button;
}

async function renderFavorites() {
    const container = $("favorites");
    container.innerHTML = "";

    const favorites = await getFavorites();

    const totalSlots = favorites.length + 1;
    const totalPages = Math.max(1, Math.ceil(totalSlots / FAVORITES_PER_PAGE));
    totalFavoritesPages = totalPages;
    if (currentFavoritesPage > totalPages - 1) {
        currentFavoritesPage = totalPages - 1;
    }

    const pageStart = currentFavoritesPage * FAVORITES_PER_PAGE;
    const pageEnd = pageStart + FAVORITES_PER_PAGE;

    for (const [index, fav] of favorites.entries()) {
        if (index < pageStart || index >= pageEnd) {
            continue;
        }

        container.appendChild(
            makeCard(fav, {
                isFavorite: true,
                favoriteIndex: index,
                canRemove: true,
                removeIndex: index,
                renameTarget: {
                    type: "favorite",
                    index,
                    url: fav.url,
                    currentName: fav.name || deriveDisplayName(fav.url)
                }
            })
        );
    }

    const addCardSlot = favorites.length;
    if (addCardSlot >= pageStart && addCardSlot < pageEnd) {
        container.appendChild(makeAddCard());
    }

    renderFavoritesPagination(totalPages);
}

function handleFavoritesWheel(event) {
    if (totalFavoritesPages <= 1) return;
    if (!event.deltaY && !event.deltaX) return;

    const now = Date.now();
    if (now - lastFavoritesWheelAt < WHEEL_PAGE_COOLDOWN) {
        event.preventDefault();
        return;
    }

    const dominantDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!dominantDelta) return;

    const direction = dominantDelta > 0 ? 1 : -1;
    const nextPage = Math.max(
        0,
        Math.min(totalFavoritesPages - 1, currentFavoritesPage + direction)
    );

    if (nextPage === currentFavoritesPage) return;

    currentFavoritesPage = nextPage;
    lastFavoritesWheelAt = now;
    event.preventDefault();
    renderFavorites();
}

function renderFavoritesPagination(totalPages) {
    const container = $("favoritesPagination");
    if (!container) return;

    container.innerHTML = "";

    if (totalPages <= 1) {
        container.style.display = "none";
        return;
    }

    container.style.display = "flex";

    for (let page = 0; page < totalPages; page += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "page-bubble";
        if (page === currentFavoritesPage) {
            button.classList.add("active");
        }
        button.setAttribute("aria-label", `Favorites page ${page + 1}`);
        button.addEventListener("click", () => {
            if (page === currentFavoritesPage) return;
            currentFavoritesPage = page;
            renderFavorites();
        });
        container.appendChild(button);
    }
}

async function renderTopSites() {
    const container = $("topSites");
    container.innerHTML = "";

    try {
        const [sites, customNames, favorites] = await Promise.all([
            chrome.topSites.get(),
            getCustomNames(),
            getFavorites()
        ]);

        const favoriteUrls = new Set(favorites.map((fav) => fav.url));

        if (!sites.length) {
            container.innerHTML = `<div class="empty">No top sites available.</div>`;
            return;
        }

        for (const site of sites.slice(0, 12)) {
            const displayName =
                customNames[site.url] ||
                site.title ||
                deriveDisplayName(site.url);

            const alreadyFavorited = favoriteUrls.has(site.url);

            container.appendChild(
                makeCard(
                    {
                        name: displayName,
                        url: site.url
                    },
                    {
                        isFavorite: false,
                        canFavorite: true,
                        alreadyFavorited,
                        showFavoriteBadge: alreadyFavorited,
                        favoriteTarget: {
                            name: displayName,
                            url: site.url
                        },
                        canRemove: false,
                        renameTarget: {
                            type: "top-site",
                            url: site.url,
                            currentName: displayName
                        }
                    }
                )
            );
        }
    } catch (err) {
        container.innerHTML = `<div class="empty">Could not load top sites.</div>`;
        console.error(err);
    }
}

function openFavoriteModalBase({
    title,
    description,
    saveLabel,
    mode,
    target = null,
    url = "",
    name = "",
    lockUrl = false
}) {
    modalMode = mode;
    editingTarget = target;

    $("favoriteModalTitle").textContent = title;
    $("favoriteModalDescription").textContent = description;
    $("saveFavoriteBtn").textContent = saveLabel;
    $("favoriteError").textContent = "";

    $("favoriteUrl").value = url;
    $("favoriteName").value = name;

    $("favoriteUrl").disabled = lockUrl;
    $("favoriteUrl").required = !lockUrl;
    $("favoriteName").required = false;

    $("favoriteModal").classList.add("open");
    $("favoriteModal").setAttribute("aria-hidden", "false");

    if (lockUrl) {
        $("favoriteName").focus();
        $("favoriteName").select();
    } else {
        $("favoriteUrl").focus();
    }
}

function openAddFavoriteModal() {
    $("favoriteForm").reset();
    openFavoriteModalBase({
        title: "Add Favorite",
        description: "Enter a website URL and, if you want, a custom display name.",
        saveLabel: "Save",
        mode: "add-favorite",
        target: null,
        url: "",
        name: "",
        lockUrl: false
    });
}

function openRenameModal(target) {
    openFavoriteModalBase({
        title: "Rename Site",
        description: "Choose the name you want this site to display on your start page.",
        saveLabel: "Save",
        mode: "rename-site",
        target,
        url: target.url,
        name: target.currentName || "",
        lockUrl: true
    });
}

function closeFavoriteModal() {
    $("favoriteModal").classList.remove("open");
    $("favoriteModal").setAttribute("aria-hidden", "true");
    $("favoriteError").textContent = "";
    $("favoriteUrl").disabled = false;
    editingTarget = null;
}

async function removeFavorite(index) {
    const favorites = await getFavorites();
    favorites.splice(index, 1);
    await saveFavorites(favorites);
    await renderFavorites();
    await renderTopSites();
}

async function handleFavoriteSubmit(event) {
    event.preventDefault();

    const errorEl = $("favoriteError");
    errorEl.textContent = "";

    try {
        if (modalMode === "add-favorite") {
            const rawUrl = $("favoriteUrl").value;
            const rawName = $("favoriteName").value.trim();

            const normalizedUrl = normalizeUrl(rawUrl);
            const derivedName = deriveDisplayName(normalizedUrl);
            const finalName = rawName || derivedName;

            const favorites = await getFavorites();
            favorites.push({
                name: finalName,
                url: normalizedUrl
            });

            await saveFavorites(favorites);
            closeFavoriteModal();
            await renderFavorites();
            return;
        }

        if (modalMode === "rename-site") {
            const rawName = $("favoriteName").value.trim();

            if (!editingTarget) {
                throw new Error("Nothing selected to rename.");
            }

            const finalName = rawName || deriveDisplayName(editingTarget.url);

            if (editingTarget.type === "favorite") {
                const favorites = await getFavorites();
                if (!favorites[editingTarget.index]) {
                    throw new Error("That favorite no longer exists.");
                }

                favorites[editingTarget.index] = {
                    ...favorites[editingTarget.index],
                    name: finalName
                };

                await saveFavorites(favorites);
                closeFavoriteModal();
                await renderFavorites();
                return;
            }

            if (editingTarget.type === "top-site") {
                const customNames = await getCustomNames();
                customNames[editingTarget.url] = finalName;
                await saveCustomNames(customNames);
                closeFavoriteModal();
                await renderTopSites();
                return;
            }
        }

        throw new Error("Unsupported action.");
    } catch (error) {
        errorEl.textContent = error.message || "Could not save changes.";
    }
}

async function moveFavorite(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) return;

    const favorites = await getFavorites();

    if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= favorites.length ||
        toIndex >= favorites.length
    ) {
        return;
    }

    const [moved] = favorites.splice(fromIndex, 1);
    favorites.splice(toIndex, 0, moved);

    await saveFavorites(favorites);
    await renderFavorites();
}

function clearFavoriteDragState() {
    draggedFavoriteIndex = null;
    document.querySelectorAll(".card-wrap.dragging, .card-wrap.drag-over").forEach((el) => {
        el.classList.remove("dragging", "drag-over");
    });
}

async function addSiteToFavorites(target) {
    if (!target?.url) return;

    const favorites = await getFavorites();

    const alreadyExists = favorites.some((fav) => fav.url === target.url);
    if (alreadyExists) {
        return;
    }

    favorites.push({
        name: target.name || deriveDisplayName(target.url),
        url: target.url
    });

    await saveFavorites(favorites);
    await renderFavorites();
    await renderTopSites();
}

function getHostname(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

function getExtensionFaviconUrl(pageUrl, size = 32) {
    const encodedPageUrl = encodeURIComponent(pageUrl);
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodedPageUrl}&size=${size}`;
}

function getFallbackFaviconUrl(pageUrl) {
    try {
        const parsed = new URL(pageUrl);
        return `${parsed.origin}/favicon.ico`;
    } catch {
        return "";
    }
}

function makeCard(item, options = {}) {
    const wrap = document.createElement("div");
    wrap.className = "card-wrap";

    const a = document.createElement("a");
    a.className = "card";
    a.href = item.url;

    if (options.isFavorite) {
        a.draggable = true;
    }

    const hostname = getHostname(item.url);

    a.innerHTML = `
    <div class="card-head">
      <img class="card-favicon" alt="" />
      <div class="title"></div>
    </div>
    <div class="card-body">
      <div class="url"></div>
    </div>
  `;

    a.querySelector(".title").textContent = item.name || item.title || hostname;
    a.querySelector(".url").textContent = item.url;

    const favicon = a.querySelector(".card-favicon");
    const sources = [
        getExtensionFaviconUrl(item.url, 32),
        getFallbackFaviconUrl(item.url)
    ];

    let sourceIndex = 0;

    function tryNextFavicon() {
        if (sourceIndex >= sources.length) {
            favicon.style.display = "none";
            return;
        }

        favicon.src = sources[sourceIndex++];
    }

    favicon.addEventListener("error", tryNextFavicon);
    tryNextFavicon();

    if (options.showFavoriteBadge) {
        const badge = document.createElement("div");
        badge.className = "favorite-badge";
        badge.textContent = "Favorited";
        wrap.appendChild(badge);
    }

    if (options.isFavorite) {
        a.addEventListener("dragstart", (event) => {
            draggedFavoriteIndex = options.favoriteIndex;
            wrap.classList.add("dragging");
            closeOpenMenu();

            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(options.favoriteIndex));
            }
        });

        a.addEventListener("dragend", () => {
            clearFavoriteDragState();
        });

        wrap.addEventListener("dragover", (event) => {
            if (draggedFavoriteIndex == null || draggedFavoriteIndex === options.favoriteIndex) {
                return;
            }

            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
            }
            wrap.classList.add("drag-over");
        });

        wrap.addEventListener("dragleave", (event) => {
            if (!wrap.contains(event.relatedTarget)) {
                wrap.classList.remove("drag-over");
            }
        });

        wrap.addEventListener("drop", async (event) => {
            event.preventDefault();
            wrap.classList.remove("drag-over");

            const fromIndex = draggedFavoriteIndex;
            const toIndex = options.favoriteIndex;

            clearFavoriteDragState();
            await moveFavorite(fromIndex, toIndex);
        });
    }

    const trigger = document.createElement("button");
    trigger.className = "card-menu-trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-label", "Open site menu");

    const menu = document.createElement("div");
    menu.className = "card-menu";

    if (options.canFavorite) {
        const favoriteBtn = document.createElement("button");
        favoriteBtn.type = "button";

        if (options.alreadyFavorited) {
            favoriteBtn.textContent = "Already in Favorites";
            favoriteBtn.disabled = true;
            favoriteBtn.style.opacity = "0.6";
            favoriteBtn.style.cursor = "default";
        } else {
            favoriteBtn.textContent = "Add to Favorites";
            favoriteBtn.addEventListener("click", async (event) => {
                event.stopPropagation();
                event.preventDefault();
                closeOpenMenu();
                await addSiteToFavorites(options.favoriteTarget);
            });
        }

        menu.appendChild(favoriteBtn);
    }

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        event.preventDefault();
        closeOpenMenu();
        openRenameModal(options.renameTarget);
    });
    menu.appendChild(renameBtn);

    if (options.canRemove) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "danger";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            event.preventDefault();
            closeOpenMenu();
            await removeFavorite(options.removeIndex);
        });
        menu.appendChild(removeBtn);
    }

    trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMenu(menu, trigger);
    });

    wrap.appendChild(a);
    wrap.appendChild(trigger);
    wrap.appendChild(menu);

    return wrap;
}

$("favoriteForm").addEventListener("submit", handleFavoriteSubmit);
$("cancelFavoriteBtn").addEventListener("click", closeFavoriteModal);

$("favoriteModal").addEventListener("click", (event) => {
    if (event.target === $("favoriteModal")) {
        closeFavoriteModal();
    }
});

document.addEventListener("click", (event) => {
    if (!openMenu) return;

    const clickedInsideMenu = openMenu.menu.contains(event.target);
    const clickedTrigger = openMenu.trigger.contains(event.target);

    if (!clickedInsideMenu && !clickedTrigger) {
        closeOpenMenu();
    }
});


document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if ($("favoriteModal").classList.contains("open")) {
            closeFavoriteModal();
            return;
        }

        if ($("nameModal").classList.contains("open")) {
            closeNameModal();
            return;
        }

        if ($("weatherOverrideModal").classList.contains("open")) {
            closeWeatherOverrideModal();
            return;
        }

        if ($("customizeModal").classList.contains("open")) {
            closeCustomizeModal();
            return;
        }

        closeOpenMenu();
    }
});

$("favoriteUrl").addEventListener("blur", () => {
    if (modalMode !== "add-favorite") return;

    const urlValue = $("favoriteUrl").value.trim();
    const nameInput = $("favoriteName");

    if (!urlValue || nameInput.value.trim()) return;

    try {
        const normalizedUrl = normalizeUrl(urlValue);
        nameInput.value = deriveDisplayName(normalizedUrl);
    } catch {
        // Ignore invalid URL while typing
    }
});

const commandForm = $("commandForm");
if (commandForm) {
    commandForm.addEventListener("submit", handleCommandSubmit);
}

const commandInput = $("commandInput");
if (commandInput) {
    commandInput.addEventListener("input", async () => {
        const favorites = await getFavorites();
        updateCommandGhost(commandInput.value, favorites);
    });

    commandInput.addEventListener("focus", async () => {
        const favorites = await getFavorites();
        updateCommandGhost(commandInput.value, favorites);
    });

    commandInput.addEventListener("blur", () => {
        const ghost = $("commandGhost");
        if (ghost) {
            ghost.textContent = "";
        }
    });

    commandInput.addEventListener("keydown", async (event) => {
        if (event.key !== "Tab" && event.key !== "ArrowRight") return;

        const value = commandInput.value;
        const atEnd = commandInput.selectionStart === value.length;
        if (!atEnd || commandInput.selectionStart !== commandInput.selectionEnd) return;

        const favorites = await getFavorites();
        const suggestion = getAutocompleteSuggestion(value, favorites);
        if (!suggestion) return;

        event.preventDefault();
        commandInput.value = suggestion;
        commandInput.setSelectionRange(suggestion.length, suggestion.length);
        updateCommandGhost(suggestion, favorites);
    });
}

const commandHint = $("commandHint");
if (commandHint) {
    commandHint.textContent = getCommandHintText();
}

const weatherMenuTrigger = $("weatherMenuTrigger");
const weatherMenu = $("weatherMenu");
if (weatherMenuTrigger && weatherMenu) {
    weatherMenuTrigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMenu(weatherMenu, weatherMenuTrigger);
    });
}

const weatherOverrideBtn = $("weatherOverrideBtn");
if (weatherOverrideBtn) {
    weatherOverrideBtn.addEventListener("click", openWeatherOverrideModal);
}

const weatherDeviceBtn = $("weatherDeviceBtn");
if (weatherDeviceBtn) {
    weatherDeviceBtn.addEventListener("click", async () => {
        closeOpenMenu();
        await handleUseDeviceLocation();
    });
}

const weatherOverrideForm = $("weatherOverrideForm");
if (weatherOverrideForm) {
    weatherOverrideForm.addEventListener("submit", handleWeatherOverrideSubmit);
}

const cancelWeatherOverrideBtn = $("cancelWeatherOverrideBtn");
if (cancelWeatherOverrideBtn) {
    cancelWeatherOverrideBtn.addEventListener("click", closeWeatherOverrideModal);
}

const weatherOverrideModal = $("weatherOverrideModal");
if (weatherOverrideModal) {
    weatherOverrideModal.addEventListener("click", (event) => {
        if (event.target === weatherOverrideModal) {
            closeWeatherOverrideModal();
        }
    });
}

const nameMenuTrigger = $("nameMenuTrigger");
const nameMenu = $("nameMenu");
if (nameMenuTrigger && nameMenu) {
    nameMenuTrigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMenu(nameMenu, nameMenuTrigger);
    });
}

const openNameModalBtn = $("openNameModalBtn");
if (openNameModalBtn) {
    openNameModalBtn.addEventListener("click", () => {
        closeOpenMenu();
        openNameModal();
    });
}

const openCustomizeModalBtn = $("openCustomizeModalBtn");
if (openCustomizeModalBtn) {
    openCustomizeModalBtn.addEventListener("click", openCustomizeModal);
}

const nameModalForm = $("nameModalForm");
if (nameModalForm) {
    nameModalForm.addEventListener("submit", handleNameModalSubmit);
}

const cancelNameModalBtn = $("cancelNameModalBtn");
if (cancelNameModalBtn) {
    cancelNameModalBtn.addEventListener("click", closeNameModal);
}

const nameModal = $("nameModal");
if (nameModal) {
    nameModal.addEventListener("click", (event) => {
        if (event.target === nameModal) {
            closeNameModal();
        }
    });
}

const customizeForm = $("customizeForm");
if (customizeForm) {
    customizeForm.addEventListener("submit", handleCustomizeSubmit);
}

const cancelCustomizeBtn = $("cancelCustomizeBtn");
if (cancelCustomizeBtn) {
    cancelCustomizeBtn.addEventListener("click", closeCustomizeModal);
}

const clearBackgroundBtn = $("clearBackgroundBtn");
if (clearBackgroundBtn) {
    clearBackgroundBtn.addEventListener("click", () => {
        const backgroundInput = $("backgroundUrl");
        if (backgroundInput) {
            backgroundInput.value = "";
        }
        updateThemePreviewFromForm();
    });
}

const customizeModal = $("customizeModal");
if (customizeModal) {
    customizeModal.addEventListener("click", (event) => {
        if (event.target === customizeModal) {
            closeCustomizeModal();
        }
    });
}

document.querySelectorAll("input[name=\"themePreset\"]").forEach((input) => {
    input.addEventListener("change", () => {
        updateCustomFieldsVisibility(input.value);
        updateThemePreviewFromForm();
    });
});

["colorBg", "colorPanel", "colorPanel2", "colorText", "colorMuted", "colorAccent", "colorBorder"].forEach(
    (id) => {
        const input = $(id);
        if (input) {
            input.addEventListener("input", updateThemePreviewFromForm);
        }
    }
);

const backgroundUrlInput = $("backgroundUrl");
if (backgroundUrlInput) {
    backgroundUrlInput.addEventListener("input", updateThemePreviewFromForm);
}

const favoritesContainer = $("favorites");
if (favoritesContainer) {
    favoritesContainer.addEventListener("wheel", handleFavoritesWheel, {
        passive: false
    });
}

loadDisplayName();
loadThemeSettings();
scheduleGreetingRefresh();
loadWeather();
renderFavorites();
renderTopSites();
