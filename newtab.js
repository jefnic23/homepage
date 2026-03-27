const FAVORITES_KEY = "favorites";
const CUSTOM_NAMES_KEY = "customNames";
const FAVORITES_PER_PAGE = 8;
const WEATHER_CACHE_KEY = "weatherCache";
const WEATHER_OVERRIDE_KEY = "weatherOverride";
const WEATHER_CACHE_TTL = 15 * 60 * 1000;
const DISPLAY_NAME_KEY = "displayName";
const NAME_PROMPT_DISMISSED_KEY = "namePromptDismissed";

let modalMode = "add-favorite";
let editingTarget = null;
let openMenu = null;
let draggedFavoriteIndex = null;
let currentFavoritesPage = 0;
let displayName = "";
let namePromptDismissed = false;

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
    const result = await chrome.storage.local.get([
        DISPLAY_NAME_KEY,
        NAME_PROMPT_DISMISSED_KEY
    ]);
    displayName = (result[DISPLAY_NAME_KEY] || "").trim();
    namePromptDismissed = Boolean(result[NAME_PROMPT_DISMISSED_KEY]);
    updateGreeting();
    updateNameUi();
}

async function saveDisplayName(name) {
    displayName = name.trim();
    await chrome.storage.local.set({ [DISPLAY_NAME_KEY]: displayName });
}

async function saveNamePromptDismissed(value) {
    namePromptDismissed = value;
    await chrome.storage.local.set({ [NAME_PROMPT_DISMISSED_KEY]: value });
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

function showNamePrompt({ focus = true } = {}) {
    const prompt = $("namePrompt");
    const input = $("nameInput");
    const error = $("nameError");
    if (prompt) {
        prompt.classList.remove("hidden");
    }
    if (error) {
        error.textContent = "";
    }
    if (input) {
        input.value = displayName || "";
        if (focus) {
            input.focus();
            input.select();
        }
    }
}

function hideNamePrompt() {
    const prompt = $("namePrompt");
    const error = $("nameError");
    if (prompt) {
        prompt.classList.add("hidden");
    }
    if (error) {
        error.textContent = "";
    }
}

function updateNameUi() {
    const editBtn = $("editNameBtn");
    const heroCard = $("heroCard");
    if (displayName) {
        if (editBtn) {
            editBtn.classList.remove("is-hidden");
        }
        hideNamePrompt();
        if (heroCard) {
            heroCard.classList.remove("name-mode");
        }
    } else {
        if (namePromptDismissed) {
            if (editBtn) {
                editBtn.classList.remove("is-hidden");
            }
            hideNamePrompt();
            if (heroCard) {
                heroCard.classList.remove("name-mode");
            }
        } else {
            if (editBtn) {
                editBtn.classList.add("is-hidden");
            }
            showNamePrompt({ focus: true });
            if (heroCard) {
                heroCard.classList.add("name-mode");
            }
        }
    }
}

async function handleSaveName() {
    const input = $("nameInput");
    const error = $("nameError");
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
    await saveNamePromptDismissed(false);
    updateGreeting();
    updateNameUi();
}

async function handleDismissNamePrompt() {
    await saveNamePromptDismissed(true);
    updateGreeting();
    updateNameUi();
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

    const overrideInput = $("weatherOverrideInput");
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

async function handleWeatherOverride() {
    const input = $("weatherOverrideInput");
    const name = input ? input.value.trim() : "";

    if (!name) {
        setWeatherError("Enter a city to override location.");
        return;
    }

    try {
        setWeatherError("");
        const result = await geocodeLocation(name);
        const locationLabel = [result.name, result.region, result.country]
            .filter(Boolean)
            .join(", ");

        await saveWeatherOverride({
            name: locationLabel,
            latitude: result.latitude,
            longitude: result.longitude
        });

        if (input) {
            input.value = locationLabel;
        }

        await loadWeather();
    } catch (error) {
        setWeatherError(error.message || "Could not set override location.");
    }
}

async function handleUseDeviceLocation() {
    await clearWeatherOverride();
    await loadWeather({ forceDevice: true });
}

function handleSearchSubmit(event) {
    event.preventDefault();
    const input = $("searchInput");
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;
    const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}`;
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

const searchForm = $("searchForm");
if (searchForm) {
    searchForm.addEventListener("submit", handleSearchSubmit);
}

const setWeatherOverrideBtn = $("setWeatherOverride");
if (setWeatherOverrideBtn) {
    setWeatherOverrideBtn.addEventListener("click", handleWeatherOverride);
}

const useDeviceLocationBtn = $("useDeviceLocation");
if (useDeviceLocationBtn) {
    useDeviceLocationBtn.addEventListener("click", handleUseDeviceLocation);
}

const weatherOverrideInput = $("weatherOverrideInput");
if (weatherOverrideInput) {
    weatherOverrideInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleWeatherOverride();
        }
    });
}

const editNameBtn = $("editNameBtn");
if (editNameBtn) {
    editNameBtn.addEventListener("click", async () => {
        await saveNamePromptDismissed(false);
        updateNameUi();
    });
}

const saveNameBtn = $("saveNameBtn");
if (saveNameBtn) {
    saveNameBtn.addEventListener("click", handleSaveName);
}

const dismissNameBtn = $("dismissNameBtn");
if (dismissNameBtn) {
    dismissNameBtn.addEventListener("click", handleDismissNamePrompt);
}

const nameInput = $("nameInput");
if (nameInput) {
    nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleSaveName();
        }
    });
}

loadDisplayName();
scheduleGreetingRefresh();
loadWeather();
renderFavorites();
renderTopSites();
